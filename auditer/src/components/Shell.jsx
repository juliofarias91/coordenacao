import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { Check, FileSpreadsheet, Moon, Ruler, Sun } from 'lucide-react'
import { cn } from '../lib/cn'
import { getTheme, toggleTheme } from '../lib/theme'

/** Wordmark da marca: "Audit" pesado e itálico, "er" leve em muted. */
function Wordmark() {
  return (
    <span className="select-none text-[15px] leading-none">
      {/* O tracking negativo também encolhe o espaço depois do "t"; a margem
          devolve esse tanto para o "er" não subir por cima dele. */}
      <span className="font-extrabold italic" style={{ letterSpacing: '-0.09em', marginRight: '0.12em' }}>
        Audit
      </span>
      <span className="text-[0.7em] font-light text-muted-foreground">er</span>
    </span>
  )
}

const TABS = [
  { to: '/', label: 'Auditoria', icon: FileSpreadsheet },
  { to: '/padroes', label: 'Padrões', icon: Ruler },
  { to: '/aceitas', label: 'Aceitas', icon: Check },
]

export default function Shell({ children }) {
  const [theme, setThemeState] = useState(getTheme)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-border bg-background/85 px-5 backdrop-blur">
        <Wordmark />
        <span className="text-border">/</span>

        <nav className="flex items-center gap-1">
          {TABS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex h-9 items-center gap-2 rounded-full px-3.5 text-sm transition-colors',
                  // Estado ativo por cor + peso, sem fundo — convenção da sidebar.
                  isActive ? 'font-semibold text-foreground' : 'text-muted-foreground hover:text-foreground',
                )
              }
            >
              <Icon className="h-4 w-4" strokeWidth={1.75} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto">
          <button
            type="button"
            onClick={() => setThemeState(toggleTheme())}
            aria-label="Alternar tema"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-muted/40 text-muted-foreground transition-colors hover:text-foreground"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-5 py-8">{children}</main>
    </div>
  )
}
