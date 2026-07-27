"""SP-103 · Usuários e permissões finas."""

from __future__ import annotations

import uuid

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.models.enums import PERMISSOES, PapelUsuario
from app.schemas.comum import ESCRITA, Identificado

SENHA_MINIMA = 10


def _validar_permissoes(valor: list[str]) -> list[str]:
    desconhecidas = sorted(set(valor) - set(PERMISSOES))
    if desconhecidas:
        raise ValueError(
            f"permissão desconhecida: {', '.join(desconhecidas)}. "
            f"Válidas: {', '.join(PERMISSOES)}"
        )
    return valor


class UsuarioCreate(BaseModel):
    model_config = ESCRITA

    login: EmailStr
    nome: str | None = Field(default=None, max_length=200)
    senha: str | None = Field(
        default=None,
        min_length=SENHA_MINIMA,
        max_length=200,
        description="Omita para um usuário que só entra por SSO.",
    )
    papel: PapelUsuario
    empresa_id: uuid.UUID | None = None
    permissoes: list[str] = Field(
        default_factory=list,
        description="Vazio = usa o conjunto padrão do papel.",
    )
    idioma: str = Field(default="pt", pattern=r"^(pt|en)$")
    status: str = Field(default="ativo", pattern=r"^(ativo|inativo)$")

    @field_validator("permissoes")
    @classmethod
    def permissoes_validas(cls, v: list[str]) -> list[str]:
        return _validar_permissoes(v)


class UsuarioUpdate(BaseModel):
    model_config = ESCRITA

    nome: str | None = Field(default=None, max_length=200)
    papel: PapelUsuario | None = None
    empresa_id: uuid.UUID | None = None
    permissoes: list[str] | None = None
    idioma: str | None = Field(default=None, pattern=r"^(pt|en)$")
    status: str | None = Field(default=None, pattern=r"^(ativo|inativo)$")

    @field_validator("permissoes")
    @classmethod
    def permissoes_validas(cls, v: list[str] | None) -> list[str] | None:
        return None if v is None else _validar_permissoes(v)


class SenhaUpdate(BaseModel):
    model_config = ESCRITA

    senha: str = Field(min_length=SENHA_MINIMA, max_length=200)


class UsuarioOut(Identificado):
    org_id: uuid.UUID
    login: str
    nome: str | None
    papel: PapelUsuario
    empresa_id: uuid.UUID | None
    permissoes: list[str]
    idioma: str
    status: str
    # Nunca sai daqui: senha_hash e oidc_sub.


class PermissaoOut(BaseModel):
    codigo: str
    papeis_padrao: list[PapelUsuario]
