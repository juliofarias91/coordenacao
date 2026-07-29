/** SP-203/204/205 · Execução da auditoria.
 *
 *  Réplica do fluxo do protótipo: escolhe-se a versão, abrem-se as abas que a
 *  disciplina declara, e cada item cicla entre aprovado / reprovado /
 *  pendente / N/A. A aprovação é recalculada a cada clique, no servidor —
 *  a tela nunca calcula percentual por conta própria.
 */
import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { Erro } from '@/components/ui'
import { useI18n } from '@/i18n'
import { ApiError, api } from '@/lib/api'
import type {
  Auditoria,
  AuditoriaDetalhe,
  CheckStatus,
  Execucao,
  ModeloDetalhe,
  NaoConformidade,
  Resultado,
  Versao,
} from '@/lib/types'
import { rotaProjeto } from '@/projeto/ProjetoContext'

const CICLO: CheckStatus[] = ['pendente', 'aprovado', 'reprovado', 'na']

const CLASSE_STATUS: Record<CheckStatus, string> = {
  aprovado: 'setp ok',
  reprovado: 'setp bad',
  pendente: 'setp wait',
  na: 'setp na',
}

const ROTULO_CHECKLIST: Record<string, [string, string]> = {
  geral: ['Geral', 'General'],
  ifc: ['IFC', 'IFC'],
  '4d': ['4D Parâmetros', '4D Parameters'],
  lod400: ['LOD 400', 'LOD 400'],
  lod500: ['LOD 500', 'LOD 500'],
}

