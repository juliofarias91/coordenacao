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
  | 'organizacao'
  | 'visao'
  | 'auditoria'
  | 'projeto'
  | 'cadastro'

export const GRUPOS: Array<{ chave: GrupoNav; pt: string; en: string }> = [
  /** Sem rótulo, e só na Home e no painel administrativo. O primeiro item da
   *  tela inicial é o destino padrão de quem entra — um cabeçalho acima dele só
   *  acrescenta uma linha entre a pessoa e o lugar aonde ela ia. */
  { chave: 'topo', pt: '', en: '' },
  // Home
  { chave: 'acompanhamento', pt: 'Acompanhamento', en: 'Tracking' },
  { chave: 'organizacao', pt: 'Organização', en: 'Organization' },
  // Projeto. Aqui o topo TEM rótulo: dentro de um projeto nenhum item é o
  // "destino padrão" — painel e KPIs são duas leituras do mesmo projeto, e
  // nomeá-las como um conjunto é o que as distingue dos outros dois grupos.
  { chave: 'visao', pt: 'Visão geral', en: 'Overview' },
  { chave: 'auditoria', pt: 'Auditoria', en: 'Audit' },
  { chave: 'projeto', pt: 'Projeto', en: 'Project' },
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
   *  `global` é o que vale para a organização inteira. */
  escopo: 'global' | 'projeto' | 'admin'
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
} as const

/** Os seis recortes de auditoria da barra lateral.
 *
 *  Todos são A MESMA TELA: a matriz modelo × área, que o backend já servia
 *  parametrizada por checklist (`GET /projetos/{id}/matriz?checklist=…`).
 *  Viraram entradas separadas no menu porque é assim que se trabalha — abre-se
 *  "a LOD400", não "a matriz, e então escolhe-se LOD400 num seletor".
 *
 *  `lod300` e `lod350` são novos no enum `ChecklistTipo` (migration 0004).
 */
export const CHECKLISTS = ['geral', '4d', 'lod300', 'lod350', 'lod400', 'lod500'] as const
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

export const ROTULO_CHECKLIST: Record<Checklist, [string, string]> = {
  geral: ['Auditoria geral', 'General audit'],
  '4d': ['Auditoria 4D', '4D audit'],
  lod300: ['Auditoria LOD300', 'LOD300 audit'],
  lod350: ['Auditoria LOD350', 'LOD350 audit'],
  lod400: ['Auditoria LOD400', 'LOD400 audit'],
  lod500: ['Auditoria LOD500', 'LOD500 audit'],
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

  // Organização: o que se liga uma vez e vale para todos os projetos.
  {
    // Nunca foi por projeto: a tela sequer usava o contexto de projeto. Estava
    // no menu errado desde o começo.
    rota: '/integracoes',
    pt: 'Integrações',
    en: 'Integrations',
    path: IC.elo,
    grupo: 'organizacao',
    escopo: 'global',
    fase: 2,
  },
]

/** O menu de dentro de um projeto. */
export const ITENS_PROJETO: ItemNav[] = [
  {
    rota: 'painel',
    pt: 'Painel de controle',
    en: 'Control panel',
    path: IC.grade,
    grupo: 'visao',
    escopo: 'projeto',
    fase: 2,
  },
  {
    rota: 'kpis',
    pt: 'KPIs',
    en: 'KPIs',
    path: IC.barras,
    grupo: 'visao',
    escopo: 'projeto',
    fase: 4,
  },

  // Auditoria: os seis recortes, e o relatório que sai deles.
  ...CHECKLISTS.map(
    (c): ItemNav => ({
      rota: `auditoria/${c}`,
      pt: ROTULO_CHECKLIST[c][0],
      en: ROTULO_CHECKLIST[c][1],
      path: IC.selo,
      grupo: 'auditoria',
      escopo: 'projeto',
      fase: 2,
    }),
  ),
  {
    rota: 'relatorios',
    pt: 'Relatórios · RNC',
    en: 'Reports · NCR',
    path: IC.folha,
    grupo: 'auditoria',
    escopo: 'projeto',
    fase: 2,
  },

  // Projeto: o que se define uma vez e passa a valer para os rounds.
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
    rota: 'peb',
    pt: 'PEB · diretrizes',
    en: 'BEP · guidelines',
    path: IC.prancheta,
    grupo: 'projeto',
    escopo: 'projeto',
    fase: 1,
  },
  {
    rota: 'membros',
    pt: 'Membros do projeto',
    en: 'Project members',
    path: IC.cubo,
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

/** Tudo, para quem precisa resolver uma rota em rótulo (o breadcrumb). */
export const ITENS_NAV: ItemNav[] = [...ITENS_GLOBAIS, ...ITENS_PROJETO, ...ITENS_ADMIN]
