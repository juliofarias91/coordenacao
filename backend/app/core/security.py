"""Hash de senha (Argon2) e emissão/validação de JWT.

O mock client-side do protótipo — que compara senha em texto no navegador —
é substituído aqui. Senha nunca é armazenada nem trafega em claro.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError
from jose import JWTError, jwt

from app.core.config import settings

_hasher = PasswordHasher()

TokenType = Literal["access", "refresh"]


class TokenError(Exception):
    """Token ausente, expirado, adulterado ou do tipo errado."""


# --------------------------------------------------------------------------
# Senha
# --------------------------------------------------------------------------
def hash_password(senha: str) -> str:
    return _hasher.hash(senha)


def verify_password(senha: str, senha_hash: str | None) -> bool:
    if not senha_hash:
        return False
    try:
        return _hasher.verify(senha_hash, senha)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def needs_rehash(senha_hash: str) -> bool:
    """True quando os parâmetros do Argon2 mudaram e vale reidratar o hash."""
    try:
        return _hasher.check_needs_rehash(senha_hash)
    except InvalidHashError:
        return True


# --------------------------------------------------------------------------
# JWT
# --------------------------------------------------------------------------
def create_token(
    *,
    usuario_id: uuid.UUID,
    org_id: uuid.UUID,
    papel: str,
    permissoes: list[str],
    token_type: TokenType = "access",
) -> str:
    agora = datetime.now(UTC)
    if token_type == "access":
        expira = agora + timedelta(minutes=settings.access_token_minutes)
    else:
        expira = agora + timedelta(days=settings.refresh_token_days)

    payload: dict[str, Any] = {
        "sub": str(usuario_id),
        "org": str(org_id),      # o tenant — vira o app.org_id da conexão
        "papel": papel,
        "perms": permissoes,
        "type": token_type,
        "iat": int(agora.timestamp()),
        "exp": int(expira.timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str, *, expected_type: TokenType = "access") -> dict[str, Any]:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError as exc:
        raise TokenError("token inválido ou expirado") from exc

    if payload.get("type") != expected_type:
        raise TokenError(f"esperado token do tipo '{expected_type}'")
    if not payload.get("sub") or not payload.get("org"):
        raise TokenError("token sem sujeito ou organização")
    return payload
