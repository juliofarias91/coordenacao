/** Extração dos textos auditáveis de uma planilha (SheetJS).
 *
 *  Escopo: conteúdo textual das células + nome das abas. Fórmula, número e data
 *  ficam de fora — o valor calculado de uma fórmula não é algo que o autor
 *  digitou, e apontar erro nele mandaria corrigir o lugar errado.
 */
import type { EntradaTexto } from './useSpellChecker'

export function extractTexts(
  input: ArrayBuffer | File,
): Promise<{ sheetCount: number; entries: EntradaTexto[] }>
