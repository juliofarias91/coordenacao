/** Tema claro/escuro, como no protótipo. O valor inicial é aplicado no
 *  index.html antes da primeira pintura para não piscar. */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

export type Theme = 'light' | 'dark'

const CHAVE = 'spbim_theme'

function carregar(): Theme {
  try {
    const v = localStorage.getItem(CHAVE)
    if (v === 'dark' || v === 'light') return v
  } catch {
    /* localStorage indisponível */
  }
  return 'light'
}

type Ctx = { theme: Theme; setTheme: (t: Theme) => void }

const ThemeContext = createContext<Ctx | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(carregar)

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t)
    document.documentElement.setAttribute('data-theme', t)
    try {
      localStorage.setItem(CHAVE, t)
    } catch {
      /* idem */
    }
  }, [])

  const valor = useMemo(() => ({ theme, setTheme }), [theme, setTheme])
  return <ThemeContext.Provider value={valor}>{children}</ThemeContext.Provider>
}

export function useTheme(): Ctx {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme precisa estar dentro de <ThemeProvider>')
  return ctx
}
