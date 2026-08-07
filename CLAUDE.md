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
- A **linguagem visual** está na seção "Sistema visual" deste arquivo — as seis regras, as escalas e a régua do esqueleto. **É a fonte, não um resumo:** o `ui-kit-export/` de onde ela veio foi removido em 30/07/2026 (ver a nota no fim daquela seção).

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

## Sistema visual

A linguagem visual veio do VDCity, e **esta seção é a fonte dela.** A marca é
SPBIM: o accent é o azul `#2547b0` / `#6e8cf2` e as quatro cores de
macrodisciplina não mudaram — o que veio de lá foi estrutura e régua, não cor.

O transplante foi feito **sem Tailwind**. As classes semânticas de sempre
(`.card`, `.btn`, `.pill`, `.seg`, `.chip`…) continuam valendo e as 25 telas
não foram tocadas: `src/styles/tokens.css` e `src/styles/app.css` é que expressam
a linguagem. Para mudar o visual de algo, mexa nesses dois — não espalhe estilo
pelas páginas.

**LEIA ESTAS REGRAS ANTES DE CRIAR OU AJUSTAR QUALQUER VISUAL** — tela nova,
componente novo, ou mexida num que já existe. Elas não são preferência de
estilo: cada uma foi paga com uma tela que ficou errada. Uma tela que as siga
"parece do sistema"; que as ignore, não.

**Antes das regras, a escolha estrutural: tela de trabalho × tela pontual.**
Toda tela nova cai numa das duas famílias, e o critério não é estético — é o
tipo de uso. *"É tela onde se passa o dia trabalhando, ou é config/formulário/
diálogo pontual?"*

- **Trabalho contínuo** (lista de modelos, matriz, painel, planilha): **sem
  moldura**. Bandas separadas por borda, largura cheia, altura da viewport. É o
  caso da maioria das telas daqui.
- **Pontual** (configuração, formulário, perfil, resumo): **card** — `.card` /
  `.editor`, com `--r-2xl` e `--sh-sm`.

Nenhuma das duas é dívida. O card só vira problema quando envolve uma tela de
trabalho contínuo: aí ele acrescenta uma moldura e um scroll a mais entre quem
coordena e o dado que ele veio ler.

**As seis regras:**

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
6. **Hover é TINTA, nunca fundo.** Nenhum elemento ganha cor de fundo por causa
   do cursor: passar o mouse escurece a tinta para `--ink`, e só. Vale para item
   de menu, linha de tabela, linha de lista, item de dropdown, botão neutro,
   pílula da topbar, resultado de busca. É a regra 1 levada ao limite — se
   *estar ativo*, que é permanente e informativo, não merece retângulo colorido,
   *estar sob o cursor* merece menos: dura meio segundo e o ponteiro já o
   anuncia. Numa tabela de trinta linhas, o retângulo que segue o mouse é o que
   mais se move na tela, competindo com o dado que se foi ali ler.
   Onde tinta não basta, o substituto é **borda** (`--line-2`), nunca fundo.
   Três exceções, e nenhuma é realce de cursor: `.btn.pri` escurece o próprio
   preenchimento, destrutivo fica vermelho translúcido (regra 2), e estado
   semântico está lá com ou sem mouse. O token `--hover-ink` foi retirado.

**A GAVETA é a terceira família, e ela tem regras próprias** (30/07/2026).
Painel da direita, `position: fixed`, largura FIXA (`--w-gaveta`, 400px), que
SOBREPÕE — é a regra 4 concretizada. Formulário pontual disparado de uma tela de
trabalho entra nela, não no meio da página. O componente é
`components/Gaveta.tsx`; o CSS, a seção GAVETA LATERAL do `app.css`. Cinco
decisões, e nenhuma é preferência:

- **Ela SOBREPÕE O CONTEÚDO, NÃO O CHROME** (05/08/2026, a pedido). Nasce em
  `top: var(--h-topbar)` e o véu começa em `left: var(--w-nav)` — topbar e
  trilho seguem clicáveis com ela aberta. Antes tomava a janela inteira, e para
  trocar de tela, ou só para ver em que projeto se estava, era preciso fechá-la.
  O véu não escurece o menu de propósito: escurecer sugere desligado, e ele não
  está.
  **O TOPO CAI NO `.pghead`, e não por sorte:** o `.pgsplit` começa na borda de
  baixo da topbar, então a gaveta nasce no mesmo nível do título da seção.
  **O cabeçalho dela foi de 56px para `--h-header` (48px)** junto: deixou de
  vizinhar a topbar e passou a vizinhar o header de seção, e é com o traço dele
  que o dela precisa linhar — a régua de esqueleto sendo respeitada, não uma
  medida solta.

- **Sem raio.** A escala de raio pressupõe uma superfície com quatro cantos
  dentro da tela; a gaveta encosta em três bordas, e arredondar só a esquerda
  produzia dois cantos meio-arredondados que não pertencem a degrau nenhum.
  Quem a separa do fundo é a borda e a sombra.
- **Sem botão Cancelar.** A gaveta já tem três saídas — o X, o clique fora e o
  Esc — e nenhuma grava nada. Um quarto caminho para "não fazer" ao lado do
  único caminho para "fazer" dá o mesmo peso visual a duas coisas de peso muito
  diferente.
- **A ação ocupa a largura inteira do rodapé**, que é o que sobra quando não há
  um segundo botão para dividir a linha.
- **Sem divisor no rodapé.** O `border-top` existia para separá-lo do corpo
  quando havia dois botões à direita e o resto da linha vazio; com o botão
  ocupando a linha, ele já se separa sozinho — a linha seria contorno sobre
  contorno. O rodapé continua FORA do corpo rolável: ação que exige rolar até o
  fim para existir some no instante em que o formulário cresce.

**Escalas — não invente um sexto degrau.** Raio: `--r-md` controle pequeno,
`--r-lg` input/botão, `--r-xl` card interno/popover, `--r-2xl` **card de página
e modal** (a superfície de página tem raio próprio, acima do dos controles).
Sombra: card `--sh-sm`, dropdown `--sh-md`, popover/dock `--sh-xl`, modal
`--sh-2xl`. Esqueleto: sidebar 240px ↔ 52px, topbar 56px, header de seção 48px,
barra interna 40px — a diferença 56↔48 é hierarquia proposital, chrome externo
acima de header de ferramenta. Movimento: **duas** curvas (`--dur`/`--ease`
domina; em dúvida é ela).

**Armadilhas deste transplante:**
- Realce de linha de tabela é **tinta** (regra 6): a linha escurece para
  `--ink`. Nunca zebra — zebra fixa uma cor que acerta em um tema e erra no
  outro — e, desde 29/07/2026, nunca fundo tampouco. Chegou a ser `--hover-ink`;
  o token não existe mais.
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
- **O painel da conta virou o do VDCity em forma, não em hover** (31/07/2026).
  Cabeçalho de identidade em três linhas (avatar de 40px, nome, login, papel),
  itens em **grupos** separados por um traço, e `--w-popover` como todos os
  outros popovers da barra — eram 248px, o único fora da régua, e o login não
  cabia numa linha. Duas divergências deliberadas do original: **o hover é
  tinta**, não `bg-muted` (regra 6 — se estar ativo não ganha retângulo, estar
  sob o cursor ganha menos), e **o `border-bottom` por item saiu**. Sete réguas
  de largura cheia davam ao divisor entre `Configurações` e `Lixeira` o mesmo
  peso do divisor entre coisas sem relação; agora ele separa BLOCOS. O papel
  deixou de ser linha própria com pílula: é atributo de quem está no cabeçalho,
  e a pílula punha cor na primeira coisa que o painel mostra (regra 2). **Não
  entraram** os itens do VDCity que aqui não têm função — Novidades, Ajuda,
  Silenciar, pins — nem `Tema`, que por decisão de 30/07/2026 vive em
  `Configurações › Preferências`.
- **`Apontar erro` é pílula PRÓPRIA na topbar** (31/07/2026, a pedido), vizinha
  do sino: um traz o que o sistema tem a dizer, o outro leva o que se tem a
  dizer sobre ele. Dentro do menu da conta custava dois cliques, e o primeiro
  era em "minha conta" — o lugar de quem vai trocar de senha, não de quem
  acabou de esbarrar num defeito. O componente é `components/ApontarErro.tsx`,
  agora botão **e** painel, no arranjo do `Sino`. **Ele não fecha por clique
  fora nem por Esc**, ao contrário do sino e do menu: tem texto digitado, e os
  dois gestos custariam o relato inteiro. Armadilha paga junto:
  `.app[data-nav='off'] .side-painel` valia com três classes de especificidade
  contra uma e vencia o `left: auto` do `.erro-painel`, esmagando-o na largura
  da pílula com a barra recolhida — a regra foi escopada em `.side-acao`, que é
  o único lugar de onde ela nasceu.
- A sidebar nasce **expandida**, ao contrário do padrão do kit — mas agora
  recolher **devolve espaço de verdade**, e a razão original caiu: `main` já
  foi limitado a 1180px e centrado, e desde 29/07/2026 usa a **largura cheia**
  com `--pad-x` de margem lateral (o mesmo da topbar). As telas daqui são
  tabela, matriz modelo × área e grade de projetos: largura é informação, não
  sobra. A exceção é **prosa**, e continua limitada de propósito: a política de
  privacidade (`.doc`) a 760px. Medida de leitura não é medida de layout — um
  parágrafo a 1800px atravessa a tela e o olho perde o começo da linha seguinte.

