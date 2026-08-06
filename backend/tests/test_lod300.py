"""O gabarito do LOD 300 e as três colunas da planilha de espec.

O que se protege aqui:

- O gabarito de LOD é POR DISCIPLINA, e omitir a disciplina tem de FALHAR. Se
  ele escolhesse uma, semear STRC num projeto de arquitetura criaria 60
  critérios de estrutura que ninguém pediu — e desfazê-los é trabalho manual.
- "Geometric Data" NÃO vira `parametro_esperado`. O arquivo escreve isso na
  coluna REVIT PARAMETER de três linhas, e é o modo dele dizer "aqui se audita
  geometria". Como `parametro_esperado`, o verificador do executor procuraria um
  parâmetro com esse nome, não acharia em modelo nenhum e reprovaria todos.
- As duas colunas de parâmetro são RESPOSTA, e o esperado é GABARITO. São campos
  diferentes porque a única pergunta da planilha é a comparação entre eles.
"""

from __future__ import annotations

import uuid

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Criterio
from app.models.enums import Automacao, ChecklistTipo, CriterioNivel
from app.services import gabarito
from app.services.auditoria import CHECKLISTS_POR_AREA
from app.services.gabarito_lod import GABARITOS_LOD
from tests.conftest import API, Cenario, CenarioAuditavel, requer_banco


def _aplicar(
    autenticado: TestClient,
    projeto_id: uuid.UUID,
    *,
    checklist: str = "lod300",
    disciplina: str | None = "STRC",
):
    corpo: dict = {"projeto_id": str(projeto_id)}
    if disciplina is not None:
        corpo["disciplina"] = disciplina
    return autenticado.post(f"{API}/checklists/{checklist}/gabarito", json=corpo)


# --------------------------------------------------------- o gabarito em si
def test_gabarito_espelha_o_arquivo_de_referencia() -> None:
    """60 linhas em 4 categorias — sem banco, é conferência da tabela.

    Os números saem da aba `STRC` de `Spec Audit LOD300_STRC`: 16 linhas para
    FLOOR, 12 para STRUCTURAL COLUMNS, 16 para FOUNDATIONS e 16 para FRAMING.
    """
    elementos = GABARITOS_LOD["STRC"]
    assert [len(e.itens) for e in elementos] == [16, 12, 16, 16]

    itens = gabarito._lod_para(ChecklistTipo.LOD300, "STRC")
    assert len(itens) == 60
    assert len({i.codigo for i in itens}) == 60, "código repetido colidiria no UNIQUE"

    # Toda linha de LOD é de nível ELEMENTO: a pergunta é sobre os elementos da
    # categoria, não sobre o arquivo.
    assert all(i.nivel is CriterioNivel.ELEMENTO for i in itens)
    assert all(i.min_lod == "300" for i in itens)


def test_geometric_data_nao_vira_parametro_esperado() -> None:
    """A armadilha que reprovaria todo modelo correto.

    `parametro_esperado` é o que torna um critério automatizável
    (`services/automacao/executor.py`). "Geometric Data" não é nome de
    parâmetro do Revit — é o rótulo que a planilha usa para dizer "isto é
    geometria". Automatizar essas linhas produziria falso negativo em massa.
    """
    itens = gabarito._lod_para(ChecklistTipo.LOD300, "STRC")
    assert not any(i.parametro_esperado == "Geometric Data" for i in itens)

    # E a regra que sustenta isso: automático se e somente se há built-in.
    for i in itens:
        esperado = Automacao.AUTO if i.parametro_esperado else Automacao.MANUAL
        assert i.automacao is esperado, i.codigo


def test_o_mesmo_nome_em_categorias_diferentes_e_criterio_diferente() -> None:
    """"Level" na laje é `Level`; no pilar é `Base Level`.

    Um critério compartilhado entre as categorias teria de escolher um dos dois
    mapeamentos, e estaria errado na metade das linhas. É o oposto da política
    da biblioteca — lá o critério canônico é reusado de propósito —, e a
    diferença é que ali o mesmo texto significa a mesma coisa.
    """
    por_codigo = {i.codigo: i for i in gabarito._lod_para(ChecklistTipo.LOD300, "STRC")}
    assert por_codigo["LOD300_FLOOR_LEVEL"].parametro_esperado == "Level"
    assert por_codigo["LOD300_COLUMN_LEVEL"].parametro_esperado == "Base Level"
    assert por_codigo["LOD300_FLOOR_WIDTH"].parametro_esperado is None
    assert por_codigo["LOD300_COLUMN_WIDTH"].parametro_esperado == "b"


