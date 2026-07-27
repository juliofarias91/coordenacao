"""SP-201 · Webhook de ingestão do ACC.

O cliente APS em si não é exercitado contra a Autodesk — falta credencial
(decisão aberta nº 3). O que se testa aqui é o que a plataforma controla: a
verificação de assinatura e o tratamento do evento.
"""

from __future__ import annotations

import hashlib
import hmac
import json

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from tests.conftest import API, CenarioAuditavel, requer_banco

pytestmark = requer_banco

SEGREDO = "segredo-de-teste-do-webhook"


@pytest.fixture
def com_segredo(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "aps_webhook_secret", SEGREDO)


def _assinar(corpo: bytes) -> str:
    return "sha1hash=" + hmac.new(SEGREDO.encode(), corpo, hashlib.sha1).hexdigest()


def _evento(item_id: str, *, nome: str = "CPQ11-C-STRC-STEEL-ADMIN-R22.ifc", versao: int = 2):
    return {
        "hook": {"event": "dm.version.added"},
        "payload": {
            "lineageUrn": item_id,
            "name": nome,
            "versionNumber": versao,
            "version": versao,
            "createUserName": "Fornecedor",
        },
    }


def test_webhook_sem_assinatura_e_401(client: TestClient, com_segredo: None) -> None:
    r = client.post(f"{API}/ingest/acc/webhook", json=_evento("urn:x"))
    assert r.status_code == 401


def test_webhook_com_assinatura_errada_e_401(client: TestClient, com_segredo: None) -> None:
    corpo = json.dumps(_evento("urn:x")).encode()
    r = client.post(
        f"{API}/ingest/acc/webhook",
        content=corpo,
        headers={"x-adsk-signature": "sha1hash=00", "Content-Type": "application/json"},
    )
    assert r.status_code == 401


def test_webhook_sem_segredo_configurado_recusa_tudo(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Sem segredo, o endpoint fecha em vez de abrir — um caminho de ingestão
    aberto deixaria qualquer um criar versão de modelo."""
    monkeypatch.setattr(settings, "aps_webhook_secret", "")
    corpo = json.dumps(_evento("urn:x")).encode()
    r = client.post(
        f"{API}/ingest/acc/webhook",
        content=corpo,
        headers={"x-adsk-signature": _assinar(corpo), "Content-Type": "application/json"},
    )
    assert r.status_code == 401


def test_item_desconhecido_e_aceito_e_ignorado(
    client: TestClient, com_segredo: None
) -> None:
    """O ACC dispara evento para muito arquivo que não é modelo auditado."""
    corpo = json.dumps(_evento("urn:item-que-ninguem-cadastrou")).encode()
    r = client.post(
        f"{API}/ingest/acc/webhook",
        content=corpo,
        headers={"x-adsk-signature": _assinar(corpo), "Content-Type": "application/json"},
    )
    assert r.status_code == 202
    assert r.json()["aceito"] is False


def test_evento_cria_versao_do_modelo_vinculado(
    autenticado: TestClient, auditavel: CenarioAuditavel, com_segredo: None
) -> None:
    item_id = "urn:adsk.wipprod:dm.lineage:abc123"
    r = autenticado.post(
        f"{API}/modelos/{auditavel.modelo.id}/vincular-acc",
        params={"acc_item_id": item_id},
    )
    assert r.status_code == 200, r.text

    corpo = json.dumps(_evento(item_id, versao=2)).encode()
    r = autenticado.post(
        f"{API}/ingest/acc/webhook",
        content=corpo,
        headers={"x-adsk-signature": _assinar(corpo), "Content-Type": "application/json"},
    )
    assert r.status_code == 202, r.text
    assert r.json()["aceito"] is True

    versoes = autenticado.get(f"{API}/modelos/{auditavel.modelo.id}/versoes").json()
    assert "V2" in [v["versao"] for v in versoes]


def test_evento_repetido_nao_cria_round_fantasma(
    autenticado: TestClient, auditavel: CenarioAuditavel, com_segredo: None
) -> None:
    """O ACC reentrega eventos; a segunda entrega tem de ser inócua."""
    item_id = "urn:adsk.wipprod:dm.lineage:def456"
    autenticado.post(
        f"{API}/modelos/{auditavel.modelo.id}/vincular-acc", params={"acc_item_id": item_id}
    )

    corpo = json.dumps(_evento(item_id, versao=3)).encode()
    cabecalhos = {"x-adsk-signature": _assinar(corpo), "Content-Type": "application/json"}

    primeira = autenticado.post(f"{API}/ingest/acc/webhook", content=corpo, headers=cabecalhos)
    segunda = autenticado.post(f"{API}/ingest/acc/webhook", content=corpo, headers=cabecalhos)

    assert primeira.json()["versao_id"] == segunda.json()["versao_id"]
    versoes = autenticado.get(f"{API}/modelos/{auditavel.modelo.id}/versoes").json()
    assert sum(1 for v in versoes if v["versao"] == "V3") == 1


def test_extensao_nao_auditada_e_ignorada(
    autenticado: TestClient, auditavel: CenarioAuditavel, com_segredo: None
) -> None:
    item_id = "urn:adsk.wipprod:dm.lineage:ghi789"
    autenticado.post(
        f"{API}/modelos/{auditavel.modelo.id}/vincular-acc", params={"acc_item_id": item_id}
    )

    corpo = json.dumps(_evento(item_id, nome="memorial.pdf")).encode()
    r = autenticado.post(
        f"{API}/ingest/acc/webhook",
        content=corpo,
        headers={"x-adsk-signature": _assinar(corpo), "Content-Type": "application/json"},
    )
    assert r.json()["aceito"] is False
    assert "pdf" in r.json()["detalhe"]


def test_status_da_integracao_avisa_o_que_falta(autenticado: TestClient) -> None:
    r = autenticado.get(f"{API}/ingest/acc/status")
    assert r.status_code == 200
    corpo = r.json()
    assert corpo["configurado"] is False
    assert "APS_CLIENT_ID" in corpo["detalhe"]