**PÁGINA NÃO TEM TÍTULO NEM SUBTÍTULO** (30/07/2026, a pedido). O `Cabecalho` de
`components/ui.tsx` e o bloco `.top` (`h1` + `.sub`) saíram das 20 telas que os
tinham: o `h1` repetia o breadcrumb da topbar, que fica poucos pixels acima e na
mesma margem — `--pad-x` é o mesmo nos dois justamente para eles se alinharem —,
e o par consumia ~90px do alto de toda página antes do primeiro dado. Quem nomeia
a tela agora é o breadcrumb, e só ele.

- **Tela nova não ganha `<h1>`.** O `main` já começa com 26px de respiro; a
  primeira coisa da página é o dado, o filtro ou a barra de ferramentas dela.
- **O que precisar ser explicado vira `.hint` JUNTO DO DADO que ele explica**,
  não parágrafo no topo. Alguns `sub` eram o único lugar onde uma regra do
  produto estava escrita — "tudo gerado a partir das auditorias, não há onde
  digitar estes números", em Modelos, era um deles. Instrução longe do que
  explica não é lida; se algum precisar voltar, volta ao lado do número.
- **Caiu junto a indireção que existia só para dar título:**
  `pages/configuracao/paginas.tsx` (cinco invólucros) foi apagado e
  `pages/admin/paginas.tsx` ficou só com `PaginaGerenciarMembros`, que nunca foi
  cabeçalho — é a guarda de permissão de `/membros`, a porta que NÃO passa pelo
  componente `Admin`. As rotas apontam direto para as abas em `App.tsx`.

**O TEMA É ESCOLHÍVEL — aparência e cor de destaque** (30/07/2026, o sistema do
VDCity `services/theme.js` + `navbar-panels.jsx`). São duas preferências
independentes, as duas do NAVEGADOR e não da conta, e vivem em
`Configurações › Preferências` como AMOSTRAS, não `<select>`: cor não se escolhe
pelo nome — "Petróleo" e "Menta" não dizem nada até se ver os dois lado a lado.

- **Aparência: claro · escuro · AUTO.** `auto` segue o sistema operacional, e é
  por causa dele que existem DOIS valores no contexto: `modo` é a escolha (o que
  se guarda) e `theme` é o que está valendo agora. Guardar só o resolvido, como
  se fazia antes, perde a escolha — quem pediu "auto" às 10h viraria "claro"
  para sempre. A chave `spbim_theme` é a mesma de antes de propósito: 'light' e
  'dark' continuam modos válidos, e ninguém perde a preferência.
- **Cor de destaque: dez amostras** (`theme/cores.ts`), a paleta do VDCity com
  o azul da SPBIM em primeiro como default e o "Royal" fora — três azuis quase
  iguais numa fileira de dez viram uma escolha que não se consegue fazer.
- **O DEFAULT NÃO É CALCULADO.** Escolher SPBIM APAGA as propriedades inline e
  devolve o controle ao `tokens.css`: o par #2547b0/#6e8cf2 foi validado à mão
  para os dois temas, e recalculá-lo por fórmula só o afastaria do que já se
  conferiu.
- **A escolha reescreve os CINCO membros da família `--accent*`, e por tema.** O
  VDCity escreve um `--primary` e pronto; aqui `--accent-hover` anda em direções
  opostas nos dois temas e `--accent-ink` depende da luminância da cor escolhida
  — escrever só `--accent` deixaria o hover do `.btn.pri` na cor antiga e texto
  branco sobre amarelo.
- **A luminosidade é ANCORADA** (`limitar`, em `cores.ts`): as amostras foram
  desenhadas para um fundo shadcn e vão de `l=41%` a `l=63%`; soltas, a menta
  some no escuro e o cinza some no claro. É a mesma ideia da banda de
  luminosidade da paleta de macrodisciplina.
- **`--macro-A..S` NÃO seguem o accent**, ainda que `--macro-A` seja o mesmo hex.
  Aquela é paleta categórica validada (banda de luminosidade, piso de saturação,
  daltonismo); amarrá-la à preferência de cor de alguém quebraria os gráficos.
- **A cor aplica em `useLayoutEffect`, não no script do `index.html`.** O script
  inline cuida só da APARÊNCIA, que precisa valer antes de o React carregar para
  a tela não piscar branca. Duplicar a derivação de cor lá criaria duas fórmulas
  para divergir; o `useLayoutEffect` roda antes da pintura e resolve sem isso.

**O `ui-kit-export/` saiu em 30/07/2026.** Ele eram vinte arquivos JSX com
Tailwind, um `tailwind.config.js` e um `tokens.css` — e **nenhuma linha de
código o importava**: as classes semânticas daqui já expressavam a linguagem
inteira. O que ele tinha de próprio eram as regras em prosa, com exemplos em
classes Tailwind (`text-foreground font-semibold`, `bg-*/10`) que não existem
neste projeto. As regras estão acima, no vocabulário daqui; o kit era o
andaime. Recuperável no histórico: `git log -- ui-kit-export/`.

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

Recuperável no histórico deste repositório: `git log -- auditer/`, e o conteúdo
de qualquer arquivo com `git show <commit>:auditer/<caminho>`. O histórico git
original e o zip de backup ficavam em `referencias/` e **foram apagados em
30/07/2026** — eles guardavam a proveniência (autoria e evolução do app antes de
ser trazido), não código, e o código está aqui.

Uma diferença de comportamento ficou, e é de propósito: o Auditer rodava sem
login e a aba equivalente exige autenticação. Quem auditava pasta sem ter
conta na plataforma passa a precisar de uma.

## Acesso: login, usuários e senha (30/07/2026)

**A PORTA DEIXOU DE SER SÓ O CONVITE** (05/08/2026, a pedido): entraram o
cadastro de conta própria (`/cadastro`) e a entrada pelo Google. Isto REVERTE
"o acesso é só por convite do admin", que estava escrito aqui e em três outros
lugares — mas a reversão é condicionada, e as condições são o recurso. O porquê
longo está em `services/cadastro_aberto.py`; o resumo:

**O CÓDIGO DA ORGANIZAÇÃO SAIU EM 06/08/2026, a pedido.** Ele durou um dia: era
um campo obrigatório com o slug do tenant, e era o que dizia onde a conta
nascia. Saiu porque ninguém ia usá-lo — e um campo obrigatório cuja resposta
quem chega não tem trava o formulário na primeira linha. `POST /auth/cadastro`
recebe **nome, e-mail e senha, e nada mais**; `oidc_login` voltou a carregar só
o verifier no `state`.

**O INTERRUPTOR SAIU NO MESMO DIA (migration 0017, a pedido).** Ele existiu entre
a 0016 e a 0017 e nascia DESLIGADO — o que fazia `POST /auth/cadastro` responder
*"peça um convite a quem administra"* a quem ERA quem administra. **Hoje não há
trava nenhuma:** quem quiser cria a conta e entra.

- **O DESTINO É A ORGANIZAÇÃO MAIS ANTIGA** (`organizacao_do_cadastro`), e o
  `ORDER BY created_at` não é enfeite. As duas alternativas óbvias quebram no
  banco real: "a única que existir" recusaria tudo enquanto houver a segunda
  linha lá (`org-2347b538`, resíduo de teste de 30/07), e "a primeira que vier"
  cairia dentro dela em parte das execuções — SELECT sem ordenação não promete
  ordem. A mais antiga acerta porque a primeira organização provisionada é a da
  própria SPBIM.
- ⚠ **RISCO CONHECIDO, e é o preço do que se pediu:** com um SEGUNDO tenant de
  verdade, toda conta criada por conta própria continuará nascendo no primeiro,
  em silêncio. Não sobrou nada na requisição que diga outro destino. Cadastro por
  tenant exigiria um sinal novo (subdomínio, ou o código de volta), e é decisão
  de produto.
- **Não existe organização padrão em `.env`**, e não deve passar a existir:
  seria uma segunda fonte de verdade para a mesma decisão.
- **O cadastro NÃO cria organização.** Criar tenant continua sendo
  provisionamento e continua saindo do seed — se uma rota pública pudesse criar,
  nada impediria mil deles.
- **O QUE CONTROLA O ACESSO AGORA É O VÍNCULO DE PROJETO**, não a porta — e isso
  passou a ser verdade só em 06/08/2026, ver logo abaixo. É onde apertar se um
  dia o cadastro aberto incomodar, junto com `PAPEL_DE_ENTRADA`. Não reponha um
  interruptor por tenant.

**O VÍNCULO DE PROJETO PASSOU A LIMITAR O QUE SE ENXERGA** (06/08/2026, a
pedido). Isto **corrige uma afirmação que eu fiz errado**: cheguei a escrever que
uma conta recém-criada "não alcança modelo, auditoria nem relatório enquanto
ninguém a vincular", e era falso — `ver_painel` sozinho listava TODO projeto da
organização. Foi o que fez uma conta nova entrar e encontrar o CPQ11 na home.

- **`exigir_projeto_do_usuario` e `projetos_visiveis`**, em `services/escopo.py`,
  são o ponto único. Quem tem `admin_cadastro` vê tudo — é quem cria projeto e
  vincula gente, e precisa enxergar o que ainda não tem ninguém dentro.
