/** O RECORTE DE AUDITORIA — a planilha de UM MODELO.
 *
 *  Uma tela só, parametrizada pela rota (`auditoria/:checklist/:modeloId?`),
 *  dentro do esqueleto de `index.tsx`. É a MESMA para os cinco recortes: o que
 *  muda entre eles são as COLUNAS, e elas estão na tabela `COLUNAS` abaixo.
 *
 *  SEM MODELO NÃO HÁ PLANILHA (01/08/2026, a pedido). Linha, coluna e célula
 *  pertencem a um modelo — a linha é um `resultado_check`, e resultado pertence a
 *  uma auditoria, que pertence a uma versão de um modelo. Antes, `auditoria/geral`
 *  sem modelo desenhava a PRÉVIA do gabarito, com as células travadas; a prévia
 *  saiu, e no lugar dela fica uma tela dizendo para escolher um modelo à
 *  esquerda. Uma grade que não é de nada convida a preencher o que não se grava.
 *  `GET /gabaritos/{checklist}` continua existindo na API — é a leitura do padrão
 *  de fábrica, e quem a usa é `services/gabarito.py` do lado de lá.
 *
 *  ISTO SUBSTITUIU `pages/PlanilhaGeral.tsx` E `pages/PlanilhaLod.tsx`
 *  (01/08/2026, a pedido: "todas as páginas terão a mesma cara"). Eram duas
 *  telas com tabela própria, e o recorte sem tela própria — 4D, LOD 400 e LOD
 *  500 — não tinha nenhuma: clicar num modelo daqueles caía numa rota que não
 *  existia e o conteúdo abria VAZIO. Uma tela por recorte multiplicaria por
 *  cinco a próxima coluna que a planilha ganhar; o comportamento comum continua
 *  em `components/planilha.tsx`, que era de onde as duas já saíam.
 */
import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

import GradePlanilha, { type Coluna, type LinhaGrade } from '@/components/GradePlanilha'
import ImagemDaLinha from '@/components/ImagemDaLinha'
import { usePlanilha } from '@/components/planilha'
import { Erro, Vazio } from '@/components/ui'
import { useI18n } from '@/i18n'
import { CHECKLISTS, type Checklist } from '@/layout/nav'
import type { ChecklistTipo, Resultado } from '@/lib/types'
import { useProjeto } from '@/projeto/ProjetoContext'

// MOCK — apagar este import junto com `mockLodArea.ts`. Ver o cabeçalho do arquivo.
import { MOCK_LOD_AREA_LIGADO, areasDeMentira, resultadosDeMentira } from './mockLodArea'

/** O campo de `resultado_check` que a coluna grava. Sem `campo`, a coluna é de
 *  leitura (ou calculada, ou de ação) e não grava nada. */
type Campo = 'status' | 'comentario' | 'direcao' | 'parametro_encontrado' | 'comentario_fornecedor'

type ColunaAud = Coluna & {
  campo?: Campo
  /** De onde sai o texto de leitura da célula. Recebe o resultado e o idioma
   *  para não haver um `if (lang)` espalhado por seis lugares. */
  le?: (r: Resultado, en: boolean) => string | null
}

/** As duas opções da coluna VERIFICATION.
 *
 *  O VALOR é o `CheckStatus` do banco; o rótulo é o da planilha em cada idioma.
 *  Guardar o rótulo faria a tradução virar dado, e comparar por ele reabriria a
 *  armadilha do "NOT APPROVED" que contém "APPROVED". O vazio é `pendente` —
 *  ver `paraOServidor`. */
const VERIFICACAO = [
  { valor: 'aprovado', pt: 'APROVADO', en: 'APPROVED' },
  { valor: 'reprovado', pt: 'NÃO APROVADO', en: 'NOT APPROVED' },
  { valor: 'na', pt: 'N/A', en: 'N/A' },
]

const NOME = (r: Resultado, en: boolean) => (en ? r.criterio.nome_en : r.criterio.nome_pt)

