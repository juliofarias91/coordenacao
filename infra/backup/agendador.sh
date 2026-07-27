#!/bin/sh
# Agendador simples: roda o script recebido uma vez por dia, na hora indicada.
#
# Por que não cron: a imagem oficial do Postgres e a do mc não trazem cron, e
# instalar um daemon dentro de cada container só para disparar um script é mais
# peça para quebrar do que este laço. Se um dia houver mais de dois jobs, a
# resposta certa é um agendador de verdade — não este arquivo maior.
set -eu

SCRIPT="$1"
HORA="${BACKUP_HORA:-03}"

echo "[agendador] $SCRIPT programado para as ${HORA}:00 (UTC do container)"

# Roda uma vez ao subir, para o primeiro backup não esperar até amanhã e para
# um erro de configuração aparecer agora, e não de madrugada.
if ! sh "$SCRIPT"; then
  echo "[agendador] ATENÇÃO: a execução inicial de $SCRIPT falhou" >&2
fi

while true; do
  AGORA=$(date -u +%H)
  if [ "$AGORA" = "$HORA" ]; then
    if sh "$SCRIPT"; then
      echo "[agendador] $SCRIPT concluído"
    else
      echo "[agendador] ERRO em $SCRIPT (código $?)" >&2
    fi
    # Dorme uma hora e um pouco, para não rodar duas vezes na mesma janela.
    sleep 3700
  fi
  sleep 300
done
