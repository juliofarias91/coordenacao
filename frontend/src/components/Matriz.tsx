/** A matriz modelo × área — o pivô que substitui a planilha de controle.
 *
 *  Vivia dentro do `Painel`, como um dos dois modos daquela tela. Saiu para cá
 *  em 29/07/2026 porque deixou de ter um dono só: a sidebar passou a ter uma
 *  entrada por checklist (Auditoria geral, 4D, LOD400, LOD500…), e todas são
 *  esta mesma tabela com outro `checklist` — o backend já servia assim
 *  (`GET /projetos/{id}/matriz?checklist=…`).
 *
 *  Duplicá-la seria garantir que a regra de cor divergisse entre as telas na
 *  primeira vez que alguém mexesse numa delas.
 */
import { Link } from 'react-router-dom'

import { useI18n } from '@/i18n'
import type { Matriz } from '@/lib/types'
import { rotaProjeto } from '@/projeto/ProjetoContext'

/** Verde ≥90, âmbar ≥60, vermelho abaixo. Sai de token de tema, nunca de hex
 *  da API: o modo escuro tem passos próprios. */
export function corDoPercentual(pct: number | null): string {
  if (pct === null) return 'var(--na)'
  return pct >= 90 ? 'var(--ok)' : pct >= 60 ? 'var(--wait)' : 'var(--bad)'
}

export default function TabelaMatriz({
  matriz,
  projetoId,
  vazioTitulo,
  vazioTexto,
}: {
  matriz: Matriz | null
  /** Sem ele a célula não vira link — é o caso do painel, que já está dentro
   *  da lista de modelos e não tem para onde levar. */
  projetoId?: string
  vazioTitulo?: string
  vazioTexto?: string
}) {
  const { L } = useI18n()

  return (
    <div className="card" style={{ overflowX: 'auto' }}>
      <table className="mx">
        <thead>
          <tr>
            <th>{L('Modelo', 'Model')}</th>
            {matriz?.areas.map((a) => (
              <th key={a} style={{ textAlign: 'center' }}>
                {a}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matriz?.linhas.map((linha) => (
            <tr key={linha.modelo_id}>
              <td>
                <div className="mcell">
                  <span
                    className="macro"
                    style={{ background: linha.cor_macro ?? 'var(--na)' }}
                  />
                  <div>
                    <div className="code">{linha.codigo}</div>
                    <div className="mmeta">
                      {linha.disciplina_codigo} · {linha.versao ?? '—'}
                    </div>
                  </div>
                </div>
              </td>
              {matriz.areas.map((area) => {
                const celula = linha.celulas[area]
                // Área fora do escopo da disciplina: N/A, e não 0%. Zero por
                // cento diria "foi auditado e reprovou".
                if (!celula) {
                  return (
                    <td key={area} className="cell">
                      <span className="cellpct" style={{ color: 'var(--na)' }}>
                        N/A
                      </span>
                    </td>
                  )
                }
                const pct = celula.aprovacao_pct
                const numero = (
                  <span
                    className="cellpct"
                    style={{
                      color: corDoPercentual(pct),
                      background: pct === null ? 'var(--na-bg)' : undefined,
                    }}
                  >
                    {pct === null ? '—' : `${Math.round(pct)}%`}
                  </span>
                )
                // A CÉLULA LEVA AO MODELO. Ela sempre teve `auditoria_id` na
                // resposta da API e não fazia nada com ele: quem via 47% na
                // matriz tinha de achar o modelo na lista para descobrir POR
                // QUE. Sem projeto na mão o número fica sem link, em vez de um
                // caminho quebrado.
                return (
                  <td key={area} className="cell">
                    {projetoId ? (
                      <Link
                        to={rotaProjeto(projetoId, `modelos/${linha.modelo_id}`)}
                        title={L(
                          `Abrir ${linha.codigo} — área ${area}`,
                          `Open ${linha.codigo} — area ${area}`,
                        )}
                      >
                        {numero}
                      </Link>
                    ) : (
                      numero
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
          {matriz?.linhas.length === 0 && (
            <tr>
              <td colSpan={(matriz?.areas.length ?? 0) + 1} className="empty">
                <b>{vazioTitulo ?? L('Sem auditoria', 'No audit')}</b>
                {vazioTexto ??
                  L(
                    'A matriz mostra as disciplinas que declaram este checklist e as áreas do seu escopo.',
                    'The matrix shows disciplines declaring this checklist and their scoped areas.',
                  )}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
