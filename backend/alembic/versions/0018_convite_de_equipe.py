"""Convite de pessoas para um projeto, e o prazo de acesso do membro.

Portado da plataforma VDCity (`docs/convite-especificacao-portabilidade.md`, no
K:). Lá o sistema tem DOIS fluxos, e os dois entram aqui:

- **por e-mail**, com o convite travado num endereço;
- **por link aberto**, que qualquer pessoa logada pode abrir.

O que a origem chama de `invites` vira `convite_equipe` — "de equipe" porque
`/projetos/{id}/convites` JÁ EXISTE nesta plataforma e é outra coisa: o convite
do PORTAL DO CLIENTE (`convite_cliente`, token em claro, vida longa, para quem
nem conta tem aqui). Dois recursos com o mesmo nome no mesmo caminho seria a
próxima pessoa abrindo o errado.

═══ OS TRÊS PRAZOS, que a especificação chama de "a parte mais fácil de errar"

Eles são três de propósito, e confundi-los num só é o erro que o documento de
origem descreve:

1. `convite_equipe.expira_em` — validade do LINK. É segurança: um link vazado
   para de funcionar. Três dias, como na origem.
2. `convite_equipe.acesso_expira_em` — até quando a pessoa terá acesso. É a data
   que quem convida escolhe no formulário. Nulo = sem prazo.
3. `projeto_membro.expira_em` — o prazo EFETIVO. O aceite copia (2) para cá.

⚠ E a regra que dá sentido aos três: `services/escopo.py` passa a NEGAR projeto
a membro cujo `expira_em` já venceu. Sem essa checagem na autorização, as três
colunas viram decoração — é textual no documento de origem, e é o erro que ele
mais insiste em não repetir.

═══ O TOKEN É GUARDADO COMO SHA-256, e aqui divergimos da origem de propósito

Lá o token fica em claro numa coluna com `default gen_random_bytes`. Aqui ele
segue a disciplina que `token_acesso` (migration 0010) já estabeleceu: gerado no
SERVIDOR com `secrets.token_urlsafe(32)` e guardado só como hash. Um dump do
banco com tokens de convite em claro é acesso a projeto em toda linha pendente;
com o hash, não é nada. A prévia do convite continua funcionando porque se busca
pelo hash do token APRESENTADO, não pelo valor guardado.

O requisito de segurança real da origem — "token gerado no servidor, nunca no
cliente" — fica satisfeito, e com margem.

Revision ID: 0018
Revises: 0017
Create Date: 2026-08-07
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op
from app.core.config import settings

revision: str = "0018"
down_revision: str | None = "0017"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ---------------------------------------------- o prazo de acesso do membro
    # Nulo = sem prazo, que é como todo vínculo existente fica. A migration não
    # revoga acesso de ninguém.
    op.add_column("projeto_membro", sa.Column("expira_em", sa.DateTime(timezone=True)))

    # ------------------------------------------------------------- o convite
    op.create_table(
        "convite_equipe",
        sa.Column(
            "id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "org_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizacao.id", ondelete="CASCADE"),
            nullable=False,
        ),
        # CASCADE: convite para projeto que não existe mais é lixo que ninguém
        # limpa — e um aceite pendente apontaria para o vazio.
        sa.Column(
            "projeto_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("projeto.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        # NULO = LINK ABERTO; preenchido = travado naquele endereço. É esta
        # coluna que decide se o convite é de uso único — ver a docstring de
        # `services/convite_equipe.py`.
        sa.Column("email", sa.Text()),
        sa.Column(
            "papel",
            sa.dialects.postgresql.ENUM(name="papel_usuario", create_type=False),
            nullable=False,
        ),
        # A equipe do projeto (migration 0014). Copiada para `projeto_membro` no
        # aceite, como `invites.project_team` faz na origem.
        sa.Column("equipe", sa.Text()),
        # Só o hash. Ver o cabeçalho.
        sa.Column("token_hash", sa.Text(), nullable=False, unique=True),
        # (1) validade do LINK.
        sa.Column("expira_em", sa.DateTime(timezone=True), nullable=False),
        # (2) validade do ACESSO — copiada para projeto_membro.expira_em.
        sa.Column("acesso_expira_em", sa.DateTime(timezone=True)),
        # A LINHA FICA depois do aceite: "quem entrou por qual convite, e
        # quando" é o que se pergunta à trilha depois. É também o que faz o
        # convite travado em e-mail ser de uso único.
        sa.Column("aceito_em", sa.DateTime(timezone=True)),
        sa.Column(
            "aceito_por",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("usuario.id", ondelete="SET NULL"),
        ),
        # SET NULL: o convite não deixa de ter existido porque quem o enviou saiu
        # da empresa.
        sa.Column(
            "criado_por",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("usuario.id", ondelete="SET NULL"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("ix_convite_equipe_org_id", "convite_equipe", ["org_id"])

    # --- row-level security --------------------------------------------------
    # Mesma policy do resto do tenant. A rota PÚBLICA de prévia e aceite não
    # passa por aqui: ela usa `get_auth_db`, como as rotas de senha, porque quem
    # chega com um token de convite ainda não tem tenant para o RLS consultar —
    # e é o token que faz o papel do filtro.
    #
    # ⚠ A ESPECIFICAÇÃO AVISA QUE AS RLS DA ORIGEM NÃO ESTÃO VERSIONADAS
    # (armadilha 2): lá elas só existem na nuvem. Aqui elas nascem na migration,
    # que é onde o resto da plataforma as tem.
    guc = settings.tenant_guc
    op.execute("ALTER TABLE convite_equipe ENABLE ROW LEVEL SECURITY")
    op.execute(
        f"CREATE POLICY tenant_isolation ON convite_equipe "
        f"USING (org_id::text = current_setting('{guc}', true)) "
        f"WITH CHECK (org_id::text = current_setting('{guc}', true))"
    )


def downgrade() -> None:
    op.drop_table("convite_equipe")
    op.drop_column("projeto_membro", "expira_em")
