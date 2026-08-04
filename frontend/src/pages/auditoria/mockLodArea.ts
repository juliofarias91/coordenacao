/* ==========================================================================
 *  ███  MOCK — APAGUE ESTE ARQUIVO INTEIRO AO LIGAR 400/500 NO DADO REAL  ███
 * ==========================================================================
 *
 *  ISTO NÃO É DADO. São áreas e linhas inventadas, só para ver as abas e a
 *  tabela do LOD 400 e do LOD 500 enquanto esses recortes não têm gabarito.
 *  Nada daqui vem do banco, nada daqui é gravado.
 *
 *  UM MOCK PARA OS DOIS, a pedido — é teste, e duas cópias divergiriam.
 *
 *  COMO APAGAR, quando 400/500 tiverem dado de verdade — três passos:
 *
 *    1. apague este arquivo;
 *    2. em `Recorte.tsx`, apague o import dele, o bloco `MockLodArea` /
 *       `mockDeArea` (delimitado por uma faixa de `===`) e os TRÊS usos de
 *       `mockDeArea(checklist) ??` — cada um marcado com `MOCK` no comentário
 *       da linha de cima. Tirar a chamada devolve a tela que existia antes;
 *    3. apague `.plan-mock` do `app.css` (as abas, `.abas`/`.aba`, FICAM: elas
 *       não são do mock, servem ao dado real).
 *
 *  POR QUE ELE PRECISA SUMIR. A tela já teve um modo de PRÉVIA, removido em
 *  01/08/2026 porque "uma tabela que não é de nada convida a preencher o que não
 *  se grava". O mock reabre essa porta; ele se justifica só enquanto não há
 *  gabarito de 400/500 em `services/gabarito.py` e uma auditoria desses recortes
 *  nasce sem uma linha sequer. Duas defesas, que reduzem o risco sem eliminá-lo:
 *  a grade entra TRAVADA e uma tarja permanente diz que os dados são de exemplo.
 *
 *  AS ÁREAS SÃO REAIS. Saíram das abas de `Bases/LOD400_SPECIFIC
 *  AUDIT_CONTROL.xlsx` e do controle de LOD 500 — e note que os dois conjuntos
 *  DIFEREM: o 500 tem GUAR e WASTE SHED, e não tem COLO4. Inventar as áreas
 *  esconderia justamente isso, que é o que as abas existem para mostrar.
 */
import type { Criterio, Resultado } from '@/lib/types'

/** Liga e desliga o mock num lugar só. */
export const MOCK_LOD_AREA_LIGADO = true

const AGORA = '2026-08-04T12:00:00-03:00'

/** As abas de cada recorte, como estão nos arquivos de controle. */
const AREAS: Record<string, string[]> = {
  lod400: ['ADMN', 'COLO1', 'COLO2', 'COLO3', 'COLO4', 'SITE', 'UTLS'],
  lod500: ['ADMN', 'COLO1', 'COLO2', 'COLO3', 'SITE', 'GUAR', 'UTLS', 'WASTE SHED'],
}

export function areasDeMentira(checklist: string): string[] {
  return AREAS[checklist] ?? []
}

type Linha = {
  elemento: string
  nome_pt: string
  nome_en: string
  descricao?: string
  esperado?: string
}

const D_GRAFICO =
  'The Model Element, as designed, is graphically represented within the Model such that its ' +
  'quantity, size, shape, location, and orientation can be measured.'
const D_MATERIAL = 'Material (i.e. Characteristic or primary material of product)'
const D_FABRICANTE =
  'Manufacturer Details (i.e. Name of company, company address, link to website)'

