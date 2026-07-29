/** KPIs de TODOS os projetos — a visão da organização.
 *
 *  Não confundir com `/projetos/:id/kpis`, que é o do projeto e traz os
 *  gráficos de evolução, macrodisciplina e critérios mais reprovados. Aqui a
 *  pergunta é outra: como está a carteira inteira, e qual projeto puxa a média
 *  para baixo. É a tela que respondia à contagem que ficava na home.
 *
 *  A HOME PERDEU OS NÚMEROS por causa disto. Ela lista projetos por cliente, e
 *  era a única tela que fazia as duas coisas — uma fileira de KPIs e uma
 *  navegação por pastas. Separá-las deixa cada uma responder uma pergunta só.
 *
 *  AGREGA NO NAVEGADOR, uma requisição por projeto. Não existe endpoint de KPI
 *  consolidado, e inventá-lo agora seria backend novo para uma conta que o
 *  cliente faz em memória. O custo é N requisições paralelas — com dezenas de
 *  projetos isso deixa de se pagar, e aí o certo é um `GET /kpis` no servidor.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { Cabecalho, Erro, Vazio } from '@/components/ui'
import { useI18n } from '@/i18n'
import { ApiError, api } from '@/lib/api'
import type { KPIs, Projeto } from '@/lib/types'
import { rotaProjeto, useProjeto } from '@/projeto/ProjetoContext'

/** Verde ≥90, âmbar ≥60, vermelho abaixo — a mesma régua da matriz. */
function corDoPercentual(pct: number | null): string {
  if (pct === null) return 'var(--na)'
  return pct >= 90 ? 'var(--ok)' : pct >= 60 ? 'var(--wait)' : 'var(--bad)'
}

