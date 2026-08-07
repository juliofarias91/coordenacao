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

import { useAuth } from '@/auth/AuthContext'
import Gaveta from '@/components/Gaveta'
import SeletorCliente, { resolverClienteId } from '@/components/SeletorCliente'
import { Campo, Erro } from '@/components/ui'
import { useI18n } from '@/i18n'
import { ApiError, api } from '@/lib/api'
import type { ClientePasta, Projeto } from '@/lib/types'
import { rotaProjeto, useProjeto } from '@/projeto/ProjetoContext'

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

/** Status do projeto: um PONTO colorido e o rótulo em tinta neutra.
 *
 *  Era uma `.pill` — o retângulo translúcido que a regra 2 permite para estado
 *  semântico. Permitir não é obrigar: numa grade de vinte projetos são vinte
 *  retângulos coloridos disputando atenção com o nome do projeto, que é o que
 *  se veio ler. O ponto guarda a mesma informação numa fração da área.
 *
 *  `piloto` e `encerrado` ficam neutros de propósito — cor é significado, e nem
 *  todo estado precisa gritar; só os que se varre a tela procurando.
 */
const TOM_STATUS: Record<string, string> = {
  ativo: 'home-status s-ativo',
  config: 'home-status s-config',
}

function classeStatus(status: string): string {
  return TOM_STATUS[status] ?? 'home-status'
}

/** O rótulo humano do status. A tela mostrava o valor cru do banco ("config"),
 *  que é vocabulário de schema, não de quem coordena obra. A lista é a mesma da
 *  Ficha do projeto, onde ele se edita. */
const ROTULO_STATUS: Record<string, [string, string]> = {
  config: ['em configuração', 'setting up'],
  ativo: ['ativo', 'active'],
  piloto: ['piloto', 'pilot'],
  encerrado: ['encerrado', 'closed'],
}

const PASTA = 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'
const PASTA_ABERTA =
  'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1M3 9l1.6 8a2 2 0 0 0 2 1.6h11a2 2 0 0 0 2-1.6L21 9z'
const VOLTAR = 'M15 18l-6-6 6-6'
const LUPA = 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-4.3-4.3'
const GRADE = 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z'
const LISTA = 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01'
const MAIS = 'M12 5v14M5 12h14'

