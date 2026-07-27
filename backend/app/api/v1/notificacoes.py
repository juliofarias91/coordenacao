"""SP-401 · Central de notificações.

CA: notificações por usuário/papel — auditorias publicadas, erros e
penalidades; marcar lida; badge de não-lidas.

"Lida" é por usuário, mas a notificação pode ser endereçada a um papel e
alcançar várias pessoas. No piloto, marcar lida uma notificação de papel a
marca para todos: a coordenação é um time pequeno e trata a caixa como
compartilhada. Quando isso incomodar, a saída é uma tabela de leitura por
usuário — e não mudar o endereçamento.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel
from sqlalchemy import func, or_, select, update
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, get_tenant_db, requer_permissao
from app.models import Notificacao
from app.models.enums import NotifTipo, PapelUsuario
from app.schemas.automacao import NotificacaoOut
from app.services.escopo import exigir

router = APIRouter(prefix="/notificacoes", tags=["notificacoes"])


class ContadorOut(BaseModel):
    nao_lidas: int
    por_tipo: dict[str, int]


def _visiveis_para(user: CurrentUser):
    """O admin vê tudo da organização; os demais, o que é deles ou do papel.

    Uma falha de automação endereçada à coordenação que o admin não enxergasse
    seria descoberta tarde demais.
    """
    if user.papel is PapelUsuario.ADMIN:
        return select(Notificacao)
    return select(Notificacao).where(
        or_(Notificacao.usuario_id == user.id, Notificacao.papel_alvo == user.papel.value)
    )


@router.get("", response_model=list[NotificacaoOut])
def listar(
    apenas_nao_lidas: bool = Query(default=False),
    tipo: NotifTipo | None = Query(default=None),
    limite: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_tenant_db),
    user: CurrentUser = Depends(requer_permissao("ver_painel")),
) -> list[NotificacaoOut]:
    stmt = _visiveis_para(user)
    if apenas_nao_lidas:
        stmt = stmt.where(Notificacao.lida.is_(False))
    if tipo is not None:
        stmt = stmt.where(Notificacao.tipo == tipo)
    stmt = stmt.order_by(Notificacao.created_at.desc()).limit(limite)
    return [NotificacaoOut.model_validate(n) for n in db.execute(stmt).scalars()]


@router.get("/contador", response_model=ContadorOut)
def contador(
    db: Session = Depends(get_tenant_db),
    user: CurrentUser = Depends(requer_permissao("ver_painel")),
) -> ContadorOut:
    """O badge do sino. Uma consulta só, chamada com frequência."""
    base = _visiveis_para(user).where(Notificacao.lida.is_(False)).subquery()
    linhas = db.execute(
        select(base.c.tipo, func.count()).select_from(base).group_by(base.c.tipo)
    ).all()
    por_tipo = {str(getattr(t, "value", t)): n for t, n in linhas}
    return ContadorOut(nao_lidas=sum(por_tipo.values()), por_tipo=por_tipo)


@router.post("/{notificacao_id}/lida", response_model=NotificacaoOut)
def marcar_lida(
    notificacao_id: uuid.UUID,
    db: Session = Depends(get_tenant_db),
    _: CurrentUser = Depends(requer_permissao("ver_painel")),
) -> NotificacaoOut:
    notificacao = exigir(db, Notificacao, notificacao_id, "notificação")
    notificacao.lida = True
    db.flush()
    return NotificacaoOut.model_validate(notificacao)


@router.post("/marcar-todas-lidas", status_code=status.HTTP_204_NO_CONTENT)
def marcar_todas_lidas(
    db: Session = Depends(get_tenant_db),
    user: CurrentUser = Depends(requer_permissao("ver_painel")),
) -> None:
    ids = [
        n.id
        for n in db.execute(_visiveis_para(user).where(Notificacao.lida.is_(False))).scalars()
    ]
    if ids:
        db.execute(update(Notificacao).where(Notificacao.id.in_(ids)).values(lida=True))
