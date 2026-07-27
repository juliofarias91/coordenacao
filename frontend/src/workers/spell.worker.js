/**
 * Corretor ortográfico bilíngue (pt-BR + inglês) fora da thread principal.
 *
 * Usa hunspell compilado em WebAssembly. A alternativa em JS puro (nspell) foi
 * medida com este mesmo dicionário e não serve: o pt-BR tem 312 mil radicais e
 * ela leva ~45 s e mais de 2 GB de heap só para construir — o wasm faz em ~1 s
 * com ~8 MB. O dicionário ainda soma ~5,5 MB e é lido uma vez por sessão, então
 * mesmo rápido ele fica aqui, fora da thread da UI.
 *
 * Bilíngue de propósito: as planilhas do ACC misturam português com termos
 * técnicos em inglês, então uma palavra só é ERRO quando falha nos DOIS idiomas.
 * O inglês é opcional — se o dicionário não carregar, degrada para só-pt em vez
 * de derrubar a auditoria inteira.
 */
import { loadModule } from 'hunspell-asm'

let spellers = null // { pt: Hunspell, en: Hunspell | null }

/** Termos de obra/BIM que o dicionário pt-BR não traz mas são corretos aqui. */
const DOMAIN_WORDS = [
  // siglas técnicas
  'BIM', 'IFC', 'CAD', 'DWG', 'RVT', 'NBR', 'ABNT', 'CNPJ', 'CPF', 'ART', 'RRT',
  // termos de obra/arquitetura
  'layout', 'briefing', 'checklist', 'hall', 'deck', 'pergolado', 'shaft',
  'mezanino', 'contrapiso', 'drywall', 'shopping', 'container', 'pilotis',
  // softwares/marcas do fluxo BIM — nomes próprios, não vivem em dicionário
  'Revit', 'Navisworks', 'Autodesk', 'AutoCAD', 'Civil3D', 'ReCap', 'Dynamo',
  'Rhino', 'SketchUp', 'Tekla', 'ArchiCAD', 'Solibri', 'Bluebeam', 'Twinmotion',
  'Lumion', 'Enscape', 'Trimble', 'Bentley', 'MicroStation', 'Grasshopper',
  // extensões de arquivo que às vezes aparecem soltas numa célula (sem o ponto)
  'nwc', 'nwd', 'nwf', 'ifc', 'rvt', 'rfa', 'rte', 'dwg', 'dwf', 'dgn', 'dxf',
  'skp', 'rcp', 'rcs', 'fbx', 'obj', 'pln', 'txt', 'csv', 'pdf', 'xlsx', 'docx',
]

/**
 * Tokeniza guardando a posição, para destacar o trecho exato depois.
 * Hífen e apóstrofo entram na palavra: "guarda-corpo" é uma palavra só.
 */
