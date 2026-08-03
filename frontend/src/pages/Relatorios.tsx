/** SP-207 · Relatórios e RNC.
 *
 *  Nada aqui é armazenado: a lista de não-conformidades é consulta, e o PDF é
 *  gerado na hora a partir das mesmas auditorias.
 */
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { Erro, Segmented, Vazio } from '@/components/ui'
import { useI18n } from '@/i18n'
import { ApiError, api } from '@/lib/api'
import type { LinhaPainel, NaoConformidade } from '@/lib/types'
import { useProjeto } from '@/projeto/ProjetoContext'

type Filtro = 'todas' | 'aberto' | 'em_analise' | 'resolvido'

const CLASSE_STATUS: Record<string, string> = {
  aberto: 'pill ruim',
  em_analise: 'pill alerta',
  resolvido: 'pill ok',
}

export default function Relatorios() {
  const { projeto, carregando } = useProjeto()
  const { L, lang } = useI18n()
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const [ncs, setNcs] = useState<NaoConformidade[]>([])
  const [modelos, setModelos] = useState<LinhaPainel[]>([])
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    if (!projeto) return
    setErro(null)
    try {
      const [lista, painel] = await Promise.all([
        api.ncs.doProjeto(projeto.id, filtro === 'todas' ? undefined : filtro),
        api.painel(projeto.id),
      ])
      setNcs(lista)
      setModelos(painel.linhas)
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : String(e))
    }
  }, [projeto, filtro])

  useEffect(() => {
    carregar()
  }, [carregar])

  if (carregando) return <p className="hint">{L('Carregando…', 'Loading…')}</p>
  if (!projeto) {
    return (
      <>
        <Vazio
          titulo={L('Nenhum projeto', 'No project')}
          texto={L('Cadastre um projeto primeiro.', 'Register a project first.')}
        />
      </>
    )
  }

  async function baixar(url: string, nome: string) {
    setErro(null)
    try {
      await api.baixarArquivo(url, nome)
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : String(e))
    }
  }

  async function mudarStatus(nc: NaoConformidade, status: string) {
    setErro(null)
    try {
      await api.ncs.atualizar(nc.id, { status })
      await carregar()
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : String(e))
    }
  }

  return (
    <>
      <div className="acoes">
        <Segmented
          itens={[
            ['todas', L('Todas', 'All')],
            ['aberto', L('Abertas', 'Open')],
            ['em_analise', L('Em análise', 'In review')],
            ['resolvido', L('Resolvidas', 'Resolved')],
          ]}
          valor={filtro}
          onChange={setFiltro}
        />
        <div style={{ flex: 1 }} />
        <button
          className="btn"
          onClick={() =>
            baixar(api.controleXlsx(projeto.id), `Controle_${projeto.codigo}.xlsx`)
          }
        >
          {L('Controle (.xlsx)', 'Control (.xlsx)')}
        </button>
      </div>

      <Erro mensagem={erro} />

      <div className="card" style={{ marginBottom: 24 }}>
        <table>
          <thead>
            <tr>
              <th>{L('Não-conformidade', 'Non-conformity')}</th>
              <th>{L('Elementos', 'Elements')}</th>
              <th>{L('Prazo', 'Due')}</th>
              <th style={{ textAlign: 'right' }}>{L('Situação', 'Status')}</th>
            </tr>
          </thead>
          <tbody>
            {ncs.map((nc) => (
              <tr key={nc.id}>
                <td>
                  <b>{nc.descricao || '—'}</b>
                  {nc.recomendacao && <div className="mmeta">{nc.recomendacao}</div>}
                  {nc.comentarios.length > 0 && (
                    <div className="mmeta" style={{ color: 'var(--accent)' }}>
                      {nc.comentarios.length} {L('resposta(s) do fornecedor', 'supplier reply(ies)')}
                    </div>
                  )}
                </td>
                <td>
                  {nc.elementos ? <span className="ids">{nc.elementos}</span> : <span className="co">—</span>}
                </td>
                <td className="co">{nc.prazo ?? '—'}</td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <span className={CLASSE_STATUS[nc.status] ?? 'pill'}>{nc.status}</span>{' '}
                  {nc.status !== 'resolvido' && (
                    <button className="btn sm" onClick={() => mudarStatus(nc, 'resolvido')}>
                      {L('Resolver', 'Resolve')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {ncs.length === 0 && (
              <tr>
                <td colSpan={4} className="empty">
                  <b>{L('Nenhuma não-conformidade', 'No non-conformity')}</b>
                  {L(
                    'As NCs nascem dos itens reprovados nas auditorias.',
                    'NCs come from rejected items in the audits.',
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="sectitle">{L('Relatório por modelo', 'Report per model')}</div>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>{L('Modelo', 'Model')}</th>
              <th style={{ textAlign: 'center' }}>{L('Versão', 'Version')}</th>
              <th style={{ textAlign: 'right' }} />
            </tr>
          </thead>
          <tbody>
            {modelos.map((m) => (
              <tr key={m.modelo_id}>
                <td>
                  <div className="mcell">
                    <span className="macro" style={{ background: m.cor_macro ?? 'var(--na)' }} />
                    <div>
                      <Link to={`/modelos/${m.modelo_id}`} className="code">
                        {m.codigo}
                      </Link>
                      <div className="mmeta">{m.disciplina_codigo ?? '—'}</div>
                    </div>
                  </div>
                </td>
                <td className="ver">{m.versao ?? '—'}</td>
                <td style={{ textAlign: 'right' }}>
                  <button
                    className="btn sm"
                    onClick={() =>
                      baixar(api.modelos.relatorioPdf(m.modelo_id, lang), `RNC_${m.codigo}.pdf`)
                    }
                  >
                    {L('Baixar PDF', 'Download PDF')}
                  </button>
                </td>
              </tr>
            ))}
            {modelos.length === 0 && (
              <tr>
                <td colSpan={3} className="empty">
                  {L('Nenhum modelo cadastrado.', 'No models yet.')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
