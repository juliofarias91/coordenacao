/** Criar a própria conta (05/08/2026, a pedido).
 *
 *  ISTO REVERTE UMA DECISÃO REGISTRADA, e vale dizer qual: até aqui "o acesso é
 *  só por convite do admin", e o `AuthLayout` trazia escrito que cadastro aberto
 *  contradiz "SSO autentica, não provisiona". O que mudou foi o pedido; o que
 *  NÃO mudou é a razão da regra, e é ela que dá forma a esta tela.
 *
 *  NÃO HÁ CAMPO DE ORGANIZAÇÃO (06/08/2026, a pedido). Ele existiu por um dia,
 *  pedindo o código do tenant, e era o primeiro da tela — a pergunta que decidia
 *  se as outras valiam alguma coisa. Saiu porque ninguém vai usá-lo, e um campo
 *  obrigatório cuja resposta quem chega não tem trava o formulário na primeira
 *  linha: "slug" é vocabulário de quem construiu o sistema, não de quem entra
 *  nele. Quem resolve a organização agora é o servidor, pelo interruptor — ver
 *  `services/cadastro_aberto.py::organizacao_do_cadastro`.
 *
 *  Sobraram três campos, e são os do print de referência: nome, e-mail, senha
 *  (com a confirmação). É o cadastro mais curto que o multi-tenant permite.
 *
 *  A CONTA NASCE SEM PROJETO, e é assim que se quer: quem liga a pessoa a um
 *  projeto é o gerente dele. Esta tela não pergunta em qual, porque perguntar
 *  daria a um estranho a escolha que pertence a quem coordena.
 *
 *  NÃO HÁ ESCOLHA DE PAPEL nem de permissão, pela mesma razão. A conta nasce
 *  como LEITOR, o papel menos privilegiado, e quem administra promove depois.
 *
 *  ═══ ELA É TAMBÉM A TELA DE CONVITE (07/08/2026, a pedido)
 *
 *  O link que o coordenador gera — e que vai no e-mail — aponta para AQUI, com
 *  `?convite=<token>`. Não para uma tela de aceite: quem recebe um convite quase
 *  nunca tem conta nesta plataforma, e uma tela intermediária cujo único
 *  conteúdo é "clique para criar sua conta" é um passo entre a pessoa e a única
 *  coisa que ela precisa fazer.
 *
 *  Com o token, três coisas mudam nesta tela, e as três vêm da especificação de
 *  origem (`Login.jsx:77-88`, que faz o mesmo com o `invite_preview`):
 *
 *  1. **O convite aparece em cima** — projeto, papel, prazo. Quem cria a conta
 *     vê o que está aceitando enquanto a cria.
 *  2. **O e-mail é preenchido E TRAVADO** quando o convite é individual. É o que
 *     impede o erro mais provável do fluxo: receber no e-mail do trabalho e
 *     cadastrar-se com o pessoal, o que produziria uma conta sem vínculo nenhum.
 *  3. **O aceite é automático** depois do cadastro — a pessoa cai dentro do
 *     projeto, não numa home vazia.
 *
 *  E o subtítulo muda junto: sem convite ele avisa que a home vem vazia; com
 *  convite isso seria mentira, porque o projeto já vem.
 */
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import { useAuth } from '@/auth/AuthContext'
import AuthLayout from '@/auth/AuthLayout'
import BotaoSSO from '@/auth/BotaoSSO'
import CampoSenha from '@/auth/CampoSenha'
import RequisitosSenha from '@/auth/RequisitosSenha'
import { PAPEIS_PROJETO } from '@/components/TabelaMembros'
import { useI18n } from '@/i18n'
import { ApiError, api } from '@/lib/api'
import { problemaDaSenha } from '@/lib/senha'
import { CHAVE_CONVITE } from '@/pages/Convite'
import type { ConfigPublica, ConvitePrevia } from '@/lib/types'