/** AS COLUNAS DE CADA RECORTE.
 *
 *  OS RÓTULOS SÃO BILÍNGUES, e o inglês é o da planilha COMO ELA O ESCREVE —
 *  inclusive `COMENTARY`, que é a grafia do arquivo de referência. Não é erro de
 *  digitação: é o rótulo que a coordenação lê há anos, e "corrigir" para
 *  COMMENTARY faria a tela e a planilha divergirem na primeira conferência lado
 *  a lado. A migration 0008 e `services/exports.py` já usam essa grafia.
 *
 *  AS LARGURAS SEPARAM PROSA DE DADO, e são PESOS: a tabela ocupa a largura toda
 *  e o espaço que sobra se reparte em proporção a estes números. `COMENTARY` e
 *  `DIRECTION` são as duas frases que a coordenação escreve por linha reprovada
 *  (o diagnóstico e a orientação ao fornecedor — migration 0008), e `INFORMATION`
 *  é o texto do item. As três precisam de largura; `IMAGE` e as curtas cedem. */
const BASE: ColunaAud[] = [
  { pt: 'INFORMAÇÃO', en: 'INFORMATION', largura: 340, le: NOME },
  {
    pt: 'VERIFICAÇÃO',
    en: 'VERIFICATION',
    largura: 132,
    tipo: 'selecao',
    opcoes: VERIFICACAO,
    campo: 'status',
  },
  { pt: 'COMENTÁRIO', en: 'COMENTARY', largura: 280, tipo: 'texto', campo: 'comentario' },
  { pt: 'IMAGEM', en: 'IMAGE', largura: 72, tipo: 'imagem' },
  // DIRECTION é ORIENTAÇÃO, não "direção": é a frase que diz ao fornecedor o que
  // fazer. A migration 0008 usa exatamente essa palavra ao descrever o campo, e
  // "direção" em português levaria a pensar em sentido/rumo.
  { pt: 'ORIENTAÇÃO', en: 'DIRECTION', largura: 280, tipo: 'texto', campo: 'direcao' },
  { pt: 'APROVAÇÃO (%)', en: 'APPROVED (%)', largura: 116, tipo: 'calculado' },
  {
    pt: 'NC',
    en: 'NC',
    largura: 64,
    tipo: 'acao',
    dica: [
      'Cria a não-conformidade com estas duas frases: comentário → descrição, orientação → recomendação.',
      'Creates the non-conformity from these two sentences: comment → description, direction → recommendation.',
    ],
  },
]

/** O LOD 300 — AS DEZ COLUNAS DA PLANILHA DE ESPEC, nesta ordem (04/08/2026, a
 *  pedido).
 *
 *  A ordem é a do arquivo `Spec Audit LOD300_<DISC>`: começa pela IMAGEM, depois
 *  diz de QUE elemento se fala, em que LOD, e só então a informação. As três
 *  primeiras são o endereço da linha; o resto é a auditoria dela.
 *
 *  DE ONDE SAI CADA UMA — e note que metade não é do resultado:
 *
 *    IMAGE                 evidências da linha (a grade conta e abre o painel)
 *    ELEMENT               `criterio.categoria`
 *    LOD                   `resultado.min_lod`, que vem de `checklist_item`
 *    INFORMATION           `criterio.nome_pt/_en`
 *    BIM FORUM DESCRIPTION `criterio.criterio_aceitacao`
 *    REVIT PARAMETER       `criterio.parametro_esperado` — onde DEVERIA estar
 *    PARAMETER             `resultado.parametro_encontrado` — onde FOI achada
 *    VERIFICATION          `resultado.status`
 *    COMMENTS              `resultado.comentario`
 *    SUPPLIERS COMMENTS    `resultado.comentario_fornecedor`
 *
 *  As seis primeiras são LEITURA: vêm do gabarito e não se respondem. As quatro
 *  últimas são o que se preenche. A comparação entre REVIT PARAMETER e PARAMETER
 *  é a pergunta que a planilha faz, e por isso elas ficam vizinhas.
 *
 *  `SUPPLIERS COMMENTS` tem outro AUTOR: o guia do arquivo diz "permissão de
 *  edição: FORNECEDORES". Aqui ela é editável porque ainda não há tela de
 *  fornecedor — quando houver, é esta coluna que muda de dono.
 *
 *  SAÍRAM TRÊS COLUNAS que o recorte tinha, e a perda não é só visual:
 *
 *    - `DIRECTION` — a orientação ao fornecedor. Ela continua no banco
 *      (migration 0008) e o campo segue existindo; o que sumiu foi o lugar de
 *      escrevê-la NESTE recorte.
 *    - `APPROVED (%)` — era conta, não resposta. A aprovação continua sendo
 *      calculada no servidor e aparece no painel e nos KPIs.
 *    - `NC` — o botão que abria a não-conformidade a partir da linha reprovada.
 *      Sem ele, a NC de um item de LOD 300 passa a nascer pela tela de
 *      não-conformidades, não daqui. Como a NC herdava `direcao` como
 *      recomendação e `direcao` também saiu, as duas perdas são a mesma.
 *
 *  Os outros recortes seguem com as dez colunas de `BASE`, incluindo as três. */
