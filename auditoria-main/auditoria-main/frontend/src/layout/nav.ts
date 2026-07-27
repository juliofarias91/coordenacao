/** Itens da barra lateral — os mesmos sete do protótipo, na mesma ordem.
 *  `path` é o traçado do SVG (ícone), copiado do protótipo. */

export type ItemNav = {
  rota: string
  pt: string
  en: string
  path: string
  /** Fase do roadmap em que a tela é implementada de verdade. */
  fase: number
}

export const ITENS_NAV: ItemNav[] = [
  {
    rota: '/painel',
    pt: 'Painel de controle',
    en: 'Control panel',
    path: 'M3 3h18v18H3zM9 3v18M3 9h18',
    fase: 2,
  },
  {
    rota: '/kpis',
    pt: 'KPIs',
    en: 'KPIs',
    path: 'M3 3v18h18M8 17V9M13 17V5M18 17v-7',
    fase: 4,
  },
  {
    rota: '/configuracao',
    pt: 'Configuração',
    en: 'Setup',
    path: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
    fase: 1,
  },
  {
    rota: '/criterios',
    pt: 'Biblioteca de critérios',
    en: 'Criteria library',
    path: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z',
    fase: 1,
  },
  {
    rota: '/peb',
    pt: 'PEB · diretrizes',
    en: 'BEP · guidelines',
    path: 'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M9 12h6M9 16h6',
    fase: 1,
  },
  {
    rota: '/apontamentos',
    pt: 'Apontamentos',
    en: 'Issues',
    path: 'M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z',
    fase: 4,
  },
  {
    rota: '/integracoes',
    pt: 'Integrações',
    en: 'Integrations',
    path: 'M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
    fase: 2,
  },
  {
    rota: '/relatorios',
    pt: 'Relatórios · RNC',
    en: 'Reports · NCR',
    path: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5',
    fase: 2,
  },
]
