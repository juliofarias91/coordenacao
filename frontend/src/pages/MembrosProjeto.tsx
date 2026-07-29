/** Membros do projeto — quem participa dele, e com que papel nele.
 *
 *  Não confundir com `Gestão de membros` (`/membros`), que é o cadastro de
 *  quem tem CONTA na organização. Aqui se responde "quem está no CPQ11", que é
 *  outra pergunta: a mesma pessoa é auditora num projeto e só leitora noutro.
 *
 *  A TELA DIZ, EM VOZ ALTA, QUE ISTO NÃO É PERMISSÃO. A tabela `projeto_membro`
 *  (migration 0004) registra participação; quem autoriza continua sendo a
 *  permissão de organização. Esconder essa distinção faria alguém pôr um leitor
 *  como "coordenador do projeto" e esperar que ele passasse a publicar rounds.
 */
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { Cabecalho, Campo, Editor, Erro, Vazio } from '@/components/ui'
import { useI18n } from '@/i18n'
import { ApiError, api } from '@/lib/api'
import type { Membro, UsuarioCadastro } from '@/lib/types'
import { useProjeto } from '@/projeto/ProjetoContext'

const PAPEIS = [
  'coordenador',
  'auditor',
  'revisor',
  'fornecedor',
  'leitor',
  'cliente',
  'admin',
] as const

type Rascunho = {
  id?: string
  usuario_id: string
  papel: string
  funcao: string
}

const VAZIO: Rascunho = { usuario_id: '', papel: 'auditor', funcao: '' }

