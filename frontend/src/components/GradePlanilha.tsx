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
 *  ⚠ O CONTEÚDO DIGITADO AINDA NÃO É SALVO, e isso é etapa declarada, não
 *  esquecimento. Cada célula destas corresponde a um campo de `resultado_check`,
 *  que pertence a UMA AUDITORIA — e auditoria pertence a um modelo. Esta tela é
 *  do RECORTE, não de um modelo, então não há linha no banco em que gravar. O
 *  cabeçalho do conteúdo diz isso ao usuário; quando a tela ganhar um modelo, o
 *  `valores` daqui vira `PATCH /resultados/{id}` e este aviso sai.
 *
 *  A CÉLULA MUDA COM A COLUNA, não com a linha. `Coluna.tipo` é o que decide se
 *  ela é lista, texto, anexo ou conta — e é isso que permite a mesma grade servir
 *  aos cinco recortes com colunas diferentes sem um `if` por recorte aqui dentro.
 */
import { useCallback, useMemo, useRef, useState } from 'react'

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
export type TipoColuna = 'leitura' | 'texto' | 'selecao' | 'imagem' | 'calculado'

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
}

/** A largura padrão de uma coluna, em px. Serve de PESO e não de medida exata:
 *  a tabela ocupa 100% e o espaço que sobra é distribuído em proporção a estes
 *  números — ver `.grade` no CSS. */
const LARGURA_PADRAO = 108
const LARGURA_CALHA = 44

type Celula = { l: number; c: number }

export default function GradePlanilha({
  colunas = 12,
  linhas = 30,
  rotulos,
  celulas,
}: {
  colunas?: number
  /** Quantas linhas desenhar QUANDO NÃO HÁ DADO. Havendo `celulas`, o total é o
   *  delas e nada mais: a planilha não tem linha vazia de enfeite abaixo do
   *  último item — a auditoria geral tem 17 itens e 17 linhas. */
  linhas?: number
  rotulos?: Coluna[]
  /** O conteúdo de leitura, linha por linha. Hoje só a primeira coluna tem de
   *  onde sair; o resto se responde na tela. */
  celulas?: Array<Array<string | null>>
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
  const total = celulas?.length ?? linhas
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
  const gravar = (l: number, c: number, v: string) =>
    setValores((atual) => ({ ...atual, [chave(l, c)]: v }))

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
    const v = valores[chave(l, iSelecao)]
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
          {Array.from({ length: total }, (_, l) => (
            <tr key={l}>
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
                      leitura={celulas?.[l]?.[c] ?? null}
                      valor={valores[chave(l, c)] ?? ''}
                      calculado={percentual(l)}
                      onMudar={(v) => gravar(l, c, v)}
                    />
                  </td>
                )
              })}
            </tr>
          ))}
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
  valor,
  calculado,
  onMudar,
}: {
  col: Coluna
  leitura: string | null
  valor: string
  calculado: string
  onMudar: (v: string) => void
}) {
  const { L } = useI18n()
  const arquivo = useRef<HTMLInputElement>(null)

  switch (col.tipo) {
    case 'selecao':
      return (
        <select className="cf" value={valor} onChange={(e) => onMudar(e.target.value)}>
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
      return (
        <input
          className="cf"
          value={valor}
          onChange={(e) => onMudar(e.target.value)}
          // `title` com o próprio valor: a célula trunca, e reler o que se
          // escreveu não pode exigir alargar a coluna.
          title={valor || undefined}
        />
      )

    case 'imagem':
      return (
        <>
          <input
            ref={arquivo}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            style={{ display: 'none' }}
            onChange={(e) => onMudar(e.target.files?.[0]?.name ?? '')}
          />
          <button
            type="button"
            className={`cel-anexo${valor ? ' on' : ''}`}
            onClick={() => arquivo.current?.click()}
            title={valor || L('Anexar imagem', 'Attach image')}
          >
            {valor ? '📎' : '+'}
          </button>
        </>
      )

    case 'calculado':
      // Sem `input`: é conta, não resposta. Ver `TipoColuna`.
      return <span className="cel-num">{calculado}</span>

    default:
      return <>{leitura}</>
  }
}
