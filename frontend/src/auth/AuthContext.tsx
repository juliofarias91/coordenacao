/** Sessão do usuário. Substitui o mock client-side do protótipo: aqui o
 *  usuário só existe se a API disser que existe. */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import { api, gravarTokens, lerTokens, type Usuario } from '@/lib/api'

type Ctx = {
  usuario: Usuario | null
  carregando: boolean
  entrar: (login: string, senha: string, org?: string) => Promise<void>
  sair: () => void
  pode: (permissao: string) => boolean
}

const AuthContext = createContext<Ctx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [carregando, setCarregando] = useState(true)

  // Reidrata a sessão a partir do token guardado.
  useEffect(() => {
    let ativo = true
    if (!lerTokens()) {
      setCarregando(false)
      return
    }
    api
      .me()
      .then((u) => {
        if (ativo) setUsuario(u)
      })
      .catch(() => {
        gravarTokens(null)
      })
      .finally(() => {
        if (ativo) setCarregando(false)
      })
    return () => {
      ativo = false
    }
  }, [])

  const entrar = useCallback(async (login: string, senha: string, org?: string) => {
    const sessao = await api.login(login, senha, org)
    gravarTokens(sessao.tokens)
    setUsuario(sessao.usuario)
  }, [])

  const sair = useCallback(() => {
    gravarTokens(null)
    setUsuario(null)
  }, [])

  const pode = useCallback(
    (permissao: string) => !!usuario?.permissoes.includes(permissao),
    [usuario],
  )

  const valor = useMemo(
    () => ({ usuario, carregando, entrar, sair, pode }),
    [usuario, carregando, entrar, sair, pode],
  )
  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>
}

export function useAuth(): Ctx {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>')
  return ctx
}
