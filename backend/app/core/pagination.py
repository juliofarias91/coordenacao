"""Paginação por cursor (plano técnico, seção 4).

Cursor e não offset porque as listas do painel crescem por inserção contínua
(versões, auditorias, ocorrências): com offset, uma linha nova entre duas
páginas faz um registro aparecer duas vezes ou sumir.

O cursor é opaco para o cliente — base64 de `created_at|id`. Ordenação é
sempre `created_at DESC, id DESC`, e o `id` desempata registros criados no
mesmo instante.
"""

from __future__ import annotations

import base64
import binascii
import uuid
from datetime import datetime

from fastapi import HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import Select, and_, or_

LIMITE_PADRAO = 50
LIMITE_MAXIMO = 200


class Page[T](BaseModel):
    itens: list[T]
    proximo_cursor: str | None = Field(
        default=None,
        description="Passe em `cursor` para a próxima página. Nulo = fim da lista.",
    )


def codificar_cursor(criado_em: datetime, item_id: uuid.UUID) -> str:
    cru = f"{criado_em.isoformat()}|{item_id}"
    return base64.urlsafe_b64encode(cru.encode()).decode()


def decodificar_cursor(cursor: str) -> tuple[datetime, uuid.UUID]:
    try:
        cru = base64.urlsafe_b64decode(cursor.encode()).decode()
        criado_em, item_id = cru.split("|", 1)
        return datetime.fromisoformat(criado_em), uuid.UUID(item_id)
    except (ValueError, binascii.Error, UnicodeDecodeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="cursor inválido"
        ) from exc


class ParamsPagina:
    """Dependência: `params: ParamsPagina = Depends()`."""

    def __init__(
        self,
        cursor: str | None = Query(default=None, description="Cursor da página anterior"),
        limite: int = Query(default=LIMITE_PADRAO, ge=1, le=LIMITE_MAXIMO),
    ) -> None:
        self.cursor = cursor
        self.limite = limite


def aplicar_cursor(stmt: Select, modelo: type, params: ParamsPagina) -> Select:
    """Adiciona ordenação e o recorte do cursor. Busca um item a mais que o
    limite, para saber se existe próxima página sem um COUNT."""
    if params.cursor:
        criado_em, item_id = decodificar_cursor(params.cursor)
        stmt = stmt.where(
            or_(
                modelo.created_at < criado_em,
                and_(modelo.created_at == criado_em, modelo.id < item_id),
            )
        )
    return stmt.order_by(modelo.created_at.desc(), modelo.id.desc()).limit(params.limite + 1)


def montar_pagina(linhas: list, params: ParamsPagina, serializar) -> Page:
    """Corta o item extra e devolve a página com o cursor do último item real."""
    tem_mais = len(linhas) > params.limite
    visiveis = linhas[: params.limite]
    proximo = (
        codificar_cursor(visiveis[-1].created_at, visiveis[-1].id)
        if tem_mais and visiveis
        else None
    )
    return Page(itens=[serializar(linha) for linha in visiveis], proximo_cursor=proximo)
