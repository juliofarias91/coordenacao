"""Fase 4 · notificações, KPIs, placar, apontamentos, portal e trilha."""

from __future__ import annotations

import uuid

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models import Notificacao, TrilhaAuditoria, Usuario
from app.models.enums import PapelUsuario
from tests.conftest import API, Cenario, CenarioAuditavel, requer_banco

pytestmark = requer_banco


def _publicar_round(client: TestClient, versao_id) -> dict:
    auditoria = client.post(f"{API}/versoes/{versao_id}/auditar", json={}).json()[0]
    detalhe = client.get(f"{API}/auditorias/{auditoria['id']}").json()
    for resultado in detalhe["resultados"]:
        client.patch(f"{API}/resultados/{resultado['id']}", json={"status": "aprovado"})
    client.post(f"{API}/auditorias/{auditoria['id']}/publicar")
    return auditoria


# ==================================================== SP-401 · notificações
def test_contador_e_marcacao_de_leitura(
    autenticado: TestClient, auditavel: CenarioAuditavel, db: Session
) -> None:
    from app.services import penalidades as ledger

    ledger.avisar_erro(db, org_id=auditavel.org.id, mensagem="falha A", origem="x")
    ledger.avisar_auditoria(db, org_id=auditavel.org.id, mensagem="round publicado", origem="y")
    db.commit()

    contador = autenticado.get(f"{API}/notificacoes/contador").json()
    assert contador["nao_lidas"] == 2
    assert contador["por_tipo"]["erro"] == 1
    assert contador["por_tipo"]["auditoria"] == 1

    primeira = autenticado.get(f"{API}/notificacoes").json()[0]
    r = autenticado.post(f"{API}/notificacoes/{primeira['id']}/lida")
    assert r.status_code == 200
    assert r.json()["lida"] is True

    assert autenticado.get(f"{API}/notificacoes/contador").json()["nao_lidas"] == 1


def test_filtro_por_tipo_e_nao_lidas(
    autenticado: TestClient, auditavel: CenarioAuditavel, db: Session
) -> None:
    from app.services import penalidades as ledger

    ledger.avisar_erro(db, org_id=auditavel.org.id, mensagem="erro 1", origem="x")
    ledger.avisar_auditoria(db, org_id=auditavel.org.id, mensagem="ok 1", origem="y")
    db.commit()

    erros = autenticado.get(f"{API}/notificacoes", params={"tipo": "erro"}).json()
    assert len(erros) == 1 and erros[0]["mensagem"] == "erro 1"


def test_marcar_todas_lidas(
    autenticado: TestClient, auditavel: CenarioAuditavel, db: Session
) -> None:
    from app.services import penalidades as ledger

    for i in range(3):
        ledger.avisar_erro(db, org_id=auditavel.org.id, mensagem=f"erro {i}", origem="x")
    db.commit()

    assert autenticado.post(f"{API}/notificacoes/marcar-todas-lidas").status_code == 204
    assert autenticado.get(f"{API}/notificacoes/contador").json()["nao_lidas"] == 0


def test_notificacao_de_papel_nao_vaza_para_outro_papel(
    client: TestClient, auditavel: CenarioAuditavel, db: Session
) -> None:
    from app.services import penalidades as ledger

    ledger.avisar_erro(db, org_id=auditavel.org.id, mensagem="so coordenacao", origem="x")
    db.commit()

    coord = client.get(
        f"{API}/notificacoes", headers=auditavel.headers(papel=PapelUsuario.COORDENADOR)
    ).json()
    assert any(n["mensagem"] == "so coordenacao" for n in coord)

    auditor = client.get(
        f"{API}/notificacoes", headers=auditavel.headers(papel=PapelUsuario.AUDITOR)
    ).json()
    assert not any(n["mensagem"] == "so coordenacao" for n in auditor)


