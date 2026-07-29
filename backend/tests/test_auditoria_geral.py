"""A auditoria geral como planilha: gabarito, coluna DIRECTION, abertura automática.

Três coisas que juntas fazem um modelo novo já ter onde ser auditado, e cada uma
protege uma decisão que é fácil desfazer sem perceber:

- O GABARITO acrescenta, nunca sobrescreve. Um projeto que ajustou a instrução
  de um item e depois clica em "aplicar gabarito" tem de manter o ajuste; a
  alternativa (reescrever com o texto de fábrica) apagaria trabalho calado.
- `comentario` e `direcao` são DUAS frases com papéis distintos — diagnóstico
  interno e orientação ao fornecedor. Cruzá-las na geração da NC mandaria o
  texto interno como se fosse instrução de correção.
- A auditoria geral nasce com a VERSÃO, nas duas rotas que criam versão. Se só
  a manual abrisse, o modelo que entra pelo ACC chegaria sem planilha.
"""

from __future__ import annotations

import uuid

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Auditoria, ChecklistItem, Criterio, ResultadoCheck
from app.models.enums import ChecklistTipo
from app.services.gabarito import GABARITO_GERAL
from tests.conftest import API, Cenario, CenarioAuditavel, requer_banco


def _aplicar(autenticado: TestClient, projeto_id: uuid.UUID, checklist: str = "geral"):
    return autenticado.post(
        f"{API}/checklists/{checklist}/gabarito", json={"projeto_id": str(projeto_id)}
    )


# ------------------------------------------------------------------- gabarito
@requer_banco
def test_gabarito_semeia_os_17_itens(autenticado: TestClient, cenario: Cenario) -> None:
    """Um projeto novo passa a ter a planilha inteira em uma chamada."""
    resp = _aplicar(autenticado, cenario.projeto.id)
    assert resp.status_code == 200, resp.text
    corpo = resp.json()

    assert len(corpo["itens"]) == len(GABARITO_GERAL) == 17
    assert len(corpo["criterios_criados"]) == 17
    assert corpo["criterios_reaproveitados"] == []

    # A ORDEM É A DA PLANILHA. Quem audita desce a coluna de cima para baixo;
    # entregar em outra ordem custaria a única memória muscular que a planilha
    # deixou.
    codigos = [i["criterio"]["codigo"] for i in corpo["itens"]]
    assert codigos == [i.codigo for i in GABARITO_GERAL]
    assert [i["ordem"] for i in corpo["itens"]] == list(range(1, 18))

    # A instrução da coluna oculta vem junto: é ela que diz COMO conferir.
    por_codigo = {i["criterio"]["codigo"]: i["criterio"] for i in corpo["itens"]}
    assert "nome do arquivo" in por_codigo["MODEL_NAME"]["instrucao"].lower()
    assert por_codigo["OVERLAPPED"]["instrucao"]


@requer_banco
def test_gabarito_e_idempotente(autenticado: TestClient, cenario: Cenario) -> None:
    """Clicar duas vezes não duplica — nem critério, nem linha do checklist."""
    assert _aplicar(autenticado, cenario.projeto.id).status_code == 200

    segunda = _aplicar(autenticado, cenario.projeto.id)
    assert segunda.status_code == 200, segunda.text
    corpo = segunda.json()

    assert corpo["criterios_criados"] == []
    assert len(corpo["criterios_reaproveitados"]) == 17
    assert corpo["itens_criados"] == []
    assert len(corpo["itens"]) == 17


@requer_banco
def test_gabarito_nao_sobrescreve_ajuste_do_projeto(
    autenticado: TestClient, cenario: Cenario, db: Session
) -> None:
    """O "modificável" do pedido: aplicado uma vez, o item é do projeto.

    Este é o teste que impede a "melhoria" mais tentadora — fazer o gabarito
    sincronizar o texto de fábrica — de entrar sem alguém decidir por ela.
    """
    assert _aplicar(autenticado, cenario.projeto.id).status_code == 200

    itens = autenticado.get(
        f"{API}/checklists/geral", params={"projeto_id": str(cenario.projeto.id)}
    ).json()["itens"]
    alvo = next(i for i in itens if i["criterio"]["codigo"] == "WORKSETS")

    ajustado = autenticado.patch(
        f"{API}/criterios/{alvo['criterio']['id']}",
        json={"nome_pt": "Worksets — padrão da CPQ", "instrucao": "Conferir contra a nossa lista."},
    )
    assert ajustado.status_code == 200, ajustado.text

    assert _aplicar(autenticado, cenario.projeto.id).status_code == 200

    depois = db.get(Criterio, uuid.UUID(alvo["criterio"]["id"]))
    db.refresh(depois)
    assert depois.nome_pt == "Worksets — padrão da CPQ"
    assert depois.instrucao == "Conferir contra a nossa lista."


