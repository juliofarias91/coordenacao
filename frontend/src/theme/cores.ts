/** A COR DE DESTAQUE ESCOLHÍVEL — o sistema de tema do VDCity, trazido.
 *
 *  Lá são duas preferências, e aqui também: a APARÊNCIA (claro · escuro · auto,
 *  que segue o sistema operacional) e a COR DE DESTAQUE, uma paleta de dez
 *  amostras. Lá isso vira `--primary` em canais HSL, porque o tema é shadcn;
 *  aqui vira a família `--accent*` que os tokens já declaram, porque as 25
 *  telas consomem esses nomes.
 *
 *  O QUE NÃO VEIO: o `hexToHsl` do VDCity escreve UM valor e pronto. Aqui a
 *  família tem cinco membros (`--accent`, `-hover`, `-ink`, `-soft`, `-soft-2`)
 *  e os valores dela DIFEREM ENTRE OS TEMAS — no claro o accent é escuro e o
 *  hover escurece mais; no escuro é claro e o hover clareia. Escrever só
 *  `--accent` deixaria o hover do botão primário na cor antiga e o texto branco
 *  sobre um amarelo. Por isso aqui se derivam os cinco, e por tema.
 *
 *  O DEFAULT NÃO É CALCULADO. Quando a escolha é o azul da SPBIM, esta função
 *  APAGA as propriedades inline e deixa o `tokens.css` governar — o par
 *  #2547b0/#6e8cf2 foi validado à mão para os dois temas, e recalculá-lo por
 *  fórmula só o afastaria do que já se conferiu. Fórmula é para o que a pessoa
 *  escolher depois.
 */

export type Aparencia = 'light' | 'dark' | 'auto'

/** O hex `null` é a marca: "sem escolha, use o token validado". */
export type Accent = string | null

/** A paleta do VDCity (`navbar-panels.jsx`, `ACCENT_PRESETS`), com uma troca:
 *  o azul da SPBIM entra em primeiro, como default, e o `#2563eb` ("Royal")
 *  sai — ele ficava entre o `#3b82f6` e o azul da marca, e três azuis quase
 *  iguais numa fileira de dez viram uma escolha que não se consegue fazer. */
export const ACCENTS: Array<{ hex: Accent; pt: string; en: string }> = [
  { hex: null, pt: 'SPBIM', en: 'SPBIM' },
  { hex: '#3b82f6', pt: 'Azul', en: 'Blue' },
  { hex: '#6366f1', pt: 'Anil', en: 'Indigo' },
  { hex: '#0ea5e9', pt: 'Céu', en: 'Sky' },
  { hex: '#a855f7', pt: 'Violeta', en: 'Violet' },
  { hex: '#ec4899', pt: 'Rosa', en: 'Pink' },
  { hex: '#f97316', pt: 'Laranja', en: 'Orange' },
  { hex: '#14b8a6', pt: 'Petróleo', en: 'Teal' },
  { hex: '#10b981', pt: 'Menta', en: 'Mint' },
  { hex: '#a8a29e', pt: 'Cinza', en: 'Grey' },
]

/** O que a amostra "SPBIM" pinta na tela — os valores que o `tokens.css`
 *  declara para cada tema. Só para o disco de cor do seletor: quem manda na
 *  aplicação é a ausência de propriedade inline. */
export const ACCENT_PADRAO: Record<'light' | 'dark', string> = {
  light: '#2547b0',
  dark: '#6e8cf2',
}

/** As cinco propriedades que a escolha reescreve. Ficam numa lista para que
 *  limpar e aplicar percorram exatamente o mesmo conjunto — um nome a mais no
 *  aplicar e a menos no limpar deixaria um resíduo da cor anterior. */
const PROPS = [
  '--accent',
  '--accent-ink',
  '--accent-hover',
  '--accent-soft',
  '--accent-soft-2',
] as const

type Rgb = [number, number, number]

function paraRgb(hex: string): Rgb | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!m) return null
  return [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)]
}

function paraHsl([r, g, b]: Rgb): [number, number, number] {
  const R = r / 255
  const G = g / 255
  const B = b / 255
  const max = Math.max(R, G, B)
  const min = Math.min(R, G, B)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === R) h = (G - B) / d + (G < B ? 6 : 0)
  else if (max === G) h = (B - R) / d + 2
  else h = (R - G) / d + 4
  return [h / 6, s, l]
}

