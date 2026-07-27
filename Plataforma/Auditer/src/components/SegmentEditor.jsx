import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react'
import { Input, Label, Select, Switch } from './ui'
import { DATE_FORMATS, SEGMENT_TYPES, SEPARATORS, changeSegmentType } from '../lib/patterns'

/** Campos específicos de cada tipo de segmento. */
function TypeFields({ segment, onChange }) {
  const set = (patch) => onChange({ ...segment, ...patch })

  switch (segment.type) {
    case 'literal':
      return (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Texto exigido</Label>
            <Input value={segment.value} onChange={(e) => set({ value: e.target.value })} placeholder="Spec Audit LOD" />
            <p className="text-xs text-muted-foreground">Pode conter espaços. É o texto fixo que aparece igual em todo nome.</p>
          </div>
          <Switch checked={segment.caseSensitive} onChange={(v) => set({ caseSensitive: v })} label="Diferenciar maiúsculas de minúsculas" />
        </div>
      )

    case 'list':
      return (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Valores aceitos</Label>
            <Input
              value={segment.values.join(', ')}
              onChange={(e) => set({ values: e.target.value.split(',').map((v) => v.trim()) })}
              placeholder="ADMN, COL1, COL2, COL3, SITE, UTLS"
            />
            <p className="text-xs text-muted-foreground">Separe por vírgula.</p>
          </div>
          <Switch checked={segment.caseSensitive} onChange={(v) => set({ caseSensitive: v })} label="Diferenciar maiúsculas de minúsculas" />
        </div>
      )

    case 'date':
      return (
        <div className="space-y-1.5">
          <Label>Formato</Label>
          <Select value={segment.format} onChange={(e) => set({ format: e.target.value })}>
            {DATE_FORMATS.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </Select>
        </div>
      )

    case 'number':
      return (
        <div className="space-y-3">
          <Switch checked={segment.exactDigits} onChange={(v) => set({ exactDigits: v })} label="Exigir quantidade exata de dígitos" />
          {segment.exactDigits && (
            <div className="space-y-1.5">
              <Label>Dígitos</Label>
              <Input type="number" min={1} max={12} value={segment.digits} onChange={(e) => set({ digits: Number(e.target.value) })} />
            </div>
          )}
        </div>
      )

    case 'text':
      return (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Caracteres permitidos</Label>
            <Select value={segment.charset} onChange={(e) => set({ charset: e.target.value })}>
              <option value="alnum">Letras, números e hífen</option>
              <option value="alpha">Apenas letras</option>
              <option value="upper">Maiúsculas e números</option>
              <option value="any">Qualquer caractere</option>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Mínimo</Label>
              <Input type="number" min={0} value={segment.minLen} onChange={(e) => set({ minLen: Number(e.target.value) })} />
            </div>
            <div className="space-y-1.5">
              <Label>Máximo</Label>
              <Input type="number" min={0} value={segment.maxLen} onChange={(e) => set({ maxLen: Number(e.target.value) })} />
              <p className="text-xs text-muted-foreground">0 = sem limite</p>
            </div>
          </div>
        </div>
      )

    default:
      return <p className="text-sm text-muted-foreground">{SEGMENT_TYPES[segment.type].hint}</p>
  }
}

export default function SegmentEditor({ segment, index, total, onChange, onRemove, onMove }) {
  const isFirst = index === 0

  return (
    <div className="rounded-xl border border-border/60 bg-background">
      {/* Separador que liga este bloco ao anterior — a peça-chave do modelo. */}
      {!isFirst && (
        <div className="flex items-center gap-2 border-b border-border/50 px-4 py-2">
          <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Separador antes</span>
          <Select value={segment.sep ?? ''} onChange={(e) => onChange({ ...segment, sep: e.target.value })} className="h-8 w-auto py-1 text-sm">
            {SEPARATORS.map((s) => (
              <option key={s.value || 'none'} value={s.value}>{s.label}</option>
            ))}
          </Select>
          <span className="font-mono text-xs text-muted-foreground">
            …{segment.sep === ' ' ? '␣' : segment.sep === '' ? '(colado)' : segment.sep}{describeShort(segment)}
          </span>
        </div>
      )}

      <div className="p-4">
        <div className="mb-4 flex items-center gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
            {index + 1}
          </span>

          <Select
            value={segment.type}
            onChange={(e) => onChange(changeSegmentType(segment, e.target.value))}
            className="h-9 w-auto py-1.5 text-sm"
          >
            {Object.entries(SEGMENT_TYPES).map(([key, { label }]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </Select>

          <Input
            value={segment.label}
            onChange={(e) => onChange({ ...segment, label: e.target.value })}
            placeholder="Apelido (ex.: Disciplina)"
            className="h-9 flex-1 py-1.5"
          />

          <div className="flex items-center">
            <button
              type="button"
              onClick={() => onMove(index, -1)}
              disabled={index === 0}
              aria-label="Mover para cima"
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
            >
              <ChevronUp className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onMove(index, 1)}
              disabled={index === total - 1}
              aria-label="Mover para baixo"
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onRemove(segment.id)}
              aria-label="Remover segmento"
              className="flex h-8 w-8 items-center justify-center rounded-md text-red-500 transition-colors hover:bg-red-500/10"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        <TypeFields segment={segment} onChange={onChange} />
      </div>
    </div>
  )
}

function describeShort(seg) {
  switch (seg.type) {
    case 'literal': return seg.value || 'fixo'
    case 'list': return seg.values?.filter(Boolean)[0] ?? 'lista'
    case 'date': return seg.format
    case 'number': return seg.exactDigits ? '#'.repeat(Math.min(seg.digits || 1, 4)) : '#'
    case 'text': return 'texto'
    default: return '…'
  }
}
