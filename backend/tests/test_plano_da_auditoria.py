"""O PLANO da auditoria: responsável, datas, andamento e prioridade (0013).

A auditoria sempre soube ser EXECUTADA. O que faltava era ser PLANEJADA — dizer
quem faz, para quando e em que ordem de urgência antes de alguém abrir a
planilha. É o conteúdo da gaveta de nova auditoria.

Quatro decisões, e cada uma é fácil de desfazer sem perceber:

- `andamento` NÃO É `estado`. `estado` é publicação e quem o move é o fluxo de
  round; se o plano escrevesse nele, uma auditoria poderia nascer "publicada"
  sem round nenhum — e publicar é o ato que congela o resultado para o
  fornecedor.
- O plano se aplica À AUDITORIA QUE JÁ EXISTIA. `abrir_auditoria` é idempotente,
  e sem isso quem preenchesse a gaveta para um par (modelo, checklist) já aberto
  veria o que digitou sumir sem aviso.
- Campo AUSENTE é "não mexa"; `null` é "apague". Um PATCH de prioridade não pode
  limpar o responsável.
- Round PUBLICADO não aceita replanejamento: o PDF já emitido nomeia o
  responsável e a data.
"""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Auditoria, VersaoModelo
from tests.conftest import API, CenarioAuditavel, requer_banco


def _abrir(autenticado: TestClient, versao_id, **plano) -> dict:
    resposta = autenticado.post(
        f"{API}/versoes/{versao_id}/auditar", json={"checklist": "geral", **plano}
    )
    assert resposta.status_code == 201, resposta.text
    return resposta.json()[0]


@requer_banco
def test_gaveta_grava_o_plano_inteiro(
    autenticado: TestClient, auditavel: CenarioAuditavel
) -> None:
    """Os seis campos da gaveta chegam e voltam."""
    aberta = _abrir(
        autenticado,
        auditavel.versao.id,
        auditor_id=str(auditavel.admin.id),
        data_inicio="2026-08-03T09:00:00Z",
        data_fim="2026-08-07T18:00:00Z",
        entrega_estimada="2026-08-10",
        andamento="em_andamento",
        prioridade="alta",
    )

    assert aberta["auditor_id"] == str(auditavel.admin.id)
    assert aberta["entrega_estimada"] == "2026-08-10"
    assert aberta["andamento"] == "em_andamento"
    assert aberta["prioridade"] == "alta"
    # O plano não é publicação: abrir com andamento "em_andamento" NÃO publica.
    assert aberta["estado"] == "nao_publicado"


@requer_banco
def test_andamento_nasce_a_fazer(
    autenticado: TestClient, auditavel: CenarioAuditavel
) -> None:
    """Sem plano, a auditoria existe e está por fazer — não em branco."""
    aberta = _abrir(autenticado, auditavel.versao.id)
    assert aberta["andamento"] == "a_fazer"
    assert aberta["prioridade"] is None


@requer_banco
def test_replanejar_alcanca_a_auditoria_que_ja_existia(
    autenticado: TestClient, auditavel: CenarioAuditavel
) -> None:
    """`abrir_auditoria` é idempotente; o PLANO não pode ser.

    Sem isto, preencher a gaveta para um par (modelo, checklist) já aberto
    devolveria 201 e descartaria em silêncio tudo o que foi digitado.
    """
    primeira = _abrir(autenticado, auditavel.versao.id, prioridade="baixa")
    segunda = _abrir(
        autenticado, auditavel.versao.id, prioridade="alta", andamento="bloqueada"
    )

    assert segunda["id"] == primeira["id"], "deveria reusar o round, não abrir outro"
    assert segunda["prioridade"] == "alta"
    assert segunda["andamento"] == "bloqueada"


@requer_banco
def test_patch_ausente_nao_apaga_o_que_nao_veio(
    autenticado: TestClient, auditavel: CenarioAuditavel
) -> None:
    """Campo fora do corpo é "não mexa" — só `null` explícito apaga."""
    aberta = _abrir(
        autenticado,
        auditavel.versao.id,
        auditor_id=str(auditavel.admin.id),
        prioridade="alta",
    )

    depois = autenticado.patch(
        f"{API}/auditorias/{aberta['id']}", json={"andamento": "concluida"}
    )
    assert depois.status_code == 200, depois.text
    corpo = depois.json()
    assert corpo["andamento"] == "concluida"
    assert corpo["auditor_id"] == str(auditavel.admin.id), "o responsável sumiu"
    assert corpo["prioridade"] == "alta", "a prioridade sumiu"

    # E `null` explícito APAGA — é a outra metade do contrato.
    limpo = autenticado.patch(
        f"{API}/auditorias/{aberta['id']}", json={"prioridade": None}
    ).json()
    assert limpo["prioridade"] is None