- **ISTO NÃO CONTRADIZ `test_participacao_nao_e_permissao`**, e a distinção é a
  decisão: vínculo **LIMITA alcance** e **nunca concede poder**. Ser coordenador
  em `projeto_membro` continua não valendo `admin_cadastro`. As duas regras
  apontam em direções opostas e por isso convivem — "o que posso fazer?" é
  permissão, "sobre quais projetos?" é vínculo.
- **A LISTA E AS SUB-ROTAS, não só a lista.** Filtrar só `GET /projetos` seria
  esconder: o id vai na URL e `/projetos/<id>/painel` abriria do mesmo jeito. A
  guarda entra nas 12 chamadas cuja permissão não é `admin_cadastro`; as que já
  exigem essa permissão não precisam, porque ela ignora o vínculo.
- **404, nunca 403**, como o resto de `escopo.py`: "proibido" confirmaria que o
  projeto existe a quem só tem o id.
- **`portal.py` ficou de fora de propósito** — é autenticado por token do
  cliente, não tem `CurrentUser`, e continua usando `exigir_projeto`.
- ⚠ **Consequência para papéis não-admin:** auditor e revisor sem vínculo passam
  a não ver projeto nenhum. Hoje isso não regride nada (todas as contas do banco,
  menos as de leitor, têm `admin_cadastro`), mas conta nova de auditor exige
  vincular antes de ela ver qualquer coisa.

**A ENGRENAGEM DE MEMBROS SÓ APARECE PARA `admin_cadastro`**
(`components/TabelaMembros.tsx`). A gaveta dela edita papel, equipe e os
interruptores de `PaginasVisiveis` — que decidem QUE TELAS a outra pessoa vê. Um
visualizador recém-cadastrado a via em toda linha. A API já recusava (403), mas
botão que só sabe falhar anuncia um poder que não existe; a coluna "Ações" some
junto, e o `AdicionarMembro` também. **Isto é esconder, não proteger** — quem
protege é o `requer_permissao` de cada rota.
- **A CONTA NASCE SEM VÍNCULO DE PROJETO** (06/08/2026, a pedido): quem liga a
  pessoa a um projeto é o gerente dele, em `projeto_membro`. Cadastrar-se
  responde "esta pessoa existe na organização"; o vínculo responde "esta pessoa
  trabalha neste projeto". O atalho tentador — pôr a conta nova em todos os
  projetos, ou no primeiro, para ela "já ver alguma coisa" — daria a um
  desconhecido os modelos e as auditorias de um cliente real. Home vazia é o
  certo, e o subtítulo da tela de cadastro avisa que ela vem.
  `test_conta_nova_nao_entra_em_projeto_nenhum` tranca isso.
- **A conta nasce LEITOR**, o papel menos privilegiado, com `permissoes` VAZIA
  (que significa "usa o padrão do papel", e é o que a faz acompanhar uma
  promoção). Sem trava alguma antes dela, este é o PRIMEIRO limite que existe
  entre um desconhecido e a plataforma — não o segundo.
- **O SSO passa pelo MESMO módulo, e agora sem condição nenhuma.**
  `oidc_callback` chama `organizacao_do_cadastro` como a rota de cadastro chama.
  Consequência a encarar de frente: **qualquer conta Google do mundo vira uma
  conta de leitor aqui.** O que limita o estrago é o papel de entrada e a
  ausência de vínculo de projeto.
- **ENTRAR E CADASTRAR PELO PROVEDOR SÃO O MESMO PEDIDO**, e não há como
  separá-los: os dois botões mandam a mesma requisição e nada no `state` diz de
  qual tela o clique veio. Separá-los exigiria inventar um sinal para viajar
  assinado ali — ou seja, repor o que saiu.

**O `OIDC_REDIRECT_URI` APONTA PARA A TELA (`/entrar/sso`), NÃO PARA A API.**
Quem chega ao redirect é o NAVEGADOR, e `GET /auth/oidc/callback` responde JSON —
apontá-lo para a API mostrava uma página de JSON cru no fim do login.
`pages/RetornoSSO.tsx` lê o `code` e faz a chamada ela mesma; o `useRef` ali é
contra o StrictMode gastar o `code`, que é de uso único. **Entrar com o Google é
só configuração** (`.env.example` tem o passo a passo): o cliente OIDC é genérico
desde a Fase 0, e quem descobre o nome do provedor é `GET /auth/config`, a partir
do `OIDC_ISSUER`. Escrever "Google" no React obrigaria a mexer em código no dia
em que a decisão aberta nº 2 for resolvida a favor da Autodesk.

**A SENHA GANHOU COMPOSIÇÃO** (05/08/2026): além dos 10 caracteres, letra,
número e caractere especial. `SENHA_MINIMA` **não mudou** — o print de referência
pedia 8, e baixar o mínimo para ganhar composição troca uma proteção por outra.
- **A regra é UM validador (`validar_senha`), não quatro `Field`**, e diz tudo o
  que falta de uma vez. Levantar no primeiro faria quem digitou dez letras
  acrescentar um número, reenviar, e só então descobrir que falta um especial.
- **Ela vale na ESCRITA, nunca na leitura.** Nenhuma senha gravada é reconferida:
  conferir no login trancaria de uma vez toda conta anterior à regra, numa tela
  que não tem como explicar o que houve. `test_senha_de_antes_da_regra_continua_entrando`
  tranca isso.
- **`[^\W\d_]` e não `[a-z]`** para "letra": quem escolhe senha em português
  escolhe com acento, e `[a-z]` recusaria uma senha cuja única letra fosse `ã`.
- **O checklist ao vivo (`auth/RequisitosSenha.tsx`) é o retorno**, e substituiu
  a prosa que contava a regra uma vez e a conferia depois de enviar. **O verde
  entra só no item CUMPRIDO** — o pendente é `--ink-3`, nunca vermelho: vermelho
  nos quatro faria toda senha começar como quatro erros, e um campo que ninguém
  tocou não errou nada.
- As duas cópias da regra são trancadas por
  `test_composicao_da_senha_igual_no_front_e_no_back`, que compara as EXPRESSÕES
  e não os rótulos.

**Senha não se digita para outra pessoa.** Dar acesso é
`POST /usuarios/{id}/convite` → link de uso único → a pessoa escolhe a própria em
`/definir-senha/:token`. O campo de senha no editor de usuários continua lá, mas
quem o usa fica sabendo a senha de quem recebe. Convite e redefinição são a mesma
tabela (`token_acesso`, migration 0010); o tipo sai de haver ou não `senha_hash`.

**Não reverta — o porquê longo está no arquivo citado:**

- **O token é guardado como SHA-256, nunca em claro** (`services/acesso.py`).
  Diferente de `ConviteCliente.token`, que fica em claro de propósito.
- **`usuario.sessoes_validas_apos` é a única revogação que existe.** Conferida
  **só no `/auth/refresh`**. Corta em: sair, redefinir por link, admin trocando a
  senha DE OUTRO. **Não** corta na troca da própria — a tela de Configurações
  promete que a sessão continua.
- **`ACCESS_TOKEN_MINUTES` é a janela de revogação, não preferência**: nada no
  caminho da requisição lê o banco, então desativar alguém só vale quando o
  access token expira.
- **É a SENHA que decide a organização** quando o e-mail existe em várias
  (`api/v1/auth.py::login`). O campo de organização no login só aparece no 409.
- **Trilha: o valor do campo sensível é mascarado, o ATO não** — `ATOS`, em
  `db/trilha.py`. **A ordem de `ATOS` importa.** Ação nova precisa entrar no
  `pattern` de `GET /trilha` **e** nos mapas de `pages/admin/Trilha.tsx`.
- **`SENHA_MINIMA` é duplicado entre back e front de propósito** (a tela de
  definir senha é pública e valida offline). Quem tranca é
  `test_contrato.py::test_minimo_de_senha_igual_no_front_e_no_back`, que LÊ o
  arquivo TypeScript.
- **O `detail` de um 422 é uma lista de OBJETOS**, não de strings — `String(item)`
  dava `[object Object]` na tela. `linhaDeValidacao`, em `lib/api.ts`, traduz.
- **`POST /auth/senha/esqueci` responde 202 sempre**, exista a conta ou não, e
  tem janela por usuário (`INTERVALO_ENTRE_PEDIDOS`). É rota pública: confirmar
  a existência a transformaria em lista de usuários.
- **`sub` vazio no OIDC é RECUSADO.** `oidc_sub == None` virava `IS NULL` no SQL
  e casava com todo usuário sem SSO — entregaria a sessão de outra pessoa.
  `_um_por_identidade` existe para o mesmo callback não dar 500.

**Três superfícies, e elas não se misturam** — a régua está na seção
AUTENTICAÇÃO do `app.css`, com o porquê de cada valor:

- **`.auth`** (login, cadastro, definir-senha, retorno do SSO) — escura SEMPRE,
  com glows de accent. **É a única tela onde a regra 2 cede**, porque é a única
  sem dado com que a cor possa competir e sem tema a seguir. Não leve a
  permissão para outra tela. A paleta é local ao seletor, e é isso que faz
  `.f`/`.btn`/`.hint` valerem lá dentro sem estilo próprio.
  **A cor cede DUAS vezes ali, e a segunda é o "G" do Google** (`auth/BotaoSSO`):
  quatro cores que não são estado nem decoração, e sim MARCA — redesenhá-lo em
  `currentColor` para "respeitar o sistema" produziria um G cinza que não é o do
  Google e que as diretrizes do provedor não permitem. Provedor desconhecido cai
  num cadeado neutro, que é quando não há marca a respeitar.
  **`.auth-sso` usa a superfície dos CAMPOS, não a de um `.btn`**: opaco, ele
  recortaria um retângulo sólido sobre o glow bem no meio de dois campos
  translúcidos que o deixam passar.
