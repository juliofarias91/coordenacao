"""Andamento e prioridade da auditoria.

A auditoria já tinha responsável (`auditor_id`), as três datas (`data_inicio`,
`data_fim`, `entrega_estimada`) e o `estado`. Faltavam duas coisas para ela
poder ser PLANEJADA e não só executada — que é o que a gaveta de nova auditoria
pede.

ANDAMENTO NÃO É `estado`, E ESTA É A DECISÃO DESTA MIGRATION. O `estado`
(publicado / nao_publicado / desatualizado) é de PUBLICAÇÃO e ninguém o escolhe:
quem o move é o fluxo de round, em `services/auditoria.py`. Se a gaveta
escrevesse nele, daria para uma auditoria NASCER "publicada" sem ter passado por
round nenhum — e publicar é o ato que congela o resultado para o fornecedor.
`andamento` é o trabalho de quem audita: a fazer, em andamento, concluída,
bloqueada. Os dois convivem porque respondem perguntas diferentes: "o fornecedor
já pode ver?" e "alguém está mexendo nisto?".

TEXT, E NÃO ENUM NATIVO, nos dois. É o precedente de `apontamento.prioridade` e
`apontamento.status`, e a razão está no CLAUDE.md: tirar um valor de enum no
Postgres exige recriar o tipo e trava se houver linha usando. Estes dois são
vocabulário de processo — o de auditoria em obra muda mais do que o schema —, ao
contrário de `checklist_tipo` e `auditoria_estado`, que são estrutura.

O DEFAULT DE `andamento` É 'a_fazer' E É `NOT NULL`. Toda auditoria que já existe
passa a ser "a fazer", inclusive as concluídas — o dado para distinguir não
existe no banco, e chutar "concluída" a partir de `aprovacao_pct` marcaria como
pronta toda auditoria de 100% que ninguém revisou. `prioridade` é NULA por
padrão pela razão oposta: "sem prioridade definida" é uma resposta honesta e
diferente de "média".

Revision ID: 0013
Revises: 0012
Create Date: 2026-07-31
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0013"
down_revision: str | None = "0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Sem RLS nem GRANT novos: as colunas entram numa tabela que já tem os dois.
    op.add_column(
        "auditoria",
        sa.Column(
            "andamento",
            sa.Text(),
            nullable=False,
            server_default=sa.text("'a_fazer'"),
        ),
    )
    op.add_column("auditoria", sa.Column("prioridade", sa.Text()))


def downgrade() -> None:
    op.drop_column("auditoria", "prioridade")
    op.drop_column("auditoria", "andamento")
