/** Aceitar um convite de equipe — `/convite/:token` (07/08/2026).
 *
 *  Portada do `AcceptInvite.jsx` da VDCity, com duas diferenças que valem dizer.
 *
 *  ═══ 1. ELA SE APRESENTA ANTES DE AGIR
 *
 *  A original chama `accept_invite` no `useEffect` e redireciona — quem abre o
 *  link nunca vê para que projeto ele serve, e um convite vencido só se anuncia
 *  depois. Aqui a tela chama a PRÉVIA primeiro (`GET /convites-de-equipe/:token`,
 *  o `invite_preview` da origem) e mostra projeto, papel e prazo. O aceite é um
 *  clique.
 *
 *  Não é preciosismo: aceitar é um ato: entra-se num projeto de um cliente real,
 *  com um papel. Um botão dá a quem chegou a chance de ver onde está entrando —
 *  e de perceber que o convite é para o e-mail do trabalho quando ele entrou com
 *  o pessoal.
 *
 *  ═══ 2. O VAI-E-VOLTA DE QUEM AINDA NÃO TEM CONTA (seção 5 da especificação)
 *
 *  É a parte que a especificação diz ser a mais esquecida, e que quebra o fluxo
 *  na prática: sem ela o convidado cai no login, se cadastra, e PERDE o convite.
 *
 *  Aqui: guarda o token em `sessionStorage`, manda para `/cadastro`, e quem
 *  retoma é o `AuthContext` assim que a sessão existe — de lá a navegação volta
 *  para cá com a pessoa logada. É mais curto que na origem (que precisa de três
 *  arquivos) porque o cadastro daqui já devolve sessão pronta.
 *
 *  `sessionStorage` e não `localStorage`: o convite pendente morre com a aba, e
 *  é o que se quer — um token de convite esquecido no navegador de um
 *  computador compartilhado é acesso a projeto de cliente.
 */
