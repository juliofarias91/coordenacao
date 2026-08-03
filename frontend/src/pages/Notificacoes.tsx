/** SP-401 · Central de notificações.
 *
 *  O sino da topbar (`components/Sino.tsx`) continua existindo e não é
 *  redundante: ele é o AVISO — aparece por cima da tela em que se está,
 *  responde "chegou algo?" e some. Esta é a CAIXA — chega-se a ela de
 *  propósito, para procurar o que se perdeu de vista. Daí o que ela tem e o
 *  sino não: filtro por tipo, separação por dia e a leitura em massa dentro de
 *  um filtro.
 *
 *  É rota global (`/notificacoes`), sem projeto na URL: notificação é do
 *  usuário e do papel dele, não de um projeto. O backend endereça por
 *  `usuario_id` ou `papel_alvo`, e o admin enxerga tudo da organização — uma
 *  falha de automação que o admin não visse seria descoberta tarde demais.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'

import { Erro, Segmented, Vazio } from '@/components/ui'
import { useI18n } from '@/i18n'
import { ApiError, api } from '@/lib/api'
import type { Notificacao } from '@/lib/types'

type Tipo = 'todos' | 'auditoria' | 'erro' | 'penalidade' | 'acesso'

/** Estado semântico é sempre TRANSLÚCIDO no sistema visual — as classes
 *  `ok/alerta/ruim` já resolvem isso; aqui só se escolhe qual. */
const CLASSE_TIPO: Record<string, string> = {
  erro: 'pill ruim',
  penalidade: 'pill alerta',
  auditoria: 'pill ok',
  // Alerta e não `ok`: das quatro, é a única que PEDE UMA AÇÃO de quem
  // administra — enquanto ninguém gerar o link, a pessoa continua sem entrar.
  acesso: 'pill alerta',
}

const ROTULO_TIPO: Record<string, [string, string]> = {
  auditoria: ['Auditoria', 'Audit'],
  erro: ['Erro', 'Error'],
  penalidade: ['Penalidade', 'Penalty'],
  acesso: ['Acesso', 'Access'],
}

function dia(iso: string): string {
  return new Date(iso).toLocaleDateString()
}

function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function Notificacoes() {
  const { L } = useI18n()
  const [itens, setItens] = useState<Notificacao[]>([])
  const [tipo, setTipo] = useState<Tipo>('todos')
  const [soNaoLidas, setSoNaoLidas] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [marcando, setMarcando] = useState(false)

  const carregar = useCallback(async () => {
    setErro(null)
    try {
      setItens(
        await api.notif.listar({
          apenas_nao_lidas: soNaoLidas,
          tipo: tipo === 'todos' ? undefined : tipo,
        }),
      )
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : String(e))
    } finally {
      setCarregando(false)
    }
  }, [tipo, soNaoLidas])

  useEffect(() => {
    carregar()
  }, [carregar])

  async function marcar(id: string) {
    // Otimista: a linha esmaece na hora e a requisição vai atrás. Marcar como
    // lida é reversível na prática (a mensagem continua na lista), então
    // esperar o servidor só acrescentaria latência a um gesto que se repete.
    setItens((atual) => atual.map((n) => (n.id === id ? { ...n, lida: true } : n)))
    try {
      await api.notif.marcarLida(id)
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : String(e))
      await carregar()
    }
  }

  async function marcarTodas() {
    setMarcando(true)
    setErro(null)
    try {
      // O endpoint marca TODAS as visíveis, não só as filtradas na tela — daí
      // a confirmação dizer isso em vez de "marcar as N desta lista".
      await api.notif.marcarTodas()
      await carregar()
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : String(e))
    } finally {
      setMarcando(false)
    }
  }

  const naoLidas = useMemo(() => itens.filter((n) => !n.lida).length, [itens])

  /** Blocos de dia, preservando a ordem da API (`created_at DESC`). */
  const porDia = useMemo(() => {
    const blocos: Array<{ dia: string; itens: Notificacao[] }> = []
    for (const n of itens) {
      const d = dia(n.created_at)
      const ultimo = blocos[blocos.length - 1]
      if (ultimo && ultimo.dia === d) ultimo.itens.push(n)
      else blocos.push({ dia: d, itens: [n] })
    }
    return blocos
  }, [itens])

  /** Cai no valor cru se o tipo for novo: uma notificação de um tipo que a
   *  tela ainda não conhece aparece sem tradução, em vez de sumir. */
  const rotuloTipo = (t: string) => {
    const par = ROTULO_TIPO[t]
    return par ? L(par[0], par[1]) : t
  }

  const abas: Array<[Tipo, string]> = [
    ['todos', L('Todas', 'All')],
    ['auditoria', L('Auditoria', 'Audit')],
    ['erro', L('Erros', 'Errors')],
    ['penalidade', L('Penalidades', 'Penalties')],
    ['acesso', L('Acesso', 'Access')],
  ]

  return (
    <>
      <div className="filters">
        <Segmented itens={abas} valor={tipo} onChange={setTipo} />

        <button
          type="button"
          className={`chip${soNaoLidas ? ' on' : ''}`}
          onClick={() => setSoNaoLidas(!soNaoLidas)}
        >
          {L('Só não lidas', 'Unread only')}
        </button>

        {naoLidas > 0 && (
          <button className="btn sm" onClick={marcarTodas} disabled={marcando}>
            {marcando
              ? L('Marcando…', 'Marking…')
              : L('Marcar todas como lidas', 'Mark all as read')}
          </button>
        )}
      </div>

      <Erro mensagem={erro} />

      {carregando && <p className="hint">{L('Carregando…', 'Loading…')}</p>}

      {!carregando && itens.length === 0 && (
        <Vazio
          titulo={L('Nada por aqui', 'Nothing here')}
          texto={
            tipo !== 'todos' || soNaoLidas
              ? L(
                  'Nenhuma notificação com estes filtros. Volte para "Todas" para ver o restante.',
                  'No notifications with these filters. Go back to "All" to see the rest.',
                )
              : L(
                  'As notificações nascem sozinhas: quando um round é publicado, quando a automação falha, quando uma penalidade é aplicada e quando alguém pede redefinição de senha.',
                  'Notifications appear on their own: when a round is published, when automation fails, when a penalty is applied, and when someone requests a password reset.',
                )
          }
        />
      )}

      {porDia.map((bloco) => (
        <div key={bloco.dia} className="card" style={{ marginBottom: 12 }}>
          <div className="grp">{bloco.dia}</div>
          <div>
            {bloco.itens.map((n) => (
              <div key={n.id} className={`notif-linha${n.lida ? ' lida' : ''}`}>
                <span className={CLASSE_TIPO[n.tipo] ?? 'pill'}>{rotuloTipo(n.tipo)}</span>

                <div className="notif-corpo">
                  <div className="notif-msg">{n.mensagem}</div>
                  <div className="mmeta">
                    {hora(n.created_at)}
                    {n.origem && ` · ${n.origem}`}
                    {n.papel_alvo && ` · ${L('para', 'to')} ${n.papel_alvo}`}
                  </div>
                </div>

                {n.lida ? (
                  <span className="mmeta">{L('lida', 'read')}</span>
                ) : (
                  <button className="btn sm" onClick={() => marcar(n.id)}>
                    {L('Marcar lida', 'Mark read')}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  )
}
