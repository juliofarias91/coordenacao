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

import { api, gravarTokens, lerTokens, type Sessao, type Usuario } from '@/lib/api'

type Ctx = {
  usuario: Usuario | null
  carregando: boolean
  entrar: (login: string, senha: string, org?: string) => Promise<void>
  /** Cria a própria conta e JÁ ENTRA com ela. Ver `POST /auth/cadastro`. */
  cadastrar: (dados: { login: string; senha: string; nome?: string }) => Promise<void>
  /** Adota uma sessão que veio pronta de outro caminho — hoje só o retorno do
   *  SSO, que recebe os tokens de `GET /auth/oidc/callback` e não passa por
   *  `entrar` porque nunca houve senha para digitar. */
  aplicarSessao: (sessao: Sessao) => void
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

  /** O ÚNICO lugar que grava tokens e usuário juntos.
   *
   *  As três portas de entrada — senha, cadastro e SSO — terminam aqui de
   *  propósito: as três recebem o mesmo `SessaoOut` do servidor, e cada uma com
   *  o seu par de linhas seria três lugares para esquecer de gravar o token, ou
   *  para gravá-lo antes de o usuário existir. */
  const aplicarSessao = useCallback((sessao: Sessao) => {
    gravarTokens(sessao.tokens)
    setUsuario(sessao.usuario)
  }, [])

  const entrar = useCallback(
    async (login: string, senha: string, org?: string) => {
      aplicarSessao(await api.login(login, senha, org))
    },
    [aplicarSessao],
  )

  const cadastrar = useCallback(
    async (dados: { login: string; senha: string; nome?: string }) => {
      aplicarSessao(await api.cadastro(dados))
    },
    [aplicarSessao],
  )

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
    () => ({ usuario, carregando, entrar, cadastrar, aplicarSessao, sair, pode }),
    [usuario, carregando, entrar, cadastrar, aplicarSessao, sair, pode],
  )
  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>
}

export function useAuth(): Ctx {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>')
  return ctx
}
