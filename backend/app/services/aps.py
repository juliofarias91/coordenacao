"""Cliente da Autodesk Platform Services (APS/Forge).

Cobre o que a Fase 2 precisa: autenticação 2-legged e download de uma versão
do Data Management (os modelos que os fornecedores sobem na pasta MODELS do
ACC). A extração de propriedades via Model Derivative entra na Fase 3
(SP-304).

**Não verificado contra o ACC real** — depende das credenciais do developer
hub da SPBIM (decisão aberta nº 3 do plano técnico). Os testes exercitam o
cliente com respostas simuladas; a validação de ponta a ponta fica para
quando `APS_CLIENT_ID`/`APS_CLIENT_SECRET` existirem.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx

from app.core.config import settings

log = logging.getLogger(__name__)

BASE = "https://developer.api.autodesk.com"
TOKEN_URL = f"{BASE}/authentication/v2/token"

# Escopos mínimos para ler arquivos do ACC.
ESCOPOS = "data:read account:read"


class APSError(RuntimeError):
    """Falha ao falar com a Autodesk."""


class APSNaoConfigurado(APSError):
    """Credenciais ausentes — a integração está desligada."""


_token: str | None = None
_token_expira: datetime | None = None


def configurado() -> bool:
    return bool(settings.aps_client_id and settings.aps_client_secret)


async def token() -> str:
    """Token 2-legged, reaproveitado até 60s antes de expirar."""
    global _token, _token_expira

    if not configurado():
        raise APSNaoConfigurado(
            "APS_CLIENT_ID/APS_CLIENT_SECRET não configurados; "
            "a integração com o ACC está desligada"
        )

    agora = datetime.now(UTC)
    if _token and _token_expira and agora < _token_expira:
        return _token

    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.post(
            TOKEN_URL,
            data={
                "grant_type": "client_credentials",
                "client_id": settings.aps_client_id,
                "client_secret": settings.aps_client_secret,
                "scope": ESCOPOS,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
    if resp.status_code != 200:
        raise APSError(f"autenticação recusada pela Autodesk: {resp.status_code} {resp.text}")

    corpo = resp.json()
    _token = corpo["access_token"]
    _token_expira = agora + timedelta(seconds=int(corpo.get("expires_in", 3600)) - 60)
    return _token


async def obter_versao(project_id: str, version_id: str) -> dict[str, Any]:
    """Metadados de uma versão de item no Data Management."""
    cabecalhos = {"Authorization": f"Bearer {await token()}"}
    url = f"{BASE}/data/v1/projects/{project_id}/versions/{version_id}"
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(url, headers=cabecalhos)
    if resp.status_code != 200:
        raise APSError(f"versão não encontrada no ACC: {resp.status_code} {resp.text}")
    return resp.json()


async def baixar_arquivo(bucket_key: str, object_key: str) -> bytes:
    """Baixa o binário do OSS. Modelos são grandes — daí o timeout largo."""
    cabecalhos = {"Authorization": f"Bearer {await token()}"}
    url = f"{BASE}/oss/v2/buckets/{bucket_key}/objects/{object_key}"
    async with httpx.AsyncClient(timeout=600, follow_redirects=True) as client:
        resp = await client.get(url, headers=cabecalhos)
    if resp.status_code != 200:
        raise APSError(f"download recusado: {resp.status_code}")
    return resp.content


def assinatura_valida(corpo: bytes, assinatura: str | None) -> bool:
    """Confere o HMAC-SHA1 que o ACC envia no cabeçalho do webhook.

    Sem segredo configurado a verificação é recusada, não ignorada: um
    endpoint de ingestão aberto deixaria qualquer um criar versão de modelo.
    """
    if not settings.aps_webhook_secret or not assinatura:
        return False

    esperado = hmac.new(
        settings.aps_webhook_secret.encode(), corpo, hashlib.sha1
    ).hexdigest()
    recebido = assinatura.removeprefix("sha1hash=").strip()
    return hmac.compare_digest(esperado, recebido)


def rotulo_da_versao(payload: dict[str, Any]) -> str:
    """'V3' a partir do `versionNumber` do evento; cai em 'V1' se ausente."""
    numero = (
        payload.get("payload", {}).get("version")
        or payload.get("payload", {}).get("versionNumber")
        or 1
    )
    return f"V{numero}"
