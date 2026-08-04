# SPBIM · Plataforma de Auditoria BIM

Plataforma SaaS que audita modelos BIM (Revit/IFC) contra os critérios de um PEB, elimina as planilhas de controle manuais e entrega relatórios e portal do cliente.

> **Princípio central:** a auditoria é a única fonte de dado. Painel de controle, matriz, relatório e KPIs são visões derivadas.

Documentação de origem em [docs/](docs/) — o [plano técnico](docs/Plano_Tecnico_Piloto_SPBIM.md) é o documento mestre e o [protótipo navegável](docs/prototipo_auditoria_bim.html) define as telas e os fluxos. A linguagem visual está no [CLAUDE.md](CLAUDE.md), na seção *Sistema visual*.

---

## Estado

**As seis fases do roadmap estão implementadas.** 135 rotas em `api/v1`, 331 funções de teste. A auditoria 4D de parâmetros em IFC roda de verdade, sem custo de token.

O que resta da Fase 5 não é código: subir o ambiente de produção num servidor seu e rodar o piloto assistido. O caminho está em [`docs/OPERACAO.md`](docs/OPERACAO.md) (runbook) e [`docs/PILOTO.md`](docs/PILOTO.md) (roteiro semana a semana).

| Fase | Entrega | Estado |
|---|---|---|
| 0 | Setup: repositório, CI, Postgres, auth, esquema base | ✅ |
| 1 | Cadastro (projeto, empresas, disciplinas, critérios, usuários) + API | ✅ |
| 2 | Ingestão ACC + execução manual de auditoria + NC + relatório/controle | ✅ |
| 3 | **Automação: nomenclatura (nível 0) + auditoria 4D IFC** | ✅ |
| 4 | Portal do cliente, notificações, penalidades, KPIs | ✅ |
| 5 | Piloto assistido: produção, backups, onboarding | ✅ código · ⬜ execução |

---

## Estrutura

```
spbim-auditoria/
├── backend/            API FastAPI + workers Celery
│   ├── app/
│   │   ├── api/        rotas (v1)
│   │   ├── core/       config, segurança, dependências, OIDC
│   │   ├── db/         base declarativa, sessão, tenant
│   │   ├── models/     23 tabelas do domínio (SQLAlchemy 2.0)
│   │   ├── schemas/    contratos Pydantic
│   │   └── workers/    Celery
│   ├── alembic/        migrations
│   ├── scripts/        seed e importador de projeto (onboarding)
│   └── tests/
├── frontend/           React + TypeScript (Vite)
│   ├── scripts/        copy-dict (dicionários) e a suíte de nomenclatura
│   └── src/
│       ├── auth/       sessão
│       ├── components/ gráficos e peças de UI
│       ├── i18n/       PT/EN
│       ├── layout/     shell e navegação
│       ├── lib/        cliente HTTP
│       │   └── auditer/  motor de nomenclatura e corretor (portado, JS)
│       ├── pages/      telas
│       │   └── admin/    organização, projetos e usuários
│       ├── styles/     tokens e sistema visual (ver CLAUDE.md)
│       ├── theme/      claro/escuro
│       └── workers/    corretor ortográfico (Hunspell/WebAssembly)
├── infra/
│   ├── postgres/       init SQL (papel de aplicação e RLS)
│   └── backup/         dump, espelho do bucket, restauração e verificação
├── docs/               plano técnico, especificação, backlog, protótipo,
│                       runbook de operação e roteiro do piloto
├── bases/              as planilhas de controle reais (LOD300/400/500, 4D)
├── referencias/        links e material de apoio (fora do git)
├── package.json        lançador da raiz, sem dependência (`npm run dev`)
├── scripts/dev.mjs     sobe API + aplicação no mesmo terminal
├── dev.ps1             casca que chama o dev.mjs
├── Dockerfile               imagem única: aplicação + API num container só
├── docker-compose.yml       desenvolvimento
└── docker-compose.prod.yml  produção (SP-501)
```

## Um sistema, não três

