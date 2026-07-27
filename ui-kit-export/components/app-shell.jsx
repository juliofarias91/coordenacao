import { Fragment, useCallback, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import { cn } from '../lib/utils';
import { LAYOUT, MOTION, Z } from '../lib/design-tokens';
import { AppSidebar } from './app-sidebar';
import { BottomNav } from './bottom-nav';

// ============================================================================
// ESQUELETO DA APLICAÇÃO
//
//   ┌──────────┬──────────────────────────────────────────┐
//   │          │  TOPBAR h-14  breadcrumb ····· ações     │  sticky, blur
//   │ SIDEBAR  ├──────────────────────────────────────────┤
//   │  240px   │                                          │
//   │  ↔ 49px  │  children                                │
//   │          │                                          │
//   └──────────┴──────────────────────────────────────────┘
//                                    [ dock mobile, bottom-4 ]
//
// A REGRA DE EMPURRAR: só a esquerda empurra o conteúdo (padding-left via
// --sidebar-w). O painel da DIREITA sobrepõe. Se os dois empurrassem, abrir um
// drawer reflowaria a tabela inteira e o usuário perderia a linha que estava
// lendo — que é exatamente a linha que ele abriu no drawer.
// ============================================================================

/**
 * Topbar. Breadcrumb à esquerda, cluster de ações à direita.
 *
 * BREADCRUMB: todos os itens no MESMO tamanho. Só o último (a página atual)
 * ganha peso + text-foreground. Os demais são uma cor apagada só. Não use a cor
 * de accent aqui — o accent significa "ação/seleção" em todo o resto do sistema,
 * e o crumb atual não é nem uma coisa nem outra.
 *
 * crumbs: [{ label, onClick? }]
 * actions: JSX (use ActionPill abaixo para manter a régua)
 */
export function Topbar({ crumbs = [], actions }) {
  const last = crumbs.length - 1;
  return (
    <header
      className="sticky top-0 flex h-14 items-center justify-between border-b border-border bg-background/85 px-3 backdrop-blur md:px-5"
      style={{ zIndex: Z.topbar }}
    >
      <div className="flex items-center gap-2.5 text-[15px]">
        {crumbs.filter(Boolean).map((c, i) => {
          const cls = cn(
            'appearance-none border-0 bg-transparent transition-opacity hover:opacity-60',
            i === last ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground',
          );
          // Com preflight desligado, <button> herda a fonte do user-agent e um
          // crumb clicável sai MENOR que um crumb estático ao lado. Herdar
          // explicitamente iguala os dois. (Com preflight ligado, pode remover.)
          const fontFix = { fontFamily: 'inherit', fontSize: 'inherit' };
          return (
            <Fragment key={i}>
              {i > 0 && <span className="text-muted-foreground/40">/</span>}
              {c.onClick
                ? <button type="button" onClick={c.onClick} className={cls} style={fontFix}>{c.label}</button>
                : <span className={cls} style={fontFix}>{c.label}</span>}
            </Fragment>
          );
        })}
      </div>
      <div className="relative flex items-center gap-1">{actions}</div>
    </header>
  );
}

/**
 * Pílula de ação da topbar — A MICROINTERAÇÃO-ASSINATURA do sistema.
 *
 * Nasce redonda (só o ícone) e o RÓTULO CRESCE da direita para a esquerda no
 * hover. É o que permite oito ferramentas na topbar sem virar oito ícones mudos
 * nem uma barra de texto.
 *
 * `dot` = há algo não lido. `active` = o painel desta pílula está aberto.
 */
export function ActionPill({ icon: Icon, label, onClick, active, dot, className }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={cn(
        'group/nv relative flex h-9 appearance-none items-center gap-0 overflow-hidden rounded-full border border-border bg-muted/40 px-[7px] text-muted-foreground transition-colors hover:text-foreground',
        active && 'font-semibold text-foreground',
        className,
      )}
    >
      <span className="ml-0 mr-0 max-w-0 overflow-hidden whitespace-nowrap text-sm font-medium opacity-0 transition-all duration-300 group-hover/nv:ml-0.5 group-hover/nv:mr-1.5 group-hover/nv:max-w-[130px] group-hover/nv:opacity-100">
        {label}
      </span>
      <span className="relative flex shrink-0">
        <Icon className="h-5 w-5" />
        {dot && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-primary ring-2 ring-background" />}
      </span>
    </button>
  );
}

/**
 * Popover ancorado à direita da topbar. Um só, mesma posição e largura para
 * TODOS os painéis — a troca de conteúdo é animada, o container não se move.
 *
 * Popovers que mudam de largura conforme o conteúdo fazem a topbar parecer
 * instável; com posição fixa, o usuário aprende onde o painel aparece.
 */
export function TopbarPopover({ panel, children }) {
  return (
    <AnimatePresence>
      {panel && (
        <motion.div
          key="popover"
          initial={{ opacity: 0, y: -8, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.97 }}
          transition={MOTION.tween}
          style={{ zIndex: Z.popover }}
          className="absolute -right-[16px] top-[calc(100%+16px)] w-80 max-w-[92vw] origin-top-right overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-xl"
        >
          <div className="thin-scroll max-h-[75vh] overflow-y-auto overflow-x-hidden">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={panel}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={MOTION.tweenFast}
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * O shell completo.
 *
 * groups   — navegação (ver AppSidebar)
 * crumbs   — breadcrumb da topbar
 * actions  — cluster de ActionPill à direita
 * brand    — logo/wordmark da sidebar
 */
export function AppShell({ groups = [], activeKey, onSelect, crumbs, actions, brand, sidebarFooter, children }) {
  // Estado da sidebar lembrado entre navegações e reloads. PADRÃO: RECOLHIDA —
  // a tela de trabalho começa com o máximo de espaço; quem quer navegar expande.
  const [collapsed, setCollapsed] = useState(() => {
    const stored = localStorage.getItem('ui_sidebar_collapsed');
    return stored === null ? true : stored === '1';
  });

  const handleCollapsed = useCallback((v) => {
    setCollapsed(v);
    try { localStorage.setItem('ui_sidebar_collapsed', v ? '1' : '0'); } catch { /* modo privado */ }
  }, []);

  const flatItems = groups.flatMap((g) => g.items || []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Sidebar fixa em tela cheia (desktop) */}
      <div className="hidden md:block">
        <div className="fixed left-0 top-0 h-full" style={{ zIndex: Z.sidebar }}>
          <AppSidebar
            groups={groups}
            activeKey={activeKey}
            onSelect={onSelect}
            collapsed={collapsed}
            onCollapsedChange={handleCollapsed}
            brand={brand}
            footer={sidebarFooter}
          />
        </div>
      </div>

      {/* Coluna de conteúdo — acompanha a largura da sidebar via variável CSS.
          Animar o padding (e não a margem) evita reflow horizontal do body. */}
      <div
        style={{ '--sidebar-w': collapsed ? LAYOUT.sidebarNavCollapsed : LAYOUT.sidebarNav }}
        className="flex min-h-screen flex-col pl-0 transition-[padding] duration-200 ease-out md:pl-[var(--sidebar-w)]"
      >
        <Topbar crumbs={crumbs} actions={actions} />
        <div className="flex-1">{children}</div>
      </div>

      {/* Dock mobile — MESMOS itens da sidebar */}
      <div className="md:hidden">
        <BottomNav items={flatItems} activeKey={activeKey} onSelect={onSelect} />
      </div>
    </div>
  );
}

export default AppShell;
