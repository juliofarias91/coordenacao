/** SP-404 · Apontamentos — a CENTRAL da organização.
 *
 *  Era uma tela de projeto até 29/07/2026, e não precisava ser: o backend
 *  sempre tratou `projeto_id` como filtro OPCIONAL (`api/v1/apontamentos.py`).
 *  Era a interface que insistia em passá-lo, e o efeito era que ver as
 *  pendências de dois projetos exigia trocar de projeto e somar de cabeça —
 *  justamente o que uma central existe para evitar.
 *
 *  Agora lista tudo por padrão, com o projeto virando coluna e filtro. Criar
 *  continua exigindo escolher um projeto: `projeto_id` é NOT NULL na tabela, e
 *  um apontamento sem dono não teria onde ser resolvido.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'

import { Campo, Editor, Erro, Segmented, Vazio } from '@/components/ui'
import { useI18n } from '@/i18n'
import { ApiError, api } from '@/lib/api'
import type { Apontamento, Empresa, Modelo } from '@/lib/types'
import { useProjeto } from '@/projeto/ProjetoContext'

type Filtro = 'todos' | 'aberto' | 'em_analise' | 'resolvido'

const CLASSE_PRIORIDADE: Record<string, string> = {
  alta: 'pill ruim',
  media: 'pill alerta',
  baixa: 'pill',
}

type Rascunho = {
  id?: string
  projeto_id: string
  titulo: string
  descricao: string
  prioridade: 'alta' | 'media' | 'baixa'
  modelo_id: string
  responsavel_id: string
}

const VAZIO: Rascunho = {
  projeto_id: '',
  titulo: '',
  descricao: '',
  prioridade: 'media',
  modelo_id: '',
  responsavel_id: '',
}

/** Todos os projetos. String vazia e não `null` porque é valor de `<select>`. */
const TODOS = ''