const LOD: ColunaAud[] = [
  { pt: 'IMAGEM', en: 'IMAGE', largura: 72, tipo: 'imagem' },
  { pt: 'ELEMENTO', en: 'ELEMENT', largura: 160, le: (r) => r.criterio.categoria },
  { pt: 'LOD', en: 'LOD', largura: 64, le: (r) => r.min_lod },
  { pt: 'INFORMAÇÃO', en: 'INFORMATION', largura: 240, le: NOME },
  {
    pt: 'DESCRIÇÃO BIM FORUM',
    en: 'BIM FORUM DESCRIPTION',
    largura: 340,
    le: (r) => r.criterio.criterio_aceitacao,
  },
  {
    pt: 'PARÂMETRO REVIT',
    en: 'REVIT PARAMETER',
    largura: 170,
    le: (r) => r.criterio.parametro_esperado,
  },
  {
    pt: 'PARÂMETRO',
    en: 'PARAMETER',
    largura: 170,
    tipo: 'texto',
    campo: 'parametro_encontrado',
  },
  {
    pt: 'VERIFICAÇÃO',
    en: 'VERIFICATION',
    largura: 132,
    tipo: 'selecao',
    opcoes: VERIFICACAO,
    campo: 'status',
  },
  // COMMENTS, e não COMENTARY: aquela grafia é a do arquivo da auditoria GERAL,
  // que `BASE` continua usando. Aqui o rótulo é o que foi pedido para o LOD 300.
  { pt: 'COMENTÁRIOS', en: 'COMMENTS', largura: 260, tipo: 'texto', campo: 'comentario' },
  {
    pt: 'DO FORNECEDOR',
    en: 'SUPPLIERS COMMENTS',
    largura: 240,
    tipo: 'texto',
    campo: 'comentario_fornecedor',
  },
]

/** Recorte sem entrada aqui usa as colunas BASE. Não é falta de acabamento: as
 *  seis colunas da base são as que TODA planilha de auditoria tem, e um recorte
 *  que precise de mais ganha a própria lista no dia em que o arquivo de
 *  referência dele aparecer.
 *
 *  400 E 500 APONTAM PARA A MESMA LISTA DO 300, e é referência e não cópia: a
 *  pergunta que os três fazem é a de uma auditoria de ESPEC — o parâmetro está
 *  onde deveria? —, e a lista duplicada divergiria na primeira coluna que um
 *  deles ganhasse.
 *
 *  ELES NÃO TÊM ARQUIVO DE ESPEC PRÓPRIO (04/08/2026). Os controles em `Bases/`
 *  — `LOD400_SPECIFIC AUDIT_CONTROL.xlsx` e o do 500 — trazem uma aba por ÁREA,
 *  mas cada uma é matriz de CONTROLE: uma linha por modelo, com round, status e
 *  aprovação. Isso é outra coisa, e quem a desenha é a matriz do painel. A
 *  planilha de item destes dois herda a do 300 até a espec deles aparecer; no dia
 *  em que aparecer, é aqui que cada um ganha a própria lista. */
