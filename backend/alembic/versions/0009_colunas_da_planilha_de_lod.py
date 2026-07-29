"""As três colunas de resposta da planilha de LOD (Spec Audit).

A planilha `Spec Audit LOD300_<DISC>` tem, por linha, três respostas que a
auditoria geral não tem — e o guia dela (`GUIDE LOD300`) diz quem preenche cada
uma, o que é a parte que importa:

  REVIT PARAMETER     "parâmetro nativo (built-in) do Revit UTILIZADO"
  PARAMETER           "parâmetro NÃO nativo utilizado"
  SUPPLIERS COMMENTS  "comentários feitos pelos fornecedores"  ← FORNECEDORES

As duas primeiras são a resposta a "onde a informação foi encontrada", e não a
"onde ela deveria estar" — essa é `criterio.parametro_esperado`, que já existe e
é gabarito. Guardar as duas coisas no mesmo campo tornaria impossível a única
pergunta que a planilha existe para responder: a informação está no lugar certo?
A regra do arquivo é "dê preferência a built-in do Revit", e ela só é auditável
se o esperado e o encontrado forem campos diferentes.

A TERCEIRA TEM OUTRO AUTOR, e é por isso que ela não é um comentário a mais.
`resultado_check.comentario` é da coordenação; esta é do fornecedor, que na
planilha responde NA PRÓPRIA LINHA ("a informação THICKNESS se encontra no
built-in DEPTH"). Existe `comentario_fornecedor` como tabela, mas pendurada em
`nao_conformidade`: usá-la aqui obrigaria a abrir uma NC — com prazo e
responsável — para cada uma das 60 linhas em que o fornecedor quisesse
esclarecer um parâmetro. A conversa formal continua na NC; isto é a réplica
dentro da célula.

Revision ID: 0009
Revises: 0008
Create Date: 2026-07-29
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0009"
down_revision: str | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Sem RLS nem GRANT novos: as colunas entram numa tabela que já tem os dois.
    op.add_column("resultado_check", sa.Column("parametro_revit", sa.Text()))
    op.add_column("resultado_check", sa.Column("parametro_encontrado", sa.Text()))
    op.add_column("resultado_check", sa.Column("comentario_fornecedor", sa.Text()))


def downgrade() -> None:
    op.drop_column("resultado_check", "comentario_fornecedor")
    op.drop_column("resultado_check", "parametro_encontrado")
    op.drop_column("resultado_check", "parametro_revit")
