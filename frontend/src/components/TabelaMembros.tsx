/** A TABELA DE MEMBROS e a gaveta de ações — o miolo das duas telas de membros.
 *
 *  As duas (`Gerenciar membros`, global, e `Membros` dentro de um projeto) têm a
 *  MESMA estrutura: painel de recortes à esquerda, tabela à direita, gaveta de
 *  ações. O que difere é só o que a barra agrupa — projetos numa, equipes na
 *  outra — e o conjunto de linhas. Por isso a tabela vive aqui: duas cópias
 *  divergiriam na primeira coluna que alguém acrescentasse.
 *
 *  A COLUNA `PROJETO` APARECE SÓ NA LISTA GLOBAL. Dentro de um projeto ela
 *  repetiria o breadcrumb em toda linha; fora dele, é o que diz de onde a linha
 *  vem — e sem ela a mesma pessoa apareceria duas vezes sem explicação.
 *
 *  AS AÇÕES ABREM UMA GAVETA, não um menu de duas linhas. O menu do VDCity tem
 *  "Editar" e "Remover", e "Editar" abre um formulário — dois passos para chegar
 *  a um lugar que a gaveta alcança em um. Remover fica dentro dela, no fim, longe
 *  de onde se clica para salvar.
 */
import { useEffect, useState } from 'react'

import { useAuth } from '@/auth/AuthContext'
import Gaveta from '@/components/Gaveta'
import PaginasVisiveis from '@/components/PaginasVisiveis'
import { Campo, Erro, Vazio } from '@/components/ui'
import { useI18n } from '@/i18n'
import { ApiError, api } from '@/lib/api'
import type { Membro, UsuarioCadastro } from '@/lib/types'

/** Os papéis que se escolhem NUM PROJETO.
 *
 *  Três, e não os sete do enum de organização: `admin` e `cliente` não são
 *  papéis de trabalho num projeto (um administra o tenant, o outro só vê o
 *  portal), e `revisor`/`fornecedor` não apareceram em pedido nenhum. Os três que
 *  ficam cobrem o que foi pedido — coordinator, user, viewer — e são valores que
 *  o enum JÁ TEM. Um vocabulário novo obrigaria a manter um mapa entre os dois, e
 *  o mapa divergiria; é o que a docstring de `ProjetoMembro` já dizia.
 *
 *  OS RÓTULOS MUDARAM EM 05/08/2026, A PEDIDO — `Visualizador · Colaborador ·
 *  Gerente`, do menos para o mais, e a `dica` de cada um é o que se combinou que
 *  ele significa. Só o rótulo: os VALORES seguem `leitor`/`auditor`/`coordenador`,
 *  que é o que o banco guarda.
 *
 *  NÃO CONFUNDIR COM O PAPEL DE PLATAFORMA (`PAPEIS`, em `pages/admin/
 *  Usuarios.tsx`: Usuário · Admin · Super admin). São duas perguntas: o que a
 *  pessoa faz NESTE projeto, e o que ela é NA PLATAFORMA. Uma pode ser Gerente
 *  aqui e apenas Usuário lá — e é a de lá que hoje decide o que a API deixa
 *  fazer, porque este papel ainda não autoriza. */
export const PAPEIS_PROJETO: Array<{
  valor: string
  pt: string
  en: string
  dica: [string, string]
}> = [
  {
    valor: 'leitor',
    pt: 'Visualizador',
    en: 'Viewer',
    dica: ['Só acompanha: lê o que já está publicado.', 'Follows along: reads what is published.'],
  },
  {
    valor: 'auditor',
    pt: 'Colaborador',
    en: 'Collaborator',
    dica: [
      'Preenche a auditoria e cuida dos modelos do projeto.',
      'Fills in the audit and looks after the project models.',
    ],
  },
  {
    valor: 'coordenador',
    pt: 'Gerente',
    en: 'Manager',
    dica: [
      'Conduz o projeto: publica round e responde por ele.',
      'Runs the project: publishes rounds and answers for it.',
    ],
  },
]

