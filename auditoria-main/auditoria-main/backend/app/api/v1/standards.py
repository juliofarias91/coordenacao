"""SP-104 · Standards e padrão de nomenclatura.

CA: CRUD de standards; padrão de nomenclatura armazenado como segmentos
(jsonb) editável por segmento.

O padrão de nomenclatura tem uma rota própria (`/projetos/{id}/nomenclatura`)
porque é *um* por projeto e é o insumo do validador da Fase 3 (SP-301).
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, get_tenant_db, requer_permissao
from app.core.pagination import Page, ParamsPagina, aplicar_cursor, montar_pagina
from app.models import NomenclaturaPadrao, Standard
from app.schemas.standard import (
    NomenclaturaIn,
    NomenclaturaOut,
    StandardCreate,
    StandardOut,
    StandardUpdate,
)
from app.services.escopo import exigir, exigir_projeto

router = APIRouter(tags=["standards"])


# ----------------------------------------------------------------- standards
@router.get("/standards", response_model=Page[StandardOut])
def listar(
    projeto_id: uuid.UUID | None = Query(default=None),
    tipo: str | None = Query(default=None),
    params: ParamsPagina = Depends(),
    db: Session = Depends(get_tenant_db),
    _: CurrentUser = Depends(requer_permissao("ver_painel")),
) -> Page[StandardOut]:
    stmt = select(Standard)
    if projeto_id is not None:
        stmt = stmt.where(Standard.projeto_id == projeto_id)
    if tipo:
        stmt = stmt.where(Standard.tipo == tipo)
    stmt = aplicar_cursor(stmt, Standard, params)
    return montar_pagina(list(db.execute(stmt).scalars()), params, StandardOut.model_validate)


@router.post("/standards", response_model=StandardOut, status_code=status.HTTP_201_CREATED)
def criar(
    payload: StandardCreate,
    db: Session = Depends(get_tenant_db),
    user: CurrentUser = Depends(requer_permissao("admin_cadastro")),
) -> StandardOut:
    exigir_projeto(db, payload.projeto_id)
    standard = Standard(org_id=user.org_id, **payload.model_dump())
    db.add(standard)
    db.flush()
    return StandardOut.model_validate(standard)


@router.get("/standards/{standard_id}", response_model=StandardOut)
def obter(
    standard_id: uuid.UUID,
    db: Session = Depends(get_tenant_db),
    _: CurrentUser = Depends(requer_permissao("ver_painel")),
) -> StandardOut:
    return StandardOut.model_validate(exigir(db, Standard, standard_id, "standard"))


@router.patch("/standards/{standard_id}", response_model=StandardOut)
def atualizar(
    standard_id: uuid.UUID,
    payload: StandardUpdate,
    db: Session = Depends(get_tenant_db),
    _: CurrentUser = Depends(requer_permissao("admin_cadastro")),
) -> StandardOut:
    standard = exigir(db, Standard, standard_id, "standard")
    for campo, valor in payload.model_dump(exclude_unset=True).items():
        setattr(standard, campo, valor)
    db.flush()
    return StandardOut.model_validate(standard)


# --------------------------------------------------------------- nomenclatura
@router.get("/projetos/{projeto_id}/nomenclatura", response_model=NomenclaturaOut)
def obter_nomenclatura(
    projeto_id: uuid.UUID,
    db: Session = Depends(get_tenant_db),
    _: CurrentUser = Depends(requer_permissao("ver_painel")),
) -> NomenclaturaOut:
    exigir_projeto(db, projeto_id)
    padrao = db.execute(
        select(NomenclaturaPadrao)
        .where(NomenclaturaPadrao.projeto_id == projeto_id, NomenclaturaPadrao.vigente.is_(True))
        .order_by(NomenclaturaPadrao.created_at.desc())
    ).scalars().first()
    if padrao is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="projeto ainda não tem padrão de nomenclatura",
        )
    return NomenclaturaOut.model_validate(padrao)


@router.put("/projetos/{projeto_id}/nomenclatura", response_model=NomenclaturaOut)
def definir_nomenclatura(
    projeto_id: uuid.UUID,
    payload: NomenclaturaIn,
    db: Session = Depends(get_tenant_db),
    user: CurrentUser = Depends(requer_permissao("admin_cadastro")),
) -> NomenclaturaOut:
    """Substitui o padrão vigente, guardando o anterior.

    A especificação fala em "versão vigente e sugestão de revisão": em vez de
    sobrescrever, o padrão antigo é marcado como não vigente. Auditorias já
    publicadas continuam explicáveis pelo padrão que valia na época.
    """
    exigir_projeto(db, projeto_id)

    anteriores = db.execute(
        select(NomenclaturaPadrao).where(
            NomenclaturaPadrao.projeto_id == projeto_id, NomenclaturaPadrao.vigente.is_(True)
        )
    ).scalars()
    for antigo in anteriores:
        antigo.vigente = False

    novo = NomenclaturaPadrao(
        org_id=user.org_id,
        projeto_id=projeto_id,
        segmentos=[s.model_dump() for s in payload.segmentos],
        vigente=True,
    )
    db.add(novo)
    db.flush()
    return NomenclaturaOut.model_validate(novo)
