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

# Supabase — ver docs/SUPABASE.md. As duas vão pelo POOLER: 6543 (transação)
# para a API, 5432 (sessão) para migration e autenticação. Não use
# db.<ref>.supabase.co: só publica AAAA e não responde de rede sem IPv6.
APP_DATABASE_URL=postgresql+psycopg://spbim_app.<ref>:<senha>@aws-1-<regiao>.pooler.supabase.com:6543/postgres
DATABASE_URL=postgresql+psycopg://postgres.<ref>:<senha>@aws-1-<regiao>.pooler.supabase.com:5432/postgres

REDIS_PASSWORD=<a senha do serviço redis>
CELERY_BROKER_URL=redis://:<senha>@turnbim_redis:6379/0
CELERY_RESULT_BACKEND=redis://:<senha>@turnbim_redis:6379/1

S3_ENDPOINT_URL=https://<ref>.storage.supabase.co/storage/v1/s3
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

## 4. Migrations — agora automáticas

**Desde 29/07/2026 o container migra sozinho.** O `ENTRYPOINT` roda
`alembic upgrade head` e só então executa o comando do serviço; vale para o
`app` e para o `worker`, porque os dois falam com o mesmo banco.

Se o upgrade falhar, **o container não sobe** — de propósito. Subir a API
contra um schema que não é o esperado é pior do que não subir: assim o deploy
fica vermelho, que é onde o problema deve aparecer, em vez de virar erro de
coluna inexistente no meio de uma requisição, horas depois.

`app` e `worker` sobem juntos e chamariam a migration ao mesmo tempo. Um lock
consultivo do Postgres (`pg_advisory_lock`) serializa os dois: quem chega
depois espera, encontra o schema pronto e seu `upgrade` vira no-op.

> Antes disto o `Dockerfile` chamava o uvicorn direto e a migration era
> aplicada à mão antes de implantar. Funcionava enquanto alguém lembrava.

O que **continua manual** é o primeiro administrador:

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
2. **app** — precisa do banco (Supabase) e do redis; migra sozinho ao subir
3. **worker** — precisa do mesmo que o app

---

## 6. Segredos: NÃO os deixe no nível do projeto

O Easypanel passa as variáveis de **projeto** como `--build-arg` para o
`docker build`, e todo build arg **aparece no log de build**. Quem tiver acesso
ao painel lê a senha do banco e as chaves do S3 no histórico, mesmo sem acesso
ao serviço.

O `Dockerfile` da raiz **não declara nenhum `ARG`** — ele não precisa de
segredo nenhum para construir: o build compila o React e instala as
dependências Python, e as duas coisas não falam com banco nem com storage.
Todo segredo é lido em **tempo de execução**, pelo `app/core/config.py`.

Portanto: **declare os segredos no Environment do SERVIÇO, não do projeto.**
Variável de serviço vira variável de runtime do container e não passa pelo
build.

Se as senhas já circularam pelo log de build — e circularam, porque foi assim
que o primeiro deploy foi feito —, o log é histórico e não se apaga
seletivamente. **Rotacione**:

1. Supabase → Settings → Database → *Reset database password*.
2. Storage → S3 access keys → revogue a chave antiga, crie outra.
3. Atualize `DATABASE_URL`, `APP_DATABASE_URL`, `S3_ACCESS_KEY` e
   `S3_SECRET_KEY` **no serviço**, não no projeto.
4. Reimplante `app` e `worker`.

Depois disso, confirme que o log de build do próximo deploy não traz mais
`--build-arg` com senha.

---

## 7. Conferir se o bucket é privado

O bucket é criado pela própria aplicação no primeiro upload, com o padrão do
provedor — e padrão é o tipo de coisa que se supõe e não se verifica. Um
bucket público aqui não vaza um avatar: vaza o modelo BIM inteiro do cliente.

No **Console** do serviço `app`:

```bash
python -m scripts.verificar_storage            # existe? algo indica público?
python -m scripts.verificar_storage --criar    # cria antes do primeiro upload
python -m scripts.verificar_storage --canario  # a prova de verdade
```

`--canario` é o único modo que prova alguma coisa: grava um objeto, tenta
baixá-lo por HTTP **sem credencial nenhuma** — que é o que um estranho faria —
e exige uma recusa. Apaga o objeto no fim, inclusive se a checagem falhar.
Sai com código 1 se o bucket entregar arquivo a anônimo, então serve em cron.

Rode **antes** de subir o primeiro modelo real.

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
`/api/v1/health/ready`, que desde 29/07 reporta os **três** componentes:

```json
{"status": "degradado", "banco": "ok",
 "fila": "indisponível", "storage": "ok"}
```

Ele responde **200 mesmo degradado**, de propósito: sem Redis tudo funciona
menos o enfileiramento, e derrubar a API por isso trocaria uma degradação por
uma queda. Leia o campo `status`, não o código HTTP. É o primeiro lugar a
olhar quando "está tudo no ar mas nada acontece".

**Upload de modelo dá 413** → limite do proxy de borda do Easypanel. A
aplicação aceita 512 MB; o proxy na frente pode ter limite menor.

**A auditoria automática não roda** → comece por
`/api/v1/health/ready`: se `fila` não for `ok`, o Redis é a causa e o resto da
lista não importa. Depois, nesta ordem: o `worker` está de pé? a versão tem
arquivo? a disciplina declara checklists? os critérios estão marcados como
`auto`? O endpoint `POST /versoes/{id}/auditar-automatico` roda síncrono e
devolve os erros na resposta — é o caminho mais rápido.

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