function deHsl(h: number, s: number, l: number): Rgb {
  if (s === 0) {
    const v = Math.round(l * 255)
    return [v, v, v]
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const canal = (t: number) => {
    let x = t
    if (x < 0) x += 1
    if (x > 1) x -= 1
    if (x < 1 / 6) return p + (q - p) * 6 * x
    if (x < 1 / 2) return q
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6
    return p
  }
  return [
    Math.round(canal(h + 1 / 3) * 255),
    Math.round(canal(h) * 255),
    Math.round(canal(h - 1 / 3) * 255),
  ]
}

function hex(rgb: Rgb): string {
  return '#' + rgb.map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('')
}

const limitar = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))

/** Luminância relativa (WCAG) — decide se o texto SOBRE a cor é branco ou
 *  preto. Sem isto, um accent claro como o `#14b8a6` ficaria com rótulo branco
 *  no `.btn.pri` e o botão sairia ilegível. */
function luminancia([r, g, b]: Rgb): number {
  const c = [r, g, b].map((v) => {
    const x = v / 255
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
  }) as Rgb
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}

/** A família `--accent*` para um hex escolhido, no tema resolvido.
 *
 *  A LUMINOSIDADE É ANCORADA, não usada como veio. As dez amostras foram
 *  desenhadas para um fundo shadcn e cobrem de `l=41%` (menta) a `l=63%`
 *  (cinza); soltas, a menta some no escuro e o cinza some no claro. O piso e o
 *  teto de cada tema são o que faz qualquer escolha continuar legível nos dois
 *  — é a mesma ideia da paleta de macrodisciplina, que tem banda de
 *  luminosidade justamente por isso.
 */
function familia(escolhido: string, escuro: boolean): Record<string, string> | null {
  const rgb = paraRgb(escolhido)
  if (!rgb) return null

  const [h, s, l0] = paraHsl(rgb)
  const l = escuro ? limitar(l0, 0.58, 0.76) : limitar(l0, 0.28, 0.5)
  const base = deHsl(h, s, l)

  // O hover anda na direção do CONTRASTE com o fundo: no claro escurece, no
  // escuro clareia. É o que os tokens validados fazem (#2547b0 → #1d3a92 no
  // claro, #6e8cf2 → #8aa2f5 no escuro).
  const hover = deHsl(h, s, escuro ? Math.min(l + 0.09, 0.86) : Math.max(l - 0.09, 0.14))

  // Alfas do `tokens.css`: /10 e /16 no claro, /14 e /22 no escuro. O escuro
  // precisa de mais porque o translúcido cai sobre 6-11% de luminância.
  const [r, g, b] = base
  const soft = escuro ? 0.14 : 0.1
  const soft2 = escuro ? 0.22 : 0.16

  return {
    '--accent': hex(base),
    '--accent-ink': luminancia(base) > 0.45 ? '#101010' : '#ffffff',
    '--accent-hover': hex(hover),
    '--accent-soft': `rgb(${r} ${g} ${b} / ${soft})`,
    '--accent-soft-2': `rgb(${r} ${g} ${b} / ${soft2})`,
  }
}

/** Escreve (ou apaga) a cor de destaque no `<html>`.
 *
 *  Inline no elemento raiz de propósito: é a única camada que ganha do
 *  `tokens.css` sem precisar de `!important`, e apagar a propriedade devolve o
 *  controle ao arquivo sem deixar rastro. */
export function aplicarAccent(escolhido: Accent, escuro: boolean): void {
  const raiz = document.documentElement
  const vars = escolhido ? familia(escolhido, escuro) : null
  for (const prop of PROPS) {
    if (vars) raiz.style.setProperty(prop, vars[prop]!)
    else raiz.style.removeProperty(prop)
  }
}

/** A cor que a amostra escolhida pinta no tema atual — o que o seletor mostra
 *  como "esta é a sua". */
export function corVisivel(escolhido: Accent, escuro: boolean): string {
  if (!escolhido) return ACCENT_PADRAO[escuro ? 'dark' : 'light']
  const vars = familia(escolhido, escuro)
  return vars?.['--accent'] ?? escolhido
}