export default function ModeloView() {
  const { projetoId, modeloId } = useParams<{ projetoId: string; modeloId: string }>()
  const { L, lang } = useI18n()

  const [modelo, setModelo] = useState<ModeloDetalhe | null>(null)
  const [versaoId, setVersaoId] = useState<string | null>(null)
  const [auditorias, setAuditorias] = useState<Auditoria[]>([])
  const [abaId, setAbaId] = useState<string | null>(null)
  const [detalhe, setDetalhe] = useState<AuditoriaDetalhe | null>(null)
  const [ncs, setNcs] = useState<NaoConformidade[]>([])
  const [aberto, setAberto] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [execucao, setExecucao] = useState<Execucao | null>(null)

  const carregarModelo = useCallback(async () => {
    if (!modeloId) return
    const m = await api.modelos.obter(modeloId)
    setModelo(m)
    setVersaoId((atual) => atual ?? m.versoes[m.versoes.length - 1]?.id ?? null)
  }, [modeloId])

  const carregarAuditorias = useCallback(async () => {
    if (!versaoId) return
    const lista = await api.versoes.auditorias(versaoId)
    setAuditorias(lista)
    setAbaId((atual) => (atual && lista.some((a) => a.id === atual) ? atual : (lista[0]?.id ?? null)))
  }, [versaoId])

  const carregarDetalhe = useCallback(async () => {
    if (!abaId) {
      setDetalhe(null)
      setNcs([])
      return
    }
    const [d, n] = await Promise.all([api.auditorias.obter(abaId), api.auditorias.ncs(abaId)])
    setDetalhe(d)
    setNcs(n)
  }, [abaId])

  useEffect(() => {
    carregarModelo().catch((e) => setErro(String(e)))
  }, [carregarModelo])
  useEffect(() => {
    carregarAuditorias().catch((e) => setErro(String(e)))
  }, [carregarAuditorias])
  useEffect(() => {
    carregarDetalhe().catch((e) => setErro(String(e)))
  }, [carregarDetalhe])

  if (!modelo) return <p className="hint">{L('Carregando…', 'Loading…')}</p>

  const versao: Versao | undefined = modelo.versoes.find((v) => v.id === versaoId)
  const publicada = detalhe?.estado === 'publicado'

  async function comErro(acao: () => Promise<unknown>) {
    setErro(null)
    setOcupado(true)
    try {
      await acao()
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : String(e))
    } finally {
      setOcupado(false)
    }
  }

  async function abrirAuditorias() {
    if (!versaoId) return
    await comErro(async () => {
      await api.versoes.auditar(versaoId)
      await carregarAuditorias()
    })
  }

  /** SP-303 · roda os critérios automatizáveis sobre o arquivo da versão. */
  async function rodarAutomacao() {
    if (!versaoId) return
    setExecucao(null)
    await comErro(async () => {
      const resultado = await api.automacao.rodarAgora(versaoId)
      setExecucao(resultado)
      await carregarAuditorias()
      await carregarDetalhe()
    })
  }

  async function enviarArquivo(arquivo: File) {
    if (!versaoId) return
    await comErro(async () => {
      await api.versoes.enviarArquivo(versaoId, arquivo)
      await carregarModelo()
    })
  }

  async function ciclar(resultado: Resultado) {
    if (publicada) return
    const proximo = CICLO[(CICLO.indexOf(resultado.status) + 1) % CICLO.length]!
    await comErro(async () => {
      await api.resultados.atualizar(resultado.id, { status: proximo })
      await carregarDetalhe()
    })
  }

  async function salvarComentario(resultado: Resultado, comentario: string) {
    await comErro(async () => {
      await api.resultados.atualizar(resultado.id, { comentario })
      await carregarDetalhe()
    })
  }

  async function enviarEvidencia(resultado: Resultado, arquivo: File) {
    await comErro(async () => {
      await api.resultados.enviarEvidencia(resultado.id, arquivo)
      await carregarDetalhe()
    })
  }

  async function publicarRound() {
    if (!detalhe) return
    await comErro(async () => {
      await api.auditorias.publicar(detalhe.id)
      await carregarDetalhe()
      await carregarAuditorias()
    })
  }

  async function gerarNc(resultado: Resultado) {
    if (!detalhe) return
    await comErro(async () => {
      await api.auditorias.criarNc(detalhe.id, {
        resultado_id: resultado.id,
        descricao: resultado.comentario ?? '',
      })
      await carregarDetalhe()
    })
  }

  async function baixarRelatorio() {
    if (!modeloId || !modelo) return
    await comErro(() =>
      api.baixarArquivo(api.modelos.relatorioPdf(modeloId, lang), `RNC_${modelo.codigo}.pdf`),
    )
  }

  // Agrupa por categoria, como o protótipo.
  const grupos = new Map<string, Resultado[]>()
  for (const r of detalhe?.resultados ?? []) {
    const chave = r.criterio.categoria ?? L('Sem categoria', 'Uncategorized')
    grupos.set(chave, [...(grupos.get(chave) ?? []), r])
  }

  return (
    <>
      <div className="crumb">
        <Link to={rotaProjeto(projetoId ?? '', 'modelos')}>
          {L('Modelos', 'Models')}
        </Link>{' '}
        ›{' '}
        <span>{modelo.codigo}</span>
      </div>

      <div className="dhead">
        <div>
          <div className="hcode">{modelo.codigo}</div>
          <div className="hmeta">
            <span>
              {L('Versão', 'Version')}: <b>{versao?.versao ?? '—'}</b>
            </span>
            <span>
              {L('Formato', 'Format')}: <b>{versao?.formato?.toUpperCase() ?? '—'}</b>
            </span>
            {detalhe?.round && (
              <span>
                {L('Round', 'Round')}: <b>{detalhe.round}</b>
              </span>
            )}
          </div>
        </div>
        <div className="rightinfo">
          <select
            className="f"
            style={{ width: 'auto', marginBottom: 6 }}
            value={versaoId ?? ''}
            onChange={(e) => setVersaoId(e.target.value)}
          >
            {modelo.versoes.map((v) => (
              <option key={v.id} value={v.id}>
                {v.versao} · {v.formato.toUpperCase()}
              </option>
            ))}
            {modelo.versoes.length === 0 && <option value="">{L('sem versão', 'no version')}</option>}
          </select>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <label className="btn sm" style={{ cursor: 'pointer' }}>
              {versao?.arquivo_url
                ? L('Trocar arquivo', 'Replace file')
                : L('Enviar arquivo', 'Upload file')}
              <input
                type="file"
                accept=".ifc,.rvt"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) enviarArquivo(f)
                }}
              />
            </label>
            <button
              className="btn sm"
              onClick={rodarAutomacao}
              disabled={ocupado || !versaoId}
              title={L(
                'Roda os critérios marcados como automáticos sobre o arquivo desta versão',
                'Runs the criteria marked as automatic against this version file',
              )}
            >
              {ocupado ? L('Analisando…', 'Analyzing…') : L('Auditoria automática', 'Auto audit')}
            </button>
            <button className="btn sm" onClick={baixarRelatorio} disabled={ocupado}>
              {L('Relatório (.pdf)', 'Report (.pdf)')}
            </button>
          </div>
        </div>
      </div>

      <Erro mensagem={erro} />

      {execucao && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ padding: '12px 16px' }}>
            <b>{L('Auditoria automática', 'Automatic audit')}</b>
            <div className="mmeta" style={{ marginTop: 4 }}>
              {execucao.resumo}
            </div>
            {execucao.sem_verificador > 0 && (
              <div className="mmeta">
                {L(
                  `${execucao.sem_verificador} critério(s) marcado(s) como automático ainda sem verificador — falta o parâmetro esperado na biblioteca.`,
                  `${execucao.sem_verificador} criteria marked automatic still lack a checker — the expected parameter is missing in the library.`,
                )}
              </div>
            )}
            {execucao.erros.length > 0 && (
              <ul style={{ margin: '8px 0 0 18px', fontSize: 12, color: 'var(--bad)' }}>
                {execucao.erros.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {auditorias.length === 0 ? (
        <div className="card">
          <div className="empty">
            <b>{L('Nenhuma auditoria aberta nesta versão', 'No audit open on this version')}</b>
            {L(
              'As abas vêm dos checklists declarados na disciplina do modelo.',
              'The tabs come from the checklists declared in the model discipline.',
            )}
            <div style={{ marginTop: 14 }}>
              <button className="btn pri" onClick={abrirAuditorias} disabled={!versaoId || ocupado}>
                {L('Abrir auditorias', 'Open audits')}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="tabs">
            {auditorias.map((a) => {
              const rotulo = ROTULO_CHECKLIST[a.checklist]
              return (
                <button
                  key={a.id}
                  className={`tab${abaId === a.id ? ' on' : ''}`}
                  onClick={() => setAbaId(a.id)}
                >
                  {rotulo ? L(rotulo[0], rotulo[1]) : a.checklist}
                  {a.area && ` · ${a.area}`}
                  <span className="n">
                    {a.aprovacao_pct === null ? '—' : `${Math.round(Number(a.aprovacao_pct))}%`}
                  </span>
                </button>
              )
            })}
          </div>

          {detalhe && (
            <>
              <div className="acoes" style={{ marginTop: 14 }}>
                <span className="hint" style={{ margin: 0 }}>
                  {detalhe.pendentes > 0
                    ? L(
                        `${detalhe.pendentes} item(ns) pendente(s)`,
                        `${detalhe.pendentes} pending item(s)`,
                      )
                    : L('Todos os itens verificados', 'All items checked')}
                </span>
                <div style={{ flex: 1 }} />
                {publicada ? (
                  <span className="pill ok">
                    {L('Round publicado', 'Round published')} · {detalhe.round}
                  </span>
                ) : (
                  <button
                    className="btn pri"
                    onClick={publicarRound}
                    disabled={ocupado || detalhe.pendentes > 0}
                    title={
                      detalhe.pendentes > 0
                        ? L(
                            'Conclua os itens pendentes antes de publicar',
                            'Finish pending items before publishing',
                          )
                        : undefined
                    }
                  >
                    {L('Publicar round', 'Publish round')}
                  </button>
                )}
              </div>

              <div className="card">
                {[...grupos.entries()].map(([categoria, itens]) => (
                  <div key={categoria}>
                    <div className="grp">{categoria}</div>
                    {itens.map((r) => (
                      <div className="item" key={r.id}>
                        <div className="irow">
                          <div className="txt" onClick={() => setAberto(aberto === r.id ? null : r.id)}>
                            <div className="nm">
                              {lang === 'pt' ? r.criterio.nome_pt : r.criterio.nome_en}
                            </div>
                            <div className="in">
                              {r.criterio.instrucao ?? r.criterio.codigo}
                              {r.ocorrencias.length > 0 &&
                                ` · ${r.ocorrencias.length} ${L('elemento(s)', 'element(s)')}`}
                            </div>
                          </div>
                          {r.origem === 'automatico' && <span className="auto a">Auto</span>}
                          <button
                            className={CLASSE_STATUS[r.status]}
                            onClick={() => ciclar(r)}
                            disabled={publicada || ocupado}
                          >
                            {
                              {
                                aprovado: L('Aprovado', 'Approved'),
                                reprovado: L('Reprovado', 'Rejected'),
                                pendente: L('Pendente', 'Pending'),
                                na: 'N/A',
                              }[r.status]
                            }
                          </button>
                        </div>

                        {aberto === r.id && (
                          <ItemExpandido
                            resultado={r}
                            publicada={publicada}
                            onComentario={(t) => salvarComentario(r, t)}
                            onEvidencia={(f) => enviarEvidencia(r, f)}
                            onGerarNc={() => gerarNc(r)}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              <div className="sectitle">
                {L('Não-conformidades', 'Non-conformities')}
                {ncs.length > 0 && <span className="badge">{ncs.length}</span>}
              </div>
              {ncs.length === 0 ? (
                <p className="hint">
                  {L(
                    'Nenhuma. Reprove um item e gere a NC a partir dele.',
                    'None. Reject an item and raise the NC from it.',
                  )}
                </p>
              ) : (
                ncs.map((nc, i) => (
                  <div className="nc" key={nc.id}>
                    <div className="ncname">
                      RNC-{String(i + 1).padStart(3, '0')} · {nc.descricao || '—'}
                    </div>
                    <div className="ncsub">
                      {nc.status}
                      {nc.elementos && ` · ${nc.elementos}`}
                      {nc.prazo && ` · ${L('prazo', 'due')} ${nc.prazo}`}
                    </div>
                    {nc.recomendacao && (
                      <p className="hint" style={{ margin: '8px 0 0' }}>
                        {nc.recomendacao}
                      </p>
                    )}
                  </div>
                ))
              )}
            </>
          )}
        </>
      )}
    </>
  )
}

function ItemExpandido({
  resultado,
  publicada,
  onComentario,
  onEvidencia,
  onGerarNc,
}: {
  resultado: Resultado
  publicada: boolean
  onComentario: (texto: string) => void
  onEvidencia: (arquivo: File) => void
  onGerarNc: () => void
}) {
  const { L } = useI18n()
  const [comentario, setComentario] = useState(resultado.comentario ?? '')

  return (
    <div className="expand">
      <div className="exlabel">{L('Comentário', 'Comment')}</div>
      <textarea
        className="f"
        rows={2}
        value={comentario}
        disabled={publicada}
        onChange={(e) => setComentario(e.target.value)}
        onBlur={() => comentario !== (resultado.comentario ?? '') && onComentario(comentario)}
      />

      {resultado.ocorrencias.length > 0 && (
        <>
          <div className="exlabel">{L('Elementos reprovados', 'Rejected elements')}</div>
          <div>
            {resultado.ocorrencias.map((o) => (
              <span className="ids" key={o.id} style={{ marginRight: 6 }}>
                {o.element_id}
              </span>
            ))}
          </div>
        </>
      )}

      <div className="exlabel">{L('Evidências', 'Evidence')}</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {resultado.evidencias.map((e) => (
          <span className="evchip" key={e.id}>
            {e.legenda ?? e.arquivo_url.split('/').pop()}
          </span>
        ))}
        {!publicada && (
          <label className="btn sm" style={{ cursor: 'pointer' }}>
            + {L('Anexar', 'Attach')}
            <input
              type="file"
              accept=".png,.jpg,.jpeg,.webp,.pdf"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) onEvidencia(f)
              }}
            />
          </label>
        )}
      </div>

      {!publicada && resultado.status === 'reprovado' && (
        <div className="eact">
          <button className="btn sm danger" onClick={onGerarNc}>
            {L('Gerar não-conformidade', 'Raise non-conformity')}
          </button>
        </div>
      )}
    </div>
  )
}