const COLUNAS: Partial<Record<Checklist, ColunaAud[]>> = {
  lod300: LOD,
  lod400: LOD,
  lod500: LOD,
}

/** OS RECORTES QUE SÃO POR ÁREA, e por isso ganham as abas.
 *
 *  Espelha `CHECKLISTS_POR_AREA` de `services/auditoria.py`, que é quem faz
 *  `POST /auditar` abrir UMA AUDITORIA POR ÁREA da disciplina nestes dois. É
 *  duplicação de vocabulário entre back e front, como `SENHA_MINIMA` — e pelo
 *  mesmo motivo: a tela precisa saber, antes de qualquer requisição, se desenha
 *  uma tabela ou várias.
 *
 *  A ORIGEM DAS ABAS SÃO OS ARQUIVOS: o controle de LOD 400 tem sete abas
 *  (ADMN, COLO1..COLO4, SITE, UTLS) e o de LOD 500 tem oito (com GUAR e WASTE
 *  SHED, sem COLO4). Os conjuntos são DIFERENTES entre os dois, e é por isso que
 *  a lista de abas não é constante aqui: ela sai das auditorias que existem. */
const POR_AREA: ReadonlySet<Checklist> = new Set<Checklist>(['lod400', 'lod500'])

/** ONDE A FAIXA DE GRUPO EXISTE — hoje em NENHUM recorte, e isso é decisão, não
 *  esquecimento.
 *
 *  A faixa é a coluna ELEMENT desenhada como cabeçalho que atravessa a tabela.
 *  Ela existia no LOD 300 porque lá o elemento era a estrutura do arquivo e não
 *  havia coluna para ele — "Level" na laje não é o mesmo critério que "Level" no
 *  pilar, e sem a faixa a planilha virava uma lista de nomes repetidos sem dizer
 *  de que elemento se falava.
 *
 *  EM 04/08/2026 ELEMENT VIROU COLUNA, a pedido, e as duas coisas passaram a
 *  mostrar o mesmo dado: a faixa escrevendo "Floor" acima de seis linhas que já
 *  trazem "Floor" na segunda coluna. Repetir o dado é o de menos; o problema é
 *  que são duas fontes para a mesma informação, e no dia em que uma mudar de
 *  origem a outra continua desenhando a antiga.
 *
 *  Na auditoria geral nunca houve faixa (01/08/2026): lá `criterio.categoria` é
 *  seção do checklist ("ASPECTOS GERAIS", "PARÂMETROS"), não elemento, e o
 *  arquivo de referência tem os 17 itens chapados.
 *
 *  O MECANISMO CONTINUA EM `GradePlanilha` e este conjunto continua aqui, vazio,
 *  pelo mesmo motivo de `CHECKLISTS_SEM_BANCO` em `nav.ts`: o recorte cuja
 *  planilha de origem AGRUPE e não tenha coluna própria para o grupo entra aqui,
 *  numa linha. */
const AGRUPA_POR_ELEMENTO: ReadonlySet<Checklist> = new Set<Checklist>()

function colunasDe(c: Checklist): ColunaAud[] {
  return COLUNAS[c] ?? BASE
}

function ehChecklist(v: string | undefined): v is Checklist {
  return !!v && (CHECKLISTS as readonly string[]).includes(v)
}

/** O que o `select` mostra a partir do que está no banco.
 *
 *  `pendente` vira VAZIO na tela: "ainda não olhei" não é uma resposta, e um
 *  select que já vem com valor faria a planilha nascer inteira respondida. */
function paraATela(r: Resultado, campo: Campo): string {
  if (campo === 'status') return r.status === 'pendente' ? '' : r.status
  return r[campo] ?? ''
}

/** E o caminho de volta. Vazio no status é `pendente` — apagar a resposta é
 *  desfazer a verificação, não gravar um estado novo; nos textos, vazio é
 *  `null`, para o banco não guardar string de zero caracteres onde o resto do
 *  sistema espera "não preenchido". */
