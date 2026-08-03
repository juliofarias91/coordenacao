/** O menu da plataforma — a fonte de verdade da navegação.
 *
 *  A SIDEBAR É CONTEXTUAL (reestruturação de 29/07/2026). Ela mostra um menu
 *  ou outro conforme a URL:
 *
 *    fora de um projeto   Projetos · Apontamentos · Membros · Integrações
 *    dentro de um projeto ← Projetos · e tudo o que se faz naquele projeto
 *
 *  Antes era uma lista só, misturando o que vale para a organização com o que
 *  vale para um projeto. O sintoma: "Apontamentos" e "Integrações" viviam no
 *  menu do projeto sendo que a API dos dois nunca foi por projeto — o de
 *  apontamentos sempre aceitou listar tudo, e o de integrações sequer tem
 *  projeto. Quem entrava pela home via um menu que só funcionava depois de
 *  escolher um projeto.
 *
 *  `path` é o traçado do SVG do ícone.
 */

/** Grupos da sidebar. O primeiro não tem rótulo: fica fixo no topo, sem
 *  cabeçalho, porque é o destino padrão de quem entra — pedir que se abra um
 *  grupo para chegar na tela inicial é atrito puro. */
export type GrupoNav =
  | 'topo'
  | 'acompanhamento'
  | 'gestao'
  | 'visao'
  | 'projeto'
  | 'auditoria'
  | 'cadastro'

/** A ORDEM AQUI É A ORDEM NA TELA. Cada área usa só os seus grupos; os das
 *  outras simplesmente não têm itens e não são renderizados. */
export const GRUPOS: Array<{ chave: GrupoNav; pt: string; en: string }> = [
  /** Sem rótulo, e só na Home e no painel administrativo. O primeiro item da
   *  tela inicial é o destino padrão de quem entra — um cabeçalho acima dele só
   *  acrescenta uma linha entre a pessoa e o lugar aonde ela ia. */
  { chave: 'topo', pt: '', en: '' },
  // Home. `Gestão` é o que se administra uma vez e passa a valer para a
  // organização inteira — as pessoas e as conexões com sistemas de fora.
  // Houve um grupo `Organização` só para Integrações; um cabeçalho para uma
  // linha só é uma linha de texto a mais entre quem procura e o que ele
  // procura, e "gerir a organização" já era o que os dois queriam dizer.
  { chave: 'acompanhamento', pt: 'Acompanhamento', en: 'Tracking' },
  { chave: 'gestao', pt: 'Gestão', en: 'Management' },
  // Projeto, na sequência do trabalho: primeiro o que se lê (Visão geral),
  // depois o que se define uma vez (Projeto), e por fim o que se executa a cada
  // round (Auditoria). Auditoria por último porque é o grupo mais longo — sete
  // itens acima dos outros dois empurrariam para fora da vista o que se
  // configura antes de auditar.
  { chave: 'visao', pt: 'Visão geral', en: 'Overview' },
  { chave: 'projeto', pt: 'Projeto', en: 'Project' },
  { chave: 'auditoria', pt: 'Auditoria', en: 'Audit' },
  // Painel administrativo
  { chave: 'cadastro', pt: 'Cadastro', en: 'Records' },
]

export type ItemNav = {
  /** Para `escopo: 'projeto'`, o SEGMENTO da tela (`painel`) — o caminho
   *  completo sai de `rotaProjeto()`, porque depende de qual projeto está
   *  aberto. Para `escopo: 'global'`, o caminho absoluto mesmo (`/`). */
  rota: string
  pt: string
  en: string
  path: string
  grupo: GrupoNav
  /** Onde a tela vive. `projeto` significa `/projetos/:projetoId/<rota>`: a
   *  tela não existe sem um projeto escolhido, e o escolhido está na URL.
   *  `global` é o que vale para a organização inteira; `admin`, o painel do
   *  tenant; `conta`, as configurações da própria pessoa. Os três últimos
   *  trazem o caminho ABSOLUTO em `rota` — só `projeto` precisa do id. */
  escopo: 'global' | 'projeto' | 'admin' | 'conta'
  /** Fase do roadmap em que a tela é implementada de verdade. */
  fase: number
  /** Some do menu para quem não tem a permissão. É conveniência de navegação,
   *  não segurança: quem barra de verdade é o `requer_permissao` de cada rota
   *  da API. */
  exigePermissao?: string
}

