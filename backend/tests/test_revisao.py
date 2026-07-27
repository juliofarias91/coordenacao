"""Regressões encontradas na revisão do código.

Cada teste aqui nasceu de um defeito real, não de uma hipótese. Ficam
separados dos testes de fase para não se perderem entre os que descrevem
funcionalidade.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Auditoria, VersaoModelo
from app.models.enums import ChecklistTipo, VersaoFormato
from tests.conftest import API, CenarioAuditavel, requer_banco, requer_storage

pytestmark = requer_banco


# ==========================================================================
# 1 · O portal vazava pela matriz o que a coluna desligada escondia
# ==========================================================================
def test_matriz_do_portal_respeita_a_visibilidade_por_coluna(
    autenticado: TestClient, client: TestClient, auditavel: CenarioAuditavel
) -> None:
    """O painel filtra campo a campo; a matriz passava a linha inteira.

    Com `code`, `disc` e `ver` desligados, o cliente não devia ver o código do
    modelo, a disciplina nem a versão — e via, pela matriz.
    """
    autenticado.patch(
        f"{API}/disciplinas/{auditavel.disciplina.id}", json={"checklists": ["lod500"]}
    )
    autenticado.post(
        f"{API}/versoes/{auditavel.versao.id}/auditar",
        json={"checklist": "lod500", "area": "ADMIN"},
    )

    convite = autenticado.post(
        f"{API}/projetos/{auditavel.projeto.id}/convites",
        json={
            "secoes": {"painel": True, "matriz": True},
            "colunas": {"code": False, "disc": False, "ver": False, "appr": True},
        },
    ).json()

    portal = client.get(f"{API}/portal/{convite['token']}").json()

    # O painel já respeitava.
    assert portal["painel"] and "codigo" not in portal["painel"][0]

    linhas = portal["matriz"]["linhas"]
    assert linhas, "a matriz precisa ter linha para o teste valer"
    vazados = {
        campo
        for linha in linhas
        for campo in ("codigo", "disciplina_codigo", "versao")
        if campo in linha
    }
    assert not vazados, f"a matriz vazou campos desligados no convite: {vazados}"

    # E o que foi liberado continua chegando: a matriz sem célula não serve.
    assert "celulas" in linhas[0]


def test_matriz_do_portal_mostra_o_que_foi_liberado(
    autenticado: TestClient, client: TestClient, auditavel: CenarioAuditavel
) -> None:
    autenticado.patch(
        f"{API}/disciplinas/{auditavel.disciplina.id}", json={"checklists": ["lod500"]}
    )
    autenticado.post(
        f"{API}/versoes/{auditavel.versao.id}/auditar",
        json={"checklist": "lod500", "area": "ADMIN"},
    )
    convite = autenticado.post(
        f"{API}/projetos/{auditavel.projeto.id}/convites",
        json={"colunas": {"code": True, "disc": True, "ver": True}},
    ).json()

    linha = client.get(f"{API}/portal/{convite['token']}").json()["matriz"]["linhas"][0]
    assert linha["codigo"] == auditavel.modelo.codigo
    assert linha["disciplina_codigo"] == "STRC-STEEL"
    assert linha["versao"] == "V1"


# ==========================================================================
# 2 · Nada impedia duas auditorias para a mesma versão e checklist
# ==========================================================================
def test_banco_recusa_auditoria_duplicada(
    autenticado: TestClient, auditavel: CenarioAuditavel, db: Session
) -> None:
    """`abrir_auditoria` conferia antes de inserir, mas sem trava no banco:
    duas chamadas concorrentes criavam dois rounds para a mesma versão, e o
    painel passava a escolher um deles arbitrariamente.
    """
    auditoria = autenticado.post(
        f"{API}/versoes/{auditavel.versao.id}/auditar", json={"checklist": "geral"}
    ).json()[0]
    assert auditoria["id"]

    # Insere direto, contornando a checagem de aplicação — é o que duas
    # requisições simultâneas fariam.
    db.add(
        Auditoria(
            org_id=auditavel.org.id,
            versao_id=auditavel.versao.id,
            checklist=ChecklistTipo.GERAL,
            area=None,
            round=1,
        )
    )
    with pytest.raises(IntegrityError):
        db.flush()
    db.rollback()


def test_auditorias_de_areas_diferentes_convivem(
    autenticado: TestClient, auditavel: CenarioAuditavel
) -> None:
    """A trava é por (versão, checklist, área): o LOD 500 audita a mesma
    versão uma vez por área, e isso tem de continuar valendo."""
    autenticado.patch(
        f"{API}/disciplinas/{auditavel.disciplina.id}", json={"checklists": ["lod500"]}
    )
    for area in ("ADMIN", "COLO1"):
        r = autenticado.post(
            f"{API}/versoes/{auditavel.versao.id}/auditar",
            json={"checklist": "lod500", "area": area},
        )
        assert r.status_code == 201, r.text

    auditorias = autenticado.get(f"{API}/versoes/{auditavel.versao.id}/auditorias").json()
    assert sorted(a["area"] for a in auditorias) == ["ADMIN", "COLO1"]


# ==========================================================================
# 3 · Round publicado congelava o resultado, mas não a evidência
# ==========================================================================
@requer_storage
def test_round_publicado_nao_aceita_evidencia(
    autenticado: TestClient, auditavel: CenarioAuditavel
) -> None:
    """O relatório em PDF renderiza a evidência. Anexar depois de publicar
    mudava, em silêncio, o que um round fechado diz."""
    auditoria = autenticado.post(
        f"{API}/versoes/{auditavel.versao.id}/auditar", json={"checklist": "geral"}
    ).json()[0]
    detalhe = autenticado.get(f"{API}/auditorias/{auditoria['id']}").json()
    for resultado in detalhe["resultados"]:
        autenticado.patch(f"{API}/resultados/{resultado['id']}", json={"status": "aprovado"})
    autenticado.post(f"{API}/auditorias/{auditoria['id']}/publicar")

    alvo = detalhe["resultados"][0]
    png = bytes.fromhex(
        "89504e470d0a1a0a0000000d494844520000000100000001080600000"
        "01f15c4890000000a49444154789c630001000005000100"
        "0d0a2db40000000049454e44ae426082"
    )
    r = autenticado.post(
        f"{API}/resultados/{alvo['id']}/evidencias",
        files={"arquivo": ("depois.png", png, "image/png")},
    )
    assert r.status_code == 409, r.text
    assert "publicada" in r.json()["detail"]


@requer_storage
def test_round_publicado_nao_aceita_remocao_de_evidencia(
    autenticado: TestClient, auditavel: CenarioAuditavel
) -> None:
    auditoria = autenticado.post(
        f"{API}/versoes/{auditavel.versao.id}/auditar", json={"checklist": "geral"}
    ).json()[0]
    detalhe = autenticado.get(f"{API}/auditorias/{auditoria['id']}").json()
    alvo = detalhe["resultados"][0]

    png = bytes.fromhex(
        "89504e470d0a1a0a0000000d494844520000000100000001080600000"
        "01f15c4890000000a49444154789c630001000005000100"
        "0d0a2db40000000049454e44ae426082"
    )
    evidencia = autenticado.post(
        f"{API}/resultados/{alvo['id']}/evidencias",
        files={"arquivo": ("antes.png", png, "image/png")},
    ).json()

    for resultado in detalhe["resultados"]:
        autenticado.patch(f"{API}/resultados/{resultado['id']}", json={"status": "aprovado"})
    autenticado.post(f"{API}/auditorias/{auditoria['id']}/publicar")

    r = autenticado.delete(f"{API}/evidencias/{evidencia['id']}")
    assert r.status_code == 409


# ==========================================================================
# 4 · A versão vigente empatava quando duas nasciam na mesma transação
# ==========================================================================
def test_versao_vigente_e_deterministica_com_created_at_igual(
    autenticado: TestClient, auditavel: CenarioAuditavel, db: Session
) -> None:
    """`now()` no Postgres é o instante da transação, não do INSERT: duas
    versões criadas juntas ficam com `created_at` idêntico, e a ordenação
    por data sozinha escolhia qualquer uma das duas.
    """
    momento = db.execute(select(text("now()"))).scalar_one()
    for rotulo in ("V2", "V3"):
        db.add(
            VersaoModelo(
                org_id=auditavel.org.id,
                modelo_id=auditavel.modelo.id,
                versao=rotulo,
                formato=VersaoFormato.IFC,
                created_at=momento,
            )
        )
    db.commit()

    vistas = {
        autenticado.get(f"{API}/projetos/{auditavel.projeto.id}/painel").json()["linhas"][0][
            "versao"
        ]
        for _ in range(5)
    }
    assert len(vistas) == 1, f"a versão vigente oscilou entre consultas: {vistas}"
