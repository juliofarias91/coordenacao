"""Fase 3 · automação ponta a ponta.

O motor IFC é exercitado contra arquivos IFC de verdade, gerados pelo próprio
IfcOpenShell (`tests/ifc_fabrica.py`). Testar isso com mock não provaria nada:
o risco está justamente em como o IfcOpenShell expõe psets e agregações.
"""

from __future__ import annotations

import os

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Criterio, Notificacao, Penalidade, VersaoModelo
from app.models.enums import Automacao
from app.services.automacao import executar_auditoria_automatica
from app.services.automacao import ifc as motor_ifc
from tests import ifc_fabrica
from tests.conftest import API, CenarioAuditavel, requer_banco, requer_storage

SEGMENTOS = [
    {"k": "PROJETO", "vals": []},
    {"k": "MACRO", "vals": ["A", "C", "M", "S"]},
    {"k": "DISC", "vals": []},
    {"k": "SUB", "vals": []},
    {"k": "SETOR", "vals": []},
    {"k": "SW", "vals": ["R22", "R24", "RX3"], "opcional": True},
]


# ==========================================================================
# Motor IFC — sem banco, com arquivo IFC real
# ==========================================================================
def _abrir(modelo) -> tuple[object, str]:
    caminho = ifc_fabrica.gravar(modelo)
    return motor_ifc.abrir(caminho), caminho


def test_4d_distingue_parametro_ausente_de_vazio() -> None:
    """A correção é diferente: criar o parâmetro × preencher o valor."""
    aberto, caminho = _abrir(
        ifc_fabrica.modelo_4d(
            elementos_ok=2, elementos_sem_parametro=1, elementos_com_parametro_vazio=1
        )
    )
    try:
        contagem = motor_ifc.auditar_parametros(aberto, ["4D_DISCIPLINE", "4D_AREA"])
        assert contagem.analisados == 4
        assert contagem.ok == 2

        detalhes = {o.detalhe for o in contagem.ocorrencias}
        assert any(d.startswith("ausente:") for d in detalhes)
        assert any(d.startswith("vazio:") for d in detalhes)
    finally:
        os.unlink(caminho)


def test_4d_exige_todos_os_parametros_pedidos() -> None:
    """Um elemento só é OK quando todos os parâmetros estão lá — é assim que
    a planilha 4D é lida hoje."""
    aberto, caminho = _abrir(
        ifc_fabrica.modelo_4d(elementos_ok=3, elementos_sem_parametro=0, parametros=("4D_AREA",))
    )
    try:
        assert motor_ifc.auditar_parametros(aberto, ["4D_AREA"]).ok == 3
        # O 4D_CELL não existe em nenhum elemento: todos reprovam.
        assert motor_ifc.auditar_parametros(aberto, ["4D_AREA", "4D_CELL"]).ok == 0
    finally:
        os.unlink(caminho)


def test_ocorrencias_sao_truncadas_com_aviso(monkeypatch) -> None:
    """Um IFC de datacenter estouraria a tabela. O corte é explícito."""
    monkeypatch.setattr(motor_ifc, "LIMITE_OCORRENCIAS", 2)
    aberto, caminho = _abrir(
        ifc_fabrica.modelo_4d(elementos_ok=0, elementos_sem_parametro=5)
    )
    try:
        contagem = motor_ifc.auditar_parametros(aberto, ["4D_AREA"])
        assert contagem.analisados == 5
        assert len(contagem.ocorrencias) == 2
        assert contagem.truncado is True
    finally:
        os.unlink(caminho)


def test_categorias_contra_o_dicionario() -> None:
    aberto, caminho = _abrir(
        ifc_fabrica.modelo_com_assemblies(["BEAM", "COLUMN", "GAMBIARRA"])
    )
    try:
        contagem = motor_ifc.auditar_categorias(aberto, ["ANCHOR", "BEAM", "COLUMN"])
        assert contagem.analisados == 3
        assert contagem.ok == 2
        assert "GAMBIARRA" in contagem.ocorrencias[0].detalhe
    finally:
        os.unlink(caminho)


