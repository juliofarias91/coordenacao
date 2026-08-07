# Onde paramos — 03/08/2026

Estado da plataforma no fim do dia, o que está no ar, e o que vem a seguir.
Escrito para retomar amanhã sem reconstruir o contexto.

---

## 03/08 — o trabalho de 30 e 31/07 entrou no git

**Nada tinha sido commitado desde 30/07 01:53.** A árvore tinha 77 arquivos
modificados, 33 novos e **seis migrations sem versionar** (0010 a 0015) — dois
dias inteiros de trabalho existindo em um lugar só, o disco desta máquina. Foi
o primeiro item do dia, antes de qualquer melhoria nova: melhoria em cima de
base não versionada é trabalho que ninguém consegue reverter.

O que estava fora, por migration:

| | O que é | Onde está documentado |
|---|---|---|
| **0010** | Convite, definir senha, corte de sessão | `CLAUDE.md` › *Acesso* |
| **0011** | Ficha do projeto e o projeto na lixeira | `CLAUDE.md` › *O PLANO* |
| **0012** | Importação de planilha (ponte provisória) | `CLAUDE.md` › *Importação* |
| **0013** | Andamento e prioridade da auditoria | `CLAUDE.md` › *O PLANO* |
| **0014** | Equipe do membro no projeto | `CLAUDE.md` › *Membros e disciplinas* |
| **0015** | Nome por extenso da disciplina | `CLAUDE.md` › *Membros e disciplinas* |

Fora do banco, no mesmo lote: o **tema escolhível** (aparência + cor de
destaque), a **gaveta** lateral, **páginas sem `h1`**, `Configurações` da conta
como quarta área contextual, `Apontar erro` como pílula própria da topbar, os
recortes de auditoria virando **dropdown de modelos**, e a saída do
`ui-kit-export/`. As regras de cada uma dessas decisões já estavam escritas no
`CLAUDE.md` — o que faltava era o código estar sob controle de versão.

**As 0014 e 0015 não estavam documentadas em lugar nenhum** além da docstring da
própria migration. Ganharam seção no `CLAUDE.md` junto do commit.

Duas faxinas pequenas: `vite.config.ts.timestamp-*.mjs` (arquivo temporário que
o Vite deixa quando morre no meio) e `.claude/` foram para o `.gitignore` — o
segundo porque o que há nele é da máquina, caminho absoluto e lista de comandos
aprovados.

### O que foi conferido antes de commitar

```
frontend   tsc limpo · eslint limpo · npm test 28/28 · build ok
backend    os arquivos que o lote alcança (acesso, autenticação, contrato,
           ficha, importação, plano da auditoria, membros)
```

**Os commits intermediários não foram rodados um a um.** Os arquivos
compartilhados — `lib/api.ts`, `lib/types.ts`, `App.tsx`, `styles/app.css`,
`models/cadastro.py` — carregam pedaços de todas as seis features, e dividir
hunk a hunk produziria commits que não compilam. A divisão é por assunto, para
quem for ler depois; **quem passa nos checks é a ponta**, e é ela que foi
verificada. A suíte inteira (~1h contra o Supabase) não foi rodada hoje.

**As telas não foram vistas em navegador nesta sessão** — a última verificação
visual registrada é a de 29/07.

---

## 29/07 — rotas por projeto

O projeto saiu do `localStorage` e foi para a URL: as telas de auditoria agora
vivem em **`/projetos/:projetoId/<tela>`**. Era o item 10 da lista de ontem, e
foi feito antes das telas novas justamente para não ter de refazê-las depois.

O que isso muda na prática:

- **`/painel` significava coisas diferentes para duas pessoas** — cada uma com
  o seu projeto guardado no navegador. Agora o endereço carrega o projeto e
  **dá para mandar o link a um colega**. O "Abrir" da administração virou um
  link de verdade, que se copia e se abre noutra aba.
- **Trocar de projeto mantém a tela**: quem está no painel do CPQ11 e troca no
  breadcrumb cai no painel do outro, não numa tela inicial.
- **O breadcrumb passou a ser `cliente › projeto › tela`** — a mesma árvore que
  a home usa como pasta.
- **Os links antigos continuam funcionando.** `/painel`, `/kpis`,
  `/modelos/:id` e os outros redirecionam para o último projeto visitado, que
  é exatamente o que a URL antiga queria dizer.

Duas decisões que valem lembrar antes de mexer:

- **`selecionar()` preserva só as telas do menu.** `modelos/<id>` fica de fora
  de propósito: trocar de projeto ali levaria o id do modelo do projeto antigo
  para a URL do novo. A lista sai de `ITENS_NAV`, não é escrita à mão.
- **O `localStorage` (`spbim_projeto`) não sumiu — mudou de papel.** Não é mais
  o projeto corrente; é a memória do último visitado, que responde "qual
  projeto?" nas telas globais (home, administração) e alimenta o redirecionamento
  dos links antigos. Ele acompanha a URL, não o clique: um link recebido de
  outra pessoa também vira o "último".

