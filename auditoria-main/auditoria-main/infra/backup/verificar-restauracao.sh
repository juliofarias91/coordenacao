#!/bin/sh
# Prova que o backup restaura — num banco descartável, sem tocar em produção.
#
#   docker compose -f docker-compose.prod.yml run --rm backup-db \
#     /backup/verificar-restauracao.sh
#
# Um backup que nunca foi restaurado não é um backup: é um arquivo. Rode isto
# no mínimo uma vez por mês, e sempre depois de mexer no schema.
set -eu

DIR="${BACKUP_DIR:-/var/backups/spbim}/postgres"
ARQUIVO="${1:-$(ls -1t "$DIR"/*.dump 2>/dev/null | head -n 1)}"
TESTE="verificacao_restauracao_$(date -u +%s)"

if [ -z "${ARQUIVO:-}" ] || [ ! -f "$ARQUIVO" ]; then
  echo "nenhum dump encontrado em $DIR" >&2
  exit 1
fi

echo "[verificação] usando $ARQUIVO"
echo "[verificação] criando banco descartável $TESTE"
createdb "$TESTE"

limpar() {
  dropdb --if-exists "$TESTE" 2>/dev/null || true
}
trap limpar EXIT

if ! pg_restore --dbname="$TESTE" --no-owner --no-privileges --exit-on-error "$ARQUIVO"; then
  echo "[verificação] FALHOU: o dump não restaura" >&2
  exit 1
fi

TABELAS=$(psql -d "$TESTE" -tAc \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")
POLICIES=$(psql -d "$TESTE" -tAc \
  "SELECT count(*) FROM pg_policies WHERE schemaname='public'")
AUDITORIAS=$(psql -d "$TESTE" -tAc "SELECT count(*) FROM auditoria" 2>/dev/null || echo 0)
ORGS=$(psql -d "$TESTE" -tAc "SELECT count(*) FROM organizacao" 2>/dev/null || echo 0)

echo "[verificação] tabelas: $TABELAS | policies RLS: $POLICIES"
echo "[verificação] organizações: $ORGS | auditorias: $AUDITORIAS"

# 24 = as 23 do domínio + alembic_version.
if [ "$TABELAS" -lt 24 ]; then
  echo "[verificação] FALHOU: schema incompleto (esperado ao menos 24 tabelas)" >&2
  exit 1
fi

# As policies são a segunda camada do isolamento multi-tenant. Um dump que
# restaura sem elas restaura um banco onde qualquer tenant lê tudo.
if [ "$POLICIES" -lt 23 ]; then
  echo "[verificação] FALHOU: policies de row-level security não vieram no dump" >&2
  exit 1
fi

echo "[verificação] OK — o backup restaura e o isolamento multi-tenant veio junto."
