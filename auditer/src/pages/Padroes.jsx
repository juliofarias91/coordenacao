import { useMemo, useRef, useState } from 'react'
import { AlertTriangle, Check, Download, Plus, Ruler, Sparkles, Trash2, Upload, X } from 'lucide-react'
import { Badge, Button, Card, EmptyState, Input, Label, Select } from '../components/ui'
import SegmentEditor from '../components/SegmentEditor'
import {
  accPresetPatterns,
  describeSegment,
  exampleFor,
  lintPattern,
  newPattern,
  newSegment,
  patternToRegex,
  validateName,
} from '../lib/patterns'
import { cn } from '../lib/cn'

/** Pré-visualização do padrão como cadeia de blocos + separadores. */
function PatternPreview({ pattern }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {pattern.segments.map((seg, i) => (
        <span key={seg.id} className="flex items-center gap-1">
          {i > 0 && (
            <span className="font-mono text-sm text-muted-foreground">{seg.sep === ' ' ? '␣' : seg.sep === '' ? '·' : seg.sep}</span>
          )}
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold',
              seg.type === 'literal' ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary',
            )}
          >
            {seg.label && <span className="opacity-70">{seg.label}:</span>}
            {describeSegment(seg)}
          </span>
        </span>
      ))}
      {(pattern.extensions ?? []).filter(Boolean).length > 0 && (
        <span className="font-mono text-xs text-muted-foreground">.{pattern.extensions.filter(Boolean).join(' | .')}</span>
      )}
    </div>
  )
}

