/**
 * Bilíngue PT/EN — mesma abordagem do protótipo: `L('texto pt', 'text en')`.
 *
 * Sem arquivo de tradução por enquanto, e de propósito: os rótulos de domínio
 * (nomes de critério) já nascem bilíngues no banco (`nome_pt` / `nome_en`), e
 * os rótulos de UI ficam legíveis lado a lado no código.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

export type Lang = 'pt' | 'en'

const CHAVE = 'spbim_lang'

function carregar(): Lang {
  try {
    const v = localStorage.getItem(CHAVE)
    if (v === 'pt' || v === 'en') return v
  } catch {
    /* localStorage indisponível (modo privado) — cai no padrão */
  }
  return 'pt'
}

type Ctx = {
  lang: Lang
  setLang: (l: Lang) => void
  L: (pt: string, en: string) => string
}

const I18nContext = createContext<Ctx | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(carregar)

  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    try {
      localStorage.setItem(CHAVE, l)
    } catch {
      /* idem */
    }
    document.documentElement.lang = l === 'pt' ? 'pt-BR' : 'en'
  }, [])

  const L = useCallback((pt: string, en: string) => (lang === 'pt' ? pt : en), [lang])

  const valor = useMemo(() => ({ lang, setLang, L }), [lang, setLang, L])
  return <I18nContext.Provider value={valor}>{children}</I18nContext.Provider>
}

export function useI18n(): Ctx {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n precisa estar dentro de <I18nProvider>')
  return ctx
}
