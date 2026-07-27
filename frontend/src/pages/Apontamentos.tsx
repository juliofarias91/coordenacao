/** SP-404 · Apontamentos (issues) do projeto. */
import { useCallback, useEffect, useState } from 'react'

import { Cabecalho, Campo, Editor, Erro, Segmented, Vazio } from '@/components/ui'
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
  titulo: string
  descricao: string
  prioridade: 'alta' | 'media' | 'baixa'
  modelo_id: string
  responsavel_id: string
}

const VAZIO: Rascunho = {
  titulo: '',
  descricao: '',
  prioridade: 'media',
  modelo_id: '',
  responsavel_id: '',
}

export default function Apontamentos() {
  const { projeto, carregando } = useProjeto()
  const { L } = useI18n()
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [itens, setItens] = useState<Apontamento[]>([])
  const [modelos, setModelos] = useState<Modelo[]>([])
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [rascunho, setRascunho] = useState<Rascunho | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async () => {
    if (!projeto) return
    setErro(null)
    try {
      const [lista, mods, emps] = await Promise.all([
        api.apontamentos.listar(projeto.id, filtro === 'todos' ? {} : { status: filtro }),
        api.modelos.listar(projeto.id),
        api.empresas.listar(),
      ])
      setItens(lista.itens)
      setModelos(mods.itens)
      setEmpresas(emps.itens)
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : String(e))
    }
  }, [projeto, filtro])

  useEffect(() => {
    carregar()
  }, [carregar])

  if (carregando) return <p className="hint">{L('Carregando…', 'Loading…')}</p>
  if (!projeto) {
    return (
      <>
        <Cabecalho titulo={L('Apontamentos', 'Issues')} />
        <Vazio
          titulo={L('Nenhum projeto', 'No project')}
          texto={L('Cadastre um projeto primeiro.', 'Register a project first.')}
        />
      </>
    )
  }

  async function salvar() {
    if (!rascunho || !projeto) return
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
      else await api.apontamentos.criar({ projeto_id: projeto.id, ...corpo })
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

  const nomeModelo = (id: string | null) => modelos.find((m) => m.id === id)?.codigo ?? '—'
  const nomeEmpresa = (id: string | null) => empresas.find((e) => e.id === id)?.nome ?? '—'

  return (
    <>
      <Cabecalho
        titulo={L('Apontamentos', 'Issues')}
        sub={L(
          'Pendências do projeto que não nascem de um item de auditoria — interferências, dúvidas, decisões.',
          'Project issues that do not come from an audit item — clashes, questions, decisions.',
        )}
      />

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
        <div style={{ flex: 1 }} />
        <button className="btn pri" onClick={() => setRascunho({ ...VAZIO })}>
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
              <th>{L('Apontamento', 'Issue')}</th>
              <th>{L('Modelo', 'Model')}</th>
              <th>{L('Responsável', 'Responsible')}</th>
              <th style={{ textAlign: 'right' }}>{L('Situação', 'Status')}</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((item) => (
              <tr key={item.id}>
                <td className="code">{item.codigo}</td>
                <td>
                  <b>{item.titulo}</b>
                  {item.descricao && <div className="mmeta">{item.descricao}</div>}
                </td>
                <td className="co">{nomeModelo(item.modelo_id)}</td>
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