`tsc`, `eslint`, `npm test` (28/28) e o build passam; o refresh direto num link
profundo foi conferido contra a API real (o catch-all do `spa.py` cobre
qualquer profundidade). **A renderização em si não foi verificada em navegador**
— não há automação de browser nesta máquina.

---

## 29/07 — o painel administrativo virou área, e a home só navega

Ajustes pedidos depois de ver a etapa 1.

**O painel administrativo tem sidebar própria.** Virou a **terceira área** com
menu próprio, pelo mesmo mecanismo do escopo de projeto: entra-se nele e a
barra troca inteira. Eram abas; aba serve para alternar entre visões do MESMO
assunto, e quem administra usuários não está a meio caminho de conferir o log.

```
/admin   Usuários · Logs
         Cadastro: Organização · Clientes · Projetos
```

> **Organização, Clientes e Projetos não foram pedidos** nesta rodada — o
> pedido foi "usuários e logs só por enquanto". Ficaram, num grupo à parte,
> porque são o **único lugar da plataforma onde um projeto ou um cliente
> nasce**: a home lista projetos, não os cria. Removê-los deixaria a plataforma
> sem como cadastrar um projeto. Quando houver outra porta para isso, o grupo
> sai. Diga se prefere que saiam já.

**A gestão de membros voltou para o painel** (`/admin/usuarios`). Ela tinha ido
para a home na etapa 1; com o painel ganhando sidebar, o lugar dela é lá.
`/membros` redireciona, para não quebrar link.

**A home perdeu a fileira de KPIs**, que virou `/kpis` — de todos os projetos,
com uma linha por projeto que leva ao KPI daquele. A home fazia duas coisas ao
mesmo tempo, "como estamos?" e "onde está o projeto do fulano?", e quem entra
por ela está fazendo a segunda. Agora só há as pastas de cliente e, dentro
delas, os projetos.

> A tela agrega **no navegador**, uma requisição por projeto: não existe
> endpoint de KPI consolidado. Com dezenas de projetos isso deixa de se pagar,
> e aí o certo é um `GET /kpis` no servidor.

**A marca da sidebar leva ao início.** Agora que a barra troca de conteúdo em
três áreas, ela é o único elemento que não muda.

**O menu da home ganhou grupos**: `Acompanhamento` (KPIs, Apontamentos) e
`Organização` (Integrações), com `Projetos` sozinho no topo sem rótulo.

As classes `.home-kpi*` viraram `.kpi*`: a fileira saiu da home, e um nome que
diz onde o bloco vive é a forma mais barata de enganar quem lê depois.

---

## 29/07 — a navegação remontada (etapa 1 de 2)

A estrutura do menu passou a ser a que a coordenação pediu. O que mudou de
fundo: **a sidebar é contextual**. Fora de um projeto ela mostra o que vale
para a organização; dentro, o que se faz naquele projeto, com um caminho de
volta no topo trazendo o código do projeto.

```
fora do projeto     Projetos · Apontamentos · Gestão de membros · Integrações
dentro do projeto   ← CPQ11 · Painel · KPIs
                    Auditoria: geral · 4D · LOD300 · LOD350 · LOD400 · LOD500 · Relatórios
                    Projeto: Critérios · PEB · Membros · Configurações
```

**Duas telas estavam no menu errado desde sempre, e o backend já dizia isso:**

- **Apontamentos** virou central. `projeto_id` sempre foi filtro *opcional* na
  API — era a interface que insistia em passá-lo, e o efeito era que ver as
  pendências de dois projetos exigia trocar de projeto e somar de cabeça. Agora
  lista tudo, com o projeto virando coluna e filtro. Criar continua exigindo um
  projeto: `projeto_id` é NOT NULL na tabela.
- **Integrações** subiu para o nível da organização. A tela sequer usava o
  contexto de projeto.

**As seis auditorias são uma tela só.** A matriz sempre recebeu `?checklist=`;
o painel a chamava com `lod500` fixo e os outros cinco recortes existiam na API
sem porta na interface. Viraram entradas de menu porque é assim que se
trabalha: abre-se "a LOD400", não "a matriz, e então escolhe-se LOD400".
`components/Matriz.tsx` é a tabela, compartilhada com o painel — duplicá-la
garantiria que a regra de cor divergisse na primeira mexida.

**Gestão de membros** saiu da Administração e virou `/membros`. Administração é
o que se configura uma vez; membro entra e sai o tempo todo, e estava dois
cliques abaixo do que devia.

**A busca virou barra fixa.** Era uma `.pillact` que nascia redonda. A regra
dos "rótulos que crescem" existe para caber várias ferramentas na topbar sem
virar fileira de ícones mudos — e a busca não é mais uma delas: é o atalho de
maior alcance da barra, e escondê-la fazia com que só quem já sabia do Ctrl+K a
usasse.