const IC = {
  casa: 'M3 10.5 12 3l9 7.5M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5',
  grade: 'M3 3h18v18H3zM9 3v18M3 9h18',
  barras: 'M3 3v18h18M8 17V9M13 17V5M18 17v-7',
  livro:
    'M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z',
  alerta:
    'M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z',
  folha: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5',
  ajustes: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
  prancheta:
    'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M9 12h6M9 16h6',
  elo: 'M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
  pessoas:
    'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  selo: 'M9 12l2 2 4-4M12 3l7 4v5c0 4.4-3 8.3-7 9.5C8 20.3 5 16.4 5 12V7z',
  cubo: 'M21 16V8l-9-5-9 5v8l9 5zM3.3 7.3 12 12l8.7-4.7M12 12v9.5',
  // Uma pessoa, e não o par de `pessoas`: em Configurações da conta o assunto é
  // quem está logado, não o time.
  pessoa: 'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  cadeado: 'M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2zM7 11V7a5 5 0 0 1 10 0v4',
  sino: 'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0',

  // OS CINCO RECORTES DE AUDITORIA (01/08/2026, a pedido). Eles voltaram a ser
  // entradas da barra, e o ícone é o que torna isso possível: os rótulos são
  // curtos e parecidos, e é pelo desenho que se acha o recorte sem ler.
  //
  // A metáfora de cada um é o que ele PERGUNTA, e não um número em algarismos —
  // "300", "400" e "500" desenhados a 15px viram três borrões iguais:
  //   geral   lista com marcas  — item a item, é a conferência de base
  //   4d      relógio           — 4D é tempo: fase, cronograma
  //   lod300  cubo              — o elemento genérico da espec
  //   lod400  camadas           — o detalhamento, a informação empilhada
  //   lod500  prédio            — o as-built, o que existe em obra
  checklist: 'M9 6h12M9 12h12M9 18h12M3 6l1.5 1.5L7 4M3 12l1.5 1.5L7 10M3 18l1.5 1.5L7 16',
  relogio: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
  camadas: 'M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  predio: 'M3 21h18M6 21V7l6-4 6 4v14M10 12h4M10 16h4M10 8h4',
} as const

/** Os seis recortes de auditoria.
 *
 *  Eles JÁ FORAM seis entradas da barra lateral e hoje são o painel de dentro
 *  da página de auditoria (`pages/auditoria/`) — a barra tem uma entrada só. A
 *  lista continua aqui porque é a fonte de verdade de quais recortes existem, e
 *  quem a consome são o painel da página, o validador da rota e os rótulos.
 *
 *  `lod300` e `lod350` são novos no enum `ChecklistTipo` (migration 0004).
 */
/** O LOD 350 SAIU (30/07/2026), a pedido. Não é limpeza de código: ele nunca
 *  teve arquivo de referência. A pasta `Bases/` tem controle de geral, 4D, LOD
 *  300, 400 e 500 — de 350, nada, em nenhum projeto. Um recorte no menu que a
 *  coordenação não audita é uma tela que só pode estar vazia.
 *
 *  O VALOR CONTINUA NO ENUM do banco (`checklist_tipo`). Tirar um valor de enum
 *  no Postgres exige recriar o tipo, e qualquer linha de `auditoria` ou
 *  `checklist_item` que o use travaria a migration. Sai da NAVEGAÇÃO; se um dia
 *  voltar, volta acrescentando uma string aqui. */
export const CHECKLISTS = ['geral', '4d', 'lod300', 'lod400', 'lod500'] as const
export type Checklist = (typeof CHECKLISTS)[number]

/** Recortes que existem no menu mas ainda não no enum `ChecklistTipo` do
 *  backend. Hoje: NENHUM — `lod300` e `lod350` entraram na migration 0004.
 *
 *  A lista fica porque o mecanismo é o que importa: um recorte novo entra
 *  primeiro aqui, e a tela dele diz o que falta em vez de chamar a API e
 *  devolver um 422 de validação, que não explica nada a quem coordena obra. */
export const CHECKLISTS_SEM_BANCO: readonly Checklist[] = []

export function checklistTemBanco(c: Checklist): boolean {
  return !CHECKLISTS_SEM_BANCO.includes(c)
}

/** O nome INTEIRO do recorte — o que a tela usa como título, onde ele aparece
 *  sozinho e precisa dizer de que assunto se trata. */
