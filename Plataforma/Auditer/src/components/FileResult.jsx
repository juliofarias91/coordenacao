import { useState } from 'react'
import { AlertTriangle, Check, ChevronDown, ChevronRight, Copy, Download, FileText, Loader2, Plus, X } from 'lucide-react'
import { Badge } from './ui'
import { downloadAuditReport } from '../lib/report'
import { cn } from '../lib/cn'

/** Destaca a palavra errada dentro do texto da célula. */
function Highlight({ text, word, index }) {
  const end = index + word.length
  if (index < 0 || end > text.length || text.slice(index, end) !== word) {
    return <span className="text-muted-foreground">{text}</span>
  }
  return (
    <span className="text-muted-foreground">
      {text.slice(0, index)}
      <mark className="rounded bg-red-500/20 px-0.5 font-semibold text-red-500">{word}</mark>
      {text.slice(end)}
    </span>
  )
}

function SpellRow({ finding, onIgnore }) {
  return (
    <div className="group flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-foreground/[0.03]">
      <span className="w-28 shrink-0 truncate font-mono text-xs tabular-nums text-muted-foreground" title={finding.sheet}>
        {finding.kind === 'sheet' ? 'aba' : `${finding.sheet}!${finding.cell}`}
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm leading-relaxed break-words">
          <Highlight text={finding.text} word={finding.word} index={finding.index} />
        </p>
        {finding.suggestions.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Sugestões: <span className="text-emerald-500">{finding.suggestions.join(', ')}</span>
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={() => onIgnore(finding.word)}
        title={`Marcar "${finding.word}" como palavra correta — não será mais apontada em nenhum arquivo (reenvie o arquivo para reauditar).`}
        className="flex h-7 shrink-0 items-center gap-1 rounded-full border border-border px-2.5 text-xs text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
      >
        <Plus className="h-3 w-3" /> Aceitar palavra
      </button>
    </div>
  )
}

export default function FileResult({ result, onIgnoreWord, onRemove, duplicate }) {
  const [open, setOpen] = useState(false)
  const { file, status, name, hygiene, spelling, spellError } = result

  const nameOk = name?.ok ?? null
  const hygieneIssues = hygiene ?? []
  const spellCount = spelling?.length ?? 0
  const spellApplicable = spellError !== 'not-excel'
  const spellFailed = spellApplicable && spellError && spellError !== 'not-excel'

  const Chevron = open ? ChevronDown : ChevronRight

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div
        className="flex cursor-pointer items-center gap-3 px-5 py-4 transition-colors hover:bg-foreground/[0.02]"
        onClick={() => setOpen((v) => !v)}
      >
        <Chevron className="h-4 w-4 shrink-0 text-muted-foreground" />
        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />

        <span className="min-w-0 flex-1 truncate font-mono text-sm text-foreground" title={file.name}>
          {file.name}
        </span>

        <div className="flex shrink-0 items-center gap-2">
          {status === 'pending' && (
            <Badge tone="neutral">
              <Loader2 className="h-3 w-3 animate-spin" /> auditando
            </Badge>
          )}
          {status === 'done' && (
            <>
              {duplicate?.name && (
                <Badge tone="red">
                  <Copy className="h-3 w-3" /> duplicado
                </Badge>
              )}
              {duplicate?.content && (
                <Badge tone="red">
                  <Copy className="h-3 w-3" /> cópia
                </Badge>
              )}
              {nameOk === true && <Badge tone="green">nome ok</Badge>}
              {nameOk === false && <Badge tone="red">nome: {name.issues.length}</Badge>}
              {nameOk === null && <Badge tone="neutral">sem padrão</Badge>}
              {hygieneIssues.length > 0 && <Badge tone="red">higiene: {hygieneIssues.length}</Badge>}
              {!spellApplicable && <Badge tone="neutral">só nome</Badge>}
              {spellApplicable && spellFailed && <Badge tone="amber">ortografia indisp.</Badge>}
              {spellApplicable && !spellFailed && spellCount > 0 && <Badge tone="amber">ortografia: {spellCount}</Badge>}
              {spellApplicable && !spellFailed && spellCount === 0 && <Badge tone="green">ortografia ok</Badge>}
            </>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onRemove(result.id)
            }}
            aria-label="Remover da lista"
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-border/50">
          {status === 'done' && (
            <div className="flex justify-end px-5 pt-3">
              <button
                type="button"
                onClick={() => downloadAuditReport([result], { single: true })}
                title="Baixar uma planilha de auditoria com os erros de ortografia (por célula) e de nome deste arquivo"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <Download className="h-3.5 w-3.5" /> Baixar auditoria (.xlsx)
              </button>
            </div>
          )}
          {duplicate?.content && (
            <p className="flex items-start gap-2 border-b border-border/50 bg-red-500/5 px-5 py-3 text-sm text-red-500">
              <Copy className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Conteúdo idêntico a: <span className="font-mono">{duplicate.content.others.join(', ')}</span> — é o mesmo
                arquivo salvo com outro nome.
              </span>
            </p>
          )}
          {duplicate?.name && (
            <p className="flex items-start gap-2 border-b border-border/50 bg-red-500/5 px-5 py-3 text-sm text-red-500">
              <Copy className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Nome duplicado — colide com: <span className="font-mono">{duplicate.name.others.join(', ')}</span>. No ACC
                isso vira conflito ou versão indevida.
              </span>
            </p>
          )}

          {hygieneIssues.length > 0 && (
            <section className="border-b border-border/50 px-5 py-4">
              <h3 className="mb-2.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Higiene do nome</h3>
              <ul className="space-y-1.5">
                {hygieneIssues.map((issue, i) => (
                  <li key={i} className="flex gap-2 text-sm">
                    <span className="shrink-0 font-semibold text-red-500">{issue.label}</span>
                    <span className="text-muted-foreground">{issue.message}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="border-b border-border/50 px-5 py-4">
            <div className="mb-2.5 flex items-center gap-2">
              <h3 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Nome do arquivo</h3>
              {name?.pattern && <span className="text-xs text-muted-foreground">· padrão “{name.pattern.name}”</span>}
            </div>

            {nameOk === null && <p className="text-sm text-muted-foreground">Nenhum padrão cadastrado — o nome não foi conferido.</p>}
            {nameOk === true && (
              <p className="flex items-center gap-2 text-sm text-emerald-500">
                <Check className="h-4 w-4" /> O nome segue o padrão.
              </p>
            )}
            {nameOk === false && (
              <ul className="space-y-1.5">
                {name.issues.map((issue, i) => (
                  <li key={i} className="flex gap-2 text-sm">
                    <span className="shrink-0 font-semibold text-red-500">{issue.segment ? `Segmento ${issue.segment}` : issue.label}</span>
                    <span className="text-muted-foreground">{issue.message}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {spellApplicable && (
            <section>
              <h3 className="px-5 pb-1 pt-4 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                Ortografia {!spellFailed && spellCount > 0 && `· ${spellCount} ocorrência(s)`}
              </h3>

              {spellFailed ? (
                <p className="flex items-center gap-2 px-5 py-3 text-sm text-amber-500">
                  <AlertTriangle className="h-4 w-4" /> Não foi possível verificar a ortografia deste arquivo.
                </p>
              ) : spellCount === 0 ? (
                <p className="flex items-center gap-2 px-5 py-3 text-sm text-emerald-500">
                  <Check className="h-4 w-4" /> Nenhum erro encontrado.
                </p>
              ) : (
                <div className="thin-scroll max-h-96 divide-y divide-border/50 overflow-y-auto py-1">
                  {spelling.map((f, i) => (
                    <SpellRow key={`${f.sheet}-${f.cell}-${f.index}-${i}`} finding={f} onIgnore={onIgnoreWord} />
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  )
}