- **`.telacheia` + `.avisocard`** — segue o tema. É o "Carregando…" da
  reidratação (aparece para quem JÁ entrou; escuro piscaria preto) e os estados
  do portal do cliente. Chamavam-se `.login*`, nome que mentia.
- **`.auth a` existe porque não há regra global de `a`.** Dívida conhecida: os
  `<Link>` dentro de `.hint` no resto do app ainda renderizam no azul do
  navegador.

**Do VDCity não veio:** a marca gráfica (o tetraedro é deles; aqui não há símbolo
até haver logotipo) e o MFA/TOTP. **O cadastro aberto e o login social estavam
nesta lista e saíram dela em 05/08/2026, a pedido** — ver o topo desta seção
para as condições que a reversão manteve.

**Sem SMTP, a entrega é o link copiado pelo admin.** `POST /auth/senha/esqueci`
cria o token e notifica os admins pelo PAPEL (`NotifTipo.ACESSO`), para o pedido
não morrer nas férias de um admin específico. Quando houver servidor de e-mail, o
canal entra em `esqueci_a_senha` e o resto não muda.

**Ainda não existe, e é decisão em aberto:** limite de tentativas no login
(cada tentativa paga um Argon2, então é vetor de DoS além de brute force),
registro de falha de login, e exigir a senha atual ao trocar a própria.
**O LIMITE NO CADASTRO É A PENDÊNCIA MAIS AFIADA DA LISTA** (06/08/2026).
`POST /auth/cadastro` é público e não tem limite, pela mesma razão que o login
não tem — mas a razão mudou de peso. Enquanto houve interruptor (migrations 0016
a 0017), a rota respondia 404 rápido em toda organização e quase não tinha
superfície; agora ela CRIA CONTA para quem pedir, e um laço trivial enche a
tabela `usuario` do tenant. **Confirmação de e-mail também não existe** — sem
SMTP não há como enviá-la, e é por isso que o cadastro devolve sessão em vez de
mandar confirmar; junto do cadastro sem trava, isso significa que **nada prova
que quem se cadastrou é dono do e-mail que digitou**.

## Importação de planilha — PONTE PROVISÓRIA (30/07/2026)

**Isto é dívida assumida, com prazo e com nome.** Foi feito sob pressa, para uma
apresentação, e existe para haver número na tela a partir das planilhas que a
coordenação já preenche à mão. **Não passa pelo caminho de auditoria da
plataforma** (`criterio` → `checklist_item` → `auditoria` → `resultado_check`) e
não deve passar a passar aos poucos: ou some, ou é substituído por uma
importação que crie auditoria de verdade.

Onde mora, para sair inteiro num `grep`: migration `0012`, tabelas
`importacao_planilha`/`importacao_item`, `models/importacao.py`,
`services/importacao_planilha.py`, `api/v1/importacao.py`,
`schemas/importacao.py`, `pages/Importacao.tsx`, CSS com prefixo `imp-`,
`api.importacao` e a rota `/importacao`.

**Por que numa tabela à parte, e não dentro de `auditoria`:** o caminho certo
exige disciplina, modelo, versão, round e critério cadastrados, e casar item a
item com os critérios do projeto — trabalho de dias. Fazer isso *dentro* das
tabelas de auditoria criaria linhas que **parecem** auditoria de verdade sem ter
passado por round nem publicação, e a dívida ficaria invisível. Com "importacao"
no nome da tabela, ela fica à vista.

**O que as 14 planilhas reais ensinaram — não reverta:**

- **A aba de LOD 300 tem SEIS layouts de coluna diferentes.** `VERIFICATION`
  aparece na coluna 9, 11 ou 12; `INFORMATION` existe em seis arquivos e falta
  em dois (lá o nome do item está em `REVIT PARAMETER`). **Nada é lido por
  índice fixo** — tudo passa por `_mapa_de_colunas`, que casa por RÓTULO. A aba
  `BASE GERAL`, essa sim, é estável.
- **A porcentagem escrita na planilha está errada, e há prova.** A aba STRC
  declara 30%; a fórmula dela é `=COUNTIF(I6:I33, TRUE)/COUNTA(I6:I65)` — alguém
  acrescentou linhas e arrastou só metade da conta. O certo é 60%. Por isso a
  aprovação é **sempre recontada** a partir das linhas, e a declarada fica ao
  lado para a tela mostrar a divergência. É o argumento do produto numa célula:
  a planilha não erra a auditoria, erra a CONTA sobre ela.
  `test_geral_reconta_em_vez_de_confiar_na_planilha` tranca isso.
- **A disciplina sai do NOME DO ARQUIVO, não da célula.** A célula do arquivo de
  MECH diz "FPRT-FPRT-DATA" — cópia que ficou pela metade. O nome do arquivo
  está certo nos catorze.
- **"NOT APPROVED" contém "APPROVED".** Uma comparação por substring na ordem
  errada aprova a planilha inteira, e o número sai bonito e falso.
- **A média é PONDERADA pelos itens**, não a média das porcentagens: uma
  planilha de LOD 300 tem 191 linhas e outra tem 54.
- **Reimportar SUBSTITUI** (projeto+tipo+disciplina). Sem isso a média conta o
  mesmo modelo duas vezes e anda sozinha a cada upload repetido.
- **O upload é tolerante a falha parcial.** São catorze arquivos: um 400 por
  causa do décimo obrigaria a descobrir qual e refazer o lote.
- **`projeto_id` é NULO PERMITIDO.** As planilhas do DANTE 2 dizem
  `CPQ04-ARCH-R26`, nome do projeto anterior. Exigir o vínculo travaria a
  importação no erro de digitação deles.

## Estado atual

**As seis fases do roadmap estão implementadas.** Ver `README.md` para como rodar e para as decisões de arquitetura, `docs/OPERACAO.md` para o runbook de produção e `docs/PILOTO.md` para o roteiro do piloto assistido.

**A plataforma é uma aplicação só.** `backend/` e `frontend/` são divisão de
código-fonte, não de produto: o `Dockerfile` da raiz compila o React dentro da
imagem da API, que o serve na mesma porta (`app/spa.py` liga isso ao encontrar
`backend/static/`). Para desenvolver, **`npm run dev`** — `dev:unico` roda só a
:8000 servindo o build, que é o arranjo de produção, `dev:web` sobe só o Vite
contra a API já publicada (`API_REMOTA` no `.env`) e `parar` encerra.

**`scripts/dev.mjs` é a fonte de verdade de como a plataforma sobe**, e o
`dev.ps1` virou casca que o chama. O PowerShell abria a API numa JANELA
SEPARADA (`Start-Process -NoExit`): cada execução deixava um terminal novo, e
fechar a sessão deixava a janela órfã ouvindo na 8000. Em Node os dois processos
são filhos do mesmo terminal, com a saída prefixada, e o `Ctrl+C` derruba a
árvore inteira. A casca fica porque `.\dev.ps1` está na memória muscular de quem
já usava o projeto — duas implementações divergiriam na primeira mudança de
porta.

**Máquina nova: `npm run setup`** (`scripts/setup.mjs`) — confere Python 3.12 e
Node 20+, cria a venv, instala os dois lados e gera o `.env` com um JWT_SECRET
sorteado. **Ele NÃO sobe banco nem roda migration, de propósito:** escolher onde
os dados moram é decisão de quem senta na máquina, e um script que decide isso
sozinho é como se acaba apontando a máquina nova para o banco do piloto. Ele
também **não toca num `.env` que já exista** — sobrescrever derrubaria todas as
sessões abertas.

## Duas pessoas no repositório (01/08/2026)

O guia inteiro está em **`docs/COLABORACAO.md`** — acesso, máquina nova, o fluxo
de ramo → pull request → merge, e a alternativa sem GitHub (um `--bare` numa
pasta de rede serve de central; git não precisa de internet). Aqui ficam só as
duas decisões que valem para quem mexe no código:

- **A SUÍTE RECUSA UM BANCO QUE NÃO SEJA LOCAL** (`backend/tests/conftest.py`).
  Ela cria e apaga dado de verdade, e a limpeza é pulada quando uma asserção
  falha no meio — foi assim que dez organizações de teste sobraram no banco do
  piloto em 28–29/07, ao lado do CPQ11. A trava é por **HOST**, e não por
  `APP_ENV`: quem aponta o `.env` para o Supabase e roda a suíte não pensou
  "estou em produção", pensou "vou rodar os testes", e é aí que a proteção
  precisa agir. A saída existe e é explícita — `PYTEST_BANCO_REMOTO=1` —, porque
  há motivo legítimo para ela (conferir uma migration contra o Postgres 17 do
  Supabase antes do deploy); ela só deixou de ser o caminho padrão.
