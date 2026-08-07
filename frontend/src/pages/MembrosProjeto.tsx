/** MEMBROS DO PROJETO — a mesma estrutura da tela global, outro recorte.
 *
 *  Não confundir com `Gerenciar membros` (`/membros`), que mostra os vínculos da
 *  organização inteira, nem com `/admin/usuarios`, que é o cadastro de CONTAS.
 *  Aqui se responde "quem está no CPQ11": a mesma pessoa é coordenadora num
 *  projeto e só visualizadora noutro.
 *
 *  A diferença em relação à tela global é uma só, e é a que o pedido descreve:
 *  aqui a barra agrupa por EQUIPE, não por projeto, e o corpo mostra apenas as
 *  pessoas DESTE projeto. Layout, tabela e gaveta de ações são os mesmos —
 *  `TabelaMembros` é compartilhado, para as duas não divergirem na primeira
 *  coluna que alguém acrescentar.
 *
 *  POR QUE EQUIPE E NÃO FUNÇÃO. `funcao` é o que a pessoa FAZ ('modelador') e é
 *  quase única por pessoa — agrupar por ela daria quinze grupos de um. `equipe` é
 *  o grupo a que ela pertence, e é como a coordenação fala do time (0014).
 *
 *  A TELA CONTINUA DIZENDO, EM VOZ ALTA, QUE ISTO NÃO É PERMISSÃO — o aviso está
 *  na gaveta, em `TabelaMembros`. `projeto_membro` registra participação; quem
 *  autoriza é a permissão de organização. Esconder isso faria alguém pôr um
 *  visualizador e esperar que ele deixasse de publicar rounds.
 *
 *  ═══ O PORTAL DO CLIENTE VIROU UM RECORTE DAQUI (07/08/2026, a pedido)
 *
 *  Ele era a aba `Convidar cliente` da configuração do projeto, e saiu de lá
 *  quando aquela tela virou painel. A configuração responde COMO A OBRA É
 *  AUDITADA e se preenche uma vez, quando o projeto nasce; convidar cliente é
 *  dar ACESSO, se faz a qualquer momento e é a MESMA pergunta que esta tela já
 *  responde — quem enxerga este projeto. O cliente é o de fora que só lê.
 *
 *  ELE FICA SEPARADO DAS EQUIPES por um traço, e não misturado a elas: os itens
 *  de cima saem dos DADOS (as equipes que existem nos vínculos) e este é fixo.
 *  Uma lista em que um item é navegação e os outros são agrupamento precisa dizer
 *  qual é qual.
 *
 *  E ELE SÓ APARECE PARA `admin_cadastro` — não para quem coordena, que é a
 *  conta do botão de convite ao lado. As quatro rotas de convite do portal
 *  exigem essa permissão (`api/v1/portal.py`); um recorte que só sabe responder
 *  403 anuncia um poder que a conta não tem.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { useAuth } from '@/auth/AuthContext'
import ConvidarPessoa from '@/components/ConvidarPessoa'
import TabelaMembros from '@/components/TabelaMembros'
import { Erro } from '@/components/ui'
import { useI18n } from '@/i18n'
import { ApiError, api } from '@/lib/api'
import type { Membro } from '@/lib/types'
import AbaCliente from '@/pages/configuracao/Cliente'
import { useProjeto } from '@/projeto/ProjetoContext'

const TODAS = '__todas__'
/** Quem não tem equipe cai aqui. Não é rótulo de enfeite, é um estado real: o
 *  vínculo pode nascer antes de alguém decidir a equipe, e escondê-lo faria a
 *  soma dos grupos não fechar com o total. */
const SEM_EQUIPE = '__sem__'
/** O recorte do portal. Ele não é uma equipe, e por isso não entra na contagem
 *  nem é filtrado pela busca de membros — quem digita um nome de pessoa está
 *  procurando pessoa, e ver o portal sumir da lista pareceria defeito. */
const PORTAL = '__portal__'

const LUPA = 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.3-4.3'

