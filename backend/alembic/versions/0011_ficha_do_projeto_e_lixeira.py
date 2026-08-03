"""A ficha cadastral do projeto, e o projeto na lixeira.

DUAS COISAS, e a segunda é a que exige cuidado.

**Os campos da ficha.** Até aqui o projeto tinha código, nome, cliente,
coordenação, PEB e situação — o suficiente para auditar, e insuficiente para
responder "que obra é essa". Entram descrição, endereço e as três datas que o
cronograma de uma obra tem: quando começou, quando deveria terminar e quando
terminou de fato. As duas últimas são separadas de propósito: a previsão muda
ao longo do contrato, a conclusão acontece uma vez, e guardá-las no mesmo campo
apaga o atraso — que é justamente o que se quer ver.

O endereço é UM CAMPO DE TEXTO, e não os sete do modelo de referência
(CEP/logradouro/número/complemento/cidade/estado/país). Aqueles existem lá para
alimentar busca por CEP e um mapa embutido; aqui não há nem um nem outro, e
sete colunas que só se concatenam para exibir são seis a mais para manter.

**O projeto entra na lixeira**, e é a nona entidade a entrar. Ele é o pai de
disciplina, modelo, auditoria e não-conformidade: numa plataforma cujo produto É
o histórico de auditoria, remoção irreversível de um projeto inteiro é a
operação mais cara que existe para errar. Com `deleted_at`, some das listas pela
policy de RLS e volta com um clique.

As policies seguem a 0007 — uma por comando, e não uma `FOR ALL`. O motivo está
no cabeçalho dela: numa `FOR ALL` o Postgres aplica o `USING` também à LINHA
NOVA do UPDATE, e como a linha nova tem `deleted_at` preenchido, o próprio
UPDATE que marca a remoção é recusado.

Revision ID: 0011
Revises: 0010
Create Date: 2026-07-30
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op
from app.core.config import settings

revision: str = "0011"
down_revision: str | None = "0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TABELA = "projeto"


def upgrade() -> None:
    # ------------------------------------------------------ campos da ficha
    op.add_column(TABELA, sa.Column("descricao", sa.Text()))
    op.add_column(TABELA, sa.Column("endereco", sa.Text()))
    # `Date`, não `DateTime`: o começo de uma obra é um dia, não um instante, e
    # guardar fuso aqui só criaria a chance de a data mudar de dia ao ser lida
    # noutro lugar do mundo.
    op.add_column(TABELA, sa.Column("data_inicio", sa.Date()))
    op.add_column(TABELA, sa.Column("data_prevista", sa.Date()))
    op.add_column(TABELA, sa.Column("data_conclusao", sa.Date()))

    # ----------------------------------------------------------- a lixeira
    op.add_column(TABELA, sa.Column("deleted_at", sa.DateTime(timezone=True)))
    # Índice parcial: as consultas do dia a dia perguntam "não removido", e o
    # índice só precisa cobrir a minoria removida.
    op.create_index(
        "ix_projeto_deleted_at",
        TABELA,
        ["deleted_at"],
        postgresql_where=sa.text("deleted_at IS NOT NULL"),
    )

    guc = settings.tenant_guc
    lixeira = settings.lixeira_guc
    do_tenant = f"(org_id)::text = current_setting('{guc}', true)"
    visivel = f"(deleted_at IS NULL OR current_setting('{lixeira}', true) = 'on')"

    op.execute(f"DROP POLICY IF EXISTS tenant_isolation ON {TABELA}")
    op.execute(
        f"CREATE POLICY tenant_sel ON {TABELA} FOR SELECT USING ({do_tenant} AND {visivel})"
    )
    op.execute(f"CREATE POLICY tenant_ins ON {TABELA} FOR INSERT WITH CHECK ({do_tenant})")
    # `USING` acha a linha; `WITH CHECK` valida a linha nova e olha só o tenant —
    # é o que permite gravar `deleted_at` sem a policy recusar o próprio UPDATE.
    op.execute(
        f"CREATE POLICY tenant_upd ON {TABELA} FOR UPDATE "
        f"USING ({do_tenant} AND {visivel}) WITH CHECK ({do_tenant})"
    )
    op.execute(f"CREATE POLICY tenant_del ON {TABELA} FOR DELETE USING ({do_tenant})")


def downgrade() -> None:
    guc = settings.tenant_guc
    do_tenant = f"(org_id)::text = current_setting('{guc}', true)"

    for nome in ("tenant_sel", "tenant_ins", "tenant_upd", "tenant_del"):
        op.execute(f"DROP POLICY IF EXISTS {nome} ON {TABELA}")
    op.execute(
        f"CREATE POLICY tenant_isolation ON {TABELA} "
        f"USING ({do_tenant}) WITH CHECK ({do_tenant})"
    )

    op.drop_index("ix_projeto_deleted_at", table_name=TABELA)
    for coluna in (
        "deleted_at",
        "data_conclusao",
        "data_prevista",
        "data_inicio",
        "endereco",
        "descricao",
    ):
        op.drop_column(TABELA, coluna)
