import { useState, type FormEvent } from 'react'

import { useAuth } from '@/auth/AuthContext'
import { useI18n } from '@/i18n'
import { ApiError } from '@/lib/api'

export default function Login() {
  const { entrar } = useAuth()
  const { L } = useI18n()
  const [login, setLogin] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function submeter(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    setEnviando(true)
    try {
      await entrar(login, senha)
    } catch (err) {
      setErro(
        err instanceof ApiError
          ? err.message
          : L('Não foi possível conectar à API.', 'Could not reach the API.'),
      )
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="loginwrap">
      <form className="logincard" onSubmit={submeter}>
        <div className="loginlogo">SPBIM</div>
        <div className="logintitle">{L('Central de Auditoria BIM', 'BIM Audit Center')}</div>
        <div className="loginsub">
          {L('Entre com sua conta para continuar.', 'Sign in to continue.')}
        </div>

        {erro && <div className="erro">{erro}</div>}

        <div style={{ marginBottom: 14 }}>
          <label htmlFor="login">{L('E-mail', 'E-mail')}</label>
          <input
            id="login"
            className="f"
            type="email"
            autoComplete="username"
            required
            value={login}
            onChange={(e) => setLogin(e.target.value)}
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label htmlFor="senha">{L('Senha', 'Password')}</label>
          <input
            id="senha"
            className="f"
            type="password"
            autoComplete="current-password"
            required
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
          />
        </div>

        <button className="btn pri block" type="submit" disabled={enviando}>
          {enviando ? L('Entrando…', 'Signing in…') : L('Entrar', 'Sign in')}
        </button>

        <p className="hint">
          {L(
            'O acesso por SSO/Autodesk entra quando o provedor for definido (decisão em aberto nº 2 do plano técnico).',
            'SSO/Autodesk sign-in lands once the provider is chosen (open decision #2 in the technical plan).',
          )}
        </p>
      </form>
    </div>
  )
}
