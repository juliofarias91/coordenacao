/** Configurações da CONTA — dados pessoais, preferências e segurança.
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
 *  O que AINDA NÃO tem onde ser guardado está dito como tal, e não escondido:
 *  preferência de notificação exige coluna nova em `usuario`.
 */
import { useState } from 'react'

import { Campo, Cabecalho, Erro, Vazio } from '@/components/ui'
import { useAuth } from '@/auth/AuthContext'
import { useI18n } from '@/i18n'
import { ApiError, api } from '@/lib/api'
import { useTheme } from '@/theme/ThemeProvider'

/** O mínimo que o backend aceita (`SenhaUpdate`). Validar aqui evita uma
 *  ida ao servidor para receber de volta o que a tela já sabia. */
const MIN_SENHA = 8

export default function Configuracoes() {
  const { L, lang, setLang } = useI18n()
  const { theme, setTheme } = useTheme()
  const { usuario } = useAuth()

  const [senha, setSenha] = useState('')
  const [repetida, setRepetida] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvo, setSalvo] = useState(false)
  const [salvando, setSalvando] = useState(false)

  if (!usuario) return null

  async function trocarSenha() {
    if (!usuario) return
    setErro(null)
    setSalvo(false)

    if (senha.length < MIN_SENHA) {
      setErro(
        L(
          `A senha precisa de pelo menos ${MIN_SENHA} caracteres.`,
          `The password needs at least ${MIN_SENHA} characters.`,
        ),
      )
      return
    }
    // Confirmação no cliente: o servidor não tem como saber que houve um erro
    // de digitação, e uma senha trocada por engano tranca quem a trocou.
    if (senha !== repetida) {
      setErro(L('As duas senhas não conferem.', 'The two passwords do not match.'))
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

  return (
    <>
      <Cabecalho
        titulo={L('Configurações', 'Settings')}
        sub={L(
          'Sua conta e o que vale para você em qualquer projeto. Para configurar um projeto — disciplinas, critérios, padrões —, abra o projeto e vá em Configurações do projeto.',
          'Your account and what holds for you in any project. To configure a project — disciplines, criteria, standards — open the project and go to Project setup.',
        )}
      />

      <div className="editor">
        <h3>{L('Dados pessoais', 'Personal data')}</h3>
        <div className="frow">
          <Campo rotulo={L('Nome', 'Name')}>
            {/* Somente leitura: nome e login definem quem assina a auditoria e
                aparecem na trilha. Trocá-los é ato de quem administra
                cadastros, em Gestão de membros — não do próprio, no meio de
                um round. */}
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

      <div className="editor">
        <h3>{L('Preferências', 'Preferences')}</h3>
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
          <Campo rotulo={L('Tema', 'Theme')}>
            <select
              className="f"
              value={theme}
              onChange={(e) => setTheme(e.target.value as 'light' | 'dark')}
            >
              <option value="light">{L('Claro', 'Light')}</option>
              <option value="dark">{L('Escuro', 'Dark')}</option>
            </select>
          </Campo>
        </div>
        <p className="hint">
          {L(
            'Idioma e tema valem neste navegador — são preferências de quem usa, não da conta. Em outra máquina, escolha de novo.',
            'Language and theme apply to this browser — they are the viewer’s preference, not the account’s. On another machine, pick again.',
          )}
        </p>
      </div>

      <div className="editor">
        <h3>{L('Segurança', 'Security')}</h3>
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
        <p className="hint">
          {L(
            'A senha é guardada só como hash Argon2 — nem a SPBIM consegue lê-la, apenas substituí-la. A sessão atual continua válida depois da troca.',
            'The password is stored only as an Argon2 hash — not even SPBIM can read it, only replace it. Your current session stays valid after the change.',
          )}
        </p>
      </div>

      <div className="editor">
        <h3>{L('Notificações', 'Notifications')}</h3>
        <Vazio
          titulo={L('Ainda sem preferências', 'No preferences yet')}
          texto={L(
            'Silenciar ou escolher quais notificações receber exige guardar essa escolha por usuário, e a tabela `usuario` ainda não tem onde. Por ora todas as notificações do seu papel chegam, e a central em Notificações permite marcá-las como lidas.',
            'Muting or choosing which notifications to receive requires storing that choice per user, and the `usuario` table has nowhere to put it yet. For now every notification for your role arrives, and the Notifications center lets you mark them read.',
          )}
        />
      </div>
    </>
  )
}
