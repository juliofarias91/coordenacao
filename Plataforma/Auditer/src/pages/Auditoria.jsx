import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Download, FileText, Loader2, RefreshCw, Trash2 } from 'lucide-react'
import Dropzone from '../components/Dropzone'
import FileResult from '../components/FileResult'
import { Badge, Button, Card, EmptyState } from '../components/ui'
import { extractTexts } from '../lib/excel'
import { checkFilenameHygiene, findContentDuplicates, findDuplicates, matchBestPattern } from '../lib/patterns'
import { sha256 } from '../lib/hash'
import { downloadAuditReport } from '../lib/report'
import { useSpellChecker } from '../lib/useSpellChecker'
import { cn } from '../lib/cn'

const isExcel = (name) => /\.(xlsx|xlsm|xls)$/i.test(name)

function Kpi({ label, value, tone = 'neutral' }) {
  const color = {
    neutral: 'text-foreground',
    green: 'text-emerald-500',
    amber: 'text-amber-500',
    red: 'text-red-500',
  }[tone]

  return (
    <Card className="p-5">
      <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn('mt-1.5 text-2xl font-bold tabular-nums', color)}>{value}</p>
    </Card>
  )
}

let seq = 0

export default function Auditoria({ patterns, ignoreWords, onIgnoreWord }) {
  const { status: spellStatus, error: spellError, check, retry, langs: spellLangs } = useSpellChecker()
  const [results, setResults] = useState([])
  const hasEnglish = spellLangs.includes('en')

  // Aceitar uma palavra faz duas coisas: guarda na lista de aceitas (para os
  // próximos arquivos) E some AGORA com todas as ocorrências dela nos resultados
  // já na tela — senão o clique parecia não fazer nada, exigindo reenviar o arquivo.
  const handleIgnoreWord = useCallback(
    (word) => {
      onIgnoreWord(word)
      const key = word.toLowerCase()
      setResults((prev) =>
        prev.map((r) =>
          r.spelling?.length
            ? { ...r, spelling: r.spelling.filter((f) => f.word.toLowerCase() !== key) }
            : r,
        ),
      )
    },
    [onIgnoreWord],
  )

  const auditFile = useCallback(
    async (entry) => {
      // O nome é auditado para QUALQUER arquivo (PDF, xlsx, …) e nunca depende do
      // corretor — é o eixo que importa para evitar duplicidade/erro no ACC.
      const name = patterns.length ? matchBestPattern(entry.file.name, patterns) : null

      // Higiene independe de padrão: vale mesmo sem padrão cadastrado e mesmo
      // quando o nome casa um padrão (espaço duplo/borda passa pela caminhada).
      const hygiene = checkFilenameHygiene(entry.file.name)

      // Lê o conteúdo uma vez só: serve para o hash (detecção de CÓPIA por
      // conteúdo, mesmo com nome diferente) e, quando for Excel, para o SheetJS.
      let hash = null
      let buffer = null
      try {
        buffer = await entry.file.arrayBuffer()
        hash = await sha256(buffer)
      } catch {
        // arquivo ilegível: segue sem hash — a detecção por conteúdo só o ignora.
      }

      // Ortografia só faz sentido em Excel, e sua falha (corretor fora do ar,
      // arquivo corrompido) não pode invalidar a auditoria de nome.
      let spelling = null
      let spellError = null
      if (isExcel(entry.file.name)) {
        try {
          const { entries } = await extractTexts(buffer ?? entry.file)
          spelling = await check(entries, { ignoreWords })
        } catch (err) {
          spellError = err?.message ?? String(err)
        }
      } else {
        spellError = 'not-excel' // sinaliza "ortografia não se aplica"
      }

      setResults((prev) =>
        prev.map((r) => (r.id === entry.id ? { ...r, status: 'done', name, hygiene, hash, spelling, spellError } : r)),
      )
    },
    [check, patterns, ignoreWords],
  )

  const handleFiles = useCallback(
    (files) => {
      const entries = files.map((file) => ({ id: ++seq, file, status: 'pending' }))
      setResults((prev) => [...entries, ...prev])
      // Sequencial de propósito: o worker é um só, e disparar tudo de uma vez
      // apenas encheria a fila dele sem acelerar nada.
      entries.reduce((chain, entry) => chain.then(() => auditFile(entry)), Promise.resolve())
    },
    [auditFile],
  )

  // Duplicidade é cruzada entre TODOS os arquivos da sessão, não por arquivo.
  // Mapeia cada nome duplicado → os outros nomes com que ele colide.
  const dupMap = useMemo(() => {
    const groups = findDuplicates(results.map((r) => r.file.name))
    const map = new Map()
    for (const g of groups) {
      for (const f of g.files) {
        map.set(f.toLowerCase(), { type: g.type, others: g.files.filter((x) => x !== f) })
      }
    }
    return map
  }, [results])

  // Cópia por CONTEÚDO (mesmo hash), mesmo com nome diferente — o caso que a
  // duplicidade por nome não pega. Mapeado por id do resultado (nomes diferem).
  const contentDupMap = useMemo(() => {
    const groups = findContentDuplicates(results.map((r) => ({ name: r.file.name, hash: r.hash })))
    const byHash = new Map(groups.map((g) => [g.hash, g.files]))
    const map = new Map()
    for (const r of results) {
      if (!r.hash) continue
      const names = byHash.get(r.hash)
      if (!names) continue
      const others = [...new Set(names.filter((n) => n !== r.file.name))]
      // Só interessa quando há ao menos um NOME diferente = cópia renomeada.
      // Se todos os nomes são iguais, é duplicidade de nome (já coberta acima).
      if (others.length) map.set(r.id, { others })
    }
    return map
  }, [results])

  const dupInfo = useCallback(
    (r) => {
      const nameDup = dupMap.get(r.file.name.toLowerCase()) ?? null
      const contentDup = contentDupMap.get(r.id) ?? null
      return nameDup || contentDup ? { name: nameDup, content: contentDup } : null
    },
    [dupMap, contentDupMap],
  )

  const isDup = useCallback(
    (r) => dupMap.has(r.file.name.toLowerCase()) || contentDupMap.has(r.id),
    [dupMap, contentDupMap],
  )

  const stats = useMemo(() => {
    const done = results.filter((r) => r.status === 'done')
    const isClean = (r) =>
      r.name?.ok !== false &&
      (r.hygiene?.length ?? 0) === 0 &&
      (r.spelling?.length ?? 0) === 0 &&
      !isDup(r)
    return {
      total: results.length,
      pending: results.filter((r) => r.status !== 'done').length,
      nameErrors: done.filter((r) => r.name?.ok === false).length,
      hygieneErrors: done.filter((r) => (r.hygiene?.length ?? 0) > 0).length,
      spellErrors: done.reduce((sum, r) => sum + (r.spelling?.length ?? 0), 0),
      duplicates: done.filter(isDup).length,
      clean: done.filter(isClean).length,
      withIssues: done.filter((r) => !isClean(r)).length,
    }
  }, [results, isDup])

  // Filtro da lista: numa pasta grande, ver "só o que tem problema" é o que importa.
  const [filter, setFilter] = useState('all')
  const matchesFilter = useCallback(
    (r) => {
      if (filter === 'all') return true
      if (r.status !== 'done') return false // pendentes só aparecem em "Todos" — ainda não classificados
      const isDupR = isDup(r)
      const nameBad = r.name?.ok === false || (r.hygiene?.length ?? 0) > 0
      const spellBad = (r.spelling?.length ?? 0) > 0
      switch (filter) {
        case 'issues': return nameBad || spellBad || isDupR
        case 'name': return nameBad
        case 'dup': return isDupR
        case 'spell': return spellBad
        case 'clean': return !nameBad && !spellBad && !isDupR
        default: return true
      }
    },
    [filter, isDup],
  )
  const visibleResults = useMemo(() => results.filter(matchesFilter), [results, matchesFilter])

  const exportReport = () => {
    // Escapa por RFC 4180: um nome de aba com ";" ou aspas quebraria as colunas.
    const esc = (v) => {
      const s = String(v ?? '')
      return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const row = (cells) => cells.map(esc).join(';')

    const lines = [row(['arquivo', 'tipo', 'local', 'problema', 'sugestoes'])]
    for (const r of results.filter((r) => r.status === 'done')) {
      const dup = dupInfo(r)
      if (dup?.name) {
        lines.push(row([r.file.name, 'duplicidade', dup.name.type, `mesmo nome de: ${dup.name.others.join(' | ')}`, '']))
      }
      if (dup?.content) {
        lines.push(row([r.file.name, 'duplicidade', 'conteúdo', `conteúdo idêntico a: ${dup.content.others.join(' | ')}`, '']))
      }
      for (const issue of r.hygiene ?? []) {
        lines.push(row([r.file.name, 'higiene', issue.label, issue.message, '']))
      }
      for (const issue of r.name?.issues ?? []) {
        lines.push(row([r.file.name, 'nome', issue.segment ? `segmento ${issue.segment}` : issue.label, issue.message, '']))
      }
      for (const f of r.spelling ?? []) {
        const local = f.kind === 'sheet' ? `aba "${f.sheet}"` : `${f.sheet}!${f.cell}`
        lines.push(row([r.file.name, 'ortografia', local, f.word, f.suggestions.join(' / ')]))
      }
    }

    // BOM: sem ele o Excel abre o CSV em ANSI e os acentos saem quebrados.
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'auditer-relatorio.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const hasIssues = stats.nameErrors > 0 || stats.hygieneErrors > 0 || stats.spellErrors > 0 || stats.duplicates > 0

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Auditoria de arquivos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Confere o nome contra os padrões e a duplicidade entre arquivos; nos Excel, também a ortografia.
          </p>
        </div>

        {results.length > 0 && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => downloadAuditReport(results)} disabled={!hasIssues}>
              <Download className="h-4 w-4" /> Auditoria .xlsx
            </Button>
            <Button variant="outline" size="sm" onClick={exportReport} disabled={!hasIssues}>
              <Download className="h-4 w-4" /> CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => setResults([])}>
              <Trash2 className="h-4 w-4" /> Limpar
            </Button>
          </div>
        )}
      </div>

      {spellStatus === 'loading' && (
        <div className="flex items-center gap-2 rounded-lg bg-primary/10 px-3.5 py-3 text-sm text-primary">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando os dicionários (pt-BR + inglês). Você já pode soltar os arquivos — eles entram na fila.
        </div>
      )}

      {spellStatus === 'ready' && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className={cn('inline-block h-1.5 w-1.5 rounded-full', hasEnglish ? 'bg-emerald-500' : 'bg-amber-500')} />
          {hasEnglish ? (
            <>Corretor pronto — a ortografia é auditada em <strong className="font-semibold text-foreground">português e inglês</strong>; palavras em inglês não contam como erro.</>
          ) : (
            <>
              Corretor em <strong className="font-semibold text-amber-500">só português</strong> — o dicionário de inglês não carregou.
              Recarregue a página com <strong className="font-semibold text-foreground">Ctrl+Shift+R</strong>.
            </>
          )}
        </div>
      )}

      {spellStatus === 'error' && (
        <div className="flex flex-wrap items-start gap-x-2 gap-y-2 rounded-lg bg-red-500/10 px-3.5 py-3 text-sm text-red-500">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">
            <strong className="font-semibold">O corretor ortográfico não carregou.</strong>{' '}
            {spellError?.kind === 'dictionary' ? (
              <>
                O dicionário não foi encontrado. Rode <code className="font-mono">npm install</code> (ou{' '}
                <code className="font-mono">node scripts/copy-dict.mjs</code>) para gerar{' '}
                <code className="font-mono">public/dictionaries</code> e recarregue.
              </>
            ) : (
              <>
                Isso costuma ser um chunk do Vite obsoleto após reiniciar o servidor — um{' '}
                <strong className="font-semibold">recarregamento forçado (Ctrl+Shift+R)</strong> resolve. A auditoria de{' '}
                <em>nome de arquivo</em> continua funcionando normalmente.
              </>
            )}
            <span className="mt-1 block font-mono text-xs text-red-500/80">
              detalhe: {spellError?.message}
              {spellError?.detail}
            </span>
          </span>
          <button
            type="button"
            onClick={retry}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 px-3 py-1.5 text-xs font-semibold text-red-500 transition-colors hover:bg-red-500/10"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Tentar novamente
          </button>
        </div>
      )}

      {patterns.length === 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-500/10 px-3.5 py-3 text-sm text-amber-500">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Nenhum padrão cadastrado — o nome dos arquivos não será conferido.
          <Link to="/padroes" className="font-semibold underline underline-offset-2">
            Criar um padrão
          </Link>
        </div>
      )}

      <Dropzone onFiles={handleFiles} />

      {results.length > 0 && (
        <>
          {stats.pending > 0 && (
            <div className="flex items-center gap-2 rounded-lg bg-primary/10 px-3.5 py-3 text-sm text-primary">
              <Loader2 className="h-4 w-4 animate-spin" />
              Auditando… <strong className="font-semibold">{stats.total - stats.pending} de {stats.total}</strong> concluídos
              {stats.pending > 1 && <span className="opacity-70">· {stats.pending} na fila</span>}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <Kpi label="Arquivos" value={stats.total} />
            <Kpi label="Sem problema" value={stats.clean} tone={stats.clean > 0 ? 'green' : 'neutral'} />
            <Kpi label="Nome fora do padrão" value={stats.nameErrors} tone={stats.nameErrors > 0 ? 'red' : 'neutral'} />
            <Kpi label="Higiene de nome" value={stats.hygieneErrors} tone={stats.hygieneErrors > 0 ? 'red' : 'neutral'} />
            <Kpi label="Duplicados" value={stats.duplicates} tone={stats.duplicates > 0 ? 'red' : 'neutral'} />
            <Kpi label="Erros de ortografia" value={stats.spellErrors} tone={stats.spellErrors > 0 ? 'amber' : 'neutral'} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {[
              { key: 'all', label: 'Todos', count: stats.total },
              { key: 'issues', label: 'Com problema', count: stats.withIssues },
              { key: 'name', label: 'Nome', count: stats.nameErrors + stats.hygieneErrors },
              { key: 'dup', label: 'Duplicados', count: stats.duplicates },
              { key: 'spell', label: 'Ortografia', count: stats.spellErrors },
              { key: 'clean', label: 'Sem problema', count: stats.clean },
            ].map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={() => setFilter(chip.key)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
                  filter === chip.key
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                {chip.label}
                <span className="tabular-nums opacity-70">{chip.count}</span>
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {visibleResults.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-3.5 py-6 text-center text-sm text-muted-foreground">
                Nenhum arquivo neste filtro.
              </p>
            ) : (
              visibleResults.map((r) => (
                <FileResult
                  key={r.id}
                  result={r}
                  duplicate={dupInfo(r)}
                  onIgnoreWord={handleIgnoreWord}
                  onRemove={(id) => setResults((prev) => prev.filter((x) => x.id !== id))}
                />
              ))
            )}
          </div>

          {ignoreWords.length > 0 && (
            <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge tone="neutral">aceitas</Badge>
              {ignoreWords.join(', ')}
              <span className="opacity-60">— removidas dos resultados e ignoradas nos próximos arquivos.</span>
              <Link to="/aceitas" className="font-semibold text-foreground underline underline-offset-2">
                gerenciar
              </Link>
            </p>
          )}
        </>
      )}

      {results.length === 0 && spellStatus !== 'loading' && (
        <EmptyState
          icon={FileText}
          title="Nenhum arquivo auditado ainda"
          description="Solte os arquivos acima — pode ser a pasta inteira do ACC. Tudo roda no seu navegador, nada é enviado para servidor."
        />
      )}
    </div>
  )
}