- **CADA PESSOA TEM CÓPIA PRÓPRIA DO CÓDIGO, no disco local.** A pasta de
  trabalho do git guarda o ramo atual e o que ainda não foi gravado: duas pessoas
  na mesma pasta são duas pessoas com um estado só. Some-se a isso que
  `backend/.venv` guarda caminhos absolutos e que `node_modules` na rede torna
  qualquer coisa lenta. O `K:` continua sendo o lugar dos arquivos de
  referência — planilhas, PDFs, modelos —, que não são código e não vão ao git.
- **A CONTA DO GITHUB É COMPARTILHADA (`inovacao@spbim.com`), o AUTOR DO COMMIT
  NÃO DEVE SER.** São coisas diferentes: a conta é a credencial que empurra, o
  autor é o que o `git blame` responde daqui a seis meses — e neste repositório
  "quem fez isto, e por quê?" é a pergunta que mais se faz. Cada máquina define
  o seu com `git config user.name/user.email` **sem `--global`**, e os commits
  saem com o nome de quem os escreveu mesmo indo pela conta comum.
  Consequência prática: na proteção do `main`, **não marcar "Require
  approvals"** — ninguém aprova o próprio pull request, e a conta única
  travaria todo merge. Ficam *require pull request* e *require status checks*,
  com o CI no papel de juiz.

- **Fase 0** — schema completo (23 tabelas, 12 enums), RLS multi-tenant, auth Argon2+JWT, OIDC/PKCE (desligado), Celery, shell React, CI.
- **Fase 1** — cadastro: projetos, empresas+contatos+subcontratação, usuários+permissões, standards+nomenclatura, disciplinas, critérios+checklists.
- **Fase 2** — execução: modelos e versões com upload para o S3, ingestão via webhook do ACC, auditoria com estados e publicação de round, não-conformidades, painel/matriz derivados e exports (PDF/XLSX).
- **Fase 3** — automação: validador de nomenclatura com penalidade e notificação, motor de verificadores, auditoria 4D de parâmetros e de categorias em IFC (IfcOpenShell), extração de propriedades Revit (APS) e worker Celery com retry.
- **Fase 4** — colaboração: central de notificações, KPIs com gráficos, placar de conformidade por fornecedor, apontamentos, portal do cliente com visibilidade por campo e trilha de auditoria automática.

- **Fase 5** — piloto: imagens e compose de produção, guarda que recusa segredo de desenvolvimento, log em JSON, backup do banco e do bucket com restauração verificada, workflow de publicação e o importador de projeto por YAML.

- **Administração** (`/admin`, fora do roadmap original) — organização, projetos e usuários no nível do tenant. `GET/PATCH /organizacao` é a única rota nova; projetos e usuários já tinham API desde a Fase 1 e só não tinham tela: até aqui um projeto novo só nascia por `scripts/seed.py` ou pelo importador YAML. Aparece no menu só para quem tem `admin_cadastro`; a guarda real continua no `requer_permissao` de cada rota. **Não existe listagem nem criação de organização** de propósito — listar é o que o isolamento multi-tenant impede, e criar é provisionamento, sai do seed.

135 rotas em `api/v1`; 331 funções de teste contra Postgres, MinIO e arquivos
IFC reais. **A suíte inteira leva ~1h** rodando contra o Supabase — o de todo
dia é rodar os arquivos que a mudança alcança.

**O que resta não é código:** subir o ambiente produtivo num servidor e rodar o piloto assistido. Se o usuário pedir "continue", pergunte o que ele quer — não há próxima fase para implementar sozinho.

Ao continuar:
- **A URL carrega o projeto**: toda tela de auditoria vive em
  `/projetos/:projetoId/<tela>` e o projeto corrente sai de lá, não do
  `localStorage` (que sobrou como memória do último visitado). Quem monta o
  caminho é `rotaProjeto()`, em `frontend/src/projeto/ProjetoContext.tsx`.
  Nunca escreva `/painel` à mão.
  **Um projeto abre em `kpis`** — `TELA_INICIAL`, no mesmo arquivo (31/07/2026, a
  pedido; era `modelos`). Quem abre um projeto vem perguntar COMO ELE ESTÁ, e a
  lista de modelos responde outra coisa: quais arquivos existem, que é a
  pergunta de quem já sabe o estado e vai trabalhar. É o **default** de
  `rotaProjeto`, e os quatro caminhos que abrem projeto — card da home, resultado
  de busca, troca de projeto no breadcrumb e a própria função — passaram a
  omitir o segundo argumento em vez de repetir a string. A **criação** é a
  exceção e continua indo para `ficha`: o projeto nasceu com código e nome, e o
  resto se preenche com ele aberto na frente.
- **A sidebar é contextual em TRÊS áreas** (`frontend/src/layout/nav.ts`):
  `ITENS_ADMIN` sob `/admin`, `ITENS_PROJETO` dentro de um projeto,
  `ITENS_GLOBAIS` no resto. Tela nova entra numa das três — na global se a API
  dela não recebe `projeto_id`, na de projeto se recebe. Errar isso foi o que
  deixou Apontamentos e Integrações no menu de projeto sendo que nenhuma das
  duas APIs é por projeto.
- **CADA RECORTE É UMA ENTRADA DA BARRA, com ícone próprio** (01/08/2026, a
  pedido): `Geral · 4D · LOD 300 · LOD 400 · LOD 500 · Relatórios · RNC`, no
  grupo Auditoria. **Isto reverte a decisão de 29/07** — e a volta não é um
  círculo, porque as duas queixas que motivaram juntá-los foram resolvidas de
  outro jeito: as nove linhas eram nove porque cada rótulo repetia a palavra
  *Auditoria* que já nomeia o grupo (agora são `ROTULO_CURTO`, em `nav.ts`), e
  "ler até o fim para escolher" acabou com o **ícone por recorte**.
  **OS TRÊS LOD USAM O PRÓPRIO NÚMERO** como ícone (`ICONE_CHECKLIST`, em
  `nav.ts`), e não uma metáfora. Eles chegaram a ter cubo, camadas e prédio; a
  objeção a números era que "300", "400" e "500" a 19px viram três borrões
  parecidos — mas a metáfora só resolve isso para quem já decorou qual desenho é
  qual, e a diferença entre os três recortes é EXATAMENTE o número. Ele se lê; o
  desenho se interpreta. O que o faz caber é ocupar a caixa inteira: o `<text>`
  do `Icone` usa `textLength`, e leva `stroke: none` — o `svg` declara `stroke`
  para as linhas dos ícones, e herdado pelo texto ele contornaria cada dígito
  com 1.8px, fechando os vãos do 0 e do 3. **Geral e 4D seguem com desenho:** os
  rótulos delas não são números, e escrever "GE" ali trocaria um símbolo por
  outro.
  Recorte novo entra primeiro em `CHECKLISTS_SEM_BANCO` (hoje vazio), que faz a
  tela dizer o que falta em vez de tomar um 422.
- **O painel de dentro da página CONTINUA, e perdeu o nível de cima.** Ele lista
  **disciplina › modelo** do recorte aberto (`pages/auditoria/index.tsx`), no
  formato dos canais do VDCity: 300px, dois cabeçalhos de 48px alinhados,
  recolher **desmonta**. Com os recortes na barra, o primeiro nível existiria em
  dois lugares ao mesmo tempo — e dois lugares que precisam concordar divergem.
  O cabeçalho do painel é **busca + "+"**: em 300px não cabem título, campo e
  botão, e o placeholder da busca faz o trabalho do rótulo.
  **O grupo de disciplina guarda os FECHADOS**, não os abertos: quem entrou num
  recorte quer ver o que há nele, e um padrão fechado exigiria um clique por
  disciplina só para chegar ao modelo, que é o destino. A busca casa com os
  **dois** níveis (nome da disciplina e código do modelo), porque quem procura
  não sabe em qual deles está o que quer. **Prioridade é PONTO, não pílula com
  texto**: a cor é estado semântico e pode entrar (regra 2), mas vinte pílulas
  coloridas em 300px viram o elemento mais pesado do painel e afundam o código do
  modelo, que é o que se lê. **E não há barra colorida de macrodisciplina** — ela
  repetia o que o nome por extenso da disciplina, uma linha acima, já dizia.
  A quem consome: `GET /projetos/{id}/auditorias` devolve o projeto inteiro com
  o modelo resolvido — sem isso a barra faria uma requisição por linha só para
  escrever um nome.
- **Trocar de projeto passou a manter o recorte.** `TELAS`, em
  `ProjetoContext`, é montada a partir das rotas do menu; com `auditoria` sendo
  uma entrada só, `auditoria/lod300` não estava lá e a troca caía na tela
  inicial. Agora cada recorte é uma rota do menu e sobrevive à troca — o que
  **não** sobrevive é `auditoria/<recorte>/<modeloId>`, e é o certo: o id do
  modelo pertence ao projeto de origem.

## O PLANO da auditoria: andamento e prioridade (0013)

A auditoria sempre soube ser executada; passou a poder ser **planejada**. A
gaveta `components/NovaAuditoria.tsx` grava tipo, modelo, responsável, as três
datas, andamento e prioridade.

**`andamento` NÃO é `estado`, e é a decisão central desta migration.** `estado`
(publicado / nao_publicado / desatualizado) é de PUBLICAÇÃO e ninguém o escolhe —
quem o move é o fluxo de round em `services/auditoria.py`. Se a gaveta
escrevesse nele, uma auditoria poderia **nascer publicada** sem round nenhum, e
publicar é o ato que congela o resultado para o fornecedor. Os dois convivem
porque respondem perguntas diferentes: "o fornecedor já pode ver?" e "alguém está
mexendo nisto?". `test_estado_continua_fora_do_alcance_do_plano` tranca isso.

