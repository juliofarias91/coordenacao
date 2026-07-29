"""Membros de projeto, e os LOD que faltavam no enum de checklist.

Duas coisas que a reestruturação da navegação (29/07/2026) pediu e que o banco
não tinha.

**LOD300 e LOD350.** O enum `checklist_tipo` ia de `lod400` a `lod500` direto,
pulando os dois níveis em que a coordenação mais trabalha: LOD300 é o projeto
com geometria definida, e LOD350 é onde a compatibilização acontece, porque é
onde as interfaces entre sistemas aparecem. A matriz já era parametrizada por
checklist; era o vocabulário que estava incompleto.

**`projeto_membro`.** Não existia vínculo entre usuário e projeto. O usuário
pertencia à organização e, opcionalmente, a uma empresa — o que responde "quem
tem conta" mas não "quem está no CPQ11", e a segunda é a pergunta de quem
coordena: a mesma pessoa é auditora num projeto e só leitora noutro.

A tabela NÃO AUTORIZA, e isso é deliberado — ver a docstring do modelo. Ela
registra participação e papel combinado; as rotas continuam decidindo por
`requer_permissao` sobre as permissões de organização.

Revision ID: 0004
Revises: 0003
Create Date: 2026-07-29
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql as psql

from alembic import op
from app.core.config import settings
from app.models.enums import PapelUsuario

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Na ordem em que se auditam. O Postgres guarda a ordem de declaração do enum,
# e é ela que decide como um `ORDER BY` sobre a coluna se comporta — daí o
# `BEFORE 'lod400'` em vez de acrescentar no fim.
NOVOS_LOD = ("lod300", "lod350")


def _papel_usuario() -> psql.ENUM:
    """Referencia o tipo `papel_usuario`, que a 0001 já criou.

    `create_type=False` E os valores: sem os valores, o SQLAlchemy monta um
    `sa.Enum` vazio e emite um `CREATE TYPE` no `create_table` — que falha com
    "type papel_usuario already exists". É o mesmo helper `_enum` da 0001, aqui
    só para este tipo.
    """
    return psql.ENUM(*(m.value for m in PapelUsuario), name="papel_usuario", create_type=False)


def upgrade() -> None:
    # `ADD VALUE ... BEFORE`: os dois níveis entram ANTES de lod400, que é onde
    # eles ficam na progressão real (300 → 350 → 400 → 500). Acrescentá-los no
    # fim faria qualquer ordenação por checklist listar LOD300 depois de LOD500.
    #
    # `IF NOT EXISTS` porque esta migration pode reencontrar um banco em que
    # alguém já tenha acrescentado os valores à mão — e `ADD VALUE` repetido é
    # erro, não no-op.
    for valor in NOVOS_LOD:
        op.execute(f"ALTER TYPE checklist_tipo ADD VALUE IF NOT EXISTS '{valor}' BEFORE 'lod400'")

    op.create_table(
        "projeto_membro",
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
            index=True,
        ),
        sa.Column(
            "projeto_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("projeto.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        # CASCADE e não SET NULL: um vínculo sem pessoa não é histórico de nada,
        # é lixo. O histórico de auditoria de quem saiu vive na trilha e nas
        # auditorias assinadas, que têm vida própria.
        sa.Column(
            "usuario_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("usuario.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("papel", _papel_usuario(), nullable=False),
        sa.Column("funcao", sa.Text()),
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
        sa.UniqueConstraint("projeto_id", "usuario_id", name="uq_membro_projeto_usuario"),
    )

    # --- row-level security --------------------------------------------------
    # A 0001 aplicou isto às tabelas de então e a 0003 fez o mesmo para
    # `cliente`. Sem estas linhas a tabela nasceria SEM isolamento, e nada
    # acusaria: o SELECT devolveria os membros de todas as organizações.
    guc = settings.tenant_guc
    op.execute("ALTER TABLE projeto_membro ENABLE ROW LEVEL SECURITY")
    op.execute(
        f"CREATE POLICY tenant_isolation ON projeto_membro "
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
        op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON projeto_membro TO {app_user}")


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS tenant_isolation ON projeto_membro")
    op.drop_table("projeto_membro")
    # Os valores do enum NÃO são removidos: o Postgres não sabe remover valor de
    # enum, e a única saída seria recriar o tipo e reescrever toda coluna que o
    # usa (disciplina.checklists, criterio.checklist, checklist_item.checklist).
    # Um downgrade que reescreve três tabelas para desfazer duas palavras faria
    # mais estrago do que o upgrade — e `lod300` sobrando num enum não quebra
    # nada, só fica disponível.