# ------------------------------------------------------------------- a API
@requer_banco
def test_semeia_as_60_linhas(autenticado: TestClient, cenario: Cenario) -> None:
    resp = _aplicar(autenticado, cenario.projeto.id)
    assert resp.status_code == 200, resp.text
    corpo = resp.json()

    assert len(corpo["itens"]) == 60
    assert len(corpo["criterios_criados"]) == 60
    assert [i["ordem"] for i in corpo["itens"]] == list(range(1, 61))

    # As categorias agrupam a tela, e vêm na ordem do arquivo.
    categorias: list[str] = []
    for i in corpo["itens"]:
        c = i["criterio"]["categoria"]
        if c not in categorias:
            categorias.append(c)
    assert len(categorias) == 4
    assert categorias[0].endswith("Floor")

    # A BIM FORUM DESCRIPTION é CRITÉRIO DE ACEITAÇÃO, não instrução: ela diz o
    # que faz passar, não como olhar. Na geral é o contrário.
    familia = next(i for i in corpo["itens"] if i["criterio"]["codigo"] == "LOD300_FLOOR_FAMILY")
    assert "graphically represented" in familia["criterio"]["criterio_aceitacao"]
    assert not familia["criterio"]["instrucao"]


@requer_banco
def test_sem_disciplina_falha_em_vez_de_escolher(
    autenticado: TestClient, cenario: Cenario
) -> None:
    """Semear a lista errada em silêncio é pior do que recusar."""
    resp = _aplicar(autenticado, cenario.projeto.id, disciplina=None)
    assert resp.status_code == 422, resp.text
    assert "disciplina" in resp.json()["detail"].lower()
    assert "STRC" in resp.json()["detail"]


@requer_banco
def test_disciplina_sem_arquivo_diz_quais_existem(
    autenticado: TestClient, cenario: Cenario
) -> None:
    resp = _aplicar(autenticado, cenario.projeto.id, disciplina="ARCH")
    assert resp.status_code == 422, resp.text
    assert "ARCH" in resp.json()["detail"]
    assert "STRC" in resp.json()["detail"]


@requer_banco
def test_e_idempotente(autenticado: TestClient, cenario: Cenario) -> None:
    assert _aplicar(autenticado, cenario.projeto.id).status_code == 200
    segunda = _aplicar(autenticado, cenario.projeto.id)
    assert segunda.status_code == 200, segunda.text
    assert segunda.json()["criterios_criados"] == []
    assert len(segunda.json()["itens"]) == 60


@requer_banco
def test_a_geral_ignora_a_disciplina(autenticado: TestClient, cenario: Cenario) -> None:
    """Os 17 da geral são os mesmos nas oito disciplinas — mandar uma não muda
    nada, e recusar por causa dela seria exigir informação que não é usada."""
    resp = _aplicar(autenticado, cenario.projeto.id, checklist="geral", disciplina="STRC")
    assert resp.status_code == 200, resp.text
    assert len(resp.json()["itens"]) == 17


@requer_banco
def test_gabarito_lod_nao_sobrescreve_ajuste(
    autenticado: TestClient, cenario: Cenario, db: Session
) -> None:
    assert _aplicar(autenticado, cenario.projeto.id).status_code == 200

    itens = autenticado.get(
        f"{API}/checklists/lod300", params={"projeto_id": str(cenario.projeto.id)}
    ).json()["itens"]
    alvo = next(i for i in itens if i["criterio"]["codigo"] == "LOD300_COLUMN_WIDTH")

    autenticado.patch(
        f"{API}/criterios/{alvo['criterio']['id']}",
        json={"parametro_esperado": "LARGURA_PILAR"},
    )
    assert _aplicar(autenticado, cenario.projeto.id).status_code == 200

    depois = db.get(Criterio, uuid.UUID(alvo["criterio"]["id"]))
    db.refresh(depois)
    assert depois.parametro_esperado == "LARGURA_PILAR"


