/**
 * Modelo de padrão de nomenclatura por blocos, com SEPARADOR POR POSIÇÃO.
 *
 * Um nome é uma sequência de segmentos; cada segmento carrega o separador (`sep`)
 * que o liga ao anterior. Isso permite estruturas com separadores misturados numa
 * mesma linha — o que uma única "delimitador global" não expressa. Ex.:
 *
 *   Spec Audit LOD400-COL1_PLMB-PLMB-DATA.pdf
 *   [literal ]         [nº][-][list][_][list][-][list][-][list] . pdf
 *
 * A validação é feita por caminhada ancorada (um cursor anda pelo nome consumindo
 * separador + segmento), o que dá mensagens precisas do tipo "esperava '_' antes
 * de Projeto" ou "COL9 não está na lista", em vez de um "não bate com o padrão".
 */

export const SEGMENT_TYPES = {
  literal: {
    label: 'Texto fixo',
    hint: 'Precisa ser exatamente este texto (pode conter espaços).',
    defaults: () => ({ value: '', caseSensitive: false }),
  },
  list: {
    label: 'Lista de valores',
    hint: 'Aceita apenas um dos valores informados.',
    defaults: () => ({ values: [], caseSensitive: false }),
  },
  date: {
    label: 'Data',
    hint: 'Confere o formato e se a data existe de verdade.',
    defaults: () => ({ format: 'AAAAMMDD' }),
  },
  number: {
    label: 'Número',
    hint: 'Sequência de dígitos, com contagem exata opcional.',
    defaults: () => ({ digits: 3, exactDigits: true }),
  },
  text: {
    label: 'Texto livre',
    hint: 'Qualquer texto, com limites de tamanho opcionais.',
    defaults: () => ({ charset: 'alnum', minLen: 1, maxLen: 0 }),
  },
  any: {
    label: 'Qualquer coisa',
    hint: 'Aceita qualquer conteúdo não vazio.',
    defaults: () => ({}),
  },
}

export const DATE_FORMATS = ['AAAAMMDD', 'AAAA-MM-DD', 'AAAA_MM_DD', 'DDMMAAAA', 'DD-MM-AAAA', 'DD.MM.AAAA', 'AAAAMM', 'AAMMDD']

export const SEPARATORS = [
  { value: '', label: '(colado)' },
  { value: '_', label: 'underline  _' },
  { value: '-', label: 'hífen  -' },
  { value: ' ', label: 'espaço' },
  { value: '.', label: 'ponto  .' },
]

const CHARSETS = {
  alnum: { re: '[A-Za-zÀ-ÿ0-9-]+', label: 'letras, números e hífen' },
  alpha: { re: '[A-Za-zÀ-ÿ]+', label: 'apenas letras' },
  upper: { re: '[A-Z0-9]+', label: 'maiúsculas e números' },
  any: { re: '.+', label: 'qualquer caractere' },
}

/** Extensões "de escritório" que, quando aparecem ANTES da extensão final,
 *  denunciam um nome tipo `arquivo.xlsx.pdf` — a dor clássica no ACC. */
const OFFICE_EXTS = ['xlsx', 'xlsm', 'xls', 'docx', 'doc', 'pptx', 'ppt', 'pdf', 'dwg', 'rvt']

const uid = () => Math.random().toString(36).slice(2, 10)

export function newSegment(type = 'list', sep = '_') {
  return { id: uid(), type, label: '', sep, ...SEGMENT_TYPES[type].defaults() }
}

export function newPattern() {
  return {
    id: uid(),
    name: 'Novo padrão',
    extensions: ['pdf'],
    segments: [
      { id: uid(), type: 'literal', label: '', sep: '', value: 'Documento', caseSensitive: false },
      newSegment('list', '_'),
    ],
  }
}

/** Muda o tipo preservando rótulo e separador, trocando os campos do tipo. */
export function changeSegmentType(segment, type) {
  return { id: segment.id, label: segment.label, sep: segment.sep ?? '', type, ...SEGMENT_TYPES[type].defaults() }
}

