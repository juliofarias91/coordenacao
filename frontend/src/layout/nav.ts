/** Itens da barra lateral — os mesmos do protótipo.
 *  `path` é o traçado do SVG (ícone), copiado do protótipo. */

/** Grupos da sidebar. O primeiro não tem rótulo: fica fixo no topo, sem
 *  cabeçalho, porque painel e KPIs são o destino padrão de quem entra — pedir
 *  que se abra um grupo para chegar na tela inicial é atrito puro. */
export type GrupoNav = 'topo' | 'auditoria' | 'projeto'

export const GRUPOS: Array<{ chave: GrupoNav; pt: string; en: string }> = [
  { chave: 'topo', pt: '', en: '' },
  { chave: 'auditoria', pt: 'Auditoria', en: 'Audit' },
  { chave: 'projeto', pt: 'Projeto', en: 'Project' },
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
   *  `global` é o que vale para a organização inteira — a home e o admin. */
  escopo: 'global' | 'projeto'
  /** Fase do roadmap em que a tela é implementada de verdade. */
  fase: number
  /** Some do menu para quem não administra cadastros. É conveniência de
   *  navegação, não segurança: quem barra de verdade é o `requer_permissao`
   *  de cada rota da API. */
  exigePermissao?: string
}

/** A ORDEM AQUI É A ORDEM NA TELA: os itens saem agrupados na sequência de
 *  `GRUPOS`, e dentro de cada grupo na sequência deste array. */
export const ITENS_NAV: ItemNav[] = [
  {
    // Primeiro item e sem grupo: é a raiz, de onde se escolhe o projeto. As
    // telas abaixo dela pressupõem um projeto escolhido.
    rota: '/',
    pt: 'Início',
    en: 'Home',
    path: 'M3 10.5 12 3l9 7.5M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5',
    grupo: 'topo',
    escopo: 'global',
    fase: 1,
  },
  {
    rota: 'painel',
    pt: 'Painel de controle',
    en: 'Control panel',
    path: 'M3 3h18v18H3zM9 3v18M3 9h18',
    grupo: 'topo',
    escopo: 'projeto',
    fase: 2,
  },
  {
    rota: 'kpis',
    pt: 'KPIs',
    en: 'KPIs',
    path: 'M3 3v18h18M8 17V9M13 17V5M18 17v-7',
    grupo: 'topo',
    escopo: 'projeto',
    fase: 4,
  },

  // Auditoria: o que se olha durante um round — do critério ao relatório.
  {
    rota: 'criterios',
    pt: 'Biblioteca de critérios',
    en: 'Criteria library',
    path: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z',
    grupo: 'auditoria',
    escopo: 'projeto',
    fase: 1,
  },
  {
    rota: 'apontamentos',
    pt: 'Apontamentos',
    en: 'Issues',
    path: 'M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z',
    grupo: 'auditoria',
    escopo: 'projeto',
    fase: 4,
  },
  {
    rota: 'relatorios',
    pt: 'Relatórios · RNC',
    en: 'Reports · NCR',
    path: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5',
    grupo: 'auditoria',
    escopo: 'projeto',
    fase: 2,
  },

  // Projeto: o que se define uma vez e passa a valer para os rounds.
  {
    rota: 'configuracao',
    pt: 'Configuração',
    en: 'Setup',
    path: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
    grupo: 'projeto',
    escopo: 'projeto',
    fase: 1,
  },
  {
    rota: 'peb',
    pt: 'PEB · diretrizes',
    en: 'BEP · guidelines',
    path: 'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M9 12h6M9 16h6',
    grupo: 'projeto',
    escopo: 'projeto',
    fase: 1,
  },
  {
    rota: 'integracoes',
    pt: 'Integrações',
    en: 'Integrations',
    path: 'M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
    grupo: 'projeto',
    escopo: 'projeto',
    fase: 2,
  },

  // A administração NÃO está aqui: mora no menu da conta, na topbar
  // (`components/UsuarioMenu.tsx`). É o andar de cima — organização, projetos
  // e usuários —, não mais uma tela do fluxo de auditoria. A sidebar responde
  // "o que faço neste projeto"; a conta responde "quem sou e o que administro".
]
