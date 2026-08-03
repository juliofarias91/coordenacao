"""Definição de senha por link, e o corte de sessão que ela dispara.

O QUE ISTO PASSOU A EXISTIR. Antes da migration 0010 não havia caminho nenhum
para "esqueci minha senha": o único jeito era um admin DIGITAR uma senha nova no
formulário de usuários e passá-la por fora. O admin ficava sabendo a senha da
pessoa, ela viajava por mensagem, e não existia primeiro acesso.

E o que a redefinição não resolvia sozinha: sem `usuario.sessoes_validas_apos`,
quem tivesse tomado a conta continuava com um refresh token válido por 14 dias
DEPOIS de o dono trocar a senha.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import create_token, hash_password
from app.models import Notificacao, TokenAcesso, Usuario
from app.models.enums import PERMISSOES, PapelUsuario
from app.services import acesso
from tests.conftest import API, Cenario, requer_banco

pytestmark = requer_banco

SENHA_NOVA = "uma-senha-novinha-longa"


def _usuario(cenario: Cenario, db: Session, *, com_senha: bool) -> Usuario:
    """Alguém além do admin do cenário, com ou sem senha já definida.

    `com_senha=False` é a conta que nunca entrou — a que `gerar_convite`
    classifica como CONVITE em vez de redefinição.
    """
    u = Usuario(
        org_id=cenario.org.id,
        login=f"pessoa-{uuid.uuid4().hex[:8]}@spbim.com.br",
        nome="Pessoa de Teste",
        senha_hash=hash_password("a-senha-antiga-longa") if com_senha else None,
        papel=PapelUsuario.AUDITOR,
        permissoes=list(PERMISSOES),
    )
    db.add(u)
    db.commit()
    return u


# ======================================================= gerar o link
def test_convite_para_quem_nunca_teve_senha(
    autenticado: TestClient, cenario: Cenario, db: Session
) -> None:
    """Sem `senha_hash`, o link é CONVITE — e dura uma semana.

    O tipo sai de quem a conta é, não de um parâmetro: onboarding espera a
    pessoa achar tempo de entrar, redefinição responde a um pedido de agora.
    """
    u = _usuario(cenario, db, com_senha=False)
    r = autenticado.post(f"{API}/usuarios/{u.id}/convite")
    assert r.status_code == 201, r.text

    corpo = r.json()
    assert corpo["tipo"] == "convite"
    assert corpo["caminho"] == f"/definir-senha/{corpo['token']}"
    prazo = datetime.fromisoformat(corpo["expira_em"]) - datetime.now(UTC)
    assert timedelta(days=6) < prazo <= timedelta(days=7)


def test_redefinicao_para_quem_ja_tinha_senha(
    autenticado: TestClient, cenario: Cenario, db: Session
) -> None:
    u = _usuario(cenario, db, com_senha=True)
    corpo = autenticado.post(f"{API}/usuarios/{u.id}/convite").json()
    assert corpo["tipo"] == "redefinicao"
    prazo = datetime.fromisoformat(corpo["expira_em"]) - datetime.now(UTC)
    assert timedelta(minutes=90) < prazo <= timedelta(hours=2)


def test_o_token_nao_fica_no_banco(
    autenticado: TestClient, cenario: Cenario, db: Session
) -> None:
    """Só o SHA-256 dele.

    É a diferença deliberada em relação a `ConviteCliente.token`, que fica em
    claro: aquele é credencial de leitura que a tela relista para copiar de
    novo; este troca-se por uma senha. Um dump com estes em claro seria tomada
    de conta em toda solicitação pendente.
    """
    u = _usuario(cenario, db, com_senha=True)
    token = autenticado.post(f"{API}/usuarios/{u.id}/convite").json()["token"]

    linha = db.execute(
        select(TokenAcesso).where(TokenAcesso.usuario_id == u.id)
    ).scalar_one()
    assert linha.token_hash != token
    assert token not in linha.token_hash
    assert len(linha.token_hash) == 64  # hexdigest do SHA-256


def test_gerar_link_exige_admin_cadastro(client: TestClient, cenario: Cenario, db: Session) -> None:
    u = _usuario(cenario, db, com_senha=True)
    r = client.post(
        f"{API}/usuarios/{u.id}/convite",
        headers=cenario.headers(papel=PapelUsuario.AUDITOR, permissoes=["ver_painel"]),
    )
    assert r.status_code == 403, r.text


# ================================================= conferir e redefinir
def test_conferir_diz_de_quem_e_a_conta_sem_consumir(
    autenticado: TestClient, client: TestClient, cenario: Cenario, db: Session
) -> None:
    """A tela pública precisa se apresentar antes de pedir a senha.

    E o GET não pode queimar o token: descobrir que o link expirou depois de
    digitar a senha duas vezes é o pior momento para descobrir.
    """
    u = _usuario(cenario, db, com_senha=True)
    token = autenticado.post(f"{API}/usuarios/{u.id}/convite").json()["token"]

    for _ in range(2):  # duas vezes: conferir não consome
        r = client.get(f"{API}/auth/senha/{token}")
        assert r.status_code == 200, r.text
        corpo = r.json()
        assert corpo["login"] == u.login
        assert corpo["nome"] == "Pessoa de Teste"
        assert corpo["organizacao"] == cenario.org.nome
        assert corpo["senha_minima"] == 10


def test_redefinir_troca_a_senha_e_queima_o_token(
    autenticado: TestClient, client: TestClient, cenario: Cenario, db: Session
) -> None:
    u = _usuario(cenario, db, com_senha=True)
    token = autenticado.post(f"{API}/usuarios/{u.id}/convite").json()["token"]

    r = client.post(f"{API}/auth/senha/redefinir", json={"token": token, "senha": SENHA_NOVA})
    assert r.status_code == 204, r.text

    # A senha nova entra…
    entrada = client.post(f"{API}/auth/login", json={"login": u.login, "senha": SENHA_NOVA})
    assert entrada.status_code == 200, entrada.text
    # …e a antiga não.
    velha = client.post(
        f"{API}/auth/login", json={"login": u.login, "senha": "a-senha-antiga-longa"}
    )
    assert velha.status_code == 401

    # Uso único: o mesmo link não serve de novo.
    de_novo = client.post(
        f"{API}/auth/senha/redefinir", json={"token": token, "senha": "outra-senha-longa-1"}
    )
    assert de_novo.status_code == 404, de_novo.text


def test_token_expirado_nao_redefine(
    autenticado: TestClient, client: TestClient, cenario: Cenario, db: Session
) -> None:
    u = _usuario(cenario, db, com_senha=True)
    token = autenticado.post(f"{API}/usuarios/{u.id}/convite").json()["token"]

    linha = db.execute(select(TokenAcesso).where(TokenAcesso.usuario_id == u.id)).scalar_one()
    linha.expira_em = datetime.now(UTC) - timedelta(seconds=1)
    db.commit()

    assert client.get(f"{API}/auth/senha/{token}").status_code == 404
    r = client.post(f"{API}/auth/senha/redefinir", json={"token": token, "senha": SENHA_NOVA})
    assert r.status_code == 404, r.text


def test_token_inexistente_e_token_de_usuario_inativo_dao_404(
    autenticado: TestClient, client: TestClient, cenario: Cenario, db: Session
) -> None:
    """Um 404 para os três casos: não existe, expirou, já usado.

    Distinguir diria a um atacante se ele acertou o valor, e não ajuda quem tem
    o link certo — para essa pessoa a saída é a mesma, pedir outro.
    """
    assert client.get(f"{API}/auth/senha/nao-existe-este-token").status_code == 404

    u = _usuario(cenario, db, com_senha=True)
    token = autenticado.post(f"{API}/usuarios/{u.id}/convite").json()["token"]
    # Desativado DEPOIS de convidado: o link para de valer. Deixar passar daria
    # senha nova a uma conta que alguém decidiu desligar.
    u.status = "inativo"
    db.commit()
    assert client.get(f"{API}/auth/senha/{token}").status_code == 404


def test_senha_curta_nao_passa_pela_rota_publica(
    autenticado: TestClient, client: TestClient, cenario: Cenario, db: Session
) -> None:
    u = _usuario(cenario, db, com_senha=True)
    token = autenticado.post(f"{API}/usuarios/{u.id}/convite").json()["token"]
    r = client.post(f"{API}/auth/senha/redefinir", json={"token": token, "senha": "curta"})
    assert r.status_code == 422, r.text


# ==================================================== corte de sessão
def test_redefinir_derruba_as_sessoes_antigas(
    autenticado: TestClient, client: TestClient, cenario: Cenario, db: Session
) -> None:
    """O passo que costuma faltar.

    Sem ele, quem tomou a conta continua renovando a sessão pelos 14 dias do
    refresh token DEPOIS de o dono redefinir a senha — e a redefinição não teria
    resolvido nada.
    """
    u = _usuario(cenario, db, com_senha=True)
    sessao = client.post(
        f"{API}/auth/login", json={"login": u.login, "senha": "a-senha-antiga-longa"}
    ).json()
    refresh = sessao["tokens"]["refresh_token"]

    # Antes: o refresh funciona.
    assert client.post(f"{API}/auth/refresh", json={"refresh_token": refresh}).status_code == 200

    token = autenticado.post(f"{API}/usuarios/{u.id}/convite").json()["token"]
    client.post(f"{API}/auth/senha/redefinir", json={"token": token, "senha": SENHA_NOVA})

    # Depois: não funciona mais.
    r = client.post(f"{API}/auth/refresh", json={"refresh_token": refresh})
    assert r.status_code == 401, r.text
    assert "sessão" in r.json()["detail"]


def test_sair_encerra_a_sessao_no_servidor(
    client: TestClient, cenario: Cenario, db: Session
) -> None:
    """"Sair" era `localStorage.removeItem` e nada mais."""
    u = _usuario(cenario, db, com_senha=True)
    sessao = client.post(
        f"{API}/auth/login", json={"login": u.login, "senha": "a-senha-antiga-longa"}
    ).json()
    refresh = sessao["tokens"]["refresh_token"]
    acesso_tk = sessao["tokens"]["access_token"]

    r = client.post(f"{API}/auth/sair", headers={"Authorization": f"Bearer {acesso_tk}"})
    assert r.status_code == 204, r.text

    assert client.post(f"{API}/auth/refresh", json={"refresh_token": refresh}).status_code == 401


def test_admin_trocando_a_senha_de_outro_corta_a_sessao_dele(
    autenticado: TestClient, client: TestClient, cenario: Cenario, db: Session
) -> None:
    """Se a razão da troca foi conta comprometida, a sessão anterior tem de cair."""
    u = _usuario(cenario, db, com_senha=True)
    refresh = client.post(
        f"{API}/auth/login", json={"login": u.login, "senha": "a-senha-antiga-longa"}
    ).json()["tokens"]["refresh_token"]

    r = autenticado.put(f"{API}/usuarios/{u.id}/senha", json={"senha": SENHA_NOVA})
    assert r.status_code == 204, r.text
    assert client.post(f"{API}/auth/refresh", json={"refresh_token": refresh}).status_code == 401


def test_trocar_a_propria_senha_mantem_a_sessao(
    client: TestClient, cenario: Cenario, db: Session
) -> None:
    """O contrário do de cima, e de propósito.

    A tela de Configurações diz "a sessão atual continua válida depois da
    troca", e derrubar quem acabou de trocar a própria senha o obrigaria a
    entrar de novo sem motivo — não há suspeita de terceiro aqui.
    """
    u = _usuario(cenario, db, com_senha=True)
    sessao = client.post(
        f"{API}/auth/login", json={"login": u.login, "senha": "a-senha-antiga-longa"}
    ).json()
    proprio = {"Authorization": f"Bearer {sessao['tokens']['access_token']}"}

    r = client.put(f"{API}/usuarios/{u.id}/senha", json={"senha": SENHA_NOVA}, headers=proprio)
    assert r.status_code == 204, r.text
    assert (
        client.post(
            f"{API}/auth/refresh", json={"refresh_token": sessao["tokens"]["refresh_token"]}
        ).status_code
        == 200
    )


def test_corte_nao_alcanca_token_emitido_depois(
    client: TestClient, cenario: Cenario, db: Session
) -> None:
    """O corte compara com `iat`: quem entrou DEPOIS dele não é afetado."""
    u = _usuario(cenario, db, com_senha=True)
    u.sessoes_validas_apos = datetime.now(UTC) - timedelta(minutes=5)
    db.commit()

    novo = create_token(
        usuario_id=u.id,
        org_id=cenario.org.id,
        papel=u.papel.value,
        permissoes=["ver_painel"],
        token_type="refresh",
    )
    assert client.post(f"{API}/auth/refresh", json={"refresh_token": novo}).status_code == 200


# ============================================ esqueci minha senha
def test_esqueci_avisa_o_admin_e_cria_o_token(
    client: TestClient, cenario: Cenario, db: Session
) -> None:
    """Sem SMTP, a notificação É a entrega: o admin vê no sino e gera o link."""
    u = _usuario(cenario, db, com_senha=True)

    r = client.post(f"{API}/auth/senha/esqueci", json={"login": u.login})
    assert r.status_code == 202, r.text

    assert db.execute(
        select(TokenAcesso).where(
            TokenAcesso.usuario_id == u.id, TokenAcesso.tipo == acesso.REDEFINICAO
        )
    ).scalars().all()

    avisos = db.execute(
        select(Notificacao).where(
            Notificacao.org_id == cenario.org.id, Notificacao.tipo == "acesso"
        )
    ).scalars().all()
    assert len(avisos) == 1
    assert avisos[0].papel_alvo == "admin"
    assert u.login in (avisos[0].origem or "")


def test_esqueci_nao_revela_se_a_conta_existe(client: TestClient) -> None:
    """202 para e-mail inexistente também.

    Confirmar a existência transformaria uma rota pública e sem autenticação em
    lista de usuários da plataforma.
    """
    r = client.post(
        f"{API}/auth/senha/esqueci",
        json={"login": f"ninguem-{uuid.uuid4().hex[:8]}@spbim.com.br"},
    )
    assert r.status_code == 202, r.text


def test_pedidos_repetidos_nao_enchem_a_tabela(
    client: TestClient, cenario: Cenario, db: Session
) -> None:
    """A rota é pública: sem janela, um laço encheria o banco e o sino do admin."""
    u = _usuario(cenario, db, com_senha=True)
    for _ in range(4):
        assert client.post(f"{API}/auth/senha/esqueci", json={"login": u.login}).status_code == 202

    tokens = db.execute(
        select(TokenAcesso).where(TokenAcesso.usuario_id == u.id)
    ).scalars().all()
    assert len(tokens) == 1, "quatro pedidos seguidos criaram mais de um token"


# ============================================ o rastro dos dois atos
def test_reset_por_link_fica_na_trilha_como_trocou_senha(
    autenticado: TestClient, client: TestClient, cenario: Cenario, db: Session
) -> None:
    """O caso que mais importa registrar, e o que quase escapou.

    `acesso.usar` grava `senha_hash` E `sessoes_validas_apos` no mesmo UPDATE.
    Com a regra ingênua ("senha_hash é o único campo mudado"), o diff tinha dois
    campos e a ação caía em `alterou` — exatamente nos dois caminhos que a
    migration 0010 criou. Ver `ATOS`, em `db/trilha.py`.
    """
    u = _usuario(cenario, db, com_senha=True)
    token = autenticado.post(f"{API}/usuarios/{u.id}/convite").json()["token"]
    client.post(f"{API}/auth/senha/redefinir", json={"token": token, "senha": SENHA_NOVA})

    linhas = autenticado.get(
        f"{API}/trilha",
        params={"entidade": "usuario", "entidade_id": str(u.id), "acao": "trocou_senha"},
    ).json()["itens"]

    assert len(linhas) == 1, "redefinir por link tem de aparecer como trocou_senha"
    assert linhas[0]["diff"] is None
    # O autor é a PESSOA, não "automático": a rota é pública, mas quem
    # apresentou o link foi ela.
    assert linhas[0]["usuario_id"] == str(u.id)


def test_sair_fica_na_trilha_como_encerrou_sessoes(
    autenticado: TestClient, client: TestClient, cenario: Cenario, db: Session
) -> None:
    u = _usuario(cenario, db, com_senha=True)
    sessao = client.post(
        f"{API}/auth/login", json={"login": u.login, "senha": "a-senha-antiga-longa"}
    ).json()
    client.post(
        f"{API}/auth/sair",
        headers={"Authorization": f"Bearer {sessao['tokens']['access_token']}"},
    )

    linhas = autenticado.get(
        f"{API}/trilha",
        params={"entidade": "usuario", "entidade_id": str(u.id), "acao": "encerrou_sessoes"},
    ).json()["itens"]
    assert len(linhas) == 1
    assert linhas[0]["usuario_id"] == str(u.id)


def test_o_hash_do_token_nao_vaza_para_a_trilha(
    autenticado: TestClient, cenario: Cenario, db: Session
) -> None:
    """`token_hash` entrou em `CAMPOS_SENSIVEIS` por isto.

    Sem ele, criar um convite copiava o hash para o `diff` da trilha — material
    de credencial espalhado por uma segunda tabela sem nenhum motivo.
    """
    u = _usuario(cenario, db, com_senha=True)
    autenticado.post(f"{API}/usuarios/{u.id}/convite")

    linhas = autenticado.get(f"{API}/trilha", params={"entidade": "token_acesso"}).json()["itens"]
    assert linhas, "criar um token de acesso tem de estar na trilha"
    for linha in linhas:
        assert "token_hash" not in str(linha["diff"])


def test_usar_queima_os_outros_tokens_pendentes(
    autenticado: TestClient, client: TestClient, cenario: Cenario, db: Session
) -> None:
    """Dois links gerados, um usado: o outro não pode continuar aberto."""
    u = _usuario(cenario, db, com_senha=True)
    primeiro = autenticado.post(f"{API}/usuarios/{u.id}/convite").json()["token"]
    segundo = autenticado.post(f"{API}/usuarios/{u.id}/convite").json()["token"]

    r = client.post(f"{API}/auth/senha/redefinir", json={"token": segundo, "senha": SENHA_NOVA})
    assert r.status_code == 204, r.text
    assert client.get(f"{API}/auth/senha/{primeiro}").status_code == 404
