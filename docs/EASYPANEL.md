# Deploy no Easypanel

Há um **`Dockerfile` na raiz** do repositório. Ele constrói a aplicação React
e a API numa imagem só, e a API serve as duas — uma imagem, um serviço, um
domínio, sem proxy entre containers nem CORS.

É o caminho recomendado para o piloto, e não exige configurar caminho de
build: o Easypanel encontra o `Dockerfile` sozinho.

> Se você viu `failed to read dockerfile: open Dockerfile: no such file or
> directory`, era isto que faltava. Basta reimplantar.

Dois serviços, e o segundo é opcional no começo:

| Serviço | Imagem | O que faz |
|---|---|---|
| `app` | `Dockerfile` da raiz | aplicação + API |
| `worker` | a **mesma** imagem, outro comando | auditorias automatizadas |
| `redis` | template do Easypanel | a fila do worker |

Quando fizer sentido escalar aplicação e API separadamente, os Dockerfiles de
`backend/` e `frontend/` continuam lá — ver "Topologia separada" no fim.

---

## 1. Serviço `app`

**Source** → GitHub → `juliofarias91/auditoria`, branch `main`.

**Build** → método **Dockerfile**. Deixe *Build Path* e *Dockerfile Path* em
branco (a raiz é o padrão).

**Environment** — o mínimo para subir:

```bash
APP_ENV=prod
APP_DEBUG=false
API_PREFIX=/api/v1
CORS_ORIGINS=https://<seu-dominio>

# python -c "import secrets; print(secrets.token_urlsafe(48))"
JWT_SECRET=

# Supabase — ver docs/SUPABASE.md
APP_DATABASE_URL=postgresql+psycopg://spbim_app.<ref>:<senha>@aws-1-<regiao>.pooler.supabase.com:6543/postgres
DATABASE_URL=postgresql+psycopg://postgres:<senha>@db.<ref>.supabase.co:5432/postgres

REDIS_PASSWORD=<a senha do serviço redis>
CELERY_BROKER_URL=redis://:<senha>@turnbim_redis:6379/0
CELERY_RESULT_BACKEND=redis://:<senha>@turnbim_redis:6379/1

S3_ENDPOINT_URL=https://<ref>.supabase.co/storage/v1/s3
S3_REGION=<região>
S3_BUCKET=spbim-auditoria
S3_ACCESS_KEY=
S3_SECRET_KEY=
```

> **A API se recusa a subir** se algum segredo ficar no valor de exemplo, e o
> log diz qual. Se o container reiniciar em laço, é o primeiro lugar a olhar.

**Deploy** → porta exposta **8000**.

**Domains** → aponte seu domínio para este serviço, porta **8000**, com HTTPS
ligado. É o único que vai para a internet.

> `CORS_ORIGINS` quase não importa neste modo: a aplicação e a API têm a mesma
> origem, então não há requisição entre origens. Preencha assim mesmo — se um
> dia a topologia mudar, ela passa a valer.

---

## 2. Serviço `worker`

Mesma origem, mesma imagem, **as mesmas variáveis de ambiente** do `app`.
Muda uma coisa: o comando.

**Deploy** → *Command*:

```
celery -A app.workers.celery_app.celery worker -l info --concurrency 2 --max-tasks-per-child 20
```

`--concurrency 2` porque abrir um IFC grande é caro em memória, e o gargalo
aqui é RAM, não CPU. `--max-tasks-per-child` recicla o processo para o
IfcOpenShell não acumular memória entre modelos.

Sem porta exposta — o worker não atende requisição.

---

## 3. Serviço `redis`

Use o template pronto do Easypanel (**+ Service → Redis**). Anote a senha e
use nas variáveis da `api` e do `worker`.

Sem Redis a plataforma continua utilizável: o upload responde que a análise
não foi enfileirada, e a tela do modelo tem o botão **Auditoria automática**,
que roda síncrono.

---

## 4. Aplicar as migrations

O schema não sobe sozinho. Depois que o `app` estiver de pé, no terminal do
serviço (**Console**):

```bash
alembic upgrade head
```

E o primeiro administrador:

```bash
SEED_ADMIN_LOGIN=coord@spbim.com.br SEED_ADMIN_SENHA='<senha forte>' python -m scripts.seed
```

Para importar um projeto inteiro de uma vez:

```bash
python -m scripts.onboarding scripts/dados/cpq11.yaml --dry-run
```

---

## 5. Ordem

O Easypanel não tem `depends_on`. Suba nesta ordem para não perseguir erro
que é só de dependência ausente:

1. **redis** — não depende de nada
2. **app** — precisa do banco (Supabase) e do redis
3. `alembic upgrade head` no console do `app`
4. **worker** — precisa do mesmo que o app

---

## Se falhar

**`failed to read dockerfile`** → reimplante; o `Dockerfile` da raiz foi
acrescentado depois do primeiro deploy. Se persistir, confira se o *Build
Path* ficou preenchido com algo — ele deve estar vazio.

**O `app` reinicia em laço** → veja o log pelo painel. Quase sempre é segredo
faltando; a mensagem nomeia a variável.

**A aplicação abre mas nenhuma tela carrega dado** → abra
`https://<dominio>/api/v1/health`. Se não responder, o problema é a API, não
o frontend.

**Login falha com "Could not reach the API"** → o banco. Veja
`/api/v1/health/ready`, que reporta a conexão.

**Upload de modelo dá 413** → limite do proxy de borda do Easypanel. A
aplicação aceita 512 MB; o proxy na frente pode ter limite menor.

**A auditoria automática não roda** → confira, nesta ordem: o `worker` está de
pé? a versão tem arquivo? a disciplina declara checklists? os critérios estão
marcados como `auto`? O endpoint `POST /versoes/{id}/auditar-automatico` roda
síncrono e devolve os erros na resposta — é o caminho mais rápido.

---

## Topologia separada

Quando a aplicação e a API precisarem escalar em ritmos diferentes, os
Dockerfiles de `backend/` e `frontend/` fazem isso — e o
`docker-compose.prod.yml` já os usa.

No Easypanel seriam três serviços:

| Serviço | Build Path | Dockerfile Path |
|---|---|---|
| `api` | `/backend` | `backend/Dockerfile` |
| `worker` | `/backend` | `backend/Dockerfile` |
| `web` | `/frontend` | `frontend/Dockerfile` |

O `web` precisa de `API_UPSTREAM=http://<projeto>_api:8000` — no Easypanel um
serviço alcança o outro por `<projeto>_<serviço>`. **Confira o nome real**: se
estiver errado, a aplicação carrega e toda chamada dá 502.

Para o piloto, a imagem única é mais simples e tem menos peças para errar.
