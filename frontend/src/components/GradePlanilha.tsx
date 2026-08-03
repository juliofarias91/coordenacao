/** A GRADE — a planilha como planilha, com célula editável por TIPO de coluna.
 *
 *  É o esqueleto visual do recorte de auditoria: calha de números à esquerda,
 *  cabeçalho em cima, célula com contorno de 1px nos quatro lados, rolagem com
 *  as duas réguas grudadas nos seus eixos.
 *
 *  POR QUE PLANILHA E NÃO TABELA DO SISTEMA. O que esta tela substitui são
 *  arquivos .xlsx que a coordenação preenche à mão, e quem vai usá-la passou anos
 *  naquelas abas. Uma tabela espaçada e sem calha não é "mais limpa" para esse
 *  leitor: é um lugar onde ele não sabe contar linha nem nomear coluna.
 *
 *  A GRADE TEM DOIS MODOS, e a diferença entre eles é ter ou não um MODELO.
 *
 *  - **Ligada** (`dados` + `onSalvar`): cada linha é um `resultado_check` e cada
 *    célula editável grava nele. É o que se vê ao escolher um modelo no painel
 *    da esquerda. O valor exibido vem SEMPRE do servidor — a grade não guarda
 *    resposta própria, senão a tela e o banco divergiriam no primeiro erro de
 *    rede.
 *  - **Prévia** (`celulas`, sem `onSalvar`): o gabarito do recorte, sem modelo.
 *    Aqui não há linha no banco em que gravar — auditoria pertence a um modelo —,
 *    então as células editáveis ficam TRAVADAS em vez de aceitarem texto que
 *    ninguém guardaria. Um campo que aceita o que digitam e perde no refresh é
 *    pior do que um campo desabilitado: o segundo diz a verdade.
 *
 *  A CÉLULA MUDA COM A COLUNA, não com a linha. `Coluna.tipo` é o que decide se
 *  ela é lista, texto, anexo ou conta — e é isso que permite a mesma grade servir
 *  aos cinco recortes com colunas diferentes sem um `if` por recorte aqui dentro.
 */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useI18n } from '@/i18n'

/** O nome da coluna como Excel a escreve: A…Z, AA, AB…
 *
 *  Base 26 sem zero — 'Z' é 26 e 'AA' é 27, não 26. O `-1` a cada volta é o que
 *  corrige isso; sem ele a 27ª coluna sai 'BA'. */
function letraDaColuna(indice: number): string {
  let n = indice + 1
  let nome = ''
  while (n > 0) {
    const resto = (n - 1) % 26
    nome = String.fromCharCode(65 + resto) + nome
    n = Math.floor((n - 1) / 26)
  }
  return nome
}

/** O que a célula desta coluna é.
 *
 *  `calculado` NÃO se digita: ele lê a coluna de `selecao` da MESMA LINHA e
 *  responde em percentual. É a regra da planilha de origem — o item aprovado vale
 *  100% e o reprovado 0%, e a média disso é o número que o painel mostra. Deixar
 *  o percentual editável abriria a porta para a linha dizer 70% com a verificação
 *  em "aprovado", que é exatamente a divergência que a plataforma existe para
 *  eliminar (ver a aba STRC no CLAUDE.md). */
export type TipoColuna = 'leitura' | 'texto' | 'selecao' | 'imagem' | 'calculado' | 'acao'

/** Uma opção de lista: o VALOR é estável, o rótulo é traduzido.
 *
 *  Separar os dois é o que impede a tradução de virar dado. O valor é o que um
 *  dia vai para `resultado_check.status` (`aprovado` / `reprovado`, o
 *  `CheckStatus` que já existe), e ele não pode mudar porque alguém trocou o
 *  idioma da interface. */
export type Opcao = { valor: string; pt: string; en: string }

export type Coluna = {
  /** O rótulo nos dois idiomas. A planilha de origem é em inglês, mas quem usa a
   *  plataforma em português lê o resto do sistema em português — uma fileira de
   *  cabeçalhos em inglês no meio de uma tela traduzida é a única coisa da tela
   *  que não fala a língua de quem a lê. */
  pt: string
  en: string
  largura?: number
  /** Sem `tipo`, a célula é de leitura — que é o certo para a coluna que vem do
   *  gabarito e não se responde. */
  tipo?: TipoColuna
  /** As opções, quando `tipo` é `selecao`. */
  opcoes?: Opcao[]
  /** O `title` do controle — para a coluna `acao`, onde o rótulo cabe em duas
   *  letras e o que o botão faz não cabe em nenhuma. */
  dica?: [string, string]
}

