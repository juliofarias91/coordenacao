"""Corrige as policies da lixeira: uma por comando, em vez de uma `FOR ALL`.

A 0006 criou UMA policy `FOR ALL` com a condição da lixeira no `USING` e só o
`org_id` no `WITH CHECK`. A intenção era: `USING` decide o que se ENXERGA,
`WITH CHECK` decide o que se PODE GRAVAR — e assim marcar `deleted_at` passaria
pelo check.

Não passa. **Numa policy `FOR ALL`, o Postgres aplica a expressão `USING`
TAMBÉM À LINHA NOVA do UPDATE**, além do `WITH CHECK`. Como a linha nova tem
`deleted_at` preenchido e a sessão comum roda com `app.ver_removidos = off`, o
próprio UPDATE que marca a remoção era recusado com "new row violates
row-level security policy". Ou seja: com a 0006 sozinha, remover não funciona
em nenhuma das sete tabelas.

A correção é separar por comando, que é onde o Postgres respeita a divisão:

  SELECT  USING  org + esconde removido      (é o filtro que a lixeira liga)
  UPDATE  USING  org + esconde removido      (acha a linha)
          CHECK  org                          (aceita a linha nova, com deleted_at)
  INSERT  CHECK  org
  DELETE  USING  org                          (o apagar-de-vez, só pela lixeira)

Revision ID: 0007
Revises: 0006
Create Date: 2026-07-29
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op
from app.core.config import settings

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TABELAS = (
    "cliente",
    "criterio",
    "standard",
    "apontamento",
    "projeto_membro",
    "reporte_erro",
    "contato",
    "evidencia",
)


def upgrade() -> None:
    guc = settings.tenant_guc
    lixeira = settings.lixeira_guc
    do_tenant = f"(org_id)::text = current_setting('{guc}', true)"
    visivel = f"(deleted_at IS NULL OR current_setting('{lixeira}', true) = 'on')"

    for t in TABELAS:
        op.execute(f"DROP POLICY IF EXISTS tenant_isolation ON {t}")
        op.execute(f"CREATE POLICY tenant_sel ON {t} FOR SELECT USING ({do_tenant} AND {visivel})")
        op.execute(f"CREATE POLICY tenant_ins ON {t} FOR INSERT WITH CHECK ({do_tenant})")
        # `USING` acha a linha (e some com a removida numa sessão comum);
        # `WITH CHECK` valida a linha nova, e olha só o tenant — é o que
        # permite gravar `deleted_at` sem a policy recusar o próprio UPDATE.
        op.execute(
            f"CREATE POLICY tenant_upd ON {t} FOR UPDATE "
            f"USING ({do_tenant} AND {visivel}) WITH CHECK ({do_tenant})"
        )
        # O apagar-de-vez. Sem a condição da lixeira: quem chega aqui é a rota
        # `/lixeira/{tipo}/{id}`, que já exige o item estar removido.
        op.execute(f"CREATE POLICY tenant_del ON {t} FOR DELETE USING ({do_tenant})")


def downgrade() -> None:
    guc = settings.tenant_guc
    lixeira = settings.lixeira_guc
    do_tenant = f"(org_id)::text = current_setting('{guc}', true)"
    visivel = f"(deleted_at IS NULL OR current_setting('{lixeira}', true) = 'on')"

    for t in TABELAS:
        for nome in ("tenant_sel", "tenant_ins", "tenant_upd", "tenant_del"):
            op.execute(f"DROP POLICY IF EXISTS {nome} ON {t}")
        op.execute(
            f"CREATE POLICY tenant_isolation ON {t} "
            f"USING ({do_tenant} AND {visivel}) WITH CHECK ({do_tenant})"
        )