export const ROTULO_CHECKLIST: Record<Checklist, [string, string]> = {
  geral: ['Auditoria geral', 'General audit'],
  '4d': ['Auditoria 4D', '4D audit'],
  lod300: ['Auditoria LOD 300', 'LOD 300 audit'],
  lod400: ['Auditoria LOD 400', 'LOD 400 audit'],
  lod500: ['Auditoria LOD 500', 'LOD 500 audit'],
}

/** O nome CURTO — o do menu, onde o grupo já se chama Auditoria.
 *
 *  Repetir a palavra em cada linha é o que fazia seis rótulos começarem iguais e
 *  obrigava a ler até o fim de cada um. Aqui ela sai: quem lê "Geral" logo abaixo
 *  do cabeçalho "Auditoria" não tem dúvida do que é. */
export const ROTULO_CURTO: Record<Checklist, [string, string]> = {
  geral: ['Geral', 'General'],
  '4d': ['4D', '4D'],
  lod300: ['LOD 300', 'LOD 300'],
  lod400: ['LOD 400', 'LOD 400'],
  lod500: ['LOD 500', 'LOD 500'],
}

/** O ícone de cada recorte. A metáfora de cada um está na tabela `IC`. */
const IC_CHECKLIST: Record<Checklist, string> = {
  geral: IC.checklist,
  '4d': IC.relogio,
  lod300: IC.cubo,
  lod400: IC.camadas,
  lod500: IC.predio,
}

/** O menu de fora de um projeto: o que vale para a organização inteira.
 *
 *  Agrupado, como o de projeto. `Projetos` fica sozinho no topo sem rótulo
 *  porque é a porta de entrada — pôr um cabeçalho acima do primeiro item da
 *  tela inicial só acrescenta uma linha entre o usuário e o destino. */
export const ITENS_GLOBAIS: ItemNav[] = [
  {
    rota: '/',
    pt: 'Projetos',
    en: 'Projects',
    path: IC.casa,
    grupo: 'topo',
    escopo: 'global',
    fase: 1,
  },

  // Acompanhamento: o que se olha para saber como as coisas estão indo.
  {
    // KPIs de TODOS os projetos. Existe porque a home fazia duas coisas —
    // fileira de números E navegação por pastas — e cada uma responde a uma
    // pergunta diferente. Agora a home só navega.
    rota: '/kpis',
    pt: 'KPIs',
    en: 'KPIs',
    path: IC.barras,
    grupo: 'acompanhamento',
    escopo: 'global',
    fase: 4,
  },
  {
    // PONTE PROVISÓRIA (migration 0012). Sobe as planilhas .xlsx que a
    // coordenação preenche à mão e tira as médias delas. Fica em
    // Acompanhamento, ao lado dos KPIs, porque responde a mesma pergunta —
    // "como estamos?" — só que a partir do arquivo em vez do banco. Sai daqui
    // quando os dados entrarem pelo caminho de auditoria de verdade.
    rota: '/importacao',
    pt: 'Importar planilhas',
    en: 'Import spreadsheets',
    path: IC.folha,
    grupo: 'acompanhamento',
    escopo: 'global',
    fase: 4,
    exigePermissao: 'ver_painel',
  },
  {
    // Central: lista os apontamentos de TODOS os projetos. O backend já
    // aceitava — `projeto_id` sempre foi filtro opcional.
    rota: '/apontamentos',
    pt: 'Apontamentos',
    en: 'Issues',
    path: IC.alerta,
    grupo: 'acompanhamento',
    escopo: 'global',
    fase: 4,
  },

  // Gestão: as pessoas e as conexões — o que se administra uma vez e vale para
  // todos os projetos.
  {
    // A MESMA TELA que `/admin/usuarios`, por duas portas de propósito: quem
    // coordena entra por aqui várias vezes por semana, e quem administra o
    // tenant a encontra junto de organização, clientes e logs. Uma
    // implementação só (`pages/admin/Usuarios.tsx`) — o que difere é a barra
    // lateral em volta, porque as duas áreas respondem perguntas diferentes.
    rota: '/membros',
    pt: 'Gerenciar membros',
    en: 'Manage members',
    path: IC.pessoas,
    grupo: 'gestao',
    escopo: 'global',
    fase: 1,
    exigePermissao: 'admin_cadastro',
  },
  {
    // Nunca foi por projeto: a tela sequer usava o contexto de projeto. Estava
    // no menu errado desde o começo — e depois, por um tempo, num grupo só
    // seu. Fica DEPOIS dos membros: gerir gente é semanal, ligar o ACC é uma
    // vez na vida do tenant.
    rota: '/integracoes',
    pt: 'Integrações',
    en: 'Integrations',
    path: IC.elo,
    grupo: 'gestao',
    escopo: 'global',
    fase: 2,
  },
]

