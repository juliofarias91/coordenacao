/** Esqueci minha senha — `/esqueci-senha` (07/08/2026).
 *
 *  Tela PRÓPRIA, e não mais um botão no login. Até aqui "Esqueci minha senha"
 *  era um `.btn-link` que reaproveitava o campo de e-mail do formulário de
 *  entrada — o que economizava uma tela e custava clareza: o botão ficava ao
 *  lado de um campo de SENHA preenchido, e quem clicava sem preencher o e-mail
 *  levava um erro que não explicava o que a tela queria.
 *
 *  O modelo é o `isResetMode` do `Login.jsx` da VDCity, que troca o formulário
 *  inteiro por um campo só. A diferença é que lá isso é um estado da mesma rota,
 *  e aqui é rota própria: um endereço que se manda a alguém ("entra em
 *  /esqueci-senha") vale mais do que um estado que só existe depois de um
 *  clique.
 *
 *  ═══ ELA SEMPRE DIZ A MESMA COISA
 *
 *  O sucesso é o MESMO texto exista a conta ou não — é o 202 fixo de
 *  `POST /auth/senha/esqueci`. Uma tela que dissesse "não achamos este e-mail"
 *  viraria um verificador de quem tem conta na plataforma, e ela é pública.
 *
 *  Por isso o estado de sucesso substitui o formulário em vez de aparecer acima
 *  dele: com o campo ainda ali, a pessoa tenta de novo achando que não funcionou.
 */
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import AuthLayout from '@/auth/AuthLayout'
import { useI18n } from '@/i18n'
import { ApiError, api } from '@/lib/api'

export default function EsqueciSenha() {
  const { L } = useI18n()
  const [login, setLogin] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  /** A frase que o servidor devolveu. Guardada em vez de escrita aqui: o texto
   *  do 202 é decisão da rota (ele promete prazo e caixa de spam), e duas cópias
   *  divergiriam no dia em que a validade mudasse. */
  const [pronto, setPronto] = useState<string | null>(null)

  async function submeter(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    setEnviando(true)
    try {
      const r = await api.senha.esqueci(login.trim())
      setPronto(r.detalhe)
    } catch (e) {
      setErro(
        e instanceof ApiError
          ? e.message
          : L('Não foi possível conectar à API.', 'Could not reach the API.'),
      )
    } finally {
      setEnviando(false)
    }
  }

  if (pronto) {
    return (
      <AuthLayout
        titulo={L('Confira seu e-mail', 'Check your e-mail')}
        sub={login.trim()}
      >
        <div className="auth-campos">
          <div className="pill ok" style={{ display: 'block', lineHeight: 1.5 }}>
            {pronto}
          </div>
          <Link className="btn pri block" to="/">
            {L('Voltar para a entrada', 'Back to sign-in')}
          </Link>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      titulo={L('Recuperar acesso', 'Recover access')}
      sub={L(
        'Digite o e-mail da sua conta e enviaremos um link para você criar uma senha nova.',
        'Enter your account e-mail and we will send you a link to create a new password.',
      )}
    >
      <form className="auth-campos" onSubmit={submeter}>
        {erro && <div className="erro">{erro}</div>}

        <div>
          <label className="oculto" htmlFor="login">
            {L('E-mail', 'E-mail')}
          </label>
          <input
            id="login"
            className="f"
            type="email"
            autoComplete="username"
            required
            autoFocus
            placeholder={L('Seu e-mail', 'Your e-mail')}
            value={login}
            onChange={(e) => setLogin(e.target.value)}
          />
        </div>

        <button className="btn pri block" type="submit" disabled={enviando}>
          {enviando ? L('Enviando…', 'Sending…') : L('Enviar link', 'Send link')}
        </button>

        <div className="auth-acoes">
          <Link className="btn-link" to="/">
            {L('Voltar para a entrada', 'Back to sign-in')}
          </Link>
        </div>
      </form>
    </AuthLayout>
  )
}
