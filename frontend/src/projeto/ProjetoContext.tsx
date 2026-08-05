/** Projeto corrente.
 *
 *  O esquema é multi-projeto desde a Fase 0, mas quase toda tela opera sobre
 *  um projeto por vez — como no protótipo, que mostra o código do projeto na
 *  barra lateral com um "trocar" ao lado.
 *
 *  A URL É A FONTE DE VERDADE. Até 29/07/2026 o projeto corrente vivia só no
 *  `localStorage`, e isso tinha duas consequências ruins: `/painel` significava
 *  coisas diferentes para duas pessoas, e não havia como mandar a alguém o link
 *  do painel de um projeto. Agora quem manda é o `:projetoId` de
 *  `/projetos/:projetoId/...`; o `localStorage` sobrou como MEMÓRIA DO ÚLTIMO
 *  VISITADO, para responder "qual projeto?" nas telas que não têm um na URL
 *  (a home, a administração) e para redirecionar os links antigos.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useMatch, useNavigate } from 'react-router-dom'

import { ITENS_NAV } from '@/layout/nav'
import { api } from '@/lib/api'
import type { Projeto } from '@/lib/types'

const CHAVE = 'spbim_projeto'

/** As telas que sobrevivem a uma troca de projeto: as do menu, e só.
 *
 *  `modelos/<id>` NÃO está aqui, de propósito. Trocar de projeto estando no
 *  detalhe de um modelo levaria o id do modelo do projeto antigo para a URL do
 *  novo — um 404, ou pior, um modelo de outro projeto na tela. */
const TELAS = new Set(ITENS_NAV.filter((i) => i.escopo === 'projeto').map((i) => i.rota))

/** Prefixo das rotas com projeto. Um lugar só: o Shell monta os links a partir
 *  daqui e o `selecionar` desmonta o caminho por aqui. */
export const PREFIXO_PROJETO = '/projetos'

type Ctx = {
  projetos: Projeto[]
  /** O projeto da URL. `null` fora de uma rota de projeto — ou quando o id da
   *  URL não existe (ver `naoEncontrado`). */
  projeto: Projeto | null
  /** Para onde apontar quando NÃO há projeto na URL: o último visitado, ou o
   *  primeiro da lista. É o que faz o menu lateral continuar clicável a partir
   *  da home. `null` só quando a organização não tem nenhum projeto. */
  referencia: Projeto | null
  /** A URL traz um projeto que não está na lista: id inválido, projeto de outra
   *  organização, ou apagado depois que alguém salvou o link. */
  naoEncontrado: boolean
  /** Troca de projeto MANTENDO A TELA: quem está no painel do CPQ11 e troca
   *  cai no painel do outro, não numa tela inicial. */
  selecionar: (id: string) => void
  recarregar: () => Promise<void>
  carregando: boolean
}

const ProjetoContext = createContext<Ctx | null>(null)

function leUltimo(): string | null {
  try {
    return localStorage.getItem(CHAVE)
  } catch {
    return null
  }
}

export function ProjetoProvider({ children }: { children: ReactNode }) {
  const [projetos, setProjetos] = useState<Projeto[]>([])
  const [ultimo, setUltimo] = useState<string | null>(leUltimo)
  const [carregando, setCarregando] = useState(true)

  const navigate = useNavigate()
  // O `*` casa também com o caminho sem sufixo (`/projetos/abc`), então uma
  // rota de projeto sem tela ainda entrega o id — e o `EscopoProjeto` a
  // redireciona para o painel.
  const casado = useMatch(`${PREFIXO_PROJETO}/:projetoId/*`)
  const idDaUrl = casado?.params.projetoId ?? null
  const resto = casado?.params['*'] ?? ''

  const recarregar = useCallback(async () => {
    const pagina = await api.projetos.listar()
    setProjetos(pagina.itens)
  }, [])

  useEffect(() => {
    recarregar()
      .catch(() => setProjetos([]))
      .finally(() => setCarregando(false))
  }, [recarregar])

  const projeto = useMemo(
    () => (idDaUrl ? (projetos.find((p) => p.id === idDaUrl) ?? null) : null),
    [projetos, idDaUrl],
  )

  // Só é "não encontrado" depois de a lista chegar: durante o carregamento a
  // ausência é falta de dado, não id inválido — anunciar antes pisca um erro
  // na cara de quem só abriu um link válido.
  const naoEncontrado = !!idDaUrl && !carregando && !projeto

  // Memória do último visitado. Anda junto com a URL, não com o clique: assim
  // um link recebido de outra pessoa também passa a ser o "último".
  useEffect(() => {
    if (!projeto) return
    setUltimo(projeto.id)
    try {
      localStorage.setItem(CHAVE, projeto.id)
    } catch {
      /* modo privado: a memória vale só nesta sessão */
    }
  }, [projeto])

  const referencia = useMemo(
    () => projeto ?? projetos.find((p) => p.id === ultimo) ?? projetos[0] ?? null,
    [projeto, projetos, ultimo],
  )

  const selecionar = useCallback(
    (id: string) => {
      // Trocar de projeto MANTÉM A TELA: quem compara o painel de dois
      // projetos não quer voltar ao começo a cada troca. Só que "manter a
      // tela" vale para as telas do menu — um caminho com id dentro
      // (`modelos/<id>`) pertence ao projeto de origem e não se traduz. A
      // query cai junto, pela mesma razão: pode carregar id.
      const tela = TELAS.has(resto) ? resto : TELA_INICIAL
      navigate(rotaProjeto(id, tela))
    },
    [resto, navigate],
  )

  const valor = useMemo(
    () => ({
      projetos,
      projeto,
      referencia,
      naoEncontrado,
      selecionar,
      recarregar,
      carregando,
    }),
    [projetos, projeto, referencia, naoEncontrado, selecionar, recarregar, carregando],
  )
  return <ProjetoContext.Provider value={valor}>{children}</ProjetoContext.Provider>
}

export function useProjeto(): Ctx {
  const ctx = useContext(ProjetoContext)
  if (!ctx) throw new Error('useProjeto precisa estar dentro de <ProjetoProvider>')
  return ctx
}

/** A TELA EM QUE UM PROJETO ABRE (31/07/2026, a pedido). Era `modelos`, a lista
 *  de arquivos entregues. Passou a ser `kpis`: quem abre um projeto vem
 *  perguntar COMO ELE ESTÁ, e a lista de modelos responde outra coisa — quais
 *  arquivos existem —, que é a pergunta de quem já sabe o estado e vai trabalhar.
 *  É também a primeira entrada da barra do projeto, então abrir aqui faz o
 *  destino coincidir com o topo do menu em vez de contrariá-lo.
 *
 *  UM LUGAR SÓ, e é o ponto: este valor é o default de `rotaProjeto`, o destino
 *  do card da home, o do resultado de busca e o fallback da troca de projeto.
 *  Estava escrito `'modelos'` à mão em cada um dos quatro. */
export const TELA_INICIAL = 'kpis'

/** Caminho de uma tela dentro de um projeto. Use SEMPRE isto em vez de montar
 *  a string à mão: o dia em que o prefixo mudar, muda num lugar. */
export function rotaProjeto(projetoId: string, tela: string = TELA_INICIAL): string {
  return `${PREFIXO_PROJETO}/${projetoId}/${tela}`
}
