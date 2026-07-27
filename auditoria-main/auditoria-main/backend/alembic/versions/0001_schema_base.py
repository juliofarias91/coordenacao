"""Schema base — seção 3 do Plano Técnico do Piloto.

Cria os 12 tipos enum, as 23 tabelas do domínio e as policies de row-level
security que sustentam o isolamento multi-tenant.

Revision ID: 0001
Revises:
Create Date: 2026-07-26
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql as psql

from alembic import op
from app.core.config import settings
from app.models import TENANT_TABLES
from app.models.enums import ENUM_TYPES

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


# --------------------------------------------------------------------------
# Helpers — colunas repetidas em quase toda tabela
# --------------------------------------------------------------------------
def _id() -> sa.Column:
    return sa.Column(
        "id",
        psql.UUID(as_uuid=True),
        primary_key=True,
        server_default=sa.text("gen_random_uuid()"),
    )


def _org() -> sa.Column:
    return sa.Column(
        "org_id",
        psql.UUID(as_uuid=True),
        sa.ForeignKey("organizacao.id", ondelete="RESTRICT"),
        nullable=False,
    )


def _ts() -> list[sa.Column]:
    return [
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    ]


def _fk(name: str, table: str, *, nullable: bool = True, ondelete: str = "SET NULL") -> sa.Column:
    return sa.Column(
        name,
        psql.UUID(as_uuid=True),
        sa.ForeignKey(f"{table}.id", ondelete=ondelete),
        nullable=nullable,
    )


def _enum(type_name: str) -> psql.ENUM:
    """Referencia um tipo enum já existente no banco (criado logo abaixo)."""
    values = [m.value for m in ENUM_TYPES[type_name]]
    return psql.ENUM(*values, name=type_name, create_type=False)


def upgrade() -> None:
    # gen_random_uuid()
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")

    # ---------------------------------------------------------------- enums
    for type_name, py_enum in ENUM_TYPES.items():
        values = ", ".join(f"'{m.value}'" for m in py_enum)
        op.execute(
            f"DO $$ BEGIN "
            f"  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = '{type_name}') THEN "
            f"    CREATE TYPE {type_name} AS ENUM ({values}); "
            f"  END IF; "
            f"END $$;"
        )

    # ------------------------------------------------------------- cadastro
    op.create_table(
        "organizacao",
        _id(),
        sa.Column("nome", sa.Text(), nullable=False),
        sa.Column("slug", sa.Text(), unique=True),
        *_ts(),
    )

    op.create_table(
        "projeto",
        _id(),
        _org(),
        sa.Column("codigo", sa.Text(), nullable=False),
        sa.Column("nome", sa.Text(), nullable=False),
        sa.Column("cliente", sa.Text()),
        sa.Column("cliente_contato", sa.Text()),
        sa.Column("coordenacao", sa.Text()),
        sa.Column("bep_ref", sa.Text()),
        sa.Column("status", sa.Text(), nullable=False, server_default=sa.text("'config'")),
        *_ts(),
        sa.UniqueConstraint("org_id", "codigo", name="uq_projeto_org_codigo"),
    )

    op.create_table(
        "empresa",
        _id(),
        _org(),
        sa.Column("nome", sa.Text(), nullable=False),
        sa.Column("cnpj", sa.Text()),
        sa.Column(
            "tipo",
            _enum("empresa_tipo"),
            nullable=False,
            server_default=sa.text("'terceirizada'"),
        ),
        _fk("contratada_por", "empresa"),
        sa.Column(
            "papeis",
            psql.ARRAY(_enum("empresa_papel")),
            nullable=False,
            server_default=sa.text("'{}'"),
        ),
        sa.Column("ferramenta", sa.Text()),
        sa.Column("departamento", sa.Text()),
        sa.Column("disciplinas", sa.Text()),
        sa.Column("logo_url", sa.Text()),
        sa.Column("status", sa.Text(), nullable=False, server_default=sa.text("'ativo'")),
        sa.Column("penalidades", sa.Integer(), nullable=False, server_default=sa.text("0")),
        *_ts(),
    )

    op.create_table(
        "contato",
        _id(),
        _org(),
        _fk("empresa_id", "empresa", nullable=False, ondelete="CASCADE"),
        sa.Column("nome", sa.Text()),
        sa.Column("cargo", sa.Text()),
        sa.Column("email", sa.Text()),
        sa.Column("telefone", sa.Text()),
        sa.Column("departamento", sa.Text()),
        sa.Column("disciplina", sa.Text()),
        *_ts(),
    )

    op.create_table(
        "usuario",
        _id(),
        _org(),
        sa.Column("login", sa.Text(), nullable=False),
        sa.Column("nome", sa.Text()),
        sa.Column("senha_hash", sa.Text()),
        sa.Column("oidc_sub", sa.Text()),
        sa.Column("papel", _enum("papel_usuario"), nullable=False),
        _fk("empresa_id", "empresa"),
        sa.Column("status", sa.Text(), nullable=False, server_default=sa.text("'ativo'")),
        sa.Column(
            "permissoes",
            psql.ARRAY(sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'"),
        ),
        sa.Column("idioma", sa.Text(), nullable=False, server_default=sa.text("'pt'")),
        *_ts(),
        sa.UniqueConstraint("org_id", "login", name="uq_usuario_org_login"),
    )
    op.create_index("ix_usuario_oidc_sub", "usuario", ["oidc_sub"])

    op.create_table(
        "standard",
        _id(),
        _org(),
        _fk("projeto_id", "projeto", nullable=False, ondelete="CASCADE"),
        sa.Column("nome", sa.Text(), nullable=False),
        sa.Column("tipo", sa.Text(), nullable=False),
        sa.Column("referencia", sa.Text()),
        sa.Column("conteudo", psql.JSONB()),
        sa.Column("referencia_url", sa.Text()),
        *_ts(),
    )

    op.create_table(
        "nomenclatura_padrao",
        _id(),
        _org(),
        _fk("projeto_id", "projeto", nullable=False, ondelete="CASCADE"),
        sa.Column("segmentos", psql.JSONB(), nullable=False),
        sa.Column("vigente", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        *_ts(),
    )

    op.create_table(
        "disciplina",
        _id(),
        _org(),
        _fk("projeto_id", "projeto", nullable=False, ondelete="CASCADE"),
        sa.Column("codigo", sa.Text(), nullable=False),
        sa.Column("macro", _enum("macro_disc"), nullable=False),
        sa.Column("disc", sa.Text(), nullable=False),
        sa.Column("sub", sa.Text(), nullable=False),
        _fk("projetista_id", "empresa"),
        sa.Column(
            "checklists",
            psql.ARRAY(_enum("checklist_tipo")),
            nullable=False,
            server_default=sa.text("'{}'"),
        ),
        _fk("nomenclatura_id", "standard"),
        sa.Column(
            "areas", psql.ARRAY(sa.Text()), nullable=False, server_default=sa.text("'{}'")
        ),
        *_ts(),
        sa.UniqueConstraint("projeto_id", "codigo", name="uq_disciplina_projeto_codigo"),
    )

    # ------------------------------------------------------------ critérios
    op.create_table(
        "criterio",
        _id(),
        _org(),
        _fk("projeto_id", "projeto", nullable=False, ondelete="CASCADE"),
        sa.Column("codigo", sa.Text(), nullable=False),
        sa.Column("nome_pt", sa.Text(), nullable=False),
        sa.Column("nome_en", sa.Text(), nullable=False),
        sa.Column("categoria", sa.Text()),
        sa.Column("nivel", _enum("criterio_nivel"), nullable=False),
        sa.Column("automacao", _enum("automacao"), nullable=False),
        _fk("standard_id", "standard"),
        sa.Column("parametro_esperado", sa.Text()),
        sa.Column("criterio_aceitacao", sa.Text()),
        sa.Column("instrucao", sa.Text()),
        sa.Column("referencia_url", sa.Text()),
        *_ts(),
        sa.UniqueConstraint("projeto_id", "codigo", name="uq_criterio_projeto_codigo"),
    )

    op.create_table(
        "checklist_item",
        _id(),
        _org(),
        _fk("projeto_id", "projeto", nullable=False, ondelete="CASCADE"),
        sa.Column("checklist", _enum("checklist_tipo"), nullable=False),
        _fk("criterio_id", "criterio", nullable=False, ondelete="CASCADE"),
        sa.Column("ordem", sa.Integer()),
        sa.Column("obrigatorio", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("fase", sa.Text()),
        sa.Column("min_lod", sa.Text()),
        sa.Column("min_loi", sa.Text()),
        sa.Column("instrucao_override", sa.Text()),
        sa.Column("peso", sa.Integer(), nullable=False, server_default=sa.text("1")),
        *_ts(),
        sa.UniqueConstraint(
            "projeto_id", "checklist", "criterio_id", name="uq_checklist_item_unico"
        ),
    )

    # -------------------------------------------------------------- modelos
    op.create_table(
        "modelo",
        _id(),
        _org(),
        _fk("projeto_id", "projeto", nullable=False, ondelete="CASCADE"),
        sa.Column("codigo", sa.Text(), nullable=False),
        _fk("disciplina_id", "disciplina"),
        _fk("instaladora_id", "empresa"),
        _fk("modeladora_id", "empresa"),
        sa.Column("acc_item_id", sa.Text()),
        *_ts(),
        sa.UniqueConstraint("projeto_id", "codigo", name="uq_modelo_projeto_codigo"),
    )
    op.create_index("ix_modelo_acc_item_id", "modelo", ["acc_item_id"])

    op.create_table(
        "versao_modelo",
        _id(),
        _org(),
        _fk("modelo_id", "modelo", nullable=False, ondelete="CASCADE"),
        sa.Column("versao", sa.Text(), nullable=False),
        sa.Column("round", sa.Integer()),
        sa.Column("formato", _enum("versao_formato"), nullable=False),
        sa.Column("autoria", sa.Text()),
        sa.Column("acc_version", sa.Text()),
        sa.Column("arquivo_url", sa.Text()),
        sa.Column("urn", sa.Text()),
        sa.Column("publicado_em", sa.DateTime(timezone=True)),
        *_ts(),
        sa.UniqueConstraint("modelo_id", "versao", name="uq_versao_modelo_versao"),
    )

    # ------------------------------------------------------------ auditoria
    op.create_table(
        "auditoria",
        _id(),
        _org(),
        _fk("versao_id", "versao_modelo", nullable=False, ondelete="CASCADE"),
        sa.Column("checklist", _enum("checklist_tipo"), nullable=False),
        sa.Column("area", sa.Text()),
        sa.Column("round", sa.Integer()),
        sa.Column(
            "estado",
            _enum("auditoria_estado"),
            nullable=False,
            server_default=sa.text("'nao_publicado'"),
        ),
        sa.Column("aprovacao_pct", sa.Numeric(5, 2)),
        _fk("auditor_id", "usuario"),
        _fk("revisado_por", "usuario"),
        sa.Column("data_inicio", sa.DateTime(timezone=True)),
        sa.Column("data_fim", sa.DateTime(timezone=True)),
        sa.Column("entrega_estimada", sa.Date()),
        sa.Column("publicado_em", sa.DateTime(timezone=True)),
        *_ts(),
    )
    op.create_index("ix_auditoria_versao", "auditoria", ["versao_id", "checklist", "area"])

    op.create_table(
        "resultado_check",
        _id(),
        _org(),
        _fk("auditoria_id", "auditoria", nullable=False, ondelete="CASCADE"),
        _fk("criterio_id", "criterio", nullable=False, ondelete="RESTRICT"),
        sa.Column(
            "status", _enum("check_status"), nullable=False, server_default=sa.text("'pendente'")
        ),
        sa.Column(
            "origem", _enum("origem_result"), nullable=False, server_default=sa.text("'manual'")
        ),
        sa.Column("comentario", sa.Text()),
        sa.Column("itens_analisados", sa.Integer()),
        sa.Column("itens_ok", sa.Integer()),
        *_ts(),
        sa.UniqueConstraint(
            "auditoria_id", "criterio_id", name="uq_resultado_auditoria_criterio"
        ),
    )

    op.create_table(
        "ocorrencia",
        _id(),
        _org(),
        _fk("resultado_id", "resultado_check", nullable=False, ondelete="CASCADE"),
        sa.Column("element_id", sa.Text(), nullable=False),
        sa.Column("detalhe", sa.Text()),
        *_ts(),
    )
    op.create_index("ix_ocorrencia_resultado", "ocorrencia", ["resultado_id"])

    op.create_table(
        "evidencia",
        _id(),
        _org(),
        _fk("resultado_id", "resultado_check", nullable=False, ondelete="CASCADE"),
        sa.Column("arquivo_url", sa.Text(), nullable=False),
        sa.Column("legenda", sa.Text()),
        *_ts(),
    )

    op.create_table(
        "nao_conformidade",
        _id(),
        _org(),
        _fk("auditoria_id", "auditoria", nullable=False, ondelete="CASCADE"),
        _fk("criterio_id", "criterio"),
        _fk("resultado_id", "resultado_check"),
        sa.Column("descricao", sa.Text()),
        sa.Column("recomendacao", sa.Text()),
        sa.Column("elementos", sa.Text()),
        _fk("responsavel_id", "empresa"),
        sa.Column("prazo", sa.Date()),
        sa.Column("status", sa.Text(), nullable=False, server_default=sa.text("'aberto'")),
        *_ts(),
    )

    op.create_table(
        "comentario_fornecedor",
        _id(),
        _org(),
        _fk("nc_id", "nao_conformidade", nullable=False, ondelete="CASCADE"),
        _fk("usuario_id", "usuario"),
        sa.Column("texto", sa.Text()),
        *_ts(),
    )

    # ---------------------------------------------------------- colaboração
    op.create_table(
        "apontamento",
        _id(),
        _org(),
        _fk("projeto_id", "projeto", nullable=False, ondelete="CASCADE"),
        sa.Column("codigo", sa.Text()),
        sa.Column("titulo", sa.Text(), nullable=False),
        _fk("modelo_id", "modelo"),
        sa.Column("disciplina", sa.Text()),
        sa.Column("prioridade", sa.Text()),
        sa.Column("status", sa.Text(), nullable=False, server_default=sa.text("'aberto'")),
        _fk("responsavel_id", "empresa"),
        sa.Column("descricao", sa.Text()),
        sa.Column("acc_issue_id", sa.Text()),
        *_ts(),
    )
    op.create_index("ix_apontamento_acc_issue_id", "apontamento", ["acc_issue_id"])

    op.create_table(
        "notificacao",
        _id(),
        _org(),
        _fk("usuario_id", "usuario", ondelete="CASCADE"),
        sa.Column("papel_alvo", sa.Text()),
        sa.Column("tipo", _enum("notif_tipo"), nullable=False),
        sa.Column("mensagem", sa.Text(), nullable=False),
        sa.Column("origem", sa.Text()),
        sa.Column("lida", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        *_ts(),
    )
    op.create_index("ix_notificacao_usuario_lida", "notificacao", ["usuario_id", "lida"])

    op.create_table(
        "penalidade",
        _id(),
        _org(),
        _fk("empresa_id", "empresa", nullable=False, ondelete="CASCADE"),
        sa.Column("motivo", sa.Text(), nullable=False),
        sa.Column("peso", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.Column("referencia", sa.Text()),
        *_ts(),
    )

    op.create_table(
        "convite_cliente",
        _id(),
        _org(),
        _fk("projeto_id", "projeto", nullable=False, ondelete="CASCADE"),
        sa.Column("cliente_nome", sa.Text()),
        sa.Column("cliente_email", sa.Text()),
        sa.Column("secoes", psql.JSONB()),
        sa.Column("colunas", psql.JSONB()),
        sa.Column("token", sa.Text(), nullable=False, unique=True),
        sa.Column("ativo", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        *_ts(),
    )

    op.create_table(
        "trilha_auditoria",
        _id(),
        _org(),
        _fk("usuario_id", "usuario"),
        sa.Column("entidade", sa.Text()),
        sa.Column("entidade_id", psql.UUID(as_uuid=True)),
        sa.Column("acao", sa.Text()),
        sa.Column("diff", psql.JSONB()),
        *_ts(),
    )
    op.create_index(
        "ix_trilha_entidade", "trilha_auditoria", ["entidade", "entidade_id"]
    )

    # Índice de org_id em toda tabela de negócio — é a coluna de todo filtro.
    for table in TENANT_TABLES:
        op.create_index(f"ix_{table}_org_id", table, ["org_id"])

    # --------------------------------------------------- row-level security
    #
    # Segunda camada de isolamento: mesmo que um filtro escape no query
    # builder, o Postgres só devolve linhas do tenant corrente. O tenant vem
    # de `set_config('app.org_id', ...)`, chamado por `set_tenant()` a cada
    # requisição autenticada.
    #
    # `current_setting(..., true)` devolve NULL quando não definido; a
    # comparação vira NULL e nenhuma linha passa — o padrão é negar.
    guc = settings.tenant_guc

    op.execute("ALTER TABLE organizacao ENABLE ROW LEVEL SECURITY")
    op.execute(
        f"CREATE POLICY tenant_isolation ON organizacao "
        f"USING (id::text = current_setting('{guc}', true))"
    )

    for table in TENANT_TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(
            f"CREATE POLICY tenant_isolation ON {table} "
            f"USING (org_id::text = current_setting('{guc}', true)) "
            f"WITH CHECK (org_id::text = current_setting('{guc}', true))"
        )

    # Permissões do papel de aplicação. Em docker-compose o init SQL já cuidou
    # disso via ALTER DEFAULT PRIVILEGES; num Postgres instalado à mão o papel
    # pode não existir ainda — daí a guarda.
    app_user = settings.app_db_user
    if op.get_context().as_sql:
        role_exists = True  # geração offline (--sql): emite os GRANTs sem consultar
    else:
        role_exists = bool(
            op.get_bind()
            .execute(sa.text("SELECT 1 FROM pg_roles WHERE rolname = :r"), {"r": app_user})
            .scalar()
        )
    if role_exists:
        op.execute(f"GRANT USAGE ON SCHEMA public TO {app_user}")
        op.execute(
            f"GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO {app_user}"
        )
        op.execute(f"GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO {app_user}")


def downgrade() -> None:
    for table in ("organizacao", *TENANT_TABLES):
        op.execute(f"DROP POLICY IF EXISTS tenant_isolation ON {table}")

    for table in reversed(
        (
            "organizacao", "projeto", "empresa", "contato", "usuario", "standard",
            "nomenclatura_padrao", "disciplina", "criterio", "checklist_item", "modelo",
            "versao_modelo", "auditoria", "resultado_check", "ocorrencia", "evidencia",
            "nao_conformidade", "comentario_fornecedor", "apontamento", "notificacao",
            "penalidade", "convite_cliente", "trilha_auditoria",
        )
    ):
        op.drop_table(table)

    for type_name in ENUM_TYPES:
        op.execute(f"DROP TYPE IF EXISTS {type_name}")
