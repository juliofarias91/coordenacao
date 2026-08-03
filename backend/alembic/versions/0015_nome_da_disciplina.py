"""O nome por extenso da disciplina.

A disciplina se identifica por `codigo` ('STRC-STEEL'), montado de `disc` +
`sub`. É o que entra na nomenclatura do arquivo e é o que a coordenação digita —
mas não é o que ela FALA. Ninguém diz "abre o STRC-STEEL"; diz "abre a estrutura
metálica". A tela mostrava só a sigla, e quem entra num projeto pela primeira vez
lê oito códigos sem saber o que cada um é.

`nome` É OPCIONAL, e é isso que o mantém honesto. A sigla continua sendo a
identidade — o UNIQUE é sobre `codigo`, não sobre o nome, e a nomenclatura de
arquivo não muda. O nome é rótulo de leitura: onde existir, a tela mostra
"Arquitetura (ARCH)"; onde não, mostra "ARCH" e não inventa nada.

NÃO ENTRA COLUNA DE COR JUNTO, e a decisão é deliberada. A cor da disciplina já
existe: vem de `macro` (A/C/M/S), que toda disciplina tem, e a paleta é
categórica VALIDADA — banda de luminosidade, piso de saturação, daltonismo (ver
"Ao criar gráfico" no CLAUDE.md). Uma cor por disciplina daria duas fontes para a
mesma informação e deixaria alguém escolher um tom que falha no modo escuro ou
para um daltônico. A aba "Cores" some porque a cor passa a ser mostrada AO LADO
da disciplina, não porque ela virou editável.

Revision ID: 0015
Revises: 0014
Create Date: 2026-07-31
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0015"
down_revision: str | None = "0014"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Sem RLS nem GRANT novos: a coluna entra numa tabela que já tem os dois.
    op.add_column("disciplina", sa.Column("nome", sa.Text()))


def downgrade() -> None:
    op.drop_column("disciplina", "nome")