const ENGRENAGEM =
  'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6h.09A1.65 1.65 0 0 0 10.09 3V3a2 2 0 1 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z'

/** As iniciais: primeira letra do nome e da última palavra. É a mesma regra do
 *  avatar da topbar — numa lista de quinze pessoas, uma letra só não distingue.
 *  Exportada porque a tela de CONTAS usa o mesmo avatar: as duas listam pessoas,
 *  e duas regras de inicial dariam siglas diferentes para a mesma pessoa em telas
 *  vizinhas. */
export function iniciais(nome: string | null, login: string | null): string {
  const cru = nome?.trim() || (login ?? '').split('@')[0] || ''
  const partes = cru.split(/[\s._-]+/).filter(Boolean)
  const primeira = partes[0]?.[0] ?? ''
  const ultima = partes.length > 1 ? (partes[partes.length - 1]?.[0] ?? '') : ''
  return (primeira + ultima).toUpperCase() || '?'
}

/** O rótulo do papel, na língua da pessoa. EXPORTADA porque três lugares
 *  precisam dizer a mesma palavra: a tabela, a gaveta de convite e o e-mail que
 *  ela dispara. Três cópias divergiriam no dia em que um rótulo mudasse — e o
 *  e-mail é o único dos três que ninguém relê depois de enviado. */
export function rotuloPapel(papel: string, L: (pt: string, en: string) => string): string {
  const achado = PAPEIS_PROJETO.find((p) => p.valor === papel)
  return achado ? L(achado.pt, achado.en) : papel
}