export default function MembrosProjeto() {
  const { L } = useI18n()
  const { projeto } = useProjeto()

  const [membros, setMembros] = useState<Membro[]>([])
  const [usuarios, setUsuarios] = useState<UsuarioCadastro[]>([])
  const [rascunho, setRascunho] = useState<Rascunho | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [carregando, setCarregando] = useState(true)

  const carregar = useCallback(async () => {
    if (!projeto) return
    setErro(null)
    try {
      const [ms, us] = await Promise.all([
        api.membros.listar(projeto.id),
        // Para o seletor de "quem acrescentar". Se a rota negar (403), a tela
        // continua listando os membros — só não oferece acrescentar.
        api.usuarios.listar().catch(() => ({ itens: [] as UsuarioCadastro[] })),
      ])
      setMembros(ms)
      setUsuarios(us.itens)
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : String(e))
    } finally {
      setCarregando(false)
    }
  }, [projeto])

  useEffect(() => {
    carregar()
  }, [carregar])

  async function salvar() {
    if (!rascunho || !projeto) return
    setErro(null)
    setSalvando(true)
    const funcao = rascunho.funcao.trim() || null
    try {
      if (rascunho.id) {
        await api.membros.atualizar(rascunho.id, { papel: rascunho.papel, funcao })
      } else {
        await api.membros.adicionar(projeto.id, {
          usuario_id: rascunho.usuario_id,
          papel: rascunho.papel,
          funcao,
        })
      }
      setRascunho(null)
      await carregar()
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : String(e))
    } finally {
      setSalvando(false)
    }
  }

  async function remover(m: Membro) {
    const nome = m.usuario_nome || m.usuario_login || '—'
    if (
      !confirm(
        L(
          `Tirar ${nome} deste projeto? A conta e o que a pessoa já auditou continuam intactos.`,
          `Remove ${nome} from this project? Their account and past audits stay intact.`,
        ),
      )
    ) {
      return
    }
    setErro(null)
    try {
      await api.membros.remover(m.id)
      await carregar()
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : String(e))
    }
  }

  if (!projeto || carregando) return <p className="hint">{L('Carregando…', 'Loading…')}</p>

  // Quem ainda não é membro. Oferecer alguém que já está na lista só produziria
  // um 409 — o backend tem a unicidade, mas o erro certo é não sugerir.
  const jaMembros = new Set(membros.map((m) => m.usuario_id))
  const disponiveis = usuarios.filter((u) => !jaMembros.has(u.id) || u.id === rascunho?.usuario_id)

  return (
    <>
      <Cabecalho
        titulo={L('Membros do projeto', 'Project members')}
        sub={L(
          `Quem participa do ${projeto.codigo} e com que papel nele. É registro de participação, não de acesso: o que cada pessoa consegue fazer continua vindo das permissões dela na organização.`,
          `Who takes part in ${projeto.codigo} and in what role. This records participation, not access: what each person can actually do still comes from their organization permissions.`,
        )}
      />

      <div className="acoes">
        <button
          className="btn pri"
          disabled={disponiveis.length === 0}
          onClick={() => setRascunho({ ...VAZIO })}
        >
          + {L('Adicionar membro', 'Add member')}
        </button>
        <div style={{ flex: 1 }} />
        <Link className="btn sm" to="/membros">
          {L('Gerenciar contas', 'Manage accounts')}
        </Link>
      </div>

      {!rascunho && <Erro mensagem={erro} />}

      {rascunho && (
        <Editor
          titulo={rascunho.id ? L('Editar membro', 'Edit member') : L('Adicionar membro', 'Add member')}
          onSalvar={salvar}
          onCancelar={() => {
            setRascunho(null)
            setErro(null)
          }}
          salvando={salvando}
          erro={erro}
        >
          <Campo rotulo={L('Pessoa', 'Person')}>
            {/* Não se troca a pessoa de um vínculo: isso é remover um membro e
                acrescentar outro, e fazê-lo por edição deixaria a trilha
                dizendo "alterou" onde houve duas coisas distintas. */}
            <select
              className="f"
              disabled={!!rascunho.id}
              value={rascunho.usuario_id}
              onChange={(e) => setRascunho({ ...rascunho, usuario_id: e.target.value })}
            >
              <option value="">{L('— escolha —', '— pick one —')}</option>
              {disponiveis.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nome || u.login}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo={L('Papel neste projeto', 'Role in this project')}>
            <select
              className="f"
              value={rascunho.papel}
              onChange={(e) => setRascunho({ ...rascunho, papel: e.target.value })}
            >
              {PAPEIS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo={L('Função', 'Function')} largo>
            <input
              className="f"
              placeholder={L('Coordenação de estruturas', 'Structural coordination')}
              value={rascunho.funcao}
              onChange={(e) => setRascunho({ ...rascunho, funcao: e.target.value })}
            />
          </Campo>
        </Editor>
      )}

      {membros.length === 0 ? (
        <Vazio
          titulo={L('Ninguém registrado ainda', 'No one registered yet')}
          texto={L(
            'Ninguém foi registrado como membro deste projeto. Isso não impede o acesso — quem tem permissão na organização continua enxergando o projeto. O que falta é o registro de quem trabalha nele.',
            'No one is registered as a member of this project. That does not block access — anyone with organization permission still sees the project. What is missing is the record of who works on it.',
          )}
        />
      ) : (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>{L('Pessoa', 'Person')}</th>
                <th>{L('Papel no projeto', 'Role here')}</th>
                <th>{L('Papel na organização', 'Organization role')}</th>
                <th>{L('Função', 'Function')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {membros.map((m) => (
                <tr key={m.id}>
                  <td>
                    <b>{m.usuario_nome || m.usuario_login}</b>
                    {m.usuario_nome && <div className="mmeta">{m.usuario_login}</div>}
                  </td>
                  <td>
                    <span className="pill">{m.papel}</span>
                  </td>
                  {/* Lado a lado de propósito: é o par que responde o que a
                      pessoa consegue fazer. Divergirem é normal e informativo,
                      não um erro a esconder. */}
                  <td className="co">{m.usuario_papel_org ?? '—'}</td>
                  <td className="co">{m.funcao ?? '—'}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button
                      className="btn sm"
                      style={{ marginRight: 6 }}
                      onClick={() =>
                        setRascunho({
                          id: m.id,
                          usuario_id: m.usuario_id,
                          papel: m.papel,
                          funcao: m.funcao ?? '',
                        })
                      }
                    >
                      {L('Editar', 'Edit')}
                    </button>
                    <button className="btn sm danger" onClick={() => remover(m)}>
                      {L('Tirar', 'Remove')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="hint">
        {L(
          'O papel aqui é combinado, não aplicado: a plataforma ainda decide o acesso pelas permissões de organização, em Gestão de membros. Ligar as duas coisas mudaria como todas as rotas autorizam, e é decisão à parte.',
          'The role here is agreed, not enforced: the platform still decides access from organization permissions, under Member management. Wiring the two together would change how every route authorizes, and is a separate decision.',
        )}
      </p>
    </>
  )
}
