/** Esqueleto da aplicação (ver "Sistema visual" no `CLAUDE.md`).
 *
 *   ┌──────────┬──────────────────────────────────────────┐
 *   │  MARCA   │  TOPBAR 56px  breadcrumb ··· ações  ⬤user │  colada, com blur
 *   │──────────├──────────────────────────────────────────┤
 *   │ SIDEBAR  │                                          │
 *   │  240px   │  <Outlet />                              │
 *   │  ↔ 52px  │                                          │
 *   │          │                                          │
 *   └──────────┴──────────────────────────────────────────┘
 *                                          [ dock mobile ]
 *
 *  SÓ A ESQUERDA EMPURRA: a sidebar empurra o conteúdo (é a primeira coluna do
 *  grid). Painel da direita, quando houver, sobrepõe — se empurrasse, abri-lo
 *  reflowaria a tabela e o usuário perderia de vista a linha que acabou de
 *  abrir.
 */
import { useCallback, useState } from 'react'
import { NavLink, Outlet, useLocation, useMatch } from 'react-router-dom'

import ApontarErro from '@/components/ApontarErro'
import { useAuth } from '@/auth/AuthContext'
import BuscaGlobal from '@/components/BuscaGlobal'
import Convidar from '@/components/Convidar'
import Sino from '@/components/Sino'
import UsuarioMenu from '@/components/UsuarioMenu'
import { useI18n } from '@/i18n'
import { ProvedorMigalha } from '@/layout/migalha'
import {
  GRUPOS,
  ITENS_ADMIN,
  ITENS_CONTA,
  ITENS_GLOBAIS,
  ITENS_PROJETO,
  type GrupoNav,
  type ItemNav,
} from '@/layout/nav'
import { PREFIXO_PROJETO, rotaProjeto, useProjeto } from '@/projeto/ProjetoContext'
import { useTheme } from '@/theme/ThemeProvider'

/** A sidebar nasce EXPANDIDA.
 *
 *  A razão original era que `main` estava limitado a 1180px, então recolher não
 *  devolvia espaço a ninguém — só escondia nove rótulos. **Esse limite caiu em
 *  29/07/2026** e `main` usa a largura cheia: recolher devolve espaço de
 *  verdade agora. Nascer expandida continua certo por outro motivo — quem abre
 *  a plataforma pela primeira vez precisa ler os rótulos para saber o que existe,
 *  e uma coluna de nove ícones mudos não se aprende. */
const CHAVE_NAV = 'spbim_nav_recolhida'
/** Ordem dos grupos, arrastada pelo usuário. Por login: duas pessoas no mesmo
 *  navegador não herdam a organização uma da outra.
 *
 *  A CHAVE É VERSIONADA (`_v2`), e é preciso subir a versão sempre que a ordem
 *  PADRÃO dos grupos mudar em `nav.ts`. `ordenarGrupos` respeita a ordem salva
 *  e só anexa os grupos novos no fim — o que significa que, sem trocar a chave,
 *  quem já usou a plataforma continuaria vendo a sequência antiga e a mudança
 *  simplesmente não apareceria para ele. Foi o que ia acontecer com a
 *  reordenação de 29/07/2026, em que Projeto passou à frente de Auditoria.
 *
 *  Trocar a chave descarta a ordem que a pessoa tinha arrastado. É o preço: ou
 *  isso, ou a ordem padrão nunca mais muda para quem já entrou uma vez. */
const CHAVE_ORDEM = 'spbim_nav_ordem_v2'

function leRecolhida(): boolean {
  try {
    return localStorage.getItem(CHAVE_NAV) === '1'
  } catch {
    return false
  }
}

function leOrdem(login: string | undefined): GrupoNav[] | null {
  if (!login) return null
  try {
    const bruto = localStorage.getItem(`${CHAVE_ORDEM}:${login}`)
    return bruto ? (JSON.parse(bruto) as GrupoNav[]) : null
  } catch {
    return null
  }
}

