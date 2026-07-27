// ============================================================================
// CONSTANTES DE LAYOUT E COR SEMÂNTICA
//
// Tudo aqui é o que NÃO cabe num token CSS: medidas do esqueleto, escala de
// z-index e as cores de status/prioridade. Importar daqui em vez de redigitar é
// a diferença entre "o sistema mudou" e "algumas telas mudaram".
// ============================================================================

/* ---------------------------------------------------------------------------
   MEDIDAS DO ESQUELETO — os números que não podem ser escolhidos "no olho"
   --------------------------------------------------------------------------- */
export const LAYOUT = {
  // A REGRA DOS DOIS TRILHOS DE SIDEBAR — a largura é decidida pela FUNÇÃO:
  //   NAVEGAÇÃO (navegar entre seções do app)  -> 240px, recolhe para ~49px
  //   TRABALHO  (árvore/lista densa dentro de uma ferramenta) -> 300px, redimensionável
  sidebarNav: '15rem',        // 240px — expandida
  sidebarNavCollapsed: '3.05rem', // ~49px — recolhida (só ícones)
  sidebarWork: 300,           // px — inicial e piso do resize

  // HIERARQUIA DE CHROME: a diferença 56↔48 é proposital.
  // Chrome externo (topbar do app) é mais alto que header de ferramenta interna.
  topbar: '3.5rem',           // h-14 = 56px
  innerHeader: '3rem',        // h-12 = 48px — header de viewer/seção
  innerBar: '2.5rem',         // h-10  — barras de ação internas
  bottomNav: '52px',          // dock mobile

  // Altura útil de uma página full-bleed (abaixo da topbar).
  pageHeight: 'calc(100vh - 3.5rem)',

  drawer: { sm: 'w-[24rem]', md: 'w-[26rem]', lg: 'w-[28rem]' },
  popover: 'w-80',            // 320px — popovers da topbar
};

/* ---------------------------------------------------------------------------
   Z-INDEX — uma escala só, declarada num lugar só.
   Regra: chrome < overlay de carregamento < modal interno < toast < diálogo.
   --------------------------------------------------------------------------- */
export const Z = {
  bottomNav: 30,
  topbar: 30,
  sidebarInner: 40,
  drawerCatch: 45,      // captura de clique-fora do drawer (abaixo da sidebar)
  sidebar: 50,
  popover: 50,
  drawer: 61,
  viewerChrome: 10008,  // toolbars/minimapas flutuando sobre canvas
  viewerOverlay: 10009, // loading/erro cobrindo o chrome
  viewerModal: 10050,
  contextMenu: 10041,
  toast: 100001,
  dialog: 100002,       // confirm/prompt — acima de tudo
};

/* ---------------------------------------------------------------------------
   TONS SEMÂNTICOS TRANSLÚCIDOS — o padrão para badges, pills e ícones de estado.
   Fundo a /10 e texto na cor cheia: lê nos dois temas sem precisar de variante.
   --------------------------------------------------------------------------- */
export const TONES = {
  primary: 'bg-primary/10 text-primary',
  green: 'bg-emerald-500/10 text-emerald-500',   // sucesso / concluído
  amber: 'bg-amber-500/10  text-amber-500',      // atenção / em breve
  red: 'bg-red-500/10    text-red-500',          // destrutivo / atrasado
};

// Ação destrutiva em menus e listas — sempre esta, em todo o sistema.
export const DESTRUCTIVE = 'text-red-500 hover:bg-red-500/10';

/* ---------------------------------------------------------------------------
   CORES DE DADO — para gráficos, bolinhas de status e barras. Hex, porque vão
   parar em canvas/SVG/inline style, onde classe Tailwind não chega.
   --------------------------------------------------------------------------- */
export const PRIORITY_COLORS = {
  urgente: '#e63946',
  alta: '#f59e0b',
  normal: '#3b82f6',
  baixa: '#94a3b8',
};

export const STATUS_COLORS = {
  backlog: '#64748b',
  pendente: '#94a3b8',
  andamento: '#3b82f6',
  revisao: '#f59e0b',
  pausado: '#e63946',
  concluido: '#10b981',
};

export const DEADLINE_COLORS = {
  atrasado: '#e63946',
  hoje: '#f59e0b',
  semana: '#3b82f6',
  futuro: '#10b981',
  sem: '#64748b',
};

/* ---------------------------------------------------------------------------
   MOVIMENTO — o vocabulário de animação. Duas curvas, não catorze.
   --------------------------------------------------------------------------- */
export const MOTION = {
  // Curva DOMINANTE: sidebar, drawer, popover, troca de painel. Se estiver em
  // dúvida, é esta.
  tween: { type: 'tween', ease: 'easeOut', duration: 0.2 },
  tweenFast: { type: 'tween', ease: 'easeOut', duration: 0.15 },
  // Spring é reservado a FEEDBACK TÁTIL (mobile, toque). Usar spring em layout
  // desktop faz o chrome parecer instável.
  springEnter: { type: 'spring', stiffness: 300, damping: 26 },
  springLabel: { type: 'spring', stiffness: 350, damping: 32 },
  // Rails/painéis que expandem por largura em CSS puro.
  cssEase: 'cubic-bezier(0.4, 0, 0.2, 1)',
};

/* ---------------------------------------------------------------------------
   RECEITAS DE CLASSE — os literais que se repetiriam em dezenas de telas.
   --------------------------------------------------------------------------- */
export const RECIPES = {
  // Superfície de card canônica (páginas do tipo "card" — ver README §2).
  card: 'rounded-2xl border border-border bg-card p-6 shadow-sm',
  cardTight: 'rounded-2xl border border-border bg-card p-5',

  // Label de campo / cabeçalho de tabela. O mesmo em todo o sistema.
  label: 'text-xs font-semibold uppercase tracking-wide text-muted-foreground',
  tableHead: 'text-[11px] font-bold uppercase tracking-wide text-muted-foreground',

  // Linha de tabela clicável: realce TRANSLÚCIDO, não zebra. Zebra fixa uma cor
  // que erra em um dos dois temas; /[0.03] do foreground acerta nos dois.
  rowHover: 'cursor-pointer border-b border-border/50 last:border-0 hover:bg-foreground/[0.03]',

  // Botão redondo de cabeçalho (h-7) — a unidade das barras de ação.
  round: 'flex h-7 w-7 shrink-0 appearance-none items-center justify-center rounded-full border transition-colors',
  roundOff: 'border-border bg-muted/40 text-muted-foreground hover:text-foreground',
  roundOn: 'border-foreground/20 text-foreground font-semibold',

  // Campo de busca embutido numa barra h-12.
  searchPill: 'flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5',
};