**Não reverta:**
- **`TEXT` e não enum nativo**, nos dois campos — precedente de
  `apontamento.prioridade`. São vocabulário de PROCESSO, e processo de auditoria
  em obra muda mais do que schema; tirar valor de enum no Postgres exige recriar
  o tipo. Quem valida são os `Literal` de `schemas/auditoria.py`: validação na
  borda, que é onde dá para afrouxá-la sem `ALTER TYPE`.
- **O plano se aplica À AUDITORIA QUE JÁ EXISTIA.** `abrir_auditoria` é
  idempotente no round — repetir devolve a aberta em vez de duplicar. Sem
  `_aplicar_plano` alcançando a existente, quem preenchesse a gaveta para um par
  (modelo, checklist) já aberto receberia 201 e veria responsável e datas
  sumirem sem aviso. Abrir a gaveta de novo é REPLANEJAR, e replanejar grava.
- **Campo ausente é "não mexa"; `null` explícito apaga** (`exclude_unset`). Sem
  isso um PATCH de prioridade limparia o responsável.
- **Round publicado recusa `PATCH` (409)**, pela mesma regra de
  `_exigir_round_aberto`: o PDF já emitido nomeia o responsável e a data.
- **`entrega_estimada` existia desde a 0001 e nunca havia sido exposta** — a data
  planejada estava no banco e não chegava a tela nenhuma.
- **`POST /modelos/{id}/auditar` resolve a última versão por `created_at`**, não
  pelo nome: `versao` é Text, e 'V10' vem antes de 'V9' em ordem alfabética. A
  gaveta escolhe MODELO porque é como a coordenação pensa; a auditoria pertence a
  uma VERSÃO porque é ela que muda entre rounds. `/versoes/{id}/auditar` continua
  existindo para quem precisa apontar uma versão específica.
- **A configuração do projeto é uma PÁGINA COM ABAS, não uma área.** Chegou a
  ter sidebar própria e voltou às abas em 29/07/2026: as seções são o cadastro
  de um projeto, feito de uma vez e em sequência, e trocar a barra a cada seção
  fazia perder de vista em que projeto se estava — além de deixar a área
  indistinguível do painel administrativo. **São TRÊS áreas contextuais**
  (global, projeto, admin), não quatro; não existe `escopo: 'config'`.
- **A FICHA diz QUEM É a obra; a CONFIGURAÇÃO diz COMO ela é auditada.** A aba
  `Configuração › Projeto` foi removida em 30/07/2026 quando `pages/Ficha.tsx`
  entrou na barra: as duas editavam os mesmos cinco campos, e duas telas para o
  mesmo dado divergem na primeira mudança. A rota antiga redireciona.
  A ficha **salva no blur, campo por campo** — sem botão e sem rascunho, como
  as planilhas de auditoria. E é **card, não full-bleed**: preenche-se uma vez,
  então é tela pontual pela régua da seção "Sistema visual".
- **Projeto é REMOVÍVEL desde a migration 0011**, e é a nona entidade da
  lixeira. `DELETE /projetos/{id}` marca `deleted_at`; os filhos (disciplina,
  modelo, auditoria) **não são tocados** e voltam junto na restauração —
  marcá-los faria a restauração ter de adivinhar quais já estavam removidos
  antes, informação que não existe.
- **O layout de página dividida** (`.pgsplit`) é o padrão para navegação de
  SEGUNDO nível: quando a escolha é entre visões de uma mesma tela, ela vai
  num painel da página, não na barra do app. **O único uso é a auditoria.**
- **`Configurações` da conta é a QUARTA área contextual** (`ITENS_CONTA` em
  `nav.ts`, `escopo: 'conta'`, 31/07/2026, a pedido). Eram quatro `.editor`
  empilhados num rolo só — para trocar a senha passava-se por dados pessoais,
  idioma e dez amostras de cor, e o que se procurava estava sempre fora da tela.
  Chegou a virar `.pgsplit` e foi para a barra do app no mesmo dia.
  **A diferença que decide entre painel de página e área contextual não é
  estética, é se HÁ CONTEXTO A PERDER:** trocar a barra dentro de um projeto
  apaga da tela em que projeto se está, e é isso que mantém a configuração DO
  PROJETO como página com abas. Em `/configuracoes` não há projeto — quem entra
  saiu do trabalho para cuidar da conta, como quem entra em `/admin` —, então
  não sobra contexto para a barra apagar. Continua não existindo
  `escopo: 'config'`; o que passou a existir é `'conta'`.
  **A seção vai na URL** (`/configuracoes/seguranca`), que é o que a barra
  precisa para marcar o item ativo. Duas rotas em `App.tsx` e não um `:secao?`
  opcional — a forma sem seção é o que o menu da conta aponta e o que está no
  histórico de quem já usa; ela redireciona de dentro do componente.
  `SECOES_CONTA` é a fonte de quais existem e o `ehSecaoConta` valida `:secao`.
  **`pages/Configuracoes.tsx` não desenha navegação nenhuma** e **nenhuma seção
  repete o próprio nome num `h3`** — quem nomeia são a barra e o breadcrumb, a
  mesma razão que tirou o `h1` das vinte telas.
- **A GAVETA** (`components/Gaveta.tsx`) tem as regras dela na seção "Sistema
  visual". O que ela substituiu na home: o `.editor` inline do "+ Novo projeto"
  ficava entre a barra e a grade e empurrava os projetos para baixo — quem
  clicava com uma pasta aberta perdia de vista o cliente para o qual estava
  criando.
- **`--criar` é a cor da ação de CRIAR**, e existe como token para o accent não
  ir escorrendo para o próximo botão que alguém achar importante (regra 2). É
  **alias de `--accent`**, então segue o tema E a cor de destaque escolhida sem
  valor repetido para divergir. Quem o consome é o "+" da home (`.home-nova`),
  uma `.pillact` da regra 3: nasce redondo de 36px só com o ícone, e o rótulo
  cresce **para a direita** (na topbar cresce para a esquerda, porque lá o ícone
  está ancorado na borda). A superfície dele é a da **barra de busca** — branco
  `--panel`, contorno `--line`, cápsula, 36px: os dois ficam colados na mesma
  linha, e um com fundo translúcido colorido e o outro com contorno faria a
  linha parecer montada de peças de sistemas diferentes. No hover, borda
  (`--line-2`), nunca fundo, e o ícone NÃO perde o accent.
- **Criar um projeto exige `recarregar()` do `ProjetoContext` ANTES de
  navegar**, e com `await`. O provider lista os projetos uma vez, na montagem, e
  é a lista dele que responde "este id existe?" — sem isso a ficha abre em
  "Projeto não encontrado" para um projeto que acabou de nascer.

## Membros e disciplinas: a equipe e os nomes (0014 e 0015)

Duas migrations pequenas de 31/07, cada uma uma coluna, e as duas pelo mesmo
motivo: a tela mostrava um código onde a coordenação fala um nome.

**`projeto_membro.equipe` (0014) — COORDENAÇÃO, INOVAÇÃO, COMERCIAL.**

- **Equipe NÃO é `funcao`, e por isso é coluna nova.** `funcao` é o que a pessoa
  FAZ no projeto ("modelador", "auditor de estrutura"); equipe é a que GRUPO ela
  pertence. Um modelador e um auditor podem estar na mesma; e a mesma pessoa é
  COORDENAÇÃO num projeto e COMERCIAL noutro — que é por que a coluna fica em
  `projeto_membro`, não em `usuario`.
- **TEXT livre, sem tabela de equipes.** Uma tabela exigiria cadastrá-las antes
  de poder usá-las, e hoje ninguém sabe quais são. Quando o conjunto estabilizar
  e alguém precisar renomear uma equipe em todos os projetos de uma vez, ela
  vira entidade — e a migration que fizer isso terá os nomes reais.
- **A migration NÃO MEXE em `papel`, e `projeto_membro` continua sem
  autorizar.** O vocabulário de projeto (coordinator / user / viewer) é
  validação de borda, em `schemas/membro.py`, pela mesma razão de
  `auditoria.andamento`. Os três papéis de projeto (`PAPEIS_PROJETO`, em
  `components/TabelaMembros.tsx`) são valores que o enum JÁ TEM: um vocabulário
  novo obrigaria a manter um mapa entre os dois, e o mapa divergiria.
  `test_participacao_nao_e_permissao` continua trancando isso.
- **"Todos os membros" são as CONTAS, não a união dos vínculos** — e a distinção
  custou uma quebra. Numa primeira versão o recorte listava os vínculos de todos
  os projetos; como `projeto_membro` estava vazio, a tela que mostrava as pessoas
  da organização passou a mostrar nada, e junto foi embora o "+ Novo usuário",
  que a lista de contas é quem trazia. São duas perguntas: **quem existe**
  (contas, `AbaUsuarios`, a mesma tela de `/admin/usuarios`) e **quem está neste
  projeto** (vínculos). Por isso o "+" MUDA DE SIGNIFICADO com o recorte — em
  "Todos" criar é criar uma CONTA, dentro de um projeto é VINCULAR alguém que já
  tem uma; um botão só teria de perguntar qual antes de fazer qualquer coisa.
