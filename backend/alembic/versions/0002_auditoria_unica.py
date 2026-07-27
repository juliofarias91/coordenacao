"""Impede duas auditorias para a mesma versão, checklist e área.

`abrir_auditoria` conferia antes de inserir, mas sem trava no banco duas
requisições simultâneas passavam pela checagem e criavam dois rounds da mesma
coisa. O painel então escolhia um dos dois arbitrariamente e os KPIs contavam
os dois — e não há endpoint para apagar auditoria.

`NULLS NOT DISTINCT` (Postgres 15+) é o ponto do índice: `area` é nula nas
auditorias que não são de especificação, e no comportamento padrão duas linhas
com `area` nula seriam consideradas diferentes — justamente o caso mais comum.

Revision ID: 0002
Revises: 0001
Create Date: 2026-07-27
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

INDICE = "uq_auditoria_versao_checklist_area"


def upgrade() -> None:
    conn = op.get_bind()

    if not op.get_context().as_sql:
        # Duplicata pré-existente não é resolvida aqui: qual das duas manter é
        # decisão de quem conhece o round. Falha com o dado na mão.
        duplicadas = conn.execute(
            sa.text(
                """
                SELECT versao_id, checklist, area, count(*) AS n
                FROM auditoria
                GROUP BY versao_id, checklist, area
                HAVING count(*) > 1
                """
            )
        ).all()
        if duplicadas:
            detalhe = "; ".join(
                f"versao={d.versao_id} checklist={d.checklist} area={d.area} ({d.n}x)"
                for d in duplicadas[:10]
            )
            raise RuntimeError(
                "existem auditorias duplicadas e o índice único não pode ser criado. "
                "Escolha qual manter em cada caso e remova a outra, depois rode a "
                f"migration de novo. Duplicatas: {detalhe}"
            )

    # O índice antigo, não único, vira redundante: este cobre as mesmas colunas.
    op.drop_index("ix_auditoria_versao", table_name="auditoria")
    op.execute(
        f"CREATE UNIQUE INDEX {INDICE} ON auditoria "
        "(versao_id, checklist, area) NULLS NOT DISTINCT"
    )


def downgrade() -> None:
    op.execute(f"DROP INDEX IF EXISTS {INDICE}")
    op.create_index("ix_auditoria_versao", "auditoria", ["versao_id", "checklist", "area"])
