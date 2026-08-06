"""Criar a própria conta — `POST /auth/cadastro` (05/08/2026).

O recurso REVERTE uma decisão registrada ("o acesso é só por convite do admin"),
e cada teste aqui tranca uma das amarras que a reversão manteve. Elas não são
detalhe de implementação: sem qualquer uma delas, conhecer o slug de uma
organização — que aparece no endereço do convite — passa a valer uma conta
dentro do tenant dela.
"""

from __future__ import annotations

import uuid

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Organizacao, Usuario
from app.models.enums import PERMISSOES_POR_PAPEL, PapelUsuario
from tests.conftest import API, Cenario, requer_banco

SENHA = "uma-senha-boa-1!"


def _abrir(db: Session, org: Organizacao) -> None:
    org.cadastro_aberto = True
    db.add(org)
    db.commit()


def _corpo(org: Organizacao, **extra: object) -> dict[str, object]:
    return {
        "login": f"novo-{uuid.uuid4().hex[:8]}@spbim.com.br",
        "nome": "Pessoa Nova",
        "senha": SENHA,
        "org": org.slug,
        **extra,
    }


# ============================================ o interruptor da organização
@requer_banco
def test_organizacao_fechada_recusa_mesmo_com_o_slug_certo(
    client: TestClient, cenario: Cenario
) -> None:
    """A AMARRA CENTRAL, e a razão de a migration 0016 existir.

    O slug não é segredo — a própria tela de login o pede quando o mesmo e-mail
    está em dois tenants, e ele viaja no endereço do convite. Se bastasse
    acertá-lo, todo tenant da plataforma teria cadastro aberto sem ninguém ter
    escolhido isso. `cadastro_aberto` nasce FALSE justamente para que ligar seja
    uma decisão de quem administra.
    """
    r = client.post(f"{API}/auth/cadastro", json=_corpo(cenario.org))
    assert r.status_code == 404, r.text


@requer_banco
def test_slug_inexistente_e_organizacao_fechada_respondem_IGUAL(
    client: TestClient, cenario: Cenario
) -> None:
    """Mesma resposta para "não existe" e "não aceita" — de propósito.

    Respostas diferentes transformariam o formulário público num verificador de
    tenants: quem quisesse saber que empresas usam a plataforma digitaria nomes
    prováveis e leria a diferença. É a mesma razão de `POST /auth/senha/esqueci`
    responder 202 exista a conta ou não.
    """
    fechada = client.post(f"{API}/auth/cadastro", json=_corpo(cenario.org))
    inexistente = client.post(
        f"{API}/auth/cadastro",
        json={**_corpo(cenario.org), "org": f"nao-existe-{uuid.uuid4().hex[:8]}"},
    )

    assert fechada.status_code == inexistente.status_code == 404
    assert fechada.json()["detail"] == inexistente.json()["detail"]


# ==================================================== o caminho que funciona
@requer_banco
def test_cadastro_cria_a_conta_e_ja_entra(
    client: TestClient, db: Session, cenario: Cenario
) -> None:
    _abrir(db, cenario.org)
    corpo = _corpo(cenario.org)

    r = client.post(f"{API}/auth/cadastro", json=corpo)
    assert r.status_code == 201, r.text

    sessao = r.json()
    # Devolve SESSÃO, não só 201: sem SMTP não há confirmação de e-mail para
    # justificar mandar a pessoa digitar de novo a senha que acabou de escolher.
    assert sessao["tokens"]["access_token"]
    assert sessao["usuario"]["org_id"] == str(cenario.org.id)
    assert sessao["usuario"]["login"] == corpo["login"]

    entrou = client.post(
        f"{API}/auth/login", json={"login": corpo["login"], "senha": SENHA}
    )
    assert entrou.status_code == 200, entrou.text


@requer_banco
def test_a_conta_nasce_no_papel_MENOS_privilegiado(
    client: TestClient, db: Session, cenario: Cenario
) -> None:
    """Ninguém se autoconcede permissão.

    Nascer coordenador daria a um estranho de posse do slug o poder de publicar
    round — que é o ato que congela o resultado para o fornecedor. `LEITOR` vê o
    que a organização já publicaria, e quem administra promove depois.
    """
    _abrir(db, cenario.org)
    r = client.post(f"{API}/auth/cadastro", json=_corpo(cenario.org))
    assert r.status_code == 201, r.text

    usuario = r.json()["usuario"]
    assert usuario["papel"] == PapelUsuario.LEITOR.value
    assert set(usuario["permissoes"]) == set(PERMISSOES_POR_PAPEL[PapelUsuario.LEITOR])
    assert "admin_cadastro" not in usuario["permissoes"]
    assert "publicar" not in usuario["permissoes"]


