"""Storage S3 — ida e volta de verdade contra o MinIO.

Exercita o caminho que o upload de modelo, de evidência e de logo usam. Sem
storage alcançável os testes são pulados, do mesmo jeito que os de banco.
"""

from __future__ import annotations

import io
import uuid

from fastapi.testclient import TestClient

from app.services import storage
from tests.conftest import API, CenarioAuditavel, requer_banco, requer_storage


@requer_storage
def test_enviar_e_recuperar_por_url_assinada() -> None:
    org_id = uuid.uuid4()
    conteudo = b"ISO-10303-21;\nHEADER;\n/* IFC de mentira */\nENDSEC;\n"

    chave = storage.enviar(org_id, "teste/arquivo.ifc", conteudo, "application/octet-stream")
    assert chave.startswith(f"org/{org_id}/"), "toda chave é prefixada pelo tenant"

    url = storage.url_assinada(chave, expira_em=60)
    assert "X-Amz-Signature" in url, "o bucket não é público; a leitura é assinada"

    import httpx

    baixado = httpx.get(url, timeout=30)
    assert baixado.status_code == 200
    assert baixado.content == conteudo


@requer_storage
def test_extensao_segura_rejeita_travessia_de_caminho() -> None:
    """O nome vem do cliente; nunca entra na chave sem passar por aqui."""
    permitidas = {".ifc", ".rvt"}
    assert storage.extensao_segura("modelo.ifc", permitidas) == ".ifc"
    assert storage.extensao_segura("MODELO.IFC", permitidas) == ".ifc"
    assert storage.extensao_segura("../../etc/passwd", permitidas) == ""
    assert storage.extensao_segura("modelo.exe", permitidas) == ""
    assert storage.extensao_segura("", permitidas) == ""


@requer_banco
@requer_storage
def test_upload_de_versao_e_download(
    autenticado: TestClient, auditavel: CenarioAuditavel
) -> None:
    """SP-202 · CA: subir .ifc manualmente equivale ao fluxo do ACC."""
    conteudo = b"ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;\nENDSEC;\nEND-ISO-10303-21;\n"

    r = autenticado.post(
        f"{API}/versoes/{auditavel.versao.id}/upload",
        files={
            "arquivo": (
                "CPQ11-C-STRC-STEEL-ADMIN-R22.ifc",
                io.BytesIO(conteudo),
                "application/octet-stream",
            )
        },
    )
    assert r.status_code == 200, r.text
    assert r.json()["arquivo_url"], "a versão passa a apontar para a chave no S3"

    r = autenticado.get(f"{API}/versoes/{auditavel.versao.id}/download")
    assert r.status_code == 200

    import httpx

    baixado = httpx.get(r.json()["url"], timeout=30)
    assert baixado.content == conteudo


@requer_banco
@requer_storage
def test_evidencia_de_resultado(
    autenticado: TestClient, auditavel: CenarioAuditavel
) -> None:
    """SP-203 · CA: comentário e evidência persistidos."""
    auditoria = autenticado.post(
        f"{API}/versoes/{auditavel.versao.id}/auditar", json={}
    ).json()[0]
    resultado = autenticado.get(f"{API}/auditorias/{auditoria['id']}").json()["resultados"][0]

    # PNG mínimo válido.
    png = bytes.fromhex(
        "89504e470d0a1a0a0000000d494844520000000100000001080600000"
        "01f15c4890000000a49444154789c6300010000050001"
        "0d0a2db40000000049454e44ae426082"
    )
    r = autenticado.post(
        f"{API}/resultados/{resultado['id']}/evidencias",
        files={"arquivo": ("captura.png", io.BytesIO(png), "image/png")},
        params={"legenda": "Elementos satélite na vista 3D"},
    )
    assert r.status_code == 201, r.text
    evidencia = r.json()
    assert evidencia["legenda"] == "Elementos satélite na vista 3D"

    detalhe = autenticado.get(f"{API}/auditorias/{auditoria['id']}").json()
    alvo = next(x for x in detalhe["resultados"] if x["id"] == resultado["id"])
    assert len(alvo["evidencias"]) == 1

    r = autenticado.get(f"{API}/evidencias/{evidencia['id']}/url")
    assert r.status_code == 200 and "X-Amz-Signature" in r.json()["url"]


@requer_banco
@requer_storage
def test_logo_de_empresa(autenticado: TestClient, auditavel: CenarioAuditavel) -> None:
    """SP-102 · CA: upload de logo para o S3."""
    svg = b'<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'
    r = autenticado.post(
        f"{API}/empresas/{auditavel.empresa.id}/logo",
        files={"arquivo": ("logo.svg", io.BytesIO(svg), "image/svg+xml")},
    )
    assert r.status_code == 200, r.text
    assert r.json()["logo_url"]

    r = autenticado.get(f"{API}/empresas/{auditavel.empresa.id}/logo-url")
    assert r.status_code == 200 and r.json()["url"]