export default function TabelaMembros({
  membros,
  comProjeto = false,
  onMudou,
}: {
  membros: Membro[]
  /** Mostra a coluna PROJETO. Só na lista global — ver o cabeçalho. */
  comProjeto?: boolean
  onMudou: () => void
}) {
  const { L } = useI18n()
  const { usuario: logado, pode } = useAuth()
  /** A ENGRENAGEM NÃO EXISTE PARA QUEM SÓ VISUALIZA (06/08/2026, a pedido), e
   *  desde 07/08 ela EXISTE para quem coordena este projeto.
   *
   *  A gaveta que ela abre edita papel e equipe NO projeto. Um visualizador
   *  recém-cadastrado a via em todas as linhas e podia abrir a de qualquer
   *  colega; a API já recusava (403), mas botão que só sabe falhar anuncia um
   *  poder que não existe. A coluna "Ações" some junto — uma coluna com todas as
   *  células vazias é moldura sem conteúdo.
   *
   *  ISTO É ESCONDER, NÃO PROTEGER: quem protege é `exigir_coordenacao_do_
   *  projeto`, no backend. Se esta linha sumir, volta o botão inútil — não volta
   *  um buraco. */
  /** COORDENA ESTE PROJETO — sai da própria lista, e não de uma prop.
   *
   *  A tabela já recebe os membros do projeto; procurar a própria linha nela é
   *  mais barato e mais honesto que a página calcular e passar para baixo: uma
   *  prop poderia divergir da lista que está desenhada na tela.
   *
   *  Na lista GLOBAL (`comProjeto`) isto é sempre falso, e é o certo — lá as
   *  linhas são de vários projetos, e coordenar um não dá poder sobre os outros.
   *  Quem administra o cadastro continua alcançando tudo. */
  const coordenaEste =
    !comProjeto &&
    membros.some((m) => m.usuario_id === logado?.id && m.papel === 'coordenador')
  const administra = pode('admin_cadastro') || coordenaEste
  /** ⚠ AS PÁGINAS VISÍVEIS SÃO SÓ DE QUEM ADMINISTRA, e não de quem coordena
   *  (07/08/2026). Elas moram em `usuario.permissoes` e valem na organização
   *  INTEIRA: um coordenador do CPQ11 apagaria telas de alguém no DANTE 2, que é
   *  exatamente o vazamento de alcance que a migration 0004 evitava. É a única
   *  coisa da gaveta que o coordenador não alcança. */
  const podeEsconderTelas = pode('admin_cadastro')
  /** QUEM a gaveta mostra. Sobrevive ao fechamento — ver o bloco que a monta. */
  const [naGaveta, setNaGaveta] = useState<Membro | null>(null)
  /** SE ela está aberta. `null` fecha e dispara a animação de saída. */
  const [editando, setEditando] = useState<Membro | null>(null)
  /** Um contador de aberturas, usado como `key`: cada abertura é uma montagem
   *  nova, e é o que zera o formulário entre uma edição e a seguinte. */
  const [abertura, setAbertura] = useState(0)

  function abrir(m: Membro) {
    setNaGaveta(m)
    setEditando(m)
    setAbertura((n) => n + 1)
  }

  // TABELA VAZIA NÃO EXISTE. O estado vazio dentro de um `<td colSpan>` desenhava
  // a caixa tracejada DENTRO de uma célula, com a régua de cabeçalho solta acima
  // dela — duas molduras e uma linha de títulos que não titula nada. Ou há linhas
  // e há tabela, ou não há nem uma nem outra.
  if (membros.length === 0) {
    return (
      <Vazio
        titulo={L('Nenhum membro aqui', 'No members here')}
        texto={L(
          'Ninguém foi registrado neste recorte ainda. Use "Adicionar membro" para vincular alguém que já tem conta na organização.',
          'Nobody has been registered in this scope yet. Use “Add member” to link someone who already has an account in the organization.',
        )}
      />
    )
  }

  return (
    <>
      <div className="memb-tabela">
        <table>
          <thead>
            <tr>
              <th>{L('Nome', 'Name')}</th>
              <th>{L('E-mail', 'E-mail')}</th>
              {comProjeto && <th>{L('Projeto', 'Project')}</th>}
              <th>{L('Empresa', 'Company')}</th>
              <th>{L('Equipe', 'Team')}</th>
              <th>{L('Papel no projeto', 'Role in project')}</th>
              <th>{L('Status', 'Status')}</th>
              {administra && <th className="memb-acoes-col">{L('Ações', 'Actions')}</th>}
            </tr>
          </thead>
          <tbody>
            {membros.map((m) => (
              <tr key={m.id}>
                <td>
                  <div className="mcell">
                    <span className="memb-av">{iniciais(m.usuario_nome, m.usuario_login)}</span>
                    <span className="memb-nome">{m.usuario_nome ?? m.usuario_login}</span>
                  </div>
                </td>
                <td className="co">{m.usuario_login}</td>
                {comProjeto && (
                  <td className="co">
                    <span className="code">{m.projeto_codigo}</span>
                  </td>
                )}
                <td className="co">{m.empresa_nome ?? '—'}</td>
                {/* A equipe em versalete: é rótulo de grupo, e é assim que ela
                    aparece na barra que agrupa por ela. */}
                <td className="memb-equipe">{m.equipe ?? '—'}</td>
                <td className="co">{rotuloPapel(m.papel, L)}</td>
                <td>
                  {/* ESTADO SEMÂNTICO, translúcido (regra 2): `ok` para ativo,
                      `alerta` para pendente — pendente PEDE ação de quem
                      administra, porque a pessoa ainda não consegue entrar. */}
                  <span
                    className={`pill ${m.usuario_status === 'ativo' ? 'ok' : 'alerta'}`}
                  >
                    {m.usuario_status === 'ativo'
                      ? L('Ativo', 'Active')
                      : L('Pendente', 'Pending')}
                  </span>
                </td>
                {administra && (
                <td className="memb-acoes-col">
                  {/* ⚠ NINGUÉM EDITA O PRÓPRIO VÍNCULO (05/08/2026, a pedido).
                      Trocar o próprio papel ou se remover do projeto é mexer no
                      que decide o que se pode fazer — e o erro aqui é de
                      desfazer caro: quem se rebaixa por engano pode não ter mais
                      como voltar. Desabilitado e NÃO escondido, com o porquê no
                      `title`: uma célula vazia na sua linha faz procurar o botão
                      que sumiu. A guarda de verdade está na API. */}
                  <button
                    type="button"
                    className="memb-eng"
                    disabled={m.usuario_id === logado?.id}
                    onClick={() => abrir(m)}
                    title={
                      m.usuario_id === logado?.id
                        ? L(
                            'Você não edita o seu próprio vínculo — peça a outra pessoa da coordenação.',
                            'You cannot edit your own membership — ask someone else on the coordination team.',
                          )
                        : L('Ações', 'Actions')
                    }
                    aria-label={L('Ações', 'Actions')}
                  >
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d={ENGRENAGEM} />
                    </svg>
                  </button>
                </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* A GAVETA SOBREVIVE AO FECHAMENTO, e é o que permite animar a saída.
          Antes era `{editando && <GavetaMembro …/>}`: o pai desmontava a árvore
          no clique e não havia o que animar — a gaveta sumia num quadro.

          Agora `naGaveta` guarda QUEM ela mostra e `editando` diz SE está
          aberta. O `key` é um contador de aberturas, e não o id do membro: sem
          ele a gaveta ficaria montada entre uma abertura e outra, e reabrir a
          MESMA pessoa traria de volta o que se digitou e desistiu de gravar na
          vez anterior — exatamente o que a desmontagem existia para evitar (ver
          `Gaveta.tsx`). Com o contador, toda abertura é uma montagem nova. */}
      {naGaveta && (
        <GavetaMembro
          key={abertura}
          aberta={!!editando}
          membro={naGaveta}
          podeEsconderTelas={podeEsconderTelas}
          onFechar={() => setEditando(null)}
          onMudou={() => {
            setEditando(null)
            onMudou()
          }}
        />
      )}
    </>
  )
}

/** ADICIONAR MEMBRO — o botão "+" do cabeçalho do painel, e a gaveta dele.
 *
 *  ELE NÃO É O `Convidar`, e a confusão custou uma regressão. `Convidar` gera um
 *  link de token para o PORTAL DO CLIENTE — quem o recebe vê o projeto de fora,
 *  sem conta na plataforma. Este vincula ao projeto alguém que JÁ TEM conta na
 *  organização, que é a outra metade: `POST /projetos/{id}/membros`. Ao montar a
 *  tela nova eu pus o `Convidar` neste cabeçalho e o único caminho para criar um
 *  vínculo desapareceu — a tela ficou uma lista que nunca poderia ter linhas.
 *
 *  A LISTA É DE CONTAS QUE AINDA NÃO SÃO MEMBROS. Mostrar quem já está no projeto
 *  só serviria para tomar o 409 de duplicado ("esta pessoa já é membro"), e o erro
 *  chegaria depois de escolher.
 */
export function AdicionarMembro({
  projetoId,
  jaMembros,
  onMudou,
  podeMontarEquipe,
}: {
  projetoId: string
  /** Os `usuario_id` que já têm vínculo — saem da lista de escolha. */
  jaMembros: string[]
  onMudou: () => void
  /** `admin_cadastro` ou coordenar ESTE projeto. Calculado pela tabela, que já
   *  tem a lista de membros na mão. */
  podeMontarEquipe?: boolean
}) {
  const { L } = useI18n()
  const { pode } = useAuth()
  const [aberta, setAberta] = useState(false)
  const [contas, setContas] = useState<UsuarioCadastro[]>([])
  const [usuarioId, setUsuarioId] = useState('')
  const [papel, setPapel] = useState('auditor')
  const [equipe, setEquipe] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (!aberta) return
    setUsuarioId('')
    setEquipe('')
    api.usuarios
      .listar()
      .then((r) => setContas(r.itens))
      .catch(() => setContas([]))
  }, [aberta])

  const disponiveis = contas.filter((c) => !jaMembros.includes(c.id))

  async function adicionar() {
    if (!usuarioId) {
      setErro(L('Escolha a pessoa.', 'Pick the person.'))
      return
    }
    setErro(null)
    setSalvando(true)
    try {
      await api.membros.adicionar(projetoId, {
        usuario_id: usuarioId,
        papel,
        equipe: equipe.trim() || null,
      })
      setAberta(false)
      onMudou()
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : String(e))
    } finally {
      setSalvando(false)
    }
  }

  const rotulo = L('Adicionar membro', 'Add member')

  /** VINCULAR ALGUÉM A UM PROJETO É ATO DE QUEM COORDENA (06/08/2026, a pedido).
   *
   *  `POST /projetos/{id}/membros` exige `admin_cadastro` e responderia 403 —
   *  então o botão só sabia falhar para um visualizador. Ele fica no cabeçalho
   *  do painel, ao lado da busca, e some inteiro: não há estado desabilitado que
   *  explique melhor do que a ausência num lugar onde não há linha a que ele se
   *  refira. */
  if (!(podeMontarEquipe ?? pode('admin_cadastro'))) return null

  return (
    <>
      {/* `.pillact` (regra 3): nasce redondo com o "+" e o rótulo cresce no
          hover. Largura cheia aqui é o que transbordava o painel de 300px. */}
      <button
        type="button"
        className={`pillact pgacao${aberta ? ' on' : ''}`}
        onClick={() => setAberta(true)}
        title={rotulo}
        aria-label={rotulo}
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
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M19 8v6M22 11h-6" />
          </svg>
        </span>
        <span className="rot">{rotulo}</span>
      </button>

      <Gaveta
        aberta={aberta}
        titulo={rotulo}
        sub={L('Quem já tem conta na organização', 'Someone who already has an account')}
        onFechar={() => setAberta(false)}
        acoes={
          <button className="btn pri" onClick={adicionar} disabled={salvando}>
            {salvando ? L('Adicionando…', 'Adding…') : L('Adicionar ao projeto', 'Add to project')}
          </button>
        }
      >
        <Erro mensagem={erro} />

        <Campo rotulo={L('Pessoa', 'Person')}>
          <select className="f" value={usuarioId} onChange={(e) => setUsuarioId(e.target.value)}>
            <option value="">{L('— escolha —', '— pick one —')}</option>
            {disponiveis.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome ?? c.login} · {c.login}
              </option>
            ))}
          </select>
        </Campo>

        <Campo rotulo={L('Papel no projeto', 'Role in project')}>
          <select className="f" value={papel} onChange={(e) => setPapel(e.target.value)}>
            {PAPEIS_PROJETO.map((p) => (
              <option key={p.valor} value={p.valor}>
                {L(p.pt, p.en)}
              </option>
            ))}
          </select>
        </Campo>

        <Campo rotulo={L('Equipe', 'Team')}>
          <input
            className="f"
            placeholder="COORDENAÇÃO, INOVAÇÃO, COMERCIAL…"
            value={equipe}
            onChange={(e) => setEquipe(e.target.value)}
          />
        </Campo>

        {disponiveis.length === 0 && contas.length > 0 && (
          <p className="hint">
            {L(
              'Todas as contas da organização já estão neste projeto. Contas novas se criam em Painel administrativo › Usuários.',
              'Every account in the organization is already on this project. New accounts are created under Admin panel › Users.',
            )}
          </p>
        )}

        <p className="hint">
          {L(
            'Isto vincula alguém que já tem conta. Para dar acesso a quem ainda não tem, crie a conta em Painel administrativo › Usuários — e para mostrar o projeto a um cliente de fora, use Convidar, que gera um link do portal.',
            'This links someone who already has an account. To give access to someone who does not, create the account under Admin panel › Users — and to show the project to an outside client, use Invite, which generates a portal link.',
          )}
        </p>
      </Gaveta>
    </>
  )
}

