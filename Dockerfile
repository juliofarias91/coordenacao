# Imagem única: aplicação React + API, num container só.
#
# É o caminho mais simples de hospedar o piloto — uma imagem, um serviço, um
# domínio. Sem proxy entre containers, sem CORS, sem hostname de serviço para
# acertar. Plataformas que constroem a partir da raiz do repositório
# (Easypanel, Railway, Render) usam este arquivo sem configuração nenhuma.
#
# O worker roda desta MESMA imagem, mudando só o comando:
#   celery -A app.workers.celery_app.celery worker -l info --concurrency 2
#
# Quando fizer sentido escalar aplicação e API separadamente, os Dockerfiles
# de `backend/` e `frontend/` continuam lá e o `docker-compose.prod.yml` os
# usa. A troca é de topologia, não de código.

# ------------------------------------------------------- aplicação React ---
FROM node:22-alpine AS web

WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
# O `COPY frontend/scripts ./scripts` ANTES do install saiu em 07/08/2026, junto
# com o postinstall que o exigia: ele rodava `node scripts/copy-dict.mjs` para
# gerar os dicionários do corretor ortográfico, e o `npm ci` morria com "Cannot
# find module" se a pasta não estivesse lá antes. Sem módulo de auditoria de
# arquivos não há postinstall, e o install volta a depender só do lockfile.
RUN npm ci

COPY frontend/ ./
# Sem VITE_API_URL: o cliente HTTP cai no padrão `/api/v1`, relativo. Como a
# API serve a própria aplicação, mesma origem — é justamente o que simplifica.
RUN npm run build

# ------------------------------------------------ dependências do backend ---
FROM python:3.12-slim AS build

ENV PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN apt-get update \
 && apt-get install -y --no-install-recommends build-essential \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /src

# O código-fonte entra ANTES do install. Instalar só com o `app/__init__.py`
# presente produz um pacote de um arquivo só, e `uvicorn app.main:app` — um
# console script, cujo sys.path[0] é o diretório do script — encontraria esse
# pacote mutilado em site-packages. O container não subiria.
COPY backend/pyproject.toml ./
COPY backend/app ./app
COPY backend/alembic ./alembic
COPY backend/alembic.ini ./
COPY backend/scripts ./scripts

# `bim` traz o IfcOpenShell: sem ele o worker não roda a auditoria da Fase 3.
RUN python -m venv /venv \
 && /venv/bin/pip install --upgrade pip \
 && /venv/bin/pip install ".[bim]"

# --------------------------------------------------------------- runtime ---
FROM python:3.12-slim AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH="/venv/bin:$PATH"

RUN apt-get update \
 && apt-get install -y --no-install-recommends libpq5 curl \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --create-home --uid 10001 spbim

COPY --from=build /venv /venv

WORKDIR /app
COPY --chown=spbim:spbim backend/app ./app
COPY --chown=spbim:spbim backend/alembic ./alembic
COPY --chown=spbim:spbim backend/alembic.ini backend/pyproject.toml ./
COPY --chown=spbim:spbim backend/scripts ./scripts
# O bit de execução não sobrevive ao checkout em Windows, que é de onde esta
# imagem é construída — sem o chmod, o ENTRYPOINT falha com "permission denied".
RUN chmod +x ./scripts/entrypoint.sh

# É a presença deste diretório que faz a API servir a aplicação — ver
# `app/spa.py`. Sem ele, a API responde só a API.
COPY --from=web --chown=spbim:spbim /web/dist ./static

# Nunca como root: um upload malicioso que escapasse do parser encontraria um
# usuário sem privilégio.
USER spbim

EXPOSE 8000

# `start-period` folgado porque o ENTRYPOINT migra o banco antes de subir a
# API: num banco vazio a 0001 cria 23 tabelas, 12 enums e as policies de RLS, e
# 20s não bastariam. Marcar o container como não-saudável nesse intervalo o
# faria reiniciar no meio da migration.
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
  CMD curl -fsS http://localhost:8000/api/v1/health || exit 1

# O ENTRYPOINT roda `alembic upgrade head` e só então executa o CMD.
#
# Está no ENTRYPOINT e não no CMD para valer TAMBÉM PARA O WORKER, que troca o
# comando mas fala com o mesmo banco. Antes disto o container subia o uvicorn
# direto e a migration era aplicada à mão antes de implantar — funciona
# enquanto alguém lembra, e no dia em que esquecer a imagem nova roda contra um
# schema velho.
ENTRYPOINT ["./scripts/entrypoint.sh"]

# `--proxy-headers` porque a plataforma põe um proxy na frente: sem isso o IP
# e o esquema do cliente chegariam errados ao log e às URLs geradas.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", \
     "--workers", "4", "--proxy-headers", "--forwarded-allow-ips", "*"]
