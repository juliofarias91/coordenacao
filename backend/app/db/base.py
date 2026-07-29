"""Base declarativa e mixins compartilhados por todas as entidades."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, func, text
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """Base declarativa. `alembic/env.py` lê o metadata daqui."""


def uuid_pk() -> Mapped[uuid.UUID]:
    """Chave primária UUID, gerada no Python.

    `default=uuid.uuid4` e não só o `gen_random_uuid()` do banco: a trilha de
    auditoria (SP-406) monta o registro em `before_flush`, quando o INSERT
    ainda não aconteceu. Sem o id em mãos ali, toda criação entraria na trilha
    sem dizer o que foi criado.

    O `server_default` continua valendo para INSERTs feitos fora do ORM
    (migrations, seeds em SQL puro).
    """
    return mapped_column(
        PgUUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )


class RemovivelMixin:
    """`deleted_at` — a lixeira (migration 0006).

    Quem herda isto pode ser removido de forma REVERSÍVEL: a linha continua na
    tabela e some das consultas porque a policy de RLS a esconde enquanto
    `deleted_at` estiver preenchido. Nenhuma consulta filtra à mão — filtro
    espalhado por 72 rotas é esquecido numa delas.

    Só herdam as entidades que se apagam pela interface. Pôr a coluna em tudo
    seria peso morto num schema que alguém vai ler depois e tentar entender.
    """

    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class TimestampMixin:
    """`created_at`/`updated_at` em toda tabela de negócio (plano técnico, seção 3)."""

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class OrgMixin:
    """Isolamento multi-tenant.

    O plano técnico (seção 3) determina que *toda* tabela de negócio carregue
    `org_id`. As tabelas do DDL que só se ligam à organização por caminho
    indireto (via projeto) também recebem a coluna aqui: é o que permite a
    policy de row-level security ser uniforme e barata, sem join.

    O valor é preenchido pela camada de repositório a partir do token — nunca
    vem do corpo da requisição.
    """

    org_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("organizacao.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
