/** A aba GENERAL AUDIT - CONTROL da planilha: um modelo por linha.
 *
 *  POR QUE ESTA TELA NÃO É A MATRIZ POR ÁREA. A matriz é modelo × área, e a
 *  auditoria geral não tem área: `abrir_auditoria` só recebe `area` nas
 *  auditorias de especificação (LOD 400/500). Uma auditoria com `area = NULL`
 *  nunca casa com nenhuma coluna da matriz — o resultado é uma grade de
 *  travessões, que foi exatamente o que `/auditoria/geral` mostrou até aqui.
 *  Ver `services/painel.py:279`, onde a célula é buscada por `(versao_id, area)`.
 *
 *  A pergunta desta tela é outra e mais simples: "em que pé está a geral de
 *  cada modelo, e onde eu clico para preencher?". Uma linha por modelo, o
 *  percentual do servidor, e o clique abre a planilha.
 */
import { Link } from 'react-router-dom'

import { corDoPercentual } from '@/components/Matriz'
import { Vazio } from '@/components/ui'
import { useI18n } from '@/i18n'
import type { AuditoriaEstado, LinhaPainel } from '@/lib/types'
import { rotaProjeto } from '@/projeto/ProjetoContext'

/** As MESMAS classes da barra de `pages/Painel.tsx` (`.appro/.track/.fill`) e a
 *  MESMA função de cor. Duas escalas de "verde acima de quanto?" na mesma
 *  plataforma seria pior do que nenhuma. */
const CLASSE_ESTADO: Record<AuditoriaEstado, string> = {
  publicado: 'pill ok',
  nao_publicado: 'pill',
  desatualizado: 'pill alerta',
}

const ROTULO_ESTADO: Record<AuditoriaEstado, [string, string]> = {
  publicado: ['Publicado', 'Published'],
  nao_publicado: ['Em andamento', 'In progress'],
  desatualizado: ['Desatualizado', 'Outdated'],
}

export default function ControleGeral({
  projetoId,
  linhas,
}: {
  projetoId: string
  linhas: LinhaPainel[]
}) {
  const { L } = useI18n()

  if (linhas.length === 0) {
    return (
      <Vazio
        titulo={L('Nenhum modelo neste projeto', 'No models in this project')}
        texto={L(
          'A planilha da auditoria geral nasce junto com a versão do modelo. Cadastre o primeiro modelo em Modelos › Novo modelo.',
          'The general audit sheet is created together with the model version. Register the first model under Models › New model.',
        )}
      />
    )
  }

  return (
    <div className="card" style={{ overflowX: 'auto' }}>
      <table>
        <thead>
          <tr>
            <th>{L('Modelo', 'Model')}</th>
            <th style={{ width: 120 }}>{L('Versão', 'Version')}</th>
            <th style={{ width: 80 }}>{L('Round', 'Round')}</th>
            <th style={{ width: 180 }}>{L('Aprovação', 'Approved')}</th>
            <th style={{ width: 140 }}>{L('Estado', 'State')}</th>
            <th style={{ width: 90 }}>{L('NCs', 'NCs')}</th>
            <th style={{ width: 120 }} />
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => {
            // A linha do painel já vem filtrada por `?checklist=geral`, então
            // `checklists` tem no máximo a geral. Se está vazia, a disciplina
            // não declara geral — e é isso que a linha precisa dizer.
            const geral = l.checklists[0]
            const pct = geral?.aprovacao_pct == null ? null : Math.round(Number(geral.aprovacao_pct))

            return (
              <tr key={l.modelo_id}>
                <td>
                  <div className="mcell">
                    {l.cor_macro && (
                      <span className="dot" style={{ background: l.cor_macro }} aria-hidden />
                    )}
                    <div>
                      <div className="nm">{l.codigo}</div>
                      {l.disciplina_codigo && <div className="in">{l.disciplina_codigo}</div>}
                    </div>
                  </div>
                </td>
                <td className="co">{l.versao ?? '—'}</td>
                <td className="co">{geral?.round ?? '—'}</td>
                <td>
                  <div className="appro">
                    <div className="track">
                      <div
                        className="fill"
                        style={{ width: `${pct ?? 0}%`, background: corDoPercentual(pct) }}
                      />
                    </div>
                    <span className="pctn" style={{ color: corDoPercentual(pct) }}>
                      {pct === null ? '—' : `${pct}%`}
                    </span>
                  </div>
                </td>
                <td>
                  {geral ? (
                    <span className={CLASSE_ESTADO[geral.estado]}>
                      {L(...ROTULO_ESTADO[geral.estado])}
                    </span>
                  ) : (
                    <span
                      className="co"
                      title={L(
                        'A disciplina deste modelo não declara a auditoria geral. Isso se define em Configuração › Disciplinas.',
                        'This model’s discipline does not declare the general audit. Set it under Settings › Disciplines.',
                      )}
                    >
                      {L('Não declarada', 'Not declared')}
                    </span>
                  )}
                </td>
                <td className="co">{l.ncs_abertas || '—'}</td>
                <td style={{ textAlign: 'right' }}>
                  {geral ? (
                    <Link
                      className="btn sm"
                      to={rotaProjeto(projetoId, `auditoria/geral/${l.modelo_id}`)}
                    >
                      {L('Abrir planilha', 'Open sheet')}
                    </Link>
                  ) : (
                    <Link className="btn sm" to={rotaProjeto(projetoId, `modelos/${l.modelo_id}`)}>
                      {L('Ver o modelo', 'Open model')}
                    </Link>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
