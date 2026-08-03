/** GERENCIAR MEMBROS — as pessoas da organização, e quem está em cada projeto.
 *
 *  Formato do VDCity: painel à esquerda com "Todos os membros" e um item por
 *  projeto (com a contagem de cada um), conteúdo à direita. O layout é o
 *  `.pgsplit`, o MESMO da auditoria.
 *
 *  "TODOS OS MEMBROS" SÃO AS CONTAS, não a união dos vínculos, e essa distinção
 *  custou uma quebra. Numa primeira versão este recorte listava os vínculos de
 *  todos os projetos — e como `projeto_membro` estava vazio, a tela que antes
 *  mostrava as pessoas da organização passou a mostrar nada. Pior: junto foi
 *  embora o "+ Novo usuário", porque a lista de contas era quem o trazia.
 *
 *  As duas perguntas são diferentes e as duas moram aqui:
 *
 *  - **Todos os membros** → QUEM EXISTE. É a tela de contas (`AbaUsuarios`),
 *    inteira, com criação, edição, permissões e link de convite. Ela é a mesma
 *    de `/admin/usuarios` — uma implementação só, por duas portas, como sempre
 *    foi: quem coordena entra por aqui, quem administra o tenant a encontra lá
 *    junto de organização, clientes e logs.
 *  - **Um projeto** → QUEM ESTÁ NELE, com equipe e papel no projeto. É a tabela
 *    de vínculos, e o "+" dela vincula alguém que já tem conta.
 *
 *  O "+" MUDA DE SIGNIFICADO COM O RECORTE, e é o certo: em "Todos" criar é criar
 *  uma CONTA; dentro de um projeto é VINCULAR alguém que já tem uma. Um botão só
 *  que fizesse as duas teria de perguntar qual antes de fazer qualquer coisa.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'

import TabelaMembros, { AdicionarMembro } from '@/components/TabelaMembros'
import { Erro } from '@/components/ui'
import { useI18n } from '@/i18n'
import { ApiError, api } from '@/lib/api'
import type { Membro, UsuarioCadastro } from '@/lib/types'
import AbaUsuarios from '@/pages/admin/Usuarios'

const TODOS = '__todos__'
const LUPA = 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.3-4.3'

export default function Membros() {
  const { L } = useI18n()
  const [membros, setMembros] = useState<Membro[]>([])
  const [contas, setContas] = useState<UsuarioCadastro[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [aberto, setAberto] = useState<string>(TODOS)
  const [busca, setBusca] = useState('')
  /** O sinal para a tela de contas abrir um editor em branco. Contador e não
   *  booleano: a ação se repete, e com booleano o segundo clique não mudaria a
   *  prop e nada aconteceria. */
  const [novoEm, setNovoEm] = useState(0)

  const carregar = useCallback(async () => {
    setErro(null)
    setCarregando(true)
    try {
      // As duas listas juntas: a barra precisa da contagem de CONTAS para
      // "Todos" e da de VÍNCULOS para cada projeto. Em paralelo porque nenhuma
      // depende da outra.
      const [v, u] = await Promise.all([api.membros.todos(), api.usuarios.listar()])
      setMembros(v)
      setContas(u.itens)
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : String(e))
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  /** Os projetos que TÊM membro, na ordem do código, com a contagem.
   *
   *  Sai dos próprios vínculos e não de `api.projetos.listar()`: um projeto sem
   *  ninguém não é recorte útil aqui — clicar nele abriria uma tabela vazia — e
   *  derivar da lista que já veio poupa uma requisição. Para entrar num projeto
   *  vazio, o caminho é a tela de Membros DENTRO dele. */
  const projetos = useMemo(() => {
    const mapa = new Map<string, { codigo: string; nome: string; n: number }>()
    for (const m of membros) {
      const atual = mapa.get(m.projeto_id)
      if (atual) atual.n += 1
      else
        mapa.set(m.projeto_id, {
          codigo: m.projeto_codigo ?? '—',
          nome: m.projeto_nome ?? '',
          n: 1,
        })
    }
    return [...mapa.entries()].sort((a, b) => a[1].codigo.localeCompare(b[1].codigo))
  }, [membros])

  /** A BUSCA CASA COM PESSOA, E-MAIL, EMPRESA E EQUIPE — os quatro textos da
   *  linha. Ela filtra a tabela de VÍNCULOS; em "Todos" o campo some, porque
   *  quem lista ali é a tela de contas, que traz a própria organização. Um campo
   *  de busca que não filtra o que está na tela é pior que nenhum. */
  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase()
    return membros
      .filter((m) => m.projeto_id === aberto)
      .filter((m) =>
        !t
          ? true
          : [m.usuario_nome, m.usuario_login, m.empresa_nome, m.equipe].some((v) =>
              (v ?? '').toLowerCase().includes(t),
            ),
      )
  }, [membros, aberto, busca])

  const emTodos = aberto === TODOS
  const projetoAberto = projetos.find(([id]) => id === aberto)

  return (
    <div className="pgsplit">
      <aside className="pgside">
        <div className="pghead pgferramentas">
          {emTodos ? (
            <span className="pgtitulo">{L('Membros', 'Members')}</span>
          ) : (
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
          )}
          {/* O "+" MUDA DE SIGNIFICADO COM O RECORTE, e é o certo: em "Todos"
              criar é criar uma CONTA; dentro de um projeto é VINCULAR alguém que
              já tem uma. Um botão só que fizesse as duas teria de perguntar qual
              antes de fazer qualquer coisa. Os dois moram no MESMO lugar — o
              cabeçalho do painel, como no VDCity —, e é por isso que a tela de
              contas recebe `novoEm` em vez de desenhar o próprio. */}
          {emTodos ? (
            <button
              type="button"
              className="pillact pgacao"
              onClick={() => setNovoEm((n) => n + 1)}
              title={L('Novo usuário', 'New user')}
              aria-label={L('Novo usuário', 'New user')}
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
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </span>
              <span className="rot">{L('Novo usuário', 'New user')}</span>
            </button>
          ) : (
            projetoAberto && (
              <AdicionarMembro
                projetoId={aberto}
                jaMembros={visiveis.map((m) => m.usuario_id)}
                onMudou={carregar}
              />
            )
          )}
        </div>

        <nav className="pglist">
          {/* "Todos" primeiro: é o estado inicial e o caminho de volta de
              qualquer projeto. A contagem é de CONTAS, que é o que ele abre. */}
          <div className={`pgitem pgpai${emTodos ? ' on' : ''}`}>
            <button type="button" className="pgrotulo" onClick={() => setAberto(TODOS)}>
              {L('Todos os membros', 'All members')}
            </button>
            <span className="pgconta">{contas.length}</span>
          </div>

          {projetos.map(([id, p]) => (
            <div key={id} className={`pgitem pgpai${aberto === id ? ' on' : ''}`}>
              <button
                type="button"
                className="pgrotulo"
                onClick={() => setAberto(id)}
                title={p.nome}
              >
                {p.codigo}
              </button>
              <span className="pgconta">{p.n}</span>
            </div>
          ))}

          {projetos.length === 0 && !carregando && (
            <span className="pgsubvazio">
              {L(
                'Ninguém vinculado a projeto ainda. Vincule em Membros, dentro do projeto.',
                'Nobody linked to a project yet. Link them under Members, inside the project.',
              )}
            </span>
          )}
        </nav>
      </aside>

      <section className="pgmain">
        <div className="pghead">
          <span>
            {emTodos ? L('Todos os membros', 'All members') : (projetoAberto?.[1].codigo ?? '')}
          </span>
          <span className="co">
            · {emTodos ? contas.length : visiveis.length} {L('pessoa(s)', 'person(s)')}
          </span>
        </div>
        <div className="pgbody">
          <Erro mensagem={erro} />
          {carregando ? (
            <p className="hint">{L('Carregando…', 'Loading…')}</p>
          ) : emTodos ? (
            // A TELA DE CONTAS INTEIRA, e não uma cópia dela: ela já tem lista,
            // criação, edição, permissões e link de convite. Reimplementar aqui
            // daria duas telas para divergirem na primeira permissão nova.
            // `novoEm` faz o "+" do painel abrir o editor dela.
            <AbaUsuarios novoEm={novoEm} />
          ) : (
            <TabelaMembros membros={visiveis} onMudou={carregar} />
          )}
        </div>
      </section>
    </div>
  )
}
