import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { useAuth } from '@/auth/AuthContext'
import AuthLayout from '@/auth/AuthLayout'
import BotaoSSO from '@/auth/BotaoSSO'
import CampoSenha from '@/auth/CampoSenha'
import { useI18n } from '@/i18n'
import { ApiError, api } from '@/lib/api'
import type { ConfigPublica } from '@/lib/types'

export default function Login() {
  const { entrar } = useAuth()
  const { L } = useI18n()
  const [login, setLogin] = useState('')
  const [senha, setSenha] = useState('')
  const [org, setOrg] = useState('')
  /** Só para saber se existe provedor de SSO, e como ele se chama. Falhar aqui
   *  não é erro de tela: sem resposta o botão não é desenhado e a entrada por
   *  senha — o caminho principal — continua inteira. */
  const [config, setConfig] = useState<ConfigPublica | null>(null)
  /** O campo de organização SÓ APARECE quando a API pede — no 409 de
   *  `/auth/login`. Exibi-lo sempre obrigaria todo mundo a saber o slug do
   *  próprio tenant para uma ambiguidade que quase nunca existe: o backend
   *  desempata pela senha, e só desiste quando a mesma senha vale em duas
   *  organizações. */
  const [pedeOrg, setPedeOrg] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    let ativo = true
    api
      .configPublica()
      .then((c) => ativo && setConfig(c))
      .catch(() => undefined)
    return () => {
      ativo = false
    }
  }, [])

  async function submeter(e: FormEvent) {
    e.preventDefault()
    setErro(null)
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

  return (
    <AuthLayout
      titulo={L('Bem-vindo de volta', 'Welcome back')}
      sub={L('Entre com sua conta para continuar.', 'Sign in to continue.')}
    >
      <form className="auth-campos" onSubmit={submeter}>
        {erro && <div className="erro">{erro}</div>}

        {/* O PROVEDOR VEM ANTES DOS CAMPOS. Quem entra pelo Google não tem senha
            aqui para digitar, e pôr o botão embaixo do formulário faria essa
            pessoa ler dois campos que não lhe dizem respeito antes de achar o
            caminho dela.

            SEM `org`: nesta tela quem entra JÁ EXISTE, e o callback o encontra
            pela identidade. Mandar o código daqui abriria o provisionamento na
            tela de entrar, que é o oposto do que ela faz. */}
        {config?.sso && (
          <>
            <BotaoSSO rotulo={config.sso_rotulo} onErro={setErro} />
            <div className="auth-ou">{L('ou', 'or')}</div>
          </>
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

        {/* ⚠ "CRIAR CONTA" SAIU DAQUI EM 07/08/2026, a pedido. Ele viveu dois
            dias — entrou com o cadastro aberto (05/08) e saiu quando o convite
            de equipe passou a ser a porta: conta se cria a partir de um convite,
            e o link do convite já leva direto à tela de cadastro.

            Anunciar "criar conta" aqui prometeria um caminho que termina em
            "peça um convite", e faria a tela de entrada oferecer justamente o
            que a plataforma decidiu não oferecer.

            O `space-between` FICA, como ficou antes deste botão existir: ele é o
            que mantém "esqueci minha senha" encostado à esquerda, em vez de
            centralizado e parecendo ação principal. */}
        <div className="auth-acoes">
          <Link className="btn-link" to="/esqueci-senha">
            {L('Esqueci minha senha', 'I forgot my password')}
          </Link>
        </div>
      </form>
    </AuthLayout>
  )
}