/** A largura padrão de uma coluna, em px. Serve de PESO e não de medida exata:
 *  a tabela ocupa 100% e o espaço que sobra é distribuído em proporção a estes
 *  números — ver `.grade` no CSS. */
const LARGURA_PADRAO = 108
const LARGURA_CALHA = 44

type Celula = { l: number; c: number }

/** Uma linha LIGADA a um `resultado_check`.
 *
 *  `leitura` e `valores` são indexados PELA COLUNA — a posição no vetor é a
 *  posição na grade. Um objeto por nome de campo seria mais legível de escrever
 *  e obrigaria a grade a conhecer os campos de `resultado_check`, que é
 *  exatamente o que ela não sabe: ela desenha colunas, e quem as liga a campos é
 *  a página. */
export type LinhaGrade = {
  /** O id do resultado. É o que volta em `onSalvar`. */
  chave: string
  /** O GRUPO a que a linha pertence — a coluna ELEMENT da planilha de LOD
   *  (`criterio.categoria`). Quando ele muda em relação à linha anterior, a
   *  grade imprime uma faixa atravessando a tabela. Nulo nos recortes sem
   *  agrupamento, e aí nenhuma faixa aparece. */
  grupo?: string | null
  leitura: Array<string | null>
  /** O `title` da célula de leitura, quando há mais a dizer do que cabe nela — é
   *  onde vive a INSTRUÇÃO do critério (a coluna oculta da planilha, que diz
   *  COMO conferir o item). Ela nunca foi para o fornecedor e não vira coluna
   *  aqui pelo mesmo motivo. */
  titulos?: Array<string | null>
  valores: string[]
  /** Quantas evidências a linha já tem. A coluna `imagem` mostra o número em vez
   *  de um clipe mudo: "tem quantas" é a pergunta de quem revisa. */
  anexos?: number
}

