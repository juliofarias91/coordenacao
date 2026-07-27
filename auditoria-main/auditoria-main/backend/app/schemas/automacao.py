"""Contratos da Fase 3 — validação de nomenclatura e auditoria automatizada."""

from __future__ import annotations

import uuid

from pydantic import BaseModel, Field

from app.schemas.comum import ESCRITA, Identificado


class ValidarNomeIn(BaseModel):
    model_config = ESCRITA

    nome: str = Field(
        min_length=1, max_length=300, description="Nome do arquivo, com ou sem extensão"
    )
    projeto_id: uuid.UUID
    empresa_id: uuid.UUID | None = Field(
        default=None, description="Responsável — obrigatório para registrar penalidade."
    )
    registrar: bool = Field(
        default=False,
        description=(
            "Se verdadeiro e o nome divergir, grava penalidade no ledger e cria "
            "notificação. Falso (padrão) só valida — a tela testa nomes sem punir."
        ),
    )


class SegmentoAvaliadoOut(BaseModel):
    k: str
    valor: str
    ok: bool
    esperados: list[str] = Field(default_factory=list)
    motivo: str | None = None


class ValidarNomeOut(BaseModel):
    ok: bool
    nome: str
    padrao: str = Field(description="Como o padrão do projeto se lê")
    mensagem: str
    segmentos: list[SegmentoAvaliadoOut]
    penalidade_id: uuid.UUID | None = Field(
        default=None, description="Preenchido apenas quando a penalidade foi registrada."
    )


class PenalidadeOut(Identificado):
    org_id: uuid.UUID
    empresa_id: uuid.UUID
    motivo: str
    peso: int
    referencia: str | None


class NotificacaoOut(Identificado):
    org_id: uuid.UUID
    usuario_id: uuid.UUID | None
    papel_alvo: str | None
    tipo: str
    mensagem: str
    origem: str | None
    lida: bool


class ExecucaoOut(BaseModel):
    versao_id: uuid.UUID
    auditorias: list[uuid.UUID]
    avaliados: int
    aprovados: int
    reprovados: int
    na: int
    preservados: int
    sem_verificador: int
    erros: list[str]
    resumo: str


class EnfileiradoOut(BaseModel):
    enfileirado: bool
    task_id: str | None = None
    detalhe: str
