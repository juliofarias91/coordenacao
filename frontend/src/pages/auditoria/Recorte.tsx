/** O RECORTE DE AUDITORIA — a planilha, com modelo ou sem ele.
 *
 *  Uma tela só, parametrizada pela rota (`auditoria/:checklist/:modeloId?`),
 *  dentro do esqueleto de `index.tsx`. É a MESMA para os cinco recortes: o que
 *  muda entre eles são as COLUNAS, e elas estão na tabela `COLUNAS` abaixo.
 *
 *  **Com modelo** (`auditoria/lod300/<id>`) ela é a planilha de verdade: cada
 *  linha é um `resultado_check` e cada célula grava sozinha. **Sem modelo** ela é
 *  a prévia do gabarito — a estrutura do recorte, travada, porque auditoria
 *  pertence a um modelo e não há linha no banco em que gravar.
 *
 *  A ESTRUTURA É O PADRÃO, NÃO CONFIGURAÇÃO DE PROJETO (31/07/2026, a pedido).
 *  Os 17 itens da auditoria geral são os mesmos nas oito disciplinas e em todo
 *  projeto — é o que `services/gabarito.py` guarda, e é isso que a prévia
 *  desenha, via `GET /gabaritos/{checklist}`.
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
import { Link, useParams } from 'react-router-dom'

import GradePlanilha, { type Coluna, type LinhaGrade } from '@/components/GradePlanilha'
import ImagemDaLinha from '@/components/ImagemDaLinha'
import { usePlanilha } from '@/components/planilha'
import { Erro, Vazio } from '@/components/ui'
import { useI18n } from '@/i18n'
import { useMigalha } from '@/layout/migalha'
import { CHECKLISTS, ROTULO_CHECKLIST, type Checklist } from '@/layout/nav'
import { ApiError, api } from '@/lib/api'
import type { ChecklistTipo, LinhaGabarito, Resultado } from '@/lib/types'
import { rotaProjeto, useProjeto } from '@/projeto/ProjetoContext'

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

/** O LOD 300 é ELEMENTO × INFORMAÇÃO, e por isso tem três colunas a mais.
 *
 *  `parametro_esperado` é onde a informação DEVERIA estar (vem do critério, e
 *  não se digita); `parametro_encontrado` é onde ela FOI achada (migration
 *  0009). A comparação entre os dois é a única pergunta que a planilha faz — por
 *  isso ficam lado a lado. `comentario_fornecedor` tem outro AUTOR: o guia do
 *  arquivo diz "SUPPLIERS COMMENTS — permissão de edição: FORNECEDORES".
 *
 *  A coluna ELEMENT não é coluna: ela agrupa, e vira a faixa que atravessa a
 *  tabela (`grupo`, em `LinhaGrade`). */
