#!/bin/sh
# Espelho do bucket (modelos, evidências, logos).
#
# `mc mirror` e não uma cópia do volume do MinIO: copiar o diretório de um
# MinIO em execução dá um retrato inconsistente. O mirror lê pela API, que é
# a única visão coerente do bucket.
set -eu

DESTINO="${BACKUP_DIR:-/var/backups/spbim}/objetos"
mkdir -p "$DESTINO"

mc alias set spbim "$S3_ENDPOINT_URL" "$S3_ACCESS_KEY" "$S3_SECRET_KEY" > /dev/null

echo "[backup-s3] espelhando $S3_BUCKET"

# `--overwrite --remove` mantém o destino idêntico à origem. Sem `--remove`, um
# arquivo apagado por engano ficaria no backup para sempre e o espelho deixaria
# de ser um retrato do bucket — viraria um acúmulo.
#
# Atenção operacional: com `--remove`, apagar tudo na origem apaga tudo no
# espelho. É o dump versionado do Postgres e o versionamento do bucket que
# protegem contra isso — ver docs/OPERACAO.md.
mc mirror --overwrite --remove "spbim/$S3_BUCKET" "$DESTINO"

ARQUIVOS=$(find "$DESTINO" -type f | wc -l)
TAMANHO=$(du -sh "$DESTINO" | cut -f1)
echo "[backup-s3] ok: $ARQUIVOS arquivo(s), $TAMANHO"

date -u +%s > "$DESTINO/../ultimo_sucesso_s3.txt"
exit 0
