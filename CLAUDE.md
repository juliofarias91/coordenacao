# SPBIM — Plataforma de Auditoria BIM

Plataforma SaaS que audita modelos BIM (Revit/IFC) contra critérios de um PEB, elimina as planilhas de controle manuais e entrega relatórios/portal do cliente. **A SPBIM é a proprietária da solução**; ela atende vários **clientes**, cada um com vários **projetos** (o projeto de referência é o **CPQ11**).

Princípio central: **a auditoria é a única fonte de dado. Painel de controle, matriz, relatório e KPIs são visões derivadas** — é isso que substitui a planilha.

## Stack

- **Backend:** Python · FastAPI · PostgreSQL 15+ · Celery/Redis (workers) · S3 (arquivos)
- **Frontend:** React + TypeScript
- **Automação BIM:** IfcOpenShell (IFC, in-house) · Autodesk Platform Services / Model Derivative (Revit)
- **Auth:** OIDC/SSO + JWT (nada de senha em texto — o mock do protótipo NÃO é referência de auth)
- Multi-tenant: toda entidade carrega `org_id`. Hierarquia: organização → cliente → projeto.

## Fonte de verdade (leia antes de codar)

- `docs/Plano_Tecnico_Piloto_SPBIM.md` — **arquitetura, schema PostgreSQL (DDL), endpoints da API, estratégia de automação, roadmap por fases.** É o documento mestre.
- `docs/Especificacao_Plataforma_Auditoria_BIM.md` — modelo de dados conceitual e regras de negócio.
- `docs/Backlog_Piloto_SPBIM.md` — backlog do piloto (se precisar de tarefas granularizadas).
- `docs/prototipo_auditoria_bim.html` — **protótipo navegável**: define os fluxos, as telas e os estados. Continua sendo a referência de **o que cada tela mostra**. Não é mais a referência de **como ela parece** — ver a seção "Sistema visual" abaixo.
- `ui-kit-export/README.md` — **a linguagem visual**: as cinco regras, as escalas e a régua do esqueleto.

## Ordem de construção (roadmap — ver plano técnico, seção 8)

0. Setup: repositório, Postgres, docker-compose, auth SSO, schema base.
1. Cadastro (projeto, empresas/projetistas, disciplinas, critérios, usuários) + API.
2. Ingestão de modelos (ACC) + execução manual de auditoria + não-conformidade + relatório/controle.
3. **Automação:** validação de nomenclatura (nível 0) + auditoria 4D de parâmetros em IFC (IfcOpenShell). É a primeira automação ponta a ponta e a maior prova de valor.
4. Portal do cliente, notificações, penalidades, KPIs/placar de conformidade.
5. Piloto assistido em um projeto real.

## Convenções

- Não implemente tudo de uma vez. Proponha estrutura/decisão, **mostre e peça aprovação antes de avançar de fase.**
- Multi-tenant sempre: injetar `org_id` do token em toda query.
- Bilíngue (PT/EN) na UI — o protótipo já traz os textos nos dois idiomas.
- Nomenclatura de arquivos do domínio: `PROJETO-MACRO-DISC-SUB-SETOR-SW` (ex.: `CPQ11-C-STRC-CONCR-ADMIN-R22`).
- Inicialize git cedo e faça commits por etapa.
- Ao replicar uma tela, tire do protótipo HTML **o conteúdo e o comportamento**; a aparência sai do sistema visual abaixo.

## Sistema visual (`ui-kit-export/` aplicado)

A linguagem visual da plataforma é a do `ui-kit-export/` (extraído do VDCity).
A marca continua SPBIM: o accent é o azul `#2547b0` / `#6e8cf2` e as quatro
cores de macrodisciplina não mudaram — o kit dá estrutura e régua, não cor.

O transplante foi feito **sem Tailwind**. As classes semânticas de sempre
(`.card`, `.btn`, `.pill`, `.seg`, `.chip`…) continuam valendo e as 25 telas
não foram tocadas: `src/styles/tokens.css` e `src/styles/app.css` é que passaram
a expressar a linguagem do kit. Para mudar o visual de algo, mexa nesses dois —
não espalhe estilo pelas páginas.

**As cinco regras. Uma tela nova que as siga "parece do sistema"; que as
ignore, não:**

