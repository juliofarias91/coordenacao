"""A equipe do membro no projeto.

A tela de membros mostra COORDENAÇÃO, INOVAÇÃO, COMERCIAL ao lado de cada
pessoa, e dentro de um projeto a barra lateral agrupa as pessoas por essas
equipes. Não havia onde guardar isso.

EQUIPE NÃO É `funcao`, e por isso é coluna nova em vez de reuso. `funcao` é o
que a pessoa FAZ no projeto ("modelador", "auditor de estrutura"); equipe é a
que GRUPO ela pertence ("COORDENAÇÃO"). Um modelador e um auditor podem estar na
mesma equipe, e a mesma pessoa é COORDENAÇÃO num projeto e COMERCIAL noutro —
que é justamente por que a coluna fica em `projeto_membro` e não em `usuario`.

TEXT LIVRE, sem tabela de equipes. Uma tabela exigiria cadastrá-las antes de
poder usá-las, e hoje ninguém sabe quais são: elas vão aparecendo conforme a
coordenação nomeia. Quando o conjunto estabilizar e alguém precisar renomear uma
equipe em todos os projetos de uma vez, aí ela vira entidade — e a migration que
fizer isso terá os nomes reais para trabalhar, que é mais do que se tem agora.

NÃO MEXE EM `papel`. A coluna já existe e já é Text; o vocabulário novo
(user / viewer / coordinator) é validação de borda, em `schemas/membro.py`, pela
mesma razão de `auditoria.andamento`: vocabulário de processo muda mais que
schema. E ela CONTINUA SEM AUTORIZAR nesta migration — passar a autorizar exige
tornar `requer_permissao` ciente do projeto da rota, que é mudança de outra
natureza e vai à parte.

Revision ID: 0014
Revises: 0013
Create Date: 2026-07-31
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0014"
down_revision: str | None = "0013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Sem RLS nem GRANT novos: a coluna entra numa tabela que já tem os dois.
    op.add_column("projeto_membro", sa.Column("equipe", sa.Text()))


def downgrade() -> None:
    op.drop_column("projeto_membro", "equipe")
