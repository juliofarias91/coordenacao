#!/bin/sh
# Entrada do container: migra o banco e só então sobe o processo.
#
# Por que existe: até 29/07/2026 o Dockerfile chamava o uvicorn direto, e a
# migration era aplicada à mão da máquina do dev antes de implantar. Isso
# funciona enquanto alguém lembra — e o dia em que esquecer, a imagem nova sobe
# contra um schema velho e a falha aparece como erro de coluna inexistente no
# meio de uma requisição, não no deploy.
#
# A migration roda ANTES de qualquer processo, e o `set -e` faz um upgrade que
# falhe abortar o container. É deliberado: subir a API contra um schema que não
# é o esperado é pior do que não subir — o deploy fica vermelho, que é onde o
# problema deve aparecer.
#
# Vale para os dois papéis da imagem, API e worker, porque os dois falam com o
# mesmo banco. Rodar duas vezes é inofensivo: `upgrade head` já aplicado é
# no-op, e o lock abaixo serializa quem chegar junto.
set -e

# Um replica só é o arranjo do piloto (Easypanel, um serviço), mas API e worker
# sobem ao mesmo tempo e disputariam a migration. O lock consultivo resolve:
# quem chega depois espera, encontra o schema pronto e seu `upgrade` vira
# no-op. O número é arbitrário — só precisa ser o mesmo em todos os processos.
export ALEMBIC_LOCK_ID="${ALEMBIC_LOCK_ID:-728301}"

echo "[entrypoint] alembic upgrade head"
alembic upgrade head

echo "[entrypoint] iniciando: $*"
exec "$@"
