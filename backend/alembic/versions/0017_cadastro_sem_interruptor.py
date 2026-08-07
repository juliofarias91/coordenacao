"""Fora o interruptor do cadastro: criar conta não tem mais trava.

A 0016 acrescentou `organizacao.cadastro_aberto` para autorizar — e, depois que
o código da organização saiu, também para ESCOLHER o tenant. Ela durou um dia. A
pedido (06/08/2026): quem quiser cria a conta, entra, e fica sem projeto nenhum
até um coordenador vinculá-la. Sem chave, sem checkbox, sem "peça um convite".

O QUE SUBSTITUI O SELETOR é a organização MAIS ANTIGA (`organizacao_do_cadastro`,
em `services/cadastro_aberto.py`). Não é gosto: é a única regra que não precisa
de configuração nem de campo na tela, e ela acerta porque a primeira organização
provisionada é a da própria SPBIM — as outras, se houver, vieram depois. Hoje há
uma segunda linha no banco do piloto (`org-2347b538`, resíduo de teste de 30/07),
e é justamente contra isso que "a mais antiga" protege: "a única que existir"
quebraria com ela ali, e "a primeira que o banco devolver" cairia dentro dela em
metade das execuções, porque SELECT sem ORDER BY não promete ordem nenhuma.

⚠ FICA UM RISCO CONHECIDO, e ele é o preço do que se pediu: no dia em que a
plataforma tiver um SEGUNDO tenant de verdade, toda conta criada por conta
própria continuará nascendo no primeiro, em silêncio. Não há mais nada na
requisição que diga outro destino — foi o que saiu na 0016→0017. Quem precisar
de cadastro por tenant vai precisar de um sinal novo (subdomínio, ou o código de
volta), e é uma decisão de produto, não um ajuste.

NÃO APAGUEI A 0016. Ela já rodou no banco do piloto e já está na branch: sumir
com o arquivo deixaria aquele banco marcado numa revisão sem script, e o
`alembic upgrade` passaria a morrer com "Can't locate revision 0016". Desfazer
para a frente é o caminho certo — a coluna some, o histórico continua contando o
que houve.

Revision ID: 0017
Revises: 0016
Create Date: 2026-08-06
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0017"
down_revision: str | None = "0016"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Nada de valor se perde: a coluna é `false` em toda linha — ninguém chegou a
    # ligar o interruptor antes de ele ser retirado.
    op.drop_column("organizacao", "cadastro_aberto")


def downgrade() -> None:
    # Volta DESLIGADA, como nasceu na 0016. Reconstruir o estado anterior é
    # devolver a coluna com o default dela; qual organização estaria aberta é
    # informação que esta migration apagou de propósito, e inventá-la aqui
    # abriria um tenant que ninguém escolheu.
    op.add_column(
        "organizacao",
        sa.Column(
            "cadastro_aberto",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
