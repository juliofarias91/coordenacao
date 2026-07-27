# Imagem da API e do worker.
#
# Duas etapas: a primeira compila as dependências (build-essential, cabeçalhos),
# a segunda leva só o que roda. O resultado não carrega compilador — menos
# superfície e imagem bem menor.

# --------------------------------------------------------------- build -----
FROM python:3.12-slim AS build

ENV PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN apt-get update \
 && apt-get install -y --no-install-recommends build-essential \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /src

# O código-fonte entra ANTES do install, e isso não é detalhe: instalar com
# apenas o `app/__init__.py` presente produz um pacote `app` com um arquivo
# só. `uvicorn app.main:app` é um console script — o sys.path[0] dele é o
# diretório do script, não o /app — então ele encontraria esse pacote
# mutilado em site-packages e o container não subiria.
COPY pyproject.toml ./
COPY app ./app
COPY alembic ./alembic
COPY alembic.ini ./
COPY scripts ./scripts

# `bim` traz o IfcOpenShell: sem ele o worker não roda a auditoria da Fase 3.
RUN python -m venv /venv \
 && /venv/bin/pip install --upgrade pip \
 && /venv/bin/pip install ".[bim]"

# ------------------------------------------------------------- runtime -----
FROM python:3.12-slim AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH="/venv/bin:$PATH"

# libpq5 para o psycopg; curl para o HEALTHCHECK.
RUN apt-get update \
 && apt-get install -y --no-install-recommends libpq5 curl \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --create-home --uid 10001 spbim

COPY --from=build /venv /venv

WORKDIR /app
# Só o que roda. O `alembic.ini` procura as migrations por caminho relativo,
# então elas precisam estar aqui — o `alembic upgrade head` do deploy roda
# nesta imagem.
COPY --chown=spbim:spbim app ./app
COPY --chown=spbim:spbim alembic ./alembic
COPY --chown=spbim:spbim alembic.ini pyproject.toml ./
COPY --chown=spbim:spbim scripts ./scripts

# Nunca como root: um upload malicioso que escapasse do parser encontraria um
# usuário sem privilégio.
USER spbim

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://localhost:8000/api/v1/health || exit 1

# `--proxy-headers` porque a API fica atrás de um proxy: sem isso o IP e o
# esquema do cliente chegariam errados ao log e às URLs geradas.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", \
     "--workers", "4", "--proxy-headers", "--forwarded-allow-ips", "*"]
