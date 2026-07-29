"""Reporte de erro do sistema — quem usa avisa, quem administra resolve.

A assimetria de permissão é o ponto desta rota:

  ESCREVER  qualquer pessoa autenticada. Quem não consegue usar uma tela é
            justamente quem precisa avisar — exigir permissão para reportar
            filtraria fora o relato de quem mais depende dele.
  LER       só `admin_cadastro`. O reporte carrega print, e print de tela de
            auditoria mostra dado de projeto: uma lista aberta a todos viraria
            um vazamento lateral entre equipes da mesma organização.

Não confundir com `apontamentos`: aquele é do MODELO auditado e vira issue no
ACC; este é da PLATAFORMA e vira trabalho de quem a mantém.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, get_current_user, get_tenant_db, requer_permissao
from app.core.pagination import Page, ParamsPagina, aplicar_cursor, montar_pagina
from app.models import ReporteErro, Usuario
from app.schemas.reporte import ReporteCreate, ReporteOut, ReporteUpdate
from app.services import storage
from app.services.escopo import exigir
from app.services.storage import StorageError

router = APIRouter(prefix="/reportes", tags=["reportes"])

# 4 MB: é uma captura de tela, não um anexo de projeto.
PRINT_TAMANHO_MAX = 4 * 1024 * 1024
PRINT_TIPOS = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
}


def _saida(reporte: ReporteErro, autor: Usuario | None) -> ReporteOut:
    """A saída com o autor resolvido.

    `model_copy(update=…)` e não desempacotar um dict: o dict perde os tipos no
    caminho e o verificador passa a reclamar de todo campo obrigatório.
    """
    return ReporteOut.model_validate(reporte).model_copy(
        update={
            "usuario_nome": autor.nome if autor else None,
            "usuario_login": autor.login if autor else None,
        }
    )


@router.post("", response_model=ReporteOut, status_code=status.HTTP_201_CREATED)
def criar(
    payload: ReporteCreate,
    db: Session = Depends(get_tenant_db),
    # `get_current_user` e NÃO `requer_permissao`: reportar não exige nada além
    # de estar autenticado. Ver a docstring do módulo.
    user: CurrentUser = Depends(get_current_user),
) -> ReporteOut:
    reporte = ReporteErro(
        org_id=user.org_id,
        usuario_id=user.id,
        titulo=payload.titulo.strip(),
        descricao=payload.descricao,
        caminho=payload.caminho,
    )
    db.add(reporte)
    db.flush()
    return _saida(reporte, db.get(Usuario, user.id))


@router.post("/{reporte_id}/print", response_model=ReporteOut)
async def enviar_print(
    reporte_id: uuid.UUID,
    arquivo: UploadFile = File(...),
    db: Session = Depends(get_tenant_db),
    user: CurrentUser = Depends(get_current_user),
) -> ReporteOut:
    """Anexa a captura de tela ao reporte, logo depois de criá-lo.

    Duas chamadas e não uma porque o print é opcional: exigir multipart em todo
    reporte obrigaria quem só quer escrever duas linhas a montar um FormData.
    """
    reporte = exigir(db, ReporteErro, reporte_id, "reporte")
    # Só o autor anexa — e só enquanto ninguém respondeu. Depois disso, o
    # reporte é histórico de um atendimento e não se reescreve.
    if reporte.usuario_id != user.id and not user.pode("admin_cadastro"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="sem permissão para anexar aqui"
        )

    ext = storage.extensao_segura(arquivo.filename or "", set(PRINT_TIPOS))
    if not ext:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"formato não aceito; use {', '.join(sorted(PRINT_TIPOS))}",
        )

    conteudo = await arquivo.read()
    if len(conteudo) > PRINT_TAMANHO_MAX:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"print acima de {PRINT_TAMANHO_MAX // (1024 * 1024)} MB",
        )

    try:
        reporte.print_url = storage.enviar(
            user.org_id, f"reportes/{reporte_id}/print{ext}", conteudo, PRINT_TIPOS[ext]
        )
    except StorageError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc

    db.flush()
    return _saida(reporte, db.get(Usuario, reporte.usuario_id) if reporte.usuario_id else None)


@router.get("", response_model=Page[ReporteOut])
def listar(
    status_filtro: str | None = Query(default=None, alias="status"),
    params: ParamsPagina = Depends(),
    db: Session = Depends(get_tenant_db),
    _: CurrentUser = Depends(requer_permissao("admin_cadastro")),
) -> Page[ReporteOut]:
    """SÓ QUEM ADMINISTRA LÊ. Ver a docstring do módulo."""
    stmt = select(ReporteErro, Usuario).outerjoin(Usuario, Usuario.id == ReporteErro.usuario_id)
    if status_filtro:
        stmt = stmt.where(ReporteErro.status == status_filtro)
    stmt = aplicar_cursor(stmt, ReporteErro, params)
    linhas = list(db.execute(stmt).all())
    return montar_pagina(
        [r for r, _u in linhas],
        params,
        lambda r: _saida(r, next(u for rr, u in linhas if rr.id == r.id)),
    )


@router.get("/{reporte_id}/print-url")
def obter_url_do_print(
    reporte_id: uuid.UUID,
    db: Session = Depends(get_tenant_db),
    _: CurrentUser = Depends(requer_permissao("admin_cadastro")),
) -> dict[str, str | None]:
    """URL temporária de leitura. O bucket nunca é público."""
    reporte = exigir(db, ReporteErro, reporte_id, "reporte")
    if not reporte.print_url:
        return {"url": None}
    try:
        return {"url": storage.url_assinada(reporte.print_url)}
    except StorageError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc


@router.patch("/{reporte_id}", response_model=ReporteOut)
def atualizar(
    reporte_id: uuid.UUID,
    payload: ReporteUpdate,
    db: Session = Depends(get_tenant_db),
    _: CurrentUser = Depends(requer_permissao("admin_cadastro")),
) -> ReporteOut:
    """Muda o status e escreve a resposta. Só quem administra.

    O TÍTULO E A DESCRIÇÃO NÃO SÃO EDITÁVEIS, de propósito: são o relato de
    outra pessoa, e reescrevê-lo apagaria o que ela de fato disse — que é o
    dado mais valioso do reporte.
    """
    reporte = exigir(db, ReporteErro, reporte_id, "reporte")
    for campo, valor in payload.model_dump(exclude_unset=True).items():
        setattr(reporte, campo, valor)
    db.flush()
    return _saida(reporte, db.get(Usuario, reporte.usuario_id) if reporte.usuario_id else None)


@router.delete("/{reporte_id}", status_code=status.HTTP_204_NO_CONTENT)
def remover(
    reporte_id: uuid.UUID,
    db: Session = Depends(get_tenant_db),
    _: CurrentUser = Depends(requer_permissao("admin_cadastro")),
) -> None:
    db.delete(exigir(db, ReporteErro, reporte_id, "reporte"))
    db.flush()
