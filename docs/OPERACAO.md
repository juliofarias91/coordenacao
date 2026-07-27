# Operação — SPBIM Auditoria BIM

Runbook do ambiente de produção do piloto (SP-501). Escrito para ser seguido
às três da manhã por alguém que não escreveu o código.

---

## 1. O que roda

| Serviço | Imagem | Papel |
|---|---|---|
| `web` | `spbim/web` | nginx: serve a aplicação e faz proxy de `/api` |
| `api` | `spbim/api` | FastAPI, 4 workers |
| `worker` | `spbim/api` | Celery: auditorias automatizadas e ingestão |
| `migracao` | `spbim/api` | roda `alembic upgrade head` e sai |
| `db` | `postgres:16-alpine` | banco |
| `redis` | `redis:7-alpine` | fila |
| `minio` | `minio/minio` | modelos, evidências, exports |
| `backup-db` | `postgres:16-alpine` | dump diário |
| `backup-s3` | `minio/mc` | espelho diário do bucket |

Só o `web` expõe porta. Banco, fila e storage vivem na rede interna do compose.

**O TLS não termina aqui.** Coloque um proxy de borda na frente da porta do
`web` (Caddy com ACME, ALB, Cloudflare). Sem HTTPS o token JWT trafega em
claro, e o token é a credencial inteira.

---

## 2. Primeira instalação

```bash
git clone <repo> /opt/spbim && cd /opt/spbim
cp .env.prod.example .env.prod
```

Preencha `.env.prod`. Os segredos, um por um:

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(48))"  # JWT_SECRET
openssl rand -base64 32                                        # POSTGRES_PASSWORD
openssl rand -base64 32                                        # APP_DB_PASSWORD
openssl rand -base64 32                                        # REDIS_PASSWORD
openssl rand -base64 24                                        # S3_ACCESS_KEY
openssl rand -base64 32                                        # S3_SECRET_KEY
```

`chmod 600 .env.prod`. Depois:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
docker compose -f docker-compose.prod.yml logs -f migracao   # tem de sair com 0
curl -fsS http://localhost:8080/api/v1/health/ready
```

> A API **se recusa a subir** com `APP_ENV=prod` se qualquer segredo ficar no
> valor de exemplo. Se o container `api` reiniciar em laço, olhe o log: a
> mensagem diz exatamente qual variável está errada.

### Criar o primeiro administrador

```bash
docker compose -f docker-compose.prod.yml exec \
  -e SEED_ADMIN_LOGIN=coord@spbim.com.br \
  -e SEED_ADMIN_SENHA='<senha forte>' \
  api python -m scripts.seed
```

---

## 3. Deploy de uma versão nova

O CI publica as imagens ao criar uma tag `v*`. No servidor:

```bash
cd /opt/spbim && git pull
docker compose -f docker-compose.prod.yml --env-file .env.prod pull
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

O `migracao` roda antes de `api` e `worker` subirem — é o que impede um worker
de escrever em schema velho no meio do deploy.

**Antes de qualquer deploy que mexa em migration, tire um backup manual**
(seção 4). Migration não tem desfazer automático em produção: o `downgrade`
existe e é testado no CI, mas restaurar um dump é mais rápido e mais seguro do
que descobrir na hora que um `downgrade` perde dado.

### Voltar atrás

```bash
IMAGEM_API=ghcr.io/<org>/<repo>/api:<tag-anterior> \
IMAGEM_WEB=ghcr.io/<org>/<repo>/web:<tag-anterior> \
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

Se a versão nova aplicou migration, voltar a imagem **não** volta o schema.
Nesse caso: restaure o backup (seção 4) e só depois volte a imagem.

---

## 4. Backup e restauração

O backup roda sozinho: banco às 03:00 UTC, bucket às 04:00 UTC (o bucket
depois, para o espelho nunca ficar mais antigo que o dump que o referencia).
Retenção padrão: 30 dias.

### Conferir que está rodando

```bash
docker compose -f docker-compose.prod.yml logs --tail 30 backup-db backup-s3
docker compose -f docker-compose.prod.yml exec backup-db ls -lh /var/backups/spbim/postgres
```

### Backup manual (antes de um deploy arriscado)

```bash
docker compose -f docker-compose.prod.yml exec backup-db sh /backup/backup-db.sh
```

### Provar que o backup presta — faça isto todo mês

```bash
docker compose -f docker-compose.prod.yml exec backup-db sh /backup/verificar-restauracao.sh
```

Restaura o dump mais recente num banco descartável e confere que o schema veio
inteiro **e que as policies de row-level security vieram junto** — um dump que
restaura sem elas restaura um banco onde qualquer organização lê tudo.

