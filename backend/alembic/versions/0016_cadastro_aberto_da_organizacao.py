"""O interruptor do cadastro aberto, por organização.

O cadastro de conta própria entrou em 05/08/2026 (a pedido). Esta coluna é o que
diz se uma organização o aceita, e ela faz DUAS coisas — a segunda desde
06/08/2026, quando o código da organização saiu:

1. **Autoriza.** Sem ela ligada, `POST /auth/cadastro` não cria nada. É o que
   impede uma rota pública de dar conta no tenant de auditoria a qualquer pessoa
   da internet.
2. **ESCOLHE.** Sem código digitado, a conta nasce na única organização que
   estiver ligada. Duas ligadas ao mesmo tempo fazem o cadastro RECUSAR (409) em
   vez de adivinhar — escolher a primeira que o banco devolvesse poria um
   estranho dentro do tenant errado, com leitura do que se audita lá.

`FALSE` É O DEFAULT, E É O PONTO DA MIGRATION. Toda organização que já existe
continua fechada — o CPQ11 inclusive — e o recurso só passa a valer onde alguém
o ligou de propósito, em `/admin/organizacao`. O contrário (nascer ligado)
transformaria uma migration de infraestrutura numa mudança de política de acesso
de todos os tenants ao mesmo tempo, sem ninguém pedir. É também o que mantém
barata uma rota pública que não tem limite de tentativas: fechada, ela só sabe
responder 404.

NÃO É COLUNA DE SEGREDO. Cheguei a desenhá-la como `codigo_cadastro`, um
segundo identificador que não fosse o slug — mas aí são dois códigos a gerenciar,
dois lugares de onde vazar, e uma tela a mais para girar o que vazou. Um
interruptor resolve com uma decisão o que um segredo resolveria com uma
cerimônia; e quando o código saiu de vez, foi ele que continuou de pé.

Revision ID: 0016
Revises: 0015
Create Date: 2026-08-06
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0016"
down_revision: str | None = "0015"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # `server_default` e não só o default do modelo: as linhas que JÁ existem
    # precisam de valor, e um NULL aqui seria "nem ligado nem desligado" num
    # campo que decide se um estranho pode entrar. O `nullable=False` é o que
    # obriga a resposta a ser sempre uma das duas.
    op.add_column(
        "organizacao",
        sa.Column(
            "cadastro_aberto",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )


def downgrade() -> None:
    op.drop_column("organizacao", "cadastro_aberto")