A plataforma é **uma aplicação**. A separação `backend/` e `frontend/` é de
código-fonte, não de produto: o [`Dockerfile`](Dockerfile) da raiz compila o
React e o entrega dentro da imagem da API, que o serve na mesma porta — sem
CORS, sem proxy entre containers, sem hostname de serviço para acertar. É a
presença de `backend/static/` que liga esse comportamento (ver
`backend/app/spa.py`); sem ele, a API responde só a API.

```powershell
npm run dev          # API :8000 + Vite :5173, com hot-reload — o de todo dia
npm run dev:web      # SÓ o Vite, contra uma API já publicada — para mexer em tela
npm run dev:unico    # só :8000, servindo o build — igual à produção
npm run parar        # encerra as duas
```

**Abra a `:5173`** — é onde a aplicação está. A `:8000` é a API; em
desenvolvimento, abri-la no navegador devolve só o JSON de identificação.

Os dois processos rodam **no mesmo terminal**, com a saída prefixada por
`[api]` e `[web]`, e `Ctrl+C` derruba os dois. A lógica está em
[`scripts/dev.mjs`](scripts/dev.mjs) — Node puro, sem PowerShell, e por isso o
mesmo arquivo serve Linux e macOS.

**A API sobe ANTES do Vite, e é de propósito.** O Vite fica pronto em ~3 s e a
API leva mais; em paralelo, o navegador abria, pedia `/auth/me` e o terminal
enchia de `ECONNREFUSED` que não era erro nenhum — era só a ordem. O
`--reload` também vigia só `backend/app`: editar uma migration ou um teste não
reinicia mais o servidor.

**`dev:web` é o arranjo de um processo só**, e ele existe porque não há backend
para subir: a aplicação bate numa API já publicada, cujo endereço vem de
`API_REMOTA` no `.env`. É como o VDCity consegue ter `dev: "vite"` — o backend
dele (SQL e edge functions) vive na Supabase e nunca sobe no desenvolvimento.
Use quando for mexer em TELA. Não é o padrão porque a instância é
**compartilhada**: se o schema dela divergir do código em que se está mexendo, a
tela quebra sem explicar por quê.

O `package.json` da raiz **não tem dependência nenhuma** e não é um pacote:
existe só porque `npm run dev` aqui dava `ENOENT`, já que o `package.json` real
está em `frontend/`. O `.\dev.ps1` continua valendo para quem o tem na memória
muscular, mas virou uma casca que chama o `dev.mjs` — duas implementações de
"subir os dois processos" divergiriam na primeira mudança de porta.

O `-Unico` existe para conferir o que de fato vai para produção: é o mesmo
arranjo da imagem, numa porta só. No dia a dia vale o outro, porque o Vite
troca o módulo editado sem recarregar a página.

O **Auditer** foi aposentado em 28/07/2026. O motor dele (nomenclatura,
duplicidade por SHA-256, corretor Hunspell) vive em `frontend/src/lib/auditer/`
e `src/workers/` — byte a byte o mesmo código, sem uma linha alterada — e as
telas viraram três sub-abas de *Configuração › Nomenclaturas & padrões*.
Manter o app separado significava manter dois deploys, dois `package.json` e
duas cópias do mesmo motor para entregar o que a plataforma já entrega. O
código segue recuperável no histórico deste repositório
(`git log -- auditer/`); o histórico git original e o zip de backup ficavam em
`referencias/` e foram apagados em 30/07/2026 — guardavam a proveniência, não o
código.

---

## Requisitos

- **Python 3.12** — não 3.13/3.14: IfcOpenShell (Fase 3) e psycopg distribuem wheels até a 3.12.
- **Node 20+**
- **PostgreSQL 16** — via Docker Desktop (recomendado) ou instalado localmente.
- Redis e um storage S3-compatível (MinIO) — necessários a partir da Fase 2; o compose já os sobe.

> **Máquina Windows sem direito de administrador?** Docker Desktop e o
> instalador do Postgres exigem elevação. O caminho com binários portáteis, e a
> armadilha do **caminho com acento** que quebra o `initdb` em qualquer máquina
> brasileira, estão em [`docs/SETUP_WINDOWS.md`](docs/SETUP_WINDOWS.md).