def test_categorias_sem_dicionario_nao_verifica_nada() -> None:
    aberto, caminho = _abrir(ifc_fabrica.modelo_com_assemblies(["BEAM"]))
    try:
        assert motor_ifc.auditar_categorias(aberto, []).analisados == 0
    finally:
        os.unlink(caminho)


def test_elementos_satelite() -> None:
    aberto, caminho = _abrir(ifc_fabrica.modelo_com_satelites(contidos=2, soltos=3))
    try:
        contagem = motor_ifc.auditar_elementos_soltos(aberto)
        assert contagem.analisados == 5
        assert contagem.ok == 2
        assert len(contagem.ocorrencias) == 3
    finally:
        os.unlink(caminho)


# ==========================================================================
# SP-304 · parser da árvore de propriedades do Revit (sem rede)
# ==========================================================================
def test_parser_de_propriedades_revit() -> None:
    from app.services.automacao.revit import auditar_parametros_revit, urn_base64

    colecao = [
        {"objectid": 1, "name": "Model", "properties": {}},  # nó raiz, ignorado
        {
            "objectid": 2,
            "externalId": "elem-ok",
            "properties": {"Dados 4D": {"4D_AREA": "ADMIN", "4D_CELL": "A1"}},
        },
        {
            "objectid": 3,
            "externalId": "elem-sem",
            "properties": {"Identidade": {"Marca": "V1"}},
        },
        {
            "objectid": 4,
            "externalId": "elem-vazio",
            "properties": {"Dados 4D": {"4D_AREA": "  ", "4D_CELL": "A2"}},
        },
    ]
    contagem = auditar_parametros_revit(colecao, ["4D_AREA", "4D_CELL"])
    assert contagem.analisados == 3, "o nó raiz sem propriedades não conta"
    assert contagem.ok == 1
    assert {o.element_id for o in contagem.ocorrencias} == {"elem-sem", "elem-vazio"}

    assert urn_base64("urn:adsk.objects:os.object:bucket/modelo.rvt").endswith("=") is False


# ==========================================================================
# SP-301 · endpoint de validação, penalidade e notificação
# ==========================================================================
pytestmark_db = requer_banco


@requer_banco
def test_validar_nome_pela_api(autenticado: TestClient, auditavel: CenarioAuditavel) -> None:
    projeto_id = str(auditavel.projeto.id)
    autenticado.put(
        f"{API}/projetos/{projeto_id}/nomenclatura", json={"segmentos": SEGMENTOS}
    )

    r = autenticado.post(
        f"{API}/nomenclatura/validar",
        json={
            "nome": f"{auditavel.projeto.codigo}-C-STRC-STEEL-ADMIN-R22",
            "projeto_id": projeto_id,
        },
    )
    assert r.status_code == 200, r.text
    assert r.json()["ok"] is True

    r = autenticado.post(
        f"{API}/nomenclatura/validar",
        json={"nome": "ERRADO-X-STRC", "projeto_id": projeto_id},
    )
    corpo = r.json()
    assert corpo["ok"] is False
    assert corpo["penalidade_id"] is None, "validar não pune por padrão"
    assert any(not s["ok"] for s in corpo["segmentos"])


@requer_banco
def test_projeto_sem_padrao_avisa_em_vez_de_aprovar(
    autenticado: TestClient, auditavel: CenarioAuditavel
) -> None:
    r = autenticado.post(
        f"{API}/nomenclatura/validar",
        json={"nome": "QUALQUER", "projeto_id": str(auditavel.projeto.id)},
    )
    assert r.status_code == 409
    assert "padrão de nomenclatura" in r.json()["detail"]


