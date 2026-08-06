# Migração para o Supabase

Como levar a plataforma para o Supabase, o que muda e o que **não** muda.

Escrito a partir da inspeção do projeto `auditoria`
(`pilyrmvxytuwoiwjxgdv`, us-west-2, Postgres 17.6) em 27/07/2026.

---

## O resumo

| Peça | Vai para o Supabase? | Esforço |
|---|---|---|
| **Banco** | sim | configuração + um cuidado com o pooler |
| **Storage** | sim | só variável de ambiente |
| **Login** | sim, como provedor OIDC | já implementado desde a Fase 0 |
| **Autorização** | **não** — continua na plataforma | — |
| **Worker, relatórios, portal** | **não** — precisam de servidor | — |

O ponto que decide tudo: **o Supabase é Postgres**. O isolamento multi-tenant
que a plataforma usa — `org_id` em toda tabela + *row-level security* — é
mecanismo nativo do Postgres, não uma invenção da aplicação. As 23 policies
sobem como estão.

---

## 1. O banco

### O que já está resolvido

Duas condições sustentam o isolamento, e o projeto atende às duas:

- **`rolcreaterole: true`** no papel `postgres`. É o que permite criar o
  `spbim_app`, o papel **não-dono** com que a API abre as conexões. Se a API
  conectasse como dono das tabelas, o RLS não valeria para ela e as 23
  policies seriam decoração.
- **`pgcrypto` instalado.** O `gen_random_uuid()` das 23 tabelas funciona.

### O cuidado: o pooler

O Supavisor atende em **duas portas, e elas não são intercambiáveis**:

| Porta | Modo | Para quê |
|---|---|---|
| `6543` | transação | a API e o worker |
| `5432` | sessão | **as migrations** e a autenticação |

⚠️ **Não use `db.<ref>.supabase.co`.** O host da conexão direta só publica
registro **AAAA** — é IPv6, e o IPv4 dedicado é add-on pago. De uma rede sem
IPv6 o DNS resolve e a conexão TCP nunca fecha (confirmado nesta máquina em
28/07/2026: `db.pilyrmvxytuwoiwjxgdv.supabase.co:5432` inalcançável, o pooler
respondendo nas duas portas). O sintoma é um *timeout* na porta 5432 que
parece firewall e não é.

O substituto é o **mesmo pooler, na 5432** — modo sessão, IPv4 normal. Serve
para DDL; o que não serve para DDL é a 6543. O usuário do dono também leva o
`project_ref` como sufixo: `postgres.<ref>`.

O psycopg3 prepara statements a partir da 5ª execução da mesma query. Num
pooler de transação a conexão física muda entre execuções, e o servidor
responde *"prepared statement não existe"* — intermitente, só sob carga.

A aplicação detecta isso sozinha (`usa_pooler_de_transacao` em
`app/core/config.py`) e desliga o preparo. A detecção olha a **porta** —
`6543` ou `6432` —, não o host: o mesmo `*.pooler.supabase.com` atende os dois
modos, e marcar a conexão de sessão como transação desligaria o preparo à toa.
Para um proxy que não se anuncia, force com `DB_POOLER_TRANSACAO=true`.

**As migrations vão pela conexão direta.** DDL em pooler de transação é
pedido de problema.

Um ponto que só se confirmou ao inspecionar o projeto: a plataforma amarra o
tenant à **transação** (`set_config('app.org_id', …, true)`), não à sessão.
Isso é o que torna o pooling de transação seguro — com escopo de sessão, o
tenant de um cliente vazaria para a requisição seguinte através do pool.

### Configuração

```bash
# API e worker — pooler, modo transação
APP_DATABASE_URL=postgresql+psycopg://spbim_app.pilyrmvxytuwoiwjxgdv:<SENHA_APP>@aws-1-us-west-2.pooler.supabase.com:6543/postgres

# Migrations e autenticação — pooler, modo sessão
DATABASE_URL=postgresql+psycopg://postgres.pilyrmvxytuwoiwjxgdv:<SENHA_POSTGRES>@aws-1-us-west-2.pooler.supabase.com:5432/postgres
```

> Os dois usuários levam o `project_ref` como sufixo
> (`spbim_app.pilyrmvxytuwoiwjxgdv`, `postgres.pilyrmvxytuwoiwjxgdv`) — é assim
> que o Supavisor sabe para qual projeto rotear. O papel real no Postgres
> continua sendo `spbim_app`, e é ele que vai em `APP_DB_USER`.

### Aplicar o schema

Com as duas URLs no `.env`, um comando faz tudo — papel, migration e
conferência, nessa ordem:

