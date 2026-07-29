/** Home — a porta de entrada: o que está acontecendo, e os projetos por cliente.
 *
 *  Herda do VDCity a ideia central: os projetos moram em PASTAS, e a pasta é o
 *  cliente. Lá isso era `groupBy` sobre um texto; aqui a pasta é a entidade
 *  `cliente` (migration 0003), então 'Microsoft' e 'microsoft' não viram duas.
 *
 *  Dois modos, como lá: PASTAS (cards, abre uma de cada vez) e LISTA (acordeão,
 *  vê tudo de uma vez). O modo fica no localStorage porque a escolha é de quem
 *  usa, não da sessão.
 *
 *  Os números do resumo saem do que já existe na API — projetos por status e a
 *  contagem de clientes. Nenhum é inventado: KPI que não sai de dado real
 *  ensina o usuário a desconfiar da tela.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useI18n } from '@/i18n'
import { api } from '@/lib/api'
import type { ClientePasta, Projeto } from '@/lib/types'
import { rotaProjeto } from '@/projeto/ProjetoContext'

const CHAVE_MODO = 'spbim_home_modo'

type Modo = 'pastas' | 'lista'

function leModo(): Modo {
  try {
    return localStorage.getItem(CHAVE_MODO) === 'lista' ? 'lista' : 'pastas'
  } catch {
    return 'pastas'
  }
}

/** Projetos sem cliente ainda precisam aparecer — senão somem da única tela
 *  que lista tudo, e ninguém descobre que faltou vincular. */
const SEM_CLIENTE = '__sem_cliente__'

