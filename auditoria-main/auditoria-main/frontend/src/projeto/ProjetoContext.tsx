/** Projeto corrente.
 *
 *  O esquema é multi-projeto desde a Fase 0, mas quase toda tela opera sobre
 *  um projeto por vez — como no protótipo, que mostra o código do projeto na
 *  barra lateral com um "trocar" ao lado.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import { api } from '@/lib/api'
import type { Projeto } from '@/lib/types'

const CHAVE = 'spbim_projeto'

type Ctx = {
  projetos: Projeto[]
  projeto: Projeto | null
  selecionar: (id: string) => void
  recarregar: () => Promise<void>
  carregando: boolean
}

const ProjetoContext = createContext<Ctx | null>(null)

export function ProjetoProvider({ children }: { children: ReactNode }) {
  const [projetos, setProjetos] = useState<Projeto[]>([])
  const [projetoId, setProjetoId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(CHAVE)
    } catch {
      return null
    }
  })
  const [carregando, setCarregando] = useState(true)

  const recarregar = useCallback(async () => {
    const pagina = await api.projetos.listar()
    setProjetos(pagina.itens)
    // Se o projeto guardado sumiu (ou nunca houve), cai no primeiro da lista.
    setProjetoId((atual) =>
      atual && pagina.itens.some((p) => p.id === atual) ? atual : (pagina.itens[0]?.id ?? null),
    )
  }, [])

  useEffect(() => {
    recarregar()
      .catch(() => setProjetos([]))
      .finally(() => setCarregando(false))
  }, [recarregar])

  const selecionar = useCallback((id: string) => {
    setProjetoId(id)
    try {
      localStorage.setItem(CHAVE, id)
    } catch {
      /* localStorage indisponível */
    }
  }, [])

  const projeto = useMemo(
    () => projetos.find((p) => p.id === projetoId) ?? null,
    [projetos, projetoId],
  )

  const valor = useMemo(
    () => ({ projetos, projeto, selecionar, recarregar, carregando }),
    [projetos, projeto, selecionar, recarregar, carregando],
  )
  return <ProjetoContext.Provider value={valor}>{children}</ProjetoContext.Provider>
}

export function useProjeto(): Ctx {
  const ctx = useContext(ProjetoContext)
  if (!ctx) throw new Error('useProjeto precisa estar dentro de <ProjetoProvider>')
  return ctx
}