export default function MembrosProjeto() {
  const { L } = useI18n()
  const { usuario, pode } = useAuth()
  const { projeto } = useProjeto()
  const [membros, setMembros] = useState<Membro[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')

  /** Quem administra o cadastro é quem enxerga o portal — a mesma conta que as
   *  quatro rotas de convite exigem. */
  const admin = pode('admin_cadastro')

  /** `?portal=1` É O QUE FAZ O LINK ANTIGO CHEGAR NO LUGAR CERTO. A rota
   *  `configuracao/cliente` redireciona para cá, e sem o parâmetro ela cairia em
   *  "Todas as equipes" — quem clicou num link de convidar cliente veria uma
   *  tabela de gente e concluiria que a tela sumiu.
   *
   *  É PARÂMETRO DE BUSCA E NÃO ROTA PRÓPRIA porque os outros recortes desta
   *  barra saem dos dados (as equipes) e não têm endereço: dar rota só a este
   *  faria um item da lista se comportar diferente dos vizinhos. Lido UMA VEZ, no
   *  estado inicial — depois disso quem manda é o clique, e reagir à URL faria o
   *  recorte voltar sozinho ao portal a cada re-render.
   *
   *  A guarda de permissão está aqui também, e não só no item: sem ela o
   *  parâmetro colado na URL abriria uma tela que só sabe responder 403. */
  const [params] = useSearchParams()
  const [aberta, setAberta] = useState<string>(params.get('portal') && admin ? PORTAL : TODAS)
  /** A gaveta de CONVITE — o ÚNICO caminho para pôr gente neste projeto desde
   *  07/08/2026. Ela cobre os dois casos: quem já tem conta abre o link e entra
   *  direto; quem não tem cria a conta pelo mesmo link. */
  const [convidando, setConvidando] = useState(false)

  /** QUEM MONTA A EQUIPE DESTE PROJETO: administra o cadastro, ou coordena aqui
   *  (07/08/2026). A mesma conta que `TabelaMembros` faz para a engrenagem — e é
   *  feita aqui de novo, e não passada de lá, porque os dois botões do cabeçalho
   *  ficam FORA da tabela, no painel. */
  const montaEquipe =
    admin || membros.some((m) => m.usuario_id === usuario?.id && m.papel === 'coordenador')

  const carregar = useCallback(async () => {
    if (!projeto) return
    setErro(null)
    setCarregando(true)
    try {
      setMembros(await api.membros.listar(projeto.id))
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : String(e))
      setMembros([])
    } finally {
      setCarregando(false)
    }
  }, [projeto])

  useEffect(() => {
    carregar()
  }, [carregar])

  /** As equipes que existem NESTE projeto, com a contagem. Saem dos próprios
   *  vínculos: não há cadastro de equipes, e não deve haver enquanto o conjunto
   *  não estabilizar (ver a migration 0014). */
  const equipes = useMemo(() => {
    const mapa = new Map<string, number>()
    for (const m of membros) {
      const chave = m.equipe?.trim() || SEM_EQUIPE
      mapa.set(chave, (mapa.get(chave) ?? 0) + 1)
    }
    return [...mapa.entries()].sort(([a], [b]) => {
      // "Sem equipe" por último, sempre: ele é o resto, não uma equipe.
      if (a === SEM_EQUIPE) return 1
      if (b === SEM_EQUIPE) return -1
      return a.localeCompare(b)
    })
  }, [membros])

  /** A BUSCA CASA COM PESSOA, E-MAIL, EMPRESA E EQUIPE — os quatro textos da
   *  linha. Quem procura "METASA" quer as pessoas da METASA; restringir ao nome
   *  faria a maior parte das buscas falhar em silêncio. */
  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase()
    return membros
      .filter((m) => {
        if (aberta === TODAS) return true
        return (m.equipe?.trim() || SEM_EQUIPE) === aberta
      })
      .filter((m) =>
        !t
          ? true
          : [m.usuario_nome, m.usuario_login, m.empresa_nome, m.equipe].some((v) =>
              (v ?? '').toLowerCase().includes(t),
            ),
      )
  }, [membros, aberta, busca])

  if (!projeto) return <p className="hint">{L('Carregando…', 'Loading…')}</p>

  const noPortal = aberta === PORTAL

  const rotuloAtual = noPortal
    ? L('Portal do cliente', 'Client portal')
    : aberta === TODAS
      ? L('Todas as equipes', 'All teams')
      : aberta === SEM_EQUIPE
        ? L('Sem equipe', 'No team')
        : aberta

  return (
    <div className="pgsplit">
      <aside className="pgside">
        <div className="pghead pgferramentas">
          <div className="pgbusca">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d={LUPA} />
            </svg>
            <input
              className="f"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder={L('Buscar membro…', 'Search member…')}
              aria-label={L('Buscar membro', 'Search member')}
            />
          </div>
          {/* ⚠ "ADICIONAR MEMBRO" SAIU DAQUI EM 07/08/2026, a pedido, e sobrou
              só o CONVITE.

              Ele vinculava ao projeto quem JÁ tinha conta na organização, e fazia
              sentido enquanto essa era a única forma de pôr alguém num projeto.
              Com o convite portado da VDCity, os dois botões passaram a ser dois
              caminhos para o mesmo destino — e o convite cobre os dois casos: quem
              já tem conta abre o link e entra direto, sem nem passar pelo cadastro.

              Um seletor de pessoa ao lado de um convite obriga quem coordena a
              saber, ANTES de clicar, se o fulano já tem conta aqui — que é
              justamente o que ele não tem como saber.

              A tela GLOBAL (`Gerenciar membros`) manteve o botão: lá se escolhe
              projeto e pessoa entre os que já existem, e não há um projeto único
              para o qual convidar. */}
          {montaEquipe && (
          <button
            type="button"
            className="pillact pgacao"
            onClick={() => setConvidando(true)}
            title={L('Convidar por e-mail ou link', 'Invite by e-mail or link')}
            aria-label={L('Convidar por e-mail ou link', 'Invite by e-mail or link')}
          >
            <span className="ico">
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" />
                <path d="m3.5 6.5 8.5 6 8.5-6" />
              </svg>
            </span>
            <span className="rot">{L('Convidar', 'Invite')}</span>
          </button>
          )}
        </div>

        <nav className="pglist">
          <div className={`pgitem pgpai${aberta === TODAS ? ' on' : ''}`}>
            <button type="button" className="pgrotulo" onClick={() => setAberta(TODAS)}>
              {L('Todas as equipes', 'All teams')}
            </button>
            <span className="pgconta">{membros.length}</span>
          </div>

          {equipes.map(([chave, n]) => (
            <div key={chave} className={`pgitem pgpai${aberta === chave ? ' on' : ''}`}>
              <button type="button" className="pgrotulo" onClick={() => setAberta(chave)}>
                {chave === SEM_EQUIPE ? L('Sem equipe', 'No team') : chave}
              </button>
              <span className="pgconta">{n}</span>
            </div>
          ))}

          {equipes.length === 0 && !carregando && (
            <span className="pgsubvazio">
              {L('Ninguém neste projeto ainda.', 'Nobody on this project yet.')}
            </span>
          )}

          {/* O TRAÇO separa o que sai dos dados do que é fixo — ver o cabeçalho
              do arquivo. Ele é irmão dos itens, e não um contêiner em volta
              deles: um `<div>` agrupando quebraria o `gap` da coluna. */}
          {admin && (
            <>
              <span className="pgsep" aria-hidden="true" />
              <div className={`pgitem pgpai${noPortal ? ' on' : ''}`}>
                <button type="button" className="pgrotulo" onClick={() => setAberta(PORTAL)}>
                  {L('Portal do cliente', 'Client portal')}
                </button>
              </div>
            </>
          )}
        </nav>
      </aside>

      <section className="pgmain">
        <div className="pghead">
          <span>{rotuloAtual}</span>
          {/* A contagem é de PESSOAS, e no portal não há pessoa nenhuma para
              contar — os convites são links, e quantos existem a própria tela
              mostra. Deixá-la escreveria "· 0 pessoa(s)" ao lado do portal. */}
          {!noPortal && (
            <span className="co">
              · {visiveis.length} {L('pessoa(s)', 'person(s)')}
            </span>
          )}
        </div>
        <div className="pgbody">
          {/* O erro é o da LISTA DE MEMBROS, e no portal não há lista nenhuma na
              tela — deixá-lo aqui penduraria uma falha de carregar gente por
              cima dos convites, que carregam por outro caminho e têm o `Erro`
              deles lá dentro. */}
          {!noPortal && <Erro mensagem={erro} />}
          {noPortal ? (
            <AbaCliente />
          ) : carregando ? (
            <p className="hint">{L('Carregando…', 'Loading…')}</p>
          ) : (
            <TabelaMembros membros={visiveis} onMudou={carregar} />
          )}
        </div>
      </section>

      <ConvidarPessoa
        projetoId={projeto.id}
        projetoNome={`${projeto.codigo} · ${projeto.nome}`}
        aberta={convidando}
        onFechar={() => setConvidando(false)}
        onConvidou={carregar}
      />
    </div>
  )
}