/** `Projetos`, o mesmo item da Home — e é o MESMO objeto, não uma cópia.
 *
 *  Dentro de um projeto ele encabeça a barra e faz o papel de voltar. Já foi um
 *  bloco próprio (`.nav-volta`), com o código do projeto e um subtítulo; virou
 *  item comum porque é para onde ele leva que importa, e um item que leva à
 *  mesma tela deve ter a mesma cara nas duas barras. Duplicar o objeto faria as
 *  duas divergirem no dia em que alguém trocasse o ícone de um lado só. */
const PROJETOS = ITENS_GLOBAIS[0]!

/** O menu de dentro de um projeto.
 *
 *  A ORDEM DENTRO DE CADA GRUPO É A ORDEM NA TELA, e a sequência dos grupos
 *  está em `GRUPOS`: primeiro o que se LÊ (Visão geral), depois o que se DEFINE
 *  uma vez (Projeto), e por fim o que se EXECUTA a cada round (Auditoria).
 */
export const ITENS_PROJETO: ItemNav[] = [
  PROJETOS,

  // Visão geral: a leitura do projeto inteiro num número só.
  {
    rota: 'kpis',
    pt: 'KPIs',
    en: 'KPIs',
    path: IC.barras,
    grupo: 'visao',
    escopo: 'projeto',
    fase: 4,
  },

  // Projeto: o que se define uma vez e passa a valer para todos os rounds.
  // A ordem é a de quem monta um projeto do zero — as diretrizes primeiro, a
  // configuração em seguida, e os modelos só depois de haver disciplina para
  // classificá-los.
  {
    // A FICHA ENCABEÇA O GRUPO, logo abaixo de KPIs: é a identidade da obra, e
    // vem antes de qualquer coisa que se defina sobre ela. Ela é a casa dos
    // dados do projeto — a aba `Configuração › Projeto` foi removida quando
    // esta entrou, porque as duas editavam os mesmos cinco campos.
    rota: 'ficha',
    pt: 'Ficha do projeto',
    en: 'Project record',
    path: IC.prancheta,
    grupo: 'projeto',
    escopo: 'projeto',
    fase: 1,
  },
  {
    rota: 'peb',
    pt: 'PEB · diretrizes',
    en: 'BEP · guidelines',
    path: IC.prancheta,
    grupo: 'projeto',
    escopo: 'projeto',
    fase: 1,
  },
  {
    // Logo abaixo do PEB, e não dentro dele: são documentos de autores
    // diferentes. O mandate é o que o CLIENTE exige; o PEB é como a equipe se
    // propõe a atender. Quando discordam, prevalece o mandate — e para isso
    // ele precisa estar registrado à parte.
    rota: 'mandate',
    pt: 'BIM Mandate',
    en: 'BIM Mandate',
    path: IC.selo,
    grupo: 'projeto',
    escopo: 'projeto',
    fase: 1,
  },
  {
    rota: 'configuracao',
    pt: 'Configurações do projeto',
    en: 'Project setup',
    path: IC.ajustes,
    grupo: 'projeto',
    escopo: 'projeto',
    fase: 1,
  },
  {
    rota: 'criterios',
    pt: 'Biblioteca de critérios',
    en: 'Criteria library',
    path: IC.livro,
    grupo: 'projeto',
    escopo: 'projeto',
    fase: 1,
  },
  {
    // Chamava-se "Painel de controle", herança do nome da planilha que a tela
    // substitui. O que ela lista são MODELOS — e a URL passou a dizer isso
    // também: `/projetos/<id>/modelos`, com o detalhe de um modelo em
    // `/modelos/<id>` logo abaixo. Nome de tela deve dizer o que a tela mostra.
    rota: 'modelos',
    pt: 'Modelos',
    en: 'Models',
    path: IC.grade,
    grupo: 'projeto',
    escopo: 'projeto',
    fase: 2,
  },
  {
    // Só "Membros": o contexto já é o projeto — a barra inteira é dele, e o
    // breadcrumb diz qual. Repetir "do projeto" no rótulo era a mesma redundância
    // que fez o caminho de volta deixar de mostrar o código do projeto.
    rota: 'membros',
    pt: 'Membros',
    en: 'Members',
    path: IC.pessoas,
    grupo: 'projeto',
    escopo: 'projeto',
    fase: 1,
  },

  // AUDITORIA: UM ITEM POR RECORTE (01/08/2026, a pedido).
  //
  // Eles já foram seis itens aqui, viraram UM com um painel dentro da página em
  // 29/07, e voltaram. As duas queixas que motivaram juntá-los estão resolvidas
  // de outro jeito, e é por isso que a volta não é um círculo:
  //
  //   1. "Nove linhas num grupo só." Eram nove porque cada rótulo repetia a
  //      palavra Auditoria e o grupo TAMBÉM se chama Auditoria. Agora são
  //      `Geral`, `4D`, `LOD 300` — o grupo diz do que se trata, e a linha diz
  //      qual. Seis linhas curtas ocupam menos que seis longas com a mesma
  //      primeira palavra.
  //   2. "Rótulos que obrigam a ler até o fim." Cada um tem ÍCONE PRÓPRIO, e é
  //      pelo desenho que se acha o recorte sem ler. Ver `IC`.
  //
  // O painel de dentro da página continua existindo e perdeu o nível de cima:
  // ele agora lista DISCIPLINA › MODELO do recorte aberto. Ver
  // `pages/auditoria/index.tsx`.
  //
  // A ROTA DE CADA UM É `auditoria/<recorte>`, que é a mesma de antes: o painel
  // já navegava para lá, então nenhum link existente quebra. E `auditoria` sem
  // recorte segue caindo na geral.
  ...CHECKLISTS.map((c) => ({
    rota: `auditoria/${c}`,
    pt: ROTULO_CURTO[c][0],
    en: ROTULO_CURTO[c][1],
    path: IC_CHECKLIST[c],
    grupo: 'auditoria' as const,
    escopo: 'projeto' as const,
    fase: 2,
  })),
  {
    rota: 'relatorios',
    pt: 'Relatórios · RNC',
    en: 'Reports · NCR',
    path: IC.folha,
    grupo: 'auditoria',
    escopo: 'projeto',
    fase: 2,
  },
]

