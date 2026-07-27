import * as XLSX from 'xlsx'
import { exampleFor, findContentDuplicates, findDuplicates } from './patterns'

/**
 * Gera uma planilha de auditoria (.xlsx) para o usuário aplicar as correções.
 *
 * De propósito NÃO reescreve a planilha original: o SheetJS (edição comunitária)
 * não preserva validações (dropdowns), tabelas nem PROCV ao regravar, e as
 * planilhas do usuário dependem disso. Em vez de arriscar o arquivo mestre, este
 * relatório fixa cada erro na célula exata (Aba!Célula) + a sugestão, para o
 * ajuste ser rápido no arquivo real. Também traz o modelo de nome correto.
 */

const sheetFromRows = (rows) => XLSX.utils.aoa_to_sheet(rows)

/** Largura de coluna aproximada a partir do maior conteúdo. */
function autoWidth(rows) {
  const widths = []
  for (const row of rows) {
    row.forEach((cell, i) => {
      const len = String(cell ?? '').length
      widths[i] = Math.min(60, Math.max(widths[i] ?? 10, len + 2))
    })
  }
  return widths.map((w) => ({ wch: w }))
}

function appendSheet(wb, name, rows) {
  const ws = sheetFromRows(rows)
  ws['!cols'] = autoWidth(rows)
  XLSX.utils.book_append_sheet(wb, ws, name)
}

const nameStatus = (r) =>
  r.name == null ? 'sem padrão' : r.name.ok ? 'OK' : `${r.name.issues.length} problema(s)`

const spellStatus = (r) =>
  r.spellError === 'not-excel'
    ? 'não se aplica'
    : r.spellError
      ? 'não verificada'
      : `${r.spelling?.length ?? 0} erro(s)`

export function buildAuditWorkbook(results) {
  const done = results.filter((r) => r.status === 'done')
  const wb = XLSX.utils.book_new()

  // --- Resumo: uma linha por arquivo -------------------------------------
  const resumo = [['Arquivo', 'Padrão', 'Nome', 'Ortografia', 'Modelo de nome correto']]
  for (const r of done) {
    const modelo = r.name && !r.name.ok ? exampleFor(r.name.pattern) : ''
    resumo.push([r.file.name, r.name?.pattern?.name ?? '—', nameStatus(r), spellStatus(r), modelo])
  }
  appendSheet(wb, 'Resumo', resumo)

  // --- Ortografia: uma linha por palavra a corrigir ----------------------
  const orto = [['Arquivo', 'Aba', 'Célula', 'Texto da célula', 'Palavra', 'Sugestão', 'Outras opções']]
  for (const r of done) {
    for (const f of r.spelling ?? []) {
      const local = f.kind === 'sheet' ? '(nome da aba)' : f.cell
      const [first, ...rest] = f.suggestions ?? []
      orto.push([r.file.name, f.sheet, local, f.text, f.word, first ?? '', rest.join(', ')])
    }
  }
  appendSheet(wb, 'Ortografia', orto)

  // --- Nomes: uma linha por problema de nomenclatura ---------------------
  const nomes = [['Arquivo', 'Padrão', 'Bloco', 'Problema', 'Modelo de nome correto']]
  for (const r of done) {
    // Higiene independe de padrão — entra mesmo quando o nome casa o padrão.
    for (const is of r.hygiene ?? []) {
      nomes.push([r.file.name, 'higiene', is.label, is.message, ''])
    }
    if (!r.name || r.name.ok) continue
    const modelo = exampleFor(r.name.pattern)
    for (const is of r.name.issues) {
      const bloco = is.segment ? `Segmento ${is.segment}` : is.label
      nomes.push([r.file.name, r.name.pattern?.name ?? '—', bloco, is.message, modelo])
    }
  }
  appendSheet(wb, 'Nomes', nomes)

  // --- Duplicados: nome igual E conteúdo idêntico (cópia renomeada) -------
  const dups = [['Arquivo', 'Tipo', 'Colide com']]
  for (const g of findDuplicates(done.map((r) => r.file.name))) {
    const tipo = g.type === 'exact' ? 'nome idêntico' : 'mesmo documento'
    for (const f of g.files) dups.push([f, tipo, g.files.filter((x) => x !== f).join(', ')])
  }
  for (const g of findContentDuplicates(done.map((r) => ({ name: r.file.name, hash: r.hash })))) {
    for (const f of g.files) {
      const others = [...new Set(g.files.filter((n) => n !== f))]
      // Conteúdo igual com o MESMO nome já saiu acima; aqui só a cópia renomeada.
      if (others.length) dups.push([f, 'conteúdo idêntico', others.join(', ')])
    }
  }
  if (dups.length > 1) appendSheet(wb, 'Duplicados', dups)

  return wb
}

/** Remove a extensão para nomear o relatório a partir do arquivo auditado. */
const stripExt = (name) => name.replace(/\.[^.]+$/, '')

/**
 * Monta e baixa o relatório. `results` pode ser todos os arquivos (botão global)
 * ou um só (botão por arquivo). O nome do relatório sai do arquivo quando é um só.
 */
export function downloadAuditReport(results, { single = false } = {}) {
  const wb = buildAuditWorkbook(results)
  const filename =
    single && results[0]
      ? `${stripExt(results[0].file.name)} - auditoria.xlsx`
      : 'auditer-auditoria.xlsx'
  XLSX.writeFile(wb, filename)
}
