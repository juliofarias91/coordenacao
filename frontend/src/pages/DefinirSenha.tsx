/** Definir senha por link — a tela que faltava para o acesso existir.
 *
 *  ELA É PÚBLICA, e tem de ser: quem cai aqui é quem AINDA não consegue entrar.
 *  Vive na mesma superfície do login (`AuthLayout`) por isso — as duas são o
 *  estado "antes de ter sessão", e uma delas com a barra do app em volta
 *  prometeria um lugar onde a pessoa ainda não está.
 *
 *  O MESMO ENDEREÇO SERVE AOS DOIS CASOS. `tipo` decide o texto: `convite` é
 *  primeiro acesso (a conta existe, senha nunca houve) e `redefinicao` é quem
 *  perdeu a que tinha. Duas telas para o mesmo formulário só multiplicariam o
 *  lugar onde a regra de senha pode divergir.
 *
 *  CONFERE O LINK ANTES DE PEDIR QUALQUER COISA. Um link expirado precisa dizer
 *  isso de saída — descobrir depois de digitar a senha duas vezes é o pior
 *  momento possível para descobrir, e é a razão de `GET /auth/senha/{token}`
 *  existir separado do POST que redefine.
 */
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import AuthLayout from '@/auth/AuthLayout'
import CampoSenha from '@/auth/CampoSenha'
import RequisitosSenha from '@/auth/RequisitosSenha'
import { useI18n } from '@/i18n'
import { ApiError, api } from '@/lib/api'
import { problemaDaSenha } from '@/lib/senha'
import type { ConviteSenha } from '@/lib/types'

type Estado =
  | { fase: 'conferindo' }
  | { fase: 'invalido'; mensagem: string }
  | { fase: 'pronto'; convite: ConviteSenha }
  | { fase: 'feito' }

export default function DefinirSenha() {
  const { token = '' } = useParams()
  const { L } = useI18n()
  const navegar = useNavigate()

  const [estado, setEstado] = useState<Estado>({ fase: 'conferindo' })
  const [senha, setSenha] = useState('')
  const [repetida, setRepetida] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const conferir = useCallback(async () => {
    try {
      setEstado({ fase: 'pronto', convite: await api.senha.conferir(token) })
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

  async function submeter(e: FormEvent) {
    e.preventDefault()
    setErro(null)

    // A regra do servidor vem no convite; `problemaDaSenha` usa a constante
    // local, que o teste do backend mantém igual. Comparar as duas aqui seria
    // ruído: se divergirem, é a suíte que acusa, não o usuário.
    const problema = problemaDaSenha(senha, repetida)
    if (problema) {
      setErro(L(...problema))
      return
    }

    setSalvando(true)
    try {
      await api.senha.redefinir(token, senha)
      setEstado({ fase: 'feito' })
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : String(e))
    } finally {
      setSalvando(false)
    }
  }

  if (estado.fase === 'conferindo') {
    return (
      <AuthLayout
        titulo={L('Conferindo o link…', 'Checking the link…')}
        sub={L('Um instante.', 'One moment.')}
      >
        <></>
      </AuthLayout>
    )
  }

  if (estado.fase === 'invalido') {
    return (
      <AuthLayout
        titulo={L('Link não vale mais', 'Link no longer valid')}
        sub={estado.mensagem}
      >
        <div className="auth-campos">
          <p className="hint" style={{ margin: 0 }}>
            {L(
              'Links de redefinição duram 2 horas e valem uma vez só; convites duram 7 dias. Peça um novo a quem administra a organização.',
              'Reset links last 2 hours and work once; invitations last 7 days. Ask your organization’s administrator for a new one.',
            )}
          </p>
          <button className="btn pri block" onClick={() => navegar('/')}>
            {L('Ir para a tela de entrada', 'Go to the sign-in screen')}
          </button>
        </div>
      </AuthLayout>
    )
  }

  if (estado.fase === 'feito') {
    return (
      <AuthLayout
        titulo={L('Senha definida', 'Password set')}
        sub={L(
          'Já pode entrar com ela. As sessões antigas desta conta foram encerradas.',
          'You can sign in with it now. This account’s previous sessions were ended.',
        )}
      >
        <button className="btn pri block" onClick={() => navegar('/')}>
          {L('Entrar', 'Sign in')}
        </button>
      </AuthLayout>
    )
  }

  const { convite } = estado
  const primeiroAcesso = convite.tipo === 'convite'

  return (
    <AuthLayout
      titulo={
        primeiroAcesso
          ? L('Crie sua senha de acesso', 'Create your password')
          : L('Definir uma nova senha', 'Set a new password')
      }
      /* Para QUAL conta. Sem isto, quem tem duas contas — uma na SPBIM e uma no
         cliente — não sabe qual está configurando. */
      sub={[convite.nome, convite.login, convite.organizacao].filter(Boolean).join(' · ')}
    >
      <form className="auth-campos" onSubmit={submeter}>
        {erro && <div className="erro">{erro}</div>}

        <div>
          <CampoSenha
            id="senha"
            rotulo={L('Nova senha', 'New password')}
            valor={senha}
            onChange={setSenha}
            autoComplete="new-password"
            autoFocus
          />
          {/* O checklist ao vivo entrou em 05/08/2026, junto da exigência de
              composição. A regra estava só no `.hint` lá embaixo, em prosa, e
              era conferida depois de enviar — quem errasse descobria por uma
              frase de erro no topo, um problema por vez. */}
          <RequisitosSenha senha={senha} />
        </div>
        <CampoSenha
          id="repetida"
          rotulo={L('Confirmar senha', 'Confirm password')}
          valor={repetida}
          onChange={setRepetida}
          autoComplete="new-password"
        />
        {repetida && senha !== repetida && (
          <p className="hint" style={{ marginTop: -6 }}>
            {L('As duas senhas ainda não conferem.', 'The two passwords do not match yet.')}
          </p>
        )}

        <button className="btn pri block" type="submit" disabled={salvando}>
          {salvando
            ? L('Salvando…', 'Saving…')
            : primeiroAcesso
              ? L('Definir senha e entrar', 'Set password and sign in')
              : L('Redefinir senha', 'Reset password')}
        </button>

        {/* O QUE SOBROU DA PROSA é o que o checklist NÃO diz: o que acontece com
            a senha depois de gravada. O mínimo saiu daqui porque agora ele é uma
            das quatro linhas acima — dizê-lo nos dois lugares é o começo de os
            dois divergirem. `convite.senha_minima` continua vindo do servidor e
            é o que esta tela usaria se um dia os dois números discordassem. */}
        <p className="hint" style={{ marginTop: 4 }}>
          {L(
            'Ela é guardada só como hash Argon2 — nem a SPBIM consegue lê-la.',
            'It is stored only as an Argon2 hash — not even SPBIM can read it.',
          )}
        </p>
      </form>
    </AuthLayout>
  )
}