# ========================================================== SP-403 · KPIs
def test_kpis_derivam_das_auditorias(
    autenticado: TestClient, auditavel: CenarioAuditavel
) -> None:
    _publicar_round(autenticado, auditavel.versao.id)

    r = autenticado.get(f"{API}/projetos/{auditavel.projeto.id}/kpis")
    assert r.status_code == 200, r.text
    kpis = r.json()

    assert kpis["modelos"] == 1
    assert kpis["versoes"] == 1
    assert kpis["auditorias_publicadas"] == 1
    assert float(kpis["aprovacao_media"]) == 100.0

    macro = {f["rotulo"]: f for f in kpis["por_macro"]}
    assert "CIVIL/ESTRUT" in macro
    assert macro["CIVIL/ESTRUT"]["cor"] == "#A85B12"

    status = {f["rotulo"]: f["valor"] for f in kpis["por_status_de_item"]}
    assert status["Aprovado"] == len(auditavel.criterios)

    assert kpis["evolucao"][0]["round"] == 1
    assert kpis["evolucao"][0]["aprovacao_media"] == 100.0


def test_kpis_listam_criterios_mais_reprovados(
    autenticado: TestClient, auditavel: CenarioAuditavel
) -> None:
    auditoria = autenticado.post(
        f"{API}/versoes/{auditavel.versao.id}/auditar", json={}
    ).json()[0]
    detalhe = autenticado.get(f"{API}/auditorias/{auditoria['id']}").json()
    autenticado.patch(
        f"{API}/resultados/{detalhe['resultados'][0]['id']}", json={"status": "reprovado"}
    )

    kpis = autenticado.get(f"{API}/projetos/{auditavel.projeto.id}/kpis").json()
    assert len(kpis["criterios_mais_reprovados"]) == 1
    assert kpis["criterios_mais_reprovados"][0]["valor"] == 1


def test_kpis_de_projeto_vazio_nao_quebram(
    autenticado: TestClient, cenario: Cenario
) -> None:
    kpis = autenticado.get(f"{API}/projetos/{cenario.projeto.id}/kpis").json()
    assert kpis["modelos"] == 0
    assert kpis["aprovacao_media"] is None
    assert kpis["evolucao"] == []


# ======================================================= SP-402 · placar
def test_placar_desconta_ncs_e_penalidades(
    autenticado: TestClient, auditavel: CenarioAuditavel, db: Session
) -> None:
    """O índice tem de ser explicável: aprovação menos atrito."""
    auditoria = _publicar_round(autenticado, auditavel.versao.id)

    r = autenticado.get(f"{API}/projetos/{auditavel.projeto.id}/scorecard")
    assert r.status_code == 200, r.text
    corpo = r.json()
    assert "índice" in corpo["formula"]

    linha = corpo["linhas"][0]
    assert linha["empresa"] == "METASA"
    assert float(linha["aprovacao_media"]) == 100.0
    assert float(linha["indice"]) == 100.0

    # Uma NC aberta e uma penalidade descontam.
    autenticado.post(f"{API}/auditorias/{auditoria['id']}/ncs", json={"descricao": "x"})
    from app.services import penalidades as ledger

    ledger.aplicar(
        db, org_id=auditavel.org.id, empresa_id=auditavel.empresa.id, motivo="nome", peso=1
    )
    db.commit()

    linha = autenticado.get(f"{API}/projetos/{auditavel.projeto.id}/scorecard").json()["linhas"][0]
    assert linha["ncs_abertas"] == 1
    assert linha["penalidades"] == 1
    assert float(linha["indice"]) == 100.0 - 2.0 - 3.0


