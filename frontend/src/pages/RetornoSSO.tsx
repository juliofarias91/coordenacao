/** O pouso do provedor externo — `/entrar/sso?code=…&state=…`.
 *
 *  ESTA TELA É O QUE FALTAVA PARA O SSO EXISTIR. O backend tem cliente OIDC
 *  desde a Fase 0 e `GET /auth/oidc/callback` sempre respondeu a sessão em
 *  JSON — mas quem chega ao `redirect_uri` é o NAVEGADOR, redirecionado pelo
 *  provedor. Apontar o `OIDC_REDIRECT_URI` direto para a API mostrava à pessoa
 *  uma página de JSON cru no fim do login. O `redirect_uri` passa a ser esta
 *  rota do React, que lê `code` e `state` da URL e faz a chamada ela mesma.
 *
 *  ELA NÃO DECIDE NADA. Não sabe se a conta existia, se acabou de ser criada
 *  nem em que organização — quem resolve isso é o callback, com o slug que veio
 *  assinado dentro do `state`. Aqui só se troca o código pela sessão e se sai
 *  do caminho.
 *
 *  A URL É LIMPA NO SUCESSO (`replace`). O `code` do OAuth é de uso único, mas
 *  fica no histórico do navegador e no título da aba; e recarregar a página com
 *  ele ainda lá produziria um erro de "código já usado" a quem só apertou F5.
 */
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import { useAuth } from '@/auth/AuthContext'
import AuthLayout from '@/auth/AuthLayout'
import { useI18n } from '@/i18n'
import { ApiError, api } from '@/lib/api'

export default function RetornoSSO() {
  const { aplicarSessao } = useAuth()
  const { L } = useI18n()
  const navegar = useNavigate()
  const [params] = useSearchParams()
  const [erro, setErro] = useState<string | null>(null)

  const code = params.get('code')
  const state = params.get('state')
  // O provedor devolve `error` quando a pessoa clica em "cancelar" na tela dele.
  const recusado = params.get('error')

  /** UMA VEZ SÓ, e é o ponto deste ref. O `code` do OAuth é de uso único: em
   *  desenvolvimento o StrictMode monta o efeito duas vezes, a segunda chamada
   *  recebe "code already redeemed" do provedor, e o erro apagaria a sessão que
   *  a primeira acabou de obter. */
  const jaFoi = useRef(false)

  useEffect(() => {
    if (jaFoi.current) return
    if (recusado) {
      setErro(L('A entrada foi cancelada no provedor.', 'Sign-in was cancelled at the provider.'))
      return
    }
    if (!code || !state) {
      setErro(L('Retorno incompleto do provedor.', 'Incomplete response from the provider.'))
      return
    }

    jaFoi.current = true
    api.sso
      .concluir(code, state)
      .then((sessao) => {
        aplicarSessao(sessao)
        navegar('/', { replace: true })
      })
      .catch((e) =>
        setErro(
          e instanceof ApiError
            ? e.message
            : L('Não foi possível conectar à API.', 'Could not reach the API.'),
        ),
      )
  }, [code, state, recusado, aplicarSessao, navegar, L])

  if (!erro) {
    return (
      <AuthLayout
        titulo={L('Entrando…', 'Signing in…')}
        sub={L('Conferindo sua identidade com o provedor.', 'Verifying your identity with the provider.')}
      >
        <></>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      titulo={L('Não deu para entrar', 'Could not sign in')}
      sub={erro}
    >
      <div className="auth-campos">
        {/* O 403 do callback diz "identidade sem usuário correspondente", que é
            verdade e não ajuda ninguém. Esta linha diz o que fazer com ela: a
            plataforma não provisiona quem chega sem código de organização. */}
        <p className="hint" style={{ margin: 0 }}>
          {L(
            'Se você ainda não tem conta aqui, crie uma com o código da sua organização — entrar pelo provedor reconhece quem já existe.',
            'If you do not have an account here yet, create one with your organization code — signing in through the provider recognizes existing accounts.',
          )}
        </p>
        <Link className="btn pri block" to="/cadastro">
          {L('Criar conta', 'Create account')}
        </Link>
        <Link className="btn block" to="/">
          {L('Voltar para a entrada', 'Back to sign-in')}
        </Link>
      </div>
    </AuthLayout>
  )
}
