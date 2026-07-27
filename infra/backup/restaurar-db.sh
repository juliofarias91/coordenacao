#!/bin/sh
# Restauração do Postgres a partir de um dump.
#
#   docker compose -f docker-compose.prod.yml run --rm \
#     -e ALVO=spbim_auditoria backup-db /backup/restaurar-db.sh <arquivo.dump>
#
# Sem argumento, usa o dump mais recente.
set -eu

DIR="${BACKUP_DIR:-/var/backups/spbim}/postgres"
ARQUIVO="${1:-$(ls -1t "$DIR"/*.dump 2>/dev/null | head -n 1)}"
ALVO="${ALVO:-$PGDATABASE}"

if [ -z "${ARQUIVO:-}" ] || [ ! -f "$ARQUIVO" ]; then
  echo "nenhum dump encontrado em $DIR" >&2
  exit 1
fi

echo "ATENÇÃO: isto substitui o conteúdo de '$ALVO' pelo dump abaixo."
echo "  arquivo: $ARQUIVO"
echo "  data:    $(date -u -r "$ARQUIVO" 2>/dev/null || stat -c %y "$ARQUIVO")"
echo
echo "Confirme digitando o nome do banco alvo:"
read -r CONFIRMACAO
if [ "$CONFIRMACAO" != "$ALVO" ]; then
  echo "cancelado." >&2
  exit 1
fi

# `--clean --if-exists` derruba os objetos antes de recriar. `--no-owner` e
# `--no-privileges` porque em outra máquina os papéis podem ter outros nomes —
# o script de init recria o papel de aplicação e as permissões.
pg_restore \
  --dbname="$ALVO" \
  --clean --if-exists \
  --no-owner --no-privileges \
  --exit-on-error \
  "$ARQUIVO"

echo "restauração concluída em '$ALVO'."
echo "Rode agora, na ordem:"
echo "  1) psql -d $ALVO -f /docker-entrypoint-initdb.d/01-app-role.sql   (papel de aplicação e RLS)"
echo "  2) alembic upgrade head                                          (caso o dump seja de um schema anterior)"
