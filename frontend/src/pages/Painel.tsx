/** SP-206 · Modelos — a lista de modelos do projeto e como cada um está.
 *
 *  Chamava-se "Painel de controle" até 29/07/2026, herança do nome da planilha
 *  que ela substitui. O que a tela mostra são modelos: um por linha, com versão,
 *  round, aprovação e estado. Nome de tela deve dizer o que a tela mostra — e a
 *  rota foi junto (`/projetos/<id>/modelos`), com o detalhe de um modelo logo
 *  abaixo dela.
 *
 *  Cada número aqui sai de uma consulta às auditorias. Não existe onde
 *  digitá-los — é exatamente isso que substitui a planilha de controle.
 */
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useAuth } from '@/auth/AuthContext'
import TabelaMatriz, { corDoPercentual } from '@/components/Matriz'
import { Cabecalho, Erro, Segmented, Vazio } from '@/components/ui'
import { useI18n } from '@/i18n'
import { ApiError, api } from '@/lib/api'
import type { AuditoriaEstado, LinhaPainel, Matriz, Painel as PainelDados } from '@/lib/types'
import NovoModelo from '@/pages/NovoModelo'
import { rotaProjeto, useProjeto } from '@/projeto/ProjetoContext'

const ROTULO_ESTADO: Record<AuditoriaEstado, [string, string]> = {
  publicado: ['Publicado', 'Published'],
  nao_publicado: ['Não publicado', 'Not published'],
  desatualizado: ['Desatualizado', 'Out of date'],
}

const CLASSE_ESTADO: Record<AuditoriaEstado, string> = {
  publicado: 'pill ok',
  nao_publicado: 'pill',
  desatualizado: 'pill alerta',
}

function Barra({ pct }: { pct: number | null }) {
  return (
    <div className="appro">
      <div className="track">
        <div
          className="fill"
          style={{ width: `${pct ?? 0}%`, background: corDoPercentual(pct) }}
        />
      </div>
      <span className="pctn" style={{ color: corDoPercentual(pct) }}>
        {pct === null ? '—' : `${Math.round(pct)}%`}
      </span>
    </div>
  )
}

