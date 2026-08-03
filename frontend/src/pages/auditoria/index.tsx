/** A auditoria — UMA entrada na barra, os recortes num painel da página.
 *
 *  Os recortes já foram seis itens da barra lateral do projeto, e o grupo
 *  Auditoria ficou com nove linhas: mais do que Visão geral e Projeto somados,
 *  empurrando para fora da vista justamente o que se configura ANTES de
 *  auditar. E seis rótulos que começam com a mesma palavra ("Auditoria geral",
 *  "Auditoria 4D"…) obrigam a ler até o fim de cada um para escolher.
 *
 *  O FORMATO É O DOS CANAIS DO VDCITY: painel de 300px à esquerda, conteúdo à
 *  direita, e os dois cabeçalhos na mesma linha de 48px. O painel RECOLHE — e
 *  recolher o desmonta, não o transforma em trilho de ícones: seis rótulos como
 *  "Auditoria LOD500" não sobrevivem a virar ícone, e um trilho de cinco selos
 *  idênticos não diria nada.
 *
 *  CADA RECORTE É UM DROPDOWN DOS MODELOS AUDITADOS NELE (31/07/2026, a pedido).
 *  A lista de tipos respondia "que recortes existem", que é uma pergunta que se
 *  faz uma vez; a de todo dia é "o que já foi auditado, e falta o quê" — e para
 *  responder isso era preciso entrar em cada recorte e ler a tabela. Com os
 *  modelos dentro do tipo, o painel passa a ser o estado do projeto, não um
 *  índice.
 *
 *  A CONTAGEM AO LADO DO TIPO É O QUE FAZ O RECORTE VAZIO SE ANUNCIAR. Um tipo
 *  com zero auditorias continua na lista, e é isso que distingue "ninguém
 *  auditou LOD 400 ainda" de "LOD 400 não existe neste projeto".
 *
 *  O BOTÃO DE RECOLHER fica no cabeçalho do CONTEÚDO. Se ficasse no do painel,
 *  recolher levaria embora o botão de trazer de volta.
 *
 *  Este arquivo é só o esqueleto e o painel. O que cada recorte mostra está em
 *  `Recorte.tsx`, e a planilha de um modelo nas suas próprias telas — todas
 *  filhas desta rota, para que o painel não pisque ao navegar entre elas.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Outlet, useLocation, useNavigate, useParams } from 'react-router-dom'

import NovaAuditoria from '@/components/NovaAuditoria'
import { useI18n } from '@/i18n'
import { CHECKLISTS, ROTULO_CHECKLIST, type Checklist } from '@/layout/nav'
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
 *  misturar ao primeiro grupo. É um estado real — `disciplina_id` é `SET NULL` e o
 *  modelo pode nascer antes da disciplina —, e escondê-lo faria a soma dos grupos
 *  não fechar com a contagem do recorte.
 *
 *  A ORDEM VEM DO SERVIDOR (`ORDER BY disciplina, modelo`), então o `Map`
 *  preserva-a: é ele que garante que reagrupar não reordene. */
