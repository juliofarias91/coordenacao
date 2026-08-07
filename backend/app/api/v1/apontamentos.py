"""SP-404 · Apontamentos (issues) e sincronização com o ACC.

CA: CRUD de apontamentos; sincronização (saída no piloto) com ACC Issues.

Só saída, de propósito: sincronização bidirecional exige resolver conflito
("quem ganha se os dois lados editaram?"), e essa é uma decisão de produto
que o piloto ainda não precisa tomar (decisão aberta nº 5 do plano técnico).
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, get_tenant_db, requer_permissao
from app.core.pagination import Page, ParamsPagina, aplicar_cursor, montar_pagina
from app.models import Apontamento, Empresa, Modelo
from app.schemas.comum import ESCRITA, Identificado
from app.services import aps, lixeira
from app.services.escopo import conflito, exigir, exigir_projeto_do_usuario

router = APIRouter(tags=["apontamentos"])

PRIORIDADES = ("alta", "media", "baixa")
STATUS = ("aberto", "em_analise", "resolvido")


class ApontamentoBase(BaseModel):
    model_config = ESCRITA

    titulo: str = Field(min_length=1, max_length=300)
    modelo_id: uuid.UUID | None = None
    disciplina: str | None = Field(default=None, max_length=40)
    prioridade: str = Field(default="media", pattern=r"^(alta|media|baixa)$")
    responsavel_id: uuid.UUID | None = None
    descricao: str | None = None


class ApontamentoCreate(ApontamentoBase):
    projeto_id: uuid.UUID


class ApontamentoUpdate(BaseModel):
    model_config = ESCRITA

    titulo: str | None = Field(default=None, min_length=1, max_length=300)
    modelo_id: uuid.UUID | None = None
    disciplina: str | None = Field(default=None, max_length=40)
    prioridade: str | None = Field(default=None, pattern=r"^(alta|media|baixa)$")
    status: str | None = Field(default=None, pattern=r"^(aberto|em_analise|resolvido)$")
    responsavel_id: uuid.UUID | None = None
    descricao: str | None = None


class ApontamentoOut(Identificado):
    org_id: uuid.UUID
    projeto_id: uuid.UUID
    codigo: str | None
    titulo: str
    modelo_id: uuid.UUID | None
    disciplina: str | None
    prioridade: str | None
    status: str
    responsavel_id: uuid.UUID | None
    descricao: str | None
    acc_issue_id: str | None


class SyncOut(BaseModel):
    sincronizado: bool
    acc_issue_id: str | None
    detalhe: str


def _proximo_codigo(db: Session, projeto_id: uuid.UUID) -> str:
    """AP-001, AP-002… sequencial por projeto, como no protótipo."""
    total = db.execute(
        select(Apontamento).where(Apontamento.projeto_id == projeto_id)
    ).scalars().all()
    return f"AP-{len(total) + 1:03d}"


@router.get("/apontamentos", response_model=Page[ApontamentoOut])
def listar(
    projeto_id: uuid.UUID | None = Query(default=None),
    status_filtro: str | None = Query(default=None, alias="status"),
    prioridade: str | None = Query(default=None),
    params: ParamsPagina = Depends(),
    db: Session = Depends(get_tenant_db),
    _: CurrentUser = Depends(requer_permissao("ver_painel")),
) -> Page[ApontamentoOut]:
    stmt = select(Apontamento)
    if projeto_id is not None:
        stmt = stmt.where(Apontamento.projeto_id == projeto_id)
    if status_filtro:
        stmt = stmt.where(Apontamento.status == status_filtro)
    if prioridade:
        stmt = stmt.where(Apontamento.prioridade == prioridade)
    stmt = aplicar_cursor(stmt, Apontamento, params)
    return montar_pagina(
        list(db.execute(stmt).scalars()), params, ApontamentoOut.model_validate
    )


@router.post("/apontamentos", response_model=ApontamentoOut, status_code=status.HTTP_201_CREATED)
def criar(
    payload: ApontamentoCreate,
    db: Session = Depends(get_tenant_db),
    user: CurrentUser = Depends(requer_permissao("executar")),
) -> ApontamentoOut:
    exigir_projeto_do_usuario(db, payload.projeto_id, user)
    if payload.modelo_id:
        exigir(db, Modelo, payload.modelo_id, "modelo")
    if payload.responsavel_id:
        exigir(db, Empresa, payload.responsavel_id, "empresa responsável")

    apontamento = Apontamento(
        org_id=user.org_id,
        codigo=_proximo_codigo(db, payload.projeto_id),
        **payload.model_dump(),
    )
    db.add(apontamento)
    db.flush()
    return ApontamentoOut.model_validate(apontamento)


@router.get("/apontamentos/{apontamento_id}", response_model=ApontamentoOut)
def obter(
    apontamento_id: uuid.UUID,
    db: Session = Depends(get_tenant_db),
    _: CurrentUser = Depends(requer_permissao("ver_painel")),
) -> ApontamentoOut:
    return ApontamentoOut.model_validate(
        exigir(db, Apontamento, apontamento_id, "apontamento")
    )


@router.patch("/apontamentos/{apontamento_id}", response_model=ApontamentoOut)
def atualizar(
    apontamento_id: uuid.UUID,
    payload: ApontamentoUpdate,
    db: Session = Depends(get_tenant_db),
    _: CurrentUser = Depends(requer_permissao("executar")),
) -> ApontamentoOut:
    apontamento = exigir(db, Apontamento, apontamento_id, "apontamento")
    dados = payload.model_dump(exclude_unset=True)
    if dados.get("modelo_id"):
        exigir(db, Modelo, dados["modelo_id"], "modelo")
    if dados.get("responsavel_id"):
        exigir(db, Empresa, dados["responsavel_id"], "empresa responsável")
    for campo, valor in dados.items():
        setattr(apontamento, campo, valor)
    db.flush()
    return ApontamentoOut.model_validate(apontamento)


@router.delete("/apontamentos/{apontamento_id}", status_code=status.HTTP_204_NO_CONTENT)
def remover(
    apontamento_id: uuid.UUID,
    db: Session = Depends(get_tenant_db),
    _: CurrentUser = Depends(requer_permissao("executar")),
) -> None:
    lixeira.remover(db, exigir(db, Apontamento, apontamento_id, "apontamento"))


@router.post("/apontamentos/{apontamento_id}/sync-acc", response_model=SyncOut)
def sincronizar_com_acc(
    apontamento_id: uuid.UUID,
    db: Session = Depends(get_tenant_db),
    _: CurrentUser = Depends(requer_permissao("executar")),
) -> SyncOut:
    """Publica o apontamento como issue no ACC.

    Sem credencial configurada a resposta diz o que falta, em vez de estourar
    — a integração é opcional no piloto, e o apontamento continua válido
    dentro da plataforma.
    """
    apontamento = exigir(db, Apontamento, apontamento_id, "apontamento")

    if not aps.configurado():
        return SyncOut(
            sincronizado=False,
            acc_issue_id=apontamento.acc_issue_id,
            detalhe="APS_CLIENT_ID/APS_CLIENT_SECRET ausentes; integração com o ACC desligada",
        )
    if not apontamento.acc_issue_id:
        raise conflito(
            "publicação de issue no ACC ainda não verificada contra a Autodesk "
            "(decisão aberta nº 3); vincule o issue manualmente por enquanto"
        )
    return SyncOut(
        sincronizado=True,
        acc_issue_id=apontamento.acc_issue_id,
        detalhe="apontamento já vinculado a um issue do ACC",
    )