/** A gaveta de ações de um membro: equipe, papel e remoção.
 *
 *  REMOVER FICA NO FIM DO CORPO, e não no rodapé ao lado de Salvar. O rodapé da
 *  gaveta é do caminho de "fazer" (as regras dela estão em `Gaveta.tsx`), e pôr
 *  o destrutivo ali daria a duas ações de peso muito diferente o mesmo peso
 *  visual. Ele pede confirmação porque tirar alguém de um projeto some com ele
 *  da lista sem deixar rastro na tela — o rastro fica na trilha.
 */
function GavetaMembro({
  aberta,
  membro,
  podeEsconderTelas,
  onFechar,
  onMudou,
}: {
  /** Fechada, ela SEGUE MONTADA até a animação de saída terminar. Quem a
   *  remonta a cada abertura é o `key` no chamador. */
  aberta: boolean
  membro: Membro
  /** Só `admin_cadastro`. Quem apenas COORDENA o projeto edita papel e equipe,
   *  mas não as telas visíveis — aquilo é da conta e vale na organização
   *  inteira. Ver o bloco onde a prop é consumida. */
  podeEsconderTelas: boolean
  onFechar: () => void
  onMudou: () => void
}) {
  const { L } = useI18n()
  const [equipe, setEquipe] = useState(membro.equipe ?? '')
  const [papel, setPapel] = useState(membro.papel)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  /** As telas escondidas — da CONTA, não deste vínculo. Ver o bloco no corpo. */
  const [ocultas, setOcultas] = useState<string[]>(membro.usuario_paginas_ocultas)

  /** Mexeram nos interruptores? Compara CONJUNTOS, não as listas: o componente
   *  acrescenta no fim e "Ocultar todas" reordena, então duas listas com o mesmo
   *  conteúdo em ordens diferentes significam "ninguém mudou nada". */
  const mudouAsPaginas =
    ocultas.length !== membro.usuario_paginas_ocultas.length ||
    ocultas.some((r) => !membro.usuario_paginas_ocultas.includes(r))

  async function salvar() {
    setErro(null)
    setSalvando(true)
    try {
      // DUAS GRAVAÇÕES, porque são duas entidades: o vínculo (papel e equipe
      // NESTE projeto) e a conta (as telas, que valem em todos). O vínculo vai
      // primeiro — é o assunto da tela, e se a segunda falhar o que se veio
      // fazer já está gravado.
      await api.membros.atualizar(membro.id, { equipe: equipe.trim() || null, papel })
      // Só quando mudou: sem isto, abrir a gaveta e salvar sem tocar nos
      // interruptores escreveria na conta de quem não se veio editar — e a
      // trilha registraria uma alteração que ninguém fez.
      if (mudouAsPaginas) await api.usuarios.definirPaginas(membro.usuario_id, ocultas)
      onMudou()
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : String(e))
    } finally {
      setSalvando(false)
    }
  }

  async function remover() {
    setErro(null)
    setSalvando(true)
    try {
      await api.membros.remover(membro.id)
      onMudou()
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : String(e))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Gaveta
      aberta={aberta}
      titulo={membro.usuario_nome ?? membro.usuario_login ?? L('Membro', 'Member')}
      sub={membro.projeto_codigo ?? undefined}
      onFechar={onFechar}
      acoes={
        <button className="btn pri" onClick={salvar} disabled={salvando}>
          {salvando ? L('Salvando…', 'Saving…') : L('Salvar', 'Save')}
        </button>
      }
    >
      <Erro mensagem={erro} />

      <Campo rotulo={L('Equipe', 'Team')}>
        {/* Texto livre e não lista: as equipes vão aparecendo conforme a
            coordenação as nomeia, e uma lista fechada exigiria cadastrá-las
            antes de poder usá-las. Vira lista quando o conjunto estabilizar. */}
        <input
          className="f"
          placeholder="COORDENAÇÃO, INOVAÇÃO, COMERCIAL…"
          value={equipe}
          onChange={(e) => setEquipe(e.target.value)}
        />
      </Campo>

      <Campo rotulo={L('Papel no projeto', 'Role in project')}>
        <select className="f" value={papel} onChange={(e) => setPapel(e.target.value)}>
          {PAPEIS_PROJETO.map((p) => (
            <option key={p.valor} value={p.valor}>
              {L(p.pt, p.en)}
            </option>
          ))}
          {/* O PAPEL ANTIGO, se a linha tiver um valor fora dos três. Sem esta
              opção o `select` abriria no primeiro item e SALVAR trocaria o papel
              da pessoa sem ninguém ter escolhido isso. */}
          {!PAPEIS_PROJETO.some((p) => p.valor === papel) && <option value={papel}>{papel}</option>}
        </select>
      </Campo>
      {/* O que o papel escolhido significa, sob o campo e só o dele: listar os
          três obriga a procurar qual é o que importa. */}
      {(() => {
        const p = PAPEIS_PROJETO.find((x) => x.valor === papel)
        return p ? <p className="hint">{L(...p.dica)}</p> : null
      })()}

      {/* ⚠ O AVISO É OBRIGATÓRIO ENQUANTO O PAPEL NÃO AUTORIZAR. A tela oferece
          "Visualizador", e quem escolhe isso acredita ter restringido alguém —
          mas hoje quem barra é a permissão de ORGANIZAÇÃO, e este campo é
          registro. Omitir isso seria prometer um controle que não existe. Sai
          quando `requer_permissao` passar a olhar o projeto da rota. */}
      <p className="hint">
        {L(
          'O papel registra o combinado no projeto e ainda NÃO restringe o acesso: quem barra hoje é a permissão da pessoa na organização. Para tirar acesso de verdade, mude o papel dela em Gestão de membros.',
          'The role records what was agreed on the project and does NOT restrict access yet: what blocks today is the person’s organization permission. To actually remove access, change their role under member management.',
        )}
      </p>

      {/* OS INTERRUPTORES DE PÁGINA, aqui também (05/08/2026, a pedido).
          O componente é o mesmo da gaveta de conta — ver `PaginasVisiveis`.

          ⚠ MAS O DADO É DA CONTA, NÃO DESTE VÍNCULO, e o aviso abaixo diz isso
          com todas as letras. As telas visíveis moram em `usuario.permissoes`;
          desligar uma aqui esconde a tela para essa pessoa em TODOS os projetos.
          Fazer por projeto exigiria uma coluna por (projeto, pessoa) — migration
          —, e isso está fora do que se pediu.

          Sem esse aviso, a gaveta mentiria por contexto: tudo mais nela (papel,
          equipe) é por projeto, e quem lê de cima para baixo conclui que estes
          interruptores também são. */}
      {podeEsconderTelas && (
        <PaginasVisiveis ocultas={ocultas} onMudar={setOcultas}>
          <p className="hint">
            {L(
              'Estas telas são da CONTA da pessoa: o que se desligar aqui vale em todos os projetos, não só neste. E não é permissão — esconde o item do menu; quem barra a API é o papel dela na organização.',
              'These screens belong to the person’s ACCOUNT: whatever you switch off here applies to every project, not just this one. And it is not a permission — it hides the menu item; what blocks the API is their organization role.',
            )}
          </p>
        </PaginasVisiveis>
      )}

      <div className="memb-remover">
        {confirmando ? (
          <>
            <p className="hint" style={{ marginTop: 0 }}>
              {L(
                'Tirar esta pessoa do projeto não apaga a conta dela nem o que ela auditou — o histórico fica nas auditorias assinadas e na trilha.',
                'Removing this person from the project deletes neither their account nor what they audited — the history stays in the signed audits and in the trail.',
              )}
            </p>
            <button className="btn ruim" onClick={remover} disabled={salvando}>
              {L('Confirmar a remoção', 'Confirm removal')}
            </button>
          </>
        ) : (
          <button className="btn ruim" onClick={() => setConfirmando(true)}>
            {L('Remover do projeto', 'Remove from project')}
          </button>
        )}
      </div>
    </Gaveta>
  )
}