const LOD: ColunaAud[] = [
  { pt: 'INFORMAÇÃO', en: 'INFORMATION', largura: 300, le: NOME },
  {
    pt: 'PARÂMETRO ESPERADO',
    en: 'EXPECTED PARAMETER',
    largura: 170,
    le: (r) => r.criterio.parametro_esperado,
  },
  {
    pt: 'PARÂMETRO ENCONTRADO',
    en: 'FOUND PARAMETER',
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
  { pt: 'COMENTÁRIO', en: 'COMENTARY', largura: 240, tipo: 'texto', campo: 'comentario' },
  {
    pt: 'DO FORNECEDOR',
    en: 'SUPPLIER’S',
    largura: 220,
    tipo: 'texto',
    campo: 'comentario_fornecedor',
  },
  { pt: 'IMAGEM', en: 'IMAGE', largura: 72, tipo: 'imagem' },
  { pt: 'ORIENTAÇÃO', en: 'DIRECTION', largura: 240, tipo: 'texto', campo: 'direcao' },
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

/** Recorte sem entrada aqui usa as colunas BASE. Não é falta de acabamento: as
 *  seis colunas da base são as que TODA planilha de auditoria tem, e um recorte
 *  que precise de mais ganha a própria lista no dia em que o arquivo de
 *  referência dele aparecer. */
const COLUNAS: Partial<Record<Checklist, ColunaAud[]>> = { lod300: LOD }

/** ONDE A FAIXA DE GRUPO EXISTE — e ela existe onde a PLANILHA DE ORIGEM tem a
 *  coluna ELEMENT.
 *
 *  No LOD 300 o agrupamento é a estrutura do arquivo: 60 linhas em 4 categorias
 *  de elemento, e "Level" na laje não é o mesmo critério que "Level" no pilar.
 *  Sem a faixa, a planilha vira uma lista de nomes repetidos sem dizer de que
 *  elemento se fala.
 *
 *  NA AUDITORIA GERAL NÃO (01/08/2026, a pedido). Lá `criterio.categoria` é
 *  seção do checklist ("ASPECTOS GERAIS", "PARÂMETROS"), não elemento — e o
 *  arquivo de referência tem os 17 itens CHAPADOS, sem seção nenhuma. A faixa
 *  acrescentava três linhas de cabeçalho a uma planilha de dezessete, dividindo
 *  em três o que se lê de uma vez. */
const AGRUPA_POR_ELEMENTO: ReadonlySet<Checklist> = new Set<Checklist>(['lod300'])

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

  return modeloId ? (
    <Planilha key={`${checklist}:${modeloId}`} checklist={checklist} modeloId={modeloId} />
  ) : (
    <Previa key={checklist} checklist={checklist} />
  )
}

/** A PLANILHA DE UM MODELO — o que se preenche. */
function Planilha({ checklist, modeloId }: { checklist: Checklist; modeloId: string }) {
  const { L, lang } = useI18n()
  const { projeto } = useProjeto()
  const p = usePlanilha(modeloId, checklist as ChecklistTipo)
  const [linhaDaImagem, setLinhaDaImagem] = useState<string | null>(null)

  // O NOME DO MODELO VAI PARA O CABEÇALHO PRINCIPAL. Página não tem `h1` desde
  // 30/07 — quem nomeia a tela é o breadcrumb —, e "Auditoria LOD300" não diz o
  // que se está auditando. Ver `layout/migalha.tsx`.
  useMigalha(p.modelo?.codigo)

  const colunas = colunasDe(checklist)

  const salvarCelula = useCallback(
    (chave: string, coluna: number, valor: string) => {
      const campo = colunas[coluna]?.campo
      const resultado = p.detalhe?.resultados.find((r) => r.id === chave)
      if (!campo || !resultado) return
      p.salvar(resultado, paraOServidor(campo, valor))
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

  const voltar = rotaProjeto(projeto?.id ?? '', `auditoria/${checklist}`)

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
    // origem tem essa coluna — ver `AGRUPA_POR_ELEMENTO`.
    grupo: AGRUPA_POR_ELEMENTO.has(checklist) ? r.criterio.categoria : null,
    leitura: colunas.map((col) => col.le?.(r, en) ?? null),
    // A INSTRUÇÃO é a coluna OCULTA da planilha — diz COMO conferir o item, e
    // nunca foi para o fornecedor. Aqui ela é o `title` da célula do nome: uma
    // coluna própria a poria na frente de quem lê o portal, e uma linha abaixo
    // do nome dobraria a altura das 17 linhas por um texto que se consulta uma
    // vez.
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

          O que fica é o que a tela não consegue dizer sozinha: que ninguém
          precisa salvar, ou que este round já foi publicado e por isso nada
          aceita edição. Sem essa segunda frase, a planilha travada seria uma
          tela que ignora o que se digita sem explicar por quê. */}
      <p className="plan-aviso">
        {p.publicada
          ? L(
              'Round publicado — a planilha ficou somente leitura. Uma versão nova reabre a auditoria em outro round.',
              'Round published — the sheet is read-only. A new version reopens the audit in another round.',
            )
          : L('Cada célula salva sozinha — não há botão de salvar.', 'Every cell saves on its own — there is no save button.')}
        {p.ocupado && <span className="plan-salvando"> · {L('salvando…', 'saving…')}</span>}
      </p>

      <Erro mensagem={p.erro} />

      <GradePlanilha
        rotulos={colunas}
        dados={linhas}
        travada={p.publicada}
        onSalvar={salvarCelula}
        onImagem={setLinhaDaImagem}
        onAcao={gerarNc}
      />

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

      {/* O caminho de volta ao recorte sem modelo. Discreto e no fim: quem está
          aqui veio para preencher, e a lista de modelos continua no painel da
          esquerda — este link é para quem quer ver a ESTRUTURA do recorte. */}
      <div className="crumb">
        <Link to={voltar}>
          {L(`← Estrutura de ${L(...ROTULO_CHECKLIST[checklist])}`, '← Scope structure')}
        </Link>
      </div>
    </div>
  )
}

/** A PRÉVIA DO RECORTE — a estrutura, sem modelo. */
function Previa({ checklist }: { checklist: Checklist }) {
  const { L, lang } = useI18n()

  const [itens, setItens] = useState<LinhaGabarito[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)

  const carregar = useCallback(async () => {
    setErro(null)
    setCarregando(true)
    try {
      setItens(await api.gabaritos.obter(checklist as ChecklistTipo))
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : String(e))
      setItens([])
    } finally {
      setCarregando(false)
    }
  }, [checklist])

  useEffect(() => {
    carregar()
  }, [carregar])

  if (carregando) return <p className="hint">{L('Carregando…', 'Loading…')}</p>

  // Recorte SEM estrutura de fábrica — hoje 4D, LOD 400 e 500. Não é erro nem
  // pendência do projeto: é o gabarito daquele recorte que ainda não foi
  // desenhado, e o lugar de desenhá-lo é `services/gabarito.py`.
  if (!erro && itens.length === 0) {
    return (
      <div className="pgvazio">
        <Vazio
          titulo={L('Este recorte não tem estrutura definida', 'This scope has no structure yet')}
          texto={L(
            'As linhas e colunas deste recorte ainda não foram definidas. A auditoria geral já tem as dela; as dos demais entram à medida que os arquivos de referência forem levantados.',
            'The rows and columns of this scope have not been defined yet. The general audit already has its own; the others come as the reference files are gathered.',
          )}
        />
      </div>
    )
  }

  // A COLUNA INFORMATION é a primeira; as outras se respondem na planilha de um
  // modelo. `nome_en` no inglês e `nome_pt` no português: o rótulo da coluna é o
  // inglês, mas quem está com a interface em português lê a linha em português
  // no resto do sistema.
  const celulas = itens.map((i) => [lang === 'en' ? i.nome_en : i.nome_pt])

  return (
    <div className="plan-tela">
      <Erro mensagem={erro} />
      <p className="hint">
        {L(
          'Esta é a ESTRUTURA do recorte — os itens de fábrica, iguais em todo projeto. Para preencher, escolha um modelo no painel à esquerda: a auditoria pertence a um modelo, e é lá que as respostas são gravadas.',
          'This is the scope STRUCTURE — the factory items, the same in every project. To fill it in, pick a model in the left panel: an audit belongs to a model, and that is where answers are stored.',
        )}
      </p>
      <GradePlanilha rotulos={colunasDe(checklist)} celulas={celulas} />
    </div>
  )
}