**Configurações da conta** (`/configuracoes`) nasceu com dados pessoais,
idioma, tema e **troca da própria senha** — que a API sempre permitiu a
qualquer usuário e a interface só oferecia a quem administra cadastros.

### Etapa 2 — o banco que faltava (migration 0004)

- **LOD300 e LOD350** entraram no enum `checklist_tipo`, **antes de `lod400`**:
  o Postgres guarda a ordem de declaração, e acrescentá-los no fim faria
  qualquer `ORDER BY` listar LOD300 depois de LOD500. As seis telas de auditoria
  passaram a responder.
- **`projeto_membro`** — vínculo usuário↔projeto com papel *nele* e função. A
  tabela **NÃO AUTORIZA**, e isso é deliberado: registra participação, e quem
  decide continua sendo `requer_permissao` sobre as permissões de organização.
  Ligar as duas coisas mudaria como as 72 rotas autorizam e é decisão à parte —
  há um teste (`test_participacao_nao_e_permissao`) que trava isso justamente
  para que a mudança seja consciente.
- Continua pendente: **preferências de notificação** (falta coluna em `usuario`).

**Um bug meu, encontrado ao aplicar a 0004 e que valia o susto.** O
`pg_advisory_lock` que eu tinha posto no `env.py` era tomado NA CONEXÃO DO
ALEMBIC — e no SQLAlchemy 2.0 o primeiro `execute()` abre uma transação
implícita. Resultado: `context.begin_transaction()` encontrava a transação já
aberta, virava no-op, e **ninguém commitava**. O `alembic upgrade head`
imprimia "Running upgrade 0003 -> 0004", saía com **código 0** e não gravava
nada. Falha silenciosa num comando que o container roda sozinho no deploy.

Corrigido de duas formas: o lock vai numa **conexão separada** (é de sessão,
sobrevive ao commit), e o `entrypoint.sh` passou a **conferir `alembic current`
contra head** depois do upgrade, em vez de confiar no código de saída.

---

## 29/07 — duas descobertas ao caçar o "sistema bugado"

**A plataforma estava vazia, e era isso.** A organização SPBIM tem 1 projeto,
1 cliente e 2 usuários — e zero empresas, disciplinas, critérios, modelos,
standards, auditorias e apontamentos. Toda tela abria legitimamente vazia.
O `scripts/dados/cpq11.yaml` tem o projeto de referência inteiro (9 empresas,
10 disciplinas, 30 critérios, 35 itens de checklist, 5 modelos) e **nunca foi
importado**. Decisão do usuário: **não importar** — o piloto vai receber dado
real, cadastrado pela própria plataforma.

A API em si está sã: 30 endpoints que as telas chamam foram exercitados com
token real, **29 passam**, e a única falha é `checklist=lod300` → 422.

**Sobraram 10 organizações de teste no banco do piloto**, de 28 e 29/07 — os
testes criam uma organização por cenário e a limpeza é pulada quando uma
asserção falha no meio. Foram apagadas (só a SPBIM restou), mas **a causa
continua**: os testes rodam contra o mesmo banco do piloto, porque é o que o
`.env` aponta. Pendência: banco de teste separado, ou limpeza à prova de falha
num fixture.

---

## 29/07 — LOD 300, e a navegação das auditorias remontada

Três pedidos que se resolveram juntos porque tocam a mesma tela.

**A auditoria virou UMA entrada na barra.** Os seis recortes deixavam o grupo
Auditoria com nove linhas — mais do que Visão geral e Projeto somados —, e seis
rótulos que começam com a mesma palavra obrigam a ler até o fim de cada um. Eles
foram para um **painel dentro da página**, recolhível, no formato dos canais do
VDCity: painel de 300px, dois cabeçalhos de 48px cujas bordas se encontram e
leem como uma régua, e o botão de recolher no cabeçalho do CONTEÚDO — se
estivesse no painel, recolher levaria embora o botão de trazê-lo de volta.
Recolher **desmonta** o painel em vez de virá-lo trilho de ícones: "Auditoria
LOD350" não sobrevive a virar ícone, e seis selos idênticos não diriam nada.

O padrão está em `.pgsplit` e vale para navegação de **segundo nível** em
qualquer tela daqui para a frente.

**A configuração do projeto voltou a ser abas.** Ela tinha ganhado sidebar
própria a pedido; o pedido de hoje foi o inverso, e está certo: as seis seções
são o cadastro de UM projeto, feito de uma vez e em sequência, e trocar a barra
inteira a cada seção fazia perder de vista em que projeto se estava — além de
deixar a área indistinguível do painel administrativo. **São três áreas
contextuais de novo** (global, projeto, admin); `escopo: 'config'` e
`ITENS_CONFIG` deixaram de existir. As rotas ficaram: a aba é um `NavLink`, o
endereço continua dizendo em que seção se está e o botão voltar funciona.

**O LOD 300.** Referência: `Spec Audit LOD300_STRC.pdf` e a planilha ao lado —
60 linhas em 4 categorias de elemento.

