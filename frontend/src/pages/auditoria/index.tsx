/** O esqueleto da auditoria: o painel de MODELOS à esquerda, a planilha à
 *  direita.
 *
 *  OS SEIS RECORTES VOLTARAM A SER ENTRADAS DA BARRA (01/08/2026, a pedido) —
 *  Geral, 4D, LOD 300, LOD 400, LOD 500 e Relatórios · RNC, cada um com o seu
 *  ícone. O que motivou juntá-los num painel de dentro da página, em 29/07, foi
 *  o grupo com nove linhas e seis rótulos começando pela mesma palavra; o que
 *  resolve isso agora é o ÍCONE e o rótulo curto ("Geral", e não "Auditoria
 *  geral"): a palavra repetida saiu porque o grupo já se chama Auditoria.
 *
 *  E COM ISSO O PAINEL PERDEU O NÍVEL DE CIMA. Ele listava recorte › disciplina
 *  › modelo; com os recortes na barra, o primeiro nível existiria em dois
 *  lugares ao mesmo tempo, e dois lugares que precisam concordar divergem. Aqui
 *  ficam as duas perguntas que a barra não responde: QUE DISCIPLINAS têm
 *  auditoria neste recorte, e QUE MODELOS há dentro de cada uma.
 *
 *  O FORMATO É O DOS CANAIS DO VDCITY: painel de 300px à esquerda, conteúdo à
 *  direita, e os dois cabeçalhos na mesma linha de 48px. O painel RECOLHE — e
 *  recolher o desmonta, não o transforma em trilho de ícones: um código como
 *  `CPQ11-C-STRC-CONCR-ADMIN-R22` não sobrevive a virar ícone.
 *
 *  O BOTÃO DE RECOLHER fica no cabeçalho do CONTEÚDO. Se ficasse no do painel,
 *  recolher levaria embora o botão de trazer de volta.
 *
 *  Este arquivo é só o esqueleto e o painel. O que se vê à direita está em
 *  `Recorte.tsx` — a planilha de um modelo e a prévia da estrutura são a mesma
 *  tela, filha desta rota, para que o painel não pisque ao navegar entre elas.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Outlet, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'

import NovaAuditoria from '@/components/NovaAuditoria'
import { useI18n } from '@/i18n'
import { useMigalha } from '@/layout/migalha'
import { CHECKLISTS, ROTULO_CHECKLIST } from '@/layout/nav'
import { api } from '@/lib/api'
import type { AuditoriaDaLista } from '@/lib/types'
import { rotaProjeto, useProjeto } from '@/projeto/ProjetoContext'

const CHAVE_PAINEL = 'spbim_auditoria_painel'

/** O ícone `PanelLeft` do lucide, o mesmo do VDCity: um retângulo com a coluna
 *  da esquerda destacada. Diz o que o botão faz sem depender de rótulo. */
const PATH_PAINEL = 'M3 3h18v18H3zM9 3v18'
const PATH_LUPA = 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.3-4.3'
const PATH_MAIS = 'M12 5v14M5 12h14'
const PATH_CHEVRON = 'M9 18l6-6-6-6'

function leRecolhido(): boolean {
  try {
    return localStorage.getItem(CHAVE_PAINEL) === '1'
  } catch {
    return false
  }
}

/** As auditorias de um recorte, agrupadas por disciplina.
 *
 *  O RÓTULO É O NOME POR EXTENSO quando existe, e o código quando não — é a
 *  mesma regra da tabela de disciplinas, e por isso a coluna `nome` (migration
 *  0015) existe: numa barra de 300px, "Estrutura metálica" diz o que
 *  "STRC-STEEL" não diz a quem chegou hoje.
 *
 *  MODELO SEM DISCIPLINA CAI NUM GRUPO PRÓPRIO, no fim, em vez de sumir ou de se
 *  misturar ao primeiro grupo. É um estado real — `disciplina_id` é `SET NULL` e
 *  o modelo pode nascer antes da disciplina —, e escondê-lo faria a soma dos
 *  grupos não fechar com a contagem do recorte.
 *
 *  A ORDEM VEM DO SERVIDOR (`ORDER BY disciplina, modelo`), então o `Map`
 *  preserva-a: é ele que garante que reagrupar não reordene.
 *
 *  A CHAVE VEM JUNTO com o rótulo porque ela é o que identifica o grupo entre
 *  renderizações — dois projetos podem ter disciplinas de nome parecido, e é a
 *  chave que decide qual grupo está recolhido. */
