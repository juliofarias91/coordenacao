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
import { useI18n } from '@/i18n'
import type { Matriz } from '@/lib/types'

/** Verde ≥90, âmbar ≥60, vermelho abaixo. Sai de token de tema, nunca de hex
 *  da API: o modo escuro tem passos próprios. */
export function corDoPercentual(pct: number | null): string {
  if (pct === null) return 'var(--na)'
  return pct >= 90 ? 'var(--ok)' : pct >= 60 ? 'var(--wait)' : 'var(--bad)'
}

export default function TabelaMatriz({
  matriz,
  vazioTitulo,
  vazioTexto,
}: {
  matriz: Matriz | null
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
                return (
                  <td key={area} className="cell">
                    <span
                      className="cellpct"
                      style={{
                        color: corDoPercentual(pct),
                        background: pct === null ? 'var(--na-bg)' : undefined,
                      }}
                    >
                      {pct === null ? '—' : `${Math.round(pct)}%`}
                    </span>
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
