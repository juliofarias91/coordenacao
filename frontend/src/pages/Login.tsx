import { useState, type FormEvent } from 'react'

import { useAuth } from '@/auth/AuthContext'
import AuthLayout from '@/auth/AuthLayout'
import CampoSenha from '@/auth/CampoSenha'
import { useI18n } from '@/i18n'
import { ApiError, api } from '@/lib/api'

export default function Login() {
  const { entrar } = useAuth()
  const { L } = useI18n()
  const [login, setLogin] = useState('')
  const [senha, setSenha] = useState('')
  const [org, setOrg] = useState('')
  /** O campo de organização SÓ APARECE quando a API pede — no 409 de
   *  `/auth/login`. Exibi-lo sempre obrigaria todo mundo a saber o slug do
   *  próprio tenant para uma ambiguidade que quase nunca existe: o backend
   *  desempata pela senha, e só desiste quando a mesma senha vale em duas
   *  organizações. */
  const [pedeOrg, setPedeOrg] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  /** A resposta do pedido de redefinição. É sempre a mesma frase, exista a
   *  conta ou não — ver `POST /auth/senha/esqueci`. */
  const [aviso, setAviso] = useState<string | null>(null)

  async function submeter(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    setAviso(null)
    setEnviando(true)
    try {
      await entrar(login, senha, org.trim() || undefined)
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setPedeOrg(true)
      setErro(
        err instanceof ApiError
          ? err.message
          : L('Não foi possível conectar à API.', 'Could not reach the API.'),
      )
    } finally {
      setEnviando(false)
    }
  }

  /** Pede a redefinição para o e-mail já digitado.
   *
   *  Reaproveita o campo em vez de abrir um segundo formulário — como faz o
   *  VDCity, que troca a tela inteira por um modo `isResetMode`. Aqui não
   *  precisa: quem clica acabou de tentar entrar, e o e-mail está ali. Uma tela
   *  a mais para reler o mesmo campo é atrito puro.
   */
  async function pedirRedefinicao() {
    setErro(null)
    setAviso(null)
    if (!login.trim()) {
      setErro(L('Preencha o e-mail primeiro.', 'Fill in the e-mail first.'))
      return
    }
    setEnviando(true)
    try {
      const r = await api.senha.esqueci(login.trim(), org.trim() || undefined)
      setAviso(r.detalhe)
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : String(e))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <AuthLayout
      titulo={L('Bem-vindo de volta', 'Welcome back')}
      sub={L('Entre com sua conta para continuar.', 'Sign in to continue.')}
    >
      <form className="auth-campos" onSubmit={submeter}>
        {erro && <div className="erro">{erro}</div>}
        {aviso && (
          <div className="pill ok" style={{ display: 'block', lineHeight: 1.5 }}>
            {aviso}
          </div>
        )}

        <div>
          <label className="oculto" htmlFor="login">
            {L('E-mail', 'E-mail')}
          </label>
          <input
            id="login"
            className="f"
            type="email"
            placeholder={L('Seu e-mail', 'Your e-mail')}
            autoComplete="username"
            required
            value={login}
            onChange={(e) => setLogin(e.target.value)}
          />
        </div>

        <CampoSenha
          id="senha"
          rotulo={L('Sua senha', 'Your password')}
          valor={senha}
          onChange={setSenha}
          autoComplete="current-password"
        />

        {pedeOrg && (
          <div>
            <label className="oculto" htmlFor="org">
              {L('Organização', 'Organization')}
            </label>
            <input
              id="org"
              className="f"
              autoComplete="organization"
              autoFocus
              placeholder={L('Slug da organização', 'Organization slug')}
              value={org}
              onChange={(e) => setOrg(e.target.value)}
            />
            <p className="hint">
              {L(
                'Seu e-mail atende a mais de uma organização. O slug está no endereço do convite que você recebeu — em dúvida, pergunte a quem administra.',
                'Your e-mail serves more than one organization. The slug is in the invitation address you received — if in doubt, ask your administrator.',
              )}
            </p>
          </div>
        )}

        <button className="btn pri block" type="submit" disabled={enviando}>
          {enviando ? L('Entrando…', 'Signing in…') : L('Entrar na plataforma', 'Sign in')}
        </button>

        {/* No VDCity esta fileira tem dois botões: "Esqueceu a senha?" e "Criar
            conta nova". Aqui só o primeiro — conta nova não se cria, o acesso é
            por convite do admin. O `space-between` fica: ele mantém o botão
            encostado à esquerda como no original, em vez de centralizá-lo e
            fazer parecer uma ação principal. */}
        <div className="auth-acoes">
          <button
            type="button"
            className="btn-link"
            onClick={pedirRedefinicao}
            disabled={enviando}
          >
            {L('Esqueci minha senha', 'I forgot my password')}
          </button>
        </div>

        <p className="hint" style={{ marginTop: 4 }}>
          {L(
            'O acesso por SSO/Autodesk entra quando o provedor for definido (decisão em aberto nº 2 do plano técnico).',
            'SSO/Autodesk sign-in lands once the provider is chosen (open decision #2 in the technical plan).',
          )}
        </p>
      </form>
    </AuthLayout>
  )
}