1. **Ativo é cor + peso, nunca pílula colorida.** Item de sidebar, aba,
   breadcrumb atual: tinta cheia e negrito, sem fundo. Numa coluna de nove
   itens o retângulo colorido do ativo vira o elemento mais pesado da tela —
   sendo que ele só precisa responder "onde eu estou".
2. **Cor é significado, não decoração.** Ela entra em três lugares e só: métrica
   que se varre a tela procurando, estado semântico (sempre **translúcido**, a
   /10–/13) e destrutivo. Corolário: em KPI o tom vai no marcador e o **número
   fica em `--ink`** — uma fileira de números coloridos vira semáforo e
   perde-se qual valor é grande.
3. **Rótulos que crescem** (`.pillact`) — a microinteração-assinatura. O botão
   nasce redondo e o rótulo expande no hover. É o que põe várias ferramentas na
   topbar sem virar uma fileira de ícones mudos.
4. **Só a esquerda empurra.** A sidebar empurra o conteúdo; painel da direita,
   quando houver, sobrepõe — se empurrasse, abri-lo reflowaria a tabela e o
   usuário perderia de vista a linha que acabou de abrir.
5. **Escuro é preto neutro** — `#0f0f0f` / `#1c1c1c` / borda `#242424`,
   saturação zero. O azul-ardósia de antes saiu. O espaçamento entre os três
   níveis é o que produz a hierarquia de superfície; se mexer, preserve os
   degraus.

**Escalas — não invente um sexto degrau.** Raio: `--r-md` controle pequeno,
`--r-lg` input/botão, `--r-xl` card interno/popover, `--r-2xl` **card de página
e modal** (a superfície de página tem raio próprio, acima do dos controles).
Sombra: card `--sh-sm`, dropdown `--sh-md`, popover/dock `--sh-xl`, modal
`--sh-2xl`. Esqueleto: sidebar 240px ↔ 52px, topbar 56px, header de seção 48px,
barra interna 40px — a diferença 56↔48 é hierarquia proposital, chrome externo
acima de header de ferramenta. Movimento: **duas** curvas (`--dur`/`--ease`
domina; em dúvida é ela).

**Armadilhas deste transplante:**
- Realce de linha de tabela é `--hover-ink` (a própria tinta a 3–4%), **nunca
  zebra**. Zebra fixa uma cor que acerta em um tema e erra no outro.
- Topbar, dock e cabeçalho do portal declaram `background` **duas vezes**: a
  opaca antes do `color-mix`. Navegador sem `color-mix` descarta a segunda e
  fica com a barra sólida; sem o fallback ela ficaria transparente e o conteúdo
  passaria por baixo ao rolar.