function tokenize(text) {
  const tokens = []
  const re = /[\p{L}][\p{L}'’-]*/gu
  let m
  while ((m = re.exec(text)) !== null) tokens.push({ word: m[0], index: m.index })
  return tokens
}

/**
 * Recorta uma JANELA de contexto em volta da palavra apontada. Antes o texto era
 * cortado nos primeiros 160 caracteres a partir do início — quando a palavra
 * errada estava lá pro fim de um texto longo, ela caía fora do trecho e o realce
 * se perdia. Aqui o trecho é centrado na palavra (≈90 de cada lado) e o índice é
 * recalculado para a posição dentro do recorte, para o realce continuar certo.
 */
const CONTEXT = 90
function contextSnippet(text, index, wordLen) {
  if (text.length <= 2 * CONTEXT + wordLen) return { text, index }
  const start = Math.max(0, index - CONTEXT)
  const end = Math.min(text.length, index + wordLen + CONTEXT)
  const pre = start > 0 ? '…' : ''
  const post = end < text.length ? '…' : ''
  return { text: pre + text.slice(start, end) + post, index: pre.length + (index - start) }
}

/**
 * Filtra o que não é português a auditar. Sem isto uma planilha de engenharia
 * vira um mar de falso positivo: todo código de ambiente e toda sigla acusariam erro.
 */
function shouldSkip(word, opts, ignoreSet) {
  if (word.length < opts.minLength) return true
  if (/\d/.test(word)) return true // A-01, P1, 30m
  if (ignoreSet.has(word.toLowerCase())) return true
  // Texto TODO em maiúsculas nas planilhas do ACC é rótulo/sigla/código/nome de
  // arquivo — nunca prosa a revisar. Ex.: PLMB, BLACKBOX, ANALYSING (termo técnico
  // em inglês que o en_US não tem), EPMS-DEVS-DATA-R (pedaço de nome de arquivo).
  // Auditar isso só gera ruído: o corretor sugere português para termo técnico em
  // inglês (BLACKBOX → BOLACHÃO). Por isso pula QUALQUER token todo-CAPS.
  // Tradeoff aceito: uma palavra pt em CAPS sem acento (VALIDACAO) também escapa —
  // na prática vale muito mais eliminar a enxurrada de falso-positivo. Códigos com
  // dígito e tokens colados após ponto já saíram nas regras anteriores.
  if (opts.ignoreUppercase && word === word.toLocaleUpperCase() && word !== word.toLocaleLowerCase()) return true
  if (opts.ignoreCamelCase && /^[A-ZÀ-Ý][a-zà-ÿ]+[A-ZÀ-Ý]/.test(word)) return true // nomeDeCampo
  return false
}

/**
 * Planilhas repetem muito texto e suggest() custa ~300 ms por palavra — sem
 * cache, uma coluna com o mesmo erro 200 vezes levaria um minuto sozinha.
 */
const cache = new Map()

// Aceita a palavra como está ou em minúscula: o dicionário tem "porta" mas não
// "Porta", e começo de frase não é erro de ortografia.
const knows = (h, word) => !!h && (h.spell(word) || h.spell(word.toLowerCase()))

function checkWord(word) {
  const key = word.toLowerCase()
  const hit = cache.get(key)
  if (hit) return hit

  // Só é erro se NENHUM dos idiomas conhece a palavra.
  const ok = knows(spellers.pt, word) || knows(spellers.en, word)

  let suggestions = []
  if (!ok) {
    // Sugere primeiro em pt; completa com inglês só se faltar, para não pagar
    // dois suggest() (~300 ms cada) quando o pt já basta. Sem repetir.
    suggestions = spellers.pt.suggest(word).slice(0, 4)
    if (suggestions.length < 4 && spellers.en) {
      for (const s of spellers.en.suggest(word)) {
        if (suggestions.length >= 4) break
        if (!suggestions.includes(s)) suggestions.push(s)
      }
    }
  }

  const result = { ok, suggestions }
  cache.set(key, result)
  return result
}

async function init() {
  const fetchDict = async (name) => {
    let r
    try {
      r = await fetch(`/dictionaries/${name}`)
    } catch {
      const e = new Error(`não foi possível buscar ${name}`)
      e.dictionary = true
      throw e
    }
    if (!r.ok) {
      const e = new Error(`dicionário ${name} não encontrado (${r.status})`)
      e.dictionary = true
      throw e
    }
    return r.arrayBuffer()
  }

  // Cada idioma em sua PRÓPRIA instância wasm. Uma única instância com dois
  // create() funciona no Node, mas sob o build CJS do hunspell no browser a 2ª
  // criação pode falhar em silêncio (o inglês some e tudo vira "erro"). Isolar
  // remove essa classe de bug de vez.
  // O hunspell lê a codificação do próprio .aff (`SET UTF-8`): entrega os bytes crus.
  const build = async (lang) => {
    const factory = await loadModule()
    const [aff, dic] = await Promise.all([fetchDict(`${lang}.aff`), fetchDict(`${lang}.dic`)])
    const affPath = factory.mountBuffer(new Uint8Array(aff), `${lang}.aff`)
    const dicPath = factory.mountBuffer(new Uint8Array(dic), `${lang}.dic`)
    return factory.create(affPath, dicPath)
  }

  // pt-BR é a base e precisa carregar; o inglês é complementar e opcional.
  const pt = await build('pt_BR')
  for (const w of DOMAIN_WORDS) pt.addWord(w)

  let en = null
  try {
    en = await build('en_US')
  } catch (err) {
    // Sem o dicionário inglês seguimos só com pt — melhor que quebrar tudo.
    console.warn('[spell] dicionário inglês indisponível, auditando só em pt-BR:', err?.message ?? err)
  }

  spellers = { pt, en }
}

let initPromise = null
const ensureReady = () => (initPromise ??= init())

self.onmessage = async (event) => {
  const msg = event.data

  if (msg.type === 'init') {
    try {
      await ensureReady()
      // Reporta os idiomas realmente carregados — a UI mostra isso para que uma
      // falha do inglês seja visível, nunca um erro silencioso.
      const langs = ['pt', spellers.en && 'en'].filter(Boolean)
      self.postMessage({ type: 'ready', langs })
    } catch (err) {
      // Zera a memoização para que um retry do worker tente carregar de novo.
      initPromise = null
      self.postMessage({ type: 'error', message: err?.message ?? String(err), dictionary: !!err?.dictionary })
    }
    return
  }

  if (msg.type === 'check') {
    const { id, entries, options } = msg
    try {
      await ensureReady()

      const opts = { minLength: 3, ignoreUppercase: true, ignoreCamelCase: true, ...options }
      const ignoreSet = new Set((options?.ignoreWords ?? []).map((w) => w.trim().toLowerCase()).filter(Boolean))
      for (const w of DOMAIN_WORDS) ignoreSet.add(w.toLowerCase())

      const findings = []
      for (const entry of entries) {
        for (const { word, index } of tokenize(entry.text)) {
          // Token colado logo após um ponto = extensão de arquivo, caminho ou
          // domínio (…DATA-R24.nwc, arquivo.txt, www.site). Prosa sempre tem
          // espaço depois do ponto, então isto não engole texto de verdade.
          if (index > 0 && entry.text[index - 1] === '.') continue
          if (shouldSkip(word, opts, ignoreSet)) continue
          const { ok, suggestions } = checkWord(word)
          if (ok) continue
          const snip = contextSnippet(entry.text, index, word.length)
          findings.push({
            word,
            index: snip.index,
            suggestions,
            kind: entry.kind,
            sheet: entry.sheet,
            cell: entry.cell,
            text: snip.text,
          })
        }
      }

      self.postMessage({ type: 'result', id, findings })
    } catch (err) {
      self.postMessage({ type: 'error', id, message: err?.message ?? String(err) })
    }
  }
}