/** A ordem salva reconciliada com a atual: chaves que sumiram do código são
 *  descartadas e grupos novos entram no fim. Sem isso, uma ordem antiga no
 *  navegador esconderia um grupo recém-criado — o usuário nunca veria a
 *  funcionalidade nova e não teria como saber por quê. */
function ordenarGrupos(
  todos: typeof GRUPOS,
  salva: GrupoNav[] | null,
): typeof GRUPOS {
  if (!salva) return todos
  const conhecidos = new Map(todos.map((g) => [g.chave, g]))
  const ordenados = salva.map((c) => conhecidos.get(c)).filter((g) => g !== undefined)
  const faltando = todos.filter((g) => !salva.includes(g.chave))
  return [...ordenados, ...faltando]
}

/** O ícone de um item — um desenho, ou um NÚMERO.
 *
 *  O `texto` existe para os três LOD, cuja diferença entre si é exatamente o
 *  número (ver `ICONE_CHECKLIST`, em `nav.ts`). Duas coisas o fazem funcionar no
 *  tamanho de um ícone:
 *
 *  `textLength` com `lengthAdjust`, que ESTICA os dígitos até a largura da
 *  caixa. Sem ele, "300" numa fonte de 13/24 fica miúdo no meio de um quadrado
 *  vazio e some ao lado dos desenhos vizinhos, que ocupam a caixa inteira.
 *
 *  E `stroke: none` com `fill: currentColor`, o inverso do desenho. O `svg`
 *  declara `stroke` para as linhas dos ícones; herdado pelo texto, ele
 *  contornaria cada dígito com 1.8px — a 19px isso fecha os vãos do 0 e do 3, e
 *  o número vira uma mancha. */
function Icone({ path, texto, tam = 18 }: { path?: string; texto?: string; tam?: number }) {
  return (
    <svg
      className="ic"
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
      {texto ? (
        <text
          x="12"
          y="12"
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="13"
          fontWeight="700"
          textLength="21"
          lengthAdjust="spacingAndGlyphs"
          fill="currentColor"
          stroke="none"
        >
          {texto}
        </text>
      ) : (
        <path d={path} />
      )}
    </svg>
  )
}

const CHEVRON_ESQ = 'M15 18l-6-6 6-6'
const CHEVRON_DIR = 'M9 18l6-6-6-6'
const SOL =
  'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4'
const LUA = 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z'
const GLOBO =
  'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z'

/** Pílula de ação da topbar — A MICROINTERAÇÃO-ASSINATURA do sistema.
 *
 *  Nasce redonda (só o ícone) e o rótulo CRESCE da direita para a esquerda no
 *  hover. É o que permite várias ferramentas na topbar sem virar uma fileira de
 *  ícones mudos nem uma barra de texto. A animação é toda CSS (`.pillact`). */
function PillAcao({
  path,
  rotulo,
  onClick,
  ativo,
}: {
  path: string
  rotulo: string
  onClick: () => void
  ativo?: boolean
}) {
  return (
    <button
      type="button"
      className={`pillact${ativo ? ' on' : ''}`}
      onClick={onClick}
      title={rotulo}
      aria-label={rotulo}
    >
      <span className="rot">{rotulo}</span>
      <span className="ico">
        <Icone path={path} tam={19} />
      </span>
    </button>
  )
}

/** Um item do menu casa com o caminho atual, ou com um caminho abaixo dele. */
function casa(alvo: string, caminho: string): boolean {
  return caminho === alvo || caminho.startsWith(`${alvo}/`)
}

