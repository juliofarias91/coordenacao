"""SP-102 · Empresas (projetistas), contatos e cadeia de subcontratação."""

from __future__ import annotations

import uuid

from pydantic import BaseModel, EmailStr, Field

from app.models.enums import EmpresaPapel, EmpresaTipo
from app.schemas.comum import ESCRITA, Identificado


class ContatoBase(BaseModel):
    model_config = ESCRITA

    nome: str | None = Field(default=None, max_length=200)
    cargo: str | None = Field(default=None, max_length=120)
    email: EmailStr | None = None
    telefone: str | None = Field(default=None, max_length=40)
    departamento: str | None = Field(default=None, max_length=120)
    disciplina: str | None = Field(
        default=None, max_length=40, description="Código da disciplina (ex.: 'ARCH-CEIL')"
    )


class ContatoCreate(ContatoBase):
    pass


class ContatoUpdate(ContatoBase):
    pass


class ContatoOut(Identificado):
    empresa_id: uuid.UUID
    nome: str | None
    cargo: str | None
    email: str | None
    telefone: str | None
    departamento: str | None
    disciplina: str | None


class EmpresaBase(BaseModel):
    model_config = ESCRITA

    nome: str = Field(min_length=1, max_length=200)
    cnpj: str | None = Field(default=None, max_length=20)
    tipo: EmpresaTipo = EmpresaTipo.TERCEIRIZADA
    contratada_por: uuid.UUID | None = Field(
        default=None, description="Empresa que contratou esta — a cadeia de subcontratação."
    )
    papeis: list[EmpresaPapel] = Field(
        default_factory=list,
        description="trade=instaladora · bim=modeladora · fornecedor · coordenacao",
    )
    ferramenta: str | None = Field(default=None, max_length=60)   # Revit | Tekla
    departamento: str | None = Field(default=None, max_length=120)
    disciplinas: str | None = Field(
        default=None, max_length=200, description="Rótulo livre (ex.: 'STRC / ARCH')"
    )
    status: str = Field(default="ativo", pattern=r"^(ativo|inativo)$")


class EmpresaCreate(EmpresaBase):
    pass


class EmpresaUpdate(BaseModel):
    model_config = ESCRITA

    nome: str | None = Field(default=None, min_length=1, max_length=200)
    cnpj: str | None = Field(default=None, max_length=20)
    tipo: EmpresaTipo | None = None
    contratada_por: uuid.UUID | None = None
    papeis: list[EmpresaPapel] | None = None
    ferramenta: str | None = Field(default=None, max_length=60)
    departamento: str | None = Field(default=None, max_length=120)
    disciplinas: str | None = Field(default=None, max_length=200)
    status: str | None = Field(default=None, pattern=r"^(ativo|inativo)$")


class EmpresaOut(Identificado):
    org_id: uuid.UUID
    nome: str
    cnpj: str | None
    tipo: EmpresaTipo
    contratada_por: uuid.UUID | None
    papeis: list[EmpresaPapel]
    ferramenta: str | None
    departamento: str | None
    disciplinas: str | None
    logo_url: str | None
    status: str
    # Contador materializado do ledger `penalidade` — só leitura.
    penalidades: int


class EmpresaDetalhe(EmpresaOut):
    contatos: list[ContatoOut] = Field(default_factory=list)
