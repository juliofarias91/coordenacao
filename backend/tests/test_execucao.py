"""Fase 2 · execução da auditoria (SP-202 a SP-207).

O foco está nas regras que não são óbvias no schema: N/A fora do denominador,
round bloqueado com pendentes, versão nova desatualizando o round anterior, e
o painel saindo de consulta em vez de tabela.
"""

from __future__ import annotations

import io

from fastapi.testclient import TestClient

from tests.conftest import API, CenarioAuditavel, requer_banco

pytestmark = requer_banco


def _auditar(client: TestClient, versao_id) -> dict:
    r = client.post(f"{API}/versoes/{versao_id}/auditar", json={})
    assert r.status_code == 201, r.text
    return r.json()[0]


def _detalhe(client: TestClient, auditoria_id) -> dict:
    r = client.get(f"{API}/auditorias/{auditoria_id}")
    assert r.status_code == 200, r.text
    return r.json()


def _marcar(client: TestClient, resultado_id, status: str) -> dict:
    r = client.patch(f"{API}/resultados/{resultado_id}", json={"status": status})
    assert r.status_code == 200, r.text
    return r.json()


# ------------------------------------------------------- SP-202 · modelos
def test_criar_versao_e_registrar_arquivo(
    autenticado: TestClient, auditavel: CenarioAuditavel
) -> None:
    r = autenticado.post(
        f"{API}/modelos/{auditavel.modelo.id}/versoes",
        json={"versao": "v2", "formato": "ifc", "autoria": "Tekla→IFC"},
    )
    assert r.status_code == 201, r.text
    assert r.json()["versao"] == "V2", "o rótulo é normalizado em maiúsculas"


def test_versao_duplicada_e_recusada(
    autenticado: TestClient, auditavel: CenarioAuditavel
) -> None:
    r = autenticado.post(
        f"{API}/modelos/{auditavel.modelo.id}/versoes",
        json={"versao": "V1", "formato": "ifc"},
    )
    assert r.status_code == 409


def test_upload_recusa_formato_divergente_do_registro(
    autenticado: TestClient, auditavel: CenarioAuditavel
) -> None:
    """Versão registrada como IFC não aceita um .rvt: o formato decide qual
    worker de automação roda na Fase 3."""
    r = autenticado.post(
        f"{API}/versoes/{auditavel.versao.id}/upload",
        files={"arquivo": ("modelo.rvt", io.BytesIO(b"conteudo"), "application/octet-stream")},
    )
    assert r.status_code == 409
    assert "revit" in r.json()["detail"]


def test_upload_recusa_extensao_nao_auditada(
    autenticado: TestClient, auditavel: CenarioAuditavel
) -> None:
    r = autenticado.post(
        f"{API}/versoes/{auditavel.versao.id}/upload",
        files={"arquivo": ("planilha.xlsx", io.BytesIO(b"x"), "application/octet-stream")},
    )
    assert r.status_code == 415


# ---------------------------------------------------- SP-203 · abrir/editar
def test_abrir_auditoria_materializa_o_checklist(
    autenticado: TestClient, auditavel: CenarioAuditavel
) -> None:
    """CA: abrir a versão mostra as abas conforme a disciplina."""
    auditorias = autenticado.post(
        f"{API}/versoes/{auditavel.versao.id}/auditar", json={}
    ).json()
    assert [a["checklist"] for a in auditorias] == ["geral"], "só o checklist da disciplina"

    detalhe = _detalhe(autenticado, auditorias[0]["id"])
    assert len(detalhe["resultados"]) == len(auditavel.criterios)
    assert all(r["status"] == "pendente" for r in detalhe["resultados"])
    assert detalhe["pendentes"] == len(auditavel.criterios)
    assert detalhe["round"] == 1