@requer_banco
def test_divergencia_registrada_gera_penalidade_e_notificacao(
    autenticado: TestClient, auditavel: CenarioAuditavel, db: Session
) -> None:
    """CA da SP-301: divergência grava no ledger e cria notificação."""
    projeto_id = str(auditavel.projeto.id)
    autenticado.put(f"{API}/projetos/{projeto_id}/nomenclatura", json={"segmentos": SEGMENTOS})

    r = autenticado.post(
        f"{API}/nomenclatura/validar",
        json={
            "nome": "FORA-DO-PADRAO",
            "projeto_id": projeto_id,
            "empresa_id": str(auditavel.empresa.id),
            "registrar": True,
        },
    )
    assert r.status_code == 200, r.text
    assert r.json()["penalidade_id"] is not None

    ledger = autenticado.get(f"{API}/empresas/{auditavel.empresa.id}/penalidades").json()
    assert len(ledger) == 1
    assert "Nomenclatura divergente" in ledger[0]["motivo"]

    # O contador materializado acompanha o ledger.
    empresa = autenticado.get(f"{API}/empresas/{auditavel.empresa.id}").json()
    assert empresa["penalidades"] == 1

    notificacoes = db.execute(
        select(Notificacao).where(Notificacao.org_id == auditavel.org.id)
    ).scalars().all()
    assert any(n.tipo.value == "penalidade" for n in notificacoes)


@requer_banco
def test_registrar_sem_empresa_e_recusado(
    autenticado: TestClient, auditavel: CenarioAuditavel
) -> None:
    projeto_id = str(auditavel.projeto.id)
    autenticado.put(f"{API}/projetos/{projeto_id}/nomenclatura", json={"segmentos": SEGMENTOS})
    r = autenticado.post(
        f"{API}/nomenclatura/validar",
        json={"nome": "FORA", "projeto_id": projeto_id, "registrar": True},
    )
    assert r.status_code == 409
    assert "empresa_id" in r.json()["detail"]


@requer_banco
def test_penalidades_somam_o_peso(
    autenticado: TestClient, auditavel: CenarioAuditavel, db: Session
) -> None:
    from app.services import penalidades as ledger

    ledger.aplicar(
        db, org_id=auditavel.org.id, empresa_id=auditavel.empresa.id, motivo="a", peso=2
    )
    ledger.aplicar(
        db, org_id=auditavel.org.id, empresa_id=auditavel.empresa.id, motivo="b", peso=3
    )
    db.commit()

    empresa = autenticado.get(f"{API}/empresas/{auditavel.empresa.id}").json()
    assert empresa["penalidades"] == 5
    assert len(db.execute(select(Penalidade)).scalars().all()) >= 2


# ==========================================================================
# SP-303 · executor ponta a ponta, com IFC real no storage
# ==========================================================================
def _preparar_criterios_auto(client: TestClient, cenario: CenarioAuditavel) -> None:
    """Converte os critérios do cenário em automatizáveis."""
    projeto_id = str(cenario.projeto.id)
    client.put(f"{API}/projetos/{projeto_id}/nomenclatura", json={"segmentos": SEGMENTOS})

    mapa = {
        "MODEL_NAME": {"automacao": "auto"},
        "SHARED_COORD": {"automacao": "auto", "parametro_esperado": "4D_DISCIPLINE, 4D_AREA"},
        "SATELLITE": {"automacao": "auto"},
        "WORKSETS": {"automacao": "manual"},
    }
    for criterio in cenario.criterios:
        alteracao = mapa.get(criterio.codigo)
        if alteracao:
            r = client.patch(f"{API}/criterios/{criterio.id}", json=alteracao)
            assert r.status_code == 200, r.text


