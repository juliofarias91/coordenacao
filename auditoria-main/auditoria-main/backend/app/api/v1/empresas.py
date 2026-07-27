"""SP-102 · Empresas, contatos e subcontratação.

CA: empresa própria/terceirizada; `contratada_por` referenciando outra
empresa; múltiplos contatos; upload de logo para o S3.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.deps import CurrentUser, get_tenant_db, requer_permissao
from app.core.pagination import Page, ParamsPagina, aplicar_cursor, montar_pagina
from app.models import Contato, Empresa
from app.models.enums import EmpresaPapel
from app.schemas.empresa import (
    ContatoCreate,
    ContatoOut,
    ContatoUpdate,
    EmpresaCreate,
    EmpresaDetalhe,
    EmpresaOut,
    EmpresaUpdate,
)
from app.services import storage
from app.services.escopo import conflito, exigir
from app.services.storage import StorageError

router = APIRouter(prefix="/empresas", tags=["empresas"])

LOGO_EXTENSOES = {".png", ".jpg", ".jpeg", ".svg", ".webp"}
LOGO_TIPOS = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
}
LOGO_TAMANHO_MAX = 2 * 1024 * 1024  # 2 MB


def _exigir_empresa(db: Session, empresa_id: uuid.UUID) -> Empresa:
    return exigir(db, Empresa, empresa_id, "empresa")


def _validar_contratante(
    db: Session, empresa_id: uuid.UUID | None, contratante_id: uuid.UUID | None
) -> None:
    """Impede que a cadeia de subcontratação vire um ciclo.

    Sem isso, A contrata B contrata A trava qualquer código que suba a cadeia
    (o organograma do cadastro, o cálculo de responsabilidade de uma NC).
    """
    if contratante_id is None:
        return
    if empresa_id is not None and contratante_id == empresa_id:
        raise conflito("uma empresa não pode contratar a si mesma")

    _exigir_empresa(db, contratante_id)

    if empresa_id is None:
        return

    visitados: set[uuid.UUID] = {empresa_id}
    atual: uuid.UUID | None = contratante_id
    while atual is not None:
        if atual in visitados:
            raise conflito("a cadeia de subcontratação ficaria circular")
        visitados.add(atual)
        atual = db.execute(
            select(Empresa.contratada_por).where(Empresa.id == atual)
        ).scalar_one_or_none()


# ------------------------------------------------------------------ empresas
@router.get("", response_model=Page[EmpresaOut])
def listar(
    papel: EmpresaPapel | None = Query(default=None, description="Filtra por papel"),
    status_filtro: str | None = Query(default=None, alias="status"),
    params: ParamsPagina = Depends(),
    db: Session = Depends(get_tenant_db),
    _: CurrentUser = Depends(requer_permissao("ver_painel")),
) -> Page[EmpresaOut]:
    stmt = select(Empresa)
    if papel is not None:
        stmt = stmt.where(Empresa.papeis.any(papel.value))
    if status_filtro:
        stmt = stmt.where(Empresa.status == status_filtro)
    stmt = aplicar_cursor(stmt, Empresa, params)
    return montar_pagina(list(db.execute(stmt).scalars()), params, EmpresaOut.model_validate)


@router.post("", response_model=EmpresaOut, status_code=status.HTTP_201_CREATED)
def criar(
    payload: EmpresaCreate,
    db: Session = Depends(get_tenant_db),
    user: CurrentUser = Depends(requer_permissao("admin_cadastro")),
) -> EmpresaOut:
    _validar_contratante(db, None, payload.contratada_por)
    empresa = Empresa(org_id=user.org_id, **payload.model_dump())
    db.add(empresa)
    db.flush()
    return EmpresaOut.model_validate(empresa)


@router.get("/{empresa_id}", response_model=EmpresaDetalhe)
def obter(
    empresa_id: uuid.UUID,
    db: Session = Depends(get_tenant_db),
    _: CurrentUser = Depends(requer_permissao("ver_painel")),
) -> EmpresaDetalhe:
    empresa = db.execute(
        select(Empresa).options(selectinload(Empresa.contatos)).where(Empresa.id == empresa_id)
    ).scalar_one_or_none()
    if empresa is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="empresa não encontrada")
    return EmpresaDetalhe.model_validate(empresa)


@router.patch("/{empresa_id}", response_model=EmpresaOut)
def atualizar(
    empresa_id: uuid.UUID,
    payload: EmpresaUpdate,
    db: Session = Depends(get_tenant_db),
    _: CurrentUser = Depends(requer_permissao("admin_cadastro")),
) -> EmpresaOut:
    empresa = _exigir_empresa(db, empresa_id)
    dados = payload.model_dump(exclude_unset=True)
    if "contratada_por" in dados:
        _validar_contratante(db, empresa_id, dados["contratada_por"])
    for campo, valor in dados.items():
        setattr(empresa, campo, valor)
    db.flush()
    return EmpresaOut.model_validate(empresa)


@router.post("/{empresa_id}/logo", response_model=EmpresaOut)
async def enviar_logo(
    empresa_id: uuid.UUID,
    arquivo: UploadFile = File(...),
    db: Session = Depends(get_tenant_db),
    user: CurrentUser = Depends(requer_permissao("admin_cadastro")),
) -> EmpresaOut:
    empresa = _exigir_empresa(db, empresa_id)

    ext = storage.extensao_segura(arquivo.filename or "", LOGO_EXTENSOES)
    if not ext:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"formato não aceito; use {', '.join(sorted(LOGO_EXTENSOES))}",
        )

    conteudo = await arquivo.read()
    if len(conteudo) > LOGO_TAMANHO_MAX:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="logo acima de 2 MB",
        )

    try:
        empresa.logo_url = storage.enviar(
            user.org_id, f"empresas/{empresa_id}/logo{ext}", conteudo, LOGO_TIPOS[ext]
        )
    except StorageError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc

    db.flush()
    return EmpresaOut.model_validate(empresa)


@router.get("/{empresa_id}/logo-url")
def obter_url_do_logo(
    empresa_id: uuid.UUID,
    db: Session = Depends(get_tenant_db),
    _: CurrentUser = Depends(requer_permissao("ver_painel")),
) -> dict[str, str | None]:
    """URL temporária de leitura. O bucket nunca é público."""
    empresa = _exigir_empresa(db, empresa_id)
    if not empresa.logo_url:
        return {"url": None}
    try:
        return {"url": storage.url_assinada(empresa.logo_url)}
    except StorageError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc


# ------------------------------------------------------------------ contatos
@router.get("/{empresa_id}/contatos", response_model=list[ContatoOut])
def listar_contatos(
    empresa_id: uuid.UUID,
    db: Session = Depends(get_tenant_db),
    _: CurrentUser = Depends(requer_permissao("ver_painel")),
) -> list[ContatoOut]:
    _exigir_empresa(db, empresa_id)
    contatos = db.execute(
        select(Contato).where(Contato.empresa_id == empresa_id).order_by(Contato.created_at)
    ).scalars()
    return [ContatoOut.model_validate(c) for c in contatos]


@router.post(
    "/{empresa_id}/contatos", response_model=ContatoOut, status_code=status.HTTP_201_CREATED
)
def criar_contato(
    empresa_id: uuid.UUID,
    payload: ContatoCreate,
    db: Session = Depends(get_tenant_db),
    user: CurrentUser = Depends(requer_permissao("admin_cadastro")),
) -> ContatoOut:
    _exigir_empresa(db, empresa_id)
    dados = payload.model_dump()
    if dados.get("email"):
        dados["email"] = str(dados["email"])
    contato = Contato(org_id=user.org_id, empresa_id=empresa_id, **dados)
    db.add(contato)
    db.flush()
    return ContatoOut.model_validate(contato)


@router.patch("/{empresa_id}/contatos/{contato_id}", response_model=ContatoOut)
def atualizar_contato(
    empresa_id: uuid.UUID,
    contato_id: uuid.UUID,
    payload: ContatoUpdate,
    db: Session = Depends(get_tenant_db),
    _: CurrentUser = Depends(requer_permissao("admin_cadastro")),
) -> ContatoOut:
    contato = exigir(db, Contato, contato_id, "contato")
    if contato.empresa_id != empresa_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="contato não encontrado nesta empresa"
        )
    for campo, valor in payload.model_dump(exclude_unset=True).items():
        setattr(contato, campo, str(valor) if campo == "email" and valor else valor)
    db.flush()
    return ContatoOut.model_validate(contato)


@router.delete("/{empresa_id}/contatos/{contato_id}", status_code=status.HTTP_204_NO_CONTENT)
def remover_contato(
    empresa_id: uuid.UUID,
    contato_id: uuid.UUID,
    db: Session = Depends(get_tenant_db),
    _: CurrentUser = Depends(requer_permissao("admin_cadastro")),
) -> None:
    contato = exigir(db, Contato, contato_id, "contato")
    if contato.empresa_id != empresa_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="contato não encontrado nesta empresa"
        )
    db.delete(contato)
