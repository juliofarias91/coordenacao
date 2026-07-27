/** SP-107 · Padrão de cores por macrodisciplina.
 *
 *  A cor vem do backend junto com a disciplina (`cor_macro`), justamente para
 *  lista, matriz e gráficos nunca divergirem entre si.
 */
import { useI18n } from '@/i18n'
import type { MacroDisc } from '@/lib/types'

const CORES: Array<[MacroDisc, string, string]> = [
  ['A', '#2547B0', 'ARCH'],
  ['C', '#A85B12', 'CIVIL / ESTRUTURA'],
  ['M', '#0E7C6B', 'MEP'],
  ['S', '#6A3DAE', 'SITE'],
]

export default function AbaCores() {
  const { L } = useI18n()
  return (
    <>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th style={{ width: 60 }}>{L('Cor', 'Color')}</th>
              <th style={{ width: 80 }}>{L('Sigla', 'Code')}</th>
              <th>{L('Macrodisciplina', 'Macro-discipline')}</th>
              <th>{L('Valor', 'Value')}</th>
            </tr>
          </thead>
          <tbody>
            {CORES.map(([sigla, cor, nome]) => (
              <tr key={sigla}>
                <td>
                  <span className="swatch" style={{ background: cor, display: 'block' }} />
                </td>
                <td>
                  <span className="code">{sigla}</span>
                </td>
                <td className="co">{nome}</td>
                <td>
                  <span className="code">{cor}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="hint">
        {L(
          'Estas cores identificam a macrodisciplina em listas, na matriz de disciplina × área e nos gráficos de KPI. A edição por projeto entra junto com o painel de controle (Fase 2), quando há onde aplicá-las.',
          'These colors identify the macro-discipline in lists, in the discipline × area matrix and in the KPI charts. Per-project editing lands with the control panel (phase 2), when there is somewhere to apply them.',
        )}
      </p>
    </>
  )
}
