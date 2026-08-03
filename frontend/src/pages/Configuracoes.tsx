/** Configurações da CONTA — uma seção por tela, escolhida na SIDEBAR PRINCIPAL.
 *
 *  Não confundir com `Configurações do projeto` (`pages/configuracao/`), que
 *  define disciplinas, critérios e padrões de um projeto. Esta é sobre a
 *  pessoa: o que vale para ela em qualquer projeto que abrir.
 *
 *  Antes de 29/07/2026 isto era um painelzinho no menu da conta, e as
 *  preferências (tema, idioma) só existiam como dois botões na topbar — sem
 *  lugar onde se pudesse olhar tudo junto e sem lugar onde trocar a própria
 *  senha. Trocar a senha, aliás, sempre foi permitido pela API a qualquer
 *  usuário; era a interface que só oferecia isso a quem administra cadastros.
 *
 *  ÁREA CONTEXTUAL, NÃO PAINEL DE PÁGINA (31/07/2026, a pedido). As quatro
 *  seções já foram quatro `.editor` empilhados num rolo só — para trocar a
 *  senha passava-se por dados pessoais, idioma e dez amostras de cor, e o que se
 *  procurava estava sempre fora da tela. Chegaram a virar um `.pgsplit`, com
 *  painel próprio dentro da página, e no mesmo dia foram para a barra do app.
 *
 *  A diferença que decide não é estética, é se HÁ CONTEXTO A PERDER: trocar a
 *  barra dentro de um projeto apaga da tela em que projeto se está, e foi isso
 *  que tirou a barra própria da configuração de projeto. Aqui não há projeto —
 *  quem entra saiu do trabalho para cuidar da conta, como quem entra em
 *  `/admin`. A lista de seções vive em `ITENS_CONTA`, em `layout/nav.ts`.
 *
 *  ESTE ARQUIVO NÃO DESENHA NAVEGAÇÃO NENHUMA: quem diz onde se está são a
 *  barra e o breadcrumb. Ele só resolve `:secao` e devolve o conteúdo dela.
 *
 *  A SEÇÃO VIVE NA URL (`/configuracoes/seguranca`) porque é o que a barra
 *  precisa para marcar o item ativo — e de graça ganha-se o F5 que volta ao
 *  mesmo lugar e um endereço para "vá em Configurações › Segurança".
 *
 *  O que AINDA NÃO tem onde ser guardado está dito como tal, e não escondido:
 *  preferência de notificação exige coluna nova em `usuario`.
 */
import { useEffect, useState, type CSSProperties } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { Campo, Erro, Vazio } from '@/components/ui'
import { useAuth } from '@/auth/AuthContext'
import { useI18n } from '@/i18n'
import { ehSecaoConta, SECOES_CONTA } from '@/layout/nav'
import { ApiError, api } from '@/lib/api'
import { MIN_SENHA, problemaDaSenha } from '@/lib/senha'
import { ACCENTS, corVisivel, type Aparencia } from '@/theme/cores'
import { useTheme } from '@/theme/ThemeProvider'

/** As três aparências, com o disco que cada uma pinta na amostra. O `auto` é
 *  meio-a-meio na diagonal — é como o VDCity o desenha, e diz "os dois" sem
 *  precisar de rótulo extra. */
const APARENCIAS: Array<{ chave: Aparencia; pt: string; en: string; fundo: string }> = [
  { chave: 'light', pt: 'Claro', en: 'Light', fundo: '#ffffff' },
  { chave: 'dark', pt: 'Escuro', en: 'Dark', fundo: '#171717' },
  { chave: 'auto', pt: 'Auto', en: 'Auto', fundo: 'linear-gradient(135deg,#fff 50%,#171717 50%)' },
]

const CHECK = 'M20 6 9 17l-5-5'

/** A primeira seção é o destino de `/configuracoes` sem seção. Sai de
 *  `SECOES_CONTA` para não haver uma segunda lista com uma segunda ordem. */
const PADRAO = SECOES_CONTA[0]

