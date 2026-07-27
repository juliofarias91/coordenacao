"""SP-103 · Usuários e permissões.

CA: papéis e permissões finas persistidos; papel `cliente` isolado; status
ativo/inativo respeitado no login.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, get_current_user, get_tenant_db, requer_permissao
from app.core.pagination import Page, ParamsPagina, aplicar_cursor, montar_pagina
from app.core.security import hash_password
from app.models import Empresa, Usuario
from app.models.enums import PERMISSOES, PERMISSOES_POR_PAPEL, PapelUsuario
from app.schemas.usuario import (
    PermissaoOut,
    SenhaUpdate,
    UsuarioCreate,
    UsuarioOut,
    UsuarioUpdate,
)
from app.services.escopo import conflito, exigir, ja_existe

router = APIRouter(prefix="/usuarios", tags=["usuarios"])


@router.get("/permissoes", response_model=list[PermissaoOut])
def catalogo_de_permissoes(
    _: CurrentUser = Depends(requer_permissao("ver_painel")),
) -> list[PermissaoOut]:
    """Catálogo para a tela de cadastro montar os checkboxes sem hardcode."""
    return [
        PermissaoOut(
            codigo=p,
            papeis_padrao=[papel for papel, perms in PERMISSOES_POR_PAPEL.items() if p in perms],
        )
        for p in PERMISSOES
    ]


@router.get("", response_model=Page[UsuarioOut])
def listar(
    papel: PapelUsuario | None = Query(default=None),
    empresa_id: uuid.UUID | None = Query(default=None),
    params: ParamsPagina = Depends(),
    db: Session = Depends(get_tenant_db),
    _: CurrentUser = Depends(requer_permissao("admin_cadastro")),
) -> Page[UsuarioOut]:
    stmt = select(Usuario)
    if papel is not None:
        stmt = stmt.where(Usuario.papel == papel)
    if empresa_id is not None:
        stmt = stmt.where(Usuario.empresa_id == empresa_id)
    stmt = aplicar_cursor(stmt, Usuario, params)
    return montar_pagina(list(db.execute(stmt).scalars()), params, UsuarioOut.model_validate)


@router.post("", response_model=UsuarioOut, status_code=status.HTTP_201_CREATED)
def criar(
    payload: UsuarioCreate,
    db: Session = Depends(get_tenant_db),
    user: CurrentUser = Depends(requer_permissao("admin_cadastro")),
) -> UsuarioOut:
    login = str(payload.login).strip().lower()
    if ja_existe(db, select(Usuario).where(Usuario.login == login)):
        raise conflito(f"já existe usuário {login} nesta organização")

    if payload.empresa_id is not None:
        exigir(db, Empresa, payload.empresa_id, "empresa")

    usuario = Usuario(
        org_id=user.org_id,
        login=login,
        nome=payload.nome,
        # Sem senha = usuário só-SSO. `senha_hash` nulo nunca autentica por senha.
        senha_hash=hash_password(payload.senha) if payload.senha else None,
        papel=payload.papel,
        empresa_id=payload.empresa_id,
        permissoes=payload.permissoes,
        idioma=payload.idioma,
        status=payload.status,
    )
    db.add(usuario)
    db.flush()
    return UsuarioOut.model_validate(usuario)


@router.get("/{usuario_id}", response_model=UsuarioOut)
def obter(
    usuario_id: uuid.UUID,
    db: Session = Depends(get_tenant_db),
    _: CurrentUser = Depends(requer_permissao("admin_cadastro")),
) -> UsuarioOut:
    return UsuarioOut.model_validate(exigir(db, Usuario, usuario_id, "usuário"))


@router.patch("/{usuario_id}", response_model=UsuarioOut)
def atualizar(
    usuario_id: uuid.UUID,
    payload: UsuarioUpdate,
    db: Session = Depends(get_tenant_db),
    user: CurrentUser = Depends(requer_permissao("admin_cadastro")),
) -> UsuarioOut:
    usuario = exigir(db, Usuario, usuario_id, "usuário")
    dados = payload.model_dump(exclude_unset=True)

    # Um admin desativando ou rebaixando a si mesmo tranca o cadastro da
    # organização — é um erro caro de desfazer e barato de impedir.
    if usuario.id == user.id:
        if dados.get("status") == "inativo":
            raise conflito("não é possível desativar o próprio usuário")
        if "papel" in dados and dados["papel"] != usuario.papel:
            raise conflito("não é possível alterar o próprio papel")

    if dados.get("empresa_id") is not None:
        exigir(db, Empresa, dados["empresa_id"], "empresa")

    for campo, valor in dados.items():
        setattr(usuario, campo, valor)
    db.flush()
    return UsuarioOut.model_validate(usuario)


@router.put("/{usuario_id}/senha", status_code=status.HTTP_204_NO_CONTENT)
def definir_senha(
    usuario_id: uuid.UUID,
    payload: SenhaUpdate,
    db: Session = Depends(get_tenant_db),
    user: CurrentUser = Depends(get_current_user),
) -> None:
    """Define ou troca a senha.

    Quem administra cadastros troca a de qualquer um; os demais só a própria
    — daí a checagem ficar aqui e não numa guarda de rota.
    """
    if usuario_id != user.id and not user.pode("admin_cadastro"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="sem permissão para trocar esta senha"
        )
    usuario = exigir(db, Usuario, usuario_id, "usuário")
    usuario.senha_hash = hash_password(payload.senha)
    db.flush()
