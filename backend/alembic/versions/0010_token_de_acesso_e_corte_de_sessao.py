"""Token de definição de senha, e o corte de sessão que ele precisa.

DUAS COISAS QUE SÓ FAZEM SENTIDO JUNTAS.

`token_acesso` é o convite e a redefinição de senha — o mesmo objeto, porque os
dois acabam em "esta pessoa vai escolher uma senha agora, sem precisar da
antiga". Antes disto não havia caminho nenhum: quem esquecia a senha dependia de
um admin DIGITAR uma nova num formulário e passá-la por fora, o que faz o admin
saber a senha da pessoa e não deixa nem registro de que houve troca.

`usuario.sessoes_validas_apos` é o que dá efeito à redefinição. Sem ela, quem
tomou a conta continua com um refresh token válido por 14 dias DEPOIS de o dono
trocar a senha — e o "Sair" da interface era só um `localStorage.removeItem`. O
`/auth/refresh` passa a recusar token emitido antes do corte.

O corte é conferido SÓ no refresh, e não em toda requisição: `get_current_user`
não toca o banco de propósito, e a janela que sobra é o `ACCESS_TOKEN_MINUTES`
(15). Uma leitura por requisição para encurtar 15 minutos não se paga.

Revision ID: 0010
Revises: 0009
Create Date: 2026-07-30
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op
from app.core.config import settings

revision: str = "0010"
down_revision: str | None = "0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ------------------------------------------------- corte de sessão
    # Nula por padrão: nenhuma sessão existente é derrubada pela migration.
    op.add_column(
        "usuario",
        sa.Column("sessoes_validas_apos", sa.DateTime(timezone=True)),
    )

    # ------------------------------------------------- token de acesso
    op.create_table(
        "token_acesso",
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
        # CASCADE: token órfão é token que ninguém pode usar e que ninguém
        # limpa. Ele só existe em função de um usuário.
        sa.Column(
            "usuario_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("usuario.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("tipo", sa.Text(), nullable=False),
        # O SEGREDO NÃO ESTÁ AQUI — só o SHA-256 dele. Um dump com tokens de
        # redefinição em claro é tomada de conta em toda solicitação pendente.
        # UNIQUE porque é por ele que se busca, e duas linhas com o mesmo hash
        # seriam o mesmo token valendo duas vezes.
        sa.Column("token_hash", sa.Text(), nullable=False, unique=True),
        sa.Column("expira_em", sa.DateTime(timezone=True), nullable=False),
        # A linha FICA depois do uso: "quando esta senha foi definida, e a partir
        # de qual convite" é o que se pergunta ao log depois.
        sa.Column("usado_em", sa.DateTime(timezone=True)),
        # SET NULL: o convite não deixa de ter existido porque quem o enviou
        # saiu da empresa. Nulo também quando o pedido nasceu na tela de login,
        # que é pública e não tem autor.
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
    op.create_index("ix_token_acesso_org_id", "token_acesso", ["org_id"])

    # --- row-level security --------------------------------------------------
    # A tabela guarda o caminho para trocar a senha de alguém: sem policy, o
    # SELECT devolveria os tokens pendentes de todas as organizações.
    #
    # As rotas PÚBLICAS (esqueci / redefinir) não passam por aqui: elas usam
    # `get_auth_db`, a mesma sessão privilegiada do login, porque quem chega com
    # um token ainda não tem tenant para o RLS consultar. É a exceção que a
    # autenticação sempre teve, e o token faz o papel do filtro.
    guc = settings.tenant_guc
    op.execute("ALTER TABLE token_acesso ENABLE ROW LEVEL SECURITY")
    op.execute(
        f"CREATE POLICY tenant_isolation ON token_acesso "
        f"USING (org_id::text = current_setting('{guc}', true)) "
        f"WITH CHECK (org_id::text = current_setting('{guc}', true))"
    )

    app_user = settings.app_db_user
    if op.get_context().as_sql:
        role_exists = True  # geração offline (--sql): emite o GRANT sem consultar
    else:
        role_exists = bool(
            op.get_bind()
            .execute(sa.text("SELECT 1 FROM pg_roles WHERE rolname = :r"), {"r": app_user})
            .scalar()
        )
    if role_exists:
        op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON token_acesso TO {app_user}")

    # ------------------------------------------- notificação de acesso
    # `ALTER TYPE ... ADD VALUE` roda dentro de transação a partir do
    # PostgreSQL 12 (o projeto exige 15+) desde que o valor novo não seja USADO
    # na mesma transação — e aqui ele só é declarado.
    #
    # Acrescentar valor a enum é fácil; TIRAR exige recriar o tipo e trava se
    # houver linha usando. Por isso `token_acesso.tipo` é texto, e só isto, que
    # a interface filtra, é enum.
    op.execute("ALTER TYPE notif_tipo ADD VALUE IF NOT EXISTS 'acesso'")


def downgrade() -> None:
    # O valor do enum não volta: removê-lo exigiria recriar `notif_tipo` e
    # reescrever a coluna em `notificacao`. Um valor a mais no tipo é inócuo.
    op.execute("DROP POLICY IF EXISTS tenant_isolation ON token_acesso")
    op.drop_table("token_acesso")
    op.drop_column("usuario", "sessoes_validas_apos")