---

## Como rodar

> **Máquina nova? `npm run setup` faz os passos 1, 3 e 5 de uma vez** — confere
> as versões, cria o ambiente do backend, instala as dependências dos dois lados
> e gera um `.env` com um segredo próprio. Ele não mexe em banco de propósito:
> onde os seus dados moram é decisão sua, e é o passo 2. Para trabalhar com mais
> gente no repositório, ver **[`docs/COLABORACAO.md`](docs/COLABORACAO.md)**.

### 1. Ambiente

```powershell
Copy-Item .env.example .env
# Gere um segredo real para o JWT:
python -c "import secrets; print(secrets.token_urlsafe(48))"
# e cole em JWT_SECRET no .env
```

### 2. Banco

**Com Docker** (recomendado — o init SQL já cria o papel de aplicação):

```powershell
docker compose up -d db redis minio
```

**Sem Docker**, com um Postgres local: crie o banco e rode o script de inicialização uma vez.

```powershell
psql -U postgres -c "CREATE DATABASE spbim_auditoria"
psql -U postgres -d spbim_auditoria -f infra/postgres/init/01-app-role.sql
```

### 3. Backend

```powershell
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e ".[dev]"

.\.venv\Scripts\python.exe -m alembic upgrade head     # cria o schema
$env:SEED_ADMIN_SENHA = '<escolha uma senha>'
.\.venv\Scripts\python.exe -m scripts.seed             # 1 org + projeto CPQ11 + admin

.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

API em `http://localhost:8000` · documentação interativa em `/api/v1/docs`.

### 4. Worker (Celery)

```powershell
cd backend
# A automação da Fase 3 precisa do IfcOpenShell:
.\.venv\Scripts\python.exe -m pip install -e ".[dev,bim]"
.\.venv\Scripts\python.exe -m celery -A app.workers.celery_app.celery worker -l info --pool=solo
```

`--pool=solo` no Windows; em Linux/produção, o pool padrão.

Sem worker no ar a plataforma continua utilizável: a tela do modelo tem o botão **Auditoria automática**, que roda a análise de forma síncrona (`POST /versoes/{id}/auditar-automatico`).

### 5. Frontend

```powershell
cd frontend
npm install
npm run dev
```

Aplicação em `http://localhost:5173`. O Vite faz proxy de `/api` para a API, então não há CORS no desenvolvimento.

---

## Produção

O ambiente produtivo sobe com um compose próprio. O passo a passo completo —
segredos, deploy, rollback, backup, restauração e o que olhar quando quebra —
está em **[`docs/OPERACAO.md`](docs/OPERACAO.md)**.

```bash
cp .env.prod.example .env.prod        # preencha os segredos; chmod 600
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

A API **se recusa a subir** com `APP_ENV=prod` se qualquer segredo ficar no
valor de exemplo, e a mensagem diz qual. O TLS termina num proxy de borda na
frente do serviço `web`, não aqui.

### Onboarding de um projeto

O cadastro inteiro vem de um YAML, não da tela:

```bash
python -m scripts.onboarding scripts/dados/cpq11.yaml --dry-run   # confere
python -m scripts.onboarding scripts/dados/cpq11.yaml             # aplica
```

`scripts/dados/cpq11.yaml` é o projeto de referência, com a biblioteca de
critérios derivada do PEB e do A5.37 — copie e adapte. O importador é
idempotente: edite e reimporte quantas vezes precisar.

O roteiro do piloto assistido, semana a semana, está em
**[`docs/PILOTO.md`](docs/PILOTO.md)**.

### Banco gerenciado (Supabase)

Banco e storage podem sair do docker-compose para o Supabase sem mudança de
código — só de variável de ambiente. O passo a passo, com os cuidados de
pooler e a razão de a autorização continuar na plataforma, está em
**[`docs/SUPABASE.md`](docs/SUPABASE.md)**.

---

## Testes e lint

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest -q      # testes que exigem Postgres são pulados se não houver banco
.\.venv\Scripts\python.exe -m ruff check .

cd ..\frontend
npm run lint
npm run build
```

