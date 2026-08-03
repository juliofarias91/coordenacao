/** O que cada recorte de auditoria mostra: A GRADE.
 *
 *  Uma tela só, parametrizada pela rota (`auditoria/:checklist`), dentro do
 *  esqueleto de `index.tsx`.
 *
 *  A ESTRUTURA É O PADRÃO, NÃO CONFIGURAÇÃO DE PROJETO (31/07/2026, a pedido).
 *  Os 17 itens da auditoria geral são os mesmos nas oito disciplinas e em todo
 *  projeto — é o que `services/gabarito.py` guarda, e é isso que a grade desenha,
 *  via `GET /gabaritos/{checklist}`.
 *
 *  Isto substituiu uma versão que lia o checklist COMPOSTO do projeto e, num
 *  projeto novo, mostrava uma tela vazia com um botão "aplicar os itens de
 *  fábrica". Aquilo era um passo que não correspondia a decisão nenhuma: a
 *  resposta é sempre sim, e o padrão é padrão antes de qualquer clique. O POST
 *  que semeia continua existindo em Biblioteca de critérios — ele serve a outra
 *  coisa, que é o projeto ADOTAR o padrão como dado editável (renomear um item,
 *  acrescentar o 18º).
 *
 *  ESTA TELA FOI ESVAZIADA ANTES, e o que saiu daqui continua fora: o parágrafo
 *  de explicação de cada recorte, o `ControleGeral` e a `TabelaMatriz`. O texto
 *  dos cinco parágrafos está em `git log -- frontend/src/pages/auditoria/`.
 *  `TabelaMatriz` segue em uso em `pages/Painel.tsx`; `ControleGeral` ficou
 *  órfão — o caminho para a planilha de um modelo passou a ser o dropdown do
 *  painel à esquerda.
 */
import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

import GradePlanilha, { type Coluna } from '@/components/GradePlanilha'
import { Erro, Vazio } from '@/components/ui'
import { useI18n } from '@/i18n'
import { CHECKLISTS, type Checklist } from '@/layout/nav'
import { ApiError, api } from '@/lib/api'
import type { ChecklistTipo, LinhaGabarito } from '@/lib/types'
import { useProjeto } from '@/projeto/ProjetoContext'

/** AS COLUNAS DE CADA RECORTE, quando ele já as tem.
 *
 *  Recorte que não está aqui cai nas letras (A, B, C…) — e isso é informação,
 *  não falta de acabamento: diz que aquele recorte ainda não teve as colunas
 *  definidas.
 *
 *  OS RÓTULOS SÃO BILÍNGUES, e o inglês é o da planilha COMO ELA O ESCREVE —
 *  inclusive `COMENTARY`, que é a grafia do arquivo de referência. Não é erro de
 *  digitação: é o rótulo que a coordenação lê há anos, e "corrigir" para
 *  COMMENTARY faria a tela e a planilha divergirem na primeira conferência lado a
 *  lado. A migration 0008 e `services/exports.py` já usam essa grafia.
 *  O português existe porque uma fileira de cabeçalhos em inglês no meio de uma
 *  tela traduzida é a única coisa da tela que não fala a língua de quem a lê.
 *
 *  AS LARGURAS SEPARAM PROSA DE DADO, e são PESOS: a tabela ocupa a largura toda
 *  e o espaço que sobra se reparte em proporção a estes números. `COMENTARY` e
 *  `DIRECTION` são as duas frases que a coordenação escreve por linha reprovada
 *  (o diagnóstico e a orientação ao fornecedor — migration 0008), e `INFORMATION`
 *  é o texto do item. As três precisam de largura; `IMAGE` e as duas curtas
 *  cedem. */
const COLUNAS: Partial<Record<Checklist, Coluna[]>> = {
  geral: [
    { pt: 'INFORMAÇÃO', en: 'INFORMATION', largura: 340 },
    {
      pt: 'VERIFICAÇÃO',
      en: 'VERIFICATION',
      largura: 132,
      tipo: 'selecao',
      // O VALOR é `aprovado`/`reprovado` — o `CheckStatus` que a coluna vai
      // gravar quando a planilha passar a salvar. O rótulo é o da planilha em
      // cada idioma. Guardar o rótulo faria a tradução virar dado, e comparar
      // por ele reabriria a armadilha do "NOT APPROVED" que contém "APPROVED".
      opcoes: [
        { valor: 'aprovado', pt: 'APROVADO', en: 'APPROVED' },
        { valor: 'reprovado', pt: 'NÃO APROVADO', en: 'NOT APPROVED' },
      ],
    },
    { pt: 'COMENTÁRIO', en: 'COMENTARY', largura: 280, tipo: 'texto' },
    { pt: 'IMAGEM', en: 'IMAGE', largura: 72, tipo: 'imagem' },
    // DIRECTION é ORIENTAÇÃO, não "direção": é a frase que diz ao fornecedor o
    // que fazer. A migration 0008 usa exatamente essa palavra ao descrever o
    // campo, e "direção" em português levaria a pensar em sentido/rumo.
    { pt: 'ORIENTAÇÃO', en: 'DIRECTION', largura: 280, tipo: 'texto' },
    { pt: 'APROVAÇÃO (%)', en: 'APPROVED (%)', largura: 116, tipo: 'calculado' },
  ],
}

function ehChecklist(v: string | undefined): v is Checklist {
  return !!v && (CHECKLISTS as readonly string[]).includes(v)
}

export default function Recorte() {
  const { L, lang } = useI18n()
  const { projeto } = useProjeto()
  const { checklist } = useParams<{ checklist: string }>()

  const [itens, setItens] = useState<LinhaGabarito[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)

  const valido = ehChecklist(checklist)

  const carregar = useCallback(async () => {
    if (!valido) return
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
  }, [checklist, valido])

  useEffect(() => {
    carregar()
  }, [carregar])

  if (!projeto) return <p className="hint">{L('Carregando…', 'Loading…')}</p>

  // Recorte que não existe: a URL foi digitada à mão ou o link é de uma versão
  // que tinha outro. Dizer qual é o problema custa uma linha e evita uma tela
  // em branco sem explicação.
  if (!valido) {
    return (
      <Vazio
        titulo={L('Recorte desconhecido', 'Unknown scope')}
        texto={L(
          `"${checklist}" não é um checklist desta plataforma. Os disponíveis estão no painel à esquerda.`,
          `"${checklist}" is not a checklist on this platform. The available ones are in the panel on the left.`,
        )}
      />
    )
  }

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

  // A COLUNA INFORMATION é a primeira; as outras cinco se respondem na tela.
  //
  // `nome_en` no inglês e `nome_pt` no português: o rótulo da coluna INFORMATION
  // na planilha é o inglês, mas quem está com a interface em português lê a
  // linha em português no resto do sistema. As duas grafias vêm do mesmo item do
  // gabarito, então não há como divergirem.
  const celulas = itens.map((i) => [lang === 'en' ? i.nome_en : i.nome_pt])

  return (
    <>
      <Erro mensagem={erro} />
      {/* `key` no recorte: trocar de recorte tem de devolver a grade ao começo,
          e não manter a célula selecionada do recorte anterior — que passaria a
          apontar para uma coluna que talvez não exista no próximo. */}
      <GradePlanilha key={checklist} rotulos={COLUNAS[checklist]} celulas={celulas} />
    </>
  )
}
