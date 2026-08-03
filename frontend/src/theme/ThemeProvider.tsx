/** Tema: APARÊNCIA e COR DE DESTAQUE — o sistema do VDCity (`services/theme.js`).
 *
 *  Duas preferências independentes, as duas do NAVEGADOR e não da conta:
 *
 *    aparência  claro · escuro · AUTO (segue o sistema operacional)
 *    destaque   dez amostras, sendo a primeira o azul da SPBIM
 *
 *  `auto` é a novidade estrutural, e é por causa dela que existem DOIS valores.
 *  `modo` é o que a pessoa escolheu e é o que se guarda; `theme` é o que está
 *  valendo agora — e com `auto` eles divergem, porque quem decide é o sistema
 *  operacional. Guardar só o resolvido, como se fazia antes, perde a escolha:
 *  quem pediu "auto" às 10h viraria "claro" para sempre.
 *
 *  A COR aplica em `useLayoutEffect`, que o React roda ANTES da primeira
 *  pintura. É o que dispensa duplicar a matemática de cor no script do
 *  `index.html` — lá fica só a aparência, que precisa valer antes até do React
 *  carregar para a tela não piscar branca.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import { aplicarAccent, type Accent, type Aparencia } from '@/theme/cores'

export type Theme = 'light' | 'dark'

/** `spbim_theme` guardava o tema RESOLVIDO e passou a guardar o modo, que pode
 *  ser `auto`. A chave é a mesma de propósito: os valores antigos ('light' e
 *  'dark') continuam sendo modos válidos, então quem já usava a plataforma não
 *  perde a preferência nem cai num default diferente do que tinha. */
const CHAVE_MODO = 'spbim_theme'
const CHAVE_ACCENT = 'spbim_accent'

function preferenciaDoSistema(): Theme {
  return typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

function lerModo(): Aparencia {
  try {
    const v = localStorage.getItem(CHAVE_MODO)
    if (v === 'dark' || v === 'light' || v === 'auto') return v
  } catch {
    /* localStorage indisponível */
  }
  return 'light'
}

function lerAccent(): Accent {
  try {
    const v = localStorage.getItem(CHAVE_ACCENT)
    // Só hex de seis dígitos entra. O valor vem do localStorage, que qualquer
    // extensão escreve — e um lixo aqui viraria `--accent: banana` no `<html>`,
    // que o CSS aceita calado e pinta de preto.
    if (v && /^#[0-9a-f]{6}$/i.test(v)) return v
  } catch {
    /* idem */
  }
  return null
}

type Ctx = {
  /** O tema VALENDO agora. Com `modo: 'auto'`, quem o define é o SO. */
  theme: Theme
  /** Atalho de alternância — o botão sol/lua da topbar. Fixa o modo, e é o que
   *  se espera de quem clicou: pedir "escuro" explicitamente sai do automático. */
  setTheme: (t: Theme) => void
  /** A ESCOLHA, que é o que se guarda. */
  modo: Aparencia
  setModo: (m: Aparencia) => void
  /** `null` = o azul da SPBIM, governado pelo `tokens.css`. */
  accent: Accent
  setAccent: (a: Accent) => void
}

const ThemeContext = createContext<Ctx | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [modo, setModoState] = useState<Aparencia>(lerModo)
  const [sistema, setSistema] = useState<Theme>(preferenciaDoSistema)
  const [accent, setAccentState] = useState<Accent>(lerAccent)

  const theme: Theme = modo === 'auto' ? sistema : modo

  // O SO pode trocar com a plataforma aberta — anoitece, ou a pessoa muda a
  // preferência do sistema. Só importa em `auto`, mas o listener fica sempre
  // ligado: `sistema` também alimenta a amostra "Auto" do seletor.
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!mq) return
    const aoTrocar = (e: MediaQueryListEvent) => setSistema(e.matches ? 'dark' : 'light')
    mq.addEventListener('change', aoTrocar)
    return () => mq.removeEventListener('change', aoTrocar)
  }, [])

  // ANTES DA PINTURA, e não em `useEffect`: o atributo do `<html>` já foi
  // escrito pelo script do `index.html`, mas a cor escolhida não — sem
  // `useLayoutEffect` a primeira tela sairia no azul da SPBIM e trocaria de cor
  // no frame seguinte.
  useLayoutEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    aplicarAccent(accent, theme === 'dark')
  }, [theme, accent])

  const setModo = useCallback((m: Aparencia) => {
    setModoState(m)
    try {
      localStorage.setItem(CHAVE_MODO, m)
    } catch {
      /* modo privado: a preferência vale só nesta sessão */
    }
  }, [])

  const setTheme = useCallback((t: Theme) => setModo(t), [setModo])

  const setAccent = useCallback((a: Accent) => {
    setAccentState(a)
    try {
      if (a) localStorage.setItem(CHAVE_ACCENT, a)
      else localStorage.removeItem(CHAVE_ACCENT)
    } catch {
      /* idem */
    }
  }, [])

  const valor = useMemo(
    () => ({ theme, setTheme, modo, setModo, accent, setAccent }),
    [theme, setTheme, modo, setModo, accent, setAccent],
  )
  return <ThemeContext.Provider value={valor}>{children}</ThemeContext.Provider>
}

export function useTheme(): Ctx {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme precisa estar dentro de <ThemeProvider>')
  return ctx
}
