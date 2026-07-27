"""SP-105 · Disciplinas.

CA: disciplina amarra projetista + checklists aplicáveis + nomenclatura +
áreas; código único por projeto.

O `codigo` (ex.: 'STRC-STEEL') não é digitado: deriva de `disc`-`sub`, para
não haver como o código divergir dos campos que o compõem.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, get_tenant_db, requer_permissao
from app.core.pagination import Page, ParamsPagina, aplicar_cursor, montar_pagina
from app.models import Disciplina, Empresa, Standard
from app.models.enums import MacroDisc
from app.schemas.disciplina import DisciplinaCreate, DisciplinaOut, DisciplinaUpdate
from app.services.escopo import conflito, exigir, exigir_projeto, ja_existe

router = APIRouter(prefix="/disciplinas", tags=["disciplinas"])


def _codigo(disc: str, sub: str) -> str:
    return f"{disc.upper()}-{sub.upper()}"


def _validar_referencias(
    db: Session, projetista_id: uuid.UUID | None, nomenclatura_id: uuid.UUID | None
) -> None:
    if projetista_id is not None:
        exigir(db, Empresa, projetista_id, "empresa projetista")
    if nomenclatura_id is not None:
        standard = exigir(db, Standard, nomenclatura_id, "standard de nomenclatura")
        if standard.tipo != "nomenclatura":
            raise conflito(
                f"o standard '{standard.nome}' é do tipo '{standard.tipo}', "
                "não serve como nomenclatura"
            )


@router.get("", response_model=Page[DisciplinaOut])
def listar(
    projeto_id: uuid.UUID | None = Query(default=None),
    macro: MacroDisc | None = Query(default=None),
    projetista_id: uuid.UUID | None = Query(default=None),
    params: ParamsPagina = Depends(),
    db: Session = Depends(get_tenant_db),
    _: CurrentUser = Depends(requer_permissao("ver_painel")),
) -> Page[DisciplinaOut]:
    stmt = select(Disciplina)
    if projeto_id is not None:
        stmt = stmt.where(Disciplina.projeto_id == projeto_id)
    if macro is not None:
        stmt = stmt.where(Disciplina.macro == macro)
    if projetista_id is not None:
        stmt = stmt.where(Disciplina.projetista_id == projetista_id)
    stmt = aplicar_cursor(stmt, Disciplina, params)
    return montar_pagina(list(db.execute(stmt).scalars()), params, DisciplinaOut.model_validate)


@router.post("", response_model=DisciplinaOut, status_code=status.HTTP_201_CREATED)
def criar(
    payload: DisciplinaCreate,
    db: Session = Depends(get_tenant_db),
    user: CurrentUser = Depends(requer_permissao("admin_cadastro")),
) -> DisciplinaOut:
    exigir_projeto(db, payload.projeto_id)
    _validar_referencias(db, payload.projetista_id, payload.nomenclatura_id)

    codigo = _codigo(payload.disc, payload.sub)
    if ja_existe(
        db,
        select(Disciplina).where(
            Disciplina.projeto_id == payload.projeto_id, Disciplina.codigo == codigo
        ),
    ):
        raise conflito(f"já existe a disciplina {codigo} neste projeto")

    disciplina = Disciplina(
        org_id=user.org_id,
        codigo=codigo,
        **payload.model_dump(exclude={"disc", "sub"}),
        disc=payload.disc.upper(),
        sub=payload.sub.upper(),
    )
    db.add(disciplina)
    db.flush()
    return DisciplinaOut.model_validate(disciplina)


@router.get("/{disciplina_id}", response_model=DisciplinaOut)
def obter(
    disciplina_id: uuid.UUID,
    db: Session = Depends(get_tenant_db),
    _: CurrentUser = Depends(requer_permissao("ver_painel")),
) -> DisciplinaOut:
    return DisciplinaOut.model_validate(exigir(db, Disciplina, disciplina_id, "disciplina"))


@router.patch("/{disciplina_id}", response_model=DisciplinaOut)
def atualizar(
    disciplina_id: uuid.UUID,
    payload: DisciplinaUpdate,
    db: Session = Depends(get_tenant_db),
    _: CurrentUser = Depends(requer_permissao("admin_cadastro")),
) -> DisciplinaOut:
    disciplina = exigir(db, Disciplina, disciplina_id, "disciplina")
    dados = payload.model_dump(exclude_unset=True)

    _validar_referencias(db, dados.get("projetista_id"), dados.get("nomenclatura_id"))

    if "disc" in dados:
        dados["disc"] = dados["disc"].upper()
    if "sub" in dados:
        dados["sub"] = dados["sub"].upper()

    # Mexer em disc/sub muda o código derivado — refaz e revalida a unicidade.
    if "disc" in dados or "sub" in dados:
        novo_codigo = _codigo(dados.get("disc", disciplina.disc), dados.get("sub", disciplina.sub))
        if novo_codigo != disciplina.codigo and ja_existe(
            db,
            select(Disciplina).where(
                Disciplina.projeto_id == disciplina.projeto_id,
                Disciplina.codigo == novo_codigo,
                Disciplina.id != disciplina_id,
            ),
        ):
            raise conflito(f"já existe a disciplina {novo_codigo} neste projeto")
        dados["codigo"] = novo_codigo

    for campo, valor in dados.items():
        setattr(disciplina, campo, valor)
    db.flush()
    return DisciplinaOut.model_validate(disciplina)
