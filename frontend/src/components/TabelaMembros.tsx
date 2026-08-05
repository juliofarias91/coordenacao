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

import Gaveta from '@/components/Gaveta'
import { Campo, Erro, Vazio } from '@/components/ui'
import { useI18n } from '@/i18n'
import { PAGINAS_DO_PROJETO } from '@/layout/nav'
import { ApiError, api } from '@/lib/api'
import type { Membro, UsuarioCadastro } from '@/lib/types'

/** Os papéis que se escolhem NUM PROJETO.
 *
 *  Três, e não os sete do enum de organização: `admin` e `cliente` não são
 *  papéis de trabalho num projeto (um administra o tenant, o outro só vê o
 *  portal), e `revisor`/`fornecedor` não apareceram em pedido nenhum. Os três que
 *  ficam cobrem o que foi pedido — coordinator, user, viewer — e são valores que
 *  o enum JÁ TEM. Um vocabulário novo obrigaria a manter um mapa entre os dois, e
 *  o mapa divergiria; é o que a docstring de `ProjetoMembro` já dizia. */
export const PAPEIS_PROJETO: Array<{ valor: string; pt: string; en: string }> = [
  { valor: 'coordenador', pt: 'Coordenador', en: 'Coordinator' },
  { valor: 'auditor', pt: 'Usuário', en: 'User' },
  { valor: 'leitor', pt: 'Visualizador', en: 'Viewer' },
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

function rotuloPapel(papel: string, L: (pt: string, en: string) => string): string {
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
  const [editando, setEditando] = useState<Membro | null>(null)

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
              <th className="memb-acoes-col">{L('Ações', 'Actions')}</th>
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
                <td className="memb-acoes-col">
                  <button
                    type="button"
                    className="memb-eng"
                    onClick={() => setEditando(m)}
                    title={L('Ações', 'Actions')}
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editando && (
        <GavetaMembro
          membro={editando}
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
}: {
  projetoId: string
  /** Os `usuario_id` que já têm vínculo — saem da lista de escolha. */
  jaMembros: string[]
  onMudou: () => void
}) {
  const { L } = useI18n()
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
  membro,
  onFechar,
  onMudou,
}: {
  membro: Membro
  onFechar: () => void
  onMudou: () => void
}) {
  const { L } = useI18n()
  const [equipe, setEquipe] = useState(membro.equipe ?? '')
  const [papel, setPapel] = useState(membro.papel)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  /** As páginas OCULTAS. O estado guarda o que o banco guarda — as ocultas —,
   *  e a tela desenha o inverso; ver o bloco de interruptores abaixo. */
  const [ocultas, setOcultas] = useState<Set<string>>(new Set(membro.paginas ?? []))

  function alternar(rota: string) {
    setOcultas((atual) => {
      const proximo = new Set(atual)
      if (proximo.has(rota)) proximo.delete(rota)
      else proximo.add(rota)
      return proximo
    })
  }

  /** "Ocultar todas" / "Mostrar todas" de um grupo. O rótulo vira o inverso
   *  quando o grupo já está todo oculto — um botão que diz "ocultar todas" com
   *  tudo apagado é um botão que não faz nada, e quem o clica conclui que a tela
   *  travou. */
  function alternarGrupo(rotas: string[], ocultarTudo: boolean) {
    setOcultas((atual) => {
      const proximo = new Set(atual)
      for (const r of rotas) {
        if (ocultarTudo) proximo.add(r)
        else proximo.delete(r)
      }
      return proximo
    })
  }

  async function salvar() {
    setErro(null)
    setSalvando(true)
    try {
      await api.membros.atualizar(membro.id, {
        equipe: equipe.trim() || null,
        papel,
        // SEMPRE enviada: `[]` é "não oculta nada", e é diferente de não mandar
        // o campo — que, pelo `exclude_unset` da rota, seria "não mexa" e
        // deixaria as ocultas de antes no lugar.
        paginas: [...ocultas],
      })
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
      aberta
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
        </select>
      </Campo>

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

      {/* OS INTERRUPTORES DE PÁGINA (migration 0016).

          A LISTA É O PRÓPRIO MENU (`PAGINAS_DO_PROJETO`, derivada de
          `ITENS_PROJETO`), nos mesmos grupos e na mesma ordem: quem oculta está
          olhando para a sequência que a pessoa do outro lado vai ver.

          LIGADO É "VÊ", e o estado guarda o contrário. A razão de o BANCO
          guardar as OCULTAS está na migration 0016 — tela nova nasce visível. A
          razão de a TELA mostrar as visíveis é que a pergunta de quem edita é "o
          que essa pessoa enxerga?", e um painel inteiro de interruptores
          desligados para alguém que vê tudo lê-se como acesso negado. */}
      <div className="memb-paginas">
        <div className="memb-pagtit">{L('Visualização de páginas', 'Page visibility')}</div>

        {PAGINAS_DO_PROJETO.map((g) => {
          const rotas = g.itens.map((i) => i.rota)
          const todasOcultas = rotas.every((r) => ocultas.has(r))
          return (
            <div key={g.grupo} className="memb-paggrupo">
              <div className="memb-pagcab">
                <span>{L(g.pt, g.en)}</span>
                <button
                  type="button"
                  className="linkmudo"
                  onClick={() => alternarGrupo(rotas, !todasOcultas)}
                >
                  {todasOcultas ? L('Mostrar todas', 'Show all') : L('Ocultar todas', 'Hide all')}
                </button>
              </div>
              {g.itens.map((i) => {
                const visivel = !ocultas.has(i.rota)
                return (
                  <div key={i.rota} className="memb-pagitem">
                    <span>{L(i.pt, i.en)}</span>
                    {/* `role="switch"` e não checkbox: o desenho é um
                        interruptor, e o leitor de tela deve anunciar o mesmo que
                        o olho vê. */}
                    <button
                      type="button"
                      role="switch"
                      aria-checked={visivel}
                      aria-label={L(i.pt, i.en)}
                      className={`chave${visivel ? ' on' : ''}`}
                      onClick={() => alternar(i.rota)}
                    >
                      <span className="chave-bola" />
                    </button>
                  </div>
                )
              })}
            </div>
          )
        })}

        {/* ⚠ ESTE AVISO É OBRIGATÓRIO ENQUANTO ISTO NÃO AUTORIZAR — é o irmão do
            aviso do papel, acima, e pelo mesmo motivo: quem desliga um
            interruptor acredita ter trancado uma tela. Ele tira o item do menu e
            barra a rota no navegador; a API continua decidindo pelo papel da
            pessoa na ORGANIZAÇÃO. */}
        <p className="hint">
          {L(
            'Ocultar tira a página do menu desta pessoa. Não é permissão: quem barra a API é o papel dela na organização — para tirar acesso de verdade, mude-o em Painel administrativo › Usuários.',
            'Hiding removes the page from this person’s menu. It is not a permission: what blocks the API is their organization role — to actually revoke access, change it under Admin panel › Users.',
          )}
        </p>
      </div>

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