```bash
cd backend
python -m scripts.supabase_bootstrap             # cria o papel, migra, confere
python -m scripts.supabase_bootstrap --conferir  # só diagnostica, não escreve
```

Ele existe porque o roteiro manual abaixo pressupõe `psql`, que não está em
toda máquina, e porque **a ordem não perdoa** (ver o aviso adiante). A senha
do papel ele extrai da própria `APP_DATABASE_URL` — é o que impede o papel
criado no banco e a URL que a API usa de divergirem.

O `--conferir` também serve de diagnóstico depois: lista tabelas, policies e,
o que mais importa, **qualquer tabela sem row-level security** — um vazamento
que a contagem de policies não denuncia.

<details>
<summary>O mesmo passo a passo, à mão, com psql</summary>

```bash
cd backend

# 1. o papel de aplicação (pela conexão de sessão)
psql "$DATABASE_URL" -v senha_app="'<SENHA_APP>'" -f ../infra/supabase/01-app-role.sql

# 2. as 23 tabelas, 12 enums e 23 policies
alembic upgrade head

# 3. conferir
psql "$DATABASE_URL" -c "
  SELECT count(*) AS tabelas FROM information_schema.tables WHERE table_schema='public';
  SELECT count(*) AS policies FROM pg_policies WHERE schemaname='public';"
# esperado: 25 tabelas (23 + alembic_version + a de verificação) e 23 policies
```

O passo 1 usa `infra/supabase/01-app-role.sql`, **não** o
`infra/postgres/init/01-app-role.sql`: aquele é do docker-compose, tem senha
fixa no arquivo e faz `GRANT CONNECT ON DATABASE spbim_auditoria`, banco que
no Supabase não existe — lá o banco chama `postgres`.

Sem `psql` à mão, o **SQL Editor** do painel faz o mesmo (só troque a senha —
lá não há variável de psql):

