/** SP-402/403 · KPIs do projeto e placar de conformidade.
 *
 *  Todo número aqui é derivado das auditorias. Não existe onde digitá-los.
 */
import { useCallback, useEffect, useState } from 'react'

import { BarrasHorizontais, BarraEmpilhada, LinhaEvolucao } from '@/components/graficos'
import { Erro, Vazio } from '@/components/ui'
import { useI18n } from '@/i18n'
import { ApiError, api } from '@/lib/api'
import type { KPIs, Placar } from '@/lib/types'
import { useProjeto } from '@/projeto/ProjetoContext'

function corDoPercentual(pct: number | null): string {
  if (pct === null) return 'var(--na)'
  return pct >= 90 ? 'var(--ok)' : pct >= 60 ? 'var(--wait)' : 'var(--bad)'
}

export default function Kpis() {
  const { projeto, carregando } = useProjeto()
  const { L } = useI18n()
  const [kpis, setKpis] = useState<KPIs | null>(null)
  const [placar, setPlacar] = useState<Placar | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    if (!projeto) return
    setErro(null)
    try {
      const [k, p] = await Promise.all([api.kpis(projeto.id), api.scorecard(projeto.id)])
      setKpis(k)
      setPlacar(p)
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : String(e))
    }
  }, [projeto])

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

  const media = kpis?.aprovacao_media == null ? null : Number(kpis.aprovacao_media)

  return (
    <>
      <Erro mensagem={erro} />

      {kpis && (
        <>
          {/* O número que a tela lidera. Um só por visão. */}
          <div className="metrics">
            <div className="metric">
              <div className="lb">{L('Aprovação média', 'Average approval')}</div>
              <div className="vl" style={{ color: corDoPercentual(media), fontSize: 34 }}>
                {media === null ? '—' : `${Math.round(media)}%`}
              </div>
            </div>
            <div className="metric">
              <div className="lb">{L('Modelos · versões', 'Models · versions')}</div>
              <div className="vl">
                {kpis.modelos}
                <small> · {kpis.versoes}</small>
              </div>
            </div>
            <div className="metric">
              <div className="lb">{L('Rounds publicados', 'Published rounds')}</div>
              <div className="vl">{kpis.auditorias_publicadas}</div>
            </div>
            <div className="metric">
              <div className="lb">{L('NCs abertas', 'Open NCs')}</div>
              <div className="vl" style={{ color: kpis.ncs_abertas ? 'var(--bad)' : undefined }}>
                {kpis.ncs_abertas}
                {kpis.ncs_resolvidas > 0 && (
                  <small>
                    {' '}
                    · {kpis.ncs_resolvidas} {L('resolvida(s)', 'resolved')}
                  </small>
                )}
              </div>
            </div>
          </div>

          <div className="graficos">
            <BarrasHorizontais
              titulo={L('Aprovação por macrodisciplina', 'Approval by macro-discipline')}
              sub={L('Média dos modelos de cada macro', 'Average across each macro models')}
              fatias={kpis.por_macro}
              sufixo="%"
            />

            <LinhaEvolucao
              titulo={L('Evolução por round', 'Evolution by round')}
              sub={L(
                'Responde se a conversa com o fornecedor está funcionando',
                'Tells whether the supplier conversation is working',
              )}
              pontos={kpis.evolucao}
            />

            <BarraEmpilhada
              titulo={L('Itens verificados', 'Checked items')}
              sub={L('Distribuição de todos os itens de auditoria', 'All audit items by status')}
              fatias={kpis.por_status_de_item}
            />

            <BarraEmpilhada
              titulo={L('Situação dos modelos', 'Model states')}
              sub={L('Round vigente de cada modelo', 'Current round of each model')}
              fatias={kpis.por_estado}
            />
          </div>

          {kpis.criterios_mais_reprovados.length > 0 && (
            <div className="graficos" style={{ gridTemplateColumns: '1fr' }}>
              <BarrasHorizontais
                titulo={L('Critérios que mais reprovam', 'Most-rejected criteria')}
                sub={L(
                  'Onde vale investir em orientação ao fornecedor',
                  'Where supplier guidance pays off most',
                )}
                fatias={kpis.criterios_mais_reprovados}
                corUnica
              />
            </div>
          )}
        </>
      )}

      <div className="sectitle">{L('Placar de conformidade', 'Compliance scorecard')}</div>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>{L('Fornecedor', 'Supplier')}</th>
              <th className="num">{L('Modelos', 'Models')}</th>
              <th className="num">{L('Aprovação', 'Approval')}</th>
              <th className="num">{L('NCs', 'NCs')}</th>
              <th className="num">{L('Penalidades', 'Penalties')}</th>
              <th style={{ width: 180 }}>{L('Índice', 'Index')}</th>
            </tr>
          </thead>
          <tbody>
            {placar?.linhas.map((linha, i) => {
              // A numeração é do ranking: quem não foi avaliado não recebe
              // posição, porque não está competindo.
              const posicao = placar.linhas.slice(0, i + 1).filter((l) => l.avaliado).length
              return (
                <tr key={linha.empresa_id} style={linha.avaliado ? undefined : { opacity: 0.65 }}>
                  <td>
                    <b>
                      {linha.avaliado ? `${posicao}. ` : ''}
                      {linha.empresa}
                    </b>
                  </td>
                  <td className="num co">{linha.modelos}</td>
                  <td className="num co">
                    {linha.aprovacao_media === null
                      ? '—'
                      : `${Math.round(Number(linha.aprovacao_media))}%`}
                  </td>
                  <td className="num co">{linha.ncs_abertas}</td>
                  <td className="num co">{linha.penalidades}</td>
                  <td>
                    {linha.avaliado ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        <div className="medidor">
                          <i
                            style={{
                              width: `${Math.min(100, Number(linha.indice))}%`,
                              background: corDoPercentual(Number(linha.indice)),
                            }}
                          />
                        </div>
                        <span className="pctn">{Math.round(Number(linha.indice))}</span>
                      </div>
                    ) : (
                      <span className="co" style={{ fontSize: 12 }}>
                        {L('sem auditoria ainda', 'not audited yet')}
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
            {placar?.linhas.length === 0 && (
              <tr>
                <td colSpan={6} className="empty">
                  <b>{L('Sem fornecedor avaliado', 'No supplier rated yet')}</b>
                  {L(
                    'O placar considera a empresa instaladora de cada modelo.',
                    'The scorecard uses the installer company of each model.',
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {placar && placar.linhas.length > 0 && (
        <p className="hint">
          {L('Como o índice é calculado:', 'How the index is computed:')} {placar.formula}
        </p>
      )}
    </>
  )
}