O CI (`.github/workflows/ci.yml`) sobe um Postgres de verdade, aplica as migrations, testa o `downgrade` e roda a suíte completa — incluindo os testes de isolamento multi-tenant.

**A suíte recusa um banco que não seja local** (01/08/2026). Ela cria e apaga
dados reais, e quando uma asserção falha no meio a limpeza é pulada — foi assim
que dez organizações de teste sobraram no banco do piloto, ao lado do CPQ11.
Aponte o `DATABASE_URL` do seu `.env` para um Postgres seu. Se precisar mesmo
rodar contra um banco remoto, a saída é explícita e está no erro:
`PYTEST_BANCO_REMOTO=1`.

---

## Decisões de arquitetura da Fase 0

**Isolamento multi-tenant em duas camadas.** Toda tabela de negócio carrega `org_id`, e o Postgres tem *row-level security* ativo em todas elas. A API conecta com um papel (`spbim_app`) que **não** é dono das tabelas, e a cada requisição autenticada grava o tenant do token na conexão (`set_config('app.org_id', …)`). Se um filtro escapar do query builder, o banco ainda assim não devolve linha de outra organização. `backend/tests/test_tenant_isolation.py` ataca exatamente essa camada.

**A autenticação é a única exceção.** No login ainda não existe tenant — é preciso achar o usuário para descobrir a organização dele. Só esse caminho usa uma conexão privilegiada (`get_auth_db`), e ele está isolado em `app/core/deps.py`.

**Senha com Argon2, sessão com JWT.** O mock client-side do protótipo foi substituído. O SSO/OIDC está implementado (Authorization Code + PKCE) e desligado por padrão — falta escolher o provedor (decisão aberta nº 2 do plano técnico). SSO autentica mas não provisiona: o usuário precisa existir na plataforma.

**`org_id` em toda tabela.** A seção 3 do plano determina isso no texto, embora alguns trechos do DDL só liguem a organização por caminho indireto. Seguimos o texto: a coluna direta é o que torna a policy de RLS uniforme e sem join.

## Decisões de arquitetura da Fase 1

**Paginação por cursor, não offset.** As listas do domínio crescem por inserção contínua (versões, auditorias, ocorrências). Com offset, uma linha nova entre duas páginas faz um registro aparecer duas vezes ou sumir. O cursor é opaco para o cliente: base64 de `created_at|id`.

**Código derivado, não digitado.** O código da disciplina (`STRC-STEEL`) vem de `disc`-`sub`, e é recalculado quando eles mudam. Não existe caminho em que o código divirja dos campos que o compõem.

**Checklist referencia critério por id.** O critério é canônico; o checklist guarda só o `criterio_id` e os overrides locais (fase, LOD/LOI mínimos, peso). Editar "Model name" uma vez reflete no checklist Geral e no IFC — é o que substitui a duplicação entre planilhas. O contador `usos` na tela existe para deixar isso visível antes da edição.

**Cadeia de subcontratação sem ciclos.** `contratada_por` é validada subindo a cadeia inteira: A→B→A é recusado com 409. Sem isso, qualquer código que percorra o organograma trava.

**O padrão de nomenclatura é versionado.** Redefinir não sobrescreve: o padrão anterior fica marcado como não vigente. Auditorias já publicadas continuam explicáveis pelo padrão que valia na época.

**Recurso de outro tenant é 404, não 403.** Responder "proibido" já entregaria que o recurso existe em algum lugar.

## Decisões de arquitetura da Fase 2

**Abrir a auditoria materializa os resultados.** Ao abrir, cada item do checklist vira uma linha `resultado_check` com status `pendente`. Sem isso, "quantos itens faltam" seria uma conta entre tabelas a cada consulta, e um item acrescentado ao checklist depois mudaria o resultado de um round já fechado.

**N/A sai do denominador.** A aprovação é `aprovados / (total − N/A)`. Um critério que não se aplica àquela disciplina não pode contar como falha nem inflar o percentual. Quando *todos* os itens são N/A o percentual é nulo, não zero — 0% mentiria.