export default function Configuracoes() {
  const { usuario } = useAuth()
  const navegar = useNavigate()
  const { secao } = useParams<{ secao: string }>()

  // `/configuracoes` sem seção, ou com uma que não existe, cai na primeira.
  // Feito aqui e não com um `<Navigate>` na rota porque a seção-padrão é
  // conhecimento desta tela. O `replace` evita que voltar fique preso no
  // redirecto.
  const valida = ehSecaoConta(secao)
  useEffect(() => {
    if (!valida) navegar(`/configuracoes/${PADRAO}`, { replace: true })
  }, [valida, navegar])

  if (!usuario || !valida) return null

  // Nenhuma seção repete o próprio nome num `h3`: o item da barra e o
  // breadcrumb já o dizem, e o breadcrumb fica na mesma margem do conteúdo. É a
  // mesma razão que tirou o `h1` das vinte telas em 30/07/2026.
  if (secao === 'preferencias') return <Preferencias />
  if (secao === 'seguranca') return <Seguranca />
  if (secao === 'notificacoes') return <Notificacoes />
  return <DadosPessoais />
}

function DadosPessoais() {
  const { L } = useI18n()
  const { usuario } = useAuth()
  if (!usuario) return null

  return (
    <div className="editor">
      <div className="frow">
        <Campo rotulo={L('Nome', 'Name')}>
          {/* Somente leitura: nome e login definem quem assina a auditoria e
              aparecem na trilha. Trocá-los é ato de quem administra cadastros,
              em Gestão de membros — não do próprio, no meio de um round. */}
          <input className="f" value={usuario.nome ?? ''} readOnly />
        </Campo>
        <Campo rotulo={L('E-mail de acesso', 'Sign-in e-mail')}>
          <input className="f" value={usuario.login} readOnly />
        </Campo>
        <Campo rotulo={L('Papel', 'Role')}>
          <input className="f" value={usuario.papel} readOnly />
        </Campo>
      </div>
      <p className="hint">
        {L(
          'Nome, e-mail e papel são alterados por quem administra cadastros, em Gestão de membros — eles identificam quem assinou cada decisão de auditoria.',
          'Name, e-mail and role are changed by whoever manages records, under Member management — they identify who signed each audit decision.',
        )}
      </p>
    </div>
  )
}

function Preferencias() {
  const { L, lang, setLang } = useI18n()
  const { theme, modo, setModo, accent, setAccent } = useTheme()

  return (
    <div className="editor">
      <div className="frow">
        <Campo rotulo={L('Idioma', 'Language')}>
          <select
            className="f"
            value={lang}
            onChange={(e) => setLang(e.target.value as 'pt' | 'en')}
          >
            <option value="pt">Português</option>
            <option value="en">English</option>
          </select>
        </Campo>
      </div>

      {/* APARÊNCIA E DESTAQUE — amostras, não um `<select>`.
          Cor é a única preferência que não se escolhe pelo nome: "Petróleo" e
          "Menta" não dizem nada até se ver os dois lado a lado. O tema deixou o
          `<select>` pela mesma razão, e porque `auto` só se entende vendo o
          disco meio claro meio escuro. */}
      <label className="fl">{L('Aparência', 'Appearance')}</label>
      <div className="tema-aparencias">
        {APARENCIAS.map((a) => (
          <button
            key={a.chave}
            type="button"
            className={`tema-aparencia${modo === a.chave ? ' on' : ''}`}
            onClick={() => setModo(a.chave)}
          >
            <span className="tema-disco" style={{ background: a.fundo }} />
            <span className="tema-rot">{L(a.pt, a.en)}</span>
          </button>
        ))}
      </div>

      <label className="fl" style={{ marginTop: 18 }}>
        {L('Cor de destaque', 'Accent colour')}
      </label>
      <div className="tema-cores">
        {ACCENTS.map((c) => {
          const escolhida = (accent ?? null) === c.hex
          const cor = corVisivel(c.hex, theme === 'dark')
          return (
            <button
              key={c.hex ?? 'padrao'}
              type="button"
              title={L(c.pt, c.en)}
              aria-label={L(c.pt, c.en)}
              aria-pressed={escolhida}
              className={`tema-cor${escolhida ? ' on' : ''}`}
              onClick={() => setAccent(c.hex)}
              style={{ '--amostra': cor } as CSSProperties}
            >
              {escolhida && (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d={CHECK} />
                </svg>
              )}
            </button>
          )
        })}
      </div>

      <p className="hint">
        {L(
          'Idioma, aparência e cor valem neste navegador — são preferências de quem usa, não da conta. Em outra máquina, escolha de novo. Em Auto, a aparência segue a do sistema operacional e muda junto com ele.',
          'Language, appearance and colour apply to this browser — they are the viewer’s preference, not the account’s. On another machine, pick again. On Auto, the appearance follows the operating system and changes with it.',
        )}
      </p>
    </div>
  )
}

