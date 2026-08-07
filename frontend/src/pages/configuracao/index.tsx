/** Fase 1 · Configuração do projeto — uma PÁGINA COM PAINEL.
 *
 *  Aqui se define TUDO o que um projeto tem de ter antes de ser auditado: a
 *  ficha da obra, o PEB, o BIM Mandate, as áreas, os projetistas, a nomenclatura
 *  e as disciplinas. **Tudo dentro da página**: a barra lateral do projeto não
 *  sai da tela e não é trocada por outra.
 *
 *  ═══ A FILEIRA DE ABAS VIROU PAINEL EM 07/08/2026, a pedido
 *
 *  ISTO NÃO DESFAZ A DECISÃO DE 29/07 — desfaz a FORMA dela, não a razão. O que
 *  se recusou naquele dia foi a configuração virar uma ÁREA CONTEXTUAL, com
 *  sidebar própria substituindo a do projeto: trocar a barra do app a cada seção
 *  apagava da tela em que projeto se estava, e deixava a área indistinguível do
 *  painel administrativo. Isso continua valendo, e continua não existindo
 *  `escopo: 'config'` em `nav.ts`. O que entrou é o `.pgsplit`, que é o TERCEIRO
 *  caminho e o previsto para navegação de SEGUNDO nível: o painel é da PÁGINA,
 *  nasce abaixo do breadcrumb, e a barra do projeto fica inteira à esquerda dele.
 *
 *  POR QUE SAIR DAS ABAS. Elas eram oito e ocupavam a linha inteira — a última
 *  ficava a mais de mil pixels da primeira, e a fileira era a primeira coisa da
 *  página, empurrando o formulário para baixo. Uma coluna de sete lê-se de uma
 *  olhada, tem largura para o rótulo inteiro e não cresce para o lado quando a
 *  nona seção aparecer.
 *
 *  O PADRÃO É O DA AUDITORIA, e de propósito: painel de 300px, os dois
 *  cabeçalhos de 48px na mesma linha, busca no cabeçalho do painel, recolher no
 *  cabeçalho do conteúdo. Duas telas com painel de página que se desenhassem
 *  diferente seriam duas invenções onde cabe uma.
 *
 *  O RECOLHER VIVE NO CABEÇALHO DO CONTEÚDO — se ficasse no do painel,
 *  recolher levaria embora o botão de trazer de volta. E recolher DESMONTA o
 *  painel, não o transforma em trilho de ícones: "Nomenclaturas & padrões" não
 *  sobrevive a virar desenho.
 *
 *  A SEÇÃO ATIVA É TINTA E PESO, E NADA MAIS (regras 1 e 6): sem fundo, sem
 *  pílula e SEM SUBLINHADO. O traço embaixo era a exceção prevista para uma
 *  fileira horizontal, onde tinta sozinha não distingue; numa coluna ele deixa
 *  de ser necessário e passa a ser só mais um risco na tela. Junto com ele foi
 *  embora um sublinhado que ninguém tinha escolhido: `.aba` era um `<a>` e nunca
 *  declarou `text-decoration`, então o navegador o desenhava riscado por baixo o
 *  tempo todo — ativo ou não. `.pgitem` declara.
 *
 *  As ROTAS ficaram (`configuracao/ficha`, `/disciplinas`, …). O item é um
 *  `NavLink`, não estado local: o endereço continua dizendo em que seção se
 *  está, o link é copiável e o botão voltar do navegador funciona entre seções.
 *  Um `useState` aqui teria custado as três coisas de uma vez.
 *
 *  O NOME DA SEÇÃO NÃO VAI PARA O BREADCRUMB, ao contrário do que a planilha de
 *  auditoria faz com o modelo. Lá o breadcrumb terminava em "Auditoria geral", que
 *  não diz o que se está auditando; aqui ele termina em "Configurações do
 *  projeto", que é exatamente o que esta tela é — e o cabeçalho do conteúdo, a
 *  poucos pixels abaixo e na mesma margem, já escreve a seção. Publicar seria a
 *  mesma palavra duas vezes na vertical.
 */
