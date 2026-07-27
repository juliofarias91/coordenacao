/** Gráficos dos KPIs, em SVG puro.
 *
 *  Regras que valem para todos, e por quê:
 *
 *  - **A cor vem de token do tema, não do hex da API.** O backend devolve o
 *    hex (que o PDF usa), mas a tela mapeia a `chave` para `var(--macro-X)`:
 *    o modo escuro tem passos próprios, validados contra o fundo escuro, e
 *    não um inverso automático do claro.
 *  - **Texto nunca veste a cor da série.** Rótulo e valor usam tokens de
 *    tinta; a identidade vem da marca colorida ao lado.
 *  - **Todo gráfico tem tabela equivalente.** O `tooltip` complementa, nunca
 *    é o único caminho para o número.
 *  - Marcas finas, grade em fio de cabelo e sólida, ponta arredondada de 4px
 *    na extremidade do dado.
 */
import { useState, type ReactNode } from 'react'

import { useI18n } from '@/i18n'
import type { Fatia, PontoEvolucao } from '@/lib/types'

const TOKENS_MACRO: Record<string, string> = {
  A: 'var(--macro-A)',
  C: 'var(--macro-C)',
  M: 'var(--macro-M)',
  S: 'var(--macro-S)',
}

const TOKENS_STATUS: Record<string, string> = {
  aprovado: 'var(--ok)',
  reprovado: 'var(--bad)',
  pendente: 'var(--wait)',
  na: 'var(--na)',
  publicado: 'var(--ok)',
  desatualizado: 'var(--wait)',
  nao_publicado: 'var(--na)',
}

/** Token do tema para a fatia; cai na cor de série 1 quando não há chave. */
export function corDaFatia(fatia: Fatia): string {
  if (fatia.chave && TOKENS_MACRO[fatia.chave]) return TOKENS_MACRO[fatia.chave]!
  if (fatia.chave && TOKENS_STATUS[fatia.chave]) return TOKENS_STATUS[fatia.chave]!
  return 'var(--accent)'
}

function Cartao({
  titulo,
  sub,
  children,
  tabela,
}: {
  titulo: string
  sub?: string
  children: ReactNode
  tabela: ReactNode
}) {
  const { L } = useI18n()
  const [verTabela, setVerTabela] = useState(false)
  return (
    <div className="grafico">
      <div className="gcab">
        <div>
          <b>{titulo}</b>
          {sub && <div className="gsub">{sub}</div>}
        </div>
        <button className="linkmudo" onClick={() => setVerTabela(!verTabela)}>
          {verTabela ? L('ver gráfico', 'view chart') : L('ver tabela', 'view table')}
        </button>
      </div>
      {verTabela ? <div className="gtabela">{tabela}</div> : children}
    </div>
  )
}

