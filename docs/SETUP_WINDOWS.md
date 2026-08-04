# Subir a plataforma numa máquina Windows sem admin

Escrito em 04/08/2026, a partir de um setup do zero numa máquina do domínio
(`SPBIM034`) cujo usuário **não é administrador local** e onde não havia Docker
nem Postgres.

O [`README.md`](../README.md) descreve o caminho com Docker, que é o curto. Este
documento é o que fazer quando ele não está disponível — e registra uma
armadilha que morde qualquer máquina brasileira, com Docker ou sem.

---

## A armadilha que custa a manhã: caminho com acento

**O PostgreSQL no Windows não aceita caractere não-ASCII no caminho do
diretório de dados.** Se o repositório (ou o cluster) estiver sob
`D:\Usuários\...`, o `initdb` cria os diretórios, roda o script de
inicialização e morre na pós-inicialização com:

```
FATAL:  invalid byte sequence for encoding "UTF8": 0xe1 0x72 0x69
```

`0xe1` é o `á` na codificação ANSI do Windows; os três bytes são o `ári` de
"Usu**ári**os". O caminho é gravado em ANSI e relido como UTF-8.

**A mensagem não menciona caminho nenhum**, e é isso que faz perder tempo: ela
parece corrupção de instalação ou problema de locale. Não há flag que conserte —
`-E UTF8`, `--locale=C` e afins não tocam nisso.

**A saída é um caminho só-ASCII.** Aqui o cluster mora em
`%USERPROFILE%\spbim-infra`, que é `C:\Users\<login>\...` e não depende de
admin. O repositório pode continuar onde está: quem não pode ter acento é o
**diretório de dados**.

> Vale para o `psql -f` também: apontar um `.sql` por caminho acentuado falha
> pelo mesmo motivo. Copie o arquivo para o lado ASCII antes.

### O primo dessa armadilha: `.ps1` salvo em UTF-8

O PowerShell 5.1 lê um `.ps1` **sem BOM** como ANSI. Um script com
`"D:\Usuários\..."` escrito por um editor moderno chega ao disco como
`D:\UsuÃ¡rios\...` e o comando falha com *"não é reconhecido como nome de
cmdlet"* — apontando para um caminho que existe.

Não escreva caminho acentuado em `.ps1`. Derive de `$PSScriptRoot`,
`$env:USERPROFILE` ou similar: os bytes chegam intactos venham de onde vierem.

---

## Postgres portátil, sem instalador e sem serviço

O instalador do PostgreSQL e o Docker Desktop exigem elevação. Os **binários em
ZIP** não: extraem numa pasta e rodam com `initdb`/`pg_ctl`.

1. Baixe `postgresql-16.x-windows-x64-binaries.zip` de
   `get.enterprisedb.com/postgresql/`.
2. Extraia **apenas `bin`, `lib` e `share`** para um caminho só-ASCII. As pastas
   `doc`, `include` e `pgAdmin 4` somam ~600 MB e nada aqui as usa — o que
   importa são ~230 MB.
3. `initdb -D <data> -U spbim -A scram-sha-256 --pwfile=<arquivo> -E UTF8
   --locale=C`. O superusuário é `spbim` para casar com `POSTGRES_USER` do
   `.env`, **e é ele que roda as migrations E o `01-app-role.sql`**: o
   `ALTER DEFAULT PRIVILEGES` daquele script, sem `FOR ROLE`, vale para quem o
   executa.
4. `pg_ctl -D <data> -l <log> -o "-p 5432 -c listen_addresses=localhost" -w start`
5. `createdb spbim_auditoria` e aplique `infra/postgres/init/01-app-role.sql`.

Depois, o de sempre: `alembic upgrade head` e `python -m scripts.seed`.

> **`Expand-Archive` é lento e pode ser interrompido no meio sem avisar.**
> Conferir o tamanho da pasta **não** detecta isso — 748 MB extraídos de um ZIP
> de 308 MB parecem completos e não são. Confira um arquivo que só existe no
> fim: se `share\postgres.bki` não estiver lá, o `initdb` falha com *"file ...
> does not exist"*. Extrair por `System.IO.Compression` só o necessário é mais
> rápido e mais previsível.

### O storage

