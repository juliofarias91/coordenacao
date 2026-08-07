"""Criar a própria conta — `POST /auth/cadastro`.

O recurso reverteu "o acesso é só por convite do admin" (05/08/2026) e perdeu as
duas travas que ele tinha em dois dias, as duas a pedido: o código da organização
digitado no formulário, e o interruptor `cadastro_aberto` por tenant. **Hoje não
há trava nenhuma** — quem quiser cria a conta e entra.

O QUE ESTES TESTES GUARDAM MUDOU DE LUGAR junto. Não há mais portão a conferir;
o que resta são os dois limites que impedem o cadastro aberto de virar acesso
aberto, e eles não são óbvios olhando a rota:

- a conta nasce no papel MENOS privilegiado;
- a conta nasce SEM VÍNCULO DE PROJETO, e é o vínculo que dá acesso a modelo,
  auditoria e relatório.

⚠ ESTE ARQUIVO LIMPA O QUE CRIA, E A LIMPEZA NÃO É DETALHE. As contas nascem na
organização MAIS ANTIGA do banco — que não é a do `cenario`, criada agora —,
então o `_limpar_org` do fixture não as alcança. Sem a limpeza daqui, cada
execução deixaria uma conta órfã no tenant real, que é exatamente como
`org-2347b538` sobrou no banco do piloto em 30/07.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import Organizacao, ProjetoMembro, TrilhaAuditoria, Usuario
from app.models.enums import PERMISSOES_POR_PAPEL, PapelUsuario
from tests.conftest import API, Cenario, requer_banco

SENHA = "uma-senha-boa-1!"


@pytest.fixture
def alguma_organizacao(db: Session) -> Iterator[None]:
    """GARANTE QUE EXISTE UMA ORGANIZAÇÃO — o CI roda contra um banco VAZIO.

    `organizacao_do_cadastro` escolhe a MAIS ANTIGA do banco e levanta
    `SemOrganizacao` (503) quando não há nenhuma. Este arquivo nasceu validado
    contra o banco onde o piloto mora, que sempre tem uma; num Postgres
    recém-criado os oito testes que chamam `POST /auth/cadastro` respondiam
    *"a plataforma ainda não tem organização configurada"*, e o recurso inteiro
    parecia quebrado quando o que faltava era instalação.

    O `cenario` NÃO resolve isto, e é por isso que existe um fixture próprio: ele
    não é usado por estes testes, e mesmo que fosse a organização dele nasceria
    AGORA — a escolhida é a mais antiga, não a do teste.

    ELE SÓ CRIA QUANDO O BANCO ESTÁ VAZIO, e é o que mantém o comportamento no
    banco de verdade: lá a organização da SPBIM é mais antiga, segue sendo a
    escolhida, e este fixture não acrescenta linha nenhuma — nem a limpeza dele
    roda. É a mesma preocupação do `contas` logo abaixo, que existe para não
    deixar conta órfã no tenant real.
    """
    if db.execute(select(Organizacao.id).limit(1)).scalar_one_or_none() is not None:
        yield
        return

    org = Organizacao(nome="Organização de teste", slug=f"org-ci-{uuid.uuid4().hex[:8]}")
    db.add(org)
    db.commit()
    yield
    db.execute(delete(Organizacao).where(Organizacao.id == org.id))
    db.commit()


@pytest.fixture
def contas(db: Session, alguma_organizacao: None) -> Iterator[list[str]]:
    """Os logins criados pelo teste, apagados na saída.

    Devolve uma LISTA que o teste vai enchendo, em vez de apagar por padrão de
    nome: um `LIKE 'novo-%'` alcançaria conta de gente de verdade no dia em que
    alguém se chamasse assim, e este arquivo roda contra o banco onde o piloto
    mora.

    ELE PEDE `alguma_organizacao` PELA ORDEM, e não por precisar do valor: o
    pytest finaliza na ordem inversa da montagem, então pedi-lo aqui garante que
    a organização nasce ANTES das contas e morre DEPOIS delas. Ao contrário, o
    DELETE da organização esbarraria na FK das contas que ainda estivessem lá.
    """
    criados: list[str] = []
    yield criados
    if criados:
        ids = db.execute(select(Usuario.id).where(Usuario.login.in_(criados))).scalars().all()
        if ids:
            # A trilha primeiro: ela referencia usuário e a FK segura o DELETE.
            db.execute(delete(TrilhaAuditoria).where(TrilhaAuditoria.usuario_id.in_(ids)))
            db.execute(delete(Usuario).where(Usuario.id.in_(ids)))
        db.commit()


def _corpo(contas: list[str], **extra: object) -> dict[str, object]:
    corpo: dict[str, object] = {
        "login": f"novo-{uuid.uuid4().hex[:8]}@spbim.com.br",
        "nome": "Pessoa Nova",
        "senha": SENHA,
        **extra,
    }
    contas.append(str(corpo["login"]).lower())
    return corpo


# ================================================== não há mais trava nenhuma
@requer_banco
def test_qualquer_pessoa_cria_a_conta_e_ja_entra(
    client: TestClient, db: Session, contas: list[str]
) -> None:
    """SEM PREPARO NENHUM — nada de ligar interruptor, nada de código.

    Este teste é o recurso inteiro numa asserção, e ele existe na forma negativa
    do que havia antes: por dois dias, a mesma chamada respondia 404 até alguém
    ligar uma coluna. Se voltar a exigir preparo, é aqui que se vê.
    """
    corpo = _corpo(contas)
    r = client.post(f"{API}/auth/cadastro", json=corpo)
    assert r.status_code == 201, r.text

    sessao = r.json()
    # Devolve SESSÃO, não só 201: sem SMTP não há confirmação de e-mail para
    # justificar mandar a pessoa digitar de novo a senha que acabou de escolher.
    assert sessao["tokens"]["access_token"]
    assert sessao["usuario"]["login"] == corpo["login"]

    entrou = client.post(f"{API}/auth/login", json={"login": corpo["login"], "senha": SENHA})
    assert entrou.status_code == 200, entrou.text


@requer_banco
def test_a_conta_nasce_na_organizacao_MAIS_ANTIGA(
    client: TestClient, db: Session, contas: list[str]
) -> None:
    """A regra que substituiu o interruptor, e ela é `ORDER BY created_at`.

    O teste cria uma organização com data no PASSADO e prova que o cadastro vai
    para ela — se a consulta perdesse o `order_by`, a conta cairia em qualquer
    uma, porque SELECT sem ordenação não promete ordem e o Postgres muda a dele
    conforme o plano.
    """
    antiga = Organizacao(
        nome="Bem antiga",
        slug=f"antiga-{uuid.uuid4().hex[:8]}",
        created_at=datetime.now(UTC) - timedelta(days=3650),
    )
    db.add(antiga)
    db.commit()

    try:
        r = client.post(f"{API}/auth/cadastro", json=_corpo(contas))
        assert r.status_code == 201, r.text
        assert r.json()["usuario"]["org_id"] == str(antiga.id)
    finally:
        db.execute(delete(Usuario).where(Usuario.org_id == antiga.id))
        db.execute(delete(Organizacao).where(Organizacao.id == antiga.id))
        db.commit()


@requer_banco
def test_cadastro_NAO_cria_organizacao(
    client: TestClient, db: Session, contas: list[str]
) -> None:
    """Quem se cadastra entra numa organização que já existe.

    Criar tenant continua sendo provisionamento e continua saindo do seed — ver
    a docstring de `api/v1/organizacao.py`. Se o cadastro pudesse criar, uma rota
    pública passaria a fabricar tenants, e agora que não há trava nenhuma nada
    impediria mil deles.
    """
    antes = len(db.execute(select(Organizacao.id)).scalars().all())
    assert client.post(f"{API}/auth/cadastro", json=_corpo(contas)).status_code == 201

    db.expire_all()
    assert len(db.execute(select(Organizacao.id)).scalars().all()) == antes


# ============================ os DOIS limites que sobraram no lugar da trava
@requer_banco
def test_a_conta_nasce_no_papel_MENOS_privilegiado(
    client: TestClient, db: Session, contas: list[str]
) -> None:
    """Sem trava antes dela, o papel de entrada é o PRIMEIRO limite que existe.

    Enquanto havia interruptor, este teste guardava o segundo degrau de uma
    escada. Agora é o primeiro: entre um desconhecido e a plataforma há isto e
    mais nada. Nascer coordenador daria a quem acabou de chegar o poder de
    publicar round — o ato que congela o resultado para o fornecedor.
    """
    r = client.post(f"{API}/auth/cadastro", json=_corpo(contas))
    assert r.status_code == 201, r.text

    usuario = r.json()["usuario"]
    assert usuario["papel"] == PapelUsuario.LEITOR.value
    assert set(usuario["permissoes"]) == set(PERMISSOES_POR_PAPEL[PapelUsuario.LEITOR])
    assert "admin_cadastro" not in usuario["permissoes"]
    assert "publicar" not in usuario["permissoes"]


@requer_banco
def test_conta_nova_nao_entra_em_projeto_nenhum(
    client: TestClient, db: Session, contas: list[str]
) -> None:
    """O SEGUNDO limite, e o que o pedido de 06/08/2026 descreve palavra por
    palavra: "ela não estará vinculada a nenhum projeto, o gerente de algum
    projeto poderá adicionar essa pessoa".

    É o vínculo que dá acesso a modelo, auditoria e relatório. O atalho tentador
    — pôr a conta nova em todos os projetos da organização, ou no primeiro, para
    ela "já ver alguma coisa" ao entrar — entregaria a um desconhecido os modelos
    e as auditorias de um cliente real. Home vazia é o comportamento certo, e a
    tela de cadastro avisa que ela vem.
    """
    corpo = _corpo(contas)
    assert client.post(f"{API}/auth/cadastro", json=corpo).status_code == 201

    criado = db.execute(select(Usuario).where(Usuario.login == corpo["login"])).scalar_one()
    vinculos = (
        db.execute(select(ProjetoMembro).where(ProjetoMembro.usuario_id == criado.id))
        .scalars()
        .all()
    )
    assert vinculos == [], "a conta nova não pode nascer vinculada a projeto nenhum"


# ============================================================ o resto da rota
@requer_banco
def test_o_login_e_gravado_em_minusculas(
    client: TestClient, db: Session, contas: list[str]
) -> None:
    """`_candidatos`, no login, procura por `login.strip().lower()`.

    Gravar 'Fulano@Empresa.com' como veio criaria uma conta que o formulário de
    entrada nunca encontraria — e a pessoa leria "login ou senha inválidos" para
    uma senha que está certa.
    """
    login = f"MAIUSCULA-{uuid.uuid4().hex[:8]}@SPBIM.com.BR"
    r = client.post(f"{API}/auth/cadastro", json=_corpo(contas, login=login))
    assert r.status_code == 201, r.text
    assert r.json()["usuario"]["login"] == login.lower()

    entrou = client.post(f"{API}/auth/login", json={"login": login, "senha": SENHA})
    assert entrou.status_code == 200, entrou.text


@requer_banco
def test_email_repetido_da_409(client: TestClient, db: Session, contas: list[str]) -> None:
    """Cadastrar duas vezes o mesmo e-mail: a segunda recusa.

    Responder 201 sem criar mandaria a pessoa tentar entrar com uma senha que não
    vale; o caminho dela é "Esqueci minha senha", e dizer isso é mais útil do que
    esconder. O vazamento que isto revela — que o e-mail já tem conta — é o mesmo
    que a tela de login já revela a quem tenta entrar.
    """
    corpo = _corpo(contas)
    assert client.post(f"{API}/auth/cadastro", json=corpo).status_code == 201

    de_novo = client.post(f"{API}/auth/cadastro", json={**corpo, "senha": "outra-senha-1!"})
    assert de_novo.status_code == 409, de_novo.text


@requer_banco
def test_cadastro_recusa_senha_sem_composicao(
    client: TestClient, db: Session, contas: list[str]
) -> None:
    """A mesma regra do resto da plataforma, e ela vale NA API.

    A tela mostra o checklist ao vivo, mas o checklist é conveniência: quem chama
    a rota direto — e ela é pública, e agora sem trava — não passa por tela
    nenhuma.
    """
    for fraca in ("curta1!", "so-letras-e-hifens", "1234567890!@#"):
        # Sem registrar em `contas`: um 422 não cria conta, e pôr o login na
        # lista de limpeza faria o teardown procurar o que não existe.
        corpo = {
            "login": f"fraca-{uuid.uuid4().hex[:8]}@spbim.com.br",
            "senha": fraca,
        }
        r = client.post(f"{API}/auth/cadastro", json=corpo)
        assert r.status_code == 422, f"{fraca!r} passou: {r.text}"


@requer_banco
def test_a_senha_do_cadastro_nao_volta_na_resposta(
    client: TestClient, db: Session, contas: list[str]
) -> None:
    r = client.post(f"{API}/auth/cadastro", json=_corpo(contas))
    assert r.status_code == 201, r.text
    assert SENHA not in r.text
    assert "senha_hash" not in r.text


@requer_banco
def test_conta_criada_pelo_cadastro_e_uma_conta_comum(
    client: TestClient, db: Session, contas: list[str]
) -> None:
    """Nada a distingue de uma criada por convite — nem coluna, nem estado.

    É o que mantém o recurso pequeno: quem se cadastrou é editável, promovível e
    removível pelas mesmas telas de sempre, e quem administra não precisa
    aprender uma segunda categoria de usuário.
    """
    corpo = _corpo(contas)
    assert client.post(f"{API}/auth/cadastro", json=corpo).status_code == 201

    criado = db.execute(select(Usuario).where(Usuario.login == corpo["login"])).scalar_one()
    assert criado.status == "ativo"
    assert criado.senha_hash and criado.senha_hash.startswith("$argon2")
    assert criado.oidc_sub is None
    # Lista vazia = "usa o padrão do papel". Copiar as permissões do papel para a
    # coluna congelaria a conta no conjunto de hoje: promover o papel depois não
    # lhe daria nada.
    assert criado.permissoes == []


@requer_banco
def test_o_cadastro_nao_afrouxa_o_login(
    client: TestClient, db: Session, cenario: Cenario
) -> None:
    """Existir cadastro aberto não muda NADA na autenticação.

    Sem este teste, "a plataforma aceita cadastro" viraria com o tempo sinônimo
    de "a plataforma está frouxa" — e a diferença entre as duas é o que separa
    uma porta de entrada de um buraco.
    """
    r = client.post(
        f"{API}/auth/login", json={"login": cenario.admin.login, "senha": "chute-errado-1!"}
    )
    assert r.status_code == 401, r.text