def test_empresa_sem_auditoria_nao_entra_no_ranking(
    autenticado: TestClient, auditavel: CenarioAuditavel
) -> None:
    """Zero diria "péssima"; o que se sabe é "ainda não olhamos".

    Um placar que ranqueia fornecedor não auditado abaixo de um auditado com
    11% é factualmente errado — e ele vai ser mostrado ao fornecedor.
    """
    outra = autenticado.post(
        f"{API}/empresas", json={"nome": "Ainda Sem Entrega", "papeis": ["trade"]}
    ).json()
    autenticado.post(
        f"{API}/modelos",
        json={
            "projeto_id": str(auditavel.projeto.id),
            "codigo": "CPQ11-A-ARCH-WOOD-ADMIN-R22",
            "instaladora_id": outra["id"],
        },
    )
    _publicar_round(autenticado, auditavel.versao.id)

    linhas = autenticado.get(f"{API}/projetos/{auditavel.projeto.id}/scorecard").json()["linhas"]
    por_nome = {linha["empresa"]: linha for linha in linhas}

    assert por_nome["METASA"]["avaliado"] is True
    assert float(por_nome["METASA"]["indice"]) == 100.0

    nao_avaliada = por_nome["Ainda Sem Entrega"]
    assert nao_avaliada["avaliado"] is False
    assert nao_avaliada["indice"] is None, "índice zero mentiria sobre a empresa"
    assert nao_avaliada["modelos"] == 1, "ela aparece: a coordenação precisa ver quem falta"

    # E vem depois das avaliadas, para não poluir o topo do ranking.
    assert [linha["empresa"] for linha in linhas].index("METASA") < [
        linha["empresa"] for linha in linhas
    ].index("Ainda Sem Entrega")


def test_nc_sozinha_ja_torna_a_empresa_avaliada(
    autenticado: TestClient, auditavel: CenarioAuditavel, db: Session
) -> None:
    """Penalidade ou NC bastam: houve medição, ainda que sem round publicado."""
    from app.services import penalidades as ledger

    ledger.aplicar(
        db, org_id=auditavel.org.id, empresa_id=auditavel.empresa.id, motivo="nome", peso=1
    )
    db.commit()

    linha = autenticado.get(f"{API}/projetos/{auditavel.projeto.id}/scorecard").json()["linhas"][0]
    assert linha["avaliado"] is True
    assert linha["indice"] is not None


def test_placar_tem_piso_zero(
    autenticado: TestClient, auditavel: CenarioAuditavel, db: Session
) -> None:
    """Índice negativo não diz nada além de 'muito ruim'."""
    from app.services import penalidades as ledger

    ledger.aplicar(
        db, org_id=auditavel.org.id, empresa_id=auditavel.empresa.id, motivo="muitas", peso=99
    )
    db.commit()

    linha = autenticado.get(f"{API}/projetos/{auditavel.projeto.id}/scorecard").json()["linhas"][0]
    assert float(linha["indice"]) == 0.0


# ================================================== SP-404 · apontamentos
def test_apontamento_ganha_codigo_sequencial(
    autenticado: TestClient, auditavel: CenarioAuditavel
) -> None:
    corpo = {
        "projeto_id": str(auditavel.projeto.id),
        "titulo": "Interferência entre estrutura e MEP",
        "prioridade": "alta",
        "modelo_id": str(auditavel.modelo.id),
        "responsavel_id": str(auditavel.empresa.id),
    }
    primeiro = autenticado.post(f"{API}/apontamentos", json=corpo).json()
    segundo = autenticado.post(f"{API}/apontamentos", json={**corpo, "titulo": "Outro"}).json()

    assert primeiro["codigo"] == "AP-001"
    assert segundo["codigo"] == "AP-002"
    assert primeiro["status"] == "aberto"


def test_filtrar_apontamentos(autenticado: TestClient, auditavel: CenarioAuditavel) -> None:
    base = {"projeto_id": str(auditavel.projeto.id), "titulo": "x"}
    autenticado.post(f"{API}/apontamentos", json={**base, "prioridade": "alta"})
    autenticado.post(f"{API}/apontamentos", json={**base, "prioridade": "baixa"})

    altos = autenticado.get(f"{API}/apontamentos", params={"prioridade": "alta"}).json()
    assert len(altos["itens"]) == 1


