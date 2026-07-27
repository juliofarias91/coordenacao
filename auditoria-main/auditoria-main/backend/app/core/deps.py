"""Dependências do FastAPI: sessão, usuário corrente, tenant e permissões.

O caminho é sempre o mesmo:

    token → org_id → set_tenant(session) → query

Nenhum handler recebe `org_id` do corpo ou da query string.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from dataclasses import dataclass, field

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.contexto import definir_autor
from app.core.security import TokenError, decode_token
from app.db.session import AuthSessionLocal, SessionLocal, set_tenant
from app.models.enums import PERMISSOES_POR_PAPEL, PapelUsuario

bearer = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class CurrentUser:
    id: uuid.UUID
    org_id: uuid.UUID
    papel: PapelUsuario
    permissoes: frozenset[str] = field(default_factory=frozenset)

    def pode(self, permissao: str) -> bool:
        return permissao in self.permissoes


def get_auth_db() -> Iterator[Session]:
    """Sessão privilegiada, sem tenant — **exclusiva da autenticação**.

    O login precisa achar o usuário antes de saber a que organização ele
    pertence, e nesse instante não existe tenant para o row-level security
    consultar. Nenhuma rota de negócio deve depender disto: elas usam
    `get_tenant_db`.
    """
    session = AuthSessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def get_current_user(
    cred: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> CurrentUser:
    if cred is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="credenciais ausentes",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        payload = decode_token(cred.credentials, expected_type="access")
    except TokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    papel = PapelUsuario(payload["papel"])
    perms = payload.get("perms") or list(PERMISSOES_POR_PAPEL.get(papel, ()))
    usuario = CurrentUser(
        id=uuid.UUID(payload["sub"]),
        org_id=uuid.UUID(payload["org"]),
        papel=papel,
        permissoes=frozenset(perms),
    )
    # A trilha de auditoria (SP-406) lê o autor daqui, de dentro de um
    # listener do SQLAlchemy — longe desta assinatura.
    definir_autor(usuario.id, usuario.org_id)
    return usuario


def get_tenant_db(
    user: CurrentUser = Depends(get_current_user),
) -> Iterator[Session]:
    """Sessão já amarrada ao tenant do token. É esta que as rotas usam."""
    session = SessionLocal()
    try:
        set_tenant(session, user.org_id)
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def requer_permissao(*permissoes: str):
    """Guarda de rota: `Depends(requer_permissao("publicar"))`.

    O papel `cliente` nunca passa: ele só acessa `GET /portal/{token}`.
    """

    def _guard(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if user.papel is PapelUsuario.CLIENTE:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="o papel cliente só acessa o portal",
            )
        faltando = [p for p in permissoes if not user.pode(p)]
        if faltando:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"permissão necessária: {', '.join(faltando)}",
            )
        return user

    return _guard


def requer_papel(*papeis: PapelUsuario):
    def _guard(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if user.papel not in papeis:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="papel sem acesso a este recurso",
            )
        return user

    return _guard