- O gabarito é **por disciplina** (`services/gabarito_lod.py`), ao contrário do
  da geral: ali muda a resposta entre disciplinas, aqui muda a pergunta. Omitir
  a disciplina responde 422 em vez de escolher uma.
- **Migration 0009**: `parametro_revit`, `parametro_encontrado` e
  `comentario_fornecedor`. As duas primeiras são onde a informação FOI achada —
  diferente de `parametro_esperado`, que é onde ela DEVERIA estar; a comparação
  entre as duas é a única pergunta que a planilha faz. A terceira tem outro
  autor: o guia do arquivo diz "SUPPLIERS COMMENTS — edição: FORNECEDORES".
- A planilha (`pages/PlanilhaLod.tsx`) agrupa por elemento, e o comportamento
  comum às duas planilhas saiu para `components/planilha.tsx` — senão os dois
  arquivos de 500 linhas divergiriam na primeira correção.

**Um bug que eu mesmo criei e peguei antes de rodar:** marquei
`parametro_esperado = "Geometric Data"` em três linhas, copiando a coluna REVIT
PARAMETER do arquivo. "Geometric Data" não é nome de parâmetro — é o modo da
planilha dizer "aqui se audita geometria". Como `parametro_esperado` ele torna a
linha AUTOMÁTICA, e o verificador procuraria um parâmetro com esse nome, não
acharia em modelo nenhum e **reprovaria todos**. Falso negativo em massa, que é
pior do que não automatizar. Há teste trancando isso.

**Dois defeitos antigos, da lixeira, corrigidos no caminho** — apareceram ao
rodar a suíte inteira pela primeira vez desde que ela entrou:

1. **A trilha parou de dizer "removeu".** Com remoção reversível, apagar virou
   um UPDATE de `deleted_at`; o objeto vai para `session.dirty` e o listener
   registrava `alterou`. Quem filtrasse o log por remoção não via mais nada —
   num registro que existe para reconstruir decisões depois. Agora o
   `before_flush` traduz o UPDATE no ato que ele é, e `restaurou` entrou como
   ação própria (com filtro na API e rótulo na tela).
2. **`test_remover_nomenclatura_nao_apaga_a_disciplina`** afirmava que o
   `ON DELETE SET NULL` zerava o vínculo. Com soft delete a FK nunca dispara e o
   vínculo é preservado — que é melhor, porque restaurar o padrão devolve as
   disciplinas ligadas a ele. Teste reescrito para o contrato novo.

```
backend    319 testes; a suíte inteira leva ~1h contra o Supabase
frontend   tsc limpo, build ok
```

**As telas FORAM conferidas em navegador**, e por quem pediu: o usuário
acompanhou em `localhost:8000` ao longo da construção e deu por bom o painel
recolhível da auditoria, as abas da configuração e o favicon. É a primeira vez
neste documento que essa linha não é uma ressalva — nas seções anteriores ela
aparece como pendência porque não há automação de browser nesta máquina, e
continua valendo para o que foi feito antes de hoje.

---

## 29/07 — a auditoria geral virou planilha de verdade

O pedido: "toda vez que gerarmos um modelo ele deve ter um campo de auditoria
pra ele pra imputarmos os dados — nada mais é do que uma planilha do Excel no
nosso sistema com campos pré-definidos e modificáveis". A referência são os oito
arquivos em `K:\NEW_COMPANY\...\AUDITORIA\AUDITORIA GERAL`, aba `BASE GERAL`.

**A descoberta que mudou o desenho.** Lidas as oito planilhas, os **17 itens são
idênticos em todas as disciplinas**, na mesma ordem — ARCH, STRC, ELEC, MECH,
PLMB, FPRT, TCOM, FALM. O que varia é a resposta, nunca a pergunta. E os 17
códigos **já existiam** em `scripts/dados/cpq11.yaml`, na ordem exata do
arquivo. Só que o YAML é dado de exemplo, e você recusou importá-lo no piloto —
então eles subiram para `services/gabarito.py`, como padrão da empresa, com as
instruções da coluna oculta (a coluna I, que diz COMO conferir cada item e nunca
foi para o fornecedor).

O que entrou:

- **`POST /checklists/{checklist}/gabarito`** semeia os 17 num projeto.
  ACRESCENTA e nunca sobrescreve: achar o código é sinal de que o projeto já o
  tem, possivelmente ajustado. É o "modificável" do pedido, e há um teste para
  que sincronizar o texto de fábrica seja uma decisão e não um acidente. O botão
  fica em Biblioteca de critérios › Compor checklist.
- **`resultado_check.direcao` (migration 0008)** — a coluna DIRECTION. São duas
  frases com destinatários diferentes: `comentario` é o diagnóstico interno,
  `direcao` é a orientação ao fornecedor. Até aqui só existia a primeira, e a
  orientação vivia em `nao_conformidade.recomendacao` — o que obrigava a criar
  uma NC, com prazo e responsável, para registrar uma frase. A NC agora nasce
  das duas, sem cruzar os papéis.