def test_abrir_de_novo_nao_duplica_o_round(
    autenticado: TestClient, auditavel: CenarioAuditavel
) -> None:
    primeira = _auditar(autenticado, auditavel.versao.id)
    segunda = _auditar(autenticado, auditavel.versao.id)
    assert primeira["id"] == segunda["id"]
    assert segunda["round"] == 1


def test_disciplina_sem_checklist_nao_abre_auditoria(
    autenticado: TestClient, auditavel: CenarioAuditavel
) -> None:
    autenticado.patch(f"{API}/disciplinas/{auditavel.disciplina.id}", json={"checklists": []})
    r = autenticado.post(f"{API}/versoes/{auditavel.versao.id}/auditar", json={})
    assert r.status_code == 409
    assert "checklist" in r.json()["detail"]


def test_aprovacao_ignora_os_na(autenticado: TestClient, auditavel: CenarioAuditavel) -> None:
    """A regra central do cálculo: N/A sai do denominador.

    Com 4 itens — 2 aprovados, 1 reprovado, 1 N/A — a aprovação é 2/3 = 66,67%,
    não 2/4 = 50%.
    """
    auditoria = _auditar(autenticado, auditavel.versao.id)
    resultados = _detalhe(autenticado, auditoria["id"])["resultados"]

    _marcar(autenticado, resultados[0]["id"], "aprovado")
    _marcar(autenticado, resultados[1]["id"], "aprovado")
    _marcar(autenticado, resultados[2]["id"], "reprovado")
    _marcar(autenticado, resultados[3]["id"], "na")

    detalhe = _detalhe(autenticado, auditoria["id"])
    assert float(detalhe["aprovacao_pct"]) == 66.67
    assert detalhe["pendentes"] == 0


def test_tudo_na_nao_produz_percentual(
    autenticado: TestClient, auditavel: CenarioAuditavel
) -> None:
    """Sem item aplicável não existe percentual — 0% mentiria."""
    auditoria = _auditar(autenticado, auditavel.versao.id)
    for resultado in _detalhe(autenticado, auditoria["id"])["resultados"]:
        _marcar(autenticado, resultado["id"], "na")
    assert _detalhe(autenticado, auditoria["id"])["aprovacao_pct"] is None


def test_editar_resultado_marca_origem_manual(
    autenticado: TestClient, auditavel: CenarioAuditavel
) -> None:
    auditoria = _auditar(autenticado, auditavel.versao.id)
    resultado = _detalhe(autenticado, auditoria["id"])["resultados"][0]
    assert _marcar(autenticado, resultado["id"], "aprovado")["origem"] == "manual"


def test_elementos_viram_ocorrencias(
    autenticado: TestClient, auditavel: CenarioAuditavel
) -> None:
    """É o mesmo caminho que o worker da Fase 3 vai usar para explodir os IDs."""
    auditoria = _auditar(autenticado, auditavel.versao.id)
    resultado = _detalhe(autenticado, auditoria["id"])["resultados"][0]

    r = autenticado.patch(
        f"{API}/resultados/{resultado['id']}",
        json={"status": "reprovado", "elementos": ["3xY2$abc", "3xY2$def"]},
    )
    assert r.status_code == 200
    assert sorted(o["element_id"] for o in r.json()["ocorrencias"]) == ["3xY2$abc", "3xY2$def"]

    # Substituição, não acúmulo.
    r = autenticado.patch(
        f"{API}/resultados/{resultado['id']}", json={"elementos": ["3xY2$abc"]}
    )
    assert len(r.json()["ocorrencias"]) == 1


# ---------------------------------------------------- SP-205 · publicação
def test_nao_publica_com_item_pendente(
    autenticado: TestClient, auditavel: CenarioAuditavel
) -> None:
    auditoria = _auditar(autenticado, auditavel.versao.id)
    r = autenticado.post(f"{API}/auditorias/{auditoria['id']}/publicar")
    assert r.status_code == 409
    assert "pendente" in r.json()["detail"]


