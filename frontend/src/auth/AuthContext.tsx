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

  /** Sai daqui E no servidor.
   *
   *  Antes isto era só `gravarTokens(null)` — e como o refresh token é um JWT
   *  que ninguém revogava, sair num computador emprestado não tirava a sessão
   *  de lugar nenhum: o token seguia válido por 14 dias. `POST /auth/sair` põe
   *  o corte em `usuario.sessoes_validas_apos`, e o refresh passa a recusá-lo.
   *
   *  A chamada é DISPARADA E ESQUECIDA de propósito: o estado local é limpo em
   *  seguida sem esperar resposta. Se a rede estiver fora, sair da máquina em
   *  que se está é o que mais importa, e travar a interface esperando um 204
   *  deixaria a pessoa presa numa sessão que ela pediu para encerrar.
   */
  const sair = useCallback(() => {
    // A ORDEM DESTAS DUAS LINHAS IMPORTA. `requisitar` lê o token do
    // `localStorage` de forma síncrona, antes do primeiro `await` — então
    // chamar `api.sair()` primeiro garante que ele ainda esteja lá. Limpar
    // antes deixaria a requisição sair sem `Authorization`, tomar 401, e o
    // corte de sessão nunca seria gravado.
    api.sair().catch(() => {
      /* offline, ou token já expirado: o corte não foi gravado, mas sair
         daqui não pode depender disso */
    })
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