/** Testador ao vivo: digitar um nome e ver o veredito na hora. */
function LiveTester({ pattern }) {
  const [name, setName] = useState('')
  const result = useMemo(() => (name.trim() ? validateName(name.trim(), pattern) : null), [name, pattern])

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Testar um nome</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={exampleFor(pattern)} className="font-mono" />
      </div>

      {result && (
        <div className={cn('rounded-lg px-3.5 py-3 text-sm', result.ok ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500')}>
          {result.ok ? (
            <span className="flex items-center gap-2 font-semibold">
              <Check className="h-4 w-4" /> O nome está de acordo com o padrão.
            </span>
          ) : (
            <ul className="space-y-1">
              {result.issues.map((issue, i) => (
                <li key={i} className="flex gap-2">
                  <span className="shrink-0 font-semibold">{issue.segment ? `Segmento ${issue.segment}` : issue.label}:</span>
                  <span>{issue.message}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function PatternCard({ pattern, onChange, onRemove, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen ?? false)
  // Enquanto o editor está aberto, as mudanças vivem num rascunho e só valem no
  // Salvar. Fora do editor, mostra-se o padrão já salvo.
  const [draft, setDraft] = useState(pattern)
  // Um padrão recém-criado ainda não foi salvo: Cancelar deve descartá-lo, não
  // deixar um "Novo padrão" vazio na lista.
  const [neverSaved, setNeverSaved] = useState(defaultOpen ?? false)
  const view = open ? draft : pattern

  const issues = useMemo(() => lintPattern(view), [view])
  const dirty = open && JSON.stringify(draft) !== JSON.stringify(pattern)

  const startEdit = () => {
    setDraft(pattern)
    setOpen(true)
  }
  const cancel = () => {
    if (neverSaved) {
      onRemove(pattern.id)
      return
    }
    setDraft(pattern)
    setOpen(false)
  }
  const save = () => {
    onChange(draft)
    setNeverSaved(false)
    setOpen(false)
  }

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }))
  const updateSegment = (next) => set({ segments: draft.segments.map((s) => (s.id === next.id ? next : s)) })
  const removeSegment = (id) => set({ segments: draft.segments.filter((s) => s.id !== id) })
  const moveSegment = (idx, dir) => {
    const target = idx + dir
    if (target < 0 || target >= draft.segments.length) return
    const segments = [...draft.segments]
    ;[segments[idx], segments[target]] = [segments[target], segments[idx]]
    // O primeiro segmento nunca leva separador antes; garante isso após mover.
    segments[0] = { ...segments[0], sep: '' }
    set({ segments })
  }

  return (
    <Card className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          {open ? (
            <Input
              value={draft.name}
              onChange={(e) => set({ name: e.target.value })}
              className="h-9 border-transparent bg-transparent px-0 py-1 text-base font-bold focus:border-transparent"
              placeholder="Nome do padrão"
            />
          ) : (
            <h3 className="py-1 text-base font-bold text-foreground">{pattern.name || 'Sem nome'}</h3>
          )}
          <PatternPreview pattern={view} />
          <p className="font-mono text-xs text-muted-foreground">Ex.: {exampleFor(view)}</p>
        </div>

        <div className="flex items-center gap-2">
          {open ? (
            <>
              <Button variant="outline" size="sm" onClick={cancel}>Cancelar</Button>
              <Button size="sm" onClick={save}>
                <Check className="h-4 w-4" /> Salvar
              </Button>
            </>
          ) : (
            <Button variant="outline" size="sm" onClick={startEdit}>Editar</Button>
          )}
          <Button variant="destructive" size="icon" onClick={() => onRemove(pattern.id)} aria-label="Excluir padrão">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {issues.length > 0 && (
        <div className="space-y-1 rounded-lg bg-amber-500/10 px-3.5 py-3 text-sm text-amber-500">
          {issues.map((issue, i) => (
            <p key={i} className="flex gap-2">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {issue}
            </p>
          ))}
        </div>
      )}

      {open && (
        <div className="space-y-5 border-t border-border/50 pt-5">
          <div className="space-y-1.5">
            <Label>Extensões aceitas</Label>
            <Input
              value={(draft.extensions ?? []).join(', ')}
              onChange={(e) => set({ extensions: e.target.value.split(',').map((v) => v.trim().replace(/^\./, '')) })}
              placeholder="pdf, xlsx"
              className="max-w-xs"
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Segmentos</Label>
              <Button variant="outline" size="sm" onClick={() => set({ segments: [...draft.segments, newSegment('list', '_')] })}>
                <Plus className="h-4 w-4" /> Segmento
              </Button>
            </div>

            {draft.segments.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-3.5 py-6 text-center text-sm text-muted-foreground">
                Nenhum segmento. Adicione o primeiro bloco do nome.
              </p>
            ) : (
              <div className="space-y-3">
                {draft.segments.map((seg, i) => (
                  <SegmentEditor
                    key={seg.id}
                    segment={seg}
                    index={i}
                    total={draft.segments.length}
                    onChange={updateSegment}
                    onRemove={removeSegment}
                    onMove={moveSegment}
                  />
                ))}
              </div>
            )}
          </div>

          <LiveTester pattern={draft} />

          <details className="group">
            <summary className="cursor-pointer list-none text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground">
              Ver expressão regular gerada
            </summary>
            <pre className="thin-scroll mt-2 overflow-x-auto rounded-lg bg-muted px-3.5 py-3 text-xs text-muted-foreground">{patternToRegex(draft)}</pre>
          </details>

          {/* Barra de ação fixa no rodapé do editor — Salvar/Cancelar sempre à mão. */}
          <div className="flex items-center justify-end gap-2 border-t border-border/50 pt-4">
            {dirty && <span className="mr-auto text-xs text-amber-500">Alterações não salvas</span>}
            <Button variant="outline" size="sm" onClick={cancel}>Cancelar</Button>
            <Button size="sm" onClick={save}>
              <Check className="h-4 w-4" /> Salvar
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}

export default function Padroes({ patterns, setPatterns }) {
  const fileRef = useRef(null)
  const [notice, setNotice] = useState(null)
  const [lastAdded, setLastAdded] = useState(null)

  const add = () => {
    const p = newPattern()
    setPatterns([...patterns, p])
    setLastAdded(p.id)
  }
  const addPreset = () => {
    const preset = accPresetPatterns()
    setPatterns([...patterns, ...preset])
    setNotice({ tone: 'green', text: `${preset.length} padrões do modelo ACC adicionados. Ajuste os valores como precisar.` })
  }
  const update = (next) => setPatterns(patterns.map((p) => (p.id === next.id ? next : p)))
  const remove = (id) => setPatterns(patterns.filter((p) => p.id !== id))

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(patterns, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'auditer-padroes.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const importJson = async (file) => {
    try {
      const parsed = JSON.parse(await file.text())
      if (!Array.isArray(parsed)) throw new Error('o arquivo não contém uma lista de padrões')
      const withIds = parsed.map((p) => ({
        ...p,
        id: Math.random().toString(36).slice(2, 10),
        segments: (p.segments ?? []).map((s) => ({ ...s, id: Math.random().toString(36).slice(2, 10) })),
      }))
      setPatterns([...patterns, ...withIds])
      setNotice({ tone: 'green', text: `${withIds.length} padrão(ões) importado(s).` })
    } catch (err) {
      setNotice({ tone: 'red', text: `Não foi possível importar: ${err.message}` })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Padrões de nomenclatura</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Monte o nome esperado em blocos, cada um com seu separador. A auditoria confere os arquivos contra estes padrões.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) importJson(file)
              e.target.value = ''
            }}
          />
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4" /> Importar
          </Button>
          <Button variant="outline" size="sm" onClick={exportJson} disabled={!patterns.length}>
            <Download className="h-4 w-4" /> Exportar
          </Button>
          <Button variant="outline" size="sm" onClick={addPreset}>
            <Sparkles className="h-4 w-4" /> Modelo ACC
          </Button>
          <Button size="sm" onClick={add}>
            <Plus className="h-4 w-4" /> Novo padrão
          </Button>
        </div>
      </div>

      {notice && (
        <div
          className={cn(
            'flex items-center justify-between gap-3 rounded-lg px-3.5 py-3 text-sm',
            notice.tone === 'green' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500',
          )}
        >
          <span>{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Fechar aviso">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {patterns.length === 0 ? (
        <EmptyState
          icon={Ruler}
          title="Nenhum padrão cadastrado"
          description="Crie um padrão do zero ou comece pelo Modelo ACC (a convenção Spec Audit / 4D Parameter / Relatório de Auditoria) e ajuste os valores."
          action={
            <div className="flex gap-2">
              <Button size="sm" onClick={addPreset}>
                <Sparkles className="h-4 w-4" /> Usar Modelo ACC
              </Button>
              <Button variant="outline" size="sm" onClick={add}>
                <Plus className="h-4 w-4" /> Criar do zero
              </Button>
            </div>
          }
        />
      ) : (
        <div className="space-y-4">
          {patterns.map((p) => (
            <PatternCard key={p.id} pattern={p} onChange={update} onRemove={remove} defaultOpen={p.id === lastAdded} />
          ))}
        </div>
      )}

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Badge tone="neutral">local</Badge>
        Os padrões ficam salvos neste navegador. Use Exportar para levá-los a outra máquina.
      </p>
    </div>
  )
}
