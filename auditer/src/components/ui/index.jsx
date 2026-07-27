import { cn } from '../../lib/cn'

/* Primitivos no dialeto shadcn/tokens — nenhuma cor fora dos tokens HSL. */

const BUTTON_VARIANTS = {
  default: 'bg-primary text-primary-foreground hover:opacity-90',
  outline: 'border border-input bg-background hover:bg-accent',
  secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
  ghost: 'hover:bg-accent',
  destructive: 'text-red-500 hover:bg-red-500/10',
}

const BUTTON_SIZES = {
  default: 'h-10 px-4 py-2',
  sm: 'h-9 px-3',
  lg: 'h-11 px-8',
  icon: 'h-9 w-9',
}

export function Button({ variant = 'default', size = 'default', className, ...props }) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:pointer-events-none disabled:opacity-50',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      {...props}
    />
  )
}

/** Superfície de card canônica do VDCity. */
export function Card({ className, ...props }) {
  return <div className={cn('rounded-2xl border border-border bg-card p-6 shadow-sm', className)} {...props} />
}

const TONES = {
  neutral: 'bg-muted text-muted-foreground',
  primary: 'bg-primary/10 text-primary',
  green: 'bg-emerald-500/10 text-emerald-500',
  amber: 'bg-amber-500/10 text-amber-500',
  red: 'bg-red-500/10 text-red-500',
}

export function Badge({ tone = 'neutral', className, ...props }) {
  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold', TONES[tone], className)}
      {...props}
    />
  )
}

export function Label({ className, ...props }) {
  return <label className={cn('text-xs font-semibold uppercase tracking-wide text-muted-foreground', className)} {...props} />
}

/** Convenção ortodoxa de input (a de Configuracoes). */
const FIELD = 'w-full appearance-none rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-ring disabled:opacity-50'

export function Input({ className, ...props }) {
  return <input className={cn(FIELD, className)} {...props} />
}

export function Select({ className, children, ...props }) {
  return (
    <select className={cn(FIELD, 'cursor-pointer', className)} {...props}>
      {children}
    </select>
  )
}

export function Switch({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="group inline-flex items-center gap-2.5 text-sm text-foreground"
    >
      <span
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full transition-colors',
          checked ? 'bg-primary' : 'bg-muted',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all',
            checked ? 'left-[1.375rem]' : 'left-0.5',
          )}
        />
      </span>
      {label && <span className="text-left">{label}</span>}
    </button>
  )
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border px-6 py-14 text-center">
      {Icon && <Icon className="h-8 w-8 text-muted-foreground/50" strokeWidth={1.5} />}
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {description && <p className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  )
}
