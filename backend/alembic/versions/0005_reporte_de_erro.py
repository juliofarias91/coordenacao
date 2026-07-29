"""Reporte de erro do sistema — o que quem usa manda para quem mantém.

Não confundir com `apontamento`, que também é "um apontamento de erro" na fala
do dia a dia e é outra coisa: aquele é do MODELO auditado e vira issue no ACC;
este é da PLATAFORMA. Misturar os dois faria a lista de pendências de obra
encher de "botão não funciona" — daí a tabela própria.

Revision ID: 0005
Revises: 0004
Create Date: 2026-07-29
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op
from app.core.config import settings

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "reporte_erro",
        sa.Column(
            "id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "org_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizacao.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        # SET NULL e não CASCADE: um bug não deixa de existir porque a pessoa
        # que o encontrou saiu da empresa.
        sa.Column(
            "usuario_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("usuario.id", ondelete="SET NULL"),
            index=True,
        ),
        sa.Column("titulo", sa.Text(), nullable=False),
        sa.Column("descricao", sa.Text()),
        # A URL em que a pessoa estava, preenchida pelo cliente. "Não funciona"
        # sem a tela é um chamado que começa com uma pergunta.
        sa.Column("caminho", sa.Text()),
        # Chave do print no S3, nunca URL pública — o bucket é privado.
        sa.Column("print_url", sa.Text()),
        sa.Column("status", sa.Text(), nullable=False, server_default=sa.text("'aberto'")),
        sa.Column("resposta", sa.Text()),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )

    # --- row-level security --------------------------------------------------
    # Sem estas linhas a tabela nasceria SEM isolamento, e nada acusaria: o
    # SELECT devolveria os reportes de todas as organizações — inclusive os
    # prints, que mostram dado de projeto alheio.
    guc = settings.tenant_guc
    op.execute("ALTER TABLE reporte_erro ENABLE ROW LEVEL SECURITY")
    op.execute(
        f"CREATE POLICY tenant_isolation ON reporte_erro "
        f"USING (org_id::text = current_setting('{guc}', true)) "
        f"WITH CHECK (org_id::text = current_setting('{guc}', true))"
    )

    app_user = settings.app_db_user
    if op.get_context().as_sql:
        role_exists = True  # geração offline (--sql): emite o GRANT sem consultar
    else:
        role_exists = bool(
            op.get_bind()
            .execute(sa.text("SELECT 1 FROM pg_roles WHERE rolname = :r"), {"r": app_user})
            .scalar()
        )
    if role_exists:
        op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON reporte_erro TO {app_user}")


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS tenant_isolation ON reporte_erro")
    op.drop_table("reporte_erro")
