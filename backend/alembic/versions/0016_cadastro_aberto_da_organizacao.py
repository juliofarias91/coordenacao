"""O interruptor do cadastro aberto, por organização.

O cadastro de conta própria entrou em 05/08/2026 (a pedido), e quem decide em
que organização a conta nasce é o CÓDIGO que a pessoa digita — o slug. Só que o
slug não é segredo: ele aparece no endereço do convite e a tela de login já o
pede quando o mesmo e-mail existe em dois tenants. Sem esta coluna, conhecer o
slug de uma organização bastaria para criar uma conta dentro dela, e numa
plataforma de auditoria multi-tenant isso é uma porta aberta com a chave na
fechadura.

`FALSE` É O DEFAULT, E É O PONTO DA MIGRATION. Toda organização que já existe
continua fechada — o CPQ11 inclusive — e o recurso só passa a valer onde alguém
o ligou de propósito, em `/admin/organizacao`. O contrário (nascer ligado)
transformaria uma migration de infraestrutura numa mudança de política de acesso
de todos os tenants ao mesmo tempo, sem ninguém pedir.

NÃO É COLUNA DE SEGREDO. Cheguei a desenhá-la como `codigo_cadastro`, um
segundo identificador que não fosse o slug — mas aí são dois códigos a gerenciar,
dois lugares de onde vazar, e uma tela a mais para girar o que vazou. O
interruptor resolve o mesmo problema com uma decisão em vez de um segredo: quem
não está recrutando ninguém deixa desligado, e o slug volta a não valer nada.

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
