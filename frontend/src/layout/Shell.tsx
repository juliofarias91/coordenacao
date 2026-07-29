/** Esqueleto da aplicação, na estrutura do `ui-kit-export` (README §2 e §4).
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

import { useAuth } from '@/auth/AuthContext'
import BuscaGlobal from '@/components/BuscaGlobal'
import Sino from '@/components/Sino'
import UsuarioMenu from '@/components/UsuarioMenu'
import { useI18n } from '@/i18n'
import {
  GRUPOS,
  ITENS_ADMIN,
  ITENS_GLOBAIS,
  ITENS_PROJETO,
  type GrupoNav,
  type ItemNav,
} from '@/layout/nav'
import { PREFIXO_PROJETO, rotaProjeto, useProjeto } from '@/projeto/ProjetoContext'
import { useTheme } from '@/theme/ThemeProvider'

/** A sidebar nasce EXPANDIDA aqui, ao contrário do padrão do kit.
 *
 *  Lá o padrão é recolhida porque as telas são full-bleed e cada pixel devolvido
 *  vira área de trabalho. Aqui `main` é limitado a 1180px: recolher não devolve
 *  espaço a ninguém, só esconde nove rótulos. */
const CHAVE_NAV = 'spbim_nav_recolhida'
/** Ordem dos grupos, arrastada pelo usuário. Por login: duas pessoas no mesmo
 *  navegador não herdam a organização uma da outra. */
const CHAVE_ORDEM = 'spbim_nav_ordem'

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

function Icone({ path, tam = 18 }: { path: string; tam?: number }) {
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
      <path d={path} />
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
  const { projeto, projetos, referencia, selecionar } = useProjeto()
  const { pathname } = useLocation()
  const emProjeto = useMatch(`${PREFIXO_PROJETO}/:projetoId/*`)
  /** O caminho DEPOIS do projeto (`painel`, `modelos/abc`) — é contra ele que
   *  os itens de escopo de projeto se comparam. */
  const trilho = emProjeto?.params['*'] ?? ''
  /** O painel administrativo é a TERCEIRA área com sidebar própria. `casa` e
   *  não igualdade: `/admin/usuarios` também está dentro dele. */
  const emAdmin = casa('/admin', pathname)

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

  // A SIDEBAR É CONTEXTUAL, em três áreas: o painel administrativo, um projeto,
  // ou a organização. Cada uma troca o menu inteiro. Uma lista só misturava
  // tudo e deixava metade dela sem sentido conforme onde se estivesse.
  //
  // A ordem do ternário importa: `/admin` é checado ANTES de projeto porque as
  // duas condições nunca coincidem, mas ler assim deixa claro que o painel
  // administrativo tem precedência sobre qualquer contexto herdado.
  //
  // `permissoes` do /auth/me já vem resolvido: o backend aplica o padrão do
  // papel quando o usuário não tem lista própria.
  const doEscopo = emAdmin ? ITENS_ADMIN : emProjeto ? ITENS_PROJETO : ITENS_GLOBAIS
  const itens = doEscopo.filter(
    (item) => !item.exigePermissao || usuario?.permissoes.includes(item.exigePermissao),
  )

  /** Para onde o item aponta. Item de projeto sem projeto de referência não
   *  aponta para lugar nenhum: a organização não tem projeto (ou a lista ainda
   *  está vindo), e o item vira um rótulo apagado em vez de um link quebrado. */
  const destino = useCallback(
    (item: ItemNav): string | null => {
      // `admin` e `global` já trazem o caminho absoluto; só o de projeto
      // precisa do id, que não está no item.
      if (item.escopo !== 'projeto') return item.rota
      const alvo = projeto ?? referencia
      return alvo ? rotaProjeto(alvo.id, item.rota) : null
    },
    [projeto, referencia],
  )

  // Prefixo mais longo: `modelos/:id` não está no menu, mas nasce do painel.
  // Sem o fallback, a página de detalhe ficaria com o breadcrumb vazio — e o
  // painel é onde o detalhe do modelo é aberto, como diz o crumb da própria
  // página ("Painel de controle › CÓDIGO").
  const atual =
    itens
      .filter((i) =>
        i.escopo === 'projeto' ? !!emProjeto && casa(i.rota, trilho) : casa(i.rota, pathname),
      )
      .sort((a, b) => b.rota.length - a.rota.length)[0] ??
    (emProjeto ? itens.find((i) => i.rota === 'painel') : itens[0])

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
          <div className="mk">SP</div>
          <div className="brand-txt">
            <b>SPBIM</b>
            <span>{L('Central de Auditoria', 'Audit Center')}</span>
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
          {/* CAMINHO DE VOLTA. Dentro de um projeto a sidebar troca inteira,
              então precisa haver a porta de saída — senão a única forma de
              voltar aos projetos é o logo ou o botão do navegador.

              Mostra o CÓDIGO do projeto, não "Projetos": responde ao mesmo
              tempo "onde estou" e "por onde saio", que é o que um cabeçalho de
              contexto tem de fazer. */}
          {emProjeto && (
            <NavLink className="nav-volta" to="/" title={L('Todos os projetos', 'All projects')}>
              <Icone path={CHEVRON_ESQ} tam={15} />
              <span className="nav-rot">
                <b>{projeto?.codigo ?? '—'}</b>
                <i>{L('todos os projetos', 'all projects')}</i>
              </span>
            </NavLink>
          )}

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

        {/* Sair também aqui, como no VDCity (`sidebarSignOut`): quem procura a
            saída olha primeiro o pé da barra lateral. Convive com o do menu da
            conta — são dois caminhos para a mesma porta, e nenhum deles fica
            no meio dos botões que se usa o dia todo. */}
        {usuario && (
          <div className="side-foot">
            <button type="button" className="side-sair" onClick={sair} title={L('Sair', 'Exit')}>
              <Icone
                path="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"
                tam={17}
              />
              <span className="nav-rot">{L('Sair', 'Exit')}</span>
            </button>
          </div>
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
            {atual && <span className="tb-crumb atual">{L(atual.pt, atual.en)}</span>}
          </div>

          <div className="tb-acoes">
            {/* Primeiro da fileira: é a ferramenta de maior alcance da barra,
                e o Ctrl+K a alcança sem o mouse. */}
            <BuscaGlobal />
            <Sino />
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
          <Outlet />
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
              <Icone path={item.path} tam={19} />
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
        <Icone path={item.path} />
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
      <Icone path={item.path} />
      <span className="nav-rot">{rotulo}</span>
    </NavLink>
  )
}