@requer_banco
@requer_storage
def test_auditoria_automatica_ponta_a_ponta(
    autenticado: TestClient, auditavel: CenarioAuditavel, db: Session
) -> None:
    """SP-303 · o worker lê o IFC, grava resultado e explode falhas em IDs."""
    _preparar_criterios_auto(autenticado, auditavel)

    conteudo = ifc_fabrica.bytes_de(
        ifc_fabrica.modelo_4d(elementos_ok=3, elementos_sem_parametro=2)
    )
    r = autenticado.post(
        f"{API}/versoes/{auditavel.versao.id}/upload",
        files={"arquivo": ("modelo.ifc", conteudo, "application/octet-stream")},
    )
    assert r.status_code == 200, r.text

    r = autenticado.post(f"{API}/versoes/{auditavel.versao.id}/auditar-automatico")
    assert r.status_code == 200, r.text
    execucao = r.json()
    assert execucao["avaliados"] >= 3, execucao

    auditoria_id = execucao["auditorias"][0]
    detalhe = autenticado.get(f"{API}/auditorias/{auditoria_id}").json()
    por_codigo = {r["criterio"]["codigo"]: r for r in detalhe["resultados"]}

    # Parâmetros 4D: 3 de 5 elementos OK -> reprovado, com os IDs explodidos.
    params = por_codigo["SHARED_COORD"]
    assert params["status"] == "reprovado"
    assert params["origem"] == "automatico"
    assert params["itens_analisados"] == 5
    assert params["itens_ok"] == 3
    assert len(params["ocorrencias"]) == 2
    assert all(o["element_id"] for o in params["ocorrencias"])

    # Satélites: todos os elementos estão no andar.
    assert por_codigo["SATELLITE"]["status"] == "aprovado"

    # Nome do modelo: 'CPQ11-C-STRC-STEEL-ADMIN-R22' bate com o padrão.
    assert por_codigo["MODEL_NAME"]["status"] == "aprovado"

    # Critério manual continua intocado.
    assert por_codigo["WORKSETS"]["status"] == "pendente"
    assert por_codigo["WORKSETS"]["origem"] == "manual"


@requer_banco
@requer_storage
def test_automatico_nao_sobrescreve_julgamento_humano(
    autenticado: TestClient, auditavel: CenarioAuditavel
) -> None:
    """A regra que não pode ser quebrada: quem editou à mão manda."""
    _preparar_criterios_auto(autenticado, auditavel)
    conteudo = ifc_fabrica.bytes_de(
        ifc_fabrica.modelo_4d(elementos_ok=0, elementos_sem_parametro=3)
    )
    autenticado.post(
        f"{API}/versoes/{auditavel.versao.id}/upload",
        files={"arquivo": ("modelo.ifc", conteudo, "application/octet-stream")},
    )

    auditoria = autenticado.post(
        f"{API}/versoes/{auditavel.versao.id}/auditar", json={"checklist": "geral"}
    ).json()[0]
    detalhe = autenticado.get(f"{API}/auditorias/{auditoria['id']}").json()
    alvo = next(r for r in detalhe["resultados"] if r["criterio"]["codigo"] == "SHARED_COORD")

    # O auditor decide que, neste modelo, o critério não se aplica.
    autenticado.patch(
        f"{API}/resultados/{alvo['id']}",
        json={"status": "na", "comentario": "acordado com a coordenação"},
    )

    execucao = autenticado.post(
        f"{API}/versoes/{auditavel.versao.id}/auditar-automatico"
    ).json()
    assert execucao["preservados"] >= 1

    detalhe = autenticado.get(f"{API}/auditorias/{auditoria['id']}").json()
    depois = next(r for r in detalhe["resultados"] if r["id"] == alvo["id"])
    assert depois["status"] == "na"
    assert depois["origem"] == "manual"
    assert depois["comentario"] == "acordado com a coordenação"


@requer_banco
@requer_storage
def test_reexecutar_substitui_as_ocorrencias(
    autenticado: TestClient, auditavel: CenarioAuditavel
) -> None:
    """Modelo corrigido tem de limpar os IDs antigos, não acumular."""
    _preparar_criterios_auto(autenticado, auditavel)

    autenticado.post(
        f"{API}/versoes/{auditavel.versao.id}/upload",
        files={
            "arquivo": (
                "modelo.ifc",
                ifc_fabrica.bytes_de(
                    ifc_fabrica.modelo_4d(elementos_ok=1, elementos_sem_parametro=3)
                ),
                "application/octet-stream",
            )
        },
    )
    execucao = autenticado.post(
        f"{API}/versoes/{auditavel.versao.id}/auditar-automatico"
    ).json()
    detalhe = autenticado.get(f"{API}/auditorias/{execucao['auditorias'][0]}").json()
    antes = next(r for r in detalhe["resultados"] if r["criterio"]["codigo"] == "SHARED_COORD")
    assert len(antes["ocorrencias"]) == 3

    # Fornecedor corrige e reenvia o mesmo rótulo de versão.
    autenticado.post(
        f"{API}/versoes/{auditavel.versao.id}/upload",
        files={
            "arquivo": (
                "modelo.ifc",
                ifc_fabrica.bytes_de(
                    ifc_fabrica.modelo_4d(elementos_ok=4, elementos_sem_parametro=0)
                ),
                "application/octet-stream",
            )
        },
    )
    autenticado.post(f"{API}/versoes/{auditavel.versao.id}/auditar-automatico")

    detalhe = autenticado.get(f"{API}/auditorias/{execucao['auditorias'][0]}").json()
    depois = next(r for r in detalhe["resultados"] if r["id"] == antes["id"])
    assert depois["status"] == "aprovado"
    assert depois["ocorrencias"] == []


