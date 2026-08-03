"""SP-406 · Leitura da trilha de auditoria.

A escrita é automática (`app/db/trilha.py`). Aqui só se lê — e só quem
administra cadastros: a trilha mostra o que cada pessoa fez, e isso não é
informação de painel.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, get_tenant_db, requer_permissao
from app.core.pagination import Page, ParamsPagina, aplicar_cursor, montar_pagina
from app.models import TrilhaAuditoria

router = APIRouter(prefix="/trilha", tags=["trilha"])


class TrilhaOut(BaseModel):
    """Uma linha da trilha.

    O formato de `diff` muda conforme a ação, e quem consome precisa saber:

    - `criou` / `removeu` → estado inteiro: `{"titulo": "Antes", ...}`
    - `alterou` → só o que mudou: `{"titulo": {"de": "Antes", "para": "Depois"}}`
    - `trocou_senha` / `encerrou_sessoes` → **sem diff**: a ação diz o ato e
      `entidade_id` diz de quem era a conta. Não há terceira informação que se
      possa dar sem revelar credencial.

    Um formato único obrigaria a inventar um "de" que não existe na criação,
    ou a perder o contexto do que mais havia no registro removido.

    Campo sensível que mude junto de outros aparece como
    `{"senha_hash": {"de": "(oculto)", "para": "(oculto)"}}` — o nome do campo
    conta que a credencial foi tocada, o valor nunca sai daqui.
    """

    id: uuid.UUID
    created_at: datetime
    usuario_id: uuid.UUID | None
    entidade: str | None
    entidade_id: uuid.UUID | None
    acao: str | None
    diff: dict[str, Any] | None

    model_config = {"from_attributes": True}


@router.get("", response_model=Page[TrilhaOut])
def listar(
    entidade: str | None = Query(default=None, description="Nome da tabela (ex.: 'auditoria')"),
    entidade_id: uuid.UUID | None = Query(default=None),
    usuario_id: uuid.UUID | None = Query(default=None),
    # `restaurou` entrou com a lixeira; `trocou_senha` e `encerrou_sessoes` com
    # a redefinição de senha (migration 0010). Sem eles a ação seria gravada e
    # não consultável, que é o pior dos dois mundos — o log teria o registro e o
    # filtro devolveria 422 para quem o procurasse.
    acao: str | None = Query(
        default=None,
        pattern=r"^(criou|alterou|removeu|restaurou|trocou_senha|encerrou_sessoes)$",
    ),
    params: ParamsPagina = Depends(),
    db: Session = Depends(get_tenant_db),
    _: CurrentUser = Depends(requer_permissao("admin_cadastro")),
) -> Page[TrilhaOut]:
    stmt = select(TrilhaAuditoria)
    if entidade:
        stmt = stmt.where(TrilhaAuditoria.entidade == entidade)
    if entidade_id:
        stmt = stmt.where(TrilhaAuditoria.entidade_id == entidade_id)
    if usuario_id:
        stmt = stmt.where(TrilhaAuditoria.usuario_id == usuario_id)
    if acao:
        stmt = stmt.where(TrilhaAuditoria.acao == acao)
    stmt = aplicar_cursor(stmt, TrilhaAuditoria, params)
    return montar_pagina(list(db.execute(stmt).scalars()), params, TrilhaOut.model_validate)
