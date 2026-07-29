"""Reporte de erro do sistema (migration 0005)."""

from __future__ import annotations

import uuid

from pydantic import BaseModel, Field

from app.schemas.comum import ESCRITA, Identificado

STATUS_REPORTE = ("aberto", "em_analise", "resolvido", "recusado")


class ReporteCreate(BaseModel):
    model_config = ESCRITA

    titulo: str = Field(min_length=1, max_length=200)
    descricao: str | None = None
    # A URL em que a pessoa estava. Preenchida pelo cliente, não digitada:
    # "não funciona" sem a tela é um chamado que começa com uma pergunta.
    caminho: str | None = Field(default=None, max_length=500)


class ReporteUpdate(BaseModel):
    model_config = ESCRITA

    # `titulo` e `descricao` NÃO entram: são o relato de outra pessoa, e
    # reescrevê-lo apagaria o que ela de fato disse.
    status: str | None = Field(default=None, pattern=r"^(aberto|em_analise|resolvido|recusado)$")
    resposta: str | None = None


class ReporteOut(Identificado):
    org_id: uuid.UUID
    usuario_id: uuid.UUID | None
    titulo: str
    descricao: str | None
    caminho: str | None
    print_url: str | None
    status: str
    resposta: str | None

    # Derivados: a tela lista pessoas, não ids — e resolver no servidor evita
    # uma consulta por linha do outro lado.
    usuario_nome: str | None = None
    usuario_login: str | None = None