function num(v: string | null): number | null {
  if (v === null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** KPI: o tom vai no MARCADOR e o número fica em `--ink`. Uma fileira de
 *  números coloridos vira semáforo e perde-se qual valor é grande. */
function Numero({ rotulo, valor, chave }: { rotulo: string; valor: string; chave: string }) {
  return (
    <div className={`kpi k-${chave}`}>
      <span className="kpi-rot">{rotulo}</span>
      <span className="kpi-num">{valor}</span>
    </div>
  )
}

type Linha = { projeto: Projeto; kpis: KPIs | null }

export default function KpisGerais() {
  const { L } = useI18n()
  const { projetos, carregando } = useProjeto()

  const [linhas, setLinhas] = useState<Linha[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [buscando, setBuscando] = useState(true)

  const carregar = useCallback(async () => {
    if (projetos.length === 0) {
      setLinhas([])
      setBuscando(false)
      return
    }
    setErro(null)
    setBuscando(true)
    try {
      const resultados = await Promise.all(
        projetos.map(async (p) => {
          try {
            return { projeto: p, kpis: await api.kpis(p.id) }
          } catch {
            // Um projeto que falha não pode zerar a tela inteira: ele aparece
            // com "—" e os outros continuam somando.
            return { projeto: p, kpis: null }
          }
        }),
      )
      setLinhas(resultados)
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : String(e))
    } finally {
      setBuscando(false)
    }
  }, [projetos])

  useEffect(() => {
    carregar()
  }, [carregar])

  const total = useMemo(() => {
    const comKpi = linhas.filter((l) => l.kpis)
    const soma = (f: (k: KPIs) => number) =>
      comKpi.reduce((acc, l) => acc + (l.kpis ? f(l.kpis) : 0), 0)

    // Média ponderada seria mais correta, mas exigiria o número de itens
    // avaliados por projeto, que o endpoint não devolve. A média simples das
    // médias é o que dá para sustentar com o dado que existe — e está dito na
    // tela, para ninguém a ler como algo que ela não é.
    const medias = comKpi.map((l) => num(l.kpis!.aprovacao_media)).filter((n) => n !== null)

    return {
      projetos: linhas.length,
      modelos: soma((k) => k.modelos),
      versoes: soma((k) => k.versoes),
      publicadas: soma((k) => k.auditorias_publicadas),
      ncsAbertas: soma((k) => k.ncs_abertas),
      ncsResolvidas: soma((k) => k.ncs_resolvidas),
      aprovacao: medias.length ? medias.reduce((a, b) => a + b, 0) / medias.length : null,
    }
  }, [linhas])

  if (carregando || buscando) return <p className="hint">{L('Carregando…', 'Loading…')}</p>

  return (
    <>
      <Cabecalho
        titulo={L('KPIs', 'KPIs')}
        sub={L(
          'A carteira inteira num lugar só: quanto foi entregue, quanto foi auditado e onde estão as não-conformidades abertas. Para os gráficos de evolução de um projeto, abra o projeto e vá em KPIs.',
          'The whole portfolio in one place: how much was delivered, how much was audited, and where the open non-conformities are. For one project’s trend charts, open the project and go to KPIs.',
        )}
      />

      <Erro mensagem={erro} />

      {linhas.length === 0 ? (
        <Vazio
          titulo={L('Nenhum projeto', 'No project')}
          texto={L(
            'Não há projetos para somar. Crie o primeiro no Painel administrativo › Projetos.',
            'There are no projects to add up. Create the first one under Admin panel › Projects.',
          )}
        />
      ) : (
        <>
          <div className="kpi-fila">
            <Numero
              chave="ativo"
              rotulo={L('Projetos', 'Projects')}
              valor={String(total.projetos)}
            />
            <Numero chave="config" rotulo={L('Modelos', 'Models')} valor={String(total.modelos)} />
            <Numero
              chave="piloto"
              rotulo={L('Auditorias publicadas', 'Published audits')}
              valor={String(total.publicadas)}
            />
            <Numero
              chave="clientes"
              rotulo={L('Aprovação média', 'Average approval')}
              valor={total.aprovacao === null ? '—' : `${Math.round(total.aprovacao)}%`}
            />
          </div>

          <div className="card">
            <table>
              <thead>
                <tr>
                  <th>{L('Projeto', 'Project')}</th>
                  <th style={{ textAlign: 'right' }}>{L('Modelos', 'Models')}</th>
                  <th style={{ textAlign: 'right' }}>{L('Versões', 'Versions')}</th>
                  <th style={{ textAlign: 'right' }}>{L('Publicadas', 'Published')}</th>
                  <th style={{ textAlign: 'right' }}>{L('NCs abertas', 'Open NCRs')}</th>
                  <th style={{ textAlign: 'right' }}>{L('Aprovação', 'Approval')}</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map(({ projeto, kpis }) => {
                  const pct = kpis ? num(kpis.aprovacao_media) : null
                  return (
                    <tr key={projeto.id}>
                      <td>
                        {/* Linha que leva ao KPI DAQUELE projeto: quem vê um
                            número ruim na carteira quer olhar de perto, e o
                            caminho tem de sair daqui. */}
                        <Link className="code" to={rotaProjeto(projeto.id, 'kpis')}>
                          {projeto.codigo}
                        </Link>
                        <div className="mmeta">{projeto.cliente_nome ?? projeto.nome}</div>
                      </td>
                      <td className="co" style={{ textAlign: 'right' }}>
                        {kpis?.modelos ?? '—'}
                      </td>
                      <td className="co" style={{ textAlign: 'right' }}>
                        {kpis?.versoes ?? '—'}
                      </td>
                      <td className="co" style={{ textAlign: 'right' }}>
                        {kpis?.auditorias_publicadas ?? '—'}
                      </td>
                      <td className="co" style={{ textAlign: 'right' }}>
                        {kpis?.ncs_abertas ?? '—'}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <b style={{ color: corDoPercentual(pct) }}>
                          {pct === null ? '—' : `${Math.round(pct)}%`}
                        </b>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <p className="hint">
            {L(
              `Não-conformidades: ${total.ncsAbertas} abertas, ${total.ncsResolvidas} resolvidas. A aprovação média é a média simples das médias dos projetos — não é ponderada pelo tamanho de cada um, porque o número de itens avaliados não vem no endpoint.`,
              `Non-conformities: ${total.ncsAbertas} open, ${total.ncsResolvidas} resolved. Average approval is the plain mean of each project’s average — it is not weighted by project size, because the endpoint does not return the item count.`,
            )}
          </p>
        </>
      )}
    </>
  )
}
