"""SP-201/202 · Modelos BIM e suas versões."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.models.enums import VersaoFormato
from app.schemas.comum import ESCRITA, Identificado


class ModeloBase(BaseModel):
    model_config = ESCRITA

    disciplina_id: uuid.UUID | None = None
    instaladora_id: uuid.UUID | None = Field(
        default=None, description="Empresa trade — responsável pela entrega."
    )
    modeladora_id: uuid.UUID | None = Field(
        default=None, description="Empresa BIM — quem de fato modela."
    )
    acc_item_id: str | None = Field(
        default=None, max_length=200, description="Item correspondente no ACC."
    )


class ModeloCreate(ModeloBase):
    projeto_id: uuid.UUID
    codigo: str = Field(
        min_length=1,
        max_length=120,
        description="Nome do arquivo sem extensão (ex.: 'CPQ11-C-STRC-STEEL-A12-R22').",
    )


class ModeloUpdate(ModeloBase):
    pass


class ModeloOut(Identificado):
    org_id: uuid.UUID
    projeto_id: uuid.UUID
    codigo: str
    disciplina_id: uuid.UUID | None
    instaladora_id: uuid.UUID | None
    modeladora_id: uuid.UUID | None
    acc_item_id: str | None


class VersaoCreate(BaseModel):
    model_config = ESCRITA

    versao: str = Field(min_length=1, max_length=20, description="V1, V2…")
    formato: VersaoFormato
    round: int | None = Field(default=None, ge=1)
    autoria: str | None = Field(
        default=None, max_length=60, description="Ferramenta de origem (Revit, Tekla→IFC)."
    )
    acc_version: str | None = Field(default=None, max_length=20)   # R22 | R24
    urn: str | None = Field(default=None, max_length=500)


class VersaoOut(Identificado):
    org_id: uuid.UUID
    modelo_id: uuid.UUID
    versao: str
    round: int | None
    formato: VersaoFormato
    autoria: str | None
    acc_version: str | None
    arquivo_url: str | None
    urn: str | None
    publicado_em: datetime | None


class ModeloDetalhe(ModeloOut):
    versoes: list[VersaoOut] = Field(default_factory=list)