export default function Home() {
  const { L } = useI18n()
  const navigate = useNavigate()
  const { pode } = useAuth()
  // A lista do contexto de projeto é carregada UMA VEZ, na montagem. Um projeto
  // criado agora não está nela, e é o `ProjetoProvider` que responde "existe?"
  // para a ficha — daí o `recarregar` antes de navegar. Ver `criarProjeto`.
  const { recarregar: recarregarProjetos } = useProjeto()

  const [novo, setNovo] = useState<{
    codigo: string
    nome: string
    cliente_id: string
    /** Só usado quando `cliente_id === NOVO_CLIENTE`. */
    cliente_novo: string
  } | null>(null)
  const [criando, setCriando] = useState(false)
  const [erroNovo, setErroNovo] = useState<string | null>(null)

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
      // Escolher um projeto é IR para ele: a escolha vira URL. QUAL tela é
      // `TELA_INICIAL`, em `ProjetoContext` — sem segundo argumento aqui, para
      // este destino não voltar a divergir dos outros três que abrem projeto.
      navigate(rotaProjeto(projeto.id))
    },
    [navigate],
  )

  /** Cria com o MÍNIMO e entrega na ficha.
   *
   *  Três campos, e não os seis do editor da Administração: desde que a Ficha
   *  do projeto existe, ela é a casa dos dados do projeto — coordenação, PEB,
   *  descrição, prazo e endereço se preenchem lá, com o projeto já aberto na
   *  frente. Repetir o formulário inteiro aqui seria criar o segundo lugar onde
   *  o cadastro pode divergir, que é o que acabou de ser desfeito na aba
   *  `Configuração › Projeto`.
   *
   *  O cliente PODE ser cadastrado aqui, e o seletor que faz isso é o mesmo do
   *  editor da Administração (`components/SeletorCliente.tsx`) — não uma
   *  segunda cópia. Cliente novo nasce ANTES do projeto, para o projeto já
   *  apontar para ele.
   */
  async function criarProjeto() {
    if (!novo) return
    setErroNovo(null)
    const codigo = novo.codigo.trim().toUpperCase()
    const nome = novo.nome.trim()
    if (!codigo || !nome) {
      setErroNovo(L('Código e nome são obrigatórios.', 'Code and name are required.'))
      return
    }
    setCriando(true)
    try {
      const criado = await api.projetos.criar({
        codigo,
        nome,
        cliente_id: await resolverClienteId(novo.cliente_id, novo.cliente_novo),
      })
      // RECARREGAR ANTES DE NAVEGAR, e esperar. O `ProjetoProvider` lista os
      // projetos uma vez, na montagem, e é a lista dele que responde "este id
      // existe?" — um projeto criado agora não está lá, então a ficha abria em
      // "Projeto não encontrado" para um projeto que acabara de nascer. Sem o
      // `await`, a corrida é a mesma: a ficha monta antes de a lista voltar.
      await recarregarProjetos()
      // Direto para a ficha: o projeto nasceu com o mínimo, e o resto se
      // preenche com ele aberto na frente. Ela virou a primeira aba da
      // configuração em 07/08/2026 — e é onde a sequência de preenchimento
      // começa, com PEB, mandate, áreas e disciplinas na mesma fileira.
      navigate(rotaProjeto(criado.id, 'configuracao/ficha'))
    } catch (e) {
      setErroNovo(e instanceof ApiError ? e.message : String(e))
    } finally {
      setCriando(false)
    }
  }

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
      {/* SEM CARD EM VOLTA. As pastas ficam direto sobre o fundo da página, como
          no VDCity: um card envolvendo uma grade de cards produz duas molduras
          concêntricas e faz a grade parecer espremida dentro de uma caixa que
          não tem função nenhuma. O card é para agrupar conteúdo heterogêneo;
          aqui tudo já é do mesmo tipo. */}
      <div className="home-projetos">
        <div className="home-barra">
          {/* A busca à esquerda e larga: é o controle mais usado da tela, e
              quem chega com um nome na cabeça digita antes de olhar a grade. */}
          <div className="home-buscabox">
            <Icone path={LUPA} tam={16} />
            <input
              className="f"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder={L('Buscar projetos ou clientes…', 'Search projects or clients…')}
            />
          </div>

          {/* A ÚNICA AÇÃO da barra. Fica COLADA na busca, e não no canto
              oposto: buscar um projeto e criar um projeto são a mesma intenção
              partida em duas — quem digita e não acha nada tem o "+" ali
              mesmo, em vez de atravessar a barra com o olho. Só aparece para
              quem administra cadastro; a guarda de verdade continua no
              `requer_permissao` da rota, esta só evita oferecer o que vai dar
              403.

              É UMA `.pillact`, a microinteração-assinatura do sistema (regra
              3): nasce redonda, só com o "+", e o rótulo cresce no hover. Era
              um `.btn pri` de largura cheia com o texto sempre aberto, e ao
              lado de um campo de busca ele pesava mais do que a busca — sendo
              que quem entra na home vem procurar, não cadastrar.

              O RÓTULO CRESCE PARA A DIREITA, ao contrário do da topbar. Lá as
              pílulas ficam encostadas na borda direita e o texto só tem para
              onde ir puxando o ícone; aqui o "+" está ancorado à esquerda,
              logo depois da busca, e é ele que precisa não sair do lugar
              quando o rótulo abre. */}
          {pode('admin_cadastro') && (
            <button
              type="button"
              className="pillact home-nova"
              title={L('Novo projeto', 'New project')}
              aria-label={L('Novo projeto', 'New project')}
              onClick={() => {
                setErroNovo(null)
                // Com uma pasta aberta, o cliente dela já vem escolhido: quem
                // clica ali está criando um projeto DAQUELE cliente. O
                // `SEM_CLIENTE` não vale — é rótulo de tela, não id.
                setNovo({
                  codigo: '',
                  nome: '',
                  cliente_id: aberta && aberta !== SEM_CLIENTE ? aberta : '',
                  cliente_novo: '',
                })
              }}
            >
              <span className="ico">
                <Icone path={MAIS} tam={18} />
              </span>
              <span className="rot">{L('Novo projeto', 'New project')}</span>
            </button>
          )}

          <div style={{ flex: 1 }} />

          {/* Modo de exibição no canto oposto ao da busca: é preferência, não
              ação — fica fora do caminho de quem só quer achar um projeto.
              DOIS BOTÕES SOLTOS, não um `.seg`: ver `.home-modos` no CSS. */}
          <div className="home-modos">
            <button
              type="button"
              className={modo === 'pastas' ? 'on' : ''}
              aria-pressed={modo === 'pastas'}
              onClick={() => trocarModo('pastas')}
              title={L('Pastas', 'Folders')}
            >
              <Icone path={GRADE} tam={16} />
            </button>
            <button
              type="button"
              className={modo === 'lista' ? 'on' : ''}
              aria-pressed={modo === 'lista'}
              onClick={() => trocarModo('lista')}
              title={L('Lista', 'List')}
            >
              <Icone path={LISTA} tam={16} />
            </button>
          </div>
        </div>

        {/* O CAMINHO DE VOLTA, FORA DA BARRA DE FERRAMENTAS (31/07/2026, a
            pedido). Ele ficava ao lado da busca e do "+", e ali parecia a
            terceira AÇÃO da linha — quando é a única coisa da tela que não age
            sobre nada: só desfaz a navegação. Numa linha própria, logo acima do
            que se abriu, ele lê como o rastro de onde se está.
            É também o único lugar que diz QUAL pasta está aberta: o breadcrumb
            da topbar, sem projeto escolhido, para em "Projetos". */}
        {grupoAberto && (
          <button
            type="button"
            className="home-voltar"
            onClick={() => setAberta(null)}
            title={L('Voltar', 'Back')}
          >
            <Icone path={VOLTAR} tam={15} />
            <span>{grupoAberto.rotulo}</span>
          </button>
        )}

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
                {/* Ícone de contorno e solto — sem caixa atrás. A caixa chegou
                    a existir e foi embora: numa grade de pastas todas iguais,
                    ela virava o elemento mais pesado do card, sendo que o que se
                    procura ali é o NOME do cliente.
                    22px e não 34: encostado no nome (ver `.home-pasta` no CSS),
                    um ícone de 34px pesava mais que as 14px do nome que ele
                    marca. Ele é o marcador, não o assunto. */}
                <Icone path={PASTA} tam={22} />
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

        {/* MODO LISTA — acordeão: todas as pastas visíveis, expandindo.
            Este SIM leva card: uma lista de linhas precisa de uma superfície
            que a delimite, ao contrário da grade, em que cada pasta já é um
            card e a moldura em volta só criaria a segunda borda. */}
        {modo === 'lista' && grupos.length > 0 && (
          <div className="card home-acordeao">
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
                        <Status status={p.status} />
                      </button>
                    ))}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* NOVO PROJETO — gaveta da direita, não formulário no meio da página.
          O editor `.editor` ficava entre a barra e a grade e empurrava os
          projetos para baixo: quem clicava em "+ Novo projeto" com uma pasta
          aberta perdia de vista o cliente para o qual estava criando. A gaveta
          sobrepõe (regra 4) e a grade fica onde estava, atrás.

          Fechar durante a criação é ignorado de propósito: o POST já saiu e a
          navegação para a ficha vem em seguida — sumir com a gaveta no meio
          disso deixaria a tela mentindo sobre não haver nada acontecendo. */}
      <Gaveta
        aberta={!!novo}
        titulo={L('Novo projeto', 'New project')}
        sub={L('Três campos — o resto vai na ficha.', 'Three fields — the rest goes in the record.')}
        onFechar={() => {
          if (!criando) setNovo(null)
        }}
        acoes={
          <button className="btn pri" onClick={criarProjeto} disabled={criando}>
            {criando
              ? L('Criando…', 'Creating…')
              : L('Criar e abrir a ficha', 'Create and open the record')}
          </button>
        }
      >
        {novo && (
          <>
            <Erro mensagem={erroNovo} />
            {/* Uma coluna, não a grade de dois de `.frow`: a gaveta tem largura
                fixa e dois campos lado a lado ali dentro ficariam com 190px
                cada — estreitos demais para o nome de um projeto. */}
            <div className="gaveta-campos">
              <Campo rotulo={L('Código', 'Code')}>
                <input
                  className="f code"
                  autoFocus
                  placeholder="CPQ11"
                  value={novo.codigo}
                  onChange={(e) => setNovo({ ...novo, codigo: e.target.value.toUpperCase() })}
                  onKeyDown={(e) => e.key === 'Enter' && criarProjeto()}
                />
              </Campo>
              <Campo rotulo={L('Nome', 'Name')}>
                <input
                  className="f"
                  placeholder="CPQ11 — Data Center"
                  value={novo.nome}
                  onChange={(e) => setNovo({ ...novo, nome: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && criarProjeto()}
                />
              </Campo>
              <SeletorCliente
                clientes={pastas}
                valor={novo.cliente_id}
                nomeNovo={novo.cliente_novo}
                onChange={(cliente_id) => setNovo({ ...novo, cliente_id })}
                onChangeNome={(cliente_novo) => setNovo({ ...novo, cliente_novo })}
              />
            </div>
            <p className="hint">
              {L(
                'O código entra na nomenclatura de todo arquivo do projeto e não muda depois. O resto — coordenação, PEB, prazo, endereço — se preenche na ficha, que abre em seguida.',
                'The code goes into every project file name and cannot change later. The rest — coordination, BEP, schedule, address — is filled in the record, which opens next.',
              )}
            </p>
          </>
        )}
      </Gaveta>
    </div>
  )
}