# ------------------------------------------- as três colunas da migration 0009
@requer_banco
def test_colunas_da_planilha_de_lod(
    autenticado: TestClient, auditavel: CenarioAuditavel
) -> None:
    """Onde a informação FOI encontrada, e o comentário de quem tem outro autor.

    A auditoria aqui é a geral (é o que o cenário monta), mas as colunas são da
    linha — valem em qualquer recorte, e é a planilha de LOD que as usa.
    """
    aberta = autenticado.post(
        f"{API}/versoes/{auditavel.versao.id}/auditar", json={"checklist": "geral"}
    ).json()
    auditoria_id = aberta[0]["id"] if isinstance(aberta, list) else aberta["id"]
    resultado = autenticado.get(f"{API}/auditorias/{auditoria_id}").json()["resultados"][0]

    salvo = autenticado.patch(
        f"{API}/resultados/{resultado['id']}",
        json={
            "parametro_revit": "Depth",
            "parametro_encontrado": "ESPESSURA_LAJE",
            "comentario_fornecedor": 'A informação "Thickness" está no built-in "Depth".',
        },
    )
    assert salvo.status_code == 200, salvo.text
    corpo = salvo.json()
    assert corpo["parametro_revit"] == "Depth"
    assert corpo["parametro_encontrado"] == "ESPESSURA_LAJE"
    assert corpo["comentario_fornecedor"].startswith("A informação")

    # E elas são INDEPENDENTES do comentário da coordenação: autores
    # diferentes, campos diferentes. Gravar um não pode apagar o outro.
    autenticado.patch(
        f"{API}/resultados/{resultado['id']}", json={"comentario": "parâmetro em português"}
    )
    depois = autenticado.get(f"{API}/auditorias/{auditoria_id}").json()["resultados"]
    linha = next(r for r in depois if r["id"] == resultado["id"])
    assert linha["comentario"] == "parâmetro em português"
    assert linha["comentario_fornecedor"].startswith("A informação")


# ------------------------------------------------------------- a coluna LOD
@requer_banco
def test_a_coluna_lod_chega_ao_detalhe(
    autenticado: TestClient, auditavel: CenarioAuditavel, db: Session
) -> None:
    """A coluna LOD da planilha vem de `checklist_item`, e tem de CHEGAR à tela.

    Ela não é do resultado nem do critério: o mesmo critério pode ser exigido em
    LOD diferente conforme o checklist, e é para isso que a tabela de junção
    existe. Antes de 04/08/2026 o `ResultadoOut` não a expunha — o dado estava no
    banco e a planilha não tinha como desenhá-lo.

    O teste existe porque a ligação é um JOIN dentro de `_carregar_detalhe`, e um
    JOIN é exatamente o tipo de coisa que se perde numa refatoração sem que nada
    quebre: a coluna volta a sair vazia e a tela continua montando.
    """
    assert _aplicar(autenticado, auditavel.projeto.id).status_code == 200

    # A disciplina do cenário declara só a geral; sem o LOD 300 aqui não há o que
    # abrir. É cadastro do cenário, não regra sob teste.
    auditavel.disciplina.checklists = [ChecklistTipo.GERAL, ChecklistTipo.LOD300]
    db.flush()

    aberta = autenticado.post(
        f"{API}/versoes/{auditavel.versao.id}/auditar", json={"checklist": "lod300"}
    )
    assert aberta.status_code in (200, 201), aberta.text
    corpo = aberta.json()
    auditoria_id = corpo[0]["id"] if isinstance(corpo, list) else corpo["id"]

    resultados = autenticado.get(f"{API}/auditorias/{auditoria_id}").json()["resultados"]
    assert resultados, "a auditoria de LOD 300 abriu sem linhas"
    # `min_lod` do gabarito de LOD é "300" em todas as 60 linhas.
    assert {r["min_lod"] for r in resultados} == {"300"}


def test_lod300_e_por_area() -> None:
    """O LOD 300 entrou em `CHECKLISTS_POR_AREA` (05/08/2026, a pedido).

    Ele estava de fora por leitura do PDF de espec, que é organizado por
    ELEMENTO. O que decidiu foi o outro arquivo: o
    `Bases/LOD300_SPECIFIC AUDIT_CONTROL.xlsx` tem SEIS abas de área — ADMN,
    COLO1..COLO4 e SITE —, exatamente como os controles de 400 e 500. A
    coordenação acompanha os três LOD do mesmo jeito.

    Não precisa de banco: é sobre a constante.
    """
    assert ChecklistTipo.LOD300 in CHECKLISTS_POR_AREA
    # E os outros dois continuam lá — a mudança ACRESCENTA.
    assert {ChecklistTipo.LOD400, ChecklistTipo.LOD500} <= CHECKLISTS_POR_AREA
    # Geral e 4D seguem FORA: são do arquivo inteiro, não de um setor dele.
    assert ChecklistTipo.GERAL not in CHECKLISTS_POR_AREA
    assert ChecklistTipo.QUATRO_D not in CHECKLISTS_POR_AREA