@requer_banco
def test_gabarito_recusa_item_na_lixeira(
    autenticado: TestClient, cenario: Cenario
) -> None:
    """O UNIQUE vale sobre a linha invisível — e o erro cru não diria isso.

    Sem o cuidado de `gabarito._removidos`, aplicar o gabarito depois de alguém
    apagar um item morreria com "duplicate key" apontando para uma linha que a
    sessão jura não existir. Aqui ele responde 409 nomeando o código.
    """
    assert _aplicar(autenticado, cenario.projeto.id).status_code == 200

    itens = autenticado.get(
        f"{API}/checklists/geral", params={"projeto_id": str(cenario.projeto.id)}
    ).json()["itens"]
    alvo = next(i for i in itens if i["criterio"]["codigo"] == "SATELLITE")

    # Tirar do checklist primeiro: o critério não pode ser removido enquanto
    # estiver em uso, e é o vínculo que o usa.
    restantes = [
        {"criterio_id": i["criterio"]["id"], "ordem": i["ordem"]}
        for i in itens
        if i["criterio"]["codigo"] != "SATELLITE"
    ]
    trocado = autenticado.put(
        f"{API}/checklists/geral/itens",
        json={"projeto_id": str(cenario.projeto.id), "itens": restantes},
    )
    assert trocado.status_code == 200, trocado.text

    apagado = autenticado.delete(f"{API}/criterios/{alvo['criterio']['id']}")
    assert apagado.status_code in (200, 204), apagado.text

    conflito = _aplicar(autenticado, cenario.projeto.id)
    assert conflito.status_code == 409, conflito.text
    assert "SATELLITE" in conflito.json()["detail"]
    assert "lixeira" in conflito.json()["detail"].lower()


@requer_banco
def test_checklist_sem_gabarito_diz_o_que_tem(
    autenticado: TestClient, cenario: Cenario
) -> None:
    """422 e não 404: a rota existe, o gabarito é que não foi desenhado."""
    resp = _aplicar(autenticado, cenario.projeto.id, checklist="lod400")
    assert resp.status_code == 422, resp.text
    assert "geral" in resp.json()["detail"]


# --------------------------------------------------------- coluna DIRECTION
@requer_banco
def test_direcao_e_separada_do_comentario(
    autenticado: TestClient, auditavel: CenarioAuditavel
) -> None:
    """As duas frases da linha reprovada chegam e voltam intactas."""
    aberta = autenticado.post(
        f"{API}/versoes/{auditavel.versao.id}/auditar", json={"checklist": "geral"}
    )
    assert aberta.status_code in (200, 201), aberta.text
    corpo = aberta.json()
    auditoria_id = corpo[0]["id"] if isinstance(corpo, list) else corpo["id"]

    detalhe = autenticado.get(f"{API}/auditorias/{auditoria_id}").json()
    resultado = detalhe["resultados"][0]

    salvo = autenticado.patch(
        f"{API}/resultados/{resultado['id']}",
        json={
            "status": "reprovado",
            "comentario": "THERE ARE ELEMENTS IN DIFFERENT PHASES WITHIN THE MODEL.",
            "direcao": "PLEASE ENSURE ALL ELEMENTS ARE ALIGNED TO THE SAME PHASE.",
        },
    )
    assert salvo.status_code == 200, salvo.text
    assert salvo.json()["comentario"].startswith("THERE ARE ELEMENTS")
    assert salvo.json()["direcao"].startswith("PLEASE ENSURE")


@requer_banco
def test_nc_herda_as_duas_frases_nos_papeis_certos(
    autenticado: TestClient, auditavel: CenarioAuditavel
) -> None:
    """Diagnóstico vira descrição; orientação vira recomendação. Nunca cruzado.

    É a razão de a coluna existir: a NC que vai ao fornecedor tem de dizer o que
    fazer no campo de recomendação, não repetir o texto interno de diagnóstico.
    """
    aberta = autenticado.post(
        f"{API}/versoes/{auditavel.versao.id}/auditar", json={"checklist": "geral"}
    ).json()
    auditoria_id = aberta[0]["id"] if isinstance(aberta, list) else aberta["id"]
    resultado = autenticado.get(f"{API}/auditorias/{auditoria_id}").json()["resultados"][0]

    autenticado.patch(
        f"{API}/resultados/{resultado['id']}",
        json={
            "status": "reprovado",
            "comentario": "há links CAD no modelo",
            "direcao": "remova os arquivos vinculados",
        },
    )

    nc = autenticado.post(
        f"{API}/auditorias/{auditoria_id}/ncs", json={"resultado_id": resultado["id"]}
    )
    assert nc.status_code == 201, nc.text
    assert nc.json()["descricao"] == "há links CAD no modelo"
    assert nc.json()["recomendacao"] == "remova os arquivos vinculados"