@requer_banco
def test_versao_sem_arquivo_reporta_erro_sem_quebrar(
    autenticado: TestClient, auditavel: CenarioAuditavel, db: Session
) -> None:
    """Sem arquivo, os critérios que abrem o modelo não rodam — mas o que não
    precisa dele (nome) roda mesmo assim."""
    _preparar_criterios_auto(autenticado, auditavel)

    r = autenticado.post(f"{API}/versoes/{auditavel.versao.id}/auditar-automatico")
    assert r.status_code == 200, r.text
    execucao = r.json()

    assert any("sem arquivo IFC" in e for e in execucao["erros"])
    assert execucao["avaliados"] >= 1, "MODEL_NAME não depende do arquivo"

    # A falha vira notificação para a coordenação (SP-302 · CA observável).
    notificacoes = db.execute(
        select(Notificacao).where(Notificacao.org_id == auditavel.org.id)
    ).scalars().all()
    assert any(n.tipo.value == "erro" for n in notificacoes)


@requer_banco
@requer_storage
def test_executor_nao_toca_round_publicado(
    autenticado: TestClient, auditavel: CenarioAuditavel, db: Session
) -> None:
    _preparar_criterios_auto(autenticado, auditavel)
    auditoria = autenticado.post(
        f"{API}/versoes/{auditavel.versao.id}/auditar", json={"checklist": "geral"}
    ).json()[0]

    detalhe = autenticado.get(f"{API}/auditorias/{auditoria['id']}").json()
    for resultado in detalhe["resultados"]:
        autenticado.patch(f"{API}/resultados/{resultado['id']}", json={"status": "aprovado"})
    autenticado.post(f"{API}/auditorias/{auditoria['id']}/publicar")

    autenticado.post(
        f"{API}/versoes/{auditavel.versao.id}/upload",
        files={
            "arquivo": (
                "modelo.ifc",
                ifc_fabrica.bytes_de(ifc_fabrica.modelo_4d(elementos_sem_parametro=5)),
                "application/octet-stream",
            )
        },
    )
    autenticado.post(f"{API}/versoes/{auditavel.versao.id}/auditar-automatico")

    detalhe = autenticado.get(f"{API}/auditorias/{auditoria['id']}").json()
    assert detalhe["estado"] == "publicado"
    assert all(r["status"] == "aprovado" for r in detalhe["resultados"])


@requer_banco
@requer_storage
def test_executor_chamado_direto_como_o_worker_faz(
    autenticado: TestClient, auditavel: CenarioAuditavel, db: Session
) -> None:
    """O worker Celery é um invólucro fino; esta é a função que ele chama."""
    _preparar_criterios_auto(autenticado, auditavel)
    autenticado.post(
        f"{API}/versoes/{auditavel.versao.id}/upload",
        files={
            "arquivo": (
                "modelo.ifc",
                ifc_fabrica.bytes_de(ifc_fabrica.modelo_4d(elementos_ok=2)),
                "application/octet-stream",
            )
        },
    )

    versao = db.execute(
        select(VersaoModelo).where(VersaoModelo.id == auditavel.versao.id)
    ).scalar_one()
    relatorio = executar_auditoria_automatica(db, versao, org_id=auditavel.org.id)
    db.commit()

    assert relatorio.avaliados >= 2
    assert "critério(s) automatizados" in relatorio.resumo