function Icone({ path, tam = 18 }: { path: string; tam?: number }) {
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

/** Status do projeto no vocabulário de cor do sistema. `piloto` e `encerrado`
 *  ficam neutros de propósito: cor é significado, e nem todo estado precisa
 *  gritar — só os que se varre a tela procurando. */
const TOM_STATUS: Record<string, string> = {
  ativo: 'pill ok',
  config: 'pill alerta',
}

function classeStatus(status: string): string {
  return TOM_STATUS[status] ?? 'pill'
}

const PASTA = 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'
const PASTA_ABERTA =
  'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1M3 9l1.6 8a2 2 0 0 0 2 1.6h11a2 2 0 0 0 2-1.6L21 9z'
const VOLTAR = 'M15 18l-6-6 6-6'
const GRADE = 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z'
const LISTA = 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01'

export default function Home() {
  const { L } = useI18n()
  const navigate = useNavigate()

  const [pastas, setPastas] = useState<ClientePasta[]>([])
  const [projetos, setProjetos] = useState<Projeto[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [modo, setModo] = useState<Modo>(leModo)
  const [aberta, setAberta] = useState<string | null>(null)
  const [expandidas, setExpandidas] = useState<Set<string>>(() => new Set())
  const [busca, setBusca] = useState('')

  useEffect(() => {
    Promise.all([api.clientes.pastas(), api.projetos.listar()])
      .then(([cs, ps]) => {
        setPastas(cs)
        setProjetos(ps.itens)
      })
      .catch((e) => setErro(e instanceof Error ? e.message : String(e)))
      .finally(() => setCarregando(false))
  }, [])

  const trocarModo = useCallback((novo: Modo) => {
    setModo(novo)
    setAberta(null)
    setExpandidas(new Set())
    try {
      localStorage.setItem(CHAVE_MODO, novo)
    } catch {
      /* modo privado: a preferência só não persiste */
    }
  }, [])

  const abrirProjeto = useCallback(
    (projeto: Projeto) => {
      // Escolher um projeto é IR para ele: a escolha vira URL, e o painel é o
      // que se quer ver ao abrir um projeto.
      navigate(rotaProjeto(projeto.id, 'painel'))
    },
    [navigate],
  )

  const termo = busca.trim().toLowerCase()

  /** Projetos por cliente, já filtrados pela busca. */
  const porCliente = useMemo(() => {
    const mapa = new Map<string, Projeto[]>()
    for (const p of projetos) {
      if (
        termo &&
        !p.nome.toLowerCase().includes(termo) &&
        !p.codigo.toLowerCase().includes(termo) &&
        !(p.cliente_nome ?? '').toLowerCase().includes(termo)
      ) {
        continue
      }
      const chave = p.cliente_id ?? SEM_CLIENTE
      const atual = mapa.get(chave)
      if (atual) atual.push(p)
      else mapa.set(chave, [p])
    }
    return mapa
  }, [projetos, termo])

  /** As pastas na ordem da tela: clientes por nome, e "sem cliente" por último
   *  — é exceção, não categoria, e no topo empurraria os clientes reais. */
  const grupos = useMemo(() => {
    const lista = pastas
      .filter((c) => !termo || c.nome.toLowerCase().includes(termo) || porCliente.has(c.id))
      .map((c) => ({ chave: c.id, rotulo: c.nome, itens: porCliente.get(c.id) ?? [] }))
    const orfaos = porCliente.get(SEM_CLIENTE) ?? []
    if (orfaos.length) {
      lista.push({
        chave: SEM_CLIENTE,
        rotulo: L('Sem cliente', 'No client'),
        itens: orfaos,
      })
    }
    return termo ? lista.filter((g) => g.itens.length) : lista
  }, [pastas, porCliente, termo, L])

  if (carregando) return <div className="hint">{L('Carregando…', 'Loading…')}</div>
  if (erro) {
    return (
      <div className="card">
        <div className="empty">{L('Não foi possível carregar: ', 'Could not load: ')}{erro}</div>
      </div>
    )
  }

  const grupoAberto = grupos.find((g) => g.chave === aberta) ?? null

  return (
    <div className="home">
      {/* A FILEIRA DE KPIs SAIU DAQUI (29/07/2026) e virou `/kpis`.
          Esta tela fazia duas coisas — uma fileira de números e uma navegação
          por pastas — e cada uma responde a uma pergunta diferente: "como
          estamos?" e "onde está o projeto do fulano?". Quem entra pela home
          está fazendo a segunda, e os números só empurravam as pastas para
          baixo da dobra. */}
      <div className="card home-projetos">
        <div className="home-cab">
          <div className="home-titulo">
            {grupoAberto ? (
              <>
                <button
                  type="button"
                  className="home-voltar"
                  onClick={() => setAberta(null)}
                  title={L('Voltar', 'Back')}
                >
                  <Icone path={VOLTAR} tam={16} />
                </button>
                <Icone path={PASTA_ABERTA} tam={19} />
                <b>{grupoAberto.rotulo}</b>
              </>
            ) : (
              <b>{L('Projetos', 'Projects')}</b>
            )}
          </div>

          <div className="home-ferramentas">
            <input
              className="f home-busca"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder={L('Buscar projeto ou cliente…', 'Search project or client…')}
            />
            <div className="seg">
              <button
                type="button"
                className={modo === 'pastas' ? 'on' : ''}
                onClick={() => trocarModo('pastas')}
                title={L('Pastas', 'Folders')}
              >
                <Icone path={GRADE} tam={15} />
              </button>
              <button
                type="button"
                className={modo === 'lista' ? 'on' : ''}
                onClick={() => trocarModo('lista')}
                title={L('Lista', 'List')}
              >
                <Icone path={LISTA} tam={15} />
              </button>
            </div>
          </div>
        </div>

        {grupos.length === 0 && (
          <div className="empty">
            {termo
              ? L('Nada encontrado.', 'Nothing found.')
              : L(
                  'Nenhum cliente cadastrado ainda. Crie o primeiro em Administração.',
                  'No clients yet. Create the first one in Administration.',
                )}
          </div>
        )}

        {/* MODO PASTAS — uma pasta de cada vez, como no VDCity. */}
        {modo === 'pastas' && !grupoAberto && grupos.length > 0 && (
          <div className="home-grade">
            {grupos.map((g) => (
              <button
                key={g.chave}
                type="button"
                className="home-pasta"
                onClick={() => setAberta(g.chave)}
              >
                <Icone path={PASTA} tam={30} />
                <span className="home-pasta-nome">{g.rotulo}</span>
                <span className="home-pasta-n">
                  {g.itens.length}{' '}
                  {g.itens.length === 1 ? L('projeto', 'project') : L('projetos', 'projects')}
                </span>
              </button>
            ))}
          </div>
        )}

        {modo === 'pastas' && grupoAberto && (
          <div className="home-grade">
            {grupoAberto.itens.map((p) => (
              <CardProjeto key={p.id} projeto={p} onAbrir={abrirProjeto} />
            ))}
            {grupoAberto.itens.length === 0 && (
              <div className="empty">
                {L('Este cliente ainda não tem projetos.', 'This client has no projects yet.')}
              </div>
            )}
          </div>
        )}

        {/* MODO LISTA — acordeão: todas as pastas visíveis, expandindo. */}
        {modo === 'lista' && grupos.length > 0 && (
          <div className="home-acordeao">
            {grupos.map((g) => {
              const aberto = expandidas.has(g.chave)
              return (
                <div key={g.chave}>
                  <button
                    type="button"
                    className="home-linha-pasta"
                    onClick={() =>
                      setExpandidas((atual) => {
                        const proximo = new Set(atual)
                        if (proximo.has(g.chave)) proximo.delete(g.chave)
                        else proximo.add(g.chave)
                        return proximo
                      })
                    }
                  >
                    <Icone path={aberto ? PASTA_ABERTA : PASTA} tam={19} />
                    <span className="home-pasta-nome">{g.rotulo}</span>
                    <span className="home-pasta-n">{g.itens.length}</span>
                  </button>
                  {aberto &&
                    g.itens.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className="home-linha-projeto"
                        onClick={() => abrirProjeto(p)}
                      >
                        <span className="home-cod">{p.codigo}</span>
                        <span className="home-nome">{p.nome}</span>
                        <span className={classeStatus(p.status)}>{p.status}</span>
                      </button>
                    ))}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function CardProjeto({
  projeto,
  onAbrir,
}: {
  projeto: Projeto
  onAbrir: (p: Projeto) => void
}) {
  return (
    <button type="button" className="home-card" onClick={() => onAbrir(projeto)}>
      <div className="home-card-topo">
        <span className="home-cod">{projeto.codigo}</span>
        <span className={classeStatus(projeto.status)}>{projeto.status}</span>
      </div>
      <span className="home-nome">{projeto.nome}</span>
      {projeto.coordenacao && <span className="mmeta">{projeto.coordenacao}</span>}
    </button>
  )
}
