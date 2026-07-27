/** Tipos do motor de nomenclatura portado do Auditer.
 *
 *  O `patterns.js` ao lado é JavaScript de propósito: veio inteiro do Auditer,
 *  tem suíte própria (`npm test`) e os casos de borda que o sustentam — mês 13,
 *  29/02 em ano não bissexto, extensão dupla, contagem de segmentos — já foram
 *  pagos ali. Este arquivo dá tipo a ele sem tocar no comportamento.
 *
 *  Diferença para o padrão de nomenclatura do backend (`schemas/standard.py`):
 *  lá um segmento é `{k, vals, opcional}` e o separador é sempre `-`. Aqui cada
 *  segmento carrega o **seu** separador e tem tipo (data, número, texto), o que
 *  expressa nomes de separador misturado — `Spec Audit LOD400-COL1_PLMB-DATA`.
 *  É um superconjunto: todo padrão do backend cabe aqui, o contrário não.
 */

export type TipoSegmento = 'literal' | 'list' | 'date' | 'number' | 'text' | 'any'
export type Charset = 'alnum' | 'alpha' | 'upper' | 'any'

export type SegmentoPadrao = {
  id: string
  type: TipoSegmento
  label: string
  /** Separador que liga este bloco ao anterior. Vazio no primeiro. */
  sep: string
  value?: string
  caseSensitive?: boolean
  values?: string[]
  format?: string
  digits?: number
  exactDigits?: boolean
  charset?: Charset
  minLen?: number
  maxLen?: number
}

export type Padrao = {
  id: string
  name: string
  extensions: string[]
  segments: SegmentoPadrao[]
  /** Formato antigo (separador global). `normalizePattern` migra. */
  delimiter?: string
}

/** `segment` é o índice 1-based do bloco, ou null quando o problema é do nome
 *  inteiro (extensão, sobra, higiene). */
export type ProblemaNome = {
  segment: number | null
  label: string
  message: string
}

export type VeredictoNome = {
  ok: boolean
  issues: ProblemaNome[]
  pattern: Padrao
}

export type DuplicidadeNome = {
  key: string
  /** 'exact' = mesmo nome · 'documento' = `X.pdf` vs `X.xlsx.pdf` */
  type: 'exact' | 'documento'
  files: string[]
}

export type DuplicidadeConteudo = { hash: string; files: string[] }

export const SEGMENT_TYPES: Record<
  TipoSegmento,
  { label: string; hint: string; defaults: () => Record<string, unknown> }
>
export const DATE_FORMATS: string[]
export const SEPARATORS: Array<{ value: string; label: string }>

export function newSegment(type?: TipoSegmento, sep?: string): SegmentoPadrao
export function newPattern(): Padrao
export function changeSegmentType(segment: SegmentoPadrao, type: TipoSegmento): SegmentoPadrao
export function normalizePattern(p: Padrao): Padrao
export function describeSegment(seg: SegmentoPadrao): string
export function segmentRegexSource(seg: SegmentoPadrao): string
export function patternToRegex(p: Padrao): string
export function exampleFor(p: Padrao): string
export function lintPattern(p: Padrao): string[]
export function validateName(filename: string, pattern: Padrao): VeredictoNome
export function matchBestPattern(filename: string, patterns: Padrao[]): VeredictoNome | null
export function findDuplicates(filenames: string[]): DuplicidadeNome[]
export function checkFilenameHygiene(filename: string): ProblemaNome[]
export function findContentDuplicates(
  files: Array<{ name: string; hash: string | null | undefined }>,
): DuplicidadeConteudo[]
export function accPresetPatterns(): Padrao[]
