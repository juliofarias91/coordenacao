#!/bin/sh
# Dump do Postgres, com retenção e verificação de integridade.
#
# Formato custom (-Fc) e não SQL puro: permite restaurar tabela por tabela,
# comprime sozinho, e o `pg_restore --list` consegue validar o arquivo sem
# restaurar nada — que é o passo de verificação abaixo.
set -eu

DIR="${BACKUP_DIR:-/var/backups/spbim}/postgres"
RETENCAO="${BACKUP_RETENCAO_DIAS:-30}"
CARIMBO=$(date -u +%Y%m%dT%H%M%SZ)
ARQUIVO="$DIR/${PGDATABASE}_${CARIMBO}.dump"

mkdir -p "$DIR"

echo "[backup-db] iniciando dump de $PGDATABASE"
pg_dump --format=custom --compress=6 --file="$ARQUIVO.parcial"

# Só renomeia depois que o dump terminou: um arquivo com o nome final é, por
# definição, um arquivo completo. Sem isso, um backup interrompido pareceria
# válido na hora do desespero.
mv "$ARQUIVO.parcial" "$ARQUIVO"

# Verificação: o índice do dump é legível e traz tabelas?
TABELAS=$(pg_restore --list "$ARQUIVO" | grep -c 'TABLE DATA' || true)
if [ "$TABELAS" -lt 1 ]; then
  echo "[backup-db] ERRO: dump sem nenhuma tabela — arquivo suspeito" >&2
  mv "$ARQUIVO" "$ARQUIVO.suspeito"
  exit 1
fi

TAMANHO=$(du -h "$ARQUIVO" | cut -f1)
echo "[backup-db] ok: $ARQUIVO ($TAMANHO, $TABELAS tabelas com dados)"

# Retenção. `-mtime +N` remove o que passou de N dias.
REMOVIDOS=$(find "$DIR" -name '*.dump' -type f -mtime "+$RETENCAO" -print -delete | wc -l)
[ "$REMOVIDOS" -gt 0 ] && echo "[backup-db] retenção: $REMOVIDOS arquivo(s) com mais de $RETENCAO dias removidos"

# Rastro do que existe agora, para o runbook e para o monitoramento.
ls -1t "$DIR"/*.dump 2>/dev/null | head -n 5 > "$DIR/ultimos.txt" || true
date -u +%s > "$DIR/ultimo_sucesso.txt"

exit 0