- O bloco do usuário saiu do rodapé da sidebar e virou `.usermenu` na topbar
  (28/07/2026): avatar no lugar do ícone de uma `.pillact`, com o nome
  crescendo no hover, e nome/papel/**Sair** num painel igual ao do sino. Sair
  não fica exposto na barra — é destrutivo, e um clique errado derrubaria a
  sessão no meio de uma auditoria. As classes `.userbox/.av/.nm/.rl` continuam
  valendo: o que mudou foi onde o bloco é montado, não do que ele é feito.
- A sidebar nasce **expandida**, ao contrário do padrão do kit. Lá o padrão é
  recolhida porque as telas são full-bleed; aqui `main` é limitado a 1180px e
  recolher não devolve espaço a ninguém.

## Módulo de auditoria de arquivos (portado do Auditer)

`Configuração › Nomenclaturas & padrões` tem quatro sub-abas, de **duas
origens**, e elas convivem porque respondem a perguntas diferentes:

- **Padrão do projeto** — backend. Vale para o time, gera penalidade,
  notificação e trilha. Audita o **modelo** entregue.
- **Auditoria de arquivos · Padrões avançados · Palavras aceitas** — vieram do
  `auditer/` e rodam 100% no navegador, sem tocar na API. Auditam a **pasta**:
  PDF de spec, planilha de controle, relatório.

O que só existe aqui: separador por bloco e segmento tipado (data/número/
texto), duplicidade por **conteúdo** (SHA-256 — a cópia salva com outro nome),
higiene de nome e ortografia de planilha (Hunspell/wasm, pt-BR + inglês).

**Regras que já custaram caro — não reverta:**
- `src/lib/auditer/*.js` e `src/workers/spell.worker.js` são **JavaScript de
  propósito**: vieram inteiros do Auditer, sem uma linha alterada. Os tipos
  entram por `.d.ts` ao lado — não há `allowJs`. Antes de mexer neles, rode
  `npm test` (suíte de nomenclatura, 28 casos: mês 13, 29/02 em ano não
  bissexto, extensão dupla, duplicidade).
- O alias `hunspell-asm → dist/cjs/index.js` no `vite.config.ts`. O build ESM
  importa um arquivo CommonJS e o interop do Vite entrega um namespace no
  lugar da função (`runtimeModule is not a function`).
- As três abas entram por **lazy import**. Estaticamente, o SheetJS vai para o
  chunk principal e o bundle inicial pula de 290 kB para 814 kB — toda a
  plataforma pagando pelo peso de uma aba.
- Os dicionários (5,7 MB) **não são fonte**: o `scripts/copy-dict.mjs` os gera
  no `npm install` a partir de `dictionary-pt`/`dictionary-en`. Ficam em
  `public/dictionaries/`, fora do bundle, e são lidos por `fetch` no worker.
- Uma palavra só é erro quando falha nos **dois** idiomas, e todo token em
  CAPS é ignorado — nas planilhas do ACC, CAPS é sigla/código, nunca prosa.
  Auditar CAPS gerava mais de 600 falsos positivos numa planilha só.

**O app `auditer/` foi aposentado em 28/07/2026.** Ele não tinha uma linha de
lógica que a plataforma já não tivesse: os seis arquivos do motor e o worker
eram byte a byte idênticos aos de `src/lib/auditer/` — a única diferença em
todo o conjunto era um `../` que virou `../../`, porque o arquivo desceu um
nível de pasta. O que restava era casca: `package.json`, Dockerfile, nginx e
uma UI que já havia sido reimplementada no sistema visual da plataforma.

Recuperável em três lugares, se algum dia precisar: o histórico deste
repositório (`git log -- auditer/`), o histórico git original em
`referencias/auditer-historico.git` e o `backup-auditer-2026-07-27.zip` ao
lado dele.

Uma diferença de comportamento ficou, e é de propósito: o Auditer rodava sem
login e a aba equivalente exige autenticação. Quem auditava pasta sem ter
conta na plataforma passa a precisar de uma.

## Estado atual

**As seis fases do roadmap estão implementadas.** Ver `README.md` para como rodar e para as decisões de arquitetura, `docs/OPERACAO.md` para o runbook de produção e `docs/PILOTO.md` para o roteiro do piloto assistido.

**A plataforma é uma aplicação só.** `backend/` e `frontend/` são divisão de
código-fonte, não de produto: o `Dockerfile` da raiz compila o React dentro da
imagem da API, que o serve na mesma porta (`app/spa.py` liga isso ao encontrar
`backend/static/`). Para desenvolver, `.\dev.ps1` — `-Unico` roda só a :8000
servindo o build, que é o arranjo de produção, e `-Parar` encerra.

- **Fase 0** — schema completo (23 tabelas, 12 enums), RLS multi-tenant, auth Argon2+JWT, OIDC/PKCE (desligado), Celery, shell React, CI.
- **Fase 1** — cadastro: projetos, empresas+contatos+subcontratação, usuários+permissões, standards+nomenclatura, disciplinas, critérios+checklists.
- **Fase 2** — execução: modelos e versões com upload para o S3, ingestão via webhook do ACC, auditoria com estados e publicação de round, não-conformidades, painel/matriz derivados e exports (PDF/XLSX).
- **Fase 3** — automação: validador de nomenclatura com penalidade e notificação, motor de verificadores, auditoria 4D de parâmetros e de categorias em IFC (IfcOpenShell), extração de propriedades Revit (APS) e worker Celery com retry.
- **Fase 4** — colaboração: central de notificações, KPIs com gráficos, placar de conformidade por fornecedor, apontamentos, portal do cliente com visibilidade por campo e trilha de auditoria automática.

- **Fase 5** — piloto: imagens e compose de produção, guarda que recusa segredo de desenvolvimento, log em JSON, backup do banco e do bucket com restauração verificada, workflow de publicação e o importador de projeto por YAML.

- **Administração** (`/admin`, fora do roadmap original) — organização, projetos e usuários no nível do tenant. `GET/PATCH /organizacao` é a única rota nova; projetos e usuários já tinham API desde a Fase 1 e só não tinham tela: até aqui um projeto novo só nascia por `scripts/seed.py` ou pelo importador YAML. Aparece no menu só para quem tem `admin_cadastro`; a guarda real continua no `requer_permissao` de cada rota. **Não existe listagem nem criação de organização** de propósito — listar é o que o isolamento multi-tenant impede, e criar é provisionamento, sai do seed.

72 endpoints; 190 testes contra Postgres, MinIO e arquivos IFC reais.

**O que resta não é código:** subir o ambiente produtivo num servidor e rodar o piloto assistido. Se o usuário pedir "continue", pergunte o que ele quer — não há próxima fase para implementar sozinho.

Ao continuar:
- **A URL carrega o projeto**: toda tela de auditoria vive em
  `/projetos/:projetoId/<tela>` e o projeto corrente sai de lá, não do
  `localStorage` (que sobrou como memória do último visitado). Quem monta o
  caminho é `rotaProjeto()`, em `frontend/src/projeto/ProjetoContext.tsx`.
  Nunca escreva `/painel` à mão.
- **A sidebar é contextual** (`frontend/src/layout/nav.ts`): `ITENS_GLOBAIS`
  fora de um projeto, `ITENS_PROJETO` dentro. Tela nova entra numa das duas
  listas — na global se a API dela não recebe `projeto_id`, na de projeto se
  recebe. Errar isso foi o que deixou Apontamentos e Integrações no menu de
  projeto sendo que nenhuma das duas APIs é por projeto.
- **As seis telas de Auditoria são uma só**, parametrizada pela rota
  (`auditoria/:checklist`) sobre a matriz que o backend já servia por
  checklist. `LOD300` e `LOD350` estão no menu mas não no enum do banco — ver
  `CHECKLISTS_SEM_BANCO`.
- `backend/app/api/v1/` tem o padrão de rota (permissão via `requer_permissao`, sessão via `get_tenant_db`, 404 via `services/escopo.py`).
- `backend/app/services/auditoria.py` concentra as regras da execução — leia antes de mexer em estado de round.
- `backend/app/services/automacao/executor.py` tem o registro de verificadores: para automatizar um critério novo, acrescente uma entrada em `VERIFICADORES` ou dê a ele um `parametro_esperado`.
- `backend/tests/` tem o padrão de teste: `cenario` monta uma organização isolada, `auditavel` vai até o ponto de auditar, e `ifc_fabrica.py` gera IFC de verdade.

**Cinco armadilhas já pagas — não reverta:**
- O `db.flush()` no início de `recalcular_aprovacao`: a sessão roda com `autoflush=False` e sem ele o percentual sai um passo atrasado.
- `broker_connection_max_retries=0` no Celery significa "tentar para sempre". Precisa ser positivo.
- `fila_disponivel()` checa o broker por socket antes de qualquer `delay()`; sem isso um Redis fora do ar prende a requisição por ~107 s. **`storage.endpoint_alcancavel()` é a mesma ideia para o S3**, e existe porque o `/health/ready` a reintroduziu: `head_bucket` contra endpoint fora do ar custa ~45 s com o cliente normal e ~8 s mesmo com timeout curto e uma tentativa. Num endpoint que o monitoramento chama a cada 30 s, isso transforma "o storage caiu" em "a API caiu".
- O autor da trilha vem do `AutorMiddleware`, não de `get_current_user`: rota síncrona roda em threadpool e a `ContextVar` definida lá dentro não volta para o chamador.
- `_garantir_id` no `before_flush`: defaults de coluna só são avaliados no INSERT, então sem ele toda criação entra na trilha sem dizer o que foi criada.

**Ao criar gráfico:** as cores saem de token de tema (`var(--macro-X)`), nunca do hex da API — o modo escuro tem passos próprios. A paleta foi validada; se mexer nela, revalide.

**Não verificado contra sistema externo:** o cliente APS (`services/aps.py` e `services/automacao/revit.py`) foi exercitado só com respostas gravadas — falta credencial do developer hub (decisão aberta nº 3).