- **A auditoria geral nasce com a versão**, nas DUAS rotas que criam versão (a
  manual e o webhook do ACC), por `ao_registrar_versao`. Antes era preciso
  clicar "Abrir auditorias" e o modelo recém-criado não tinha onde receber nada.
  Só a geral: LOD e 4D são trabalho dirigido.
- **`pages/PlanilhaGeral.tsx`** — a grade editável, em
  `/projetos/:id/auditoria/geral/:modeloId`. Salva no blur, campo por campo; sem
  botão de salvar porque não há rascunho.

**Dois bugs achados no caminho, e o segundo é maior do que parece.**

1. `/auditoria/geral` era **estruturalmente vazia**. A matriz é modelo × área e
   busca a célula por `(versao_id, area)`; auditorias de geral têm `area = NULL`
   e não casavam com coluna nenhuma. A tela mostrava uma grade de travessões.
   Agora a geral usa `ControleGeral` (a aba GENERAL AUDIT - CONTROL).
2. **O mesmo vale para 4D, LOD300 e LOD350** — `abrir_auditoria` só recebe
   `area` quando o chamador a passa, e ninguém passa: nem `POST /auditar` (que
   repassa `payload.area`, nulo no caminho normal) nem a abertura automática.
   Ou seja, **quatro das seis telas de auditoria mostram matriz vazia**, e as de
   LOD400/500 só não mostram porque a área tem de ser informada à mão. Não mexi
   nelas: escolher entre "abrir uma auditoria por área da disciplina" e "a
   matriz também mostrar o que não tem área" é decisão sua. Ver a lista de
   pendências.

O `Modelo.tsx` perdeu uma duplicação de regra: ele mandava `descricao` ao criar
a NC, o que agora PERDERIA a direção — o servidor herda as duas.

```
backend    11 passed em test_auditoria_geral.py (gabarito, direcao, abertura)
           migration 0008 aplicada no piloto e conferida (`alembic current` = 0008)
frontend   tsc limpo, build ok, publicado em backend/static e servindo na :8000
```

**A suíte inteira estava rodando quando escrevi isto** — o resultado vai no
próximo parágrafo desta seção. **Nenhuma tela foi verificada em navegador**: não
há automação de browser nesta máquina.

**Para VER a planilha no piloto** faltam três passos com dado real, porque o
CPQ11 está vazio (1 organização, 1 projeto, zero disciplinas): criar uma
disciplina que declare `geral`, clicar em "Aplicar os 17 itens de fábrica" e
cadastrar um modelo. A planilha abre sozinha com a versão.

---

## 29/07 — o lote de telas que faltava

Quatro itens da lista abaixo, todos "só tela": o backend já existia e ninguém
via o dado.

- **Clientes na Administração** (item 1). A entidade nasceu em 28/07 e só se
  criava de carona, pelo "+ novo cliente…" do formulário de projeto. Agora tem
  aba própria — e é o único lugar onde se corrige o nome de um cliente, o que
  importa porque **o nome do cliente é a pasta da home**. Remover avisa quantos
  projetos ficam órfãos, em vez de um "tem certeza?" genérico.
- **Log de atividade** (item 2), na Administração. A trilha grava sozinha desde
  a Fase 4 e tinha API; faltava a tela. Filtra por entidade, ação e pessoa,
  agrupa por dia e a linha expande mostrando campo a campo. O cuidado central
  é que o `diff` **muda de formato conforme a ação** — `criou`/`removeu` trazem
  o estado inteiro, `alterou` traz `{de, para}` —, e a tela decide pela FORMA
  do valor, não pela ação, para que uma linha antiga não a derrube.
- **Central de notificações** (item 3), em `/notificacoes`, com "ver todas" no
  rodapé do sino. Não é redundante com ele: o sino é o **aviso** (aparece por
  cima e some), a central é a **caixa** (filtro por tipo, por não-lidas,
  separação por dia). Rota global, sem projeto — notificação é do usuário e do
  papel dele.
- **Política de privacidade** (item 6), em `/privacidade`, **pública**: uma
  política atrás de login informa tarde demais. Entra por lazy import — é a
  única tela de texto corrido da plataforma, e estaticamente esse texto
  viajaria no chunk principal. O conteúdo descreve o que o código realmente
  faz (RLS, trilha imutável, `ON DELETE SET NULL`, APS, Supabase). **Falta
  preencher os campos entre colchetes e passar por revisão jurídica.**

**Um bug encontrado e corrigido no caminho.** Escrevendo o primeiro teste de
`/organizacao` (o endpoint não tinha nenhum), apareceu que a guarda de slug
duplicado era **código morto**: ela fazia um `SELECT` numa sessão com RLS, que
só enxerga a própria organização, então nunca achava o slug do vizinho e
aprovava sempre — a colisão só aparecia no `UPDATE`, como 500. Agora a
constraint é que decide, e o `IntegrityError` vira 409. De quebra fecha a
corrida entre dois admins renomeando ao mesmo tempo.