function Seguranca() {
  const { L } = useI18n()
  const { usuario } = useAuth()

  const [senha, setSenha] = useState('')
  const [repetida, setRepetida] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvo, setSalvo] = useState(false)
  const [salvando, setSalvando] = useState(false)

  async function trocarSenha() {
    if (!usuario) return
    setErro(null)
    setSalvo(false)

    const problema = problemaDaSenha(senha, repetida)
    if (problema) {
      setErro(L(...problema))
      return
    }

    setSalvando(true)
    try {
      await api.usuarios.definirSenha(usuario.id, senha)
      setSenha('')
      setRepetida('')
      setSalvo(true)
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : String(e))
    } finally {
      setSalvando(false)
    }
  }

  if (!usuario) return null

  return (
    <div className="editor">
      <Erro mensagem={erro} />
      {salvo && (
        <div className="pill ok" style={{ marginBottom: 12 }}>
          {L('Senha alterada', 'Password changed')}
        </div>
      )}
      <div className="frow">
        <Campo rotulo={L('Nova senha', 'New password')}>
          <input
            className="f"
            type="password"
            autoComplete="new-password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
          />
        </Campo>
        <Campo rotulo={L('Repita a nova senha', 'Repeat the new password')}>
          <input
            className="f"
            type="password"
            autoComplete="new-password"
            value={repetida}
            onChange={(e) => setRepetida(e.target.value)}
          />
        </Campo>
      </div>
      <div className="eact">
        <button
          className="btn pri"
          onClick={trocarSenha}
          disabled={salvando || !senha || !repetida}
        >
          {salvando ? L('Salvando…', 'Saving…') : L('Trocar senha', 'Change password')}
        </button>
      </div>
      {/* A regra dita ANTES de errar. Ela vem de `lib/senha.ts`, que é a mesma
          fonte que a validação usa — dizer "pelo menos 10" num texto solto foi
          como o 8 e o 10 se separaram. */}
      <p className="hint">
        {L(
          `Pelo menos ${MIN_SENHA} caracteres. A senha é guardada só como hash Argon2 — nem a SPBIM consegue lê-la, apenas substituí-la. A sessão atual continua válida depois da troca.`,
          `At least ${MIN_SENHA} characters. The password is stored only as an Argon2 hash — not even SPBIM can read it, only replace it. Your current session stays valid after the change.`,
        )}
      </p>
    </div>
  )
}

function Notificacoes() {
  const { L } = useI18n()
  return (
    <div className="editor">
      <Vazio
        titulo={L('Ainda sem preferências', 'No preferences yet')}
        texto={L(
          'Silenciar ou escolher quais notificações receber exige guardar essa escolha por usuário, e a tabela `usuario` ainda não tem onde. Por ora todas as notificações do seu papel chegam, e a central em Notificações permite marcá-las como lidas.',
          'Muting or choosing which notifications to receive requires storing that choice per user, and the `usuario` table has nowhere to put it yet. For now every notification for your role arrives, and the Notifications center lets you mark them read.',
        )}
      />
    </div>
  )
}
