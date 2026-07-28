"""Clientes — quem contrata a auditoria (migration 0003).

Não confundir com `empresas`: empresa produz o modelo e responde por
não-conformidade; cliente recebe o relatório. São lados opostos da mesa.

`GET /clientes/pastas` é o que a home consome — cliente com a contagem de
projetos, numa consulta só.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, get_tenant_db, requer_permissao
from app.core.pagination import Page, ParamsPagina, aplicar_cursor, montar_pagina
from app.models import Cliente, Projeto
from app.schemas.cliente import ClienteComProjetos, ClienteCreate, ClienteOut, ClienteUpdate
from app.services.escopo import conflito, exigir, ja_existe

router = APIRouter(prefix="/clientes", tags=["clientes"])


def _exigir_cliente(db: Session, cliente_id: uuid.UUID) -> Cliente:
    return exigir(db, Cliente, cliente_id, "cliente")


@router.get("", response_model=Page[ClienteOut])
def listar(
    params: ParamsPagina = Depends(),
    db: Session = Depends(get_tenant_db),
    _: CurrentUser = Depends(requer_permissao("ver_painel")),
) -> Page[ClienteOut]:
    stmt = aplicar_cursor(select(Cliente), Cliente, params)
    return montar_pagina(list(db.execute(stmt).scalars()), params, ClienteOut.model_validate)


@router.get("/pastas", response_model=list[ClienteComProjetos])
def pastas(
    db: Session = Depends(get_tenant_db),
    _: CurrentUser = Depends(requer_permissao("ver_painel")),
) -> list[ClienteComProjetos]:
    """Clientes com a contagem de projetos — as pastas da home.

    LEFT JOIN e não subconsulta por linha: cliente recém-criado, ainda sem
    projeto, precisa aparecer na home — senão criá-lo pela tela de admin não
    produz efeito visível e parece que falhou.
    """
    stmt = (
        select(Cliente, func.count(Projeto.id).label("projetos"))
        .outerjoin(Projeto, Projeto.cliente_id == Cliente.id)
        .group_by(Cliente.id)
        .order_by(Cliente.nome)
    )
    return [
        ClienteComProjetos(**ClienteOut.model_validate(cliente).model_dump(), projetos=total)
        for cliente, total in db.execute(stmt).all()
    ]


@router.post("", response_model=ClienteOut, status_code=status.HTTP_201_CREATED)
def criar(
    payload: ClienteCreate,
    db: Session = Depends(get_tenant_db),
    user: CurrentUser = Depends(requer_permissao("admin_cadastro")),
) -> ClienteOut:
    nome = payload.nome.strip()
    # Comparação sem caixa: o motivo de o cliente ter virado entidade foi
    # justamente 'Microsoft' e 'microsoft' virarem duas pastas.
    if ja_existe(db, select(Cliente).where(func.lower(Cliente.nome) == nome.lower())):
        raise conflito(f"já existe cliente chamado {nome} nesta organização")

    dados = payload.model_dump(exclude={"nome", "email"})
    cliente = Cliente(
        org_id=user.org_id,
        nome=nome,
        email=str(payload.email) if payload.email else None,
        **dados,
    )
    db.add(cliente)
    db.flush()
    return ClienteOut.model_validate(cliente)


@router.get("/{cliente_id}", response_model=ClienteOut)
def obter(
    cliente_id: uuid.UUID,
    db: Session = Depends(get_tenant_db),
    _: CurrentUser = Depends(requer_permissao("ver_painel")),
) -> ClienteOut:
    return ClienteOut.model_validate(_exigir_cliente(db, cliente_id))


@router.patch("/{cliente_id}", response_model=ClienteOut)
def atualizar(
    cliente_id: uuid.UUID,
    payload: ClienteUpdate,
    db: Session = Depends(get_tenant_db),
    _: CurrentUser = Depends(requer_permissao("admin_cadastro")),
) -> ClienteOut:
    cliente = _exigir_cliente(db, cliente_id)
    dados = payload.model_dump(exclude_unset=True)

    if (nome := dados.get("nome")) is not None:
        nome = nome.strip()
        duplicado = select(Cliente).where(
            func.lower(Cliente.nome) == nome.lower(), Cliente.id != cliente_id
        )
        if ja_existe(db, duplicado):
            raise conflito(f"já existe cliente chamado {nome} nesta organização")
        dados["nome"] = nome
    if "email" in dados and dados["email"] is not None:
        dados["email"] = str(dados["email"])

    for campo, valor in dados.items():
        setattr(cliente, campo, valor)
    db.flush()
    return ClienteOut.model_validate(cliente)


@router.delete("/{cliente_id}", status_code=status.HTTP_204_NO_CONTENT)
def remover(
    cliente_id: uuid.UUID,
    db: Session = Depends(get_tenant_db),
    _: CurrentUser = Depends(requer_permissao("admin_cadastro")),
) -> None:
    """Apaga o cliente. Os projetos dele ficam sem cliente, não são apagados.

    É a FK com `ON DELETE SET NULL` fazendo o trabalho: histórico de auditoria
    não pode desaparecer porque alguém removeu um cadastro.
    """
    db.delete(_exigir_cliente(db, cliente_id))
    db.flush()