export default function Painel() {
  const { projeto, carregando } = useProjeto()
  const { usuario } = useAuth()
  const { L } = useI18n()
  const podeCriar = !!usuario?.permissoes.includes('admin_cadastro')
  const navegar = useNavigate()
  const [modo, setModo] = useState<'lista' | 'matriz'>('lista')
  const [dados, setDados] = useState<PainelDados | null>(null)
  const [matriz, setMatriz] = useState<Matriz | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [criando, setCriando] = useState(false)

  const carregar = useCallback(async () => {
    if (!projeto) return
    setErro(null)
    try {
      if (modo === 'lista') setDados(await api.painel(projeto.id))
      else setMatriz(await api.matriz(projeto.id, 'lod500'))
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : String(e))
    }
  }, [projeto, modo])

  useEffect(() => {
    carregar()
  }, [carregar])

  if (carregando) return <p className="hint">{L('Carregando…', 'Loading…')}</p>
  if (!projeto) {
    return (
      <>
        <Cabecalho titulo={L('Modelos', 'Models')} />
        <Vazio
          titulo={L('Nenhum projeto', 'No project')}
          texto={L('Cadastre um projeto primeiro.', 'Register a project first.')}
        />
      </>
    )
  }

  async function baixarControle() {
    if (!projeto) return
    try {
      await api.baixarArquivo(api.controleXlsx(projeto.id), `Controle_${projeto.codigo}.xlsx`)
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : String(e))
    }
  }

  return (
    <>
      <Cabecalho
        titulo={L('Modelos', 'Models')}
        sub={L(
          'Os modelos entregues neste projeto e como cada um está: versão, round, aprovação e estado. Tudo gerado a partir das auditorias — não há onde digitar estes números.',
          'The models delivered on this project and where each one stands: version, round, approval and state. All generated from the audits — there is nowhere to type these numbers.',
        )}
      />

      {dados && modo === 'lista' && (
        <div className="metrics">
          <div className="metric">
            <div className="lb">{L('Modelos', 'Models')}</div>
            <div className="vl">{dados.resumo.total_modelos}</div>
          </div>
          <div className="metric">
            <div className="lb">{L('Rounds publicados', 'Published rounds')}</div>
            <div className="vl">
              {dados.resumo.publicados}
              {dados.resumo.desatualizados > 0 && (
                <small>
                  {' '}
                  · {dados.resumo.desatualizados} {L('desatualizado(s)', 'out of date')}
                </small>
              )}
            </div>
          </div>
          <div className="metric">
            <div className="lb">{L('Aprovação média', 'Average approval')}</div>
            <div className="vl" style={{ color: corDoPercentual(dados.resumo.aprovacao_media) }}>
              {dados.resumo.aprovacao_media === null
                ? '—'
                : `${Math.round(dados.resumo.aprovacao_media)}%`}
            </div>
          </div>
          <div className="metric">
            <div className="lb">{L('NCs abertas', 'Open NCs')}</div>
            <div className="vl" style={{ color: dados.resumo.ncs_abertas ? 'var(--bad)' : undefined }}>
              {dados.resumo.ncs_abertas}
            </div>
          </div>
        </div>
      )}

      <div className="acoes">
        <Segmented
          itens={[
            ['lista', L('Lista', 'List')],
            ['matriz', L('Matriz por área', 'Matrix by area')],
          ]}
          valor={modo}
          onChange={setModo}
        />
        <div style={{ flex: 1 }} />
        <button className="btn" onClick={baixarControle}>
          {L('Exportar controle (.xlsx)', 'Export control (.xlsx)')}
        </button>
        {/* Some para quem não administra cadastros: `POST /modelos` exige
            `admin_cadastro`, e um botão que só devolve 403 é pior do que botão
            nenhum. A guarda de verdade continua no backend — isto é
            conveniência de navegação. Note que a criação usa DUAS permissões:
            `admin_cadastro` para o modelo e `executar` para a versão. */}
        {podeCriar && (
          <button className="btn pri" onClick={() => setCriando(true)}>
            + {L('Novo modelo', 'New model')}
          </button>
        )}
      </div>

      {criando && (
        <NovoModelo
          projetoId={projeto.id}
          projetoCodigo={projeto.codigo}
          onCancelar={() => setCriando(false)}
          onCriado={() => {
            setCriando(false)
            // Recarrega a lista: o modelo novo tem de aparecer sem F5, senão
            // quem cadastra dez seguidos não sabe se o anterior entrou.
            carregar()
          }}
        />
      )}

      <Erro mensagem={erro} />

      {modo === 'lista' ? (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>{L('Modelo', 'Model')}</th>
                <th>{L('Projetista', 'Designer')}</th>
                <th style={{ textAlign: 'center' }}>{L('Versão', 'Version')}</th>
                <th style={{ textAlign: 'center' }}>{L('Round', 'Round')}</th>
                <th>{L('Aprovação', 'Approval')}</th>
                <th style={{ textAlign: 'right' }}>{L('Estado', 'State')}</th>
              </tr>
            </thead>
            <tbody>
              {dados?.linhas.map((l: LinhaPainel) => (
                <tr
                  key={l.modelo_id}
                  className="clk"
                  onClick={() => navegar(rotaProjeto(projeto.id, `modelos/${l.modelo_id}`))}
                >
                  <td>
                    <div className="mcell">
                      <span
                        className="macro"
                        style={{ background: l.cor_macro ?? 'var(--na)' }}
                      />
                      <div>
                        <div className="code">{l.codigo}</div>
                        <div className="mmeta">
                          {l.disciplina_codigo ?? L('sem disciplina', 'no discipline')}
                          {/* Um modelo tem vários checklists; a linha consolida,
                              e aqui se vê de onde o número veio. */}
                          {l.checklists.length > 0 && (
                            <span>
                              {' · '}
                              {l.checklists
                                .map(
                                  (c) =>
                                    `${c.checklist}${
                                      c.aprovacao_pct === null
                                        ? ''
                                        : ` ${Math.round(Number(c.aprovacao_pct))}%`
                                    }`,
                                )
                                .join(' · ')}
                            </span>
                          )}
                          {l.ncs_abertas > 0 && (
                            <span style={{ color: 'var(--bad)' }}>
                              {' '}
                              · {l.ncs_abertas} {L('NC(s)', 'NC(s)')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="co">{l.instaladora ?? '—'}</td>
                  <td className="ver">{l.versao ?? '—'}</td>
                  <td className="ver">{l.round ?? '—'}</td>
                  <td>
                    <Barra pct={l.aprovacao_pct === null ? null : Number(l.aprovacao_pct)} />
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <span className={CLASSE_ESTADO[l.estado ?? 'nao_publicado']}>
                      {L(...ROTULO_ESTADO[l.estado ?? 'nao_publicado'])}
                    </span>
                  </td>
                </tr>
              ))}
              {dados?.linhas.length === 0 && (
                <tr>
                  <td colSpan={6} className="empty">
                    <b>{L('Nenhum modelo cadastrado', 'No models yet')}</b>
                    {L(
                      'Cadastre modelos e suas versões para começar a auditar.',
                      'Register models and versions to start auditing.',
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        // A mesma tabela das telas de Auditoria, e não uma cópia: a regra de
        // cor divergiria na primeira vez que alguém mexesse numa delas.
        <TabelaMatriz
          matriz={matriz}
          vazioTitulo={L('Sem auditoria de especificação', 'No specification audit')}
          vazioTexto={L(
            'A matriz mostra as disciplinas que declaram o checklist LOD 500 e as áreas do seu escopo.',
            'The matrix shows disciplines declaring the LOD 500 checklist and their scoped areas.',
          )}
        />
      )}
    </>
  )
}