def _concluir(client: TestClient, auditoria_id) -> None:
    for resultado in _detalhe(client, auditoria_id)["resultados"]:
        _marcar(client, resultado["id"], "aprovado")


def test_publicar_registra_revisor_e_data(
    autenticado: TestClient, auditavel: CenarioAuditavel
) -> None:
    auditoria = _auditar(autenticado, auditavel.versao.id)
    _concluir(autenticado, auditoria["id"])

    r = autenticado.post(f"{API}/auditorias/{auditoria['id']}/publicar")
    assert r.status_code == 200, r.text
    corpo = r.json()
    assert corpo["estado"] == "publicado"
    assert corpo["revisado_por"] is not None
    assert corpo["publicado_em"] is not None
    assert float(corpo["aprovacao_pct"]) == 100.0


def test_publicada_nao_aceita_edicao(
    autenticado: TestClient, auditavel: CenarioAuditavel
) -> None:
    auditoria = _auditar(autenticado, auditavel.versao.id)
    _concluir(autenticado, auditoria["id"])
    autenticado.post(f"{API}/auditorias/{auditoria['id']}/publicar")

    resultado = _detalhe(autenticado, auditoria["id"])["resultados"][0]
    r = autenticado.patch(f"{API}/resultados/{resultado['id']}", json={"status": "reprovado"})
    assert r.status_code == 409


def test_publicar_duas_vezes_e_recusado(
    autenticado: TestClient, auditavel: CenarioAuditavel
) -> None:
    auditoria = _auditar(autenticado, auditavel.versao.id)
    _concluir(autenticado, auditoria["id"])
    autenticado.post(f"{API}/auditorias/{auditoria['id']}/publicar")
    assert autenticado.post(f"{API}/auditorias/{auditoria['id']}/publicar").status_code == 409


def test_versao_nova_desatualiza_o_round_publicado(
    autenticado: TestClient, auditavel: CenarioAuditavel
) -> None:
    """A regra que o painel usa para dizer 'aprovado, mas sobre arquivo velho'."""
    auditoria = _auditar(autenticado, auditavel.versao.id)
    _concluir(autenticado, auditoria["id"])
    autenticado.post(f"{API}/auditorias/{auditoria['id']}/publicar")

    autenticado.post(
        f"{API}/modelos/{auditavel.modelo.id}/versoes", json={"versao": "V2", "formato": "ifc"}
    )
    assert _detalhe(autenticado, auditoria["id"])["estado"] == "desatualizado"


def test_round_avanca_na_versao_seguinte(
    autenticado: TestClient, auditavel: CenarioAuditavel
) -> None:
    _auditar(autenticado, auditavel.versao.id)
    v2 = autenticado.post(
        f"{API}/modelos/{auditavel.modelo.id}/versoes", json={"versao": "V2", "formato": "ifc"}
    ).json()
    assert _auditar(autenticado, v2["id"])["round"] == 2


def test_round_em_andamento_sobrevive_a_versao_nova(
    autenticado: TestClient, auditavel: CenarioAuditavel
) -> None:
    """Só o publicado desatualiza: abandonar um round em andamento é decisão
    da coordenação, não do upload."""
    auditoria = _auditar(autenticado, auditavel.versao.id)
    autenticado.post(
        f"{API}/modelos/{auditavel.modelo.id}/versoes", json={"versao": "V2", "formato": "ifc"}
    )
    assert _detalhe(autenticado, auditoria["id"])["estado"] == "nao_publicado"