@requer_banco
def test_o_login_e_gravado_em_minusculas(
    client: TestClient, db: Session, cenario: Cenario
) -> None:
    """`_candidatos`, no login, procura por `login.strip().lower()`.

    Gravar 'Fulano@Empresa.com' como veio criaria uma conta que o formulário de
    entrada nunca encontraria — e a pessoa leria "login ou senha inválidos" para
    uma senha que está certa.
    """
    _abrir(db, cenario.org)
    login = f"MAIUSCULA-{uuid.uuid4().hex[:8]}@SPBIM.com.BR"

    r = client.post(f"{API}/auth/cadastro", json=_corpo(cenario.org, login=login))
    assert r.status_code == 201, r.text
    assert r.json()["usuario"]["login"] == login.lower()

    entrou = client.post(f"{API}/auth/login", json={"login": login, "senha": SENHA})
    assert entrou.status_code == 200, entrou.text


@requer_banco
def test_email_repetido_na_mesma_organizacao_da_409(
    client: TestClient, db: Session, cenario: Cenario
) -> None:
    """409 e não "criado em silêncio".

    Aqui não há vazamento a evitar: quem informou o código já mostrou pertencer
    ao contexto. Responder 201 sem criar mandaria a pessoa tentar entrar com uma
    senha que não vale — o caminho dela é "Esqueci minha senha".
    """
    _abrir(db, cenario.org)
    r = client.post(
        f"{API}/auth/cadastro", json=_corpo(cenario.org, login=cenario.admin.login)
    )
    assert r.status_code == 409, r.text


@requer_banco
def test_cadastro_NAO_cria_organizacao(
    client: TestClient, db: Session, cenario: Cenario
) -> None:
    """Quem se cadastra entra numa organização que já existe.

    Criar tenant continua sendo provisionamento e continua saindo do seed — ver
    a docstring de `api/v1/organizacao.py`. Se o cadastro pudesse criar, uma rota
    pública passaria a fabricar tenants, e não há nada que impedisse mil deles.
    """
    _abrir(db, cenario.org)
    antes = db.execute(select(Organizacao)).scalars().all()

    assert client.post(f"{API}/auth/cadastro", json=_corpo(cenario.org)).status_code == 201

    db.expire_all()
    depois = db.execute(select(Organizacao)).scalars().all()
    assert len(depois) == len(antes)


# ============================================================ a senha fraca
@requer_banco
def test_cadastro_recusa_senha_sem_composicao(
    client: TestClient, db: Session, cenario: Cenario
) -> None:
    """A mesma regra do resto da plataforma, e ela vale NA API.

    A tela mostra o checklist ao vivo, mas o checklist é conveniência: quem
    chama a rota direto — e ela é pública — não passa por tela nenhuma.
    """
    _abrir(db, cenario.org)
    for fraca in ("curta1!", "so-letras-e-hifens", "1234567890!@#"):
        r = client.post(f"{API}/auth/cadastro", json=_corpo(cenario.org, senha=fraca))
        assert r.status_code == 422, f"{fraca!r} passou: {r.text}"


@requer_banco
def test_a_senha_do_cadastro_nao_volta_na_resposta(
    client: TestClient, db: Session, cenario: Cenario
) -> None:
    _abrir(db, cenario.org)
    r = client.post(f"{API}/auth/cadastro", json=_corpo(cenario.org))
    assert r.status_code == 201, r.text
    assert SENHA not in r.text
    assert "senha_hash" not in r.text


# ================================================= o cadastro é IRRELEVANTE
#                                                    para quem já tem convite
@requer_banco
def test_organizacao_aberta_nao_afrouxa_o_login(
    client: TestClient, db: Session, cenario: Cenario
) -> None:
    """Ligar o cadastro aberto não muda NADA na autenticação.

    O interruptor autoriza criar conta; ele não é uma permissão, não entra no
    token e não relaxa a senha. Sem este teste, "a organização está aberta"
    viraria com o tempo um sinônimo de "a organização está frouxa".
    """
    _abrir(db, cenario.org)
    r = client.post(
        f"{API}/auth/login", json={"login": cenario.admin.login, "senha": "chute-errado-1!"}
    )
    assert r.status_code == 401, r.text


@requer_banco
def test_conta_criada_pelo_cadastro_e_uma_conta_comum(
    client: TestClient, db: Session, cenario: Cenario
) -> None:
    """Nada a distingue de uma criada por convite — nem coluna, nem estado.

    É o que mantém o recurso pequeno: quem se cadastrou é editável, promovível e
    removível pelas mesmas telas de sempre, e o admin não precisa aprender uma
    segunda categoria de usuário.
    """
    _abrir(db, cenario.org)
    corpo = _corpo(cenario.org)
    assert client.post(f"{API}/auth/cadastro", json=corpo).status_code == 201

    criado = db.execute(
        select(Usuario).where(Usuario.login == corpo["login"])
    ).scalar_one()
    assert criado.status == "ativo"
    assert criado.senha_hash and criado.senha_hash.startswith("$argon2")
    assert criado.oidc_sub is None
    # Lista vazia = "usa o padrão do papel". Copiar as permissões do papel para
    # a coluna congelaria a conta no conjunto de hoje: promover o papel depois
    # não lhe daria nada.
    assert criado.permissoes == []
