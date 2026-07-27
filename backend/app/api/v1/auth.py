"""Autenticação: senha (Argon2) e SSO/OIDC.

Fluxo de senha é o fallback; o SSO liga com `OIDC_ENABLED=true`.
Em ambos os casos a saída é o mesmo par de JWTs, e é do `org` do token que sai
o tenant de toda query subsequente.
"""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import oidc
from app.core.config import settings
from app.core.deps import CurrentUser, get_auth_db, get_current_user, get_tenant_db
from app.core.security import (
    TokenError,
    create_token,
    decode_token,
    hash_password,
    needs_rehash,
    verify_password,
)
from app.models.cadastro import Organizacao, Usuario
from app.models.enums import PERMISSOES_POR_PAPEL
from app.schemas.auth import (
    LoginRequest,
    OidcAuthorizeOut,
    RefreshRequest,
    SessaoOut,
    TokenPair,
    UsuarioOut,
)

router = APIRouter(prefix="/auth", tags=["auth"])

CREDENCIAIS_INVALIDAS = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="login ou senha inválidos",
)


def _permissoes(usuario: Usuario) -> list[str]:
    """Permissões explícitas do usuário; na ausência, o padrão do papel."""
    return list(usuario.permissoes) or list(PERMISSOES_POR_PAPEL.get(usuario.papel, ()))


def _emitir(usuario: Usuario) -> TokenPair:
    perms = _permissoes(usuario)
    comum = {
        "usuario_id": usuario.id,
        "org_id": usuario.org_id,
        "papel": usuario.papel.value,
        "permissoes": perms,
    }
    return TokenPair(
        access_token=create_token(**comum, token_type="access"),
        refresh_token=create_token(**comum, token_type="refresh"),
        expires_in=settings.access_token_minutes * 60,
    )


def _sessao(usuario: Usuario) -> SessaoOut:
    out = UsuarioOut.model_validate(usuario)
    out.permissoes = _permissoes(usuario)
    return SessaoOut(tokens=_emitir(usuario), usuario=out)


def _buscar_usuario(db: Session, login: str, org_slug: str | None) -> Usuario | None:
    """Login é único por organização; sem `org` só resolve se houver um único match."""
    stmt = select(Usuario).where(Usuario.login == login.strip().lower())
    if org_slug:
        stmt = stmt.join(Organizacao, Organizacao.id == Usuario.org_id).where(
            Organizacao.slug == org_slug
        )
    encontrados = db.execute(stmt).scalars().all()
    if len(encontrados) != 1:
        return None
    return encontrados[0]


@router.post("/login", response_model=SessaoOut)
def login(payload: LoginRequest, db: Session = Depends(get_auth_db)) -> SessaoOut:
    usuario = _buscar_usuario(db, payload.login, payload.org)

    # `verify_password` com hash nulo já devolve False, mas ainda assim
    # verificamos contra um hash descartável quando o usuário não existe, para
    # o tempo de resposta não denunciar quais logins existem.
    if usuario is None:
        verify_password(payload.senha, hash_password("descartavel"))
        raise CREDENCIAIS_INVALIDAS

    if not verify_password(payload.senha, usuario.senha_hash):
        raise CREDENCIAIS_INVALIDAS
    if usuario.status != "ativo":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="usuário inativo")

    if usuario.senha_hash and needs_rehash(usuario.senha_hash):
        usuario.senha_hash = hash_password(payload.senha)
        db.add(usuario)

    return _sessao(usuario)


@router.post("/refresh", response_model=TokenPair)
def refresh(payload: RefreshRequest, db: Session = Depends(get_auth_db)) -> TokenPair:
    try:
        claims = decode_token(payload.refresh_token, expected_type="refresh")
    except TokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)
        ) from exc

    # A sessão é privilegiada, então o org do token entra como filtro explícito.
    usuario = db.execute(
        select(Usuario).where(
            Usuario.id == uuid.UUID(claims["sub"]),
            Usuario.org_id == uuid.UUID(claims["org"]),
        )
    ).scalar_one_or_none()
    if usuario is None or usuario.status != "ativo":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="sessão inválida")
    return _emitir(usuario)


@router.get("/me", response_model=UsuarioOut)
def me(
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_tenant_db),
) -> UsuarioOut:
    usuario = db.get(Usuario, user.id)
    if usuario is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="usuário não encontrado")
    out = UsuarioOut.model_validate(usuario)
    out.permissoes = _permissoes(usuario)
    return out


# --------------------------------------------------------------------------
# SSO / OIDC
# --------------------------------------------------------------------------
def _exigir_oidc() -> None:
    if not settings.oidc_enabled:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="SSO desabilitado (defina OIDC_ENABLED=true e o OIDC_ISSUER)",
        )


@router.get("/oidc/login", response_model=OidcAuthorizeOut)
async def oidc_login() -> OidcAuthorizeOut:
    """Devolve a URL de autorização do provedor.

    O `state` é um JWT curto que carrega o `code_verifier` do PKCE assinado
    pela própria API — evita depender de sessão no servidor para um passo que
    dura segundos.
    """
    _exigir_oidc()
    verifier, challenge = oidc.new_pkce_pair()
    state = create_token(
        usuario_id=uuid.uuid4(),
        org_id=uuid.uuid4(),
        papel="leitor",
        permissoes=[verifier],   # o verifier viaja assinado dentro do state
        token_type="access",
    )
    return OidcAuthorizeOut(
        authorization_url=await oidc.authorization_url(state, challenge),
        state=state,
    )


@router.get("/oidc/callback", response_model=SessaoOut)
async def oidc_callback(
    code: str = Query(...),
    state: str = Query(...),
    db: Session = Depends(get_auth_db),
) -> SessaoOut:
    _exigir_oidc()
    try:
        state_claims = decode_token(state, expected_type="access")
    except TokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="state inválido"
        ) from exc

    verifier = (state_claims.get("perms") or [""])[0]
    tokens: dict[str, Any] = await oidc.exchange_code(code, verifier)
    claims = await oidc.validate_id_token(tokens["id_token"])

    sub = claims.get("sub")
    email = (claims.get("email") or "").strip().lower()

    # Usuário precisa estar previamente cadastrado: SSO autentica, não provisiona.
    # (Provisionamento automático é decisão de produto — fica para a Fase 1.)
    usuario = db.execute(select(Usuario).where(Usuario.oidc_sub == sub)).scalar_one_or_none()
    if usuario is None and email:
        usuario = db.execute(select(Usuario).where(Usuario.login == email)).scalar_one_or_none()
        if usuario is not None:
            usuario.oidc_sub = sub
            db.add(usuario)

    if usuario is None or usuario.status != "ativo":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="identidade sem usuário correspondente na plataforma",
        )
    return _sessao(usuario)
