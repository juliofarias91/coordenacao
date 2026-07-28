"""Cliente — quem contrata a auditoria (migration 0003)."""

from __future__ import annotations

import uuid

from pydantic import BaseModel, EmailStr, Field

from app.schemas.comum import ESCRITA, Identificado

STATUS_CLIENTE = ("ativo", "inativo")


class ClienteBase(BaseModel):
    model_config = ESCRITA

    nome: str = Field(min_length=1, max_length=200)
    contato: str | None = Field(default=None, max_length=200)
    email: EmailStr | None = None


class ClienteCreate(ClienteBase):
    status: str = Field(default="ativo", pattern=r"^(ativo|inativo)$")


class ClienteUpdate(BaseModel):
    model_config = ESCRITA

    nome: str | None = Field(default=None, min_length=1, max_length=200)
    contato: str | None = Field(default=None, max_length=200)
    email: EmailStr | None = None
    status: str | None = Field(default=None, pattern=r"^(ativo|inativo)$")


class ClienteOut(Identificado):
    org_id: uuid.UUID
    nome: str
    contato: str | None
    email: str | None
    status: str


class ClienteComProjetos(ClienteOut):
    """Cliente com a contagem de projetos — o formato das pastas da home.

    A contagem vem agregada no SQL, e não de carregar os projetos: a home lista
    todos os clientes, e uma consulta por pasta seria N+1 na tela de entrada.
    """

    projetos: int = 0
