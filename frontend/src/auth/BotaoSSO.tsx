/** Entrar pelo provedor externo — hoje o Google.
 *
 *  O BOTÃO NÃO SABE QUE É GOOGLE, e é de propósito. O backend tem um cliente
 *  OIDC genérico desde a Fase 0 (`core/oidc.py`); o que faltava era a tela.
 *  Quem diz o nome do provedor é `GET /auth/config`, que o lê do `OIDC_ISSUER` —
 *  apontar o issuer para a Autodesk troca o rótulo e mais nada. Escrever
 *  "Google" aqui obrigaria a mexer no React no dia em que a decisão aberta nº 2
 *  do plano técnico for resolvida a favor da identidade Autodesk.
 *
 *  ELE NÃO APARECE QUANDO NÃO HÁ PROVEDOR. Um botão que só pode responder 501
 *  é pior do que botão nenhum: promete um caminho de entrada que não existe, e
 *  quem o tenta conclui que a plataforma está fora do ar.
 *
 *  O DESENHO É O "G" OFICIAL, em quatro cores, e é a segunda exceção da regra 2
 *  nesta tela — depois dos glows do fundo. Cor aqui não é decoração nem estado:
 *  é MARCA, e é o que faz o botão ser reconhecido antes de lido. Redesenhá-lo
 *  em `currentColor` para "respeitar o sistema" produziria um G cinza que não é
 *  o do Google e que as diretrizes do provedor não permitem. Quando o issuer não
 *  for um dos conhecidos, cai no cadeado neutro — aí não há marca a respeitar.
 *
 *  `org` VIAJA ATÉ O SERVIDOR e volta assinado dentro do `state`: é ele que diz
 *  ao callback em que organização a conta PODE nascer. A tela de entrar não o
 *  manda (quem entra já existe); a de cadastro manda. Ver `oidc_login`, em
 *  `api/v1/auth.py`.
 */
import { useState } from 'react'

import { useI18n } from '@/i18n'
import { ApiError, api } from '@/lib/api'

function MarcaGoogle() {
  return (
    <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M45.1 24.5c0-1.6-.1-2.7-.4-3.9H24v7.1h12.1c-.2 1.8-1.6 4.6-4.5 6.4l6.9 5.4c4.1-3.8 6.6-9.4 6.6-15z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.9 0 10.9-2 14.5-5.3l-6.9-5.4c-1.9 1.3-4.4 2.2-7.6 2.2-5.8 0-10.7-3.8-12.5-9.1l-7.1 5.5C8.1 41.1 15.4 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.5 28.4c-.5-1.4-.7-2.9-.7-4.4s.3-3 .7-4.4l-7.1-5.5C2.9 17 2 20.4 2 24s.9 7 2.4 9.9l7.1-5.5z"
      />
      <path
        fill="#EA4335"
        d="M24 10.5c4.1 0 6.9 1.8 8.5 3.3l6.1-6C34.9 4.4 29.9 2 24 2 15.4 2 8.1 6.9 4.4 14.1l7.1 5.5c1.8-5.3 6.7-9.1 12.5-9.1z"
      />
    </svg>
  )
}

function Cadeado() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="4" y="10.5" width="16" height="10.5" rx="2.5" />
      <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
    </svg>
  )
}

export default function BotaoSSO({
  rotulo,
  org,
  onErro,
}: {
  /** O nome do provedor, vindo de `/auth/config`. */
  rotulo: string
  /** Código da organização — só na tela de cadastro. */
  org?: string
  onErro: (mensagem: string) => void
}) {
  const { L } = useI18n()
  const [indo, setIndo] = useState(false)

  async function ir() {
    onErro('')
    setIndo(true)
    try {
      const { authorization_url } = await api.sso.iniciar(org)
      // TROCA A PÁGINA, não abre popup: o fluxo do OIDC termina num
      // redirecionamento do provedor de volta para `/entrar/sso`, e popup
      // bloqueado é o modo mais comum de um login social simplesmente não
      // acontecer sem dizer por quê.
      window.location.assign(authorization_url)
    } catch (e) {
      // Só volta a habilitar no ERRO. No sucesso a navegação já está a caminho,
      // e reabilitar deixaria o botão clicável durante o redirecionamento —
      // dois cliques disparam dois `state`, e o segundo invalida o primeiro.
      setIndo(false)
      onErro(
        e instanceof ApiError
          ? e.message
          : L('Não foi possível conectar à API.', 'Could not reach the API.'),
      )
    }
  }

  const google = rotulo === 'Google'

  return (
    <button type="button" className="auth-sso" onClick={ir} disabled={indo}>
      {google ? <MarcaGoogle /> : <Cadeado />}
      {indo
        ? L('Redirecionando…', 'Redirecting…')
        : L(`Continuar com ${rotulo}`, `Continue with ${rotulo}`)}
    </button>
  )
}