export default function Apontamentos() {
  const { projetos, referencia, carregando } = useProjeto()
  const { L } = useI18n()

  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [projetoFiltro, setProjetoFiltro] = useState<string>(TODOS)
  const [itens, setItens] = useState<Apontamento[]>([])
  const [modelos, setModelos] = useState<Modelo[]>([])
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [rascunho, setRascunho] = useState<Rascunho | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async () => {
    setErro(null)
    try {
      const [lista, emps] = await Promise.all([
        api.apontamentos.listar(projetoFiltro || null, filtro === 'todos' ? {} : { status: filtro }),
        // Empresas são da organização, não do projeto: servem à coluna
        // "Responsável" de qualquer linha, venha ela de que projeto vier.
        api.empresas.listar(),
      ])
      setItens(lista.itens)
      setEmpresas(emps.itens)
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : String(e))
    }
  }, [projetoFiltro, filtro])

  useEffect(() => {
    carregar()
  }, [carregar])

  // Modelos são POR PROJETO, então só fazem sentido depois que o rascunho tem
  // um. Carregar todos de todos os projetos encheria o seletor de códigos que
  // não pertencem ao apontamento sendo escrito.
  const projetoDoRascunho = rascunho?.projeto_id
  useEffect(() => {
    if (!projetoDoRascunho) {
      setModelos([])
      return
    }
    api.modelos
      .listar(projetoDoRascunho)
      .then((r) => setModelos(r.itens))
      .catch(() => setModelos([]))
  }, [projetoDoRascunho])

  const nomeProjeto = useMemo(() => {
    const mapa = new Map(projetos.map((p) => [p.id, p.codigo]))
    return (id: string) => mapa.get(id) ?? '—'
  }, [projetos])

  const nomeModelo = (id: string | null) => modelos.find((m) => m.id === id)?.codigo ?? '—'
  const nomeEmpresa = (id: string | null) => empresas.find((e) => e.id === id)?.nome ?? '—'

  async function salvar() {
    if (!rascunho) return
    if (!rascunho.projeto_id) {
      setErro(L('Escolha o projeto do apontamento.', 'Pick the issue’s project.'))
      return
    }
    setErro(null)
    setSalvando(true)
    const corpo = {
      titulo: rascunho.titulo,
      descricao: rascunho.descricao || null,
      prioridade: rascunho.prioridade,
      modelo_id: rascunho.modelo_id || null,
      responsavel_id: rascunho.responsavel_id || null,
    }
    try {
      if (rascunho.id) await api.apontamentos.atualizar(rascunho.id, corpo)
      else await api.apontamentos.criar({ projeto_id: rascunho.projeto_id, ...corpo })
      setRascunho(null)
      await carregar()
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : String(e))
    } finally {
      setSalvando(false)
    }
  }

  async function mudarStatus(item: Apontamento, status: string) {
    setErro(null)
    try {
      await api.apontamentos.atualizar(item.id, { status })
      await carregar()
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : String(e))
    }
  }

  if (carregando) return <p className="hint">{L('Carregando…', 'Loading…')}</p>

  if (projetos.length === 0) {
    return (
      <>
        <Vazio
          titulo={L('Nenhum projeto', 'No project')}
          texto={L(
            'Apontamentos pertencem a um projeto. Crie o primeiro em Administração › Projetos.',
            'Issues belong to a project. Create the first one in Administration › Projects.',
          )}
        />
      </>
    )
  }

  return (
    <>
      <div className="acoes">
        <Segmented
          itens={[
            ['todos', L('Todos', 'All')],
            ['aberto', L('Abertos', 'Open')],
            ['em_analise', L('Em análise', 'In review')],
            ['resolvido', L('Resolvidos', 'Resolved')],
          ]}
          valor={filtro}
          onChange={setFiltro}
        />

        <select
          className="f"
          style={{ maxWidth: 240 }}
          value={projetoFiltro}
          onChange={(e) => setProjetoFiltro(e.target.value)}
          aria-label={L('Projeto', 'Project')}
        >
          <option value={TODOS}>{L('Todos os projetos', 'All projects')}</option>
          {projetos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.codigo} — {p.nome}
            </option>
          ))}
        </select>

        <div style={{ flex: 1 }} />
        <button
          className="btn pri"
          onClick={() =>
            setRascunho({
              ...VAZIO,
              // Já vem preenchido com o projeto filtrado, ou o último visitado:
              // quem filtrou por um projeto e clica em "novo" quer criar nele.
              projeto_id: projetoFiltro || referencia?.id || '',
            })
          }
        >
          + {L('Novo apontamento', 'New issue')}
        </button>
      </div>

      {!rascunho && <Erro mensagem={erro} />}

      {rascunho && (
        <Editor
          titulo={
            rascunho.id ? L('Editar apontamento', 'Edit issue') : L('Novo apontamento', 'New issue')
          }
          onSalvar={salvar}
          onCancelar={() => {
            setRascunho(null)
            setErro(null)
          }}
          salvando={salvando}
          erro={erro}
        >
          {/* Primeiro campo do formulário: é ele que determina quais modelos
              o seletor abaixo pode oferecer. Só se troca ao criar — mudar um
              apontamento de projeto levaria junto o modelo vinculado, que é
              de outro. */}
          <Campo rotulo={L('Projeto', 'Project')}>
            <select
              className="f"
              disabled={!!rascunho.id}
              value={rascunho.projeto_id}
              onChange={(e) =>
                setRascunho({ ...rascunho, projeto_id: e.target.value, modelo_id: '' })
              }
            >
              <option value="">{L('— escolha —', '— pick one —')}</option>
              {projetos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.codigo} — {p.nome}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo={L('Título', 'Title')} largo>
            <input
              className="f"
              value={rascunho.titulo}
              onChange={(e) => setRascunho({ ...rascunho, titulo: e.target.value })}
            />
          </Campo>
          <Campo rotulo={L('Prioridade', 'Priority')}>
            <select
              className="f"
              value={rascunho.prioridade}
              onChange={(e) =>
                setRascunho({ ...rascunho, prioridade: e.target.value as Rascunho['prioridade'] })
              }
            >
              <option value="alta">{L('Alta', 'High')}</option>
              <option value="media">{L('Média', 'Medium')}</option>
              <option value="baixa">{L('Baixa', 'Low')}</option>
            </select>
          </Campo>
          <Campo rotulo={L('Responsável', 'Responsible')}>
            <select
              className="f"
              value={rascunho.responsavel_id}
              onChange={(e) => setRascunho({ ...rascunho, responsavel_id: e.target.value })}
            >
              <option value="">{L('— nenhum —', '— none —')}</option>
              {empresas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo={L('Modelo', 'Model')} largo>
            <select
              className="f"
              disabled={!rascunho.projeto_id}
              value={rascunho.modelo_id}
              onChange={(e) => setRascunho({ ...rascunho, modelo_id: e.target.value })}
            >
              <option value="">{L('— não vinculado —', '— not linked —')}</option>
              {modelos.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.codigo}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo={L('Descrição', 'Description')} largo>
            <textarea
              className="f"
              rows={3}
              value={rascunho.descricao}
              onChange={(e) => setRascunho({ ...rascunho, descricao: e.target.value })}
            />
          </Campo>
        </Editor>
      )}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th style={{ width: 80 }}>{L('Código', 'Code')}</th>
              <th style={{ width: 90 }}>{L('Projeto', 'Project')}</th>
              <th>{L('Apontamento', 'Issue')}</th>
              <th>{L('Responsável', 'Responsible')}</th>
              <th style={{ textAlign: 'right' }}>{L('Situação', 'Status')}</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((item) => (
              <tr key={item.id}>
                <td className="code">{item.codigo}</td>
                <td className="code">{nomeProjeto(item.projeto_id)}</td>
                <td>
                  <b>{item.titulo}</b>
                  {item.descricao && <div className="mmeta">{item.descricao}</div>}
                  {/* O modelo só é resolvível quando é do projeto aberto no
                      formulário; numa lista de vários projetos, mostrar "—"
                      para o resto seria mentira. Some quando não se sabe. */}
                  {item.modelo_id && nomeModelo(item.modelo_id) !== '—' && (
                    <div className="mmeta">{nomeModelo(item.modelo_id)}</div>
                  )}
                </td>
                <td className="co">{nomeEmpresa(item.responsavel_id)}</td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <span className={CLASSE_PRIORIDADE[item.prioridade ?? 'media'] ?? 'pill'}>
                    {item.prioridade}
                  </span>{' '}
                  <span className={item.status === 'resolvido' ? 'pill ok' : 'pill'}>
                    {item.status}
                  </span>{' '}
                  {item.status !== 'resolvido' && (
                    <button className="btn sm" onClick={() => mudarStatus(item, 'resolvido')}>
                      {L('Resolver', 'Resolve')}
                    </button>
                  )}{' '}
                  <button
                    className="btn sm"
                    onClick={() =>
                      setRascunho({
                        id: item.id,
                        projeto_id: item.projeto_id,
                        titulo: item.titulo,
                        descricao: item.descricao ?? '',
                        prioridade: (item.prioridade ?? 'media') as Rascunho['prioridade'],
                        modelo_id: item.modelo_id ?? '',
                        responsavel_id: item.responsavel_id ?? '',
                      })
                    }
                  >
                    {L('Editar', 'Edit')}
                  </button>
                </td>
              </tr>
            ))}
            {itens.length === 0 && (
              <tr>
                <td colSpan={5} className="empty">
                  <b>{L('Nenhum apontamento', 'No issues')}</b>
                  {L(
                    'Apontamentos podem ser espelhados como issues no ACC.',
                    'Issues can be mirrored to ACC Issues.',
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