# ------------------------------------------------- SP-204 · não-conformidade
def test_nc_herda_criterio_e_elementos_do_resultado(
    autenticado: TestClient, auditavel: CenarioAuditavel
) -> None:
    auditoria = _auditar(autenticado, auditavel.versao.id)
    resultado = _detalhe(autenticado, auditoria["id"])["resultados"][0]
    autenticado.patch(
        f"{API}/resultados/{resultado['id']}",
        json={"status": "reprovado", "elementos": ["ID-1", "ID-2"]},
    )

    r = autenticado.post(
        f"{API}/auditorias/{auditoria['id']}/ncs",
        json={
            "resultado_id": resultado["id"],
            "descricao": "Elementos satélite fora do modelo",
            "recomendacao": "Remover ou reposicionar",
            "responsavel_id": str(auditavel.empresa.id),
        },
    )
    assert r.status_code == 201, r.text
    nc = r.json()
    assert nc["criterio_id"] == resultado["criterio_id"]
    assert "ID-1" in nc["elementos"] and "ID-2" in nc["elementos"]
    assert nc["status"] == "aberto"


def test_item_aprovado_nao_gera_nc(
    autenticado: TestClient, auditavel: CenarioAuditavel
) -> None:
    auditoria = _auditar(autenticado, auditavel.versao.id)
    resultado = _detalhe(autenticado, auditoria["id"])["resultados"][0]
    _marcar(autenticado, resultado["id"], "aprovado")

    r = autenticado.post(
        f"{API}/auditorias/{auditoria['id']}/ncs", json={"resultado_id": resultado["id"]}
    )
    assert r.status_code == 409
    assert "reprovados" in r.json()["detail"]


def test_fornecedor_comenta_a_nc(autenticado: TestClient, auditavel: CenarioAuditavel) -> None:
    """O loop de resposta do LOD 400: o fornecedor responde sem mexer no
    resultado da auditoria."""
    auditoria = _auditar(autenticado, auditavel.versao.id)
    nc = autenticado.post(
        f"{API}/auditorias/{auditoria['id']}/ncs", json={"descricao": "x"}
    ).json()

    r = autenticado.post(
        f"{API}/ncs/{nc['id']}/comentarios", json={"texto": "Corrigido na V2."}
    )
    assert r.status_code == 201

    ncs = autenticado.get(f"{API}/auditorias/{auditoria['id']}/ncs").json()
    assert ncs[0]["comentarios"][0]["texto"] == "Corrigido na V2."


def test_ncs_do_projeto_alimentam_o_relatorio(
    autenticado: TestClient, auditavel: CenarioAuditavel
) -> None:
    auditoria = _auditar(autenticado, auditavel.versao.id)
    autenticado.post(f"{API}/auditorias/{auditoria['id']}/ncs", json={"descricao": "a"})
    autenticado.post(f"{API}/auditorias/{auditoria['id']}/ncs", json={"descricao": "b"})

    r = autenticado.get(f"{API}/projetos/{auditavel.projeto.id}/ncs")
    assert r.status_code == 200
    assert len(r.json()) == 2


# ------------------------------------------------------ SP-206 · views
def test_painel_deriva_das_auditorias(
    autenticado: TestClient, auditavel: CenarioAuditavel
) -> None:
    """CA: painel sai de consulta, sem tabela de controle própria."""
    auditoria = _auditar(autenticado, auditavel.versao.id)
    _concluir(autenticado, auditoria["id"])
    autenticado.post(f"{API}/auditorias/{auditoria['id']}/publicar")

    r = autenticado.get(f"{API}/projetos/{auditavel.projeto.id}/painel")
    assert r.status_code == 200, r.text
    corpo = r.json()

    assert corpo["resumo"]["total_modelos"] == 1
    assert corpo["resumo"]["publicados"] == 1
    assert corpo["resumo"]["aprovacao_media"] == 100.0

    linha = corpo["linhas"][0]
    assert linha["codigo"] == auditavel.modelo.codigo
    assert linha["disciplina_codigo"] == "STRC-STEEL"
    assert linha["cor_macro"] == "#A85B12"
    assert linha["versao"] == "V1"
    assert linha["estado"] == "publicado"


