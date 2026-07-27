import * as XLSX from 'xlsx'

/**
 * Extrai os textos auditáveis de uma pasta de trabalho.
 *
 * Escopo: conteúdo textual das células + nome das abas. Fórmulas, números e
 * datas ficam de fora — o valor calculado de uma fórmula não é algo que o autor
 * digitou, e apontar erro nele mandaria o usuário corrigir o lugar errado.
 */

/** Uma célula só interessa se o autor digitou texto nela. */
function isAuditableCell(cell) {
  if (!cell) return false
  if (cell.f) return false // fórmula: o texto vive na origem, não aqui
  if (cell.t !== 's') return false // s = string; n/d/b/e são número, data, bool, erro
  return typeof cell.v === 'string' && cell.v.trim().length > 0
}

export async function extractTexts(input) {
  // Aceita um ArrayBuffer (já lido em Auditoria para o hash de conteúdo) ou um
  // File — evita ler o mesmo arquivo do disco duas vezes.
  const buffer = input instanceof ArrayBuffer ? input : await input.arrayBuffer()
  const wb = XLSX.read(buffer, { type: 'array', cellFormula: true, cellText: false, cellDates: true })

  const entries = []

  for (const sheetName of wb.SheetNames) {
    entries.push({ kind: 'sheet', sheet: sheetName, cell: null, text: sheetName })

    const ws = wb.Sheets[sheetName]
    if (!ws || !ws['!ref']) continue

    const range = XLSX.utils.decode_range(ws['!ref'])
    for (let r = range.s.r; r <= range.e.r; r++) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        const addr = XLSX.utils.encode_cell({ r, c })
        const cell = ws[addr]
        if (!isAuditableCell(cell)) continue
        entries.push({ kind: 'cell', sheet: sheetName, cell: addr, text: cell.v })
      }
    }
  }

  return { sheetCount: wb.SheetNames.length, entries }
}