**Round bloqueado com item pendente.** Um round publicado alimenta painel, relatório e portal do cliente; "pendente" ali seria um percentual que ninguém sabe interpretar. Publicar também congela a auditoria: edição posterior é 409, e a correção vem no round da próxima versão.

**Versão nova desatualiza o round anterior.** Só o que estava `publicado` vira `desatualizado` — abandonar um round em andamento é decisão da coordenação, não do upload.

**A linha do painel consolida os checklists do modelo.** Um modelo costuma ter Geral + IFC + LOD 400 em paralelo. A linha responde "este modelo está aprovado?", então só fica publicada quando *todas* as suas auditorias estão, e basta uma desatualizada para a linha inteira ficar desatualizada. A aprovação é a média das que têm percentual, e o detalhe por checklist vai junto na resposta.

**O webhook do ACC fecha por padrão.** Sem `APS_WEBHOOK_SECRET` configurado, nenhum evento é aceito: um caminho de ingestão aberto deixaria qualquer um criar versão de modelo. Item desconhecido é aceito e ignorado (202), não recusado — o ACC dispara evento para muito arquivo que não é modelo auditado.

**Relatório e controle são gerados, nunca armazenados.** PDF e XLSX saem das mesmas auditorias, na hora. O relatório é bilíngue a partir de `nome_pt`/`nome_en` dos critérios.

## Decisões de arquitetura da Fase 3

**O automático nunca sobrescreve o humano.** Se alguém editou um resultado, ele vira `origem = manual` e o worker o preserva — o relatório de execução diz quantos foram preservados. Sem essa regra, um reprocessamento apagaria em silêncio uma decisão tomada com o fornecedor.

**"Ausente" e "vazio" são falhas diferentes.** Um parâmetro 4D que não existe exige criar o campo; um que existe em branco exige preencher. A ocorrência diz qual é, porque a correção é outra.

**Zero elementos analisados vira N/A, não aprovado.** Ausência de evidência não é evidência de conformidade, e aprovar um modelo vazio inflaria o percentual do round.

**As ocorrências são truncadas com aviso.** Um IFC de datacenter geraria centenas de milhares de linhas. Guardamos as primeiras 500 e o comentário do resultado **diz** que houve corte — contagem truncada em silêncio é pior que contagem ausente.

**O validador de nomenclatura responde por segmento.** Dizer só "nome inválido" obrigaria o fornecedor a adivinhar onde errou, que é exatamente o atrito que essa automação existe para remover. O sufixo de software é marcável como opcional, porque entregas de Navisworks vêm sem ele.

**Validar é livre; punir é explícito.** `POST /nomenclatura/validar` não tem efeito colateral — a coordenação precisa conferir um nome sem cobrar ninguém. Só com `registrar: true` a penalidade entra no ledger e a notificação sai. Na ingestão pelo ACC o registro é automático, porque ali o arquivo já chegou fora do padrão.

**Fila fora do ar não atrasa o upload.** O broker é checado por socket (0,5 s) antes de qualquer chamada ao Celery. Sem isso, um Redis inacessível prenderia a requisição por ~107 s: as políticas de reconexão do broker *e* do backend de resultado somam esse tempo, e o backend é consultado já no `delay()`.

**O worker é um invólucro fino.** Toda a lógica está em `services/automacao/executor.py`, uma função comum sobre uma sessão — por isso os testes a exercitam sem Redis e sem worker.

## Decisões de arquitetura da Fase 4

**A trilha de auditoria é automática, não chamada.** Ela vive num listener do SQLAlchemy (`app/db/trilha.py`), e não espalhada pelos handlers: um registro que depende de alguém lembrar de chamá-lo é um registro que vai faltar exatamente no dia em que importa. Senha, token e `oidc_sub` nunca entram no diff — a trilha não pode virar um lugar onde credencial vaza.

**O autor vem de um middleware, não da dependência.** Rota síncrona do FastAPI roda num threadpool, e o `anyio` *copia* o contexto para a thread trabalhadora: uma `ContextVar` definida lá dentro não volta para o chamador. Definindo no middleware — que roda no laço assíncrono — o valor alcança as dependências e o handler. Sem isso a trilha gravava `usuario_id` nulo.

