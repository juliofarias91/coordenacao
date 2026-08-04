/* ==========================================================================
 *  ███  MOCK — APAGUE ESTE ARQUIVO INTEIRO AO LIGAR O LOD 300 NO DADO REAL ███
 * ==========================================================================
 *
 *  ISTO NÃO É DADO. São linhas inventadas, só para ver a tabela do LOD 300
 *  desenhada enquanto o projeto ainda não tem critérios semeados neste recorte.
 *  Nada daqui é gravado, nada daqui vem do banco, nada daqui volta para ele.
 *
 *  COMO APAGAR, quando o LOD 300 tiver dado de verdade — são três passos e não
 *  sobra rastro:
 *
 *    1. apague este arquivo;
 *    2. em `Recorte.tsx`, apague o import dele, o bloco `MockLod300` /
 *       `mockDoLod300` (delimitado por uma faixa de `===`) e os TRÊS usos de
 *       `mockDoLod300(checklist) ??` — cada um está marcado com `MOCK` no
 *       comentário da linha de cima. Tirar a chamada devolve exatamente a tela
 *       que existia antes;
 *    3. apague `.plan-mock` do `app.css`.
 *
 *  POR QUE ELE PRECISA SUMIR, e não é preciosismo. Esta tela já teve um modo de
 *  PRÉVIA — desenhava o gabarito com as células travadas — e ele foi removido em
 *  01/08/2026 pela razão que está no CLAUDE.md: *"uma tabela que não é de nada
 *  convida a preencher o que não se grava"*. O mock reabre exatamente essa porta.
 *  Ele se justifica hoje porque o banco local está sem critérios de LOD 300 e sem
 *  ele não há o que olhar; no dia em que houver, ele passa a ser uma tela que
 *  mente. As duas defesas abaixo reduzem o risco, mas não o eliminam:
 *
 *    - a grade entra TRAVADA (`travada`), então nenhuma célula aceita digitação;
 *    - uma tarja permanente diz que os dados são de exemplo.
 *
 *  AS LINHAS SÃO REAIS, ainda que os valores não sejam: elemento, informação,
 *  descrição do BIM Forum e parâmetro do Revit foram copiados de
 *  `backend/app/services/gabarito_lod.py`, que por sua vez veio do arquivo
 *  `Spec Audit LOD300_STRC`. Inventar nome de parâmetro aqui ensinaria errado a
 *  quem olhasse a tela para conferir o layout.
 */
import type { Criterio, Resultado } from '@/lib/types'

/** Liga e desliga o mock num lugar só. */
export const MOCK_LOD300_LIGADO = true

const AGORA = '2026-08-04T12:00:00-03:00'

/** Os textos do BIM Forum, iguais aos de `gabarito_lod.py`. */
const D_GRAFICO =
  'The Model Element, as designed, is graphically represented within the Model such that its ' +
  'quantity, size, shape, location, and orientation can be measured.'
const D_DESCRICAO = 'Description (i.e. A basic description of the element)'
const D_MATERIAL = 'Material (i.e. Characteristic or primary material of product)'
const D_DIM_LAJE =
  'Nominal Dimensions (i.e. Generic element sizing) / Overall size, thickness and geometry of the slab'
const D_ABERTURA = 'Openings with any dimension greater than 6" (15 cm) or as noted'

type Linha = {
  /** ELEMENT — vira `criterio.categoria`. */
  elemento: string
  /** INFORMATION. */
  nome_pt: string
  nome_en: string
  /** BIM FORUM DESCRIPTION. */
  descricao?: string
  /** REVIT PARAMETER — onde a informação DEVERIA estar. */
  esperado?: string
  /** PARAMETER — onde ela FOI achada. */
  encontrado?: string
  status: Resultado['status']
  comentario?: string
  fornecedor?: string
  /** Quantas imagens a linha finge ter, para a coluna IMAGE mostrar o número. */
  imagens?: number
}

