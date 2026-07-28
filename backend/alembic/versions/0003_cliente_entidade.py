"""Cliente vira entidade: de campo de texto em `projeto` para tabela própria.

`projeto.cliente` era texto livre. Isso impede agrupar — 'Microsoft',
'microsoft' e 'MS' seriam três pastas na home — e não tem onde guardar o que é
do cliente, não do projeto: contato, e-mail, e amanhã contrato e logo. Cada
projeto do mesmo cliente repetia a informação, e nada garantia que as cópias
concordassem.

A conversão preserva o que existe: cada texto DISTINTO (ignorando maiúsculas e
espaços nas bordas) vira um registro, e `projeto.cliente_id` passa a apontar
para ele. `cliente_contato` acompanha — é atributo do cliente, não do projeto.

Projeto sem cliente continua sem: a FK é nula, porque nem todo projeto nasce
com o cliente definido.

Revision ID: 0003
Revises: 0002
Create Date: 2026-07-28
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op
from app.core.config import settings

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "cliente",
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
        sa.Column("nome", sa.Text(), nullable=False),
        sa.Column("contato", sa.Text()),
        sa.Column("email", sa.Text()),
        sa.Column("status", sa.Text(), nullable=False, server_default=sa.text("'ativo'")),
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
        sa.UniqueConstraint("org_id", "nome", name="uq_cliente_org_nome"),
    )

    op.add_column(
        "projeto",
        sa.Column("cliente_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_projeto_cliente", "projeto", "cliente", ["cliente_id"], ["id"], ondelete="SET NULL"
    )
    op.create_index("ix_projeto_cliente_id", "projeto", ["cliente_id"])

    # --- row-level security --------------------------------------------------
    # A 0001 aplicou isto às 23 tabelas de então. `cliente` nasce agora e sem
    # estas três linhas ficaria SEM isolamento — uma organização leria os
    # clientes da outra, e nada acusaria: o SELECT simplesmente devolveria tudo.
    guc = settings.tenant_guc
    op.execute("ALTER TABLE cliente ENABLE ROW LEVEL SECURITY")
    op.execute(
        f"CREATE POLICY tenant_isolation ON cliente "
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
        op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON cliente TO {app_user}")

    # --- conversão dos dados -------------------------------------------------
    # Roda com o papel da migration, que é dono das tabelas e portanto isento do
    # RLS: precisa enxergar TODAS as organizações de uma vez.
    if not op.get_context().as_sql:
        conn = op.get_bind()

        # `lower(trim(...))` agrupa as variações de digitação num cliente só; o
        # `min(...)` escolhe uma grafia para o registro. Não há acerto perfeito
        # aqui — o que importa é não criar duas pastas para o mesmo cliente.
        conn.execute(
            sa.text(
                """
                INSERT INTO cliente (org_id, nome, contato)
                SELECT org_id,
                       min(trim(cliente)),
                       min(cliente_contato) FILTER (WHERE cliente_contato IS NOT NULL)
                  FROM projeto
                 WHERE cliente IS NOT NULL AND trim(cliente) <> ''
                 GROUP BY org_id, lower(trim(cliente))
                """
            )
        )
        conn.execute(
            sa.text(
                """
                UPDATE projeto p
                   SET cliente_id = c.id
                  FROM cliente c
                 WHERE c.org_id = p.org_id
                   AND lower(trim(p.cliente)) = lower(trim(c.nome))
                """
            )
        )

    # Só depois de convertido. Manter as colunas seria manter duas fontes para o
    # mesmo dado, e elas divergiriam na primeira edição feita pelo lado errado.
    op.drop_column("projeto", "cliente")
    op.drop_column("projeto", "cliente_contato")


def downgrade() -> None:
    op.add_column("projeto", sa.Column("cliente", sa.Text()))
    op.add_column("projeto", sa.Column("cliente_contato", sa.Text()))

    if not op.get_context().as_sql:
        op.get_bind().execute(
            sa.text(
                """
                UPDATE projeto p
                   SET cliente = c.nome, cliente_contato = c.contato
                  FROM cliente c
                 WHERE c.id = p.cliente_id
                """
            )
        )

    op.drop_index("ix_projeto_cliente_id", table_name="projeto")
    op.drop_constraint("fk_projeto_cliente", "projeto", type_="foreignkey")
    op.drop_column("projeto", "cliente_id")
    op.execute("DROP POLICY IF EXISTS tenant_isolation ON cliente")
    op.drop_table("cliente")
