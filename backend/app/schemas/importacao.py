"""Contratos da importação de planilha (provisória — ver a migration 0012)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel

from app.schemas.comum import LEITURA


class PlanilhaOut(BaseModel):
    model_config = LEITURA

    id: uuid.UUID
    tipo: str
    arquivo: str
    disciplina: str
    modelo: str | None
    versao: str | None
    #: Recontada a partir das linhas.
    aprovacao: float | None
    #: A que o Excel declara. A tela compara as duas — numa das planilhas reais
    #: a fórmula está quebrada e declara metade do valor certo.
    aprovacao_declarada: float | None
    itens: int
    aprovados: int
    created_at: datetime


class RecusaOut(BaseModel):
    """Um arquivo que não entrou, e por quê. O upload é tolerante a falha
    parcial: as outras planilhas do lote já estão gravadas."""

    arquivo: str
    motivo: str


class ResultadoImportacao(BaseModel):
    importadas: list[PlanilhaOut]
    recusadas: list[RecusaOut]


class FatiaDashboard(BaseModel):
    """Um recorte da média. `aprovacao` é PONDERADA pelos itens, não a média das
    porcentagens — uma planilha de 191 linhas não pode pesar o mesmo que uma de
    54 na mesma conta."""

    rotulo: str
    planilhas: int
    itens: int
    aprovados: int
    aprovacao: float | None


class ItemCritico(BaseModel):
    """Um item que reprova em mais de uma planilha — a pergunta que a planilha
    isolada não responde."""

    tipo: str
    item: str
    ocorrencias: int
    reprovacoes: int
    taxa: float


class Dashboard(BaseModel):
    total: FatiaDashboard
    por_tipo: list[FatiaDashboard]
    por_disciplina: list[FatiaDashboard]
    criticos: list[ItemCritico]
    planilhas: list[PlanilhaOut]
