"""SP-104 · Standards e padrão de nomenclatura.

CA: CRUD de standards; padrão de nomenclatura armazenado como segmentos
(jsonb) editável por segmento.

O padrão de nomenclatura tem uma rota própria (`/projetos/{id}/nomenclatura`)
porque é *um* por projeto e é o insumo do validador da Fase 3 (SP-301).
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
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
from app.services import lixeira, storage
from app.services.escopo import exigir, exigir_projeto, exigir_projeto_do_usuario
from app.services.storage import StorageError

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


@router.delete("/standards/{standard_id}", status_code=status.HTTP_204_NO_CONTENT)
def remover(
    standard_id: uuid.UUID,
    db: Session = Depends(get_tenant_db),
    _: CurrentUser = Depends(requer_permissao("admin_cadastro")),
) -> None:
    """Apaga o standard.

    A disciplina que o referenciava em `nomenclatura_id` fica sem padrão — é a
    FK com `ON DELETE SET NULL`. Não se apaga a disciplina junto: ela existe
    independentemente do padrão de nome que se resolveu usar nela.
    """
    lixeira.remover(db, exigir(db, Standard, standard_id, "standard"))
    db.flush()


# ------------------------------------------------------ imagem de setorização
# 4 MB: são plantas de setor exportadas como imagem, não fotografia. Acima
# disso quase sempre é PNG sem compressão de algo que caberia num JPEG.
IMAGEM_TAMANHO_MAX = 4 * 1024 * 1024
IMAGEM_TIPOS = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
}


@router.post("/standards/{standard_id}/imagem", response_model=StandardOut)
async def enviar_imagem(
    standard_id: uuid.UUID,
    arquivo: UploadFile = File(...),
    db: Session = Depends(get_tenant_db),
    user: CurrentUser = Depends(requer_permissao("admin_cadastro")),
) -> StandardOut:
    """Anexa uma imagem ao standard — hoje, a planta de um setor no PEB.

    Guarda a CHAVE do objeto em `referencia_url`, não uma URL pública: o bucket
    é privado, e quem quiser ver pede uma URL assinada em `/imagem-url`. O
    protótipo embutia a imagem como data-URL no navegador, o que não sobrevive a
    um F5 nem chega ao colega do lado.
    """
    standard = exigir(db, Standard, standard_id, "standard")

    ext = storage.extensao_segura(arquivo.filename or "", set(IMAGEM_TIPOS))
    if not ext:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"formato não aceito; use {', '.join(sorted(IMAGEM_TIPOS))}",
        )

    conteudo = await arquivo.read()
    if len(conteudo) > IMAGEM_TAMANHO_MAX:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"imagem acima de {IMAGEM_TAMANHO_MAX // (1024 * 1024)} MB",
        )

    try:
        standard.referencia_url = storage.enviar(
            user.org_id,
            f"standards/{standard_id}/imagem{ext}",
            conteudo,
            IMAGEM_TIPOS[ext],
        )
    except StorageError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc

    db.flush()
    return StandardOut.model_validate(standard)


@router.get("/standards/{standard_id}/imagem-url")
def obter_url_da_imagem(
    standard_id: uuid.UUID,
    db: Session = Depends(get_tenant_db),
    _: CurrentUser = Depends(requer_permissao("ver_painel")),
) -> dict[str, str | None]:
    """URL temporária de leitura. O bucket nunca é público."""
    standard = exigir(db, Standard, standard_id, "standard")
    if not standard.referencia_url:
        return {"url": None}
    # Um standard de outro tipo pode ter uma URL EXTERNA aqui (link para o PDF
    # da norma). Assinar isso daria erro; devolver como veio é o certo.
    if standard.referencia_url.startswith(("http://", "https://")):
        return {"url": standard.referencia_url}
    try:
        return {"url": storage.url_assinada(standard.referencia_url)}
    except StorageError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc


# --------------------------------------------------------------- nomenclatura
@router.get("/projetos/{projeto_id}/nomenclatura", response_model=NomenclaturaOut)
def obter_nomenclatura(
    projeto_id: uuid.UUID,
    db: Session = Depends(get_tenant_db),
    user: CurrentUser = Depends(requer_permissao("ver_painel")),
) -> NomenclaturaOut:
    exigir_projeto_do_usuario(db, projeto_id, user)
    padrao = (
        db.execute(
            select(NomenclaturaPadrao)
            .where(
                NomenclaturaPadrao.projeto_id == projeto_id, NomenclaturaPadrao.vigente.is_(True)
            )
            .order_by(NomenclaturaPadrao.created_at.desc())
        )
        .scalars()
        .first()
    )
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