- **`MembroOut` resolve empresa, status da conta e projeto no servidor.** A tela
  lista pessoas, não ids, e sem isso ela cruzaria duas listas ou faria uma
  consulta por linha. O **status** vem de `usuario` de propósito: quem foi
  convidado e ainda não definiu senha aparece como pendente na lista do projeto,
  que é a informação que responde "por que essa pessoa não apareceu".

**`disciplina.nome` (0015) — o nome por extenso, e OPCIONAL.**

- A disciplina se identifica por `codigo` (`STRC-STEEL`), montado de `disc` +
  `sub`: é o que entra na nomenclatura do arquivo e é o que se digita — mas não
  é o que se FALA. Ninguém diz "abre o STRC-STEEL", diz "abre a estrutura
  metálica".
- **Ser opcional é o que mantém isso honesto.** O UNIQUE continua sobre
  `codigo`, a nomenclatura de arquivo não muda, e a tela mostra
  "Arquitetura (ARCH)" onde houver nome e "ARCH" onde não — sem inventar nada.
- **NÃO entrou coluna de cor junto.** A cor da disciplina já existe: vem de
  `macro` (A/C/M/S), e a paleta é categórica validada (banda de luminosidade,
  piso de saturação, daltonismo — ver "Ao criar gráfico"). Uma cor por
  disciplina daria duas fontes para a mesma informação e deixaria alguém
  escolher um tom que falha no escuro ou para um daltônico. A aba
  `Configuração › Cores` saiu porque a cor passou a ser mostrada AO LADO da
  disciplina, não porque virou editável.

## Auditoria geral: a planilha dentro do sistema

A planilha de referência é `<PROJETO> _ <DISC> _ AUDITORIA GERAL .xlsx`, aba
`BASE GERAL`: **17 itens, os mesmos em todas as oito disciplinas**, na mesma
ordem. O que varia entre os arquivos é a resposta, nunca a pergunta.

- **O gabarito dos 17 mora em `services/gabarito.py`, não no seed.** Lista
  idêntica em oito arquivos e estável entre projetos é padrão da empresa, e
  `scripts/dados/cpq11.yaml` é dado de EXEMPLO — que o usuário recusou importar
  no piloto. `POST /checklists/geral/gabarito` semeia os itens em qualquer
  projeto; o botão está em Biblioteca de critérios › Compor checklist.
- **`aplicar()` ACRESCENTA e nunca sobrescreve.** Achar o código é sinal de que
  o projeto já o tem, possivelmente ajustado à mão. A "melhoria" tentadora —
  sincronizar o texto de fábrica — apagaria trabalho calado, e
  `test_gabarito_nao_sobrescreve_ajuste_do_projeto` existe para que ligá-la seja
  uma decisão. É o "pré-definido e **modificável**" do pedido.
- **O UNIQUE `(projeto_id, codigo)` vale sobre a linha da lixeira.** Aplicar o
  gabarito num projeto que apagou um item morreria com "duplicate key"
  apontando para uma linha que a sessão jura não existir. `gabarito._removidos`
  liga o GUC para enxergá-la e responde 409 nomeando o código.