import { useCallback, useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'

import { Vazio } from '@/components/ui'
import { useI18n } from '@/i18n'
import { normalizar } from '@/lib/texto'
import { useProjeto } from '@/projeto/ProjetoContext'

const CHAVE_PAINEL = 'spbim_configuracao_painel'

/** O `PanelLeft` do lucide, o mesmo da auditoria: um retângulo com a coluna da
 *  esquerda destacada. Diz o que o botão faz sem depender de rótulo. */
const PATH_PAINEL = 'M3 3h18v18H3zM9 3v18'
const PATH_LUPA = 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.3-4.3'

/** A ordem é a de quem monta um projeto do zero, e cada seção depende das
 *  anteriores: diz QUEM É a obra, o que se combinou sobre ela, em que setores
 *  ela se divide, quem produz, como o arquivo se chama — e só então as
 *  disciplinas, que precisam de área, projetista e nomenclatura para fazerem
 *  sentido.
 *
 *  OS TRÊS DOCUMENTOS ENTRARAM EM 07/08/2026, a pedido. Ficha, PEB e BIM Mandate
 *  eram itens da barra do projeto, um embaixo do outro, logo acima desta tela —
 *  quatro linhas do mesmo assunto em quatro graus (a identidade da obra, o rumo
 *  que a equipe define, a exigência que vem de fora, e os ajustes), todas
 *  preenchidas de uma vez quando o projeto nasce. A barra é o que se usa todo
 *  dia; isto aqui se preenche uma vez.
 *
 *  A FICHA É A PRIMEIRA, e é o destino de `configuracao` sem seção: ela é o
 *  cadastro da obra, e vem antes de tudo o que se define sobre ela. Ela já morou
 *  aqui como aba `Projeto & Cliente`, saiu em 30/07 e voltou — a razão de então
 *  (duas telas editando os mesmos cinco campos) foi resolvida de vez: agora só
 *  existe uma, e ela é esta.
 *
 *  `Convidar cliente` SAIU EM 07/08/2026, a pedido, e a tela NÃO foi apagada:
 *  virou o recorte `Portal do cliente` de `Membros do projeto`. As sete que
 *  ficaram respondem "como esta obra é auditada" e se preenchem uma vez, quando
 *  o projeto nasce; convidar cliente é dar ACESSO a alguém, se faz a qualquer
 *  momento e é a mesma pergunta que a tela de membros já responde — quem enxerga
 *  este projeto. A rota antiga redireciona, que é o que se deve a um link salvo.
 *
 *  `Cores` SAIU em 31/07/2026, a pedido, absorvida por `Disciplinas`. Era uma
 *  tabela de quatro linhas, só leitura, dizendo qual cor é qual macrodisciplina —
 *  uma legenda numa aba separada da coisa que ela legenda. Quem cadastra uma
 *  disciplina escolhe a macrodisciplina, e é ali que a cor importa; agora a
 *  amostra aparece no formulário, na tabela e numa legenda ao pé dela.
 *  A cor NÃO virou editável — ela sai de `macro` e a paleta é validada. A rota
 *  `cores` redireciona, para não quebrar link nem histórico. */
const SECOES: Array<[string, string, string]> = [
  ['ficha', 'Ficha do projeto', 'Project record'],
  // `PEB · diretrizes` virou só `Diretrizes` em 07/08/2026, a pedido: as três
  // abas de dentro viraram uma, e "PEB ·" era o prefixo que agrupava as três.
  // A ROTA CONTINUA `peb` — está em link salvo e no histórico, e renomeá-la não
  // compraria nada. Vale o mesmo para `areas`, logo abaixo.
  ['peb', 'Diretrizes', 'Guidelines'],
  ['mandate', 'BIM Mandate', 'BIM Mandate'],
  // O FLUXO É O QUARTO DOCUMENTO, e fica com os outros três: os quatro dizem o
  // que foi COMBINADO nesta obra, e só depois deles começa o que se preenche.
  // Ele era aba do PEB e é estático — nada a ler do banco, nada onde digitar.
  ['fluxo', 'Fluxo da auditoria', 'Audit flow'],
  // ANTES DE DISCIPLINAS, e não depois: a disciplina MARCA as áreas que audita
  // (migration 0019), e uma tela de marcar sem lista para marcar é um campo
  // vazio sem explicação. A ordem das seções é a ordem de preenchimento.
  //
  // `Áreas` virou `Setorização` em 07/08/2026, a pedido, e absorveu a grade de
  // imagens que era a aba `Dados & setorização` do PEB. A ENTIDADE continua
  // sendo "área" — é o que `projeto.areas`, `disciplina.areas` e `auditoria.area`
  // guardam, e é como a matriz chama a coluna; `Setorização` é o assunto da
  // seção, "área" é a unidade.
  ['areas', 'Setorização', 'Sectorization'],
  ['projetistas', 'Projetistas', 'Designers'],
  ['nomenclaturas', 'Nomenclaturas & padrões', 'Nomenclatures & standards'],
  ['disciplinas', 'Disciplinas', 'Disciplines'],
]

function leRecolhido(): boolean {
  try {
    return localStorage.getItem(CHAVE_PAINEL) === '1'
  } catch {
    return false
  }
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

export default function Configuracao() {
  const { L } = useI18n()
  const { projeto, carregando } = useProjeto()
  const { pathname } = useLocation()

  const [recolhido, setRecolhido] = useState(leRecolhido)
  const [busca, setBusca] = useState('')

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

  /** A BUSCA CASA COM OS DOIS IDIOMAS, e não só com o rótulo à vista: os nomes
   *  desta tela são termos técnicos que muita gente sabe em inglês antes de
   *  saber em português — quem digita "record" tem de achar a Ficha, e quem
   *  digita "areas", as Áreas. Acento e caixa saem do caminho pelo mesmo
   *  motivo. */
  const visiveis = useMemo(() => {
    const t = normalizar(busca.trim())
    if (!t) return SECOES
    return SECOES.filter(([, pt, en]) => normalizar(`${pt} ${en}`).includes(t))
  }, [busca])

  if (carregando) return <p className="hint">{L('Carregando…', 'Loading…')}</p>

  if (!projeto) {
    return (
      <Vazio
        titulo={L('Nenhum projeto nesta organização', 'No project in this organization')}
        texto={L(
          'Crie o primeiro no Painel administrativo › Projetos.',
          'Create the first one under Admin panel › Projects.',
        )}
      />
    )
  }

  // A seção corrente sai do ENDEREÇO, e não de um estado: é o `NavLink` que
  // manda, e o cabeçalho só precisa dizer o mesmo que ele. `endsWith` basta
  // porque as sete são o último segmento da rota — as sub-abas de
  // `Nomenclaturas` são estado interno dela, não rota.
  const atual = SECOES.find(([rota]) => pathname.endsWith(`/${rota}`))

  return (
    <div className="pgsplit">
      {/* Desmontado quando recolhido — o `flex: 1` do conteúdo reflui e ocupa
          os 300px, que é o ponto de recolher. */}
      {!recolhido && (
        <aside className="pgside">
          {/* O CABEÇALHO É FERRAMENTA, não rótulo — a mesma receita da auditoria.
              Aqui ele tem só a busca: no painel de lá o "+" abre uma auditoria
              nova, e neste não há nada a criar no nível da seção. */}
          <div className="pghead pgferramentas">
            <div className="pgbusca">
              <Ico path={PATH_LUPA} tam={14} />
              <input
                className="f"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder={L('Buscar seção…', 'Search section…')}
                aria-label={L('Buscar seção', 'Search section')}
              />
            </div>
          </div>

          <nav className="pglist">
            {visiveis.map(([rota, pt, en]) => (
              <NavLink
                key={rota}
                to={rota}
                className={({ isActive }) => (isActive ? 'pgitem on' : 'pgitem')}
              >
                {L(pt, en)}
              </NavLink>
            ))}

            {visiveis.length === 0 && (
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
                ? L('Mostrar as seções', 'Show sections')
                : L('Recolher as seções', 'Collapse sections')
            }
          >
            <Ico path={PATH_PAINEL} />
          </button>
          <span>
            {atual ? L(atual[1], atual[2]) : L('Configurações do projeto', 'Project settings')}
          </span>
        </div>
        <div className="pgbody">
          <Outlet />
        </div>
      </section>
    </div>
  )
}
