"""Busca de entidades já dentro do tenant.

A sessão vem de `get_tenant_db`, então o row-level security garante que um
`db.get()` só encontre linha da organização do token. Um id de outra
organização simplesmente não existe daqui — e vira 404, não 403: dizer
"proibido" já entregaria que o recurso existe em algum lugar.
"""

from __future__ import annotations

import uuid

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.base import Base
from app.models import Projeto


def exigir[M: Base](db: Session, modelo: type[M], item_id: uuid.UUID, rotulo: str) -> M:
    obj = db.get(modelo, item_id)
    if obj is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"{rotulo} não encontrado"
        )
    return obj


def exigir_projeto(db: Session, projeto_id: uuid.UUID) -> Projeto:
    return exigir(db, Projeto, projeto_id, "projeto")


def conflito(mensagem: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=mensagem)


def ja_existe(db: Session, stmt) -> bool:
    """True se a consulta de unicidade encontrar alguma linha."""
    return db.execute(select(stmt.exists())).scalar() or False
