/** SP-405 · Portal do cliente — rota pública, fora do shell autenticado.
 *
 *  O token na URL é a única credencial. Esta tela não conhece nenhum endpoint
 *  interno: tudo que ela mostra vem de `GET /portal/{token}`, que já devolve
 *  apenas o que o convite liberou.
 */
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

import { BarrasHorizontais } from '@/components/graficos'
import { useI18n } from '@/i18n'
import { ApiError, api } from '@/lib/api'
import type { Fatia } from '@/lib/types'

type Resposta = {
  projeto: { codigo: string; nome: string; cliente: string | null; bep_ref: string | null }
  secoes: Record<string, boolean>
  colunas: Record<string, boolean>
  painel: Record<string, unknown>[] | null
  matriz: { areas: string[]; linhas: Record<string, unknown>[] } | null
  avanco: {
    modelos: number
    auditorias_publicadas: number
    aprovacao_media: number | null
    por_macro: Fatia[]
  } | null
  relatorio: { ncs_abertas: number; modelos: { codigo: string; ncs_abertas: number }[] } | null
}

const ROTULO_COLUNA: Record<string, [string, string]> = {
  codigo: ['Modelo', 'Model'],
  disciplina: ['Disciplina', 'Discipline'],
  projetista: ['Projetista', 'Designer'],
  versao: ['Versão', 'Version'],
  aprovacao_pct: ['Aprovação', 'Approval'],
  estado: ['Situação', 'Status'],
}

const ROTULO_ESTADO: Record<string, [string, string]> = {
  publicado: ['Publicado', 'Published'],
  nao_publicado: ['Não publicado', 'Not published'],
  desatualizado: ['Desatualizado', 'Out of date'],
}

export default function Portal() {
  const { token } = useParams<{ token: string }>()
  const { lang, setLang, L } = useI18n()
  const [dados, setDados] = useState<Resposta | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    api
      .portal(token)
      .then((r) => setDados(r as unknown as Resposta))
      .catch((e) => setErro(e instanceof ApiError ? e.message : String(e)))
  }, [token])

  if (erro) {
    return (
      <div className="telacheia">
        <div className="avisocard">
          <div className="marcatxt">SPBIM</div>
          <div className="avisotitulo">{L('Link indisponível', 'Link unavailable')}</div>
          <p className="avisosub">
            {L(
              'Este convite não é mais válido. Peça um novo link à coordenação.',
              'This invite is no longer valid. Ask coordination for a new link.',
            )}
          </p>
        </div>
      </div>
    )
  }

  if (!dados) return <div className="telacheia"><div className="hint">{L('Carregando…', 'Loading…')}</div></div>

  // Colunas na ordem canônica, mantendo só as que vieram na resposta.
  const colunas = Object.keys(ROTULO_COLUNA).filter((c) =>
    dados.painel?.some((linha) => c in linha),
  )

  return (
    <div className="portal">
      <header className="portalcab">
        <div>
          <div className="marcatxt" style={{ fontSize: 16 }}>
            SPBIM
          </div>
          <h1>
            {dados.projeto.codigo} — {dados.projeto.nome}
          </h1>
          <p className="sub">
            {dados.projeto.cliente}
            {dados.projeto.bep_ref && ` · ${dados.projeto.bep_ref}`}
          </p>
        </div>
        <div className="switch">
          {(['pt', 'en'] as const).map((l) => (
            <button key={l} className={lang === l ? 'on' : ''} onClick={() => setLang(l)}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </header>

      <main className="portalcorpo">
        {dados.avanco && (
          <>
            <div className="metrics">
              <div className="metric">
                <div className="lb">{L('Modelos', 'Models')}</div>
                <div className="vl">{dados.avanco.modelos}</div>
              </div>
              <div className="metric">
                <div className="lb">{L('Rounds publicados', 'Published rounds')}</div>
                <div className="vl">{dados.avanco.auditorias_publicadas}</div>
              </div>
              <div className="metric">
                <div className="lb">{L('Aprovação média', 'Average approval')}</div>
                <div className="vl">
                  {dados.avanco.aprovacao_media === null
                    ? '—'
                    : `${Math.round(dados.avanco.aprovacao_media)}%`}
                </div>
              </div>
              <div className="metric">
                <div className="lb">{L('NCs abertas', 'Open NCs')}</div>
                <div className="vl">{dados.relatorio?.ncs_abertas ?? '—'}</div>
              </div>
            </div>

            {dados.avanco.por_macro.length > 0 && (
              <div className="graficos" style={{ gridTemplateColumns: '1fr' }}>
                <BarrasHorizontais
                  titulo={L('Aprovação por macrodisciplina', 'Approval by macro-discipline')}
                  fatias={dados.avanco.por_macro}
                  sufixo="%"
                />
              </div>
            )}
          </>
        )}

        {dados.painel && (
          <>
            <div className="sectitle">{L('Modelos', 'Models')}</div>
            <div className="card">
              <table>
                <thead>
                  <tr>
                    {colunas.map((c) => (
                      <th key={c} className={c === 'aprovacao_pct' ? 'num' : undefined}>
                        {L(...ROTULO_COLUNA[c]!)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dados.painel.map((linha, i) => (
                    <tr key={i}>
                      {colunas.map((c) => {
                        const valor = linha[c]
                        if (c === 'codigo') {
                          return (
                            <td key={c}>
                              <div className="mcell">
                                <span
                                  className="macro"
                                  style={{ background: (linha.cor_macro as string) ?? 'var(--na)' }}
                                />
                                <span className="code">{String(valor ?? '—')}</span>
                              </div>
                            </td>
                          )
                        }
                        if (c === 'aprovacao_pct') {
                          return (
                            <td key={c} className="num">
                              {valor === null || valor === undefined
                                ? '—'
                                : `${Math.round(Number(valor))}%`}
                            </td>
                          )
                        }
                        if (c === 'estado') {
                          const rot = ROTULO_ESTADO[String(valor)]
                          return (
                            <td key={c}>
                              <span className={valor === 'publicado' ? 'pill ok' : 'pill'}>
                                {rot ? L(...rot) : String(valor ?? '—')}
                              </span>
                            </td>
                          )
                        }
                        return (
                          <td key={c} className="co">
                            {String(valor ?? '—')}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {dados.matriz && dados.matriz.linhas.length > 0 && (
          <>
            <div className="sectitle">{L('Matriz por área', 'Matrix by area')}</div>
            <div className="card" style={{ overflowX: 'auto' }}>
              <table className="mx">
                <thead>
                  <tr>
                    <th>{L('Modelo', 'Model')}</th>
                    {dados.matriz.areas.map((a) => (
                      <th key={a} style={{ textAlign: 'center' }}>
                        {a}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dados.matriz.linhas.map((linha, i) => (
                    <tr key={i}>
                      <td className="code">{String(linha.codigo)}</td>
                      {dados.matriz!.areas.map((area) => {
                        const celula = (linha.celulas as Record<string, { aprovacao_pct: number | null } | null>)[area]
                        return (
                          <td key={area} className="cell">
                            <span className="cellpct">
                              {!celula
                                ? 'N/A'
                                : celula.aprovacao_pct === null
                                  ? '—'
                                  : `${Math.round(celula.aprovacao_pct)}%`}
                            </span>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <p className="hint" style={{ marginTop: 26 }}>
          {L(
            'Visão somente leitura, gerada a partir das auditorias da coordenação SPBIM.',
            'Read-only view, generated from the SPBIM coordination audits.',
          )}
        </p>
      </main>
    </div>
  )
}
