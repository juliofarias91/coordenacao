/** Erros reportados — a caixa de entrada de quem mantém a plataforma.
 *
 *  SÓ QUEM ADMINISTRA VÊ ESTA TELA, e a razão não é hierarquia: o reporte
 *  carrega print, e print de tela de auditoria mostra dado de projeto. Uma
 *  lista aberta a todos viraria um vazamento lateral entre equipes da mesma
 *  organização. A guarda de verdade está no `requer_permissao` da API.
 *
 *  O título e a descrição NÃO são editáveis: são o relato de outra pessoa, e
 *  reescrevê-lo apagaria o que ela de fato disse — que é o dado mais valioso
 *  do reporte. O que se escreve aqui é a RESPOSTA, num campo próprio.
 */
import { useCallback, useEffect, useState } from 'react'

import { Erro, Segmented, Vazio } from '@/components/ui'
import { useI18n } from '@/i18n'
import { ApiError, api } from '@/lib/api'
import type { ReporteErro } from '@/lib/types'

type Filtro = 'todos' | 'aberto' | 'em_analise' | 'resolvido' | 'recusado'

const CLASSE_STATUS: Record<string, string> = {
  aberto: 'pill ruim',
  em_analise: 'pill alerta',
  resolvido: 'pill ok',
  recusado: 'pill',
}

const PROXIMOS = ['aberto', 'em_analise', 'resolvido', 'recusado'] as const

export default function AbaReportes() {
  const { L } = useI18n()
  const [itens, setItens] = useState<ReporteErro[]>([])
  const [filtro, setFiltro] = useState<Filtro>('aberto')
  const [aberto, setAberto] = useState<string | null>(null)
  const [prints, setPrints] = useState<Record<string, string>>({})
  const [respostas, setRespostas] = useState<Record<string, string>>({})
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)

  const carregar = useCallback(async () => {
    setErro(null)
    try {
      const pagina = await api.reportes.listar(filtro === 'todos' ? undefined : filtro)
      setItens(pagina.itens)
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : String(e))
    } finally {
      setCarregando(false)
    }
  }, [filtro])

  useEffect(() => {
    carregar()
  }, [carregar])

  /** A URL assinada do print só é pedida ao ABRIR o reporte. Pedir todas de
   *  uma vez seria uma requisição por linha para imagens que quase nunca se
   *  olham — e elas expiram. */
  async function abrir(r: ReporteErro) {
    const proximo = aberto === r.id ? null : r.id
    setAberto(proximo)
    if (proximo && r.print_url && !prints[r.id]) {
      try {
        const { url } = await api.reportes.printUrl(r.id)
        if (url) setPrints((atual) => ({ ...atual, [r.id]: url }))
      } catch {
        /* o print não abriu; o relato continua legível */
      }
    }
  }

  async function mudar(r: ReporteErro, campos: Record<string, unknown>) {
    setErro(null)
    try {
      await api.reportes.atualizar(r.id, campos)
      await carregar()
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : String(e))
    }
  }

  async function remover(r: ReporteErro) {
    if (
      !confirm(
        L(
          `Apagar o reporte "${r.titulo}"? O relato e o print somem para sempre.`,
          `Delete the report "${r.titulo}"? The description and screenshot are gone for good.`,
        ),
      )
    ) {
      return
    }
    setErro(null)
    try {
      await api.reportes.remover(r.id)
      await carregar()
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : String(e))
    }
  }

  const abas: Array<[Filtro, string]> = [
    ['aberto', L('Abertos', 'Open')],
    ['em_analise', L('Em análise', 'In review')],
    ['resolvido', L('Resolvidos', 'Resolved')],
    ['recusado', L('Recusados', 'Declined')],
    ['todos', L('Todos', 'All')],
  ]

  return (
    <>
      <div className="acoes">
        <Segmented itens={abas} valor={filtro} onChange={setFiltro} />
      </div>

      <Erro mensagem={erro} />

      {carregando ? (
        <p className="hint">{L('Carregando…', 'Loading…')}</p>
      ) : itens.length === 0 ? (
        <Vazio
          titulo={L('Nada por aqui', 'Nothing here')}
          texto={
            filtro === 'aberto'
              ? L(
                  'Nenhum erro em aberto. Quem usa a plataforma reporta pelo menu da conta, em "Apontar erro" — o relato chega aqui com a tela em que a pessoa estava.',
                  'No open reports. People report through the account menu, under "Report a problem" — the report arrives here with the screen they were on.',
                )
              : L('Nenhum reporte com este filtro.', 'No reports with this filter.')
          }
        />
      ) : (
        <div className="card">
          {itens.map((r) => {
            const expandido = aberto === r.id
            return (
              <div key={r.id} className="reporte">
                <button type="button" className="reporte-cab" onClick={() => abrir(r)}>
                  <span className={CLASSE_STATUS[r.status] ?? 'pill'}>{r.status}</span>
                  <span className="reporte-titulo">{r.titulo}</span>
                  <span className="mmeta">
                    {r.usuario_nome || r.usuario_login || L('anônimo', 'anonymous')} ·{' '}
                    {new Date(r.created_at).toLocaleString()}
                    {r.print_url && ` · ${L('com print', 'with screenshot')}`}
                  </span>
                </button>

                {expandido && (
                  <div className="reporte-corpo">
                    {r.descricao && <p className="reporte-desc">{r.descricao}</p>}

                    {/* A TELA EM QUE A PESSOA ESTAVA. Vai junto sem ninguém
                        digitar, e é o que transforma "não funciona" num
                        chamado que já começa com metade da resposta. */}
                    {r.caminho && (
                      <p className="mmeta">
                        {L('Estava em', 'Was on')} <code>{r.caminho}</code>
                      </p>
                    )}

                    {r.print_url &&
                      (prints[r.id] ? (
                        <a href={prints[r.id]} target="_blank" rel="noreferrer">
                          <img className="reporte-print" src={prints[r.id]} alt={r.titulo} />
                        </a>
                      ) : (
                        <p className="hint">{L('Carregando o print…', 'Loading screenshot…')}</p>
                      ))}

                    <label className="fl">{L('Resposta', 'Reply')}</label>
                    <textarea
                      className="f"
                      rows={2}
                      placeholder={L(
                        'O que foi feito, ou por que não será.',
                        'What was done, or why it will not be.',
                      )}
                      value={respostas[r.id] ?? r.resposta ?? ''}
                      onChange={(e) =>
                        setRespostas((atual) => ({ ...atual, [r.id]: e.target.value }))
                      }
                    />

                    <div className="acoes" style={{ marginTop: 10 }}>
                      <select
                        className="f"
                        style={{ maxWidth: 180 }}
                        value={r.status}
                        onChange={(e) => mudar(r, { status: e.target.value })}
                      >
                        {PROXIMOS.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                      <button
                        className="btn pri"
                        onClick={() => mudar(r, { resposta: respostas[r.id] ?? r.resposta ?? '' })}
                      >
                        {L('Salvar resposta', 'Save reply')}
                      </button>
                      <div style={{ flex: 1 }} />
                      <button className="btn sm danger" onClick={() => remover(r)}>
                        {L('Apagar', 'Delete')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