export default function GradePlanilha({
  colunas = 12,
  linhas = 30,
  rotulos,
  celulas,
  dados,
  travada = false,
  onSalvar,
  onImagem,
  onAcao,
}: {
  colunas?: number
  /** Quantas linhas desenhar QUANDO NÃO HÁ DADO. Havendo `celulas` ou `dados`, o
   *  total é o deles e nada mais: a planilha não tem linha vazia de enfeite
   *  abaixo do último item — a auditoria geral tem 17 itens e 17 linhas. */
  linhas?: number
  rotulos?: Coluna[]
  /** MODO PRÉVIA: o conteúdo de leitura, linha por linha, sem modelo por trás. */
  celulas?: Array<Array<string | null>>
  /** MODO LIGADO: uma linha por resultado, com o valor que está no servidor. */
  dados?: LinhaGrade[]
  /** Round publicado: a planilha vira leitura. O PDF já emitido tem os números
   *  dela. */
  travada?: boolean
  /** Grava uma célula. Sem isto a grade é prévia, e as células editáveis ficam
   *  desabilitadas — ver o cabeçalho do arquivo. */
  onSalvar?: (chave: string, coluna: number, valor: string) => void
  /** Abre o painel de imagem da linha. A grade não sobe arquivo: ela não sabe o
   *  que é evidência nem para onde ela vai. */
  onImagem?: (chave: string) => void
  /** A coluna `acao` (hoje: gerar a não-conformidade). Ela APARECE SÓ NA LINHA
   *  REPROVADA, e a regra é do backend, não estética: "só itens reprovados geram
   *  não-conformidade" — um botão que devolve 409 é pior do que botão nenhum. É
   *  o mesmo acoplamento que a coluna `calculado` já tem com a de seleção. */
  onAcao?: (chave: string) => void
}) {
  const { L } = useI18n()
  const cabecalhos: Coluna[] = useMemo(
    () =>
      rotulos ??
      // A letra é igual nos dois idiomas — é justamente por não ter tradução que
      // ela serve de rótulo provisório.
      Array.from({ length: colunas }, (_, i) => {
        const letra = letraDaColuna(i)
        return { pt: letra, en: letra }
      }),
    [rotulos, colunas],
  )
  const total = dados?.length ?? celulas?.length ?? linhas
  /** Ligada quando há linha do banco E quem grave. Faltando um dos dois, os
   *  campos ficam travados: ver o cabeçalho do arquivo. */
  const ligada = !!dados && !!onSalvar
  const somenteLeitura = travada || !ligada
  /** A soma dos pesos vira o piso da tabela: acima disso ela estica para ocupar
   *  a largura toda, abaixo ela rola na horizontal em vez de espremer coluna. */
  const minimo = useMemo(
    () =>
      LARGURA_CALHA + cabecalhos.reduce((s, c) => s + (c.largura ?? LARGURA_PADRAO), 0),
    [cabecalhos],
  )
  /** O índice da coluna de seleção da linha — é dela que a coluna calculada lê. */
  const iSelecao = cabecalhos.findIndex((c) => c.tipo === 'selecao')

  const [sel, setSel] = useState<Celula | null>({ l: 0, c: 0 })
  const [valores, setValores] = useState<Record<string, string>>({})
  const caixa = useRef<HTMLDivElement>(null)

  const chave = (l: number, c: number) => `${l}:${c}`

  /** O valor da célula: do SERVIDOR quando ligada, do rascunho local quando é
   *  prévia. Um só lugar decide isso, para não haver célula que leia de um e
   *  grave no outro. */
  const valorDe = (l: number, c: number): string =>
    (ligada ? dados?.[l]?.valores[c] : valores[chave(l, c)]) ?? ''

  const gravar = (l: number, c: number, v: string) => {
    const linha = dados?.[l]
    if (ligada && linha) onSalvar?.(linha.chave, c, v)
    else setValores((atual) => ({ ...atual, [chave(l, c)]: v }))
  }

  const mover = useCallback(
    (dl: number, dc: number) => {
      setSel((atual) => {
        const base = atual ?? { l: 0, c: 0 }
        return {
          // Trava nas bordas em vez de dar a volta: numa planilha, seta para
          // cima na linha 1 não deveria levar à última.
          l: Math.min(Math.max(base.l + dl, 0), total - 1),
          c: Math.min(Math.max(base.c + dc, 0), cabecalhos.length - 1),
        }
      })
    },
    [total, cabecalhos.length],
  )

  function aoTeclar(e: React.KeyboardEvent) {
    // Digitando dentro de um campo, as setas movem o CURSOR do texto e não a
    // seleção da grade — mexer nas duas coisas ao mesmo tempo tornaria
    // impossível corrigir uma letra no meio de um comentário.
    const alvo = e.target as HTMLElement
    if (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.tagName === 'SELECT') {
      return
    }
    const passos: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
      Tab: [0, e.shiftKey ? -1 : 1],
      Enter: [e.shiftKey ? -1 : 1, 0],
    }
    const passo = passos[e.key]
    if (!passo) return
    e.preventDefault()
    mover(passo[0], passo[1])
  }

  /** O percentual da linha, a partir da verificação. Vazio enquanto ninguém
   *  respondeu: "0%" e "ainda não olhei" são coisas diferentes, e mostrar zero
   *  numa planilha recém-aberta faria toda auditoria começar reprovada. */
  function percentual(l: number): string {
    if (iSelecao < 0) return ''
    const v = valorDe(l, iSelecao)
    if (!v) return ''
    // Igualdade contra o VALOR, nunca substring contra o rótulo: "NOT APPROVED"
    // contém "APPROVED", e é a armadilha que o CLAUDE.md registra — uma
    // comparação por substring na ordem errada aprova a planilha inteira.
    return v === 'aprovado' ? '100%' : '0%'
  }

  return (
    <div
      className="grade-rolagem thin-scroll"
      ref={caixa}
      tabIndex={0}
      role="grid"
      onKeyDown={aoTeclar}
    >
      <table className="grade" style={{ minWidth: minimo }}>
        {/* `colgroup` e não `width` na célula: com `table-layout: fixed` é ele
            que a tabela lê, e é uma declaração por coluna em vez de uma por
            célula. */}
        <colgroup>
          <col style={{ width: LARGURA_CALHA }} />
          {cabecalhos.map((col, c) => (
            <col key={c} style={{ width: col.largura ?? LARGURA_PADRAO }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {/* O canto gruda nos DOIS eixos: é o único elemento que fica parado
                quando se rola na diagonal. */}
            <th className="grade-canto" aria-hidden="true" />
            {cabecalhos.map((col, c) => (
              <th
                key={c}
                className={`grade-col${sel?.c === c ? ' on' : ''}`}
                scope="col"
                title={L(col.pt, col.en)}
                onClick={() => setSel({ l: sel?.l ?? 0, c })}
              >
                {L(col.pt, col.en)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: total }, (_, l) => {
            const linha = dados?.[l]
            // A FAIXA DO GRUPO sai da comparação com a linha ANTERIOR, e não de
            // um agrupamento montado antes: os resultados já vêm do servidor na
            // ordem da planilha impressa, e reagrupá-los aqui arriscaria
            // reordená-los. Ver `agrupar` na planilha de LOD, que fazia o mesmo
            // com um `Map` justamente para preservar a ordem.
            const grupo = linha?.grupo ?? null
            const abreGrupo = !!grupo && grupo !== (dados?.[l - 1]?.grupo ?? null)
            return (
              <Fragment key={linha?.chave ?? l}>
                {abreGrupo && (
                  <tr className="grade-grupo">
                    <th scope="rowgroup" colSpan={cabecalhos.length + 1}>
                      {grupo}
                    </th>
                  </tr>
                )}
                <tr>
                  <th
                    className={`grade-num${sel?.l === l ? ' on' : ''}`}
                    scope="row"
                    onClick={() => setSel({ l, c: sel?.c ?? 0 })}
                  >
                    {l + 1}
                  </th>
                  {cabecalhos.map((col, c) => {
                    const marcada = sel?.l === l && sel?.c === c
                    return (
                      <td
                        key={c}
                        className={`${marcada ? 'on ' : ''}cel-${col.tipo ?? 'leitura'}`}
                        aria-selected={marcada}
                        onClick={() => setSel({ l, c })}
                      >
                        <CelulaDe
                          col={col}
                          leitura={linha?.leitura[c] ?? celulas?.[l]?.[c] ?? null}
                          titulo={linha?.titulos?.[c] ?? null}
                          valor={valorDe(l, c)}
                          calculado={percentual(l)}
                          travada={somenteLeitura}
                          anexos={linha?.anexos ?? 0}
                          reprovada={valorDe(l, iSelecao) === 'reprovado'}
                          onMudar={(v) => gravar(l, c, v)}
                          onImagem={linha && onImagem ? () => onImagem(linha.chave) : undefined}
                          onAcao={
                            linha && onAcao && !somenteLeitura
                              ? () => onAcao(linha.chave)
                              : undefined
                          }
                        />
                      </td>
                    )
                  })}
                </tr>
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/** O conteúdo de UMA célula, escolhido pelo tipo da coluna.
 *
 *  Os controles não têm moldura própria: a borda da célula já é a moldura, e um
 *  input com contorno dentro de uma célula com contorno produz o sulco duplo que
 *  a barra de busca também evita não desenhando borda no `input`. */
function CelulaDe({
  col,
  leitura,
  titulo,
  valor,
  calculado,
  travada,
  anexos,
  reprovada,
  onMudar,
  onImagem,
  onAcao,
}: {
  col: Coluna
  leitura: string | null
  titulo: string | null
  valor: string
  calculado: string
  travada: boolean
  anexos: number
  reprovada: boolean
  onMudar: (v: string) => void
  onImagem?: () => void
  onAcao?: () => void
}) {
  const { L } = useI18n()

  switch (col.tipo) {
    case 'selecao':
      return (
        // Grava NA HORA, sem espera: escolher numa lista é um ato terminado —
        // não há o "ainda estou escrevendo" que justifica o atraso do texto.
        <select
          className="cf"
          value={valor}
          disabled={travada}
          onChange={(e) => onMudar(e.target.value)}
        >
          {/* A opção vazia é "ainda não verifiquei", e precisa existir: sem ela
              a planilha abriria com todos os itens já respondidos pelo primeiro
              valor da lista. */}
          <option value="" />
          {(col.opcoes ?? []).map((o) => (
            <option key={o.valor} value={o.valor}>
              {L(o.pt, o.en)}
            </option>
          ))}
        </select>
      )

    case 'texto':
      return <CampoTexto valor={valor} travada={travada} onSalvar={onMudar} />

    case 'imagem':
      return (
        <button
          type="button"
          className={`cel-anexo${anexos > 0 ? ' on' : ''}`}
          onClick={onImagem}
          disabled={!onImagem}
          title={
            anexos > 0
              ? L(`${anexos} imagem(ns) — clique para ver`, `${anexos} image(s) — click to view`)
              : L('Colar ou anexar imagem', 'Paste or attach image')
          }
        >
          {anexos > 0 ? anexos : '+'}
        </button>
      )

    case 'calculado':
      // Sem `input`: é conta, não resposta. Ver `TipoColuna`.
      return <span className="cel-num">{calculado}</span>

    case 'acao':
      if (!onAcao || !reprovada) return null
      return (
        <button
          type="button"
          className="cel-acao"
          onClick={onAcao}
          title={col.dica ? L(col.dica[0], col.dica[1]) : undefined}
        >
          {L(col.pt, col.en)}
        </button>
      )

    default:
      // `title` só quando há o que dizer: um `title` igual ao texto visível faz
      // o navegador abrir uma tarja repetindo o que já está na tela.
      return titulo ? <span title={titulo}>{leitura}</span> : <>{leitura}</>
  }
}

/** Quanto tempo sem digitar antes de gravar. 600ms é o intervalo típico entre
 *  palavras: curto o bastante para "salvou sozinho" e longo o bastante para não
 *  virar um PATCH por letra. */
const ATRASO = 600

/** A CÉLULA DE TEXTO QUE SALVA SOZINHA.
 *
 *  Não há botão de salvar em lugar nenhum desta planilha, e é de propósito — a
 *  de origem é um .xlsx, onde ninguém salva célula. Antes o texto ia embora ao
 *  SAIR do campo; quem digitasse e trocasse de tela pelo menu perdia o que
 *  escreveu, porque trocar de rota desmonta o campo sem passar por `blur`.
 *
 *  TRÊS COISAS PRECISAM SER VERDADE AO MESMO TEMPO, e cada uma tem uma linha
 *  aqui:
 *
 *  1. **O cursor não pode saltar.** O valor exibido é o do servidor, e o PATCH
 *     devolve a auditoria recalculada — se cada tecla gravasse, a resposta
 *     reescreveria o campo e o cursor iria para o fim. Por isso o texto é estado
 *     LOCAL enquanto se digita.
 *  2. **O que vem do servidor tem de aparecer** — a automação preencheu, outra
 *     aba editou. Por isso o `useEffect` sincroniza; mas SÓ com o campo fora de
 *     foco, senão a resposta de um PATCH sobrescreveria o que se está digitando.
 *  3. **Nada pode se perder.** Além do temporizador, grava no `blur` e ao
 *     DESMONTAR — que é o caso de quem navega para outra tela com o campo ainda
 *     em foco. */
function CampoTexto({
  valor,
  travada,
  onSalvar,
}: {
  valor: string
  travada: boolean
  onSalvar: (v: string) => void
}) {
  const [texto, setTexto] = useState(valor)
  const focado = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Refs para o desmonte: o cleanup roda uma vez, e sem elas ele enxergaria o
  // texto e o valor do PRIMEIRO render.
  const ultimo = useRef(texto)
  const doServidor = useRef(valor)
  const gravador = useRef(onSalvar)

  ultimo.current = texto
  doServidor.current = valor
  gravador.current = onSalvar

  useEffect(() => {
    if (!focado.current) setTexto(valor)
  }, [valor])

  const agendar = (v: string) => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      if (v !== doServidor.current) gravador.current(v)
    }, ATRASO)
  }

  const agora = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    if (ultimo.current !== doServidor.current) gravador.current(ultimo.current)
  }

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
      if (ultimo.current !== doServidor.current) gravador.current(ultimo.current)
    },
    [],
  )

  return (
    <input
      className="cf"
      value={texto}
      readOnly={travada}
      onChange={(e) => {
        setTexto(e.target.value)
        agendar(e.target.value)
      }}
      onFocus={() => {
        focado.current = true
      }}
      onBlur={() => {
        focado.current = false
        agora()
      }}
      // `title` com o próprio valor: a célula trunca, e reler o que se escreveu
      // não pode exigir alargar a coluna.
      title={texto || undefined}
    />
  )
}