function TabelaSimples({
  colunas,
  linhas,
}: {
  colunas: string[]
  linhas: (string | number)[][]
}) {
  return (
    <table>
      <thead>
        <tr>
          {colunas.map((c) => (
            <th key={c}>{c}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {linhas.map((linha, i) => (
          <tr key={i}>
            {linha.map((celula, j) => (
              <td key={j} className={j === 0 ? undefined : 'num'}>
                {celula}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Barras horizontais: uma categoria por linha, valor na ponta. */
export function BarrasHorizontais({
  titulo,
  sub,
  fatias,
  sufixo = '',
  corUnica,
}: {
  titulo: string
  sub?: string
  fatias: Fatia[]
  sufixo?: string
  /** Série única (sem identidade por categoria) usa um só tom. */
  corUnica?: boolean
}) {
  const { L } = useI18n()
  const maximo = Math.max(...fatias.map((f) => f.valor), 1)
  const alturaLinha = 34
  const larguraRotulo = 128

  if (fatias.length === 0) {
    return (
      <Cartao titulo={titulo} sub={sub} tabela={null}>
        <p className="gvazio">{L('Sem dados ainda.', 'No data yet.')}</p>
      </Cartao>
    )
  }

  return (
    <Cartao
      titulo={titulo}
      sub={sub}
      tabela={
        <TabelaSimples
          colunas={[L('Categoria', 'Category'), L('Valor', 'Value')]}
          linhas={fatias.map((f) => [f.rotulo, `${f.valor.toFixed(0)}${sufixo}`])}
        />
      }
    >
      <svg
        viewBox={`0 0 420 ${fatias.length * alturaLinha + 8}`}
        className="gsvg"
        role="img"
        aria-label={titulo}
      >
        {fatias.map((f, i) => {
          const y = i * alturaLinha + 6
          const largura = Math.max(2, (f.valor / maximo) * (420 - larguraRotulo - 52))
          return (
            <g key={f.rotulo}>
              <title>{`${f.rotulo}: ${f.valor.toFixed(0)}${sufixo}`}</title>
              <text x="0" y={y + 14} className="grotulo">
                {f.rotulo}
              </text>
              {/* Ponta arredondada só na extremidade do dado; a base é reta. */}
              <rect
                x={larguraRotulo}
                y={y + 3}
                width={largura}
                height="16"
                rx="4"
                fill={corUnica ? 'var(--accent)' : corDaFatia(f)}
              />
              <text x={larguraRotulo + largura + 8} y={y + 15} className="gvalor">
                {f.valor.toFixed(0)}
                {sufixo}
              </text>
            </g>
          )
        })}
      </svg>
    </Cartao>
  )
}

/** Barra empilhada única: parte-do-todo com ≤ 6 segmentos. */
export function BarraEmpilhada({
  titulo,
  sub,
  fatias,
}: {
  titulo: string
  sub?: string
  fatias: Fatia[]
}) {
  const { L } = useI18n()
  const total = fatias.reduce((s, f) => s + f.valor, 0)

  if (total === 0) {
    return (
      <Cartao titulo={titulo} sub={sub} tabela={null}>
        <p className="gvazio">{L('Sem itens verificados ainda.', 'No items checked yet.')}</p>
      </Cartao>
    )
  }

  let acumulado = 0
  const largura = 420
  // 2px de superfície separam os segmentos — nunca um contorno.
  const vao = 2

  return (
    <Cartao
      titulo={titulo}
      sub={sub}
      tabela={
        <TabelaSimples
          colunas={[L('Situação', 'Status'), L('Itens', 'Items'), '%']}
          linhas={fatias.map((f) => [
            f.rotulo,
            f.valor,
            `${((f.valor / total) * 100).toFixed(1)}%`,
          ])}
        />
      }
    >
      <svg viewBox={`0 0 ${largura} 28`} className="gsvg" role="img" aria-label={titulo}>
        {fatias.map((f) => {
          const w = (f.valor / total) * largura
          const x = acumulado
          acumulado += w
          return (
            <g key={f.rotulo}>
              <title>{`${f.rotulo}: ${f.valor} (${((f.valor / total) * 100).toFixed(1)}%)`}</title>
              <rect
                x={x}
                y="4"
                width={Math.max(0, w - vao)}
                height="18"
                rx="3"
                fill={corDaFatia(f)}
              />
            </g>
          )
        })}
      </svg>

      {/* Legenda sempre presente: identidade nunca fica só na cor. */}
      <div className="glegenda">
        {fatias.map((f) => (
          <span key={f.rotulo}>
            <i style={{ background: corDaFatia(f) }} />
            {f.rotulo} <b>{f.valor}</b>
          </span>
        ))}
      </div>
    </Cartao>
  )
}

/** Linha de evolução por round. Série única: sem caixa de legenda. */
export function LinhaEvolucao({
  titulo,
  sub,
  pontos,
}: {
  titulo: string
  sub?: string
  pontos: PontoEvolucao[]
}) {
  const { L } = useI18n()

  if (pontos.length === 0) {
    return (
      <Cartao titulo={titulo} sub={sub} tabela={null}>
        <p className="gvazio">{L('Nenhum round auditado ainda.', 'No audited round yet.')}</p>
      </Cartao>
    )
  }

  const larg = 420
  const alt = 150
  const padE = 34
  const padD = 44
  const padTopo = 14
  const padBase = 26

  const x = (i: number) =>
    padE + (pontos.length === 1 ? (larg - padE - padD) / 2 : (i / (pontos.length - 1)) * (larg - padE - padD))
  const y = (v: number) => padTopo + (1 - v / 100) * (alt - padTopo - padBase)

  const caminho = pontos
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(p.aprovacao_media ?? 0)}`)
    .join(' ')

  const ultimo = pontos[pontos.length - 1]!

  return (
    <Cartao
      titulo={titulo}
      sub={sub}
      tabela={
        <TabelaSimples
          colunas={['Round', L('Aprovação', 'Approval'), L('Auditorias', 'Audits')]}
          linhas={pontos.map((p) => [
            p.round,
            `${(p.aprovacao_media ?? 0).toFixed(0)}%`,
            p.auditorias,
          ])}
        />
      }
    >
      <svg viewBox={`0 0 ${larg} ${alt}`} className="gsvg" role="img" aria-label={titulo}>
        {/* Grade sólida em fio de cabelo, um passo fora da superfície. */}
        {[0, 50, 100].map((v) => (
          <g key={v}>
            <line x1={padE} y1={y(v)} x2={larg - padD} y2={y(v)} className="ggrade" />
            <text x={padE - 6} y={y(v) + 4} className="geixo" textAnchor="end">
              {v}%
            </text>
          </g>
        ))}

        <path d={caminho} className="glinha" />

        {pontos.map((p, i) => (
          <g key={p.round}>
            <title>{`Round ${p.round}: ${(p.aprovacao_media ?? 0).toFixed(0)}% · ${p.auditorias} ${L('auditoria(s)', 'audit(s)')}`}</title>
            {/* Anel de 2px na cor da superfície, para o ponto não sumir sobre
                a linha; faz parte do alvo de toque. */}
            <circle cx={x(i)} cy={y(p.aprovacao_media ?? 0)} r="6" className="ganel" />
            <circle cx={x(i)} cy={y(p.aprovacao_media ?? 0)} r="4" className="gponto" />
            <text x={x(i)} y={alt - 6} className="geixo" textAnchor="middle">
              R{p.round}
            </text>
          </g>
        ))}

        {/* Rótulo direto só na ponta — nunca um número em cada ponto. */}
        <text
          x={x(pontos.length - 1) + 10}
          y={y(ultimo.aprovacao_media ?? 0) + 4}
          className="gvalor"
        >
          {(ultimo.aprovacao_media ?? 0).toFixed(0)}%
        </text>
      </svg>
    </Cartao>
  )
}