/** O menu do PAINEL ADMINISTRATIVO.
 *
 *  O `/admin` é uma área à parte, não uma tela do fluxo — como o próprio nome
 *  "painel administrativo" diz. Ele troca a sidebar inteira, pelo mesmo
 *  mecanismo que o escopo de projeto usa, e tem um caminho de volta no topo.
 *
 *  Antes eram abas dentro de uma tela só. Aba serve para alternar entre visões
 *  do MESMO assunto; aqui são assuntos distintos — quem administra usuários não
 *  está a meio caminho de conferir o log —, e a fileira de abas ainda ia crescer
 *  a cada item novo até não caber na linha.
 */
export const ITENS_ADMIN: ItemNav[] = [
  {
    rota: '/admin/usuarios',
    pt: 'Usuários',
    en: 'Users',
    path: IC.pessoas,
    grupo: 'topo',
    escopo: 'admin',
    fase: 1,
    exigePermissao: 'admin_cadastro',
  },
  {
    rota: '/admin/logs',
    pt: 'Logs',
    en: 'Logs',
    path: IC.folha,
    grupo: 'topo',
    escopo: 'admin',
    fase: 4,
    exigePermissao: 'admin_cadastro',
  },
  {
    // Os erros que quem usa a plataforma relatou. Fica ao lado dos logs: os
    // dois respondem "o que aconteceu aqui dentro" — um pelo que o sistema
    // registrou, outro pelo que as pessoas contaram.
    rota: '/admin/reportes',
    pt: 'Erros reportados',
    en: 'Reported problems',
    path: IC.alerta,
    grupo: 'topo',
    escopo: 'admin',
    fase: 4,
    exigePermissao: 'admin_cadastro',
  },

  // ORGANIZAÇÃO, CLIENTES E PROJETOS FICAM, e num grupo à parte.
  //
  // Não foram pedidos nesta rodada — o pedido foi "usuários e logs só por
  // enquanto". Estão aqui porque são o ÚNICO lugar da plataforma onde um
  // projeto ou um cliente nasce: a home lista projetos, não os cria. Removê-los
  // agora deixaria a plataforma sem como cadastrar um projeto, que é o primeiro
  // passo de qualquer coisa. Quando houver outra porta para isso, este grupo
  // sai daqui.
  {
    rota: '/admin/organizacao',
    pt: 'Organização',
    en: 'Organization',
    path: IC.selo,
    grupo: 'cadastro',
    escopo: 'admin',
    fase: 1,
    exigePermissao: 'admin_cadastro',
  },
  {
    rota: '/admin/clientes',
    pt: 'Clientes',
    en: 'Clients',
    path: IC.cubo,
    grupo: 'cadastro',
    escopo: 'admin',
    fase: 1,
    exigePermissao: 'admin_cadastro',
  },
  {
    rota: '/admin/projetos',
    pt: 'Projetos',
    en: 'Projects',
    path: IC.casa,
    grupo: 'cadastro',
    escopo: 'admin',
    fase: 1,
    exigePermissao: 'admin_cadastro',
  },
]