/** O estado do projeto: ponto colorido + rótulo humano. Um componente só, usado
 *  pelo card E pela linha do acordeão — os dois modos mostram o mesmo dado, e
 *  duas renderizações dele fariam a mesma tela falar duas línguas ao alternar
 *  entre pastas e lista. */
function Status({ status }: { status: string }) {
  const { L } = useI18n()
  const rotulo = ROTULO_STATUS[status]
  return <span className={classeStatus(status)}>{rotulo ? L(rotulo[0], rotulo[1]) : status}</span>
}

/** O card de um projeto — TRÊS LINHAS, e a do meio é a que importa.
 *
 *  Código em cima (é o que se varre a grade procurando), nome grande no meio,
 *  e o estado embaixo, empurrado para o rodapé para que todos os cards da fila
 *  o alinhem na mesma altura mesmo com nomes de uma ou duas linhas.
 *
 *  A COORDENAÇÃO SAIU. Ela aparecia como terceira linha e é a informação que
 *  menos distingue um projeto de outro numa grade — a mesma pessoa coordena
 *  vários —, além de estar em branco na maioria dos projetos recém-criados, o
 *  que fazia os cards da mesma fila terem alturas diferentes. Ela vive na
 *  ficha, que é a tela de QUEM É a obra.
 */
function CardProjeto({
  projeto,
  onAbrir,
}: {
  projeto: Projeto
  onAbrir: (p: Projeto) => void
}) {
  return (
    <button type="button" className="home-card" onClick={() => onAbrir(projeto)}>
      <span className="home-cod">{projeto.codigo}</span>
      <span className="home-nome">{projeto.nome}</span>
      <Status status={projeto.status} />
    </button>
  )
}
