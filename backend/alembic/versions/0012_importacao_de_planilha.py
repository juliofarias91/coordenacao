"""Importação de planilha de auditoria — a PONTE, não o modelo de dados.

ESTAS DUAS TABELAS SÃO PROVISÓRIAS E ISOLADAS DE PROPÓSITO. A plataforma já tem
o caminho certo para auditoria (`criterio` → `checklist_item` → `auditoria` →
`resultado_check`), e nada aqui encosta nele: o importador lê a planilha que a
coordenação preenche à mão e guarda o que leu aqui, para alimentar UM dashboard.

Por que não importar direto para o caminho certo, que era o correto: aquele
exige disciplina, modelo, versão, round e critério cadastrados, e casar os 17
itens da planilha com os critérios do projeto um a um. É trabalho de dias, e o
que se precisava era ver número na tela a partir dos arquivos que já existem.
Fazer isso DENTRO das tabelas de auditoria criaria linhas que parecem auditoria
de verdade sem terem passado por round nem publicação — e aí a dívida ficaria
invisível. Numa tabela com "importacao" no nome, ela fica à vista e sai inteira
quando a migração de verdade acontecer.

`projeto_id` é NULO permitido, e é a maior concessão: as planilhas dizem
`CPQ04-ARCH-R26` num projeto chamado DANTE 2, herança de copiar o arquivo do
projeto anterior. Exigir o vínculo travaria a importação no dado errado deles.

RLS desde o nascimento, como manda a nota em `models/__init__.py` — política por
comando, no formato da 0007/0011. Sem lixeira: importação não se restaura, se
apaga e se importa de novo.

Revision ID: 0012
Revises: 0011
Create Date: 2026-07-30
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op
from app.core.config import settings

revision: str = "0012"
down_revision: str | None = "0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TABELAS = ("importacao_planilha", "importacao_item")


def upgrade() -> None:
    op.create_table(
        "importacao_planilha",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True), primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("org_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "projeto_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("projeto.id", ondelete="CASCADE"),
        ),
        # 'geral' | 'lod300'. Texto e não enum: a tabela é provisória, e criar um
        # tipo no Postgres para ela deixaria resíduo depois de ela sair.
        sa.Column("tipo", sa.Text(), nullable=False),
        sa.Column("arquivo", sa.Text(), nullable=False),
        sa.Column("disciplina", sa.Text(), nullable=False),
        sa.Column("modelo", sa.Text()),
        sa.Column("versao", sa.Text()),
        # A RECONTADA — é esta que o dashboard soma.
        sa.Column("aprovacao", sa.Float()),
        # A que a planilha DECLARA. Guardada só para a tela poder mostrar a
        # divergência; ver a nota 2 de `services/importacao_planilha.py`.
        sa.Column("aprovacao_declarada", sa.Float()),
        sa.Column("itens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("aprovados", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at", sa.DateTime(timezone=True),
            nullable=False, server_default=sa.text("now()"),
        ),
    )
    op.create_index(
        "ix_importacao_planilha_projeto", "importacao_planilha", ["projeto_id", "tipo"]
    )

    op.create_table(
        "importacao_item",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True), primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("org_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "planilha_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("importacao_planilha.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("ordem", sa.Integer(), nullable=False),
        # O grupo de elemento do LOD 300 (FLOOR, CASEWORK…). Nulo na geral, que
        # é uma lista plana de 17.
        sa.Column("grupo", sa.Text()),
        sa.Column("item", sa.Text(), nullable=False),
        sa.Column("aprovado", sa.Boolean(), nullable=False),
        sa.Column("comentario", sa.Text()),
        sa.Column("direcao", sa.Text()),
    )
    op.create_index("ix_importacao_item_planilha", "importacao_item", ["planilha_id"])
    # O dashboard pergunta "quais itens mais reprovam" cruzando todas as
    # planilhas: o índice é sobre o que ele agrupa.
    op.create_index("ix_importacao_item_item", "importacao_item", ["item", "aprovado"])

    # O GRANT é CONDICIONAL, como em 0001/0003/0004/0005/0010: o papel da
    # aplicação é criado pelo provisionamento, não pela migration, e há bancos
    # legítimos sem ele — o `alembic upgrade head` que o CI roda a partir da
    # IMAGEM é um deles, e um `docker compose up` num Postgres recém-criado é
    # outro. Sem esta guarda a 0012 morria com `role "spbim_app" does not
    # exist` e derrubava o job "A imagem sobe e responde": o schema inteiro
    # aplicava e a migração parava na décima segunda.
    app_user = settings.app_db_user
    if op.get_context().as_sql:
        role_exists = True  # geração offline (--sql): emite os GRANTs sem consultar
    else:
        role_exists = bool(
            op.get_bind()
            .execute(sa.text("SELECT 1 FROM pg_roles WHERE rolname = :r"), {"r": app_user})
            .scalar()
        )

    guc = settings.tenant_guc
    do_tenant = f"(org_id)::text = current_setting('{guc}', true)"
    for tabela in TABELAS:
        op.execute(f"ALTER TABLE {tabela} ENABLE ROW LEVEL SECURITY")
        op.execute(f"CREATE POLICY tenant_sel ON {tabela} FOR SELECT USING ({do_tenant})")
        op.execute(f"CREATE POLICY tenant_ins ON {tabela} FOR INSERT WITH CHECK ({do_tenant})")
        op.execute(
            f"CREATE POLICY tenant_upd ON {tabela} FOR UPDATE "
            f"USING ({do_tenant}) WITH CHECK ({do_tenant})"
        )
        op.execute(f"CREATE POLICY tenant_del ON {tabela} FOR DELETE USING ({do_tenant})")
        # O papel da aplicação não é dono da tabela, então precisa do GRANT —
        # é o mesmo que a 0001 faz para as demais, guarda inclusive.
        if role_exists:
            op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON {tabela} TO {app_user}")


def downgrade() -> None:
    for tabela in reversed(TABELAS):
        for nome in ("tenant_sel", "tenant_ins", "tenant_upd", "tenant_del"):
            op.execute(f"DROP POLICY IF EXISTS {nome} ON {tabela}")
    op.drop_index("ix_importacao_item_item", table_name="importacao_item")
    op.drop_index("ix_importacao_item_planilha", table_name="importacao_item")
    op.drop_table("importacao_item")
    op.drop_index("ix_importacao_planilha_projeto", table_name="importacao_planilha")
    op.drop_table("importacao_planilha")