- **`resultado_check.direcao` (0008) é a coluna DIRECTION.** São DUAS frases com
  destinatários diferentes: `comentario` é o diagnóstico interno ("há elementos
  em fases diferentes"), `direcao` é a orientação ao fornecedor ("alinhe todos
  à mesma fase"). Antes só existia a primeira e a orientação vazava para dentro
  dela. A NC nasce das duas, **sem cruzar**: comentário → `descricao`, direção →
  `recomendacao`.
- **A auditoria geral nasce com a VERSÃO**, em `services/auditoria.py::
  ao_registrar_versao`, chamado pelas DUAS rotas que criam versão (a manual e o
  webhook do ACC). Só a geral: os recortes de LOD e o 4D são trabalho dirigido,
  e abrir os seis encheria o painel de rounds que ninguém abriu.
- **Cada recorte usa a tela que a sua PERGUNTA pede**, e a divisão é
  `CHECKLISTS_POR_AREA` em `services/auditoria.py`:
  - **geral e LOD 300** não têm área: um modelo por linha, que é o que o painel
    da esquerda lista sob a disciplina, e clicar nele abre a planilha. O
    componente `ControleGeral` — a aba `... - CONTROL` desenhada como tabela —
    saiu em 01/08/2026 junto das duas telas de planilha antigas: ele respondia
    "que modelos há", e o painel passou a responder isso em 300px, ao lado da
    planilha em vez de antes dela.
  - **LOD 400 e LOD 500** são POR ÁREA, e a matriz modelo × área é literalmente
    a aba `LOD 500 - OVERVIEW` deles. Desde 30/07/2026 `POST /auditar` abre
    **uma auditoria por área da disciplina** nesses dois; antes `area` só era
    gravada se o chamador a informasse, e ninguém informava — daí a matriz
    permanentemente vazia. Quem resolveu a dúvida foram os arquivos: os
    controles de 400 e 500 em `Bases/` têm uma aba por área.
  - **O LOD 350 não existe mais na navegação** (30/07/2026): não há arquivo de
    referência dele em projeto nenhum. O valor continua no enum do banco —
    tirar valor de enum no Postgres exige recriar o tipo e trava se houver
    linha usando.
- **A CÉLULA SALVA NA HORA** (01/08/2026, a pedido). Não há botão "salvar
  planilha", porque não há rascunho — cada célula é um PATCH e a aprovação volta
  recalculada do servidor. A tela **nunca** calcula percentual: duas contas de
  aprovação divergem no primeiro arredondamento.
  **SEM ESPERA E SEM UM PEDIDO POR LETRA**, e é a COALESCÊNCIA que permite as
  duas coisas ao mesmo tempo (`CampoTexto`, em `components/GradePlanilha.tsx`): a
  primeira tecla dispara o PATCH imediatamente, e o que se digita enquanto ele
  está no ar não vira pedido novo — fica guardado como "o último valor" e sai
  quando o anterior responde. Uma frase de 200 letras custa três ou quatro
  requisições, não duzentas; e como cada resposta traz a auditoria recalculada,
  duzentas seriam duzentas releituras da planilha inteira.
  **A coalescência também é o que mantém a ORDEM**: dois PATCH da mesma célula em
  paralelo não têm garantia de chegar na ordem em que saíram, e a resposta lenta
  de um valor antigo sobrescreveria o novo.
  Houve um atraso de 600ms antes disto, e antes dele a gravação era só no `blur`
  — quem digitasse e trocasse de tela pelo menu perdia o texto, porque trocar de
  rota desmonta o campo sem passar por `blur`. **A gravação no desmonte continua**,
  e é ela que fecha esse buraco.
  **Três coisas precisam ser verdade ao mesmo tempo** lá, e cada uma tem uma
  linha: o texto é estado LOCAL enquanto se digita (senão a resposta do PATCH
  reescreve o campo e o cursor salta para o fim); o valor do servidor é
  sincronizado, mas **só com o campo fora de foco** (senão a resposta sobrescreve
  o que se está digitando); e nada se perde.
- **A GRADE É SEMPRE DE UM MODELO** (01/08/2026, a pedido). Linha, coluna e
  célula pertencem a um: a linha é um `resultado_check`, e resultado pertence a
  uma auditoria, que pertence a uma versão de um modelo. **Sem modelo escolhido a
  página não monta a grade** — mostra uma tela pedindo que se escolha um no
  painel da esquerda. Houve um modo de PRÉVIA, que desenhava o gabarito do
  recorte com as células travadas; ele saiu, e com ele o modo de rascunho local
  da grade. Uma tabela que não é de nada convida a preencher o que não se grava.
  `GET /gabaritos/{checklist}` continua na API — é a leitura do padrão de
  fábrica, e a tela é que deixou de usá-la.
  Isto substituiu `pages/PlanilhaGeral.tsx` e `pages/PlanilhaLod.tsx`
  (01/08/2026): eram duas telas com tabela própria, e os outros três recortes não
  tinham nenhuma — clicar num modelo de LOD 400 caía numa rota inexistente e o
  conteúdo abria **vazio**. Uma tela por recorte multiplicaria por cinco a
  próxima coluna que a planilha ganhar. O que cada recorte tem de próprio são as
  COLUNAS, em `pages/auditoria/Recorte.tsx`; o comportamento (carregar, gravar,
  anexar) segue em `components/planilha.tsx`.
- **ACIMA DA PLANILHA HÁ UMA LINHA, E SÓ** (01/08/2026, a pedido: "mantenha
  aquele padrão que tínhamos antes, mais simplificado"). Saíram a fileira de
  métricas (versão · itens · aprovação · estado) e a de ações (`Ver o modelo`,
  `Publicar round`): juntas comiam ~140px do alto de uma tela cuja razão de
  existir é a grade, e empurravam a linha 1 para baixo da dobra num notebook.
  **Nada de função se perdeu** — publicar round e o detalhe da versão vivem em
  `pages/Modelo.tsx`, que é onde se cuida do modelo, enquanto aqui se preenche a
  auditoria dele; e o percentual, que era a métrica útil, está na coluna
  APROVAÇÃO (%) linha a linha. `usePlanilha` perdeu o `publicar` junto: método
  de hook que ninguém chama é andaime.
  **O que fica é o que a tela não diz sozinha:** que ninguém precisa salvar, ou
  que o round já foi publicado e por isso nada aceita edição — sem essa segunda
  frase, a planilha travada seria uma tela que ignora o que se digita sem
  explicar por quê.
- **A IMAGEM DA LINHA SE COLA COM Ctrl+V** (`components/ImagemDaLinha.tsx`).
  Recorte de tela nasce na ÁREA DE TRANSFERÊNCIA — quem apertou Print Screen não
  tem arquivo para escolher num seletor, e só havia o seletor. O `paste` é ouvido
  NO DOCUMENTO e não numa caixa com foco: exigir que se clicasse antes tornaria o
  gesto duas ações. **O arquivo colado é batizado** (`colado.png`) porque o
  servidor decide o formato pela EXTENSÃO do nome, e o `File` da área de
  transferência vem sem nome em vários navegadores — sem isso, imagem válida
  responde "formato não aceito". É **gaveta**, não modal centrado: modal seria uma
  quarta família de superfície, com regras próprias, para fazer o que a gaveta já
  faz — e ela não tapa a planilha, então a linha de onde se veio continua à
  vista.
- **O NOME DO MODELO VAI NO CABEÇALHO PRINCIPAL** — o breadcrumb, via
  `layout/migalha.tsx`. Página não tem `h1` desde 30/07, e "Auditoria LOD 300"
  não diz o que se está auditando; sem isso a planilha seria a única tela que não
  diz sobre o que ela é. A página PUBLICA a migalha e a topbar a consome, porque
  o modelo vem de uma requisição que só a página faz — o Shell buscá-lo pelo
  `:modeloId` custaria uma segunda requisição do mesmo recurso a cada navegação.

## LOD 300: a planilha de espec

Referência: `AUDITORIA\LOD 300\Spec Audit LOD300_STRC.pdf`. **60 linhas em 4
categorias de elemento**, para STRC.

- **O gabarito de LOD é POR DISCIPLINA** (`services/gabarito_lod.py`), ao
  contrário do da geral. Ali o que varia entre disciplinas é a resposta; aqui é
  a PERGUNTA — FLOOR e STRUCTURAL COLUMNS são categorias de estrutura. Omitir a
  disciplina levanta `DisciplinaExigida` (422): semear STRC num projeto de
  arquitetura criaria 60 critérios que ninguém pediu.
- **O mesmo nome de informação em categorias diferentes é critério DIFERENTE.**
  "Level" na laje é o built-in `Level`; no pilar é `Base Level`. Um critério só
  teria de escolher um, e estaria errado na metade das linhas.
- **"Geometric Data" NÃO é `parametro_esperado`.** O arquivo escreve isso na
  coluna REVIT PARAMETER de três linhas, e é o modo dele dizer "aqui se audita
  geometria". Como `parametro_esperado`, o verificador do executor procuraria um
  parâmetro com esse nome e reprovaria **todo** modelo correto. Elas são
  manuais de propósito; `test_lod300.py` tranca isso.
- **`parametro_revit` / `parametro_encontrado` (0009) são RESPOSTA**, não
  requisito — onde a informação FOI achada. Onde ela DEVERIA estar é
  `criterio.parametro_esperado`. São campos separados porque a comparação entre
  eles é a única pergunta que a planilha faz.
- **`comentario_fornecedor` (0009) tem outro AUTOR.** `comentario` é da
  coordenação; o guia do arquivo diz "SUPPLIERS COMMENTS — permissão de edição:
  FORNECEDORES". Usar a tabela `comentario_fornecedor` (que é de NC) obrigaria a
  abrir uma NC com prazo e responsável para cada linha esclarecida.
- **A auditoria de LOD NÃO nasce com a versão** — só a geral. LOD é trabalho
  dirigido, e abrir os seis recortes encheria o painel de rounds vazios.
- **A tela é a MESMA dos outros recortes** desde 01/08/2026 — o que o LOD 300 tem
  de próprio são as colunas (`LOD`, em `pages/auditoria/Recorte.tsx`) e a coluna
  ELEMENT, que não é coluna: ela agrupa, e vira a **faixa** que atravessa a
  tabela (`grupo`, em `LinhaGrade`). A faixa sai da comparação com a linha
  ANTERIOR, e não de um agrupamento montado antes: os resultados já vêm do
  servidor na ordem da planilha impressa, e reagrupá-los arriscaria reordená-los.
- **A FAIXA EXISTE SÓ AQUI** — `AGRUPA_POR_ELEMENTO`, em `Recorte.tsx`. Ela
  chegou a aparecer na auditoria geral, porque lá `criterio.categoria` também
  vem preenchida; mas ali a categoria é SEÇÃO DO CHECKLIST ("ASPECTOS GERAIS",
  "PARÂMETROS"), e o arquivo de referência da geral tem os 17 itens **chapados**,
  sem seção nenhuma. Três faixas numa planilha de dezessete linhas dividem em
  três o que se lê de uma vez. Recorte novo só entra nesse conjunto se a planilha
  DELE tiver a coluna ELEMENT.
- **`projeto_membro` registra participação e NÃO CONCEDE poder** (migration
  0004). Quem decide o que se PODE FAZER continua sendo `requer_permissao` sobre
  as permissões de organização, e `test_participacao_nao_e_permissao` existe
  para que ligar as duas coisas seja uma decisão, não um acidente.
  **Mas desde 06/08/2026 ele LIMITA o alcance:** quem não é membro não enxerga o
  projeto (`exigir_projeto_do_usuario`, em `services/escopo.py`). As duas regras
  apontam em direções opostas e por isso convivem — participar nunca amplia o
  que se pode fazer; não participar restringe sobre o quê. Ver a seção "Acesso".
- `backend/app/api/v1/` tem o padrão de rota (permissão via `requer_permissao`, sessão via `get_tenant_db`, 404 via `services/escopo.py`).
- `backend/app/services/auditoria.py` concentra as regras da execução — leia antes de mexer em estado de round.
- `backend/app/services/automacao/executor.py` tem o registro de verificadores: para automatizar um critério novo, acrescente uma entrada em `VERIFICADORES` ou dê a ele um `parametro_esperado`.
- `backend/tests/` tem o padrão de teste: `cenario` monta uma organização isolada, `auditavel` vai até o ponto de auditar, e `ifc_fabrica.py` gera IFC de verdade.

**Cinco armadilhas já pagas — não reverta:**
- **`openpyxl` (em `services/exports.py`) e `boto3` (em `services/storage.py`) são importados DENTRO das funções, de propósito** — não "arrume" movendo-os para o topo. Os dois somavam ~9 s do import da aplicação, pagos em toda subida do servidor e em todo reinício do `--reload`, por bibliotecas que só entram quando alguém baixa a planilha ou toca em arquivo. `botocore.exceptions` fica no topo porque é barato e o `ClientError` aparece em `except` no meio do módulo. O `ifcopenshell` já era preguiçoso pelo mesmo motivo.
- O `db.flush()` no início de `recalcular_aprovacao`: a sessão roda com `autoflush=False` e sem ele o percentual sai um passo atrasado.
- `broker_connection_max_retries=0` no Celery significa "tentar para sempre". Precisa ser positivo.
- `fila_disponivel()` checa o broker por socket antes de qualquer `delay()`; sem isso um Redis fora do ar prende a requisição por ~107 s. **`storage.endpoint_alcancavel()` é a mesma ideia para o S3**, e existe porque o `/health/ready` a reintroduziu: `head_bucket` contra endpoint fora do ar custa ~45 s com o cliente normal e ~8 s mesmo com timeout curto e uma tentativa. Num endpoint que o monitoramento chama a cada 30 s, isso transforma "o storage caiu" em "a API caiu".
- O autor da trilha vem do `AutorMiddleware`, não de `get_current_user`: rota síncrona roda em threadpool e a `ContextVar` definida lá dentro não volta para o chamador.
- **A policy de SELECT é aplicada à LINHA NOVA de um UPDATE.** O Postgres não deixa atualizar uma linha para a invisibilidade. Como a policy da lixeira esconde o que tem `deleted_at`, gravar `deleted_at` produzia exatamente isso e o banco recusava com "new row violates row-level security policy" — separar a policy `FOR ALL` por comando (0007) não resolve, porque quem rejeita é a de SELECT. Por isso `lixeira.remover()` liga `app.ver_removidos` só ao redor do flush. Custou uma tarde.
- `_garantir_id` no `before_flush`: defaults de coluna só são avaliados no INSERT, então sem ele toda criação entra na trilha sem dizer o que foi criada.
- **O `pg_advisory_lock` do `alembic/env.py` vai numa CONEXÃO SEPARADA.** No SQLAlchemy 2.0 o primeiro `execute()` abre transação implícita; tomando o lock na conexão do Alembic, `context.begin_transaction()` vira no-op e **ninguém commita** — o `upgrade head` imprime "Running upgrade", sai com código 0 e não grava nada. Por isso o `entrypoint.sh` confere `alembic current` contra head em vez de confiar no código de saída.

**Ao criar gráfico:** as cores saem de token de tema (`var(--macro-X)`), nunca do hex da API — o modo escuro tem passos próprios. A paleta foi validada; se mexer nela, revalide.

**Não verificado contra sistema externo:** o cliente APS (`services/aps.py` e `services/automacao/revit.py`) foi exercitado só com respostas gravadas — falta credencial do developer hub (decisão aberta nº 3).
