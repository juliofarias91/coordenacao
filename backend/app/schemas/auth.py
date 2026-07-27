"""Contratos de entrada/saída da autenticação."""

from __future__ import annotations

import uuid

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import PapelUsuario


class LoginRequest(BaseModel):
    login: str = Field(description="E-mail do usuário")
    senha: str
    org: str | None = Field(
        default=None,
        description=(
            "Slug da organização. Opcional enquanto houver um único tenant; "
            "obrigatório quando o mesmo e-mail existir em mais de uma organização."
        ),
    )


class RefreshRequest(BaseModel):
    refresh_token: str


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int = Field(description="Validade do access token, em segundos")


class UsuarioOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    org_id: uuid.UUID
    login: str
    nome: str | None
    papel: PapelUsuario
    empresa_id: uuid.UUID | None
    permissoes: list[str]
    idioma: str


class SessaoOut(BaseModel):
    """Resposta do login: tokens + o usuário, para o front não fazer duas chamadas."""

    tokens: TokenPair
    usuario: UsuarioOut


class OidcAuthorizeOut(BaseModel):
    authorization_url: str
    state: str