`/organizacao` também passou a contar **clientes**, que ficou de fora quando a
entidade nasceu.

```
backend    16 passed  (test_organizacao novo com 5, + test_api e test_permissoes)
frontend   tsc + eslint limpos, npm test 28/28, bundle inicial 322 kB
```

Não rodei a suíte inteira do backend (são ~40 min); rodei os três arquivos que
a mudança de `/organizacao` alcança. **Nenhuma das telas foi verificada em
navegador** — não há automação de browser nesta máquina.

---

## O que mudou em 28/07

A plataforma saiu de "roda na máquina do dev contra Postgres local" para
**publicada, com banco gerenciado e um deploy funcionando**.

| | Antes | Agora |
|---|---|---|
| Banco | Postgres local (docker) | **Supabase** (PostgreSQL 17.6, us-west-2) |
| Deploy | nenhum | **Easypanel**, `hub/spbim-coordenacao` |
| Repositório | local, sem remote | `github.com/juliofarias91/coordenacao` |
| Auditer | app separado, deployado | **aposentado** — vive dentro da plataforma |
| Cliente | campo de texto em `projeto` | **entidade** (migration 0003) |
| Porta de entrada | `/painel` | **`/`** — home com pastas por cliente |

---

## O ambiente

**Local.** A máquina não tem Docker, psql nem Node global para o backend. O
Python 3.12 foi instalado hoje e a venv vive em `backend/.venv`.

```powershell
.\dev.ps1            # API :8000 + Vite :5173 com hot-reload — o de todo dia
.\dev.ps1 -Unico     # só :8000, servindo o build, igual à produção
.\dev.ps1 -Parar     # encerra as duas
```

Comandos do backend precisam do interpretador da venv pelo caminho absoluto
(`backend\.venv\Scripts\python.exe`) — o `Set-Location` nem sempre persiste
entre chamadas no PowerShell, e caminho relativo já falhou.

**Produção.** `hub/spbim-coordenacao` no Easypanel (187.77.48.26:3000), porta
**8000**, construído do `Dockerfile` da raiz. As variáveis estão no nível do
projeto `hub`. O Easypanel as passa como `--build-arg`, então **as senhas
aparecem no log de build** — vale rotacionar a senha do banco quando o
ambiente estabilizar.

**Supabase** (`pilyrmvxytuwoiwjxgdv`): o schema está na revisão **0003** e o
seed já rodou (org SPBIM, projeto CPQ11, cliente Microsoft).

---

## Três armadilhas que já custaram tempo hoje

**O host `db.<ref>.supabase.co` não serve.** Só publica registro AAAA, e o
IPv4 dedicado é add-on pago: de rede sem IPv6 o DNS resolve e o TCP nunca
fecha. O sintoma é um timeout na 5432 que parece firewall. Migration e
autenticação vão pelo **pooler em modo sessão** (`5432`, usuário
`postgres.<ref>`); a API vai pelo modo transação (`6543`).

**O dono das tabelas é `spbim_owner`, não `postgres`.** O banco foi preparado
por fora com um papel dedicado. O `postgres` era membro mas com
`inherit=false`, então tinha zero privilégios — o erro aparecia como
`permission denied for table organizacao` na conexão que deveria ser a mais
poderosa. Resolvido com `GRANT spbim_owner TO postgres WITH INHERIT TRUE, SET
TRUE` (aditivo: não trocou senha nem dono).

**O endpoint S3 é `<ref>.storage.supabase.co`**, com `.storage.` no meio — não
`<ref>.supabase.co`. Credenciais validadas contra o Storage real hoje.

---

## O que está pronto e verificado

```
backend    219 passed, 13 skipped   (suíte completa contra o Supabase, ~40min)
           os 13 skips são de storage; test_cadastro corrigido depois, 29/29
frontend   tsc + eslint limpos, build ok, bundle inicial 306 kB
```

- **Supabase**: banco, RLS validado pelos três testes de isolamento, papel de
  aplicação, `scripts/supabase_bootstrap.py` para repetir em outro ambiente.
- **Cliente como entidade**: migration 0003 com conversão dos textos, API
  completa, `GET /clientes/pastas` para a home, 8 testes.
- **Home** (`/`): KPIs e projetos em pastas por cliente, modos pastas/lista.
- **Shell**: usuário e Administração na topbar, Sair também no rodapé da
  sidebar, busca global (Ctrl+K), grupos da sidebar arrastáveis.
- **Auditer aposentado**: o motor vive em `frontend/src/lib/auditer/`.

---

## O que vem a seguir

A lista pedida, com o custo real de cada item. **Só tela** significa que o
backend já existe.

### Só tela — o backend já está pronto

1. ~~**Administração separada**~~ — **feito em 29/07**: aba de Clientes, e a
   visão geral passou a contar clientes.
