'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Plus, Minus } from 'lucide-react';

import { cn } from '../lib/utils';
import { LAYOUT, MOTION } from '../lib/design-tokens';

// ============================================================================
// SIDEBAR DE NAVEGAÇÃO — o trilho de 240px.
//
// Não confundir com a sidebar de TRABALHO (300px, dentro de uma ferramenta, com
// busca no topo — essa se monta com workspace-ui.jsx). Esta aqui navega entre
// SEÇÕES do app e nada mais.
//
// Duas decisões que definem o visual:
//
// 1) ITEM ATIVO = SÓ COR + PESO. Sem fundo, sem pílula, sem barra lateral.
//    Numa sidebar de 25 itens agrupados, o retângulo colorido do ativo domina a
//    coluna inteira e vira o elemento mais pesado da tela — sendo que ele só
//    precisa responder "onde eu estou".
//
// 2) RECOLHIDA MANTÉM A ALTURA DOS SLOTS. O cabeçalho de grupo (h-5) vira um
//    divisor de MESMA altura quando recolhida. Sem isso, cada grupo encolhe um
//    pouco e os ícones deslizam verticalmente ao expandir/recolher — a diferença
//    acumula e a animação fica torta.
// ============================================================================

const sidebarVariants = {
  open: { width: LAYOUT.sidebarNav },
  closed: { width: LAYOUT.sidebarNavCollapsed },
};

// Entrada dos rótulos, escalonada. `initial={false}` no container impede que
// isso rode no primeiro paint (só na transição recolher/expandir).
const itemVariants = {
  open: { x: 0, opacity: 1, transition: { x: { stiffness: 1000, velocity: -100 } } },
  closed: { x: -20, opacity: 0, transition: { x: { stiffness: 100 } } },
};

const staggerVariants = { open: { transition: { staggerChildren: 0.03, delayChildren: 0.02 } } };

// Preflight desligado deixa <button> com fundo e borda do user-agent. Se você
// ligou o preflight, pode apagar esta constante e seus usos.
const RESET_BTN = 'appearance-none bg-transparent border-0 outline-none';

/**
 * groups: [{ label?, items: [{ key, label, icon, dot? }] }]
 *   - grupo SEM label = fixo no topo, sem cabeçalho
 *   - item.dot = bolinha de notificação (visível mesmo recolhida)
 * brand: JSX do logo/wordmark no topo (h-14, alinhado com a topbar)
 * footer: JSX opcional no rodapé (convidar, sair…)
 */
export function AppSidebar({
  groups = [],
  activeKey,
  onSelect,
  collapsed = true,
  onCollapsedChange,
  brand,
  footer,
}) {
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const toggleGroup = (label) => setCollapsedGroups((p) => ({ ...p, [label]: !p[label] }));

  return (
    <motion.div
      className="relative h-full shrink-0 border-r border-border"
      initial={false}
      animate={collapsed ? 'closed' : 'open'}
      variants={sidebarVariants}
      transition={{ ...MOTION.tween, staggerChildren: 0.1 }}
    >
      {/* Botão de recolher: círculo saltando da borda direita. Fica SEMPRE
          visível (não só no hover) — um controle que só aparece ao passar o
          mouse não é descoberto por quem não passa o mouse. */}
      <button
        type="button"
        onClick={() => onCollapsedChange?.(!collapsed)}
        title={collapsed ? 'Expandir' : 'Recolher'}
        className={cn(
          RESET_BTN,
          'absolute -right-3 top-[44px] z-50 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm transition-colors hover:text-foreground',
        )}
      >
        {collapsed
          ? <ChevronRight className="h-4 w-4 translate-x-[1px]" />
          : <ChevronLeft className="h-4 w-4 -translate-x-[1px]" />}
      </button>

      <motion.ul variants={staggerVariants} className="flex h-full flex-col bg-background text-muted-foreground">
        {/* Topo: marca. h-14 = mesma altura da topbar, para as duas linharem. */}
        <div className="flex h-14 w-full shrink-0 items-center border-b border-border px-2">
          {brand}
        </div>

        {/* Meio: grupos */}
        <div className="thin-scroll flex grow flex-col gap-3 overflow-y-auto p-2">
          {groups.map((group, gi) => {
            const groupCollapsed = !!collapsedGroups[group.label];
            const showItems = collapsed || !group.label || !groupCollapsed;
            return (
              <div key={group.label || `g-${gi}`} className="flex flex-col gap-1">
                {group.label && (!collapsed ? (
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.label)}
                    className={cn(RESET_BTN, 'flex h-5 w-full cursor-pointer items-center justify-between px-2')}
                  >
                    <motion.span variants={itemVariants} className="truncate text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                      {group.label}
                    </motion.span>
                    <span className="text-muted-foreground/40 transition-colors hover:text-foreground">
                      {groupCollapsed ? <Plus className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                    </span>
                  </button>
                ) : gi > 0 ? (
                  // Recolhida: divisor OCUPANDO A MESMA h-5 do cabeçalho.
                  <div className="flex h-5 items-center px-2"><div className="mx-auto h-px w-5 bg-border" /></div>
                ) : null)}

                {showItems && group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeKey === item.key;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => onSelect?.(item.key)}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        RESET_BTN,
                        'flex h-10 w-full cursor-pointer flex-row items-center rounded-md px-2 py-1.5 transition-colors',
                        isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {Icon && (
                        <span className="relative shrink-0">
                          <Icon className="h-[18px] w-[18px] shrink-0" />
                          {/* ring-2 ring-background: a bolinha "recorta" o fundo
                              e não some ao encostar no ícone. */}
                          {item.dot && <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-primary ring-2 ring-background" />}
                        </span>
                      )}
                      <motion.li variants={itemVariants} className="flex items-center">
                        {!collapsed && (
                          <p className={cn('ml-2 text-sm', isActive ? 'font-semibold' : 'font-medium')}>{item.label}</p>
                        )}
                      </motion.li>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        {footer && <div className="flex flex-col gap-1 px-2 py-3">{footer}</div>}
      </motion.ul>
    </motion.div>
  );
}

export default AppSidebar;