Um backup que nunca foi restaurado não é um backup: é um arquivo.

### Restaurar de verdade

```bash
docker compose -f docker-compose.prod.yml stop api worker
docker compose -f docker-compose.prod.yml exec backup-db \
  sh /backup/restaurar-db.sh /var/backups/spbim/postgres/<arquivo>.dump
# O script pede confirmação digitando o nome do banco.

docker compose -f docker-compose.prod.yml exec db \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f /docker-entrypoint-initdb.d/01-app-role.sql
docker compose -f docker-compose.prod.yml run --rm migracao
docker compose -f docker-compose.prod.yml start api worker
```

Os arquivos do bucket restauram com:

```bash
docker compose -f docker-compose.prod.yml exec backup-s3 sh -c \
  'mc alias set spbim "$S3_ENDPOINT_URL" "$S3_ACCESS_KEY" "$S3_SECRET_KEY" &&
   mc mirror --overwrite /var/backups/spbim/objetos "spbim/$S3_BUCKET"'
```

### Tire o backup do servidor

O volume `backups` mora na mesma máquina que o banco. Um disco que morre leva
os dois. Copie para fora — todo dia:

```bash
# no host, via cron
rsync -az /var/lib/docker/volumes/spbim-prod_backups/_data/ backup@outro-host:/spbim/
```

---

## 5. Monitoramento

### Sinais de vida

| O quê | Como |
|---|---|
| API viva | `GET /api/v1/health` → `{"status":"ok"}` |
| API + banco | `GET /api/v1/health/ready` → `{"banco":"ok"}` |
| Containers | `docker compose -f docker-compose.prod.yml ps` (coluna `STATUS`) |
| Fila | `docker compose ... exec worker celery -A app.workers.celery_app.celery inspect active` |
| Backup recente | `ultimo_sucesso.txt` no volume — se tiver mais de 26 h, alerte |

Aponte um monitor externo (UptimeRobot, Better Stack) para `/api/v1/health/ready`.
Um health check que roda dentro do servidor não avisa quando o servidor cai.

### Log

Em produção o log sai em **JSON, uma linha por evento** — indexável direto em
CloudWatch, Loki ou Datadog.

```bash
docker compose -f docker-compose.prod.yml logs -f api | grep '"nivel":"ERROR"'
```

### Perguntas que o log responde

| Pergunta | Onde olhar |
|---|---|
| Por que a auditoria da versão X não rodou? | log do `worker`, filtre pelo id da versão |
| O ACC mandou o webhook? | log da `api`, `ingest` |
| Quem publicou aquele round? | `GET /api/v1/trilha?entidade=auditoria&entidade_id=…` |
| Quem mudou um cadastro? | mesma rota, trocando `entidade` |

A trilha responde o que o log não guarda: quem, quando e o diff.

---

## 6. Quando algo quebra

**`api` reiniciando em laço** → `docker compose logs api`. Quase sempre é
`.env.prod` incompleto; a mensagem diz a variável.

**Upload de modelo devolve 413** → limite do nginx (`client_max_body_size`) ou
do proxy de borda. O backend aceita até 512 MB.

**Auditoria automática não roda** → confira nesta ordem: (1) o `worker` está de
pé? (2) a versão tem arquivo (`arquivo_url` preenchido)? (3) a disciplina
declara checklists? (4) os critérios estão marcados como `auto`? O endpoint
`POST /versoes/{id}/auditar-automatico` roda síncrono e devolve os erros na
resposta — é o caminho mais rápido para descobrir.

**Fila fora do ar** → o upload continua funcionando e responde que a análise
não foi enfileirada. Suba o `redis` e use o botão *Auditoria automática* na
tela do modelo, ou `POST /versoes/{id}/enfileirar`.

**Disco cheio** → quase sempre é o volume `minio` (modelos) ou `backups`.
`docker system df -v`. Baixe `BACKUP_RETENCAO_DIAS` ou mova o backup para fora.

---

## 7. Segurança — revisar a cada trimestre

- [ ] `.env.prod` com `chmod 600` e fora do git
- [ ] HTTPS no proxy de borda, com redirecionamento de HTTP
- [ ] Portas do banco, Redis e MinIO **não** publicadas no host
- [ ] `JWT_SECRET` girado se alguém com acesso saiu do time (invalida todas as sessões)
- [ ] Usuários inativos com `status=inativo` — o login recusa na hora
- [ ] Convites de cliente sem uso revogados (`POST /convites/{id}/revogar`)
- [ ] Backup restaurado com sucesso no último mês
- [ ] Imagens atualizadas (`docker compose pull`) para pegar correção de CVE