```sql
CREATE ROLE spbim_app LOGIN PASSWORD '<SENHA_APP>';
GRANT CONNECT ON DATABASE postgres TO spbim_app;
GRANT USAGE ON SCHEMA public TO spbim_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO spbim_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO spbim_app;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

</details>

**A ordem não é negociável.** A migration 0001 só emite os GRANTs nas 23
tabelas se o papel já existir (ela consulta `pg_roles`). Rodar o Alembic antes
deixa a API conectando e levando `permission denied` em toda tabela — e o
`alembic upgrade head` não repara isso, porque a revisão já consta aplicada.
O `supabase_bootstrap` acima existe em boa parte para não deixar essa ordem
depender de quem está executando.

### Conferir que o isolamento pegou

Não confie na contagem de policies: teste o comportamento.

```bash
alembic upgrade head
pytest tests/test_tenant_isolation.py -v
```

Os três testes atacam o RLS pelo papel de aplicação, sem filtro de `org_id`
na consulta. Se o Supabase tivesse alterado alguma coisa, eles quebrariam.

---

## 2. O storage

O Supabase expõe endpoint **S3-compatível**, e a plataforma sempre leu o
endpoint de variável de ambiente. É troca de configuração, não de código.

Em *Storage → Settings → S3 access keys*, gere uma chave — **o secret é
mostrado uma única vez**. Repare no host: é `<ref>.**storage**.supabase.co`,
não `<ref>.supabase.co`. Confirmado contra o projeto em 28/07/2026; copie o
que o painel mostrar, e use a região que ele indicar — a assinatura v4 leva a
região no cálculo, e errada devolve `SignatureDoesNotMatch`, um erro que não
parece ter nada a ver com região.

```bash
S3_ENDPOINT_URL=https://pilyrmvxytuwoiwjxgdv.storage.supabase.co/storage/v1/s3
S3_REGION=us-west-2
S3_BUCKET=spbim-auditoria
S3_ACCESS_KEY=<access key id>
S3_SECRET_KEY=<secret access key>
```

Crie o bucket **privado**. As chaves nunca são públicas: toda leitura passa
por URL assinada (`storage.url_assinada`), com validade de uma hora.

Verificação:

```bash
pytest tests/test_storage.py -v
```

O primeiro teste faz ida e volta de um arquivo e confere que a chave é
prefixada por `org/<org_id>/` — o mesmo prefixo que permite limpar um tenant
inteiro de uma vez.

### O que **não** usar

O `supabase-js` no navegador, subindo modelo direto para o Storage. O
arquivo precisa passar pelo backend porque é lá que a versão é registrada, a
nomenclatura é validada e a auditoria é enfileirada. Upload direto pularia
tudo isso.

---

## 3. O login

O fluxo OIDC/PKCE está implementado desde a Fase 0 e aceita qualquer
provedor. Apontar para o Supabase resolve a **decisão aberta nº 2** do plano
técnico:

```bash
OIDC_ENABLED=true
OIDC_ISSUER=https://pilyrmvxytuwoiwjxgdv.supabase.co/auth/v1
OIDC_CLIENT_ID=<client id>
OIDC_CLIENT_SECRET=<client secret>
OIDC_REDIRECT_URI=https://<seu-dominio>/entrar/sso
```

⚠ **O redirect aponta para a TELA, não para a API** (05/08/2026). Quem chega ao
`redirect_uri` é o navegador, redirecionado pelo provedor, e
`GET /auth/oidc/callback` responde JSON — apontá-lo para a API mostrava uma
página de JSON cru no fim do login. A rota `/entrar/sso` (`pages/RetornoSSO.tsx`)
lê o `code` e faz a chamada ela mesma.

**SSO autentica, e provisiona SOB DUAS CONDIÇÕES** (05/08/2026, a pedido). A
regra era "autentica, não provisiona": quem não existisse levava 403, e era o
que impedia qualquer conta do provedor de virar acesso. O primeiro login casa
por `oidc_sub`, ou por e-mail se for a primeira vez — isso não mudou.

O que mudou é o que acontece quando não casa com ninguém. Antes, 403 sempre;
agora a conta pode nascer, se **o `state` trouxer o código de uma organização**
(só a tela de cadastro o manda; a de entrar não) **e essa organização tiver
`cadastro_aberto` ligado** (migration 0016, desligado por padrão). Sem as duas,
403 como antes. Quem aplica as condições é `services/cadastro_aberto.py`, o
mesmo módulo do cadastro por formulário — duas implementações divergiriam, e a
que esquecesse o interruptor abriria todo tenant cujo slug alguém conhecesse.

### Por que a autorização não vai para o Supabase

Uma escolha, não uma limitação. O modelo do Supabase para autorização é o
navegador falar direto com o banco, com as policies lendo `auth.uid()`. Aqui
isso não serve, por dois motivos:

1. **A autorização é de domínio, não de identidade.** Quem pode publicar um
   round depende de `papel`, `permissoes`, `empresa_id` e `org_id` — dados
   que vivem na tabela `usuario`, não em `auth.users`.
2. **O núcleo do produto é servidor.** O worker que abre IFC com
   IfcOpenShell, o relatório em PDF, o controle em XLSX, a trilha de
   auditoria e o filtro campo a campo do portal não têm como rodar no
   navegador. Tirar a API não simplificaria nada — moveria o problema.

O Supabase entra como **provedor de identidade e banco gerenciado**. É onde
ele é forte, e onde a plataforma não perde nada.

---

## 4. O que sobra do docker-compose

Migrando banco e storage, o `docker-compose.prod.yml` fica com:

| Serviço | Situação |
|---|---|
| `db` | **sai** — vira o Supabase |
| `minio` | **sai** — vira o Storage do Supabase |
| `backup-s3` | **sai** — o Supabase versiona o bucket |
| `backup-db` | **fica**, apontando para a conexão direta |
| `redis` | fica — o Supabase não tem fila |
| `api`, `worker`, `web`, `migracao` | ficam |

**Não desligue o `backup-db`.** O backup automático do Supabase é do plano
deles, com a retenção deles, e restaurar de lá é restaurar o projeto inteiro.
Um dump próprio, versionado e testado pelo `verificar-restauracao.sh`, é o
que permite voltar uma tabela sem voltar tudo — e o que sobrevive a um
problema na conta.

Aponte o serviço de backup para o `DATABASE_URL` — a **5432**, modo sessão.
Nunca para a 6543: um `pg_dump` atravessa muitas queries numa transação longa,
que é exatamente o que o pooler de transação não sustenta.

---

## 5. Ordem sugerida

Uma peça por vez, com verificação entre elas. Migrar as três de uma vez
significa não saber qual quebrou.

1. **Banco em homologação.** Aplique o schema, rode `test_tenant_isolation`,
   importe o CPQ11 com `scripts/onboarding.py` e confira o painel.
2. **Storage.** Troque as variáveis, rode `test_storage`, suba um IFC de
   verdade e rode a auditoria automática ponta a ponta.
3. **Login.** Ligue o OIDC por último — é o que mais atrapalha se falhar no
   meio, porque tranca todo mundo para fora.
4. **Produção**, seguindo `docs/OPERACAO.md`.

Antes de cada passo, um backup manual:

```bash
docker compose -f docker-compose.prod.yml exec backup-db sh /backup/backup-db.sh
```
