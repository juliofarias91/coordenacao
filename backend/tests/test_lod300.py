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