`minio.exe` é um binário único (`dl.min.io/server/minio/release/windows-amd64/`),
sem instalador. Suba com `minio.exe server <pasta> --address ":9000"` e crie o
bucket `spbim-auditoria`.

### O que falta nesse arranjo

**Redis.** Não há binário oficial para Windows fora de container, e sem ele a
auditoria automática **em fila** não roda. Não trava nada: o broker é checado
por socket antes de qualquer chamada ao Celery, e a tela do modelo tem o botão
**Auditoria automática**, que roda a mesma análise de forma síncrona.

---

## Apontar para o Supabase sem ter a senha do `spbim_app`

O [`SUPABASE.md`](SUPABASE.md) pressupõe as duas senhas em mãos. A do papel
`postgres` está no painel; **a do `spbim_app` não está em lugar nenhum** — ela
foi escolhida por quem rodou o bootstrap e só existe nas variáveis de ambiente
do deploy. Sobrescrevê-la derruba a API publicada.

Quando o painel do deploy não está ao alcance, a saída é **um papel próprio para
a máquina local**, que não toca no `spbim_app`:

```sql
CREATE ROLE spbim_local LOGIN PASSWORD '<sua senha>';
GRANT spbim_app TO spbim_local;
```

`GRANT spbim_app TO spbim_local` em vez de repetir os grants: assim o papel
local acompanha o `spbim_app` sem depender de alguém ter adivinhado a lista
certa.

**Isso só funciona porque as policies estão declaradas `TO public`.** Se
estivessem `TO spbim_app`, um papel novo não casaria com nenhuma delas e o banco
devolveria zero linha em tudo — um sintoma que parece "banco vazio", não
"permissão". Confira antes:

```sql
SELECT DISTINCT array_to_string(roles,',') FROM pg_policies WHERE schemaname='public';
```

**Confira também que o RLS de fato vale para o papel novo**, em vez de supor.
Ele não pode ser dono de tabela nem ter `BYPASSRLS`:

```sql
SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname='spbim_local';
SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tableowner='spbim_local';
```

E o teste que realmente prova, conectado **como o papel novo**: sem
`app.org_id` definido, `SELECT count(*) FROM projeto` deve devolver **0**; dentro
de uma transação com `set_config('app.org_id', '<org>', true)`, deve devolver os
projetos daquela organização.

No `.env`, as duas URLs vão pelo **pooler**, e as portas não são
intercambiáveis — 5432 é sessão (migrations e autenticação), 6543 é transação
(a API). O host é `aws-1-<regiao>.pooler.supabase.com`; **não** use
`db.<ref>.supabase.co`, que só publica AAAA.

> O storage pode continuar no MinIO local enquanto o banco aponta para o
> Supabase. É um arranjo válido para olhar dado real sem precisar da chave S3 —
> com a ressalva de que arquivos já cadastrados apontam para o Storage do
> Supabase e não vão resolver.

### Cuidados quando o banco é o do piloto

- **Não rode `pytest`.** A suíte cria e apaga dado real e pula a limpeza quando
  uma asserção falha no meio. Ela se recusa sozinha pelo host; não contorne com
  `PYTEST_BANCO_REMOTO=1`. Ver `backend/tests/conftest.py`.
- **Não use o papel `postgres` na `APP_DATABASE_URL`.** Ele é dono das tabelas e
  passa por cima do RLS: a aplicação funcionaria com a segunda camada de
  isolamento multi-tenant desligada, e o teste deixaria de significar nada.

---

## Detalhes que confundem, e não são defeito

- **O banner do `npm run dev` diz `banco ........ Supabase (ver .env)` sempre.**
  É texto fixo em [`scripts/dev.mjs`](../scripts/dev.mjs), não uma leitura do
  `.env`. Para saber a que banco você está ligado, olhe o **projeto que a tela
  mostra**: `CPQ11` é o do `scripts/seed.py` (banco local); os projetos reais
  vêm do Supabase.
- **`npm run dev` na pasta errada** dá `ENOENT ... package.json`. O `package.json`
  lançador está na raiz do repositório, não acima dela.
- **A resposta do login aninha o token**: é `tokens.access_token`, não
  `access_token` na raiz. Importa para quem for testar a API com `curl` ou
  PowerShell.
