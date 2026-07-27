"""SP-101 · Projeto e cliente."""

from __future__ import annotations

import uuid

from pydantic import BaseModel, Field

from app.schemas.comum import ESCRITA, Identificado

STATUS_PROJETO = ("config", "ativo", "piloto", "encerrado")


class ProjetoBase(BaseModel):
    model_config = ESCRITA

    nome: str = Field(min_length=1, max_length=200)
    cliente: str | None = Field(default=None, max_length=200)
    cliente_contato: str | None = Field(default=None, max_length=200)
    coordenacao: str | None = Field(default=None, max_length=200)
    bep_ref: str | None = Field(
        default=None,
        max_length=200,
        description="Documento normativo vigente (ex.: 'A5.3.2 · Construction BEP')",
    )


class ProjetoCreate(ProjetoBase):
    codigo: str = Field(
        min_length=1,
        max_length=40,
        pattern=r"^[A-Za-z0-9_-]+$",
        description="Único na organização (ex.: 'CPQ11'). É o 1º segmento da nomenclatura.",
    )
    status: str = Field(default="config", pattern=r"^(config|ativo|piloto|encerrado)$")


class ProjetoUpdate(BaseModel):
    model_config = ESCRITA

    nome: str | None = Field(default=None, min_length=1, max_length=200)
    cliente: str | None = Field(default=None, max_length=200)
    cliente_contato: str | None = Field(default=None, max_length=200)
    coordenacao: str | None = Field(default=None, max_length=200)
    bep_ref: str | None = Field(default=None, max_length=200)
    status: str | None = Field(default=None, pattern=r"^(config|ativo|piloto|encerrado)$")


class ProjetoOut(Identificado):
    org_id: uuid.UUID
    codigo: str
    nome: str
    cliente: str | None
    cliente_contato: str | None
    coordenacao: str | None
    bep_ref: str | None
    status: str
