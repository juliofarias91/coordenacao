// ============================================================================
// PEÇAS DA PÁGINA DE TRABALHO — o padrão full-bleed do sistema.
//
// A régua, para quem for montar a próxima tela:
//   full-bleed em calc(100vh - 3.5rem), SEM card, SEM padding de container
//   sidebar de 300px com busca no topo · cabeçalho h-12 · barras internas h-10
//   ATIVO = negrito + cor do texto (NUNCA pílula colorida)
//   ícone em text-muted-foreground, acendendo no hover
//   `disabled` sempre com o motivo no title — o que não acende tem que dizer por quê
//
// Por que estas peças existem em vez de cada tela ter a sua cópia: cópia não é
// reuso — ela some quando o padrão muda, e a tela que não recebeu o ajuste fica
// parecendo outro produto.
// ============================================================================

import { createPortal } from 'react-dom';
import { ChevronRight, Check } from 'lucide-react';
import { cn } from '../lib/utils';
import { Z } from '../lib/design-tokens';

// Botão redondo do cabeçalho — a unidade das barras de ação (h-7).
export const ROUND = 'flex h-7 w-7 shrink-0 appearance-none items-center justify-center rounded-full border transition-colors';
export const ROUND_OFF = 'border-border bg-muted/40 text-muted-foreground hover:text-foreground';
export const ROUND_ON = 'border-foreground/20 text-foreground font-semibold';

// A MICROINTERAÇÃO-ASSINATURA do sistema: o botão nasce redondo e o rótulo
// CRESCE no hover. É o que faz seis ações caberem numa barra sem estourar a
// régua e sem virar seis ícones mudos.
export const GROW = 'group flex h-7 w-7 shrink-0 appearance-none items-center justify-center gap-0 overflow-hidden rounded-full border border-border bg-muted/40 px-0 text-primary transition-all hover:w-auto hover:gap-1.5 hover:bg-muted hover:px-2.5 disabled:opacity-50';
export const GROW_LABEL = 'max-w-0 overflow-hidden whitespace-nowrap text-sm font-semibold opacity-0 transition-all duration-300 group-hover:max-w-[110px] group-hover:opacity-100';

/**
 * Botão da barra de ações.
 *
 * `active` = está SURTINDO EFEITO agora (filtro ligado, modo seleção). Sem essa
 * marca, uma lista filtrada é indistinguível de uma lista vazia — o usuário
 * conclui que não há dados e vai embora.
 *
 * `expand` = versão que cresce no hover (ver GROW acima).
 */
