/** SP-401 · Sino de notificações com badge de não-lidas.
 *
 *  É o AVISO, não a caixa: mostra as últimas por cima da tela em que se está e
 *  some. Quem precisa procurar vai para a central (`/notificacoes`), que tem
 *  filtro por tipo e separação por dia — daí o rodapé com "ver todas". */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { useI18n } from '@/i18n'
import { api } from '@/lib/api'
import type { Notificacao } from '@/lib/types'

const CLASSE_TIPO: Record<string, string> = {
  erro: 'pill ruim',
  penalidade: 'pill alerta',
  auditoria: 'pill ok',
}

export default function Sino() {
  const { L } = useI18n()
  const [aberto, setAberto] = useState(false)
  const [naoLidas, setNaoLidas] = useState(0)
  const [itens, setItens] = useState<Notificacao[]>([])
  const caixa = useRef<HTMLDivElement>(null)

  const contar = useCallback(async () => {
    try {
      setNaoLidas((await api.notif.contador()).nao_lidas)
    } catch {
      /* sem sessão ou API fora do ar: o sino simplesmente não acusa nada */
    }
  }, [])

  useEffect(() => {
    contar()
    // Intervalo largo de propósito: notificação de auditoria não é chat, e
    // uma consulta por minuto já parece instantânea para quem está usando.
    const timer = setInterval(contar, 60_000)
    return () => clearInterval(timer)
  }, [contar])

  useEffect(() => {
    if (!aberto) return
    api.notif.listar().then(setItens).catch(() => setItens([]))

    function fora(e: MouseEvent) {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [aberto])

  async function marcar(id: string) {
    await api.notif.marcarLida(id)
    setItens((atual) => atual.map((n) => (n.id === id ? { ...n, lida: true } : n)))
    contar()
  }

  async function marcarTodas() {
    await api.notif.marcarTodas()
    setItens((atual) => atual.map((n) => ({ ...n, lida: true })))
    contar()
  }

  const rotulo = L('Notificações', 'Notifications')

  return (
    <div className="sino" ref={caixa}>
      {/* Pílula de ação da topbar: nasce redonda e o rótulo cresce no hover.
          A contagem "recorta" o fundo com um anel da cor da barra, para
          continuar legível quando encosta no ícone. */}
      <button
        type="button"
        className={`pillact${aberto ? ' on' : ''}`}
        onClick={() => setAberto(!aberto)}
        title={rotulo}
        aria-label={rotulo}
      >
        <span className="rot">{rotulo}</span>
        <span className="ico">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          {naoLidas > 0 && <span className="ponto num">{naoLidas > 99 ? '99+' : naoLidas}</span>}
        </span>
      </button>

      {aberto && (
        <div className="sinopainel">
          <div className="sinocab">
            <b>{rotulo}</b>
            {naoLidas > 0 && (
              <button className="linkmudo" onClick={marcarTodas}>
                {L('marcar todas', 'mark all')}
              </button>
            )}
          </div>
          <div className="sinolista">
            {itens.map((n) => (
              <div key={n.id} className={`sinoitem${n.lida ? ' lida' : ''}`}>
                <span className={CLASSE_TIPO[n.tipo] ?? 'pill'}>{n.tipo}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="sinomsg">{n.mensagem}</div>
                  <div className="mmeta">{new Date(n.created_at).toLocaleString()}</div>
                </div>
                {!n.lida && (
                  <button className="linkmudo" onClick={() => marcar(n.id)}>
                    ✓
                  </button>
                )}
              </div>
            ))}
            {itens.length === 0 && (
              <div className="empty">{L('Nada por aqui.', 'Nothing here.')}</div>
            )}
          </div>

          {/* Fecha o painel ao navegar: sem isso ele ficaria aberto sobre a
              central, escondendo justamente a tela que se pediu. */}
          <Link className="sinorodape" to="/notificacoes" onClick={() => setAberto(false)}>
            {L('Ver todas', 'See all')}
          </Link>
        </div>
      )}
    </div>
  )
}