import { useCallback, useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { useAuth } from '@/auth/AuthContext'
import AuthLayout from '@/auth/AuthLayout'
import { rotuloPapel } from '@/components/TabelaMembros'
import { useI18n } from '@/i18n'
import { ApiError, api } from '@/lib/api'
import type { ConvitePrevia } from '@/lib/types'

/** Onde o token espera enquanto a pessoa cria a conta. Exportado porque quem o
 *  consome é o `AuthContext` — e duas grafias da mesma chave seria um convite
 *  gravado e nunca lido. */
export const CHAVE_CONVITE = 'spbim_convite_pendente'

/** A VOLTA: quem acabou de entrar e tinha um convite pendente é levado de volta
 *  a ele. É o passo 4 da seção 5 da especificação de origem — lá ele mora no
 *  `Home.jsx`, e sem ele o convidado se cadastra e o token some.
 *
 *  Vive no App, e não no `AuthContext`, por uma razão mecânica: o `AuthProvider`
 *  é montado FORA do `BrowserRouter` (ver `main.tsx`), então ele não tem
 *  `useNavigate`. Aqui dentro tem.
 *
 *  CONSOME A CHAVE ANTES DE NAVEGAR. Se a navegação falhar ou a pessoa voltar, o
 *  token não pode disparar um segundo redirecionamento — senão qualquer tentativa
 *  de sair da tela de convite traria de volta para ela. */
export function RetomarConvite() {
  const { usuario } = useAuth()
  const navegar = useNavigate()

  useEffect(() => {
    if (!usuario) return
    const token = sessionStorage.getItem(CHAVE_CONVITE)
    if (!token) return
    sessionStorage.removeItem(CHAVE_CONVITE)
    navegar(`/convite/${token}`, { replace: true })
  }, [usuario, navegar])

  return null
}

/** `/cadastro?convite=…` PARA QUEM JÁ ESTÁ DENTRO.
 *
 *  O link do e-mail aponta para a tela de cadastro, e quem já tem sessão clica
 *  nele do mesmo jeito — é o caso de alguém convidado para um SEGUNDO projeto.
 *  Na árvore autenticada `/cadastro` não existe: sem esta rota a pessoa cairia
 *  no catch-all da home e perderia o convite sem nenhum aviso.
 *
 *  Manda para o aceite, que é a tela certa para quem já tem conta — ela mostra o
 *  projeto e entra com um clique, sem oferecer um formulário de cadastro a quem
 *  já se cadastrou. */
export function ConviteDoCadastro() {
  const [params] = useSearchParams()
  const token = params.get('convite')
  return <Navigate to={token ? `/convite/${token}` : '/'} replace />
}

type Estado =
  | { fase: 'conferindo' }
  | { fase: 'invalido'; mensagem: string }
  | { fase: 'pronto'; previa: ConvitePrevia }
  | { fase: 'feito'; previa: ConvitePrevia }

export default function Convite() {
  const { token = '' } = useParams()
  const { usuario, carregando } = useAuth()
  const { L } = useI18n()
  const navegar = useNavigate()

  const [estado, setEstado] = useState<Estado>({ fase: 'conferindo' })
  const [erro, setErro] = useState<string | null>(null)
  const [aceitando, setAceitando] = useState(false)

  const conferir = useCallback(async () => {
    try {
      setEstado({ fase: 'pronto', previa: await api.convitesDeEquipe.previa(token) })
    } catch (e) {
      setEstado({
        fase: 'invalido',
        mensagem:
          e instanceof ApiError
            ? e.message
            : L('Não foi possível conectar à API.', 'Could not reach the API.'),
      })
    }
  }, [token, L])

  useEffect(() => {
    conferir()
  }, [conferir])

  async function aceitar() {
    // SEM SESSÃO, VAI PARA O CADASTRO COM O CONVITE NA URL. Desde 07/08/2026 é
    // `/cadastro?convite=…` e não `/cadastro` puro: aquela tela sabe ler o
    // token, e é ela que o link do e-mail abre. Mandá-la sem o parâmetro faria
    // esta rota perder o resumo do projeto e o e-mail travado.
    //
    // O `sessionStorage` fica junto, e não é redundância: ele é o que sobrevive
    // se a pessoa clicar em "já tenho conta" e sair para o login.
    if (!usuario) {
      sessionStorage.setItem(CHAVE_CONVITE, token)
      navegar(`/cadastro?convite=${encodeURIComponent(token)}`)
      return
    }
    setErro(null)
    setAceitando(true)
    try {
      const previa = await api.convitesDeEquipe.aceitar(token)
      setEstado({ fase: 'feito', previa })
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : String(e))
    } finally {
      setAceitando(false)
    }
  }

  if (carregando || estado.fase === 'conferindo') {
    return (
      <AuthLayout
        titulo={L('Conferindo o convite…', 'Checking the invitation…')}
        sub={L('Um instante.', 'One moment.')}
      >
        <></>
      </AuthLayout>
    )
  }

  if (estado.fase === 'invalido') {
    return (
      <AuthLayout titulo={L('Convite não vale mais', 'Invitation no longer valid')} sub={estado.mensagem}>
        <div className="auth-campos">
          <p className="hint" style={{ margin: 0 }}>
            {L(
              'Links de convite duram 3 dias, e os que são para um e-mail específico valem uma vez só. Peça outro a quem coordena o projeto.',
              'Invitation links last 3 days, and those addressed to a specific e-mail work once. Ask the project coordinator for a new one.',
            )}
          </p>
          <button className="btn pri block" onClick={() => navegar('/')}>
            {L('Ir para a entrada', 'Go to sign-in')}
          </button>
        </div>
      </AuthLayout>
    )
  }

  const { previa } = estado
  const projeto = `${previa.projeto_codigo} · ${previa.projeto_nome}`

  if (estado.fase === 'feito') {
    return (
      <AuthLayout titulo={L('Você entrou no projeto', 'You joined the project')} sub={projeto}>
        <div className="auth-campos">
          <button className="btn pri block" onClick={() => navegar('/')}>
            {L('Abrir a plataforma', 'Open the platform')}
          </button>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      titulo={L('Você foi convidado', 'You have been invited')}
      sub={previa.organizacao}
    >
      <div className="auth-campos">
        {erro && <div className="erro">{erro}</div>}

        {/* O QUE SE ESTÁ ACEITANDO, antes do botão. É a diferença em relação à
            origem, que aceita sozinha e nunca mostra isto. */}
        <div className="auth-conv">
          <div className="auth-conv-linha">
            <span>{L('Projeto', 'Project')}</span>
            <strong>{projeto}</strong>
          </div>
          <div className="auth-conv-linha">
            <span>{L('Seu papel', 'Your role')}</span>
            {/* O RÓTULO, não o valor do banco: quem recebe o convite lê
                "Colaborador", não "auditor". A lista vem de `PAPEIS_PROJETO`
                para as duas telas dizerem a mesma palavra. */}
            <strong>{rotuloPapel(previa.papel, L)}</strong>
          </div>
          {previa.equipe && (
            <div className="auth-conv-linha">
              <span>{L('Equipe', 'Team')}</span>
              <strong>{previa.equipe}</strong>
            </div>
          )}
          {previa.acesso_expira_em && (
            <div className="auth-conv-linha">
              <span>{L('Acesso até', 'Access until')}</span>
              <strong>{new Date(previa.acesso_expira_em).toLocaleDateString()}</strong>
            </div>
          )}
        </div>

        {previa.ja_e_membro && (
          <p className="hint" style={{ margin: 0 }}>
            {L(
              'Você já está neste projeto. Aceitar de novo só atualiza o seu papel e o prazo.',
              'You are already on this project. Accepting again only updates your role and deadline.',
            )}
          </p>
        )}

        <button className="btn pri block" onClick={aceitar} disabled={aceitando}>
          {aceitando
            ? L('Entrando…', 'Joining…')
            : usuario
              ? L('Entrar no projeto', 'Join the project')
              : L('Criar conta e entrar', 'Create account and join')}
        </button>

        {/* ⚠ O AVISO DO E-MAIL TRAVADO, e ele é o mais útil da tela. O erro real
            que ele evita: a pessoa recebe o convite no e-mail do trabalho e
            entra com o Google pessoal — aí o aceite recusa, e sem esta linha ela
            tenta de novo do mesmo jeito. */}
        {previa.email && (
          <p className="hint" style={{ marginTop: 4 }}>
            {L(
              `Este convite é para ${previa.email}. Entre ou cadastre-se com esse endereço.`,
              `This invitation is for ${previa.email}. Sign in or sign up with that address.`,
            )}
          </p>
        )}
      </div>
    </AuthLayout>
  )
}