function agrupar(linhas: AuditoriaDaLista[]): Array<[string, string, AuditoriaDaLista[]]> {
  const grupos = new Map<string, [string, string, AuditoriaDaLista[]]>()
  for (const l of linhas) {
    const chave = l.disciplina_codigo ?? '—'
    const rotulo = l.disciplina_nome ?? l.disciplina_codigo ?? 'Sem disciplina'
    if (!grupos.has(chave)) grupos.set(chave, [chave, rotulo, []])
    grupos.get(chave)?.[2].push(l)
  }
  return [...grupos.values()]
}

function Ico({ path, tam = 15 }: { path: string; tam?: number }) {
  return (
    <svg
      width={tam}
      height={tam}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  )
}

export default function Auditoria() {
  const { L } = useI18n()
  const { projeto } = useProjeto()
  const navegar = useNavigate()
  const { pathname } = useLocation()
  const { checklist, modeloId } = useParams<{ checklist: string; modeloId: string }>()

  const [recolhido, setRecolhido] = useState(leRecolhido)
  const [linhas, setLinhas] = useState<AuditoriaDaLista[]>([])
  const [busca, setBusca] = useState('')
  const [criando, setCriando] = useState(false)
  // OS GRUPOS GUARDAM OS FECHADOS, e não os abertos: quem entrou num recorte
  // quer ver o que há nele, e um padrão fechado exigiria um clique por
  // disciplina só para chegar ao modelo, que é o destino.
  const [fechados, setFechados] = useState<Record<string, boolean>>({})

  const alternar = useCallback(() => {
    setRecolhido((atual) => {
      const proximo = !atual
      try {
        localStorage.setItem(CHAVE_PAINEL, proximo ? '1' : '0')
      } catch {
        /* modo privado: a preferência vale só nesta sessão */
      }
      return proximo
    })
  }, [])

  const carregar = useCallback(() => {
    if (!projeto) return
    api.auditorias
      .doProjeto(projeto.id)
      .then(setLinhas)
      .catch(() => setLinhas([]))
  }, [projeto])

  useEffect(carregar, [carregar])

  // `/auditoria` sem recorte cai na geral. Feito aqui, e não com um `<Navigate>`
  // na rota, porque o recorte-padrão é conhecimento desta tela: se um dia a
  // geral deixar de ser o ponto de partida, muda-se uma linha.
  useEffect(() => {
    if (!checklist && projeto) {
      navegar(rotaProjeto(projeto.id, 'auditoria/geral'), { replace: true })
    }
  }, [checklist, projeto, navegar])

  const atual = CHECKLISTS.find((c) => c === checklist)

  /** Os modelos DESTE recorte, já filtrados pela busca.
   *
   *  A BUSCA CASA COM OS DOIS NÍVEIS: o nome da disciplina e o código do modelo.
   *  Digitar "estrutura" tem de achar o grupo inteiro e digitar "R22" tem de
   *  achar o modelo — quem procura não sabe de antemão em que nível está o que
   *  ele quer. */
  const doRecorte = useMemo(() => {
    const daqui = linhas.filter((l) => l.checklist === atual)
    const t = busca.trim().toLowerCase()
    if (!t) return daqui
    return daqui.filter((l) => {
      const disc = `${l.disciplina_nome ?? ''} ${l.disciplina_codigo ?? ''}`.toLowerCase()
      return disc.includes(t) || (l.modelo_codigo ?? '').toLowerCase().includes(t)
    })
  }, [linhas, atual, busca])

  /** A linha do modelo aberto. Sai de `linhas`, e NÃO de `doRecorte`: aquela é
   *  filtrada pela busca, e digitar no campo faria o nome do modelo aberto
   *  sumir do cabeçalho e do breadcrumb sem que se tenha saído dele. */
  const aberto = useMemo(
    () => (modeloId ? linhas.find((l) => l.modelo_id === modeloId) : undefined),
    [linhas, modeloId],
  )

  /** AS ÁREAS DO MODELO ABERTO — as abas do Excel, que desde 05/08/2026 moram
   *  aqui no painel e não mais no rodapé da planilha.
   *
   *  Saem da MESMA lista que o painel já carregou (`GET /projetos/{id}/
   *  auditorias`), filtrada pelo recorte e pelo modelo: nenhuma requisição a
   *  mais. É por isso que as abas puderam descer para cá — o dado já estava
   *  neste componente; era a planilha que o buscava por segunda vez.
   *
   *  Na ordem em que o servidor devolveu, que é a de criação — a mesma ordem em
   *  que a disciplina declarou as áreas, e a mesma das abas do arquivo. */
  const areas = useMemo(() => {
    const doModelo = linhas.filter((l) => l.checklist === atual && l.modelo_id === modeloId)
    const vistas: string[] = []
    // AS DECLARADAS NA DISCIPLINA primeiro, na ordem em que ela as declarou —
    // que é a ordem das abas do arquivo de origem.
    for (const l of doModelo) {
      for (const a of l.disciplina_areas) if (!vistas.includes(a)) vistas.push(a)
    }
    // E as que JÁ TÊM auditoria, se alguma estiver fora da lista da disciplina.
    // Acontece quando a área é retirada da disciplina depois de auditada: o
    // trabalho feito não pode sumir do painel só porque o escopo encolheu.
    for (const l of doModelo) {
      if (l.area && !vistas.includes(l.area)) vistas.push(l.area)
    }
    return vistas
  }, [linhas, atual, modeloId])

  /** A ÁREA ABERTA vive na QUERY, e é assim que ela chega à planilha — os dois
   *  componentes são irmãos, e o pai comum deles é a rota. Ver o comentário em
   *  `Recorte.tsx`, que é quem a consome. */
  const [params, setParams] = useSearchParams()
  const areaAtual = params.get('area')

  const trocarArea = useCallback(
    (a: string) => {
      setParams((atual) => {
        const proximo = new URLSearchParams(atual)
        proximo.set('area', a)
        return proximo
      })
    },
    [setParams],
  )

  // O BREADCRUMB TERMINA EM `disciplina › modelo` (04/08/2026, a pedido).
  //
  // QUEM PUBLICA É ESTA TELA, e não a planilha, porque a DISCIPLINA só existe
  // aqui: `GET /modelos/{id}` — o que o `Recorte` busca — devolve
  // `disciplina_id`, não o nome dela. A lista que este painel já carregou traz
  // `disciplina_nome` resolvido, então o nome sai de dado que já está em
  // memória, sem uma requisição a mais só para escrever uma palavra na barra.
  //
  // O HOOK VEM ANTES DO `return` de carregamento logo abaixo. Depois dele, ele
  // deixaria de rodar quando `projeto` é nulo e violaria a ordem dos hooks.
  useMigalha([aberto?.disciplina_nome, aberto?.modelo_codigo])

  if (!projeto) return <p className="hint">{L('Carregando…', 'Loading…')}</p>

  const titulo = atual ? L(...ROTULO_CHECKLIST[atual]) : L('Auditoria', 'Audit')
  const grupos = agrupar(doRecorte)

  return (
    <div className="pgsplit">
      {/* Desmontado quando recolhido — o `flex: 1` do conteúdo reflui e ocupa
          os 300px, que é o ponto de recolher. */}
      {!recolhido && (
        <aside className="pgside">
          {/* O CABEÇALHO É FERRAMENTA, não rótulo. Em 300px não cabem um título,
              um campo de busca e um botão; e o placeholder da busca já diz do
              que a lista é feita, que era todo o trabalho do rótulo. */}
          <div className="pghead pgferramentas">
            <div className="pgbusca">
              <Ico path={PATH_LUPA} tam={14} />
              <input
                className="f"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder={L('Disciplina ou modelo…', 'Discipline or model…')}
                aria-label={L('Buscar disciplina ou modelo', 'Search discipline or model')}
              />
            </div>
            <button
              type="button"
              className="pgmais"
              onClick={() => setCriando(true)}
              title={L('Nova auditoria', 'New audit')}
              aria-label={L('Nova auditoria', 'New audit')}
            >
              <Ico path={PATH_MAIS} tam={16} />
            </button>
          </div>

          {/* AS ABAS DE ÁREA — a fileira do Excel, agora AQUI (05/08/2026, a
              pedido). Elas ficavam no rodapé da planilha, que é onde o arquivo
              de origem as põe; subiram para o painel porque é aqui que se
              escolhe o que olhar — disciplina, modelo e agora área ficam no
              mesmo lugar, e a planilha à direita passa a ser só o que se
              preenche.

              LOGO ABAIXO DA BUSCA e ACIMA da lista: a área restringe o que a
              planilha mostra do modelo já escolhido, então ela pertence ao
              cabeçalho de ferramentas, não ao meio da árvore.

              SÓ COM MAIS DE UMA. Uma aba sozinha não é navegação, é rótulo — e o
              nome da área já está na planilha. Some sem deixar espaço em branco.

              A ABA ATIVA É TINTA E PESO, com BORDA — não fundo colorido (regras
              1 e 6). O contorno é o que dá forma de aba a um texto; a cor cheia
              diria "estado", e estar numa aba não é estado do domínio. */}
          {areas.length > 1 && (
            <div className="pgabas thin-scroll" role="tablist">
              {areas.map((a) => (
                <button
                  key={a}
                  type="button"
                  role="tab"
                  aria-selected={a === areaAtual}
                  className={`pgaba${a === areaAtual ? ' on' : ''}`}
                  onClick={() => trocarArea(a)}
                >
                  {a}
                </button>
              ))}
            </div>
          )}

          <nav className="pglist">
            {grupos.map(([chave, rotulo, doGrupo]) => {
              const aberta = !fechados[chave]
              return (
                <div key={chave} className="pgdisc">
                  {/* Botão inteiro, e não duas áreas de clique: disciplina não
                      tem tela para onde navegar, então a linha toda faz a única
                      coisa que ela sabe fazer. O chevron é `<span>` — dentro de
                      um botão, outro botão seria HTML inválido. */}
                  <button
                    type="button"
                    className="pgdisc-cab"
                    aria-expanded={aberta}
                    onClick={() => setFechados((f) => ({ ...f, [chave]: !f[chave] }))}
                  >
                    <span className={`pgchevron${aberta ? ' on' : ''}`}>
                      <Ico path={PATH_CHEVRON} tam={13} />
                    </span>
                    <span className="pgdisc-nome">{rotulo}</span>
                    <span className="pgconta">{doGrupo.length}</span>
                  </button>
                  {aberta &&
                    doGrupo.map((l) => (
                      <button
                        key={l.id}
                        type="button"
                        className={`pgsubitem${modeloId === l.modelo_id ? ' on' : ''}`}
                        onClick={() =>
                          navegar(
                            rotaProjeto(projeto.id, `auditoria/${atual}/${l.modelo_id ?? ''}`),
                          )
                        }
                        title={l.modelo_codigo ?? ''}
                      >
                        <span className="pgsubnome">{l.modelo_codigo}</span>
                        {/* A ÁREA quando houver: em LOD 400/500 o mesmo modelo
                            aparece uma vez por área, e sem ela as linhas ficam
                            idênticas. */}
                        {l.area && <span className="pgsubarea">{l.area}</span>}
                        {l.prioridade && (
                          <span className={`pgprio p-${l.prioridade}`} aria-hidden="true" />
                        )}
                      </button>
                    ))}
                </div>
              )
            })}

            {grupos.length === 0 && (
              <span className="pgsubvazio">
                {busca.trim()
                  ? L('Nada encontrado.', 'Nothing found.')
                  : L(
                      'Nada auditado neste recorte ainda. O "+" abre a primeira.',
                      'Nothing audited in this scope yet. The "+" opens the first one.',
                    )}
              </span>
            )}
          </nav>
        </aside>
      )}

      <section className="pgmain">
        <div className="pghead">
          <button
            type="button"
            className="pgtoggle"
            aria-pressed={recolhido}
            onClick={alternar}
            title={
              recolhido
                ? L('Mostrar os modelos', 'Show models')
                : L('Recolher os modelos', 'Collapse models')
            }
          >
            <Ico path={PATH_PAINEL} />
          </button>
          {/* UM NOME SÓ, E É O DO QUE SE ESTÁ VENDO (04/08/2026, a pedido).
              Com modelo aberto o cabeçalho é o CÓDIGO DELE; sem modelo, é o
              nome do recorte.

              O recorte não se perde ao sair daqui: ele está no breadcrumb da
              topbar, poucos pixels acima e na mesma margem, junto da disciplina.
              Mantê-lo também aqui escrevia `Auditoria geral / CPQ04-ARCH-NONE-
              DATA` a quatro pixels de tamanho do `Geral / Architecture /
              CPQ04-ARCH-NONE-DATA` logo acima — a mesma informação duas vezes na
              vertical, e o modelo repetido em ambas. É a razão que tirou o `h1`
              das vinte telas em 30/07: quem nomeia o caminho é o breadcrumb.

              A classe do breadcrumb fica, e não é enfeite: é o que dá ao nome o
              mesmo peso e o mesmo tom de "onde eu estou" que a barra usa. */}
          <span className="tb-crumbs">
            <span className="tb-crumb atual">{aberto?.modelo_codigo ?? titulo}</span>
          </span>
          {/* Sem modelo, o que está à direita é a ESTRUTURA do recorte, e ela
              não se preenche. Dizer isso aqui evita que alguém responda dezessete
              linhas antes de descobrir que não havia onde gravá-las. */}
          {!modeloId && (
            <span className="co">· {L('estrutura do recorte', 'scope structure')}</span>
          )}
        </div>
        <div className="pgbody" key={pathname}>
          <Outlet />
        </div>
      </section>

      {/* MONTADA FORA do `.pgside`: com o painel recolhido a gaveta continua
          existindo, e quem a abriu antes de recolher não a perde. */}
      <NovaAuditoria
        aberta={criando}
        projetoId={projeto.id}
        checklistInicial={atual}
        onFechar={() => setCriando(false)}
        onCriada={carregar}
      />
    </div>
  )
}