/**
 * Converte o formato antigo (um `delimiter` global, segmentos sem `sep`) para o
 * novo (separador por segmento). Idempotente — chamado ao carregar e ao validar.
 */
export function normalizePattern(p) {
  if (!p || !Array.isArray(p.segments)) return p
  const needs = p.segments.some((s) => s.sep === undefined)
  if (!needs) return p
  const delim = p.delimiter ?? '_'
  return {
    ...p,
    segments: p.segments.map((s, i) => ({ ...s, sep: s.sep ?? (i === 0 ? '' : delim) })),
  }
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/* ------------------------------------------------------------------ datas -- */

function compileDateFormat(format) {
  const tokens = []
  let re = ''
  let i = 0
  while (i < format.length) {
    if (format.startsWith('AAAA', i)) { re += '(\\d{4})'; tokens.push('AAAA'); i += 4 }
    else if (format.startsWith('AA', i)) { re += '(\\d{2})'; tokens.push('AA'); i += 2 }
    else if (format.startsWith('MM', i)) { re += '(\\d{2})'; tokens.push('MM'); i += 2 }
    else if (format.startsWith('DD', i)) { re += '(\\d{2})'; tokens.push('DD'); i += 2 }
    else { re += escapeRe(format[i]); i += 1 }
  }
  return { source: re, tokens, length: format.length }
}

function realDate(y, m, d) {
  if (m < 1 || m > 12) return false
  if (d < 1) return false
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return d <= days
}

function checkDateValue(value, format) {
  const { source, tokens } = compileDateFormat(format)
  const m = new RegExp(`^${source}$`).exec(value)
  if (!m) return `não está no formato ${format}`
  let year = null, month = null, day = null
  tokens.forEach((tk, idx) => {
    const n = Number(m[idx + 1])
    if (tk === 'AAAA') year = n
    else if (tk === 'AA') year = 2000 + n
    else if (tk === 'MM') month = n
    else if (tk === 'DD') day = n
  })
  if (month !== null && (month < 1 || month > 12)) return `mês "${String(month).padStart(2, '0')}" não existe`
  if (day !== null && !realDate(year ?? 2000, month ?? 1, day)) return `o dia ${day} não existe nesse mês`
  return null
}

/* -------------------------------------------------------------- descrição -- */

export function describeSegment(seg) {
  switch (seg.type) {
    case 'literal': return `"${seg.value || '(vazio)'}"`
    case 'list': return seg.values.filter(Boolean).length ? seg.values.filter(Boolean).join(' | ') : 'lista vazia'
    case 'date': return seg.format
    case 'number': return seg.exactDigits && seg.digits > 0 ? `${seg.digits} díg.` : 'número'
    case 'text': {
      const cs = CHARSETS[seg.charset]?.label ?? 'texto'
      return seg.maxLen > 0 ? `${cs} ${seg.minLen}–${seg.maxLen}` : cs
    }
    case 'any': return 'qualquer'
    default: return ''
  }
}

export function segmentRegexSource(seg) {
  switch (seg.type) {
    case 'literal': return escapeRe(seg.value)
    case 'list': {
      const vals = seg.values.filter(Boolean).map(escapeRe)
      return vals.length ? `(?:${vals.join('|')})` : '(?:)'
    }
    case 'date': return compileDateFormat(seg.format).source
    case 'number': return seg.exactDigits && seg.digits > 0 ? `\\d{${seg.digits}}` : '\\d+'
    case 'text': {
      const base = CHARSETS[seg.charset]?.re ?? CHARSETS.any.re
      if (seg.maxLen > 0) return `${base.replace(/\+$/, '')}{${Math.max(1, seg.minLen)},${seg.maxLen}}`
      return base
    }
    case 'any': return '.+'
    default: return '.+'
  }
}

export function patternToRegex(p) {
  const pattern = normalizePattern(p)
  const body = pattern.segments.map((s) => escapeRe(s.sep ?? '') + segmentRegexSource(s)).join('')
  const exts = (pattern.extensions ?? []).filter(Boolean).map(escapeRe)
  const ext = exts.length ? `\\.(?:${exts.join('|')})` : ''
  return `^${body}${ext}$`
}

export function exampleFor(p) {
  const pattern = normalizePattern(p)
  const parts = pattern.segments.map((seg) => {
    const sep = seg.sep ?? ''
    let v
    switch (seg.type) {
      case 'literal': v = seg.value || 'FIXO'; break
      case 'list': v = seg.values.find(Boolean) ?? 'VALOR'; break
      case 'date': v = seg.format.replace(/AAAA/g, '2026').replace(/AA/g, '26').replace(/MM/g, '07').replace(/DD/g, '17'); break
      case 'number': v = seg.exactDigits && seg.digits > 0 ? '1'.padStart(seg.digits, '0') : '42'; break
      case 'text': v = seg.label ? seg.label.replace(/\s+/g, '') : 'Texto'; break
      case 'any': v = 'livre'; break
      default: v = 'x'
    }
    return sep + v
  })
  const ext = (pattern.extensions ?? []).find(Boolean)
  return parts.join('') + (ext ? `.${ext}` : '')
}

export function lintPattern(p) {
  const pattern = normalizePattern(p)
  const issues = []
  if (!pattern.segments.length) issues.push('O padrão não tem nenhum segmento.')
  if (!(pattern.extensions ?? []).filter(Boolean).length) issues.push('Nenhuma extensão definida — qualquer extensão será aceita.')

  pattern.segments.forEach((seg, i) => {
    const n = `Segmento ${i + 1}`
    if (seg.type === 'list' && !seg.values.filter(Boolean).length) issues.push(`${n}: lista de valores está vazia.`)
    if (seg.type === 'literal' && !seg.value) issues.push(`${n}: o texto fixo está vazio.`)
    if (i === 0 && (seg.sep ?? '') !== '') issues.push(`${n}: o primeiro segmento não deveria ter separador antes dele.`)
    if (seg.type === 'date' && (seg.sep ?? '').length && seg.format.includes(seg.sep)) {
      issues.push(`${n}: o formato ${seg.format} contém o separador "${seg.sep}".`)
    }
    // Segmento colado (sep vazio) a partir do 2º só é seguro se o ANTERIOR tem
    // tamanho fixo; senão a caminhada não sabe onde um termina e o outro começa.
    if (i > 0 && (seg.sep ?? '') === '') {
      const prev = pattern.segments[i - 1]
      const prevVariable = prev.type === 'text' || prev.type === 'any' || (prev.type === 'number' && !prev.exactDigits)
      if (prevVariable) issues.push(`${n}: está colado a um segmento de tamanho variável — defina um separador ou fixe o tamanho do anterior.`)
    }
  })
  return issues
}

/* -------------------------------------------------------------- extensão -- */

/** Separa o nome na ÚLTIMA extensão e detecta extensão dupla (`x.xlsx.pdf`). */
function splitName(filename) {
  const dot = filename.lastIndexOf('.')
  if (dot <= 0) return { base: filename, ext: '', doubleExt: null }
  const base = filename.slice(0, dot)
  const ext = filename.slice(dot + 1)
  let doubleExt = null
  const inner = base.lastIndexOf('.')
  if (inner > 0) {
    const innerExt = base.slice(inner + 1).toLowerCase()
    if (OFFICE_EXTS.includes(innerExt)) doubleExt = `${innerExt}.${ext.toLowerCase()}`
  }
  return { base, ext, doubleExt }
}

/* -------------------------------------------------------- caminhada -- */

/** Índice do próximo separador não vazio a partir de `from` (ou fim do texto). */
function boundary(str, from, nextSep) {
  if (nextSep) {
    const idx = str.indexOf(nextSep, from)
    return idx === -1 ? str.length : idx
  }
  return str.length
}

/**
 * Tenta casar um segmento em `str` a partir de `pos`, limitado pelo próximo
 * separador. Retorna { len, value } se casou, ou { error, got } se não.
 */
function matchSegmentAt(seg, str, pos, nextSep) {
  const bound = boundary(str, pos, nextSep)
  const slice = str.slice(pos, bound)

  switch (seg.type) {
    case 'literal': {
      const val = seg.value ?? ''
      const hit = seg.caseSensitive
        ? str.startsWith(val, pos)
        : str.slice(pos, pos + val.length).toLowerCase() === val.toLowerCase()
      if (!hit) return { error: `esperava "${val}" aqui, veio "${slice}"`, got: slice }
      return { len: val.length, value: str.slice(pos, pos + val.length) }
    }
    case 'list': {
      const vals = seg.values.filter(Boolean)
      // Ordena do maior para o menor para não casar um prefixo curto por engano.
      const sorted = [...vals].sort((a, b) => b.length - a.length)
      for (const v of sorted) {
        const seg2 = str.slice(pos, pos + v.length)
        const eq = seg.caseSensitive ? seg2 === v : seg2.toLowerCase() === v.toLowerCase()
        // Só vale se o que vem depois é o próximo separador (ou o fim) — impede
        // "PLMB" casar dentro de "PLMBX".
        const after = pos + v.length
        const alignsNext = !nextSep ? true : str.startsWith(nextSep, after) || after === str.length
        if (eq && (nextSep ? alignsNext : true)) {
          if (!seg.caseSensitive && seg2 !== v) return { len: v.length, value: seg2, soft: `deveria ser escrito "${v}"` }
          return { len: v.length, value: seg2 }
        }
      }
      return { error: `"${slice}" não está na lista (${vals.join(', ') || 'vazia'})`, got: slice }
    }
    case 'number': {
      if (seg.exactDigits && seg.digits > 0) {
        const cand = str.slice(pos, pos + seg.digits)
        if (!/^\d+$/.test(cand)) return { error: `esperava ${seg.digits} dígito(s), veio "${slice}"`, got: slice }
        if (cand.length !== seg.digits) return { error: `"${cand}" tem ${cand.length} dígito(s), esperado ${seg.digits}`, got: cand }
        return { len: seg.digits, value: cand }
      }
      const m = /^\d+/.exec(slice)
      if (!m) return { error: `esperava um número, veio "${slice}"`, got: slice }
      return { len: m[0].length, value: m[0] }
    }
    case 'date': {
      const { length } = compileDateFormat(seg.format)
      const cand = str.slice(pos, pos + length)
      const err = checkDateValue(cand, seg.format)
      if (err) return { error: err, got: cand }
      return { len: length, value: cand }
    }
    case 'text': {
      const base = CHARSETS[seg.charset] ?? CHARSETS.any
      if (!slice) return { error: 'está vazio', got: slice }
      if (!new RegExp(`^${base.re}$`).test(slice)) return { error: `"${slice}" deve conter ${base.label}`, got: slice }
      if (seg.minLen > 0 && slice.length < seg.minLen) return { error: `"${slice}" é menor que ${seg.minLen} caractere(s)`, got: slice }
      if (seg.maxLen > 0 && slice.length > seg.maxLen) return { error: `"${slice}" passa de ${seg.maxLen} caractere(s)`, got: slice }
      return { len: slice.length, value: slice }
    }
    case 'any':
      if (!slice) return { error: 'está vazio', got: slice }
      return { len: slice.length, value: slice }
    default:
      return { len: slice.length, value: slice }
  }
}

const segLabel = (seg, i) => seg.label || (seg.type === 'literal' ? `Texto "${seg.value}"` : `${SEGMENT_TYPES[seg.type].label} ${i + 1}`)

/**
 * Valida um nome contra um padrão.
 * @returns {{ok, issues:[{segment,label,message}], pattern}}
 */
export function validateName(filename, patternRaw) {
  const pattern = normalizePattern(patternRaw)
  const issues = []
  const { base, ext, doubleExt } = splitName(filename)

  if (doubleExt) {
    issues.push({ segment: null, label: 'Extensão dupla', message: `o nome termina em ".${doubleExt}" — provável arquivo renomeado sem tirar a extensão antiga` })
  }

  const exts = (pattern.extensions ?? []).filter(Boolean)
  if (exts.length && !exts.some((e) => e.toLowerCase() === ext.toLowerCase())) {
    issues.push({
      segment: null,
      label: 'Extensão',
      message: ext ? `".${ext}" não é aceita (esperado: ${exts.map((e) => `.${e}`).join(', ')})` : 'o arquivo não tem extensão',
    })
  }

  // Se há extensão dupla, o `base` ainda contém ".<inner>"; a caminhada valida só
  // até onde o padrão descreve e reporta o resto como sobra — o que é coerente.
  let cursor = 0
  for (let i = 0; i < pattern.segments.length; i++) {
    const seg = pattern.segments[i]
    const sep = seg.sep ?? ''
    const nextSep = pattern.segments[i + 1]?.sep ?? ''

    if (sep) {
      if (!base.startsWith(sep, cursor)) {
        const near = base.slice(cursor, cursor + Math.max(sep.length + 4, 8))
        issues.push({ segment: i + 1, label: segLabel(seg, i), message: `esperava o separador "${sep}" antes deste bloco (veio "${near}")` })
        // Sem o separador, o alinhamento se perde: interrompe para não cascatear ruído.
        cursor = -1
        break
      }
      cursor += sep.length
    }

    const res = matchSegmentAt(seg, base, cursor, nextSep)
    if (res.error) {
      issues.push({ segment: i + 1, label: segLabel(seg, i), message: res.error })
      cursor = -1
      break
    }
    if (res.soft) {
      issues.push({ segment: i + 1, label: segLabel(seg, i), message: res.soft })
    }
    cursor += res.len
  }

  if (cursor >= 0 && cursor < base.length) {
    issues.push({ segment: null, label: 'Sobra', message: `sobrou "${base.slice(cursor)}" no fim do nome` })
  }

  return { ok: issues.length === 0, issues, pattern }
}

/** Testa o arquivo contra todos os padrões e devolve o melhor encaixe. */
export function matchBestPattern(filename, patterns) {
  if (!patterns.length) return null
  const results = patterns.map((p) => validateName(filename, p))
  const ok = results.find((r) => r.ok)
  if (ok) return ok
  return results.reduce((best, r) => (r.issues.length < best.issues.length ? r : best))
}

/* ------------------------------------------------------------ duplicidade -- */

/**
 * Agrupa nomes que colidem no ACC.
 * - 'exact': mesmo nome (ignorando maiúsculas) — conflito certo.
 * - 'documento': mesmo nome depois de remover uma extensão interna perdida, i.e.
 *   `X.pdf` e `X.xlsx.pdf` são o MESMO documento visto duas vezes.
 */
export function findDuplicates(filenames) {
  const norm = (n) => n.trim().toLowerCase()
  const docKey = (n) => {
    const low = norm(n)
    // remove ".<office-ext>" que não seja a extensão final
    return low.replace(new RegExp(`\\.(?:${OFFICE_EXTS.join('|')})(?=\\.)`, 'g'), '')
  }

  const groups = new Map()
  filenames.forEach((name) => {
    const kExact = norm(name)
    const kDoc = docKey(name)
    const key = kDoc
    if (!groups.has(key)) groups.set(key, { files: [], exactSet: new Set() })
    const g = groups.get(key)
    g.files.push(name)
    g.exactSet.add(kExact)
  })

  const dups = []
  for (const [key, g] of groups) {
    if (g.files.length < 2) continue
    dups.push({ key, type: g.exactSet.size === 1 ? 'exact' : 'documento', files: g.files })
  }
  return dups
}

/* ---------------------------------------------------------- higiene -- */

/**
 * Problemas de nome que INDEPENDEM de qualquer padrão — valem para todo arquivo
 * (PDF, xlsx, dwg…), inclusive os que casam um padrão. São exatamente as coisas
 * que passam despercebidas ao olho mas quebram o ACC/sincronização: dois nomes
 * que "parecem iguais" mas diferem por um espaço a mais, ou um espaço/ponto
 * pendurado no fim que o servidor trata como outro arquivo.
 *
 * Retorna a mesma forma de `issue` de validateName ({segment, label, message}),
 * com segment: null (não pertence a um bloco do padrão).
 */
export function checkFilenameHygiene(filename) {
  const issues = []
  const { base } = splitName(filename)

  // Caracteres que o Windows/ACC rejeitam ou tratam mal num nome de arquivo.
  const bad = filename.match(/[\\/:*?"<>|]/g)
  if (bad) {
    const uniq = [...new Set(bad)].map((c) => `"${c}"`).join(', ')
    issues.push({ segment: null, label: 'Caractere inválido', message: `contém ${uniq} — o Windows/ACC não aceitam esses caracteres no nome` })
  }

  if (/ {2,}/.test(filename)) {
    issues.push({ segment: null, label: 'Espaço duplo', message: 'há dois ou mais espaços seguidos — some ao olho, mas conta como um nome diferente' })
  }

  // Espaço no começo/fim do nome, ou logo antes da extensão ("relatório .pdf").
  if (/^\s|\s$/.test(filename) || /\s$/.test(base)) {
    issues.push({ segment: null, label: 'Espaço nas bordas', message: 'o nome começa ou termina com espaço (inclusive antes da extensão)' })
  }

  // Ponto pendurado no fim do bloco ("Relatório..pdf" ou "Relatório.").
  if (/\.$/.test(base) || /\.{2,}/.test(filename)) {
    issues.push({ segment: null, label: 'Ponto sobrando', message: 'há um ponto pendurado ou pontos repetidos no nome' })
  }

  return issues
}

/**
 * Agrupa arquivos com CONTEÚDO idêntico (mesmo hash), mesmo que tenham nomes
 * diferentes — o caso que `findDuplicates` (só nome) não pega: uma cópia salva
 * com outro nome. `files` é [{ name, hash }]; itens sem hash são ignorados
 * (o ambiente pode não ter crypto.subtle, e aí a auditoria de nome segue normal).
 */
export function findContentDuplicates(files) {
  const groups = new Map()
  for (const f of files) {
    if (!f.hash) continue
    if (!groups.has(f.hash)) groups.set(f.hash, [])
    groups.get(f.hash).push(f.name)
  }
  const dups = []
  for (const [hash, names] of groups) {
    if (names.length < 2) continue
    dups.push({ hash, files: names })
  }
  return dups
}

/* -------------------------------------------------------- preset ACC -- */

/**
 * Modelo da convenção mostrada pelo usuário (auditorias BIM → ACC). Três padrões,
 * porque o tipo de documento muda a estrutura (só "Spec Audit" tem o trecho LOD).
 * Todos os valores são editáveis na tela de Padrões — isto é só um ponto de partida.
 */
export function accPresetPatterns() {
  const L = (value) => ({ id: uid(), type: 'literal', label: '', sep: '', value, caseSensitive: false })
  const list = (label, values, sep) => ({ id: uid(), type: 'list', label, sep, values, caseSensitive: false })

  const codeA = ['PLMB', 'SCTY']
  const codeB = ['PLMB', 'DIES', 'DEVS']
  const codeC = ['DATA', 'SITE']

  const tail = (firstSep) => [
    list('Projeto', codeA, firstSep),
    list('Disciplina', codeB, '-'),
    list('Tipo', codeC, '-'),
  ]

  return [
    {
      id: uid(),
      name: 'Spec Audit',
      extensions: ['pdf'],
      segments: [
        L('Spec Audit LOD'),
        { id: uid(), type: 'list', label: 'LOD', sep: '', values: ['300', '400', '500'], caseSensitive: false },
        list('Código', ['ADMN', 'COL1', 'COL2', 'COL3', 'SITE', 'UTLS'], '-'),
        ...tail('_'),
      ],
    },
    {
      id: uid(),
      name: '4D Parameter Audit',
      extensions: ['pdf'],
      segments: [L('4D Parameter Audit'), ...tail('_')],
    },
    {
      id: uid(),
      name: 'Relatório de Auditoria',
      extensions: ['pdf'],
      segments: [L('Relatório de Auditoria'), ...tail('_')],
    },
  ]
}