/** As linhas, iguais em toda aba — o que muda entre áreas é a RESPOSTA. */
const LINHAS: Linha[] = [
  { elemento: 'Floor', nome_pt: 'Família', nome_en: 'Family', descricao: D_GRAFICO, esperado: 'Family' },
  { elemento: 'Floor', nome_pt: 'Tipo', nome_en: 'Type', esperado: 'Type' },
  { elemento: 'Floor', nome_pt: 'Nível', nome_en: 'Level', esperado: 'Level' },
  {
    elemento: 'Floor',
    nome_pt: 'Material principal',
    nome_en: 'Main Material',
    descricao: D_MATERIAL,
    esperado: 'Structural Material',
  },
  { elemento: 'Floor', nome_pt: 'Espessura', nome_en: 'Thickness' },
  {
    elemento: 'Structural columns',
    nome_pt: 'Família',
    nome_en: 'Family',
    descricao: D_GRAFICO,
    esperado: 'Family',
  },
  {
    elemento: 'Structural columns',
    // O MESMO NOME EM ELEMENTO DIFERENTE É OUTRO PARÂMETRO: "Level" na laje é o
    // built-in `Level`; no pilar é `Base Level`.
    nome_pt: 'Nível',
    nome_en: 'Level',
    esperado: 'Base Level',
  },
  {
    elemento: 'Structural columns',
    nome_pt: 'Fabricante',
    nome_en: 'Manufacturer',
    descricao: D_FABRICANTE,
    esperado: 'Manufacturer',
  },
]

const STATUS = ['aprovado', 'reprovado', 'na'] as const

/** A RESPOSTA VARIA COM A ÁREA, e isso não é enfeite: com todas as abas
 *  idênticas não dá para saber se clicar numa aba trocou alguma coisa — que é
 *  exatamente o que se quer testar aqui. A variação é DETERMINÍSTICA (sai da
 *  posição da letra), então a mesma aba mostra sempre o mesmo. */
function semente(area: string): number {
  let n = 0
  for (const c of area) n += c.charCodeAt(0)
  return n
}

/** O módulo garante o índice, mas o `noUncheckedIndexedAccess` do tsconfig não
 *  tem como saber disso — daí o valor de reserva. */
function statusDe(s: number, i: number): Resultado['status'] {
  return STATUS[(s + i) % STATUS.length] ?? 'aprovado'
}

function criterio(l: Linha, i: number, area: string): Criterio {
  return {
    id: `mock-${area}-criterio-${i}`,
    created_at: AGORA,
    updated_at: AGORA,
    org_id: 'mock',
    projeto_id: 'mock',
    codigo: `MOCK_${i}`,
    nome_pt: l.nome_pt,
    nome_en: l.nome_en,
    categoria: l.elemento,
    nivel: 'elemento',
    automacao: l.esperado ? 'auto' : 'manual',
    standard_id: null,
    parametro_esperado: l.esperado ?? null,
    criterio_aceitacao: l.descricao ?? null,
    instrucao: null,
    referencia_url: null,
  }
}

/** As linhas de UMA aba, no MESMO formato que o servidor devolve.
 *
 *  De propósito: assim a tela usa o mapeamento de colunas que já existe, em vez
 *  de uma segunda montagem só para o mock — duas montagens divergiriam na
 *  primeira coluna nova, e o mock passaria a mostrar uma tabela que a de verdade
 *  não tem. */
export function resultadosDeMentira(checklist: string, area: string): Resultado[] {
  const s = semente(area)
  return LINHAS.map((l, i) => {
    const status = statusDe(s, i)
    const reprovado = status === 'reprovado'
    return {
      id: `mock-${checklist}-${area}-${i}`,
      created_at: AGORA,
      updated_at: AGORA,
      org_id: 'mock',
      auditoria_id: `mock-${area}`,
      criterio_id: `mock-${area}-criterio-${i}`,
      status,
      origem: 'manual' as const,
      comentario: reprovado ? `Pendência em ${area}: informação ausente no modelo.` : null,
      direcao: null,
      parametro_revit: null,
      parametro_encontrado: reprovado ? '—' : (l.esperado ?? null),
      comentario_fornecedor: reprovado ? 'Corrigiremos na próxima revisão.' : null,
      itens_analisados: null,
      itens_ok: null,
      min_lod: checklist === 'lod500' ? '500' : '400',
      criterio: criterio(l, i, area),
      ocorrencias: [],
      // A coluna IMAGE conta as evidências. Objetos vazios bastam: a grade só usa
      // o COMPRIMENTO da lista, e a grade travada não abre o painel.
      evidencias: reprovado
        ? [
            {
              id: `mock-${area}-ev-${i}`,
              created_at: AGORA,
              updated_at: AGORA,
              org_id: 'mock',
              resultado_id: `mock-${checklist}-${area}-${i}`,
              arquivo_url: '',
              legenda: null,
            },
          ]
        : [],
    }
  })
}