2. ~~**Log de atividade**~~ — **feito em 29/07**, aba na Administração.
3. ~~**Notificações**~~ — **feito em 29/07**, central em `/notificacoes`.
4. ~~**Perfil separado, em sections**~~ — **feito em 31/07**, e a decisão foi
   NÃO adotar o `?s=` do VDCity: `/configuracoes/:secao` é rota de verdade, e a
   navegação entre as seções virou a **quarta área contextual** da sidebar
   (`ITENS_CONTA`). O critério que decidiu — se há contexto a perder ao trocar
   a barra — está no `CLAUDE.md`.
5. **Home em sections** — a home atual é uma tela só; o VDCity divide em
   seções navegáveis. **Continua aberto**, e agora com um precedente: quando
   virar seções, elas vão para a URL como em `/configuracoes`, não para uma
   query string.
6. ~~**Política de privacidade**~~ — **feito em 29/07**, rota pública
   `/privacidade`. **Falta preencher os campos entre colchetes (DPO, contato)
   e passar por revisão jurídica** — o texto é a descrição técnica correta do
   sistema, não um parecer.

### Precisa de backend novo

7. ~~**Lixeira**~~ — **feita** (migrations 0006 e 0007; o projeto entrou na
   0011, como nona entidade). `deleted_at`, policy de RLS por comando e
   `/lixeira` para restaurar. A armadilha que custou uma tarde — a policy de
   SELECT sendo aplicada à LINHA NOVA do UPDATE — está no `CLAUDE.md`.
8. ~~**Apontamento de erros do sistema**~~ — **feito** (migration 0005,
   `reporte_erro`, rotas em `api/v1/reportes.py`). A porta é a pílula
   `Apontar erro` na topbar, vizinha do sino. Não confundir com `Apontamento`,
   que é de auditoria de modelo.
9. **Personalização de navbar (pins)** — precisa persistir a escolha por
   usuário; hoje só a ordem da sidebar persiste, em `localStorage`. **Continua
   aberto**, e os pins do VDCity não foram trazidos junto do painel da conta.

### Decidido, mas ainda não implementado

10. ~~**Rotas por projeto**~~ — **feito em 29/07**, ver o topo.
11. ~~**Login/cadastro**~~ — **feito em 30/07** (migration 0010) e **ampliado em
    05/08** (migration 0016). `POST /usuarios/{id}/convite` gera o link de uso
    único, `/definir-senha/:token` é a tela pública, e `POST /auth/senha/esqueci`
    notifica os admins enquanto não houver SMTP.
    **O "só por convite do admin" caiu a pedido em 05/08**: entraram o cadastro
    de conta própria (`/cadastro`) e a entrada pelo Google. A contradição com
    "SSO autentica, não provisiona" foi resolvida por condição, não por exceção —
    quem se cadastra não cria organização e nasce no papel menos privilegiado.
    **Em 06/08 caíram as duas travas**, também a pedido: o código da organização
    e o interruptor `cadastro_aberto` (migrations 0016→0017). O cadastro pede
    nome, e-mail e senha; o destino é a organização mais antiga; e **a conta
    nasce sem vínculo de projeto** — quem vincula é quem coordena o projeto, e é
    aí que o controle de acesso passou a morar. Ver a seção "Acesso" do
    `CLAUDE.md`, inclusive para o risco que sobrou (um segundo tenant receberia
    contas no primeiro, em silêncio) e para o limite de tentativas, que virou a
    pendência mais afiada agora que a rota cria conta para quem pedir.

### Achado no caminho, e corrigido em 30/07

**`alembic upgrade head` num banco NOVO estava quebrado**, e era o caminho de
provisionar o ambiente produtivo — o único que ninguém repetia. A migration 0001
importava `app.models.TENANT_TABLES`, uma lista que CRESCE a cada tabela
multi-tenant que entra no sistema, e criava índice e policy para cada nome dela.
Três entraram depois da 0001: `cliente` (0003), `projeto_membro` (0004) e
`reporte_erro` (0005). O resultado era `CREATE INDEX ix_cliente_org_id ON
cliente` emitido oito mil caracteres de SQL antes do `CREATE TABLE cliente`. Num
banco já migrado nada acontecia, porque a 0001 não roda de novo.

A correção é uma lista local, `TABELAS_DESTA_REVISAO`, e a regra que fica é:
**uma migration descreve o schema NA REVISÃO DELA** e não importa estrutura que
muda depois. As três já criavam o próprio índice e a própria policy, então a
lista era duplicação pura.

### ~~Precisa de UMA decisão sua~~ — RESOLVIDA em 30/07 pelos próprios arquivos

Os controles de LOD 400 e 500 em `Bases/` têm **uma aba por área** (ADMN,
COLO1…COLO4, SITE, UTLS, GUAR), cada uma com o round e o percentual de cada
modelo. Não havia o que decidir: a auditoria de especificação é por área no
processo real. `POST /auditar` passou a abrir uma auditoria por área da
disciplina nesses dois recortes, e a matriz — que é a aba `LOD 500 - OVERVIEW`
deles — ganhou conteúdo. O texto abaixo fica como registro do que se decidiu e
por quê.

