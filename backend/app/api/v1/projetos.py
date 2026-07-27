"""SP-101 · Projetos.

CA: criar/editar projeto com código único por organização.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, get_tenant_db, requer_permissao
from app.core.pagination import Page, ParamsPagina, aplicar_cursor, montar_pagina
from app.models import Projeto
from app.schemas.projeto import ProjetoCreate, ProjetoOut, ProjetoUpdate
from app.services.escopo import conflito, exigir_projeto, ja_existe

router = APIRouter(prefix="/projetos", tags=["projetos"])


@router.get("", response_model=Page[ProjetoOut])
def listar(
    params: ParamsPagina = Depends(),
    db: Session = Depends(get_tenant_db),
    _: CurrentUser = Depends(requer_permissao("ver_painel")),
) -> Page[ProjetoOut]:
    stmt = aplicar_cursor(select(Projeto), Projeto, params)
    return montar_pagina(
        list(db.execute(stmt).scalars()), params, ProjetoOut.model_validate
    )


@router.post("", response_model=ProjetoOut, status_code=status.HTTP_201_CREATED)
def criar(
    payload: ProjetoCreate,
    db: Session = Depends(get_tenant_db),
    user: CurrentUser = Depends(requer_permissao("admin_cadastro")),
) -> ProjetoOut:
    codigo = payload.codigo.upper()
    if ja_existe(db, select(Projeto).where(Projeto.codigo == codigo)):
        raise conflito(f"já existe projeto com o código {codigo} nesta organização")

    projeto = Projeto(
        org_id=user.org_id,
        **payload.model_dump(exclude={"codigo"}),
        codigo=codigo,
    )
    db.add(projeto)
    db.flush()
    return ProjetoOut.model_validate(projeto)


@router.get("/{projeto_id}", response_model=ProjetoOut)
def obter(
    projeto_id: uuid.UUID,
    db: Session = Depends(get_tenant_db),
    _: CurrentUser = Depends(requer_permissao("ver_painel")),
) -> ProjetoOut:
    return ProjetoOut.model_validate(exigir_projeto(db, projeto_id))


@router.patch("/{projeto_id}", response_model=ProjetoOut)
def atualizar(
    projeto_id: uuid.UUID,
    payload: ProjetoUpdate,
    db: Session = Depends(get_tenant_db),
    _: CurrentUser = Depends(requer_permissao("admin_cadastro")),
) -> ProjetoOut:
    projeto = exigir_projeto(db, projeto_id)
    # `exclude_unset`: PATCH só mexe no que veio, e null é valor legítimo
    # (limpar o contato do cliente, por exemplo).
    for campo, valor in payload.model_dump(exclude_unset=True).items():
        setattr(projeto, campo, valor)
    db.flush()
    return ProjetoOut.model_validate(projeto)
