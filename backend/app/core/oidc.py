"""Cliente OIDC (Authorization Code + PKCE).

Fica atrás de `OIDC_ENABLED`. A decisão de qual provedor usar — identidade
Autodesk (menor atrito para quem já vive no ACC) ou identidade corporativa da
SPBIM — é a decisão aberta nº 2 do plano técnico; o código abaixo serve aos
dois, bastando apontar `OIDC_ISSUER`.
"""

from __future__ import annotations

import base64
import hashlib
import secrets
from typing import Any

import httpx
from jose import JWTError, jwt

from app.core.config import settings
from app.core.security import TokenError

_discovery_cache: dict[str, Any] | None = None
_jwks_cache: dict[str, Any] | None = None


async def _discovery() -> dict[str, Any]:
    """Documento .well-known do provedor, buscado uma vez por processo."""
    global _discovery_cache
    if _discovery_cache is None:
        url = settings.oidc_issuer.rstrip("/") + "/.well-known/openid-configuration"
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            _discovery_cache = resp.json()
    return _discovery_cache


async def _jwks() -> dict[str, Any]:
    global _jwks_cache
    if _jwks_cache is None:
        conf = await _discovery()
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(conf["jwks_uri"])
            resp.raise_for_status()
            _jwks_cache = resp.json()
    return _jwks_cache


def new_pkce_pair() -> tuple[str, str]:
    """(verifier, challenge S256)."""
    verifier = secrets.token_urlsafe(64)[:128]
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
    return verifier, challenge


async def authorization_url(state: str, code_challenge: str) -> str:
    conf = await _discovery()
    params = {
        "response_type": "code",
        "client_id": settings.oidc_client_id,
        "redirect_uri": settings.oidc_redirect_uri,
        "scope": settings.oidc_scopes,
        "state": state,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
    }
    return f"{conf['authorization_endpoint']}?{httpx.QueryParams(params)}"


async def exchange_code(code: str, code_verifier: str) -> dict[str, Any]:
    conf = await _discovery()
    data = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": settings.oidc_redirect_uri,
        "client_id": settings.oidc_client_id,
        "code_verifier": code_verifier,
    }
    if settings.oidc_client_secret:
        data["client_secret"] = settings.oidc_client_secret

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(conf["token_endpoint"], data=data)
        resp.raise_for_status()
        return resp.json()


async def validate_id_token(id_token: str) -> dict[str, Any]:
    """Valida assinatura, emissor e audiência. Devolve as claims."""
    keys = await _jwks()
    try:
        return jwt.decode(
            id_token,
            keys,
            audience=settings.oidc_client_id,
            issuer=settings.oidc_issuer,
            options={"verify_at_hash": False},
        )
    except JWTError as exc:
        raise TokenError(f"id_token inválido: {exc}") from exc
