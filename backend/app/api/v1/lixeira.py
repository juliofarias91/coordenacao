"""A lixeira — o que foi removido, e como trazer de volta.

Até a migration 0006 `DELETE` era definitivo. Apagar um cliente com doze
projetos, um critério usado em três checklists ou o relato de um erro era um
clique sem volta — numa plataforma que existe para que decisões de auditoria
possam ser reconstruídas depois.

**ESTA É A ÚNICA ROTA QUE ENXERGA O REMOVIDO.** Ela usa `get_lixeira_db`, que
liga o segundo GUC do RLS (`app.ver_removidos`); em qualquer outra sessão a
policy esconde essas linhas, e nenhuma das 72 rotas precisa lembrar de filtrar.
Uma rota que quisesse ver removidos teria de pedir essa dependência
explicitamente — é isso que impede a visão da lixeira de vazar por descuido.

Ler e restaurar exigem `admin_cadastro`: quem restaura desfaz a decisão de
outra pessoa, e isso é ato de quem administra.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, get_lixeira_db, requer_permissao
from app.services import lixeira

router = APIRouter(prefix="/lixeira", tags=["lixeira"])


class ItemLixeira(BaseModel):
    """Uma linha da lixeira.

    `tipo` é o nome da entidade na URL (`cliente`, `criterio`…), não o da
    classe: é ele que a rota de restaurar recebe de volta, e aceitar só as
    chaves conhecidas é o que impede alguém de pedir a restauração de uma
    tabela que sequer tem `deleted_at`.
    """

    tipo: str
    id: uuid.UUID
    rotulo: str
    removido_em: datetime


@router.get("", response_model=list[ItemLixeira])
def listar(
    tipo: str | None = Query(default=None),
    db: Session = Depends(get_lixeira_db),
    _: CurrentUser = Depends(requer_permissao("admin_cadastro")),
) -> list[ItemLixeira]:
    return [
        ItemLixeira(
            tipo=chave,
            id=obj.id,
            rotulo=lixeira.rotulo(chave, obj),
            removido_em=obj.deleted_at,
        )
        for chave, obj in lixeira.listar_removidos(db, tipo)
    ]


@router.post("/{tipo}/{item_id}/restaurar", status_code=status.HTTP_204_NO_CONTENT)
def restaurar(
    tipo: str,
    item_id: uuid.UUID,
    db: Session = Depends(get_lixeira_db),
    _: CurrentUser = Depends(requer_permissao("admin_cadastro")),
) -> None:
    """Traz de volta.

    NÃO ressuscita o que dependia do item. Restaurar um cliente não devolve os
    projetos que ficaram sem cliente, porque eles nunca foram removidos — o
    `ON DELETE SET NULL` de antes é que os desvinculou. Reatar é decisão de
    quem restaura, não do sistema.
    """
    obj = lixeira.exigir_removivel(db, tipo, item_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="item não encontrado")
    lixeira.restaurar(obj)
    db.flush()


@router.delete("/{tipo}/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def apagar_de_vez(
    tipo: str,
    item_id: uuid.UUID,
    db: Session = Depends(get_lixeira_db),
    _: CurrentUser = Depends(requer_permissao("admin_cadastro")),
) -> None:
    """AGORA SIM é definitivo — o `DELETE` de verdade.

    Existe para que a lixeira não cresça sem fim e para que dado sensível possa
    de fato sair do banco quando alguém pedir (LGPD, artigo 18). Só alcança o
    que JÁ está removido: apagar de vez algo em uso exigiria removê-lo antes,
    e esse é o passo em que se percebe o estrago.
    """
    obj = lixeira.exigir_removivel(db, tipo, item_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="item não encontrado")
    if getattr(obj, "deleted_at", None) is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="este item não está na lixeira; remova-o primeiro",
        )
    db.delete(obj)
    db.flush()
