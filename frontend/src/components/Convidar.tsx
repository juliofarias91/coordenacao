/** Convidar para o projeto — o botão do rodapé da sidebar de projeto.
 *
 *  O QUE ELE CONVIDA, E O QUE NÃO. A plataforma tem hoje UM tipo de convite que
 *  se envia: o do PORTAL DO CLIENTE — um link com token que dá acesso de
 *  leitura ao painel do projeto, com visibilidade definida campo a campo. É
 *  esse que este botão cria, e é por isso que ele pede nome e e-mail do cliente.
 *
 *  Convidar um MEMBRO DE TIME é outra coisa e ainda não existe: exigiria enviar
 *  e-mail e ter uma tela de definição de senha (o item 11 do CONTINUACAO —
 *  "acesso só por convite do admin"). Enquanto isso, quem já tem conta entra no
 *  projeto por `Membros do projeto`, e o painel aqui aponta para lá em vez de
 *  fingir que manda convite para quem ainda não tem conta.
 *
 *  Fica no rodapé da barra, e não numa aba de Configuração, porque convidar é
 *  ato de rotina de quem coordena — a mesma posição em que a Home tem o Sair.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { Erro } from '@/components/ui'
import { useI18n } from '@/i18n'
import { ApiError, api } from '@/lib/api'
import type { Convite, Projeto } from '@/lib/types'
import { rotaProjeto } from '@/projeto/ProjetoContext'

/** A URL que se manda ao cliente. Montada a partir da origem atual porque o
 *  token é a credencial e o portal é rota da própria aplicação. */
function urlDoPortal(token: string): string {
  return `${window.location.origin}/portal/${token}`
}

export default function Convidar({ projeto }: { projeto: Projeto }) {
  const { L } = useI18n()
  const [aberto, setAberto] = useState(false)
  const [convites, setConvites] = useState<Convite[]>([])
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [copiado, setCopiado] = useState<string | null>(null)
  const caixa = useRef<HTMLDivElement>(null)

  const carregar = useCallback(async () => {
    try {
      setConvites(await api.convites.listar(projeto.id))
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : String(e))
    }
  }, [projeto.id])

  useEffect(() => {
    if (!aberto) return
    carregar()

    function fora(e: MouseEvent) {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false)
    }
    function tecla(e: KeyboardEvent) {
      if (e.key === 'Escape') setAberto(false)
    }
    document.addEventListener('mousedown', fora)
    document.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('mousedown', fora)
      document.removeEventListener('keydown', tecla)
    }
  }, [aberto, carregar])

  async function criar() {
    setErro(null)
    setSalvando(true)
    try {
      const criado = await api.convites.criar(projeto.id, {
        cliente_nome: nome.trim() || null,
        cliente_email: email.trim() || null,
      })
      setNome('')
      setEmail('')
      await carregar()
      // Copia na hora: o convite SÓ SERVE como link, e obrigar um segundo
      // clique para pegá-lo seria pedir duas ações para uma intenção.
      await copiar(criado.token)
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : String(e))
    } finally {
      setSalvando(false)
    }
  }

  async function copiar(token: string) {
    try {
      await navigator.clipboard.writeText(urlDoPortal(token))
      setCopiado(token)
      setTimeout(() => setCopiado(null), 2000)
    } catch {
      // Sem permissão de área de transferência (http, ou o navegador negou):
      // o link continua visível na lista para ser copiado à mão.
      setErro(L('Não consegui copiar — copie o link da lista.', 'Could not copy — copy from the list.'))
    }
  }

  const ativos = convites.filter((c) => c.ativo)

  return (
    <div className="side-acao" ref={caixa}>
      <button
        type="button"
        className={`side-botao${aberto ? ' on' : ''}`}
        onClick={() => setAberto(!aberto)}
        title={L('Convidar para o projeto', 'Invite to the project')}
      >
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M19 8v6M22 11h-6" />
        </svg>
        <span className="nav-rot">{L('Convidar', 'Invite')}</span>
      </button>

      {aberto && (
        <div className="side-painel">
          <div className="sinocab">
            <b>{L('Convidar para o portal', 'Invite to the portal')}</b>
          </div>

          <div style={{ padding: 12 }}>
            <p className="hint" style={{ marginTop: 0 }}>
              {L(
                'Gera um link de leitura do painel deste projeto. Quem recebe não precisa de conta — o link é a credencial, e o que ele mostra se ajusta em Configurações do projeto.',
                'Creates a read-only link to this project’s panel. The recipient needs no account — the link is the credential, and what it shows is set under Project setup.',
              )}
            </p>

            <Erro mensagem={erro} />

            <input
              className="f"
              style={{ marginBottom: 8 }}
              placeholder={L('Nome do convidado', 'Guest name')}
              value={nome}
              onChange={(e) => setNome(e.target.value)}
            />
            <input
              className="f"
              style={{ marginBottom: 10 }}
              type="email"
              placeholder={L('E-mail (opcional)', 'E-mail (optional)')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button className="btn pri block" onClick={criar} disabled={salvando}>
              {salvando ? L('Gerando…', 'Creating…') : L('Gerar link e copiar', 'Create link and copy')}
            </button>

            {ativos.length > 0 && (
              <div className="side-convites">
                {ativos.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="side-convite"
                    onClick={() => copiar(c.token)}
                    title={urlDoPortal(c.token)}
                  >
                    <span className="side-convite-nome">
                      {c.cliente_nome || c.cliente_email || L('Sem nome', 'Unnamed')}
                    </span>
                    <span className="mmeta">
                      {copiado === c.token ? L('copiado', 'copied') : L('copiar link', 'copy link')}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* A outra metade da pergunta "convidar quem?". Dizer onde fica é
                mais útil do que deixar quem procura membro de time achar que
                este painel não serviu. */}
            <p className="hint" style={{ marginBottom: 0 }}>
              {L('Para pôr alguém do time no projeto, use ', 'To put a teammate on the project, use ')}
              <Link to={rotaProjeto(projeto.id, 'membros')} onClick={() => setAberto(false)}>
                {L('Membros do projeto', 'Project members')}
              </Link>
              {L(
                '. Convite por e-mail para quem ainda não tem conta ainda não existe.',
                '. E-mail invites for people without an account do not exist yet.',
              )}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