function paraOServidor(campo: Campo, valor: string): Record<string, unknown> {
  if (campo === 'status') return { status: valor === '' ? 'pendente' : valor }
  return { [campo]: valor.trim() === '' ? null : valor }
}

/* ========================================================================== *
 *  MOCK — APAGAR ESTE BLOCO INTEIRO, junto com `mockLodArea.ts`.
 *
 *  Desenha as abas e a tabela de LOD 400 / LOD 500 com áreas e linhas
 *  inventadas, enquanto esses recortes não têm gabarito em `gabarito.py` e uma
 *  auditoria deles nasce sem uma linha sequer. Entra SÓ onde não haveria grade
 *  nenhuma, e entra TRAVADO.
 *
 *  As abas em si (`<Abas>`, `.abas`/`.aba`) NÃO são do mock — elas servem ao
 *  dado real e ficam. O que sai daqui é só o conteúdo inventado.
 * ========================================================================== */
function MockLodArea({ checklist }: { checklist: Checklist }) {
  const { L, lang } = useI18n()
  const areas = areasDeMentira(checklist)
  const [area, setArea] = useState(areas[0] ?? '')
  const colunas = colunasDe(checklist)
  const en = lang === 'en'

  const linhas: LinhaGrade[] = resultadosDeMentira(checklist, area).map((r) => ({
    chave: r.id,
    grupo: AGRUPA_POR_ELEMENTO.has(checklist) ? r.criterio.categoria : null,
    leitura: colunas.map((col) => col.le?.(r, en) ?? null),
    titulos: colunas.map((col) => (col.le === NOME ? r.criterio.instrucao : null)),
    valores: colunas.map((col) => (col.campo ? paraATela(r, col.campo) : '')),
    anexos: r.evidencias.length,
  }))

  return (
    <div className="plan-tela">
      <p className="plan-aviso plan-mock">
        {L(
          `DADOS DE EXEMPLO — as abas e a tabela existem só para mostrar o formato. Nada aqui vem do banco, nada aqui é gravado. As áreas são as do arquivo de controle; a área aberta é ${area}.`,
          `SAMPLE DATA — the tabs and table only show the layout. Nothing here comes from the database, nothing here is saved. The areas are the ones in the control file; the open area is ${area}.`,
        )}
      </p>
      <GradePlanilha colunas={colunas} dados={linhas} travada onSalvar={() => undefined} />
      <Abas areas={areas} atual={area} onTrocar={setArea} />
    </div>
  )
}

/** O mock, quando ele cabe: só em 400/500 e só com a chave ligada. */
function mockDeArea(checklist: Checklist) {
  if (!MOCK_LOD_AREA_LIGADO || !POR_AREA.has(checklist)) return null
  return <MockLodArea checklist={checklist} />
}
/* ===================== fim do bloco a apagar ============================== */

export default function Recorte() {
  const { L } = useI18n()
  const { projeto } = useProjeto()
  const { checklist, modeloId } = useParams<{ checklist: string; modeloId: string }>()

  if (!projeto) return <p className="hint">{L('Carregando…', 'Loading…')}</p>

  // Recorte que não existe: a URL foi digitada à mão ou o link é de uma versão
  // que tinha outro. Dizer qual é o problema custa uma linha e evita uma tela em
  // branco sem explicação.
  if (!ehChecklist(checklist)) {
    return (
      <Vazio
        titulo={L('Recorte desconhecido', 'Unknown scope')}
        texto={L(
          `"${checklist}" não é um checklist desta plataforma. Os disponíveis estão no menu, em Auditoria.`,
          `"${checklist}" is not a checklist on this platform. The available ones are in the Audit menu.`,
        )}
      />
    )
  }

  // SEM MODELO NÃO HÁ PLANILHA (01/08/2026, a pedido). Linha, coluna e célula
  // pertencem a UM modelo: a linha é um `resultado_check`, e resultado pertence
  // a uma auditoria, que pertence a uma versão de um modelo. Desenhar a grade
  // antes de escolher um mostra uma tabela que não é de nada — e a versão
  // anterior disto, a prévia do gabarito, era pior: parecia preenchível.
  if (!modeloId) {
    // MOCK — apagar estas duas linhas devolve o `<Vazio>` de sempre.
    const mock = mockDeArea(checklist)
    if (mock) return mock

    return (
      <Vazio
        titulo={L('Escolha um modelo', 'Pick a model')}
        texto={L(
          'A planilha é de um modelo: escolha um no painel à esquerda, sob a disciplina dele. Se não houver nenhum listado, o "+" abre a primeira auditoria deste recorte.',
          'The sheet belongs to a model: pick one in the left panel, under its discipline. If none is listed, the "+" opens the first audit of this scope.',
        )}
      />
    )
  }

  return <Planilha key={`${checklist}:${modeloId}`} checklist={checklist} modeloId={modeloId} />
}