**O `diff` muda de formato conforme a ação.** `criou`/`removeu` guardam o estado inteiro; `alterou` guarda `{de, para}`. Um formato único obrigaria a inventar um "de" que não existe na criação, ou a perder o contexto do que mais havia no registro removido.

**O portal não reaproveita endpoint interno.** Ele monta a própria resposta a partir das views derivadas, com lista de *inclusão* campo a campo — um campo novo no painel interno não aparece no portal até alguém decidir que deve. O token resolve o tenant e a sessão é amarrada a ele, então o row-level security também vale ali. Token revogado e token inexistente devolvem a mesma resposta: distinguir os dois entregaria quais tokens já existiram.

**O índice do placar é explicável.** `aprovação − NCs×2 − penalidades×3`, com piso zero, e os três componentes vão junto na resposta com a fórmula — um placar de fornecedor precisa poder ser contestado com dado, não com opinião.

**Os gráficos usam token de tema, não o hex da API.** O backend devolve a cor (que o PDF usa), mas a tela mapeia a chave da fatia para `var(--macro-X)`: o modo escuro tem passos próprios, validados contra o fundo escuro, não um inverso automático do claro. A paleta passou pelas verificações de banda de luminosidade, piso de saturação, separação sob daltonismo e contraste — o que obrigou a subir o teal do MEP de `#0E7C6B` para `#0A8A72`, que no valor original lia como cinza.

---

## Decisões de arquitetura da Fase 5

**A aplicação se recusa a subir em produção com segredo de desenvolvimento.** `verificar_producao` roda no import e derruba o processo listando exatamente quais variáveis ficaram no valor de exemplo. Falhar no start é barulhento e barato; descobrir depois que o piloto rodou um mês com o `JWT_SECRET` padrão — com o qual qualquer pessoa forja um token de admin — não é. A documentação interativa também some em produção: ela expõe o desenho inteiro da API para quem só precisava do portal.

**Log em JSON, uma linha por evento, só em produção.** É o formato que qualquer agregador indexa sem regex frágil, e o piloto vai precisar responder "por que a auditoria da versão X não rodou?" olhando log.

**Dois serviços de backup, não um.** O dump do banco precisa do `pg_dump` e a cópia do bucket precisa do `mc`. Juntar os dois numa imagem significaria instalar um deles à mão a cada build. O dump só ganha o nome final depois de terminar — um arquivo com o nome definitivo é, por definição, completo — e `verificar-restauracao.sh` restaura num banco descartável conferindo que as policies de RLS vieram junto: um dump que restaura sem elas restaura um banco onde qualquer organização lê tudo.

**O bucket é espelhado pela API, não copiado do volume.** Copiar o diretório de um MinIO em execução dá um retrato inconsistente.

**A migration roda como serviço próprio, antes da API e do worker.** É o que impede um worker de escrever em schema velho no meio do deploy.

**O onboarding vem de um YAML, não da tela.** Um projeto real são dezenas de cadastros que dependem uns dos outros — critério referencia standard, checklist referencia critério, disciplina referencia empresa. O importador é idempotente, então o arquivo passa a ser a fonte da configuração: edita e reimporta. Referência faltando vira aviso, não erro — parar no primeiro problema faria o onboarding travar por um typo. Senha nunca entra no YAML: vem de variável de ambiente, porque o arquivo vive no repositório.

## Referências

- [`CLAUDE.md`](CLAUDE.md) — briefing do projeto
- [`docs/Plano_Tecnico_Piloto_SPBIM.md`](docs/Plano_Tecnico_Piloto_SPBIM.md) — arquitetura, schema, API, roadmap
- [`docs/Especificacao_Plataforma_Auditoria_BIM.md`](docs/Especificacao_Plataforma_Auditoria_BIM.md) — modelo conceitual e regras de negócio
- [`docs/Backlog_Piloto_SPBIM.md`](docs/Backlog_Piloto_SPBIM.md) — backlog por fase
- [`docs/prototipo_auditoria_bim.html`](docs/prototipo_auditoria_bim.html) — protótipo navegável