def test_sync_acc_sem_credencial_avisa(
    autenticado: TestClient, auditavel: CenarioAuditavel
) -> None:
    apontamento = autenticado.post(
        f"{API}/apontamentos",
        json={"projeto_id": str(auditavel.projeto.id), "titulo": "x"},
    ).json()

    r = autenticado.post(f"{API}/apontamentos/{apontamento['id']}/sync-acc")
    assert r.status_code == 200
    assert r.json()["sincronizado"] is False
    assert "APS_CLIENT_ID" in r.json()["detalhe"]


# ======================================================== SP-405 · portal
def test_portal_respeita_a_visibilidade_por_campo(
    autenticado: TestClient, client: TestClient, auditavel: CenarioAuditavel
) -> None:
    """CA central: só o que o convite liberou sai do portal."""
    _publicar_round(autenticado, auditavel.versao.id)

    convite = autenticado.post(
        f"{API}/projetos/{auditavel.projeto.id}/convites",
        json={"cliente_nome": "Microsoft", "cliente_email": "cliente@microsoft.com"},
    ).json()
    assert convite["token"]

    # Sem token de usuário: o portal é público por design.
    r = client.get(f"{API}/portal/{convite['token']}")
    assert r.status_code == 200, r.text
    portal = r.json()

    assert portal["projeto"]["codigo"] == auditavel.projeto.codigo
    assert portal["painel"] is not None
    linha = portal["painel"][0]

    # `co` vem desligada por padrão: o nome do projetista não sai.
    assert "projetista" not in linha
    assert "codigo" in linha and "aprovacao_pct" in linha

    # `relatorio` também vem desligado por padrão.
    assert portal["relatorio"] is None
    assert portal["avanco"] is not None


def test_portal_mostra_projetista_quando_liberado(
    autenticado: TestClient, client: TestClient, auditavel: CenarioAuditavel
) -> None:
    convite = autenticado.post(
        f"{API}/projetos/{auditavel.projeto.id}/convites", json={}
    ).json()
    autenticado.patch(f"{API}/convites/{convite['id']}", json={"colunas": {"co": True}})

    portal = client.get(f"{API}/portal/{convite['token']}").json()
    assert "projetista" in portal["painel"][0]


def test_portal_esconde_secao_desligada(
    autenticado: TestClient, client: TestClient, auditavel: CenarioAuditavel
) -> None:
    convite = autenticado.post(
        f"{API}/projetos/{auditavel.projeto.id}/convites",
        json={"secoes": {"painel": False, "matriz": False}},
    ).json()

    portal = client.get(f"{API}/portal/{convite['token']}").json()
    assert portal["painel"] is None
    assert portal["matriz"] is None


def test_convite_revogado_some(
    autenticado: TestClient, client: TestClient, auditavel: CenarioAuditavel
) -> None:
    convite = autenticado.post(
        f"{API}/projetos/{auditavel.projeto.id}/convites", json={}
    ).json()
    assert client.get(f"{API}/portal/{convite['token']}").status_code == 200

    autenticado.post(f"{API}/convites/{convite['id']}/revogar")
    r = client.get(f"{API}/portal/{convite['token']}")
    assert r.status_code == 404
    # Mesma resposta de token inexistente: distinguir entregaria quais tokens
    # já existiram.
    assert r.json()["detail"] == client.get(f"{API}/portal/inexistente").json()["detail"]


def test_token_invalido_e_404(client: TestClient) -> None:
    assert client.get(f"{API}/portal/nao-existe-esse-token").status_code == 404


def test_criar_convite_exige_permissao(
    client: TestClient, auditavel: CenarioAuditavel
) -> None:
    r = client.post(
        f"{API}/projetos/{auditavel.projeto.id}/convites",
        json={},
        headers=auditavel.headers(papel=PapelUsuario.AUDITOR, permissoes=["ver_painel"]),
    )
    assert r.status_code == 403