function agrupar(
  linhas: AuditoriaDaLista[],
): Array<[string, string | null, AuditoriaDaLista[]]> {
  const grupos = new Map<string, [string, string | null, AuditoriaDaLista[]]>()
  for (const l of linhas) {
    const chave = l.disciplina_codigo ?? '—'
    const rotulo = l.disciplina_nome ?? l.disciplina_codigo ?? 'Sem disciplina'
    if (!grupos.has(chave)) grupos.set(chave, [rotulo, l.disciplina_macro, []])
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
  const [abertos, setAbertos] = useState<Record<string, boolean>>({})

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

  // O recorte em que se está nasce ABERTO. Quem entrou em LOD 300 quer ver os
  // modelos de LOD 300, não abrir o dropdown para descobri-los.
  useEffect(() => {
    if (checklist) setAbertos((atual) => ({ ...atual, [checklist]: true }))
  }, [checklist])

  /** As linhas por recorte, já filtradas pela busca.
   *
   *  A BUSCA CASA COM OS DOIS NÍVEIS: o nome do recorte e o código do modelo.
   *  Digitar "STRC" tem de achar o modelo dentro dos tipos, e digitar "LOD" tem
   *  de achar os tipos — quem procura não sabe de antemão em que nível está o
   *  que ele quer. Um recorte que casa pelo NOME mantém todos os seus modelos;
   *  um que casa só por um modelo mostra apenas ele. */
  const porRecorte = useMemo(() => {
    const t = busca.trim().toLowerCase()
    const mapa = new Map<Checklist, AuditoriaDaLista[]>()
    for (const c of CHECKLISTS) {
      const doTipo = linhas.filter((l) => l.checklist === c)
      const rotulo = `${ROTULO_CHECKLIST[c][0]} ${ROTULO_CHECKLIST[c][1]}`.toLowerCase()
      if (!t || rotulo.includes(t)) {
        mapa.set(c, doTipo)
        continue
      }
      const casam = doTipo.filter((l) => (l.modelo_codigo ?? '').toLowerCase().includes(t))
      if (casam.length) mapa.set(c, casam)
    }
    return mapa
  }, [linhas, busca])

  if (!projeto) return <p className="hint">{L('Carregando…', 'Loading…')}</p>

  const atual = CHECKLISTS.find((c) => c === checklist)
  const titulo = atual ? L(...ROTULO_CHECKLIST[atual]) : L('Auditoria', 'Audit')

  return (
    <div className="pgsplit">
      {/* Desmontado quando recolhido — o `flex: 1` do conteúdo reflui e ocupa
          os 300px, que é o ponto de recolher. */}
      {!recolhido && (
        <aside className="pgside">
          {/* O CABEÇALHO PERDEU O RÓTULO "RECORTES" e virou ferramenta. Em 300px
              não cabem um título, um campo de busca e um botão; e o placeholder
              da busca já diz do que a lista é feita, que era todo o trabalho do
              rótulo. */}
          <div className="pghead pgferramentas">
            <div className="pgbusca">
              <Ico path={PATH_LUPA} tam={14} />
              <input
                className="f"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder={L('Recorte ou modelo…', 'Scope or model…')}
                aria-label={L('Buscar recorte ou modelo', 'Search scope or model')}
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

          <nav className="pglist">
            {CHECKLISTS.map((c) => {
              const doTipo = porRecorte.get(c)
              // Fora do filtro: o recorte some inteiro. Deixá-lo com "0" durante
              // uma busca mentiria — o zero passaria por "nada auditado" quando
              // o que houve foi um filtro.
              if (!doTipo) return null

              const dentro = checklist === c
              const aberto = !!abertos[c]
              return (
                <div key={c} className="pggrupo">
                  <div className={`pgitem pgpai${dentro ? ' on' : ''}`}>
                    {/* DUAS ÁREAS DE CLIQUE, e é de propósito: o chevron abre e
                        fecha, o rótulo NAVEGA. Um clique só que fizesse as duas
                        obrigaria quem quer apenas espiar a lista a sair da tela
                        em que está. */}
                    <button
                      type="button"
                      className={`pgchevron${aberto ? ' on' : ''}`}
                      onClick={() => setAbertos((a) => ({ ...a, [c]: !a[c] }))}
                      aria-expanded={aberto}
                      aria-label={
                        aberto
                          ? L('Recolher os modelos', 'Collapse models')
                          : L('Ver os modelos', 'Show models')
                      }
                    >
                      <Ico path={PATH_CHEVRON} tam={13} />
                    </button>
                    <button
                      type="button"
                      className="pgrotulo"
                      aria-current={dentro ? 'page' : undefined}
                      onClick={() => navegar(rotaProjeto(projeto.id, `auditoria/${c}`))}
                    >
                      {L(...ROTULO_CHECKLIST[c])}
                    </button>
                    {/* Sem contagem quando é zero: um "0" ao lado de cada tipo
                        não auditado enche a coluna de zeros. A ausência já diz. */}
                    {doTipo.length > 0 && <span className="pgconta">{doTipo.length}</span>}
                  </div>

                  {aberto && (
                    <div className="pgsub">
                      {/* OS MODELOS AGRUPADOS POR DISCIPLINA (31/07/2026, a
                          pedido). Num projeto real são dezenas de modelos por
                          recorte, e o que se procura é "como está a estrutura",
                          não um código específico — sem o agrupamento a lista é
                          uma coluna de siglas parecidas que só se lê de cima a
                          baixo. O cabeçalho do grupo leva a amostra de cor da
                          MACRODISCIPLINA, que é a mesma da tabela de disciplinas
                          e dos gráficos: a cor identifica a família, e é ela que
                          se varre com o olho antes de ler qualquer texto. */}
                      {agrupar(doTipo).map(([rotulo, macro, doGrupo]) => (
                        <div key={rotulo} className="pgdisc">
                          <div className="pgdisc-cab">
                            {macro && (
                              <span
                                className="macro"
                                style={{ background: `var(--macro-${macro})` }}
                              />
                            )}
                            <span>{rotulo}</span>
                            <span className="pgconta">{doGrupo.length}</span>
                          </div>
                          {doGrupo.map((l) => (
                            <button
                              key={l.id}
                              type="button"
                              className={`pgsubitem${
                                dentro && modeloId === l.modelo_id ? ' on' : ''
                              }`}
                              onClick={() =>
                                navegar(
                                  rotaProjeto(projeto.id, `auditoria/${c}/${l.modelo_id ?? ''}`),
                                )
                              }
                              title={l.modelo_codigo ?? ''}
                            >
                              <span className="pgsubnome">{l.modelo_codigo}</span>
                              {/* A ÁREA quando houver: em LOD 400/500 o mesmo
                                  modelo aparece uma vez por área, e sem ela as
                                  linhas ficam idênticas. */}
                              {l.area && <span className="pgsubarea">{l.area}</span>}
                              {l.prioridade && (
                                <span className={`pgprio p-${l.prioridade}`} aria-hidden="true" />
                              )}
                            </button>
                          ))}
                        </div>
                      ))}
                      {doTipo.length === 0 && (
                        <span className="pgsubvazio">
                          {L('Nada auditado ainda.', 'Nothing audited yet.')}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )
            })}

            {porRecorte.size === 0 && (
              <span className="pgsubvazio">{L('Nada encontrado.', 'Nothing found.')}</span>
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
                ? L('Mostrar os recortes', 'Show scopes')
                : L('Recolher os recortes', 'Collapse scopes')
            }
          >
            <Ico path={PATH_PAINEL} />
          </button>
          <span>{titulo}</span>
          {/* Dentro da planilha de um modelo, o cabeçalho diz de qual — é a
              única pista, já que o título continua sendo o do recorte. */}
          {modeloId && <span className="co">· {L('planilha', 'sheet')}</span>}
          {/* ETAPA DECLARADA, e o usuário precisa saber ANTES de digitar. A
              grade do recorte tem células editáveis mas nada em que gravar: cada
              uma corresponde a um campo de `resultado_check`, que pertence a uma
              auditoria — e auditoria pertence a um modelo, que esta tela não
              tem. Sem o aviso, alguém preenche dezessete linhas e as perde ao
              trocar de recorte. Sai quando a tela ganhar um modelo. */}
          {!modeloId && (
            <span className="co">
              · {L('estrutura, ainda não salva', 'structure, not saved yet')}
            </span>
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
