"""Lixeira: remoção passa a ser reversível nas entidades que se apagam pela tela.

Até aqui `DELETE` era definitivo. Apagar um cliente com doze projetos, um
critério usado em três checklists ou o relato de um erro era um clique sem
volta — e a plataforma inteira existe para que decisões de auditoria possam ser
reconstruídas depois.

**ONDE O FILTRO MORA, e por que não nas consultas.** A policy de RLS de cada
tabela passa a esconder as linhas removidas. Nenhuma das 72 rotas precisa
lembrar de filtrar — o que é o ponto: filtro espalhado por 72 rotas é esquecido
numa delas, e o registro apagado reaparece exatamente onde ninguém esperava.

A lixeira precisa VER o que as outras telas escondem, e para isso existe um
segundo GUC (`app.ver_removidos`). Ligado, a policy devolve tudo. Só a sessão
de `get_lixeira_db` o liga — uma rota comum teria de pedir essa dependência
explicitamente para enxergar removidos, e é isso que impede o vazamento por
descuido.

O `WITH CHECK` continua olhando SÓ o `org_id`. Se olhasse `deleted_at IS NULL`,
o próprio `UPDATE` que marca a remoção seria rejeitado pela policy.

**AS SETE TABELAS** são exatamente aquelas com rota de DELETE hoje. As demais
não ganham `deleted_at` porque não há como apagá-las pela interface, e uma
coluna que ninguém preenche é peso morto que confunde quem lê o schema depois.

Revision ID: 0006
Revises: 0005
Create Date: 2026-07-29
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op
from app.core.config import settings

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# As tabelas com rota de DELETE. Ver a docstring.
TABELAS = (
    "cliente",
    "criterio",
    "standard",
    "apontamento",
    "projeto_membro",
    "reporte_erro",
    "contato",
    "evidencia",
)


def upgrade() -> None:
    guc = settings.tenant_guc
    lixeira = settings.lixeira_guc

    for tabela in TABELAS:
        op.add_column(tabela, sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))
        # Índice PARCIAL: só as linhas removidas entram nele. A lixeira é a
        # única consulta que procura por elas, e são poucas — um índice cheio
        # custaria escrita em toda inserção para servir uma tela rara.
        op.execute(
            f"CREATE INDEX ix_{tabela}_deleted_at ON {tabela} (deleted_at) "
            f"WHERE deleted_at IS NOT NULL"
        )

        # A policy passa a esconder o que foi removido, a menos que a sessão
        # ligue o segundo GUC. `current_setting(..., true)` devolve NULL quando
        # o GUC não existe, e `NULL = 'on'` é NULL — ou seja, o padrão é
        # esconder, que é o comportamento seguro.
        op.execute(f"DROP POLICY IF EXISTS tenant_isolation ON {tabela}")
        op.execute(
            f"CREATE POLICY tenant_isolation ON {tabela} "
            f"USING ("
            f"  org_id::text = current_setting('{guc}', true) "
            f"  AND (deleted_at IS NULL OR current_setting('{lixeira}', true) = 'on')"
            f") "
            # Só `org_id`: incluir `deleted_at IS NULL` aqui faria a policy
            # rejeitar o próprio UPDATE que marca a remoção.
            f"WITH CHECK (org_id::text = current_setting('{guc}', true))"
        )


def downgrade() -> None:
    guc = settings.tenant_guc
    for tabela in TABELAS:
        op.execute(f"DROP POLICY IF EXISTS tenant_isolation ON {tabela}")
        op.execute(
            f"CREATE POLICY tenant_isolation ON {tabela} "
            f"USING (org_id::text = current_setting('{guc}', true)) "
            f"WITH CHECK (org_id::text = current_setting('{guc}', true))"
        )
        op.execute(f"DROP INDEX IF EXISTS ix_{tabela}_deleted_at")
        op.drop_column(tabela, "deleted_at")