/** AS ABAS DE ÁREA — a fileira de abas do Excel, embaixo da planilha.
 *
 *  EMBAIXO, e não no topo, porque é onde a planilha de origem as põe: quem passou
 *  anos naqueles arquivos procura as áreas no rodapé. É o mesmo argumento que fez
 *  a grade ser grade e não tabela espaçada (ver `GradePlanilha`).
 *
 *  A ABA ATIVA É TINTA E PESO, com BORDA — não fundo colorido (regras 1 e 6). O
 *  contorno é o que dá forma de aba a um texto; a cor cheia diria "estado", e
 *  estar numa aba não é estado do domínio. Hover escurece a tinta e só.
 *
 *  ELA NÃO APARECE COM UMA ÁREA SÓ: uma aba sozinha não é navegação, é rótulo —
 *  e o nome da área já está na planilha. Some sem deixar espaço em branco. */
function Abas({
  areas,
  atual,
  onTrocar,
}: {
  areas: string[]
  atual: string | null
  onTrocar: (area: string) => void
}) {
  if (areas.length < 2) return null
  return (
    <div className="abas thin-scroll" role="tablist">
      {areas.map((a) => (
        <button
          key={a}
          type="button"
          role="tab"
          aria-selected={a === atual}
          className={`aba${a === atual ? ' on' : ''}`}
          onClick={() => onTrocar(a)}
        >
          {a}
        </button>
      ))}
    </div>
  )
}