12. **As auditorias sem área e a matriz.** `abrir_auditoria` só grava `area`
    quando o chamador a informa, e nenhum caminho normal informa. Resultado:
    **4D, LOD300 e LOD350 mostram matriz vazia** pelo mesmo motivo que a geral
    mostrava — a célula é buscada por `(versao_id, area)` e a auditoria tem
    `area = NULL`. A geral saiu da matriz porque a pergunta dela é outra; para
    as outras três, as saídas são:

    - **(a) abrir uma auditoria por área da disciplina.** `areas_da_versao` já
      existe e a chave única `(versao_id, checklist, area)` já suporta. Uma
      disciplina com 4 áreas passa a ter 4 rounds de 4D — é mais granular e é
      como as planilhas de LOD 400/500 trabalham. Muda a contagem de rounds.
    - **(b) a matriz ganhar uma coluna "sem área"** para as auditorias de
      `area = NULL`. Menos invasivo, e honesto para os recortes que de fato não
      têm área — mas deixa uma coluna estranha ao lado das áreas reais.
    - **(c) esses três recortes saírem da matriz**, como a geral, e usarem o
      controle por modelo.

    Minha recomendação é **(c) para 4D/LOD300/LOD350 e (a) só para LOD400/500**:
    LOD é auditado por área na prática (é o que os arquivos mostram), 4D não.
    Não implementei nada disso — está fora do que você pediu, e cada opção muda
    a contagem de rounds ou a leitura do painel.

---

## Pendências operacionais

As quatro foram atacadas em 29/07. **Duas fecharam em código; duas dependem de
uma ação sua no painel** — não há como fazê-las daqui.

**Fechadas:**

- ~~**Migration no deploy**~~ — o `ENTRYPOINT` do `Dockerfile` da raiz agora
  roda `alembic upgrade head` antes de qualquer processo, para o `app` e para o
  `worker`. Falha aborta o container de propósito: subir a API contra um schema
  velho é pior do que não subir. Um `pg_advisory_lock` serializa os dois, que
  sobem juntos. (O `docker-compose.prod.yml` já tinha um serviço `migracao`
  dedicado — o buraco era só o caminho do Easypanel.)
- ~~**Readiness cego**~~ — `/health/ready` só olhava o banco, então a falta do
  Redis não aparecia em lugar nenhum. Agora relata **banco, fila e storage**.
  Responde 200 mesmo degradado, de propósito: sem fila tudo funciona menos o
  enfileiramento, e um 5xx faria o `HEALTHCHECK` derrubar a API inteira.
  **Alerte pelo campo `status`, não pelo código HTTP.**

**Ficam com você — precisam do painel:**

- **Redis**: continua não existindo no Easypanel. O que mudou é que agora a
  falta *aparece*: `/health/ready` diz `"fila": "indisponível"`. Roteiro em
  `docs/EASYPANEL.md` §3.
- **Bucket privado**: `backend/scripts/verificar_storage.py` troca "conferir no
  painel" por uma prova. `--canario` grava um objeto, tenta baixá-lo **sem
  credencial nenhuma** e exige uma recusa; apaga o objeto no fim e sai com
  código 1 se o bucket for público. **Rode antes do primeiro modelo real** —
  daqui não deu: o `.env` local aponta o S3 para o MinIO, e as chaves do
  Supabase vivem no Easypanel.
- **Senhas no log de build**: a causa é o Easypanel passar variáveis de
  **projeto** como `--build-arg`. O `Dockerfile` da raiz não declara `ARG`
  nenhum e não precisa de segredo para construir — então a correção é
  **declarar os segredos no Environment do SERVIÇO**, e rotacionar o que já
  circulou. Passo a passo em `docs/EASYPANEL.md` §6.

---

## Onde as coisas estão

| Assunto | Arquivo |
|---|---|
| Como o VDCity é aproveitado | `K:\SPBIM TECH\PLATAFORMAS\Plataforma vdcity\PLATAFORMA\vdcity` |
| Migração e armadilhas do Supabase | `docs/SUPABASE.md` |
| Deploy no Easypanel | `docs/EASYPANEL.md` |
| Runbook de produção | `docs/OPERACAO.md` |
| Linguagem visual (as seis regras) | `CLAUDE.md`, seção *Sistema visual* |
| Bootstrap de um Supabase novo | `backend/scripts/supabase_bootstrap.py` |
| Criar usuário / recuperar acesso | `backend/scripts/criar_usuario.py` |

**Sobre o VDCity:** não é copiar arquivo. Lá é JSX + Tailwind + Supabase direto
no navegador; aqui é TypeScript, classes semânticas sem Tailwind, e todo dado
passa pela API. Traz-se a estrutura e o comportamento, reescrevendo. Cuidado
com `pages/Projeto.jsx` (288 KB num arquivo só) e `AgendaSection.jsx` (121 KB):
são o que o `DESIGN_SYSTEM.md` de lá chama de dívida — pegue a ideia, não a
implementação.
