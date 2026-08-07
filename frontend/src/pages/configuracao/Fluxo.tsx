/** O FLUXO DA AUDITORIA — o ciclo em que a auditoria se encaixa.
 *
 *  Era a terceira aba do PEB e virou seção própria em 07/08/2026, a pedido. A
 *  razão é o que ele é: **estático**. As outras duas abas do PEB liam e gravavam
 *  no banco; esta desenha o processo CONTRATADO, igual em todo projeto, e não há
 *  o que ler nem onde digitar. Uma aba que só se olha, escondida atrás de um
 *  segmento ao lado de duas que se preenchem, era a que ninguém abria.
 *
 *  ELE FICA JUNTO DOS DOCUMENTOS (ficha · diretrizes · mandate · fluxo), e não
 *  junto do que se cadastra: os quatro respondem "o que foi combinado nesta
 *  obra", e só depois deles começa o que se preenche — setorização, projetistas,
 *  nomenclatura, disciplinas.
 *
 *  CONTINUA SEM `h1`, como toda tela daqui: quem a nomeia é o item da barra do
 *  painel e o cabeçalho do conteúdo, poucos pixels acima.
 */
import { useI18n } from '@/i18n'

export default function AbaFluxo() {
  const { L } = useI18n()

  const etapas: Array<[string, string, boolean]> = [
    [L('Modelagem', 'Modeling'), L('Projetista', 'Designer'), false],
    [L('Entrega no ACC', 'ACC delivery'), L('Semanal', 'Weekly'), false],
    [L('Auditoria', 'Audit'), 'SPBIM', true],
    [L('RNC', 'NCR'), L('Não-conformidades', 'Non-conformities'), false],
    [L('Correção', 'Correction'), L('Fornecedor', 'Supplier'), false],
    [L('Republicação', 'Republish'), L('Nova versão', 'New version'), false],
  ]

  const bw = 168
  const gap = 22
  const largura = etapas.length * bw + (etapas.length - 1) * gap + 20
  const altura = 155
  const cx0 = 10 + bw / 2
  const cxN = 10 + (etapas.length - 1) * (bw + gap) + bw / 2

  return (
    <>
      <div className="card" style={{ padding: 16, overflowX: 'auto' }}>
        <svg viewBox={`0 0 ${largura} ${altura}`} style={{ minWidth: largura, maxWidth: '100%' }}>
          <defs>
            <marker
              id="peb-seta"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto"
            >
              <path
                d="M2 1L8 5L2 9"
                fill="none"
                stroke="var(--ink-3)"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </marker>
          </defs>

          {etapas.map(([titulo, papel, destaque], i) => {
            const x = 10 + i * (bw + gap)
            return (
              <g key={titulo}>
                {/* A auditoria é a única em accent: é onde a SPBIM entra, e o
                    diagrama existe para mostrar exatamente isso. Cor é
                    significado — as outras cinco não precisam dela. */}
                <rect
                  x={x}
                  y={40}
                  width={bw}
                  height={62}
                  rx={10}
                  fill={destaque ? 'var(--accent-soft)' : 'var(--panel-2)'}
                  stroke={destaque ? 'var(--accent)' : 'var(--line-2)'}
                  strokeWidth={destaque ? 1.5 : 0.5}
                />
                <text
                  x={x + bw / 2}
                  y={66}
                  textAnchor="middle"
                  fontSize={14}
                  fontWeight={600}
                  fill={destaque ? 'var(--accent)' : 'var(--ink)'}
                >
                  {titulo}
                </text>
                <text
                  x={x + bw / 2}
                  y={85}
                  textAnchor="middle"
                  fontSize={11.5}
                  fill="var(--ink-3)"
                >
                  {papel}
                </text>
                {i < etapas.length - 1 && (
                  <path
                    d={`M${x + bw} 71 L${x + bw + gap} 71`}
                    stroke="var(--ink-3)"
                    strokeWidth={1.5}
                    markerEnd="url(#peb-seta)"
                  />
                )}
              </g>
            )
          })}

          {/* O retorno: tracejado porque não é uma etapa, é a repetição. */}
          <path
            d={`M${cxN} 102 L${cxN} 128 L${cx0} 128 L${cx0} 102`}
            fill="none"
            stroke="var(--ink-3)"
            strokeWidth={1.2}
            strokeDasharray="5 4"
            markerEnd="url(#peb-seta)"
          />
          <text x={largura / 2} y={124} textAnchor="middle" fontSize={11} fill="var(--ink-3)">
            {L('ciclo por versão', 'per-version cycle')}
          </text>
        </svg>
      </div>

      <p className="hint">
        {L(
          'A auditoria (SPBIM) entra entre a entrega no ACC e a devolutiva de RNC — cada versão nova reinicia o ciclo.',
          'The audit (SPBIM) sits between ACC delivery and the NCR feedback — each new version restarts the cycle.',
        )}
      </p>
    </>
  )
}