def test_painel_consolida_varios_checklists(
    autenticado: TestClient, auditavel: CenarioAuditavel
) -> None:
    """Um modelo costuma ter mais de um checklist. A linha do painel responde
    "este modelo está aprovado?", e só fica publicada quando todos estão.
    """
    autenticado.patch(
        f"{API}/disciplinas/{auditavel.disciplina.id}", json={"checklists": ["geral", "ifc"]}
    )
    # O checklist IFC também precisa de itens, senão não há o que auditar.
    autenticado.put(
        f"{API}/checklists/ifc/itens",
        json={
            "projeto_id": str(auditavel.projeto.id),
            "itens": [{"criterio_id": str(auditavel.criterios[0].id)}],
        },
    )

    auditorias = autenticado.post(
        f"{API}/versoes/{auditavel.versao.id}/auditar", json={}
    ).json()
    assert len(auditorias) == 2

    geral = next(a for a in auditorias if a["checklist"] == "geral")
    _concluir(autenticado, geral["id"])
    autenticado.post(f"{API}/auditorias/{geral['id']}/publicar")

    linha = autenticado.get(f"{API}/projetos/{auditavel.projeto.id}/painel").json()["linhas"][0]
    assert linha["estado"] == "nao_publicado", "o IFC ainda está aberto"
    assert {c["checklist"] for c in linha["checklists"]} == {"geral", "ifc"}
    assert float(linha["aprovacao_pct"]) == 50.0, "média de 100% (geral) e 0% (ifc)"

    ifc = next(a for a in auditorias if a["checklist"] == "ifc")
    _concluir(autenticado, ifc["id"])
    autenticado.post(f"{API}/auditorias/{ifc['id']}/publicar")

    linha = autenticado.get(f"{API}/projetos/{auditavel.projeto.id}/painel").json()["linhas"][0]
    assert linha["estado"] == "publicado", "agora todos os checklists estão publicados"
    assert float(linha["aprovacao_pct"]) == 100.0


def test_painel_marca_desatualizado_se_qualquer_checklist_ficou_para_tras(
    autenticado: TestClient, auditavel: CenarioAuditavel
) -> None:
    """Versão nova joga o modelo de volta para "não publicado".

    O CONTRATO MUDOU quando a auditoria geral passou a nascer com a versão
    (`services/auditoria.py::ao_registrar_versao`). Este teste afirmava que a V2
    chegava sem auditoria NENHUMA; agora ela chega com a geral aberta, em branco
    e no round seguinte.

    O que o teste protege continua o mesmo, e é o nome dele: a publicação da V1
    não conta mais para a linha do painel. O que mudou é por quê — antes porque
    não havia auditoria, agora porque a que existe está aberta.
    """
    auditoria = _auditar(autenticado, auditavel.versao.id)
    _concluir(autenticado, auditoria["id"])
    autenticado.post(f"{API}/auditorias/{auditoria['id']}/publicar")

    autenticado.post(
        f"{API}/modelos/{auditavel.modelo.id}/versoes", json={"versao": "V2", "formato": "ifc"}
    )
    linha = autenticado.get(f"{API}/projetos/{auditavel.projeto.id}/painel").json()["linhas"][0]
    assert linha["versao"] == "V2"
    assert linha["estado"] == "nao_publicado"

    # A geral veio junto com a V2 — aberta, e num round acima do publicado.
    assert [c["checklist"] for c in linha["checklists"]] == ["geral"]
    geral = linha["checklists"][0]
    assert geral["estado"] == "nao_publicado"
    assert geral["round"] == (auditoria["round"] or 0) + 1


def test_painel_mostra_modelo_sem_auditoria(
    autenticado: TestClient, auditavel: CenarioAuditavel
) -> None:
    """O modelo existe mas ninguém olhou: aparece como não publicado."""
    corpo = autenticado.get(f"{API}/projetos/{auditavel.projeto.id}/painel").json()
    assert corpo["linhas"][0]["estado"] == "nao_publicado"
    assert corpo["linhas"][0]["aprovacao_pct"] is None


