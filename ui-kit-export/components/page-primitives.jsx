// ============================================================================
// PRIMITIVOS DE PÁGINA "CARD" — Header, Card, Kpi, KpiRow, Toolbar, EmptyState,
// Bars, Progress.
//
// Este é o STYLE GUIDE VIVO do sistema: qualquer tela nova de config/form/
// dashboard pontual se monta compondo estas peças. Se uma tela precisa de algo
// que não está aqui, ou a peça falta (adicione-a AQUI) ou a tela é do tipo
// full-bleed (use workspace-ui.jsx).
// ============================================================================

import { Plus, Search, ListFilter } from 'lucide-react';
import { cn } from '../lib/utils';
import { TONES } from '../lib/design-tokens';

/**
 * Cabeçalho de página. Ícone em quadrado arredondado com fundo /10, título,
 * subtítulo explicativo e a ação primária à direita.
 *
 * O subtítulo NÃO é decorativo: é onde a tela diz o que faz. Sem ele, o usuário
 * descobre a função da tela clicando.
 */
export function PageHeader({ icon: Icon, title, subtitle, action, onAction }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        {Icon && (
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="h-5 w-5" />
          </span>
        )}
        <div>
          <h1 className="text-xl font-bold text-foreground">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {action && (
        <button
          type="button" onClick={onAction}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> {action}
        </button>
      )}
    </div>
  );
}

/**
 * Card de conteúdo. A SUPERFÍCIE CANÔNICA do sistema:
 *   rounded-2xl · border-border · bg-card · shadow-sm
 *
 * O título do card é micro-tipografia em caixa alta, não um <h2> grande — o card
 * é uma seção dentro da página, não uma página dentro da página.
 */
export function Card({ title, action, className, children }) {
  return (
    <div className={cn('rounded-2xl border border-border bg-card p-5 shadow-sm', className)}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

/**
 * KPI. O ícone à direita carrega o TOM (verde/âmbar/vermelho) — o número em si
 * fica sempre em text-foreground.
 *
 * Colorir o NÚMERO é o erro comum: uma fileira de KPIs coloridos vira semáforo e
 * perde-se qual valor é grande. O tom no ícone marca a natureza da métrica sem
 * competir com a leitura do valor.
 */
export function Kpi({ icon: Icon, label, value, hint, tone = 'primary' }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
        {Icon && <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg', TONES[tone])}><Icon className="h-4 w-4" /></span>}
      </div>
      <div className="mt-3 text-2xl font-bold text-foreground">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

// Fileira de KPIs. 4 no desktop, 2 no tablet, 1 no telefone.
export function KpiRow({ items }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((k) => <Kpi key={k.label} {...k} />)}
    </div>
  );
}

// Barra de busca + filtros. Pílulas h-10, mesma altura, mesma borda.
export function Toolbar({ placeholder = 'Buscar…', value, onChange, onFilter, filterActive }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex h-10 min-w-[200px] flex-1 items-center gap-2 rounded-full border border-border bg-muted/40 px-4 text-sm">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          value={value} onChange={(e) => onChange?.(e.target.value)} placeholder={placeholder}
          className="w-full bg-transparent text-foreground outline-none placeholder:text-muted-foreground/70"
        />
      </div>
      {onFilter && (
        <button
          type="button" onClick={onFilter}
          className={cn(
            'flex h-10 items-center gap-2 rounded-full border px-4 text-sm transition-colors',
            filterActive ? 'border-foreground/20 font-semibold text-foreground' : 'border-border bg-muted/40 text-muted-foreground hover:text-foreground',
          )}
        >
          <ListFilter className="h-4 w-4" /> Filtros
        </button>
      )}
    </div>
  );
}

/**
 * Estado vazio. Borda TRACEJADA — é o sinal de "aqui caberia algo" em oposição à
 * borda sólida de "aqui há algo". O texto deve dizer o próximo passo, não só
 * "nenhum resultado".
 */
export function EmptyState({ icon: Icon, text, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border py-12 text-center">
      {Icon && <Icon className="h-7 w-7 text-muted-foreground/40" />}
      <p className="text-sm text-muted-foreground">{text}</p>
      {action}
    </div>
  );
}

// Gráfico de barras minimalista (sem biblioteca). Para tendência, não para
// leitura precisa de valor — se o número importa, ponha um KPI ao lado.
export function Bars({ data, labels, tone = 'bg-primary/30' }) {
  return (
    <>
      <div className="flex h-32 items-end gap-1.5">
        {data.map((h, i) => <div key={i} className={cn('flex-1 rounded-t', tone)} style={{ height: `${h}%` }} />)}
      </div>
      {labels && (
        <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
          {labels.map((l) => <span key={l}>{l}</span>)}
        </div>
      )}
    </>
  );
}

// Barra de progresso. Trilho bg-muted, preenchimento bg-primary/60.
export function Progress({ value, label, hint }) {
  return (
    <div>
      {(label || hint) && (
        <div className="mb-1 flex justify-between gap-2 text-sm">
          <span className="truncate text-foreground">{label}</span>
          <span className="shrink-0 text-muted-foreground">{hint ?? `${value}%`}</span>
        </div>
      )}
      <div className="h-1.5 rounded-full bg-muted">
        <div className="h-1.5 rounded-full bg-primary/60" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

/**
 * Lista/tabela simples dentro de um card. Divisores por border-t, sem zebra.
 * columns: [{ key, header, className?, render?(row) }]
 */
export function DataTable({ columns, rows, onRowClick, empty = 'Nenhum registro.' }) {
  if (!rows.length) return <EmptyState text={empty} />;
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="hidden border-b border-border bg-muted/30 px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground sm:flex sm:gap-3">
        {columns.map((c) => <span key={c.key} className={cn('flex-1', c.className)}>{c.header}</span>)}
      </div>
      {rows.map((row, i) => (
        <div
          key={row.id ?? i}
          onClick={onRowClick ? () => onRowClick(row) : undefined}
          className={cn(
            'flex items-center gap-3 px-4 py-3 text-sm',
            i > 0 && 'border-t border-border',
            onRowClick && 'cursor-pointer transition-colors hover:bg-foreground/[0.03]',
          )}
        >
          {columns.map((c) => (
            <span key={c.key} className={cn('min-w-0 flex-1 truncate', c.className)}>
              {c.render ? c.render(row) : row[c.key]}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