export default function Cadastro() {
  const { cadastrar } = useAuth()
  const { L } = useI18n()
  const navegar = useNavigate()
  const [params] = useSearchParams()
  const convite = params.get('convite')

  const [nome, setNome] = useState('')
  const [login, setLogin] = useState('')
  const [senha, setSenha] = useState('')
  const [repetida, setRepetida] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [config, setConfig] = useState<ConfigPublica | null>(null)
  const [previa, setPrevia] = useState<ConvitePrevia | null>(null)
  /** O convite existe mas não serve mais (vencido, gasto). A tela CONTINUA
   *  servindo para criar conta — só deixa de prometer o projeto. Bloquear o
   *  cadastro aqui seria punir quem demorou a abrir o e-mail. */
  const [conviteMorto, setConviteMorto] = useState(false)

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

  /** A PRÉVIA DO CONVITE. Falhar aqui não trava a tela: o cadastro continua
   *  valendo, e a pessoa entra sem o projeto — que é melhor do que não entrar. */
  const carregarConvite = useCallback(async () => {
    if (!convite) return
    try {
      const p = await api.convitesDeEquipe.previa(convite)
      setPrevia(p)
      // TRAVA O E-MAIL quando o convite é individual. É o passo que a origem faz
      // no login e que evita a conta órfã.
      if (p.email) setLogin(p.email)
    } catch {
      setConviteMorto(true)
    }
  }, [convite])

  useEffect(() => {
    carregarConvite()
  }, [carregarConvite])

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
      await cadastrar({ login: login.trim(), senha, nome: nome.trim() || undefined })

      // ACEITA O CONVITE NA SEQUÊNCIA, com a sessão que `cadastrar` acabou de
      // gravar. Sem `await` no erro: se o aceite falhar, a CONTA continua criada
      // e a pessoa está dentro — mandá-la para uma tela de erro depois de um
      // cadastro bem-sucedido seria transformar um problema pequeno (o vínculo)
      // numa parede. O `/convite/:token` continua lá para tentar de novo.
      if (convite && !conviteMorto) {
        try {
          await api.convitesDeEquipe.aceitar(convite)
        } catch {
          /* a conta existe e a sessão vale; o vínculo se resolve pelo link */
        }
      }
      navegar('/', { replace: true })
    } catch (err) {
      // ⚠ E-MAIL JÁ CADASTRADO É O CASO MAIS PROVÁVEL DE ERRO AQUI, porque o
      // convite pode chegar a quem já tem conta. Guarda o token e manda para o
      // login: de lá, `RetomarConvite` traz de volta ao aceite depois da sessão.
      if (err instanceof ApiError && err.status === 409 && convite) {
        sessionStorage.setItem(CHAVE_CONVITE, convite)
        setErro(
          L(
            'Este e-mail já tem conta. Entre com ela — o convite continua valendo.',
            'This e-mail already has an account. Sign in — the invitation still stands.',
          ),
        )
        setEnviando(false)
        return
      }
      setErro(
        err instanceof ApiError
          ? err.message
          : L('Não foi possível conectar à API.', 'Could not reach the API.'),
      )
    } finally {
      setEnviando(false)
    }
  }

  const papelDoConvite = previa
    ? (PAPEIS_PROJETO.find((p) => p.valor === previa.papel) ?? null)
    : null

  /** ⚠ SEM CONVITE, NÃO HÁ FORMULÁRIO (07/08/2026, a pedido).
   *
   *  Conta se cria a partir de um convite, e o link do convite traz o token na
   *  URL. Quem chega a `/cadastro` sem ele — digitando o endereço, ou por um
   *  link antigo — não tem o que preencher aqui.
   *
   *  A TELA EXPLICA EM VEZ DE REDIRECIONAR. Mandar para o login devolveria a
   *  pessoa à tela de onde ela veio, sem dizer por quê; e a única coisa útil a
   *  fazer com quem quer entrar e não foi convidado é dizer de quem ela precisa
   *  pedir.
   *
   *  ⚠ ISTO ESCONDE, NÃO FECHA. `POST /auth/cadastro` continua público e sem
   *  exigir convite — quem chamar a rota direto cria conta do mesmo jeito. Fechar
   *  de verdade é decisão de produto com consequência (hoje é assim que a
   *  primeira conta de um tenant nasce, e o login pelo Google também provisiona);
   *  ver a seção "Acesso" do CLAUDE.md. */
  const semConvite = !convite || conviteMorto

  if (!convite) {
    return (
      <AuthLayout
        titulo={L('É preciso um convite', 'An invitation is required')}
        sub={L(
          'Nesta plataforma a conta nasce de um convite a um projeto.',
          'On this platform, accounts are created from a project invitation.',
        )}
      >
        <div className="auth-campos">
          <p className="hint" style={{ margin: 0 }}>
            {L(
              'Quem coordena o projeto em que você vai trabalhar envia o convite por e-mail. O link dele abre esta tela já preenchida — e é por ele que a conta se cria.',
              'Whoever coordinates the project you will work on sends the invitation by e-mail. Its link opens this screen already filled in — and that is how the account is created.',
            )}
          </p>
          <Link className="btn pri block" to="/">
            {L('Ir para a entrada', 'Go to sign-in')}
          </Link>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      titulo={
        previa ? L('Você foi convidado', 'You have been invited') : L('Criar sua conta', 'Create your account')
      }
      /* O SUBTÍTULO MUDA COM O CONVITE, e não é enfeite: sem ele, a tela avisa
         que a home vem vazia — o que é verdade para quem chega sozinho e MENTIRA
         para quem chega convidado, porque o projeto já vem junto. */
      sub={
        previa
          ? `${previa.organizacao} · ${previa.projeto_codigo}`
          : semConvite
            ? L(
                'O convite não vale mais, mas a conta ainda pode ser criada.',
                'The invitation is no longer valid, but the account can still be created.',
              )
            : L('Um instante.', 'One moment.')
      }
    >
      <form className="auth-campos" onSubmit={submeter}>
        {erro && <div className="erro">{erro}</div>}

        {/* O QUE SE ESTÁ ACEITANDO, acima do formulário. Quem cria a conta vê o
            projeto enquanto a cria — que é o que torna a tela intermediária
            desnecessária. */}
        {previa && (
          <div className="auth-conv">
            <div className="auth-conv-linha">
              <span>{L('Projeto', 'Project')}</span>
              <strong>{previa.projeto_nome}</strong>
            </div>
            <div className="auth-conv-linha">
              <span>{L('Seu papel', 'Your role')}</span>
              <strong>{papelDoConvite ? L(papelDoConvite.pt, papelDoConvite.en) : previa.papel}</strong>
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
        )}

        {/* CONVITE MORTO NÃO TRAVA O CADASTRO — só deixa de prometer o projeto.
            Quem demorou a abrir o e-mail ainda pode criar a conta; o vínculo é
            que precisa de um convite novo. */}
        {conviteMorto && (
          <p className="hint" style={{ margin: 0 }}>
            {L(
              'O convite deste link não vale mais, mas você ainda pode criar sua conta. Peça outro a quem coordena o projeto para entrar nele.',
              'The invitation in this link is no longer valid, but you can still create your account. Ask the project coordinator for a new one to join it.',
            )}
          </p>
        )}

        {/* O PROVEDOR VEM ANTES DO FORMULÁRIO, como na tela de entrar: quem tem
            conta no Google não precisa ler três campos para descobrir que não
            vai preenchê-los. Ele não leva mais nada junto — quem decide a
            organização é o servidor, dos dois lados. */}
        {config?.sso && (
          <>
            <BotaoSSO rotulo={config.sso_rotulo} onErro={setErro} />
            <div className="auth-ou">{L('ou', 'or')}</div>
          </>
        )}

        <div>
          <label className="oculto" htmlFor="nome">
            {L('Seu nome', 'Your name')}
          </label>
          <input
            id="nome"
            className="f"
            autoComplete="name"
            autoFocus
            placeholder={L('Seu nome', 'Your name')}
            value={nome}
            onChange={(e) => setNome(e.target.value)}
          />
        </div>

        <div>
          <label className="oculto" htmlFor="login">
            {L('E-mail', 'E-mail')}
          </label>
          {/* ⚠ TRAVADO QUANDO O CONVITE É INDIVIDUAL. É o passo que a
              especificação de origem faz no login ("pré-preenche e TRAVA"), e o
              que ele evita é o erro mais provável do fluxo inteiro: a pessoa
              recebe o convite no e-mail do trabalho, digita o pessoal por
              hábito, e cria uma conta que o convite recusa — ficando sem
              vínculo e sem entender por quê.

              `readOnly` e não `disabled`: campo desabilitado não é enviado pelo
              formulário nem lido por leitor de tela, e aqui o valor É o dado. */}
          <input
            id="login"
            className="f"
            type="email"
            autoComplete="username"
            required
            readOnly={!!previa?.email}
            placeholder={L('Seu e-mail', 'Your e-mail')}
            value={login}
            onChange={(e) => setLogin(e.target.value)}
          />
          {previa?.email && (
            <p className="hint">
              {L(
                'Este convite é para este endereço. Para usar outro, peça um convite novo a quem coordena o projeto.',
                'This invitation is for this address. To use another, ask the project coordinator for a new invitation.',
              )}
            </p>
          )}
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
            {/* GUARDA O CONVITE ANTES DE SAIR DA TELA. Sem isto, quem já tem
                conta clica em "Entrar", faz login e chega numa home sem o
                projeto — o convite ficou na URL que ela acabou de abandonar. */}
            <Link
              to="/"
              onClick={() => {
                if (convite) sessionStorage.setItem(CHAVE_CONVITE, convite)
              }}
            >
              {L('Entrar', 'Sign in')}
            </Link>
          </span>
        </div>
      </form>
    </AuthLayout>
  )
}
