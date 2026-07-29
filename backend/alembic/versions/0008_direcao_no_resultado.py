"""A coluna DIRECTION da planilha de auditoria geral.

A planilha que esta plataforma substitui tem, em cada linha reprovada, DUAS
frases e não uma: COMENTARY diz o que está errado ("there are elements in
different phases within the model") e DIRECTION diz o que o fornecedor tem de
fazer ("please ensure all elements within the model are aligned to the same
phase"). São escritas na mesma passada, pela mesma pessoa, olhando o mesmo
modelo.

Até aqui só a primeira tinha lugar: `resultado_check.comentario`. A segunda
existia apenas em `nao_conformidade.recomendacao` — o que obrigava a criar uma
NC, com responsável e prazo, para registrar uma frase. Auditar 17 itens em oito
disciplinas assim é criar dezenas de objetos de acompanhamento para dizer
"renomeie as tabelas em inglês", e o efeito prático foi previsível: a orientação
ia para o comentário, misturada com o diagnóstico.

A NC continua sendo o objeto de ACOMPANHAMENTO — ela é que tem prazo,
responsável e conversa com o fornecedor. O que muda é que ela passa a nascer
preenchida a partir da linha (`comentario` → `descricao`, `direcao` →
`recomendacao`) em vez de ser o único lugar onde a orientação pode existir.

Revision ID: 0008
Revises: 0007
Create Date: 2026-07-29
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Sem RLS nem GRANT novos: a coluna entra numa tabela que já tem os dois.
    op.add_column("resultado_check", sa.Column("direcao", sa.Text()))


def downgrade() -> None:
    op.drop_column("resultado_check", "direcao")