export function ToolBtn({ icon, label, onClick, disabled, title, active, expand }) {
  const Icon = icon;
  const state = disabled
    ? 'cursor-not-allowed border-border/40 bg-transparent text-muted-foreground/40'
    : active
      ? ROUND_ON
      : `group ${ROUND_OFF}`;

  if (expand && label) {
    return (
      <button
        type="button" onClick={onClick} disabled={disabled} title={title || label}
        className={cn(
          'inline-flex h-7 w-7 shrink-0 appearance-none items-center justify-center gap-0 overflow-hidden rounded-full border px-0 transition-all',
          !disabled && 'hover:w-auto hover:gap-1.5 hover:px-2.5',
          state,
        )}
      >
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className="max-w-0 overflow-hidden whitespace-nowrap text-xs font-medium opacity-0 transition-all duration-300 group-hover:max-w-[140px] group-hover:opacity-100">
          {label}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button" onClick={onClick} disabled={disabled} title={title || label}
      className={cn(
        'inline-flex h-7 shrink-0 appearance-none items-center gap-1.5 rounded-full border transition-colors',
        label ? 'px-2.5' : 'w-7 justify-center px-0',
        state,
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      {label && <span className="hidden text-xs font-medium lg:inline">{label}</span>}
    </button>
  );
}

/**
 * Item da sidebar de trabalho.
 *
 * ATIVO É SÓ NEGRITO + COR DO TEXTO. Sem pílula, sem fundo, sem cor de accent.
 * Numa lista de 40 itens, a pílula colorida do ativo compete com os badges de
 * contagem e com o próprio conteúdo; o negrito não compete com nada e é
 * igualmente inequívoco.
 *
 * A contagem vai à direita, na cor do tema: é o que se varre a sidebar
 * procurando.
 */
export function SideItem({ icon, label, active, onClick, onContextMenu, badge, depth = 0, expandable, expanded, onToggle, dot }) {
  const Icon = icon;
  return (
    <div className="flex items-center">
      {expandable ? (
        <button type="button" onClick={onToggle} className="flex h-6 w-4 shrink-0 appearance-none items-center justify-center border-0 bg-transparent text-muted-foreground transition-colors hover:text-foreground">
          <ChevronRight className={cn('h-3 w-3 transition-transform', expanded && 'rotate-90')} />
        </button>
      ) : <span className="w-4 shrink-0" />}
      <button
        type="button" onClick={onClick} onContextMenu={onContextMenu}
        style={{ paddingLeft: `${12 + depth * 12}px` }}
        className={cn(
          'flex w-full min-w-0 flex-1 appearance-none items-center gap-2 rounded-md border-0 bg-transparent py-2 pr-3 text-left text-[13px] transition-colors',
          active ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground hover:text-foreground',
        )}
      >
        {dot
          ? <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: dot }} />
          : Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
        <span className="truncate">{label}</span>
        {badge > 0 && <span className="ml-auto shrink-0 text-[11px] font-semibold text-primary">{badge}</span>}
      </button>
    </div>
  );
}

/**
 * Divisória arrastável entre painéis.
 *
 * Trava cursor e seleção durante o arraste — sem isso, arrastar vai selecionando
 * o texto da tela inteira e o gesto fica impossível de repetir.
 *
 * `flip`: o painel redimensionado está à DIREITA do resizer (arrastar para a
 * direita ENCOLHE em vez de crescer).
 */
export function Resizer({ width, min, max, onChange, flip = false, className = '' }) {
  const start = (e) => {
    e.preventDefault();
    const x0 = e.clientX; const w0 = width;
    const move = (ev) => onChange(Math.min(max, Math.max(min, w0 + (flip ? -1 : 1) * (ev.clientX - x0))));
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      document.body.style.cursor = ''; document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };
  return (
    <div
      onMouseDown={start} title="Arraste para redimensionar"
      className={`group relative z-[5] -mx-0.5 w-1 shrink-0 cursor-col-resize ${className}`}
    >
      <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-transparent transition-colors group-hover:bg-primary" />
    </div>
  );
}

/**
 * Menu — de contexto (botão direito) ou ancorado a um botão. Portal + overlay.
 *
 * Item: { label, icon?, onClick, disabled?, danger?, title?, checked?, sep?,
 *         header?, submenu?, node? }
 *   checked — PRESENTE (mesmo como false) reserva a coluna do ✓. Sem ela os
 *             rótulos dançam para a direita quando a marca aparece.
 *   node    — JSX solto (campo de data, etc.). NÃO fecha o menu ao clicar,
 *             porque preencher e confirmar são dois gestos.
 */
export function WorkMenu({ menu, onClose }) {
  if (!menu) return null;
  return createPortal(
    <>
      <div className="fixed inset-0" style={{ zIndex: Z.contextMenu - 1 }} onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div
        className="fixed min-w-[220px] overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-2xl"
        style={{ top: menu.y, left: menu.x, zIndex: Z.contextMenu }}
      >
        {menu.items.map((it, i) => {
          if (it.sep) return <div key={i} className="my-1 h-px bg-border" />;
          if (it.header) return <p key={i} className="px-2 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">{it.header}</p>;
          if (it.node) return <div key={i}>{it.node}</div>;
          const Icon = it.icon;
          if (it.submenu) {
            return (
              <div key={i} className="group/sub relative">
                <button type="button" disabled={it.disabled} title={it.title} className={cn('flex w-full appearance-none items-center gap-2 rounded border-0 bg-transparent px-2 py-1.5 text-left text-xs transition-colors', it.disabled ? 'cursor-not-allowed text-muted-foreground/40' : 'text-foreground hover:bg-muted')}>
                  {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />} {it.label}
                  <ChevronRight className="ml-auto h-3 w-3 shrink-0" />
                </button>
                {!it.disabled && (
                  <div className="absolute left-full top-0 hidden min-w-[150px] rounded-lg border border-border bg-popover p-1 shadow-2xl group-hover/sub:block">
                    {it.submenu.map((s, j) => (
                      <button key={j} type="button" onClick={() => { s.onClick(); onClose(); }} className="flex w-full appearance-none items-center gap-2 rounded border-0 bg-transparent px-2 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-muted">
                        <span className="h-3 w-3 shrink-0 rounded-full border border-border" style={{ background: s.swatch }} /> {s.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          }
          return (
            <button
              key={i} type="button" disabled={it.disabled} title={it.title}
              onClick={() => { it.onClick(); onClose(); }}
              className={cn(
                'flex w-full appearance-none items-center gap-2 rounded border-0 bg-transparent px-2 py-1.5 text-left text-xs transition-colors',
                it.disabled ? 'cursor-not-allowed text-muted-foreground/40' : it.danger ? 'text-red-500 hover:bg-red-500/10' : 'text-foreground hover:bg-muted',
              )}
            >
              {it.checked !== undefined && <Check className={cn('h-3 w-3 shrink-0', !it.checked && 'invisible')} />}
              {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />} {it.label}
            </button>
          );
        })}
      </div>
    </>,
    document.body,
  );
}
