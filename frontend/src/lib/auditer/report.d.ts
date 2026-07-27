/** Exportação da auditoria como planilha.
 *
 *  Gera uma planilha NOVA (Resumo/Ortografia/Nomes) fixando cada erro na célula
 *  exata. Não reescreve o arquivo original de propósito: o SheetJS CE não
 *  preserva dropdown, tabela nem PROCV ao regravar, e as planilhas de controle
 *  dependem disso.
 */
import type { ProblemaNome, VeredictoNome } from './patterns'
import type { OcorrenciaOrtografia } from './useSpellChecker'

/** Um arquivo auditado. É o tipo que circula por toda a tela de auditoria. */
export type ResultadoArquivo = {
  id: number
  file: File
  status: 'pending' | 'done'
  /** null = nenhum padrão cadastrado, o nome não foi conferido. */
  name?: VeredictoNome | null
  /** Problemas que independem de padrão (espaço duplo, caractere inválido…). */
  hygiene?: ProblemaNome[]
  hash?: string | null
  spelling?: OcorrenciaOrtografia[] | null
  /** 'not-excel' = ortografia não se aplica; qualquer outro valor é falha real. */
  spellError?: string | null
}

export function buildAuditWorkbook(results: ResultadoArquivo[]): unknown
export function downloadAuditReport(
  results: ResultadoArquivo[],
  opcoes?: { single?: boolean },
): void