export default function Shell() {
  const { usuario, sair } = useAuth()
  const { lang, setLang, L } = useI18n()
  const { theme, setTheme } = useTheme()
  const { projeto, projetos, referencia, selecionar, paginasOcultas } = useProjeto()
  const { pathname } = useLocation()
  const emProjeto = useMatch(`${PREFIXO_PROJETO}/:projetoId/*`)
  /** O caminho DEPOIS do projeto (`painel`, `modelos/abc`) — é contra ele que
   *  os itens de escopo de projeto se comparam. */
  const trilho = emProjeto?.params['*'] ?? ''
  /** O painel administrativo é a TERCEIRA área com sidebar própria. `casa` e
   *  não igualdade: `/admin/usuarios` também está dentro dele. */
  const emAdmin = casa('/admin', pathname)
  /** E as configurações da conta são a QUARTA (31/07/2026). Mesmo mecanismo, e
   *  pela mesma razão do `/admin`: quem entra aqui saiu do trabalho para cuidar
   *  da própria conta, então não há contexto de projeto que a troca de barra
   *  possa apagar. É essa a diferença em relação à configuração DO PROJETO, que
   *  continua sendo página com abas. */
  const emConta = casa('/configuracoes', pathname)

  /** Os últimos pedaços do breadcrumb, publicados pela página — hoje,
   *  `disciplina › modelo` na auditoria. Ver `layout/migalha.tsx`. */
  const [migalha, setMigalha] = useState<string[] | null>(null)
  const [recolhida, setRecolhida] = useState(leRecolhida)
  const [gruposOff, setGruposOff] = useState<Record<string, boolean>>({})
  const [ordem, setOrdem] = useState<GrupoNav[] | null>(() => leOrdem(usuario?.login))
  const [arrastando, setArrastando] = useState<GrupoNav | null>(null)

  const grupos = ordenarGrupos(GRUPOS, ordem)

  /** Solta o grupo arrastado na posição do alvo e persiste. */
  const reordenar = useCallback(
    (alvo: GrupoNav) => {
      if (!arrastando || arrastando === alvo) return
      const chaves = grupos.map((g) => g.chave)
      const de = chaves.indexOf(arrastando)
      const para = chaves.indexOf(alvo)
      if (de < 0 || para < 0) return
      chaves.splice(para, 0, ...chaves.splice(de, 1))
      setOrdem(chaves)
      try {
        localStorage.setItem(`${CHAVE_ORDEM}:${usuario?.login}`, JSON.stringify(chaves))
      } catch {
        /* modo privado: a ordem vale só nesta sessão */
      }
    },
    [arrastando, grupos, usuario?.login],
  )

  const alternarNav = useCallback(() => {
    setRecolhida((atual) => {
      const proximo = !atual
      try {
        localStorage.setItem(CHAVE_NAV, proximo ? '1' : '0')
      } catch {
        /* modo privado: a preferência simplesmente não persiste */
      }
      return proximo
    })
  }, [])

  // A SIDEBAR É CONTEXTUAL, em quatro áreas: o painel administrativo, as
  // configurações da conta, um projeto, ou a organização. Cada uma troca o menu
  // inteiro. Uma lista só misturava tudo e deixava metade dela sem sentido
  // conforme onde se estivesse.
  //
  // A ordem do ternário importa: as duas áreas de caminho ABSOLUTO (`/admin` e
  // `/configuracoes`) vêm primeiro porque nenhuma delas vive dentro de um
  // projeto — ler assim deixa claro que elas têm precedência sobre qualquer
  // contexto herdado, mesmo que na prática as condições não coincidam.
  //
  // `permissoes` do /auth/me já vem resolvido: o backend aplica o padrão do
  // papel quando o usuário não tem lista própria.
  const doEscopo = emAdmin
    ? ITENS_ADMIN
    : emConta
      ? ITENS_CONTA
      : emProjeto
        ? ITENS_PROJETO
        : ITENS_GLOBAIS
  const itens = doEscopo.filter(
    (item) =>
      (!item.exigePermissao || usuario?.permissoes.includes(item.exigePermissao)) &&
      // As páginas ocultas para esta pessoa NESTE projeto (migration 0016). Na
      // mesma linha da permissão porque é o mesmo estatuto — conveniência de
      // navegação, não segurança; a API decide sozinha. A diferença é o alcance:
      // `exigePermissao` vale na organização, isto vale num projeto, e por isso
      // só se aplica aos itens de escopo `projeto`.
      !(item.escopo === 'projeto' && paginasOcultas.has(item.rota)),
  )

  /** Para onde o item aponta. Item de projeto sem projeto de referência não
   *  aponta para lugar nenhum: a organização não tem projeto (ou a lista ainda
   *  está vindo), e o item vira um rótulo apagado em vez de um link quebrado. */
  const destino = useCallback(
    (item: ItemNav): string | null => {
      // `admin`, `conta` e `global` já trazem o caminho absoluto; os de projeto
      // precisam do id, que não está no item.
      if (item.escopo !== 'projeto') return item.rota
      const alvo = projeto ?? referencia
      if (!alvo) return null
      return rotaProjeto(alvo.id, item.rota)
    },
    [projeto, referencia],
  )

  // Prefixo mais longo. O detalhe de um modelo (`modelos/<id>`) não está no
  // menu, mas agora CASA sozinho: desde que a lista virou `modelos`, o detalhe
  // é um caminho abaixo dela, e `casa()` reconhece isso. Antes era preciso um
  // fallback fixo apontando para `painel`, porque `modelos/<id>` não descendia
  // de rota nenhuma — o aninhamento correto resolveu o caso especial.
  const atual =
    itens
      .filter((i) => {
        if (i.escopo === 'projeto') return !!emProjeto && casa(i.rota, trilho)
        return casa(i.rota, pathname)
      })
      .sort((a, b) => b.rota.length - a.rota.length)[0] ?? (emProjeto ? undefined : itens[0])

  const escuro = theme === 'dark'

  return (
    <div className="app" data-nav={recolhida ? 'off' : 'on'}>
      <aside>
        {/* Marca. Altura de 56px, a MESMA da topbar, para as duas linharem.
            É um LINK para a home: agora que a sidebar troca de conteúdo em três
            áreas, a marca é o único elemento que não muda — e o canto superior
            esquerdo é onde se clica para voltar ao começo em qualquer sistema.
            `end` para não ficar marcada como ativa em toda rota. */}
        <NavLink className="brand" to="/" end title={L('Ir para o início', 'Go to home')}>
          {/* SEM MARCA GRÁFICA por enquanto. O quadrado "SP" era um
              provisório, e um provisório em accent no canto superior esquerdo
              puxa mais atenção do que o item de menu ativo logo abaixo — o
              contrário do que a regra 1 do sistema pede. Volta quando houver
              logotipo de verdade. */}
          <div className="brand-txt">
            <b>SPBIM</b>
            <span>{L('Coordenação BIM', 'BIM Coordination')}</span>
          </div>
        </NavLink>

        {/* Recolher: círculo saltando da borda. SEMPRE visível — um controle
            que só aparece no hover não é descoberto por quem não usa mouse. */}
        <button
          type="button"
          className="nav-toggle"
          onClick={alternarNav}
          title={recolhida ? L('Expandir', 'Expand') : L('Recolher', 'Collapse')}
          aria-label={recolhida ? L('Expandir', 'Expand') : L('Recolher', 'Collapse')}
        >
          <Icone path={recolhida ? CHEVRON_DIR : CHEVRON_ESQ} tam={15} />
        </button>

        <div className="nav-scroll thin-scroll">
          {/* Não há mais bloco de "voltar": dentro de um projeto o primeiro
              item da barra é o MESMO `Projetos` da Home (ver `nav.ts`), e é ele
              que leva de volta. Um item que vai para a mesma tela deve ter a
              mesma cara nas duas barras. */}
          {grupos.map((grupo, i) => {
            const doGrupo = itens.filter((it) => it.grupo === grupo.chave)
            if (doGrupo.length === 0) return null

            const rotulo = L(grupo.pt, grupo.en)
            const fechado = !!gruposOff[grupo.chave]
            // Recolhida, o grupo sempre mostra os itens: não há rótulo em que
            // clicar para reabri-lo.
            const mostra = recolhida || !rotulo || !fechado

            return (
              <div
                key={grupo.chave}
                // O grupo inteiro é o alvo de soltura, não só o cabeçalho: a
                // faixa de alguns pixels do título seria difícil de acertar.
                onDragOver={(e) => rotulo && e.preventDefault()}
                onDrop={() => rotulo && reordenar(grupo.chave)}
                className={arrastando === grupo.chave ? 'nav-grupo arrastando' : 'nav-grupo'}
              >
                {rotulo &&
                  (recolhida ? (
                    // Recolhida, o cabeçalho vira um divisor DE MESMA ALTURA.
                    // Sem isso cada grupo encolhe um pouco, os ícones deslizam
                    // na vertical e a diferença acumula ao longo da coluna.
                    i > 0 && <div className="nav-divisor" />
                  ) : (
                    <button
                      type="button"
                      className="nav-grupo-cab"
                      // Só arrasta expandida: recolhida não há rótulo para
                      // pegar, e o alvo seria um ícone de 18px.
                      draggable
                      onDragStart={() => setArrastando(grupo.chave)}
                      onDragEnd={() => setArrastando(null)}
                      onClick={() =>
                        setGruposOff((atual) => ({ ...atual, [grupo.chave]: !atual[grupo.chave] }))
                      }
                      title={L(
                        'Clique para recolher · arraste para reordenar',
                        'Click to collapse · drag to reorder',
                      )}
                    >
                      <span>{rotulo}</span>
                      <i>{fechado ? '+' : '−'}</i>
                    </button>
                  ))}

                {mostra && (
                  <nav>
                    {doGrupo.map((item) => (
                      <ItemLink
                        key={item.rota}
                        item={item}
                        para={destino(item)}
                        rotulo={L(item.pt, item.en)}
                      />
                    ))}
                  </nav>
                )}
              </div>
            )
          })}
        </div>

        {/* O RODAPÉ DA BARRA É UM SLOT, e o que ocupa ele depende da área:
            dentro de um projeto, Convidar; fora, Sair. Um lugar fixo para "a
            ação desta barra" vale mais do que dois botões disputando o pé.

            Sair continua ANOTADO como destrutivo em CLAUDE.md — a diferença é
            que aqui ele fica no canto mais distante dos controles de trabalho,
            e o painel da conta segue tendo o mesmo caminho. */}
        {emProjeto && projeto ? (
          <div className="side-foot">
            <Convidar projeto={projeto} />
          </div>
        ) : (
          usuario && (
            <div className="side-foot">
              <button
                type="button"
                className="side-botao side-sair"
                onClick={sair}
                title={L('Sair', 'Exit')}
              >
                <Icone
                  path="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"
                  tam={17}
                />
                <span className="nav-rot">{L('Sair', 'Exit')}</span>
              </button>
            </div>
          )
        )}
      </aside>

      <div className="col">
        <header className="topbar">
          {/* BREADCRUMB: todos os itens no mesmo tamanho, só o último com peso
              e tinta cheia. Sem accent — accent significa "ação/seleção" no
              resto do sistema, e a página atual não é nem uma nem outra.

              A trilha é CLIENTE › PROJETO › TELA, a hierarquia do domínio
              (organização → cliente → projeto). O cliente entra desde que o
              projeto tenha um: agora que ele é entidade, é o que a home usa
              como pasta, e repetir aqui a mesma árvore evita que a topbar
              conte uma história diferente da tela de onde se veio. */}
          <div className="tb-crumbs">
            {projeto?.cliente_nome && (
              <>
                <NavLink className="tb-crumb" to="/">
                  {projeto.cliente_nome}
                </NavLink>
                <span className="sep">/</span>
              </>
            )}
            {projeto &&
              (projetos.length > 1 ? (
                <select
                  className="tb-crumb"
                  value={projeto.id}
                  onChange={(e) => selecionar(e.target.value)}
                  aria-label={L('Projeto', 'Project')}
                >
                  {projetos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.codigo} — {p.nome}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="tb-crumb">{projeto.codigo}</span>
              ))}
            {projeto && atual && <span className="sep">/</span>}
            {/* Com o modelo à frente, o nome da TELA deixa de ser o último e
                perde o peso: quem está na planilha do CPQ11-ARCH-R22 está nele,
                e "Auditoria geral" vira o caminho até ali. */}
            {atual && (
              <span className={`tb-crumb${migalha?.length ? '' : ' atual'}`}>
                {L(atual.pt, atual.en)}
              </span>
            )}
            {/* SÓ O ÚLTIMO É `atual`. Os do meio (a disciplina) são caminho, não
                destino — dar-lhes a tinta cheia faria a barra ter dois "onde eu
                estou", que é o que a regra 1 do sistema visual evita. */}
            {migalha?.map((trecho, i) => (
              <span key={trecho}>
                <span className="sep">/</span>
                <span className={`tb-crumb${i === migalha.length - 1 ? ' atual' : ''}`}>
                  {trecho}
                </span>
              </span>
            ))}
          </div>

          <div className="tb-acoes">
            {/* Primeiro da fileira: é a ferramenta de maior alcance da barra,
                e o Ctrl+K a alcança sem o mouse. */}
            <BuscaGlobal />
            <Sino />
            {/* Vizinho do sino de propósito: um traz o que o sistema tem a
                dizer, o outro leva o que se tem a dizer sobre ele. Antes vivia
                dentro do menu da conta, a dois cliques de distância e atrás de
                um rótulo que não é sobre defeito nenhum. */}
            <ApontarErro />
            <PillAcao
              path={escuro ? SOL : LUA}
              rotulo={escuro ? L('Claro', 'Light') : L('Escuro', 'Dark')}
              onClick={() => setTheme(escuro ? 'light' : 'dark')}
            />
            <PillAcao
              path={GLOBO}
              rotulo={lang === 'pt' ? 'English' : 'Português'}
              onClick={() => setLang(lang === 'pt' ? 'en' : 'pt')}
            />
            {/* Por último: é a âncora da conta, e o canto direito da barra é
                onde se procura por ela. */}
            <UsuarioMenu />
          </div>
        </header>

        <main>
          {/* O provedor envolve só o `Outlet`: quem publica a migalha são as
              telas, e a topbar acima é quem a consome. */}
          <ProvedorMigalha value={setMigalha}>
            <Outlet />
          </ProvedorMigalha>
        </main>
      </div>

      {/* Dock mobile — os MESMOS itens da sidebar, que some abaixo de 820px.
          EXCEÇÃO deliberada à regra do ativo: aqui ele revela o rótulo por
          largura animada, porque no toque não existe hover para desambiguar
          ícones. */}
      <nav className="dock">
        {itens.map((item) => {
          const para = destino(item)
          if (!para) return null
          return (
            <NavLink
              key={item.rota}
              to={para}
              end={item.rota === '/'}
              className={({ isActive }) => (isActive ? 'on' : '')}
              title={L(item.pt, item.en)}
            >
              <Icone path={item.path} texto={item.texto} tam={19} />
              <span>{L(item.pt, item.en)}</span>
            </NavLink>
          )
        })}
      </nav>
    </div>
  )
}

/** ITEM ATIVO = COR + PESO. Sem fundo, sem pílula, sem barra lateral (ver a
 *  nota em `app.css`). */
function ItemLink({ item, para, rotulo }: { item: ItemNav; para: string | null; rotulo: string }) {
  // Sem destino: a tela existe, mas não há projeto para abri-la. Fica no lugar,
  // apagada — sumir ensinaria que a funcionalidade não existe, quando o que
  // falta é um projeto.
  if (!para) {
    return (
      <span className="nav-off" title={rotulo} aria-disabled="true">
        <Icone path={item.path} texto={item.texto} />
        <span className="nav-rot">{rotulo}</span>
      </span>
    )
  }

  return (
    <NavLink
      to={para}
      // `end` na raiz: sem ele, `to="/"` casa com QUALQUER rota e o Início
      // ficaria permanentemente marcado, junto com a página de verdade.
      end={item.rota === '/'}
      className={({ isActive }) => (isActive ? 'on' : '')}
      title={rotulo}
    >
      <Icone path={item.path} texto={item.texto} />
      <span className="nav-rot">{rotulo}</span>
    </NavLink>
  )
}
