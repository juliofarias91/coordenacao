"""Membros de projeto (migration 0004) — API, unicidade e isolamento.

O que se protege aqui é o motivo de a tabela existir e o limite do que ela faz:
ela responde "quem está neste projeto", e NÃO autoriza nada. Um teste que
confundisse as duas coisas viraria, na primeira leitura futura, licença para
alguém "corrigir" a API e transformar participação em permissão sem perceber.
"""

from __future__ import annotations

import uuid

from fastapi.testclient import TestClient
from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models import Organizacao, Projeto, ProjetoMembro, TrilhaAuditoria, Usuario
from app.models.enums import PERMISSOES, PapelUsuario
from tests.conftest import API, Cenario, requer_banco


def _usuario(autenticado: TestClient, sufixo: str) -> dict:
    """Cria alguém pela API, para ser o membro."""
    resp = autenticado.post(
        f"{API}/usuarios",
        json={
            "login": f"membro-{sufixo}@spbim.com.br",
            "nome": f"Membro {sufixo}",
            "papel": "auditor",
            "senha": "senha-de-teste-123",
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


@requer_banco
def test_adicionar_e_listar(autenticado: TestClient, cenario: Cenario) -> None:
    pessoa = _usuario(autenticado, uuid.uuid4().hex[:6])

    resp = autenticado.post(
        f"{API}/projetos/{cenario.projeto.id}/membros",
        json={"usuario_id": pessoa["id"], "papel": "coordenador", "funcao": "Coordenação 4D"},
    )
    assert resp.status_code == 201, resp.text
    criado = resp.json()
    assert criado["papel"] == "coordenador"
    assert criado["funcao"] == "Coordenação 4D"
    # Os derivados: a tela lista pessoas, não ids.
    assert criado["usuario_nome"] == pessoa["nome"]
    assert criado["usuario_login"] == pessoa["login"]
    # O papel NA ORGANIZAÇÃO vem junto e é DIFERENTE do papel no projeto — é o
    # par que responde o que a pessoa consegue fazer de fato.
    assert criado["usuario_papel_org"] == "auditor"

    lista = autenticado.get(f"{API}/projetos/{cenario.projeto.id}/membros").json()
    assert any(m["id"] == criado["id"] for m in lista)


@requer_banco
def test_a_mesma_pessoa_nao_entra_duas_vezes(autenticado: TestClient, cenario: Cenario) -> None:
    """Sem a unicidade, "adicionar" duas vezes criaria dois vínculos com papéis
    diferentes e nada diria qual vale."""
    pessoa = _usuario(autenticado, uuid.uuid4().hex[:6])
    corpo = {"usuario_id": pessoa["id"], "papel": "auditor"}

    assert (
        autenticado.post(f"{API}/projetos/{cenario.projeto.id}/membros", json=corpo).status_code
        == 201
    )
    repetido = autenticado.post(f"{API}/projetos/{cenario.projeto.id}/membros", json=corpo)
    assert repetido.status_code == 409, repetido.text


@requer_banco
def test_papel_no_projeto_e_independente_do_papel_na_organizacao(
    autenticado: TestClient, cenario: Cenario
) -> None:
    """É a razão de a tabela existir: a mesma pessoa é coordenadora num projeto
    e leitora noutro, sem que o papel de organização mude."""
    pessoa = _usuario(autenticado, uuid.uuid4().hex[:6])  # papel org: auditor

    membro = autenticado.post(
        f"{API}/projetos/{cenario.projeto.id}/membros",
        json={"usuario_id": pessoa["id"], "papel": "leitor"},
    ).json()

    assert membro["papel"] == "leitor"
    assert membro["usuario_papel_org"] == "auditor"
    # E o cadastro do usuário não foi tocado.
    assert autenticado.get(f"{API}/usuarios").json()["itens"]
    perfil = next(
        u for u in autenticado.get(f"{API}/usuarios").json()["itens"] if u["id"] == pessoa["id"]
    )
    assert perfil["papel"] == "auditor", "virar membro alterou o papel de organização"


def _pessoa(db: Session, cenario: Cenario, papel_projeto: PapelUsuario | None) -> Usuario:
    """Uma conta sem poder de organização, opcionalmente vinculada ao projeto."""
    sufixo = uuid.uuid4().hex[:6]
    pessoa = Usuario(
        org_id=cenario.org.id,
        login=f"sem-poder-{sufixo}@spbim.com.br",
        nome="Sem poder",
        senha_hash=hash_password("senha-de-teste-123"),
        papel=PapelUsuario.LEITOR,
        permissoes=["ver_painel"],
    )
    db.add(pessoa)
    db.commit()
    if papel_projeto is not None:
        db.add(
            ProjetoMembro(
                org_id=cenario.org.id,
                projeto_id=cenario.projeto.id,
                usuario_id=pessoa.id,
                papel=papel_projeto,
            )
        )
        db.commit()
    return pessoa


@requer_banco
def test_participacao_nao_e_permissao(client: TestClient, cenario: Cenario, db: Session) -> None:
    """VÍNCULO NÃO CONCEDE PERMISSÃO DE ORGANIZAÇÃO — a fronteira que ficou.

    ⚠ ESTE TESTE MUDOU EM 07/08/2026, e a mudança é a razão de ele existir. Ele
    travava algo mais largo: que ser coordenador no `projeto_membro` não
    autorizasse NADA. Foi ele que falhou quando o convite de equipe foi portado
    da VDCity, e foi essa falha que trouxe a decisão à mesa — que é exatamente o
    que a docstring antiga pedia ("que este teste falhe e obrigue a pensar").

    A decisão: coordenar um projeto passa a bastar para montar a EQUIPE DELE. O
    que este teste guarda agora é o limite disso — o que o vínculo continua NÃO
    concedendo, e cada asserção é uma porta que precisa continuar fechada.
    """
    pessoa = _pessoa(db, cenario, PapelUsuario.COORDENADOR)
    coordena = cenario.headers(usuario_id=pessoa.id, permissoes=["ver_painel"])

    # 1. Não administra o CADASTRO da organização: não cria conta de ninguém.
    r = client.post(
        f"{API}/usuarios",
        json={"login": f"nova-{uuid.uuid4().hex[:6]}@spbim.com.br", "papel": "auditor"},
        headers=coordena,
    )
    assert r.status_code == 403, "coordenar um projeto passou a criar contas"

    # 2. Não mexe nas PÁGINAS VISÍVEIS de ninguém — elas valem na organização
    #    inteira, e é por isso que ficaram fora do convite (07/08/2026).
    r = client.put(
        f"{API}/usuarios/{cenario.admin.id}/paginas",
        json={"paginas": ["kpis"]},
        headers=coordena,
    )
    assert r.status_code == 403, "coordenar um projeto passou a esconder telas de outros"

    # 3. Não renomeia a organização nem toca no que é do tenant.
    r = client.patch(f"{API}/organizacao", json={"nome": "Sequestrada"}, headers=coordena)
    assert r.status_code == 403, "coordenar um projeto passou a administrar o tenant"


@requer_banco
def test_coordenador_do_projeto_MONTA_A_EQUIPE_dele(
    client: TestClient, cenario: Cenario, db: Session
) -> None:
    """A fronteira nova, pelo lado que ela ABRE (07/08/2026, a pedido).

    Sem isto, "o gerente do projeto adiciona a pessoa" — que é como a coordenação
    descreve o próprio trabalho — continuaria dependendo de um administrador do
    tenant para cada convite.
    """
    coord = _pessoa(db, cenario, PapelUsuario.COORDENADOR)
    convidada = _pessoa(db, cenario, None)
    cabecalho = cenario.headers(usuario_id=coord.id, permissoes=["ver_painel"])

    criado = client.post(
        f"{API}/projetos/{cenario.projeto.id}/membros",
        json={"usuario_id": str(convidada.id), "papel": "auditor"},
        headers=cabecalho,
    )
    assert criado.status_code == 201, criado.text

    membro_id = criado.json()["id"]
    trocado = client.patch(
        f"{API}/membros/{membro_id}", json={"papel": "leitor"}, headers=cabecalho
    )
    assert trocado.status_code == 200, trocado.text

    removido = client.delete(f"{API}/membros/{membro_id}", headers=cabecalho)
    assert removido.status_code == 204, removido.text


@requer_banco
def test_coordenar_UM_projeto_nao_alcanca_OUTRO(
    client: TestClient, cenario: Cenario, db: Session
) -> None:
    """A guarda é por `projeto_id`, e este teste é o que prova.

    Sem ela, "coordenador" viraria um papel global disfarçado: quem coordena o
    menor projeto da organização montaria a equipe do CPQ11.
    """
    coord = _pessoa(db, cenario, PapelUsuario.COORDENADOR)
    convidada = _pessoa(db, cenario, None)
    vizinho = Projeto(
        org_id=cenario.org.id,
        codigo=f"V{uuid.uuid4().hex[:6].upper()}",
        nome="Projeto vizinho",
        status="ativo",
    )
    db.add(vizinho)
    db.commit()

    try:
        r = client.post(
            f"{API}/projetos/{vizinho.id}/membros",
            json={"usuario_id": str(convidada.id), "papel": "auditor"},
            headers=cenario.headers(usuario_id=coord.id, permissoes=["ver_painel"]),
        )
        # 404 e não 403: quem não é membro do vizinho nem sabe que ele existe.
        assert r.status_code == 404, "coordenar um projeto alcançou outro"
    finally:
        db.execute(delete(ProjetoMembro).where(ProjetoMembro.projeto_id == vizinho.id))
        db.execute(delete(Projeto).where(Projeto.id == vizinho.id))
        db.commit()


@requer_banco
def test_membro_comum_nao_monta_a_equipe(
    client: TestClient, cenario: Cenario, db: Session
) -> None:
    """Ser membro não basta — o papel NO projeto precisa ser coordenador.

    403 e não 404 aqui: para quem é membro o projeto não é segredo, e o que não é
    dele é a ação. É o degrau a mais que `exigir_coordenacao_do_projeto` faz.
    """
    leitor = _pessoa(db, cenario, PapelUsuario.LEITOR)
    outra = _pessoa(db, cenario, None)
    r = client.post(
        f"{API}/projetos/{cenario.projeto.id}/membros",
        json={"usuario_id": str(outra.id), "papel": "auditor"},
        headers=cenario.headers(usuario_id=leitor.id, permissoes=["ver_painel"]),
    )
    assert r.status_code == 403, "membro comum passou a montar a equipe"


@requer_banco
def test_quem_nao_e_membro_nao_ENXERGA_o_projeto(
    client: TestClient, cenario: Cenario
) -> None:
    """A OUTRA METADE DA REGRA, e ela entrou em 06/08/2026 (a pedido).

    O teste acima trava que vínculo não CONCEDE poder. Este trava que vínculo
    LIMITA alcance — e as duas convivem porque apontam em direções opostas:
    participar nunca amplia o que se pode fazer, mas não participar restringe
    sobre o que se faz.

    O que motivou: uma conta criada pela tela de cadastro entrava e encontrava o
    CPQ11 na home. Ninguém a havia vinculado; `ver_painel` sozinho bastava para
    listar TODO projeto da organização.

    ⚠ AS QUATRO ROTAS, e não só a listagem. Filtrar apenas a lista seria
    esconder: o id do projeto vai na URL, e quem não é membro abriria o painel
    digitando o endereço. E 404, não 403 — dizer "proibido" confirmaria que o
    projeto existe.
    """
    so_leitura = cenario.headers(permissoes=["ver_painel", "gerar_relatorio"])

    lista = client.get(f"{API}/projetos", headers=so_leitura)
    assert lista.status_code == 200, lista.text
    ids = [p["id"] for p in lista.json()["itens"]]
    assert str(cenario.projeto.id) not in ids, "projeto sem vínculo apareceu na listagem"

    pid = cenario.projeto.id
    for rota in (f"/projetos/{pid}", f"/projetos/{pid}/painel", f"/projetos/{pid}/kpis"):
        r = client.get(f"{API}{rota}", headers=so_leitura)
        assert r.status_code == 404, f"{rota} respondeu {r.status_code} a quem não é membro"


@requer_banco
def test_quem_administra_o_cadastro_continua_vendo_TUDO(
    autenticado: TestClient, cenario: Cenario
) -> None:
    """A exceção que faz o recurso ser usável.

    Quem cria projeto e vincula gente precisa enxergar o que ainda não tem
    ninguém dentro — senão um projeto recém-criado ficaria invisível para o
    próprio criador, e não haveria por onde vincular o primeiro membro.
    """
    lista = autenticado.get(f"{API}/projetos")
    assert lista.status_code == 200, lista.text
    assert str(cenario.projeto.id) in [p["id"] for p in lista.json()["itens"]]
    assert autenticado.get(f"{API}/projetos/{cenario.projeto.id}").status_code == 200


@requer_banco
def test_membro_do_projeto_enxerga_o_projeto(
    client: TestClient, cenario: Cenario, db: Session
) -> None:
    """O caminho de volta: vinculado, o visualizador vê — e é isso que o gerente
    do projeto faz por ele."""
    sufixo = uuid.uuid4().hex[:6]
    pessoa = Usuario(
        org_id=cenario.org.id,
        login=f"vinculado-{sufixo}@spbim.com.br",
        senha_hash=hash_password("senha-de-teste-123"),
        papel=PapelUsuario.LEITOR,
        permissoes=["ver_painel"],
    )
    db.add(pessoa)
    db.commit()
    db.add(
        ProjetoMembro(
            org_id=cenario.org.id,
            projeto_id=cenario.projeto.id,
            usuario_id=pessoa.id,
            papel=PapelUsuario.LEITOR,
        )
    )
    db.commit()

    cabecalho = cenario.headers(usuario_id=pessoa.id, permissoes=["ver_painel"])
    lista = client.get(f"{API}/projetos", headers=cabecalho)
    assert lista.status_code == 200, lista.text
    assert str(cenario.projeto.id) in [p["id"] for p in lista.json()["itens"]]
    assert (
        client.get(f"{API}/projetos/{cenario.projeto.id}", headers=cabecalho).status_code == 200
    )


@requer_banco
def test_remover_membro_nao_apaga_a_pessoa(autenticado: TestClient, cenario: Cenario) -> None:
    """Sair de um projeto não pode reescrever o que já foi decidido nele."""
    pessoa = _usuario(autenticado, uuid.uuid4().hex[:6])
    membro = autenticado.post(
        f"{API}/projetos/{cenario.projeto.id}/membros",
        json={"usuario_id": pessoa["id"], "papel": "auditor"},
    ).json()

    assert autenticado.delete(f"{API}/membros/{membro['id']}").status_code == 204

    logins = {u["id"] for u in autenticado.get(f"{API}/usuarios").json()["itens"]}
    assert pessoa["id"] in logins, "remover do projeto apagou a conta"


@requer_banco
def test_membro_de_outra_organizacao_nao_aparece(
    autenticado: TestClient, cenario: Cenario, db: Session
) -> None:
    """A tabela nasceu na 0004, depois das policies da 0001 — sem a policy
    própria na migration, os membros de um tenant vazariam para o outro."""
    sufixo = uuid.uuid4().hex[:8]
    outra = Organizacao(nome=f"Outra {sufixo}", slug=f"outra-{sufixo}")
    db.add(outra)
    db.flush()
    alheio = Projeto(org_id=outra.id, codigo=f"ALH{sufixo[:5].upper()}", nome="Projeto alheio")
    intruso = Usuario(
        org_id=outra.id,
        login=f"intruso-{sufixo}@outra.com",
        nome="Intruso",
        senha_hash=hash_password("senha-de-teste-123"),
        papel=PapelUsuario.ADMIN,
        permissoes=list(PERMISSOES),
    )
    db.add_all([alheio, intruso])
    db.flush()
    vinculo = ProjetoMembro(
        org_id=outra.id,
        projeto_id=alheio.id,
        usuario_id=intruso.id,
        papel=PapelUsuario.COORDENADOR,
    )
    db.add(vinculo)
    db.commit()

    vinculo_id, alheio_id, outra_id = vinculo.id, alheio.id, outra.id
    try:
        # O projeto alheio nem existe daqui — 404, não 403.
        assert autenticado.get(f"{API}/projetos/{alheio_id}/membros").status_code == 404
        # E o vínculo dele não é alcançável por id.
        assert (
            autenticado.patch(f"{API}/membros/{vinculo_id}", json={"papel": "leitor"}).status_code
            == 404
        )
    finally:
        # `rollback` primeiro: uma asserção que falhe deixa a transação
        # abortada, e aí toda a limpeza seria ignorada.
        db.rollback()
        db.execute(delete(TrilhaAuditoria).where(TrilhaAuditoria.org_id == outra_id))
        db.execute(delete(ProjetoMembro).where(ProjetoMembro.org_id == outra_id))
        db.execute(delete(Usuario).where(Usuario.org_id == outra_id))
        db.execute(delete(Projeto).where(Projeto.org_id == outra_id))
        db.execute(delete(Organizacao).where(Organizacao.id == outra_id))
        db.commit()


@requer_banco
def test_checklists_lod300_e_lod350_existem(autenticado: TestClient, cenario: Cenario) -> None:
    """A outra metade da 0004: o enum ia de lod400 a lod500 direto, pulando os
    dois níveis em que a coordenação mais trabalha."""
    for checklist in ("lod300", "lod350"):
        resp = autenticado.get(
            f"{API}/projetos/{cenario.projeto.id}/matriz", params={"checklist": checklist}
        )
        assert resp.status_code == 200, f"{checklist}: {resp.text}"
        assert resp.json()["checklist"] == checklist