def test_painel_conta_ncs_abertas(
    autenticado: TestClient, auditavel: CenarioAuditavel
) -> None:
    auditoria = _auditar(autenticado, auditavel.versao.id)
    nc = autenticado.post(
        f"{API}/auditorias/{auditoria['id']}/ncs", json={"descricao": "aberta"}
    ).json()
    autenticado.post(f"{API}/auditorias/{auditoria['id']}/ncs", json={"descricao": "resolvida"})
    autenticado.patch(f"{API}/ncs/{nc['id']}", json={"status": "resolvido"})

    corpo = autenticado.get(f"{API}/projetos/{auditavel.projeto.id}/painel").json()
    assert corpo["resumo"]["ncs_abertas"] == 1, "resolvida não conta"


def test_matriz_por_area(autenticado: TestClient, auditavel: CenarioAuditavel) -> None:
    autenticado.patch(
        f"{API}/disciplinas/{auditavel.disciplina.id}", json={"checklists": ["lod500"]}
    )
    autenticado.post(
        f"{API}/versoes/{auditavel.versao.id}/auditar",
        json={"checklist": "lod500", "area": "ADMIN"},
    )

    r = autenticado.get(
        f"{API}/projetos/{auditavel.projeto.id}/matriz", params={"checklist": "lod500"}
    )
    assert r.status_code == 200, r.text
    corpo = r.json()
    assert corpo["areas"] == ["ADMIN", "COLO1"]

    celulas = corpo["linhas"][0]["celulas"]
    assert celulas["ADMIN"]["auditoria_id"] is not None
    assert celulas["COLO1"]["auditoria_id"] is None, "área no escopo, mas ainda sem auditoria"


def test_matriz_ignora_disciplina_fora_do_checklist(
    autenticado: TestClient, auditavel: CenarioAuditavel
) -> None:
    """A disciplina do cenário só declara 'geral' — não entra na matriz LOD 500."""
    corpo = autenticado.get(
        f"{API}/projetos/{auditavel.projeto.id}/matriz", params={"checklist": "lod500"}
    ).json()
    assert corpo["linhas"] == []


# ------------------------------------------------------ SP-207 · exports
def test_controle_xlsx(autenticado: TestClient, auditavel: CenarioAuditavel) -> None:
    r = autenticado.get(f"{API}/projetos/{auditavel.projeto.id}/controle.xlsx")
    assert r.status_code == 200, r.text
    assert r.content[:2] == b"PK", "xlsx é um zip"
    assert "controle_" in r.headers["content-disposition"].lower()


def test_relatorio_pdf(autenticado: TestClient, auditavel: CenarioAuditavel) -> None:
    auditoria = _auditar(autenticado, auditavel.versao.id)
    resultado = _detalhe(autenticado, auditoria["id"])["resultados"][0]
    autenticado.patch(
        f"{API}/resultados/{resultado['id']}",
        json={"status": "reprovado", "elementos": ["ID-1"]},
    )
    autenticado.post(
        f"{API}/auditorias/{auditoria['id']}/ncs",
        json={
            "resultado_id": resultado["id"],
            "descricao": "Coordenadas divergentes <verificar>",
            "recomendacao": "Realinhar com o Construction BIM",
        },
    )

    r = autenticado.get(f"{API}/modelos/{auditavel.modelo.id}/relatorio.pdf")
    assert r.status_code == 200, r.text
    assert r.content[:4] == b"%PDF"
    assert len(r.content) > 1500


def test_relatorio_pdf_em_ingles(
    autenticado: TestClient, auditavel: CenarioAuditavel
) -> None:
    r = autenticado.get(
        f"{API}/modelos/{auditavel.modelo.id}/relatorio.pdf", params={"idioma": "en"}
    )
    assert r.status_code == 200
    assert r.content[:4] == b"%PDF"