# ======================================================== SP-406 · trilha
def test_trilha_registra_criacao_com_snapshot(
    autenticado: TestClient, auditavel: CenarioAuditavel
) -> None:
    criado = autenticado.post(
        f"{API}/apontamentos",
        json={"projeto_id": str(auditavel.projeto.id), "titulo": "Rastreie-me"},
    ).json()

    r = autenticado.get(
        f"{API}/trilha", params={"entidade": "apontamento", "entidade_id": criado["id"]}
    )
    assert r.status_code == 200, r.text
    linhas = r.json()["itens"]
    assert len(linhas) == 1
    assert linhas[0]["acao"] == "criou"
    assert linhas[0]["diff"]["titulo"] == "Rastreie-me"
    assert linhas[0]["usuario_id"] == str(auditavel.admin.id)


def test_trilha_registra_alteracao_com_de_para(
    autenticado: TestClient, auditavel: CenarioAuditavel
) -> None:
    criado = autenticado.post(
        f"{API}/apontamentos",
        json={"projeto_id": str(auditavel.projeto.id), "titulo": "Antes"},
    ).json()
    autenticado.patch(f"{API}/apontamentos/{criado['id']}", json={"titulo": "Depois"})

    linhas = autenticado.get(
        f"{API}/trilha",
        params={"entidade": "apontamento", "entidade_id": criado["id"], "acao": "alterou"},
    ).json()["itens"]

    assert len(linhas) == 1
    assert linhas[0]["diff"]["titulo"] == {"de": "Antes", "para": "Depois"}


def test_trilha_registra_remocao(
    autenticado: TestClient, auditavel: CenarioAuditavel
) -> None:
    criado = autenticado.post(
        f"{API}/apontamentos",
        json={"projeto_id": str(auditavel.projeto.id), "titulo": "Efêmero"},
    ).json()
    autenticado.delete(f"{API}/apontamentos/{criado['id']}")

    linhas = autenticado.get(
        f"{API}/trilha", params={"entidade_id": criado["id"], "acao": "removeu"}
    ).json()["itens"]
    assert len(linhas) == 1


def test_trilha_nunca_guarda_senha(
    autenticado: TestClient, auditavel: CenarioAuditavel, db: Session
) -> None:
    """A trilha não pode virar um lugar onde credencial vaza.

    O QUE NÃO VAZA É O VALOR. O nome do campo pode aparecer — e aparece, como
    `(oculto)`, quando `senha_hash` muda junto de outro campo: é assim que o log
    consegue dizer "esta alteração de cadastro também tocou a credencial". O ato
    tem de ser legível; o segredo, não. Enquanto a mudança inteira era
    descartada, redefinir senha não deixava rastro nenhum — ver
    `tests/test_autenticacao.py`.
    """
    # `.com.br`, e não `.test`: `UsuarioCreate.login` é `EmailStr`, e o
    # `email-validator` recusa TLD reservado. Com `@spbim.test` este POST
    # respondia 422 desde que o teste foi escrito, e ninguém via — a asserção
    # `assert linhas` já era satisfeita pelo admin que o fixture cria.
    resposta = autenticado.post(
        f"{API}/usuarios",
        json={
            "login": "rastreado@spbim.com.br",
            "senha": "uma-senha-bem-longa-mesmo-1",
            "papel": "auditor",
        },
    )
    assert resposta.status_code == 201, resposta.text
    criado = resposta.json()
    # Segundo caminho: UPDATE que toca a senha junto de outro campo, que é o
    # único em que o nome do campo entra no diff.
    usuario = db.get(Usuario, uuid.UUID(criado["id"]))
    assert usuario is not None
    usuario.senha_hash = hash_password("uma-segunda-senha-longa")
    usuario.nome = "Renomeado"
    db.commit()

    linhas = db.execute(
        select(TrilhaAuditoria).where(
            TrilhaAuditoria.org_id == auditavel.org.id, TrilhaAuditoria.entidade == "usuario"
        )
    ).scalars().all()

    assert linhas, "a criação de usuário tem de estar na trilha"
    for linha in linhas:
        texto = str(linha.diff)
        assert "uma-senha-bem-longa-mesmo-1" not in texto
        assert "uma-segunda-senha-longa" not in texto
        assert "$argon2" not in texto

    # E o UPDATE está lá, dizendo que a credencial foi tocada sem mostrá-la.
    alteracoes = [linha for linha in linhas if linha.acao == "alterou"]
    assert len(alteracoes) == 1
    diff = alteracoes[0].diff
    assert diff is not None
    assert diff["senha_hash"] == {"de": "(oculto)", "para": "(oculto)"}


