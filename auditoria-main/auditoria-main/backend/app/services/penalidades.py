"""SP-301 · Ledger de penalidades e notificações.

`penalidade` é o registro de origem; `empresa.penalidades` é só um contador
materializado dele. Todo lançamento passa por aqui para os dois nunca
divergirem.
"""

from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Empresa, Notificacao, Penalidade, Usuario
from app.models.enums import NotifTipo


def _recontar(db: Session, empresa: Empresa) -> None:
    """Recalcula o contador a partir do ledger, somando os pesos."""
    total = db.execute(
        select(func.coalesce(func.sum(Penalidade.peso), 0)).where(
            Penalidade.empresa_id == empresa.id
        )
    ).scalar_one()
    empresa.penalidades = int(total)


def aplicar(
    db: Session,
    *,
    org_id: uuid.UUID,
    empresa_id: uuid.UUID,
    motivo: str,
    referencia: str | None = None,
    peso: int = 1,
    notificar: bool = True,
) -> Penalidade:
    """Lança uma penalidade e avisa quem precisa saber.

    A notificação vai para os usuários da empresa penalizada — quem tem de
    corrigir — e não para a coordenação: o painel já mostra o contador.
    """
    empresa = db.get(Empresa, empresa_id)
    if empresa is None:
        raise ValueError("empresa não encontrada")

    penalidade = Penalidade(
        org_id=org_id,
        empresa_id=empresa_id,
        motivo=motivo,
        referencia=referencia,
        peso=peso,
    )
    db.add(penalidade)
    db.flush()

    _recontar(db, empresa)

    if notificar:
        destinatarios = list(
            db.execute(
                select(Usuario).where(
                    Usuario.empresa_id == empresa_id, Usuario.status == "ativo"
                )
            ).scalars()
        )
        mensagem = f"Penalidade registrada: {motivo}"
        if destinatarios:
            for usuario in destinatarios:
                db.add(
                    Notificacao(
                        org_id=org_id,
                        usuario_id=usuario.id,
                        tipo=NotifTipo.PENALIDADE,
                        mensagem=mensagem,
                        origem=referencia,
                    )
                )
        else:
            # Empresa sem usuário na plataforma: a notificação fica endereçada
            # ao papel, para a central da Fase 4 (SP-401) exibi-la mesmo assim.
            db.add(
                Notificacao(
                    org_id=org_id,
                    usuario_id=None,
                    papel_alvo="fornecedor",
                    tipo=NotifTipo.PENALIDADE,
                    mensagem=f"{empresa.nome}: {mensagem}",
                    origem=referencia,
                )
            )
        db.flush()

    return penalidade


def avisar_erro(
    db: Session, *, org_id: uuid.UUID, mensagem: str, origem: str | None = None
) -> Notificacao:
    """Falha de automação vira notificação para a coordenação.

    Sem isso, um worker que quebra é um round que simplesmente não avança e
    ninguém sabe por quê (SP-302 · CA: falha e retry observáveis).
    """
    notificacao = Notificacao(
        org_id=org_id,
        usuario_id=None,
        papel_alvo="coordenador",
        tipo=NotifTipo.ERRO,
        mensagem=mensagem,
        origem=origem,
    )
    db.add(notificacao)
    db.flush()
    return notificacao


def avisar_auditoria(
    db: Session, *, org_id: uuid.UUID, mensagem: str, origem: str | None = None
) -> Notificacao:
    notificacao = Notificacao(
        org_id=org_id,
        usuario_id=None,
        papel_alvo="coordenador",
        tipo=NotifTipo.AUDITORIA,
        mensagem=mensagem,
        origem=origem,
    )
    db.add(notificacao)
    db.flush()
    return notificacao