/** As seções de CONFIGURAÇÕES DA CONTA, e a fonte de verdade de quais existem.
 *
 *  Uma lista à parte, no formato de `CHECKLISTS`: quem valida a rota
 *  (`pages/Configuracoes.tsx`) precisa saber se `:secao` existe, e derivar isso
 *  de `ITENS_CONTA` obrigaria a fatiar caminho com `split('/')`. A ORDEM é a de
 *  `ITENS_CONTA`, e a primeira é o destino de `/configuracoes` sem seção. */
export const SECOES_CONTA = ['perfil', 'preferencias', 'seguranca', 'notificacoes'] as const
export type SecaoConta = (typeof SECOES_CONTA)[number]

export function ehSecaoConta(v: string | undefined): v is SecaoConta {
  return !!v && (SECOES_CONTA as readonly string[]).includes(v)
}

/** O menu das CONFIGURAÇÕES DA CONTA — a quarta área com barra própria
 *  (31/07/2026, a pedido).
 *
 *  ELA CHEGOU A SER UM PAINEL DE PÁGINA (`.pgsplit`, como os recortes da
 *  auditoria) e virou área contextual no mesmo dia. A diferença que decide não é
 *  estética, é se HÁ CONTEXTO A PERDER: trocar a barra dentro de um projeto
 *  apaga da tela em que projeto se está, e foi isso que tirou a barra própria da
 *  configuração de projeto. Aqui não há projeto nenhum — quem entra em
 *  `/configuracoes` saiu do trabalho para cuidar da própria conta, exatamente
 *  como quem entra em `/admin`. Não sobra contexto para a barra apagar, e ela
 *  passa a poder ser a lista das seções.
 *
 *  Por isso são QUATRO áreas: global, projeto, administração e conta. O que
 *  continua não existindo é `escopo: 'config'` — a configuração DO PROJETO é
 *  página com abas, e a razão dela está intacta.
 *
 *  A ORDEM É A DE QUEM CHEGA, não a alfabética: primeiro quem você é, depois
 *  como quer ver, depois como entra, e por último o que recebe. Grupo `topo`,
 *  sem rótulo: quatro itens não precisam de cabeçalho, e a área já é nomeada
 *  pelo breadcrumb. */
export const ITENS_CONTA: ItemNav[] = [
  {
    rota: '/configuracoes/perfil',
    pt: 'Dados pessoais',
    en: 'Personal data',
    path: IC.pessoa,
    grupo: 'topo',
    escopo: 'conta',
    fase: 1,
  },
  {
    rota: '/configuracoes/preferencias',
    pt: 'Preferências',
    en: 'Preferences',
    // Os controles deslizantes, o mesmo de `Configurações do projeto` — as duas
    // nunca aparecem na mesma barra, e é o ícone que a indústria usa para
    // "preferências".
    path: IC.ajustes,
    grupo: 'topo',
    escopo: 'conta',
    fase: 1,
  },
  {
    rota: '/configuracoes/seguranca',
    pt: 'Segurança',
    en: 'Security',
    path: IC.cadeado,
    grupo: 'topo',
    escopo: 'conta',
    fase: 1,
  },
  {
    rota: '/configuracoes/notificacoes',
    pt: 'Notificações',
    en: 'Notifications',
    path: IC.sino,
    grupo: 'topo',
    escopo: 'conta',
    fase: 4,
  },
]

/** Tudo, para quem precisa resolver uma rota em rótulo (o breadcrumb).
 *  `Set` porque `PROJETOS` aparece nas duas listas e é o mesmo objeto. */
export const ITENS_NAV: ItemNav[] = [
  ...new Set([...ITENS_GLOBAIS, ...ITENS_PROJETO, ...ITENS_ADMIN, ...ITENS_CONTA]),
]