/** A PLANILHA DE UM MODELO — o que se preenche. */
function Planilha({ checklist, modeloId }: { checklist: Checklist; modeloId: string }) {
  const { L, lang } = useI18n()
  /** A ÁREA ABERTA, nos recortes que têm uma auditoria por área.
   *
   *  `null` = "a primeira que houver", e é o estado inicial: a lista de áreas só
   *  se conhece depois de carregar as auditorias, então escolher aqui exigiria
   *  adivinhar. Quem resolve é o efeito abaixo.
   *
   *  MORA NO COMPONENTE, não na URL. A rota já carrega recorte e modelo; pôr a
   *  área nela obrigaria a mexer no roteador e no `TELAS` do `ProjetoContext`,
   *  e o que se ganharia — um link para uma aba — ainda não foi pedido. Se for,
   *  é aqui que passa a sair de `useParams`. */
  const [area, setArea] = useState<string | null>(null)
  const p = usePlanilha(modeloId, checklist as ChecklistTipo, POR_AREA.has(checklist) ? area : null)
  const [linhaDaImagem, setLinhaDaImagem] = useState<string | null>(null)

  /** A PRIMEIRA ÁREA, assim que elas aparecem — e a volta ao chão quando a área
   *  aberta deixa de existir (trocou-se de modelo, e o novo tem outras áreas).
   *  Sem a segunda metade, a planilha ficaria vazia apontando para uma aba que
   *  não está mais na fileira. */
  useEffect(() => {
    const primeira = p.areas[0]
    if (primeira === undefined) return
    if (area === null || !p.areas.includes(area)) setArea(primeira)
  }, [p.areas, area])

  // O NOME DO MODELO CONTINUA INDO PARA O BREADCRUMB — página não tem `h1`
  // desde 30/07 e "Auditoria LOD300" não diz o que se está auditando —, mas
  // QUEM O PUBLICA PASSOU A SER `auditoria/index.tsx` (04/08/2026), junto com a
  // disciplina. O motivo é que a disciplina não existe aqui: `p.modelo` vem de
  // `GET /modelos/{id}`, que devolve `disciplina_id` e não o nome. Publicar dos
  // dois lugares faria o último a renderizar vencer, e o vencedor mudaria
  // conforme a ordem de chegada das duas requisições.

  const colunas = colunasDe(checklist)

  /** RETORNA A PROMESSA, e isso não é detalhe: é por ela que a célula de texto
   *  sabe que o pedido anterior terminou. Sem o `return`, o salvamento imediato
   *  viraria um PATCH por letra digitada. */
  const salvarCelula = useCallback(
    (chave: string, coluna: number, valor: string) => {
      const campo = colunas[coluna]?.campo
      const resultado = p.detalhe?.resultados.find((r) => r.id === chave)
      if (!campo || !resultado) return
      return p.salvar(resultado, paraOServidor(campo, valor))
    },
    [colunas, p],
  )

  const gerarNc = useCallback(
    (chave: string) => {
      const resultado = p.detalhe?.resultados.find((r) => r.id === chave)
      if (resultado) p.gerarNc(resultado)
    },
    [p],
  )

  if (p.carregando) return <p className="hint">{L('Carregando…', 'Loading…')}</p>

  if (!p.modelo) {
    return (
      <>
        <Erro mensagem={p.erro} />
        <Vazio
          titulo={L('Modelo não encontrado', 'Model not found')}
          texto={L(
            'O modelo pode ter sido removido. O painel à esquerda lista os que existem.',
            'The model may have been removed. The panel on the left lists the existing ones.',
          )}
        />
      </>
    )
  }

  if (!p.versao) {
    return (
      <>
        <Erro mensagem={p.erro} />
        <Vazio
          titulo={L('Sem versão para auditar', 'No version to audit')}
          texto={L(
            'Este modelo não tem versão registrada. A planilha nasce com a versão — registre a primeira na tela do modelo.',
            'This model has no registered version. The sheet is created with the version — register the first one on the model screen.',
          )}
        />
      </>
    )
  }

  if (!p.detalhe) {
    // MOCK — apagar estas duas linhas devolve a tela de sempre.
    const mock = mockDeArea(checklist)
    if (mock) return mock

    return (
      <>
        <Erro mensagem={p.erro} />
        <Vazio
          titulo={L('Esta auditoria não está aberta', 'This audit is not open')}
          texto={L(
            'Não há round deste recorte para a versão vigente. Abra pelo "+" do painel à esquerda, que também deixa registrar responsável, datas e prioridade.',
            'There is no round of this scope for the current version. Open it with the "+" in the left panel, which also records the owner, dates and priority.',
          )}
        />
      </>
    )
  }

  if (p.detalhe.resultados.length === 0) {
    // MOCK — apagar estas duas linhas devolve a tela de sempre. É o caso mais
    // provável em 400/500: não há gabarito, então a auditoria nasce sem linhas.
    const mock = mockDeArea(checklist)
    if (mock) return mock

    return (
      <>
        <Erro mensagem={p.erro} />
        <Vazio
          titulo={L('A planilha está sem linhas', 'The sheet has no rows')}
          texto={L(
            'A auditoria existe, mas o projeto não tem itens neste checklist. Aplique os itens de fábrica em Biblioteca de critérios › Compor checklist.',
            'The audit exists, but the project has no items in this checklist. Apply the factory items under Criteria library › Compose checklist.',
          )}
        />
      </>
    )
  }

  const en = lang === 'en'
  const linhas: LinhaGrade[] = p.detalhe.resultados.map((r) => ({
    chave: r.id,
    // A faixa de grupo é a coluna ELEMENT, e ela só existe onde a planilha de
    // origem agrupa sem ter coluna para o grupo — ver `AGRUPA_POR_ELEMENTO`.
    grupo: AGRUPA_POR_ELEMENTO.has(checklist) ? r.criterio.categoria : null,
    leitura: colunas.map((col) => col.le?.(r, en) ?? null),
    // A INSTRUÇÃO é a coluna OCULTA da planilha — diz COMO conferir o item, e
    // nunca foi para o fornecedor. Aqui ela é o `title` da célula do nome: uma
    // coluna própria a poria na frente de quem lê o portal, e uma linha abaixo
    // do nome dobraria a altura de todas as linhas por um texto que se consulta
    // uma vez.
    titulos: colunas.map((col) => (col.le === NOME ? r.criterio.instrucao : null)),
    valores: colunas.map((col) => (col.campo ? paraATela(r, col.campo) : '')),
    anexos: r.evidencias.length,
  }))

  const daImagem = p.detalhe.resultados.find((r) => r.id === linhaDaImagem)

  return (
    <div className="plan-tela">
      {/* UMA LINHA ACIMA DA PLANILHA, e só (01/08/2026, a pedido: "mantenha
          aquele padrão que tínhamos antes, mais simplificado").

          Saíram daqui a fileira de métricas (versão · itens · aprovação ·
          estado) e a de ações (`Ver o modelo`, `Publicar round`) — juntas
          comiam ~140px do alto de uma tela cuja razão de existir é a grade, e
          empurravam a linha 1 para baixo da dobra em monitor de notebook.

          NADA DE FUNÇÃO SE PERDEU: publicar round e o detalhe da versão vivem
          na TELA DO MODELO, que é onde se cuida do modelo — aqui se preenche a
          planilha. O percentual, que era a métrica útil, está na coluna
          APROVAÇÃO (%) linha a linha.

          O que fica é o que a tela não consegue dizer sozinha: que este round
          já foi publicado e por isso nada aceita edição. Sem essa frase, a
          planilha travada seria uma tela que ignora o que se digita sem
          explicar por quê.

          A FRASE "cada célula salva sozinha" SAIU (04/08/2026, a pedido). Ela
          era permanente e ocupava uma faixa de largura cheia acima da linha 1
          para ensinar, uma vez, algo que a própria planilha demonstra na
          primeira célula preenchida — e depois disso seguia lá, todo dia, na
          tela em que mais se rola. O "salvando…" FICA e passa a ser o único
          ocupante da faixa: ele responde "salvou?" no instante em que a
          pergunta existe, que é o trabalho que a frase fazia mal por
          antecipação.

          A FAIXA SÓ EXISTE QUANDO TEM O QUE DIZER. Renderizá-la vazia deixaria
          o buraco que a remoção veio tirar. */}
      {(p.publicada || p.ocupado) && (
        <p className="plan-aviso">
          {p.publicada &&
            L(
              'Round publicado — a planilha ficou somente leitura. Uma versão nova reabre a auditoria em outro round.',
              'Round published — the sheet is read-only. A new version reopens the audit in another round.',
            )}
          {p.ocupado && (
            <span className="plan-salvando">
              {p.publicada ? ' · ' : ''}
              {L('salvando…', 'saving…')}
            </span>
          )}
        </p>
      )}

      <Erro mensagem={p.erro} />

      <GradePlanilha
        colunas={colunas}
        dados={linhas}
        travada={p.publicada}
        onSalvar={salvarCelula}
        onImagem={setLinhaDaImagem}
        onAcao={gerarNc}
      />

      {/* DEPOIS DA GRADE, como no Excel. Só aparece nos recortes por área e só
          com mais de uma — ver `Abas`. */}
      <Abas areas={p.areas} atual={area} onTrocar={setArea} />

      <ImagemDaLinha
        aberta={!!daImagem}
        titulo={daImagem ? (en ? daImagem.criterio.nome_en : daImagem.criterio.nome_pt) : ''}
        evidencias={daImagem?.evidencias ?? []}
        travada={p.publicada}
        ocupado={p.ocupado}
        erro={p.erro}
        onFechar={() => setLinhaDaImagem(null)}
        onEnviar={(arquivo) => daImagem && p.enviarEvidencia(daImagem, arquivo)}
        onAbrir={p.abrirEvidencia}
        onRemover={p.removerEvidencia}
      />

    </div>
  )
}