@requer_banco
def test_lod300_abre_uma_auditoria_por_area(
    autenticado: TestClient, auditavel: CenarioAuditavel
) -> None:
    """`POST /auditar` passa a criar UMA auditoria por área da disciplina.

    É o que faz as abas do painel terem conteúdo — sem isto elas nunca
    apareceriam, porque a lista de áreas sai das auditorias que existem.
    """
    autenticado.patch(
        f"{API}/disciplinas/{auditavel.disciplina.id}", json={"checklists": ["lod300"]}
    )
    r = autenticado.post(
        f"{API}/versoes/{auditavel.versao.id}/auditar", json={"checklist": "lod300"}
    )
    assert r.status_code in (200, 201), r.text

    corpo = r.json()
    abertas = corpo if isinstance(corpo, list) else [corpo]
    # O cenário declara ADMIN e COLO1 — uma auditoria para cada.
    assert {a["area"] for a in abertas} == {"ADMIN", "COLO1"}


@requer_banco
def test_as_abas_saem_da_disciplina_e_nao_das_auditorias(
    autenticado: TestClient, auditavel: CenarioAuditavel
) -> None:
    """`disciplina_areas` é o ESCOPO DECLARADO, não o trabalho já feito.

    ESTE É O BECO SEM SAÍDA QUE ELE ABRE. Derivadas das auditorias que existem,
    as abas só apareceriam depois de alguém abrir uma em cada área — e não
    haveria por onde abrir a primeira, porque é a aba que leva até ela. Foi
    exatamente o que aconteceu em 05/08/2026: o LOD 300 virou por área, as
    auditorias anteriores tinham `area` nula, a fileira saiu vazia e a tela
    ficou sem caminho para a divisão que acabara de ganhar.

    A PROVA ESTÁ NA COMBINAÇÃO DAS DUAS ASSERÇÕES, e não em cada uma: abre-se a
    GERAL, que nunca tem área, e o painel mesmo assim conhece ADMIN e COLO1. Uma
    lista montada a partir das auditorias sairia vazia aqui.

    E ele guarda um JOIN, que é o tipo de coisa que se perde numa refatoração sem
    que nada quebre — a mesma razão do teste do `min_lod` acima. `Disciplina.areas`
    entra no mesmo select que já traz código, nome e macro; tirá-lo de lá não
    derruba requisição nenhuma, só devolve as abas ao vazio.
    """
    aberta = autenticado.post(
        f"{API}/versoes/{auditavel.versao.id}/auditar", json={"checklist": "geral"}
    )
    assert aberta.status_code in (200, 201), aberta.text

    lista = autenticado.get(f"{API}/projetos/{auditavel.projeto.id}/auditorias").json()
    assert lista, "sem linha nenhuma o painel não desenha nada — o cenário não auditou"

    assert {a["area"] for a in lista} == {None}
    assert all(a["disciplina_areas"] == ["ADMIN", "COLO1"] for a in lista)


@requer_banco
def test_a_versao_nao_abre_auditoria_de_lod(
    autenticado: TestClient, auditavel: CenarioAuditavel
) -> None:
    """Versão nova abre a GERAL e só ela, mesmo com o LOD 300 declarado.

    Estava em prosa e em nada mais. `ao_registrar_versao` filtra por
    `ChecklistTipo.GERAL`, e trocar aquele filtro pela lista da disciplina é uma
    linha — a "melhoria" tentadora de abrir tudo o que o modelo declara.

    O QUE ISSO CUSTARIA: LOD é trabalho dirigido, e o LOD 300 passou a abrir UMA
    AUDITORIA POR ÁREA. Com seis áreas e os cinco recortes declarados, cada
    versão registrada encheria o painel de vinte rounds em branco que ninguém
    pediu — e cada um deles é uma linha de matriz e uma entrada de KPI dizendo
    "não publicado". A porta do LOD é o "+" do painel, que também registra
    responsável, datas e prioridade.
    """
    autenticado.patch(
        f"{API}/disciplinas/{auditavel.disciplina.id}",
        json={"checklists": ["geral", "lod300"]},
    )

    nova = autenticado.post(
        f"{API}/modelos/{auditavel.modelo.id}/versoes", json={"versao": "V9", "formato": "ifc"}
    )
    assert nova.status_code in (200, 201), nova.text

    abertas = autenticado.get(f"{API}/versoes/{nova.json()['id']}/auditorias").json()
    assert [a["checklist"] for a in abertas] == ["geral"], (
        "a versão abriu recorte de LOD sozinha — só a geral nasce com ela"
    )