def test_notificacao_nao_polui_a_trilha(
    autenticado: TestClient, auditavel: CenarioAuditavel, db: Session
) -> None:
    """Notificação é efeito, não ato — registrá-la encheria a trilha sem
    contar nada."""
    from app.services import penalidades as ledger

    ledger.avisar_erro(db, org_id=auditavel.org.id, mensagem="x", origem="y")
    db.commit()

    assert not db.execute(
        select(TrilhaAuditoria).where(TrilhaAuditoria.entidade == "notificacao")
    ).scalars().all()

    # A penalidade, essa sim, é ato e fica registrada.
    ledger.aplicar(db, org_id=auditavel.org.id, empresa_id=auditavel.empresa.id, motivo="m")
    db.commit()
    assert db.execute(
        select(TrilhaAuditoria).where(TrilhaAuditoria.entidade == "penalidade")
    ).scalars().all()


def test_trilha_exige_admin_cadastro(
    client: TestClient, auditavel: CenarioAuditavel
) -> None:
    r = client.get(
        f"{API}/trilha",
        headers=auditavel.headers(papel=PapelUsuario.AUDITOR, permissoes=["ver_painel"]),
    )
    assert r.status_code == 403


def test_trilha_segue_a_publicacao_de_round(
    autenticado: TestClient, auditavel: CenarioAuditavel
) -> None:
    """O ato mais sensível do fluxo tem de deixar rastro de quem assinou."""
    auditoria = _publicar_round(autenticado, auditavel.versao.id)

    linhas = autenticado.get(
        f"{API}/trilha", params={"entidade": "auditoria", "entidade_id": auditoria["id"]}
    ).json()["itens"]

    # Só as alterações: na criação o diff é um snapshot (`campo: valor`), e
    # na alteração é `campo: {de, para}`.
    publicacoes = [
        linha
        for linha in linhas
        if linha["acao"] == "alterou"
        and (linha["diff"] or {}).get("estado", {}).get("para") == "publicado"
    ]
    assert publicacoes, "a publicação do round não apareceu na trilha"
    assert publicacoes[0]["usuario_id"] == str(auditavel.admin.id)
    assert publicacoes[0]["diff"]["estado"]["de"] == "nao_publicado"


def test_diff_da_trilha_tem_formatos_distintos_por_acao(
    autenticado: TestClient, auditavel: CenarioAuditavel
) -> None:
    """Contrato do `diff`, que o frontend precisa conhecer:
    criação e remoção guardam o estado inteiro; alteração guarda de/para."""
    criado = autenticado.post(
        f"{API}/apontamentos",
        json={"projeto_id": str(auditavel.projeto.id), "titulo": "Formato"},
    ).json()
    autenticado.patch(f"{API}/apontamentos/{criado['id']}", json={"titulo": "Outro"})

    linhas = autenticado.get(
        f"{API}/trilha", params={"entidade_id": criado["id"]}
    ).json()["itens"]
    por_acao = {linha["acao"]: linha["diff"] for linha in linhas}

    assert isinstance(por_acao["criou"]["titulo"], str)
    assert set(por_acao["alterou"]["titulo"]) == {"de", "para"}


def test_limpeza_de_notificacoes_nao_afeta_o_teste(
    db: Session, auditavel: CenarioAuditavel
) -> None:
    """Guarda-corpo: o cenário precisa ficar limpo entre testes."""
    assert (
        db.execute(
            select(Notificacao).where(Notificacao.org_id == auditavel.org.id)
        ).scalars().all()
        == []
    )