@requer_banco
def test_round_publicado_nao_aceita_replanejamento(
    autenticado: TestClient, auditavel: CenarioAuditavel
) -> None:
    """O PDF emitido nomeia responsável e data; trocá-los reescreveria o documento."""
    aberta = _abrir(autenticado, auditavel.versao.id)

    # Publicar exige todos os itens resolvidos: aprova os quatro.
    detalhe = autenticado.get(f"{API}/auditorias/{aberta['id']}").json()
    for resultado in detalhe["resultados"]:
        marcado = autenticado.patch(
            f"{API}/resultados/{resultado['id']}", json={"status": "aprovado"}
        )
        assert marcado.status_code == 200, marcado.text
    publicada = autenticado.post(f"{API}/auditorias/{aberta['id']}/publicar")
    assert publicada.status_code == 200, publicada.text

    recusa = autenticado.patch(
        f"{API}/auditorias/{aberta['id']}", json={"prioridade": "alta"}
    )
    assert recusa.status_code == 409, recusa.text


@requer_banco
def test_auditar_modelo_pega_a_ultima_versao(
    autenticado: TestClient, auditavel: CenarioAuditavel, db: Session
) -> None:
    """A gaveta escolhe MODELO; a auditoria pertence a uma VERSÃO.

    A ordem é `created_at` e não o nome: 'V10' vem antes de 'V9' em ordem
    alfabética, e `versao` é Text — não há número a comparar.
    """
    criada = autenticado.post(
        f"{API}/modelos/{auditavel.modelo.id}/versoes",
        json={"versao": "V10", "formato": "ifc"},
    )
    assert criada.status_code == 201, criada.text
    nova_id = criada.json()["id"]

    resposta = autenticado.post(
        f"{API}/modelos/{auditavel.modelo.id}/auditar", json={"checklist": "geral"}
    )
    assert resposta.status_code == 201, resposta.text
    assert resposta.json()[0]["versao_id"] == nova_id

    assert db.get(VersaoModelo, uuid_de(nova_id)) is not None


@requer_banco
def test_lista_do_projeto_traz_o_modelo_resolvido(
    autenticado: TestClient, auditavel: CenarioAuditavel
) -> None:
    """O painel precisa do CÓDIGO do modelo, não do id da versão.

    Sem isto ele faria uma requisição por linha só para escrever um nome na
    barra lateral.
    """
    _abrir(autenticado, auditavel.versao.id, prioridade="media")

    resposta = autenticado.get(f"{API}/projetos/{auditavel.projeto.id}/auditorias")
    assert resposta.status_code == 200, resposta.text
    linhas = resposta.json()
    assert linhas, "a auditoria aberta deveria estar na lista"

    geral = next(linha for linha in linhas if linha["checklist"] == "geral")
    assert geral["modelo_codigo"] == auditavel.modelo.codigo
    assert geral["modelo_id"] == str(auditavel.modelo.id)
    assert geral["versao_rotulo"] == auditavel.versao.versao
    assert geral["prioridade"] == "media"


@requer_banco
def test_prioridade_invalida_e_recusada(
    autenticado: TestClient, auditavel: CenarioAuditavel
) -> None:
    """Text no banco, `Literal` na borda: a validação existe, só não é enum do PG."""
    recusa = autenticado.post(
        f"{API}/versoes/{auditavel.versao.id}/auditar",
        json={"checklist": "geral", "prioridade": "urgentissima"},
    )
    assert recusa.status_code == 422, recusa.text


def uuid_de(valor: str):
    import uuid as _uuid

    return _uuid.UUID(valor)


@requer_banco
def test_estado_continua_fora_do_alcance_do_plano(
    autenticado: TestClient, auditavel: CenarioAuditavel, db: Session
) -> None:
    """A gaveta não publica.

    É a razão de `andamento` existir como campo separado. Se `estado` entrasse no
    schema do plano, este PATCH passaria e a auditoria nasceria visível ao
    fornecedor sem ter passado por round.
    """
    aberta = _abrir(autenticado, auditavel.versao.id)

    autenticado.patch(f"{API}/auditorias/{aberta['id']}", json={"estado": "publicado"})

    db.expire_all()
    na_base = db.get(Auditoria, uuid_de(aberta["id"]))
    assert na_base is not None
    assert na_base.estado.value == "nao_publicado"
    assert na_base.publicado_em is None
