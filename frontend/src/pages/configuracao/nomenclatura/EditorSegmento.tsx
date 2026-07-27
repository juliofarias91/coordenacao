/** Editor de um bloco do padrão.
 *
 *  A peça-chave é o **separador antes**: cada bloco carrega o separador que o
 *  liga ao anterior. É isso que expressa nomes de separador misturado, como
 *  `Spec Audit LOD400-COL1_PLMB-PLMB-DATA.pdf`, que um delimitador único não
 *  consegue descrever.
 */
import { Campo } from '@/components/ui'
import { useI18n } from '@/i18n'
import {
  changeSegmentType,
  DATE_FORMATS,
  SEGMENT_TYPES,
  SEPARATORS,
  type SegmentoPadrao,
  type TipoSegmento,
} from '@/lib/auditer/patterns'

/** Campos específicos de cada tipo. */
function CamposDoTipo({
  segmento,
  onChange,
}: {
  segmento: SegmentoPadrao
  onChange: (s: SegmentoPadrao) => void
}) {
  const { L } = useI18n()
  const set = (patch: Partial<SegmentoPadrao>) => onChange({ ...segmento, ...patch })

  switch (segmento.type) {
    case 'literal':
      return (
        <div className="frow">
          <Campo rotulo={L('Texto exigido', 'Required text')} largo>
            <input
              className="f"
              placeholder="Spec Audit LOD"
              value={segmento.value ?? ''}
              onChange={(e) => set({ value: e.target.value })}
            />
            <p className="hint">
              {L(
                'Pode conter espaços. É o texto fixo que aparece igual em todo nome.',
                'May contain spaces. It is the fixed text that appears the same in every name.',
              )}
            </p>
          </Campo>
          <Campo rotulo={L('Diferenciar maiúsculas', 'Case sensitive')}>
            <input
              type="checkbox"
              checked={!!segmento.caseSensitive}
              onChange={(e) => set({ caseSensitive: e.target.checked })}
            />
          </Campo>
        </div>
      )

    case 'list':
      return (
        <div className="frow">
          <Campo rotulo={L('Valores aceitos', 'Accepted values')} largo>
            <input
              className="f"
              placeholder="ADMN, COL1, COL2, COL3, SITE, UTLS"
              value={(segmento.values ?? []).join(', ')}
              onChange={(e) => set({ values: e.target.value.split(',').map((v) => v.trim()) })}
            />
            <p className="hint">{L('Separe por vírgula.', 'Comma separated.')}</p>
          </Campo>
          <Campo rotulo={L('Diferenciar maiúsculas', 'Case sensitive')}>
            <input
              type="checkbox"
              checked={!!segmento.caseSensitive}
              onChange={(e) => set({ caseSensitive: e.target.checked })}
            />
          </Campo>
        </div>
      )

    case 'date':
      return (
        <div className="frow">
          <Campo rotulo={L('Formato', 'Format')}>
            <select
              className="f"
              value={segmento.format}
              onChange={(e) => set({ format: e.target.value })}
            >
              {DATE_FORMATS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </Campo>
        </div>
      )

    case 'number':
      return (
        <div className="frow">
          <Campo rotulo={L('Quantidade exata de dígitos', 'Exact digit count')}>
            <input
              type="checkbox"
              checked={!!segmento.exactDigits}
              onChange={(e) => set({ exactDigits: e.target.checked })}
            />
          </Campo>
          {segmento.exactDigits && (
            <Campo rotulo={L('Dígitos', 'Digits')}>
              <input
                className="f"
                type="number"
                min={1}
                max={12}
                value={segmento.digits}
                onChange={(e) => set({ digits: Number(e.target.value) })}
              />
            </Campo>
          )}
        </div>
      )

    case 'text':
      return (
        <div className="frow">
          <Campo rotulo={L('Caracteres permitidos', 'Allowed characters')}>
            <select
              className="f"
              value={segmento.charset}
              onChange={(e) => set({ charset: e.target.value as SegmentoPadrao['charset'] })}
            >
              <option value="alnum">{L('Letras, números e hífen', 'Letters, digits and hyphen')}</option>
              <option value="alpha">{L('Apenas letras', 'Letters only')}</option>
              <option value="upper">{L('Maiúsculas e números', 'Uppercase and digits')}</option>
              <option value="any">{L('Qualquer caractere', 'Any character')}</option>
            </select>
          </Campo>
          <Campo rotulo={L('Mínimo', 'Minimum')}>
            <input
              className="f"
              type="number"
              min={0}
              value={segmento.minLen}
              onChange={(e) => set({ minLen: Number(e.target.value) })}
            />
          </Campo>
          <Campo rotulo={L('Máximo (0 = sem limite)', 'Maximum (0 = no limit)')}>
            <input
              className="f"
              type="number"
              min={0}
              value={segmento.maxLen}
              onChange={(e) => set({ maxLen: Number(e.target.value) })}
            />
          </Campo>
        </div>
      )

    default:
      return <p className="hint">{SEGMENT_TYPES[segmento.type].hint}</p>
  }
}

export default function EditorSegmento({
  segmento,
  indice,
  total,
  onChange,
  onRemover,
  onMover,
}: {
  segmento: SegmentoPadrao
  indice: number
  total: number
  onChange: (s: SegmentoPadrao) => void
  onRemover: (id: string) => void
  onMover: (indice: number, direcao: -1 | 1) => void
}) {
  const { L } = useI18n()

  return (
    <div className="card aud-seg">
      {/* O primeiro bloco nunca leva separador antes dele. */}
      {indice > 0 && (
        <div className="aud-seg-sep">
          <span className="co">{L('Separador antes', 'Separator before')}</span>
          <select
            className="f"
            style={{ width: 'auto' }}
            value={segmento.sep ?? ''}
            onChange={(e) => onChange({ ...segmento, sep: e.target.value })}
          >
            {SEPARATORS.map((s) => (
              <option key={s.value || 'nenhum'} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="aud-seg-cab">
        <span className="aud-seg-num">{indice + 1}</span>

        <select
          className="f"
          style={{ width: 'auto' }}
          value={segmento.type}
          onChange={(e) => onChange(changeSegmentType(segmento, e.target.value as TipoSegmento))}
        >
          {(Object.entries(SEGMENT_TYPES) as Array<[TipoSegmento, { label: string }]>).map(
            ([chave, { label }]) => (
              <option key={chave} value={chave}>
                {label}
              </option>
            ),
          )}
        </select>

        <input
          className="f"
          style={{ flex: 1 }}
          placeholder={L('Apelido (ex.: Disciplina)', 'Nickname (e.g. Discipline)')}
          value={segmento.label}
          onChange={(e) => onChange({ ...segmento, label: e.target.value })}
        />

        <button
          className="btn sm"
          onClick={() => onMover(indice, -1)}
          disabled={indice === 0}
          aria-label={L('Mover para cima', 'Move up')}
        >
          ↑
        </button>
        <button
          className="btn sm"
          onClick={() => onMover(indice, 1)}
          disabled={indice === total - 1}
          aria-label={L('Mover para baixo', 'Move down')}
        >
          ↓
        </button>
        <button
          className="btn sm danger"
          onClick={() => onRemover(segmento.id)}
          aria-label={L('Remover segmento', 'Remove segment')}
        >
          ×
        </button>
      </div>

      <CamposDoTipo segmento={segmento} onChange={onChange} />
    </div>
  )
}
