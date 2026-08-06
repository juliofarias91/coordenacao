/** Criar a própria conta (05/08/2026, a pedido).
 *
 *  ISTO REVERTE UMA DECISÃO REGISTRADA, e vale dizer qual: até aqui "o acesso é
 *  só por convite do admin", e o `AuthLayout` trazia escrito que cadastro aberto
 *  contradiz "SSO autentica, não provisiona". O que mudou foi o pedido; o que
 *  NÃO mudou é a razão da regra, e é ela que dá forma a esta tela.
 *
 *  O CAMPO DE ORGANIZAÇÃO É OBRIGATÓRIO, e é o que diferencia esta tela de um
 *  cadastro de SaaS comum. Toda entidade da plataforma carrega `org_id`; sem o
 *  código, a conta teria de nascer numa organização escolhida pelo servidor — e
 *  numa plataforma multi-tenant não existe "a organização padrão". Ele fica em
 *  PRIMEIRO, acima do nome: é a pergunta que decide se as outras três valem
 *  alguma coisa, e descobrir no fim que não se tem o código é preencher um
 *  formulário inteiro para nada.
 *
 *  O `.hint` dele diz de onde o código vem. Sem essa linha, o campo mais
 *  importante da tela é também o único que ninguém sabe responder — "slug" é
 *  vocabulário de quem construiu o sistema, não de quem chega nele.
 *
 *  NÃO HÁ ESCOLHA DE PAPEL nem de permissão. A conta nasce como LEITOR, o
 *  vocabulário menos privilegiado, e quem administra promove depois — ver
 *  `services/cadastro_aberto.py`. Um seletor aqui seria pedir a um estranho que
 *  se autoconcedesse acesso.
 */
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { useAuth } from '@/auth/AuthContext'
import AuthLayout from '@/auth/AuthLayout'
import BotaoSSO from '@/auth/BotaoSSO'
import CampoSenha from '@/auth/CampoSenha'
import RequisitosSenha from '@/auth/RequisitosSenha'
import { useI18n } from '@/i18n'
import { ApiError, api } from '@/lib/api'
import { problemaDaSenha } from '@/lib/senha'
import type { ConfigPublica } from '@/lib/types'

export default function Cadastro() {
  const { cadastrar } = useAuth()
  const { L } = useI18n()
  const navegar = useNavigate()

  const [org, setOrg] = useState('')
  const [nome, setNome] = useState('')
  const [login, setLogin] = useState('')
  const [senha, setSenha] = useState('')
  const [repetida, setRepetida] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [config, setConfig] = useState<ConfigPublica | null>(null)

  // O botão do provedor só se desenha se houver provedor. Falhar aqui não é
  // erro de tela: sem resposta, `config` fica nulo e o cadastro por senha —
  // que é o caminho principal — continua inteiro.
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

    // A MESMA função que o servidor espelha (`validar_senha`, em
    // `schemas/usuario.py`). Validar aqui não substitui a rede de baixo: ela
    // existe para o erro chegar antes do envio, com a frase inteira do que
    // falta, em vez de um 422 traduzido.
    const problema = problemaDaSenha(senha, repetida)
    if (problema) {
      setErro(L(...problema))
      return
    }

    setEnviando(true)
    try {
      await cadastrar({
        org: org.trim(),
        login: login.trim(),
        senha,
        nome: nome.trim() || undefined,
      })
      // A sessão já vale — `cadastrar` gravou os tokens. A navegação leva à
      // home; sem ela a tela ficaria montada sobre uma sessão que existe.
      navegar('/', { replace: true })
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
    <AuthLayout
      titulo={L('Criar sua conta', 'Create your account')}
      sub={L(
        'Você entra numa organização que já existe — o código dela é o que diz qual.',
        'You join an organization that already exists — its code is what says which.',
      )}
    >
      <form className="auth-campos" onSubmit={submeter}>
        {erro && <div className="erro">{erro}</div>}

        {/* O PROVEDOR VEM ANTES DO FORMULÁRIO, como na tela de entrar: quem tem
            conta no Google não precisa ler cinco campos para descobrir que não
            vai preenchê-los. O código da organização vai junto, assinado dentro
            do `state` — é ele que diz ao callback onde a conta pode nascer. */}
        {config?.sso && (
          <>
            <BotaoSSO rotulo={config.sso_rotulo} org={org.trim()} onErro={setErro} />
            <div className="auth-ou">{L('ou', 'or')}</div>
          </>
        )}

        <div>
          <label className="oculto" htmlFor="org">
            {L('Código da organização', 'Organization code')}
          </label>
          <input
            id="org"
            className="f"
            autoComplete="organization"
            required
            autoFocus
            placeholder={L('Código da organização', 'Organization code')}
            value={org}
            onChange={(e) => setOrg(e.target.value)}
          />
          <p className="hint">
            {L(
              'Quem coordena o seu projeto fornece este código. Sem ele não há como saber a que organização a conta pertence.',
              'Your project coordinator provides this code. Without it there is no way to tell which organization the account belongs to.',
            )}
          </p>
        </div>

        <div>
          <label className="oculto" htmlFor="nome">
            {L('Seu nome', 'Your name')}
          </label>
          <input
            id="nome"
            className="f"
            autoComplete="name"
            placeholder={L('Seu nome', 'Your name')}
            value={nome}
            onChange={(e) => setNome(e.target.value)}
          />
        </div>

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
            placeholder={L('Seu e-mail', 'Your e-mail')}
            value={login}
            onChange={(e) => setLogin(e.target.value)}
          />
        </div>

        <div>
          <CampoSenha
            id="senha"
            rotulo={L('Sua senha', 'Your password')}
            valor={senha}
            onChange={setSenha}
            autoComplete="new-password"
          />
          {/* O checklist fica COLADO no campo da senha, e não no da confirmação:
              é a senha que ele descreve. No print de referência ele aparece
              embaixo dos dois porque lá são um bloco só. */}
          <RequisitosSenha senha={senha} />
        </div>

        <CampoSenha
          id="repetida"
          rotulo={L('Confirmar senha', 'Confirm password')}
          valor={repetida}
          onChange={setRepetida}
          autoComplete="new-password"
        />
        {/* A CONFERÊNCIA DAS DUAS É AVISO, não erro, e só aparece depois de a
            segunda ter algo: dizer "não conferem" na primeira letra digitada
            está sempre certo e nunca é útil. */}
        {repetida && senha !== repetida && (
          <p className="hint" style={{ marginTop: -6 }}>
            {L('As duas senhas ainda não conferem.', 'The two passwords do not match yet.')}
          </p>
        )}

        <button className="btn pri block" type="submit" disabled={enviando}>
          {enviando ? L('Criando…', 'Creating…') : L('Criar conta', 'Create account')}
        </button>

        <div className="auth-acoes">
          <span className="hint" style={{ margin: 0 }}>
            {L('Já tem conta?', 'Already have an account?')}{' '}
            <Link to="/">{L('Entrar', 'Sign in')}</Link>
          </span>
        </div>
      </form>
    </AuthLayout>
  )
}
