"""SP-104 · Standards e o padrão de nomenclatura."""

from __future__ import annotations

import uuid
from typing import Any

from pydantic import BaseModel, Field, field_validator

from app.schemas.comum import ESCRITA, Identificado

# Tipos de standard (especificação, seção 2.3), mais os dois do PEB.
#
# `diretriz` e `setorizacao` entraram com a tela de PEB e NÃO exigiram
# migration: `standard.tipo` é coluna de TEXTO no banco, não enum do Postgres —
# quem restringe é o `pattern` daqui. Uma tabela separada para diretriz teria
# duplicado projeto_id, RLS, CRUD e trilha para guardar título e texto.
#
#   diretriz     — uma regra do PEB. `nome` é o título, `referencia` é o texto.
#   setorizacao  — a imagem de referência de um setor. `nome` é o setor
#                  (ADMIN, COLO1…), `referencia_url` é a chave no S3.
TIPOS_STANDARD = (
    "nomenclatura",
    "conjunto_esperado",
    "vocabulario",
    "mapeamento",
    "diretriz",
    "setorizacao",
)


class StandardBase(BaseModel):
    model_config = ESCRITA

    nome: str = Field(min_length=1, max_length=200)
    tipo: str = Field(
        pattern=r"^(nomenclatura|conjunto_esperado|vocabulario|mapeamento|diretriz|setorizacao)$",
        description=(
            "nomenclatura=padrão de nome · conjunto_esperado=lista fechada (worksets) · "
            "vocabulario=dicionário (IfcElementAssembly) · mapeamento=de/para (Revit↔Tekla↔IFC) · "
            "diretriz=regra do PEB (nome=título, referencia=texto) · "
            "setorizacao=imagem do setor (nome=setor, referencia_url=chave no S3)"
        ),
    )
    referencia: str | None = Field(default=None, max_length=300)
    conteudo: dict[str, Any] | None = Field(
        default=None, description="Corpo do padrão (lista de worksets, dicionário, de/para…)"
    )
    referencia_url: str | None = Field(default=None, max_length=500)


class StandardCreate(StandardBase):
    projeto_id: uuid.UUID


class StandardUpdate(BaseModel):
    model_config = ESCRITA

    nome: str | None = Field(default=None, min_length=1, max_length=200)
    tipo: str | None = Field(
        default=None,
        pattern=r"^(nomenclatura|conjunto_esperado|vocabulario|mapeamento|diretriz|setorizacao)$",
    )
    referencia: str | None = Field(default=None, max_length=300)
    conteudo: dict[str, Any] | None = None
    referencia_url: str | None = Field(default=None, max_length=500)


class StandardOut(Identificado):
    org_id: uuid.UUID
    projeto_id: uuid.UUID
    nome: str
    tipo: str
    referencia: str | None
    conteudo: dict[str, Any] | None
    referencia_url: str | None


# --------------------------------------------------------------- nomenclatura
class Segmento(BaseModel):
    model_config = ESCRITA

    k: str = Field(
        min_length=1,
        max_length=40,
        description="Rótulo do segmento (PROJETO, MACRO, DISC, SUB, SETOR, SW)",
    )
    vals: list[str] = Field(
        default_factory=list,
        description="Valores aceitos. Vazio = segmento livre, basta existir.",
    )
    opcional: bool = Field(
        default=False,
        description=(
            "Segmento que pode faltar no fim do nome. É o caso do sufixo de "
            "software: R22/R24/RX3 codificam a origem, mas somem para outras "
            "ferramentas — Navisworks entrega 'CPQ11-C-STRC-CONCR-A12'."
        ),
    )


class NomenclaturaIn(BaseModel):
    model_config = ESCRITA

    segmentos: list[Segmento] = Field(min_length=1)

    @field_validator("segmentos")
    @classmethod
    def sem_rotulos_repetidos(cls, v: list[Segmento]) -> list[Segmento]:
        rotulos = [s.k.upper() for s in v]
        repetidos = sorted({r for r in rotulos if rotulos.count(r) > 1})
        if repetidos:
            raise ValueError(f"segmento repetido: {', '.join(repetidos)}")
        return v


class NomenclaturaOut(Identificado):
    org_id: uuid.UUID
    projeto_id: uuid.UUID
    segmentos: list[Segmento]
    vigente: bool

    @property
    def exemplo(self) -> str:
        """Como o padrão se lê: PROJETO-MACRO-DISC-SUB-SETOR-SW."""
        return "-".join(s.k for s in self.segmentos)
