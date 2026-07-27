"""Peças reutilizadas pelos contratos das rotas."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

# `from_attributes` em tudo que sai do ORM; `str_strip_whitespace` porque
# código e nome digitados em formulário chegam com espaço sobrando.
LEITURA = ConfigDict(from_attributes=True)
ESCRITA = ConfigDict(str_strip_whitespace=True, extra="forbid")


class Identificado(BaseModel):
    model_config = LEITURA

    id: uuid.UUID
    created_at: datetime
    updated_at: datetime