@requer_banco
def test_criterio_manual_nunca_e_tocado(
    autenticado: TestClient, auditavel: CenarioAuditavel, db: Session
) -> None:
    """Só critérios marcados como `auto` entram na automação."""
    for criterio in db.execute(
        select(Criterio).where(Criterio.projeto_id == auditavel.projeto.id)
    ).scalars():
        assert criterio.automacao == Automacao.MANUAL

    execucao = autenticado.post(
        f"{API}/versoes/{auditavel.versao.id}/auditar-automatico"
    ).json()
    assert execucao["avaliados"] == 0


@requer_banco
def test_catalogo_de_verificadores(autenticado: TestClient) -> None:
    r = autenticado.get(f"{API}/automacao/verificadores")
    assert r.status_code == 200
    assert {"MODEL_NAME", "SATELLITE", "CATEGORY_IFC"} <= set(r.json())


@requer_banco
def test_enfileirar_sem_broker_responde_sem_quebrar(
    autenticado: TestClient, auditavel: CenarioAuditavel
) -> None:
    """Broker fora do ar não pode virar erro para quem acabou de subir o
    arquivo — a versão já está gravada."""
    r = autenticado.post(f"{API}/versoes/{auditavel.versao.id}/enfileirar")
    assert r.status_code == 202
    corpo = r.json()
    assert corpo["enfileirado"] in (True, False)
    if not corpo["enfileirado"]:
        assert "fila indisponível" in corpo["detalhe"]


@requer_banco
def test_notificacao_por_papel_chega_a_quem_tem_o_papel(
    client: TestClient, auditavel: CenarioAuditavel, db: Session
) -> None:
    """Falha de automação é endereçada ao papel, não a um usuário — quem for
    coordenador vê; quem não for, não."""
    from app.models.enums import PapelUsuario
    from app.services import penalidades as ledger

    ledger.avisar_erro(db, org_id=auditavel.org.id, mensagem="falha simulada", origem="x")
    db.commit()

    coordenador = client.get(
        f"{API}/notificacoes", headers=auditavel.headers(papel=PapelUsuario.COORDENADOR)
    )
    assert coordenador.status_code == 200
    assert any(n["mensagem"] == "falha simulada" for n in coordenador.json())

    auditor = client.get(
        f"{API}/notificacoes", headers=auditavel.headers(papel=PapelUsuario.AUDITOR)
    )
    assert auditor.status_code == 200
    assert not any(n["mensagem"] == "falha simulada" for n in auditor.json())

    # O admin vê tudo: uma falha de automação endereçada à coordenação que o
    # admin não enxergasse seria descoberta tarde demais.
    admin = client.get(f"{API}/notificacoes", headers=auditavel.headers())
    assert any(n["mensagem"] == "falha simulada" for n in admin.json())


@requer_banco
@requer_storage
def test_status_do_resultado_reflete_o_arquivo(
    autenticado: TestClient, auditavel: CenarioAuditavel
) -> None:
    """Modelo sem falha nenhuma aprova; o mesmo critério reprova no modelo com
    falhas. É a prova de que o resultado vem do arquivo, não de um default."""
    _preparar_criterios_auto(autenticado, auditavel)

    for conteudo_modelo, esperado in (
        (ifc_fabrica.modelo_4d(elementos_ok=3, elementos_sem_parametro=0), "aprovado"),
        (ifc_fabrica.modelo_4d(elementos_ok=0, elementos_sem_parametro=3), "reprovado"),
    ):
        autenticado.post(
            f"{API}/versoes/{auditavel.versao.id}/upload",
            files={
                "arquivo": (
                    "modelo.ifc",
                    ifc_fabrica.bytes_de(conteudo_modelo),
                    "application/octet-stream",
                )
            },
        )
        execucao = autenticado.post(
            f"{API}/versoes/{auditavel.versao.id}/auditar-automatico"
        ).json()
        detalhe = autenticado.get(f"{API}/auditorias/{execucao['auditorias'][0]}").json()
        alvo = next(
            r for r in detalhe["resultados"] if r["criterio"]["codigo"] == "SHARED_COORD"
        )
        assert alvo["status"] == esperado, alvo["comentario"]

    assert motor_ifc.LIMITE_OCORRENCIAS > 0