/** As oito linhas. Duas categorias, para a coluna ELEMENT ter o que mostrar. */
const LINHAS: Linha[] = [
  {
    elemento: 'Floor',
    nome_pt: 'Família',
    nome_en: 'Family',
    descricao: D_GRAFICO,
    esperado: 'Family',
    encontrado: 'Family',
    status: 'aprovado',
  },
  {
    elemento: 'Floor',
    nome_pt: 'Tipo',
    nome_en: 'Type',
    esperado: 'Type',
    encontrado: 'Type',
    status: 'aprovado',
  },
  {
    elemento: 'Floor',
    nome_pt: 'Nível',
    nome_en: 'Level',
    esperado: 'Level',
    encontrado: 'Level',
    status: 'aprovado',
  },
  {
    elemento: 'Floor',
    nome_pt: 'Material principal',
    nome_en: 'Main Material',
    descricao: D_MATERIAL,
    esperado: 'Structural Material',
    encontrado: '—',
    status: 'reprovado',
    comentario: 'Lajes do pavimento tipo sem material estrutural preenchido.',
    fornecedor: 'Será corrigido na próxima revisão do modelo.',
    imagens: 2,
  },
  {
    elemento: 'Floor',
    nome_pt: 'Espessura',
    nome_en: 'Thickness',
    descricao: D_DIM_LAJE,
    // Sem `esperado`: aqui se audita GEOMETRIA, e é por isso que a coluna REVIT
    // PARAMETER fica vazia no arquivo de origem. Ver `gabarito_lod.py`.
    status: 'aprovado',
  },
  {
    elemento: 'Floor',
    nome_pt: 'Aberturas',
    nome_en: 'Openings',
    descricao: D_ABERTURA,
    status: 'reprovado',
    comentario: 'Aberturas de shaft modeladas como família genérica, não como abertura.',
    imagens: 1,
  },
  {
    elemento: 'Structural columns',
    nome_pt: 'Família',
    nome_en: 'Family',
    descricao: D_GRAFICO,
    esperado: 'Family',
    encontrado: 'Family',
    status: 'aprovado',
  },
  {
    elemento: 'Structural columns',
    nome_pt: 'Nível',
    nome_en: 'Level',
    // O MESMO NOME DE INFORMAÇÃO EM ELEMENTO DIFERENTE É OUTRO PARÂMETRO:
    // "Level" na laje é o built-in `Level`; no pilar é `Base Level`. É a razão
    // pela qual o gabarito não compartilha critério entre categorias.
    esperado: 'Base Level',
    encontrado: 'Base Level',
    status: 'aprovado',
  },
  {
    elemento: 'Structural columns',
    nome_pt: 'Descrição',
    nome_en: 'Description',
    descricao: D_DESCRICAO,
    esperado: 'Description',
    encontrado: '—',
    status: 'na',
    comentario: 'Não se aplica aos pilares metálicos deste setor.',
  },
]

function criterio(l: Linha, i: number): Criterio {
  return {
    id: `mock-criterio-${i}`,
    created_at: AGORA,
    updated_at: AGORA,
    org_id: 'mock',
    projeto_id: 'mock',
    codigo: `LOD300_MOCK_${i}`,
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

/** As linhas no MESMO formato que o servidor devolve.
 *
 *  De propósito: assim a tela usa o mapeamento de colunas que já existe, em vez
 *  de uma segunda montagem só para o mock — duas montagens divergiriam na
 *  primeira coluna nova, e o mock passaria a mostrar uma tabela que a de verdade
 *  não tem. */
export function resultadosDeMentira(): Resultado[] {
  return LINHAS.map((l, i) => ({
    id: `mock-resultado-${i}`,
    created_at: AGORA,
    updated_at: AGORA,
    org_id: 'mock',
    auditoria_id: 'mock',
    criterio_id: `mock-criterio-${i}`,
    status: l.status,
    origem: 'manual' as const,
    comentario: l.comentario ?? null,
    direcao: null,
    parametro_revit: null,
    parametro_encontrado: l.encontrado ?? null,
    comentario_fornecedor: l.fornecedor ?? null,
    itens_analisados: null,
    itens_ok: null,
    min_lod: '300',
    criterio: criterio(l, i),
    ocorrencias: [],
    // A coluna IMAGE conta as evidências. Objetos vazios bastam: a grade só usa
    // o COMPRIMENTO da lista, e ninguém consegue abrir o painel com a grade
    // travada.
    evidencias: Array.from({ length: l.imagens ?? 0 }, (_, j) => ({
      id: `mock-evidencia-${i}-${j}`,
      created_at: AGORA,
      updated_at: AGORA,
      org_id: 'mock',
      resultado_id: `mock-resultado-${i}`,
      arquivo_url: '',
      legenda: null,
    })),
  }))
}
