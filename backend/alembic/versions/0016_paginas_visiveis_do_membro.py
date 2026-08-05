"""As páginas do projeto que um membro NÃO vê.

Uma coluna, e é tudo o que esta migration faz. A gaveta de edição de membro
ganhou os interruptores de visualização de página, e não havia onde guardar a
escolha.

GUARDA AS OCULTAS, NÃO AS VISÍVEIS, e a diferença decide o que acontece com a
tela que ainda não existe: guardando as visíveis, toda entrada nova do menu
nasceria invisível para todos os membros já cadastrados, e alguém teria de
reabrir vínculo por vínculo para liberá-la. Guardando as ocultas, ela nasce
visível — que é o comportamento de hoje, e o único que não some com uma tela em
silêncio. `NULL` é "vê tudo", que é o que todo vínculo anterior a esta coluna
sempre significou.

ISTO NÃO AUTORIZA, e a ressalva é a mesma da 0004 e da 0014. Ocultar tira o item
do menu; a API continua decidindo por `requer_permissao` sobre as permissões de
ORGANIZAÇÃO. É exatamente o estatuto que o `exigePermissao` do `layout/nav.ts`
sempre teve — conveniência de navegação, declarada como tal. Passar a autorizar
de verdade exige tornar `requer_permissao` ciente do projeto da rota, e isso
atinge as 135 rotas e o RLS junto; continua sendo mudança à parte.

JSONB e não tabela de junção. Uma `membro_pagina` daria integridade referencial
a um valor que não referencia entidade nenhuma: as páginas são as rotas do menu,
que vivem no código do front, não no banco. A validação do conjunto está em
`schemas/membro.py`, na borda, e `test_contrato.py` a compara com o `nav.ts`.

Revision ID: 0016
Revises: 0015
Create Date: 2026-08-05
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0016"
down_revision: str | None = "0015"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Sem RLS nem GRANT novos: a coluna entra numa tabela que já tem os dois.
    # Nula e sem default: é ADITIVA, não reescreve linha e não toma lock longo.
    op.add_column("projeto_membro", sa.Column("paginas", postgresql.JSONB()))


def downgrade() -> None:
    op.drop_column("projeto_membro", "paginas")