@requer_banco
def test_texto_explicito_ganha_do_herdado(
    autenticado: TestClient, auditavel: CenarioAuditavel
) -> None:
    """Quem redigiu na hora de abrir a NC quis outra frase, não a da planilha."""
    aberta = autenticado.post(
        f"{API}/versoes/{auditavel.versao.id}/auditar", json={"checklist": "geral"}
    ).json()
    auditoria_id = aberta[0]["id"] if isinstance(aberta, list) else aberta["id"]
    resultado = autenticado.get(f"{API}/auditorias/{auditoria_id}").json()["resultados"][0]

    autenticado.patch(
        f"{API}/resultados/{resultado['id']}",
        json={"status": "reprovado", "comentario": "da planilha", "direcao": "da planilha"},
    )

    nc = autenticado.post(
        f"{API}/auditorias/{auditoria_id}/ncs",
        json={"resultado_id": resultado["id"], "recomendacao": "escrita na hora"},
    ).json()
    assert nc["descricao"] == "da planilha"       # não foi informada: herda
    assert nc["recomendacao"] == "escrita na hora"  # foi informada: ganha


# ------------------------------------------------- abertura com a versão
@requer_banco
def test_versao_nova_ja_nasce_com_a_planilha(
    autenticado: TestClient, auditavel: CenarioAuditavel, db: Session
) -> None:
    """O pedido literal: criar o modelo já dá onde lançar os dados.

    Antes disto era preciso clicar "Abrir auditorias" — e um modelo recém-criado
    não tinha lugar nenhum para receber a auditoria.
    """
    criada = autenticado.post(
        f"{API}/modelos/{auditavel.modelo.id}/versoes",
        json={"versao": "V2", "formato": "ifc"},
    )
    assert criada.status_code == 201, criada.text
    versao_id = uuid.UUID(criada.json()["id"])

    auditorias = (
        db.query(Auditoria)
        .filter(Auditoria.versao_id == versao_id, Auditoria.checklist == ChecklistTipo.GERAL)
        .all()
    )
    assert len(auditorias) == 1, "a geral tinha de estar aberta sem ninguém pedir"

    # E ela nasce com as linhas materializadas — planilha em branco, não vazia.
    resultados = (
        db.query(ResultadoCheck).filter(ResultadoCheck.auditoria_id == auditorias[0].id).count()
    )
    esperado = (
        db.query(ChecklistItem)
        .filter(
            ChecklistItem.projeto_id == auditavel.projeto.id,
            ChecklistItem.checklist == ChecklistTipo.GERAL,
        )
        .count()
    )
    assert resultados == esperado > 0

    # Só a GERAL: os recortes de LOD e o 4D são trabalho dirigido.
    outras = (
        db.query(Auditoria)
        .filter(Auditoria.versao_id == versao_id, Auditoria.checklist != ChecklistTipo.GERAL)
        .count()
    )
    assert outras == 0


@requer_banco
def test_sem_geral_na_disciplina_nao_abre_nada(
    autenticado: TestClient, auditavel: CenarioAuditavel, db: Session
) -> None:
    """A disciplina continua mandando: quem não audita geral não ganha planilha."""
    alterada = autenticado.patch(
        f"{API}/disciplinas/{auditavel.disciplina.id}", json={"checklists": ["lod400"]}
    )
    assert alterada.status_code == 200, alterada.text

    criada = autenticado.post(
        f"{API}/modelos/{auditavel.modelo.id}/versoes",
        json={"versao": "V3", "formato": "ifc"},
    )
    assert criada.status_code == 201, criada.text

    assert (
        db.query(Auditoria).filter(Auditoria.versao_id == uuid.UUID(criada.json()["id"])).count()
        == 0
    )


@requer_banco
def test_abrir_de_novo_nao_cria_round_a_mais(
    autenticado: TestClient, auditavel: CenarioAuditavel, db: Session
) -> None:
    """"Abrir auditorias" depois da abertura automática tem de ser inócuo.

    `abrir_auditoria` é idempotente, e é isso que faz o botão continuar
    existindo para os outros checklists sem duplicar a geral.
    """
    criada = autenticado.post(
        f"{API}/modelos/{auditavel.modelo.id}/versoes",
        json={"versao": "V4", "formato": "ifc"},
    ).json()

    autenticado.post(f"{API}/versoes/{criada['id']}/auditar", json={})

    geral = (
        db.query(Auditoria)
        .filter(
            Auditoria.versao_id == uuid.UUID(criada["id"]),
            Auditoria.checklist == ChecklistTipo.GERAL,
        )
        .all()
    )
    assert len(geral) == 1
