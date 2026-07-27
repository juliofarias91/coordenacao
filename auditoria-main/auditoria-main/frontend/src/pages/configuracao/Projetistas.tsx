/** SP-102 · Projetistas: empresas, papéis, subcontratação e contatos. */
import { useCallback, useEffect, useState } from 'react'

import { Campo, Chips, Editor, Erro } from '@/components/ui'
import { useI18n } from '@/i18n'
import { ApiError, api } from '@/lib/api'
import type { Empresa, EmpresaDetalhe, EmpresaPapel } from '@/lib/types'

const PAPEIS: Array<[EmpresaPapel, string, string]> = [
  ['trade', 'Instaladora', 'Installer'],
  ['bim', 'Modeladora', 'Modeler'],
  ['fornecedor', 'Fornecedor', 'Supplier'],
  ['coordenacao', 'Coordenação', 'Coordination'],
]

type Rascunho = {
  id?: string
  nome: string
  cnpj: string
  tipo: 'propria' | 'terceirizada'
  contratada_por: string
  papeis: EmpresaPapel[]
  ferramenta: string
  departamento: string
  disciplinas: string
}

const VAZIO: Rascunho = {
  nome: '',
  cnpj: '',
  tipo: 'terceirizada',
  contratada_por: '',
  papeis: [],
  ferramenta: '',
  departamento: '',
  disciplinas: '',
}

export default function AbaProjetistas() {
  const { L } = useI18n()
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [rascunho, setRascunho] = useState<Rascunho | null>(null)
  const [detalhe, setDetalhe] = useState<EmpresaDetalhe | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async () => {
    try {
      setEmpresas((await api.empresas.listar()).itens)
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  async function salvar() {
    if (!rascunho) return
    setErro(null)
    setSalvando(true)
    const corpo = { ...rascunho, contratada_por: rascunho.contratada_por || null }
    delete (corpo as { id?: string }).id
    try {
      if (rascunho.id) await api.empresas.atualizar(rascunho.id, corpo)
      else await api.empresas.criar(corpo)
      setRascunho(null)
      await carregar()
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : String(e))
    } finally {
      setSalvando(false)
    }
  }

  function editar(e: Empresa) {
    setDetalhe(null)
    setRascunho({
      id: e.id,
      nome: e.nome,
      cnpj: e.cnpj ?? '',
      tipo: e.tipo,
      contratada_por: e.contratada_por ?? '',
      papeis: e.papeis,
      ferramenta: e.ferramenta ?? '',
      departamento: e.departamento ?? '',
      disciplinas: e.disciplinas ?? '',
    })
  }

  const nomeDe = (id: string | null) => empresas.find((e) => e.id === id)?.nome ?? '—'

  return (
    <>
      <div className="acoes">
        <button className="btn pri" onClick={() => setRascunho({ ...VAZIO })}>
          + {L('Nova empresa', 'New company')}
        </button>
      </div>

      {!rascunho && <Erro mensagem={erro} />}

      {rascunho && (
        <Editor
          titulo={rascunho.id ? L('Editar empresa', 'Edit company') : L('Nova empresa', 'New company')}
          onSalvar={salvar}
          onCancelar={() => {
            setRascunho(null)
            setErro(null)
          }}
          salvando={salvando}
          erro={erro}
        >
          <Campo rotulo={L('Nome', 'Name')}>
            <input
              className="f"
              value={rascunho.nome}
              onChange={(e) => setRascunho({ ...rascunho, nome: e.target.value })}
            />
          </Campo>
          <Campo rotulo="CNPJ">
            <input
              className="f"
              value={rascunho.cnpj}
              onChange={(e) => setRascunho({ ...rascunho, cnpj: e.target.value })}
            />
          </Campo>
          <Campo rotulo={L('Vínculo', 'Type')}>
            <select
              className="f"
              value={rascunho.tipo}
              onChange={(e) =>
                setRascunho({ ...rascunho, tipo: e.target.value as Rascunho['tipo'] })
              }
            >
              <option value="propria">{L('Própria', 'In-house')}</option>
              <option value="terceirizada">{L('Terceirizada', 'Outsourced')}</option>
            </select>
          </Campo>
          <Campo rotulo={L('Contratada por', 'Contracted by')}>
            <select
              className="f"
              value={rascunho.contratada_por}
              onChange={(e) => setRascunho({ ...rascunho, contratada_por: e.target.value })}
            >
              <option value="">{L('— nenhuma —', '— none —')}</option>
              {empresas
                .filter((e) => e.id !== rascunho.id)
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nome}
                  </option>
                ))}
            </select>
          </Campo>
          <Campo rotulo={L('Ferramenta', 'Tool')}>
            <input
              className="f"
              placeholder="Revit / Tekla"
              value={rascunho.ferramenta}
              onChange={(e) => setRascunho({ ...rascunho, ferramenta: e.target.value })}
            />
          </Campo>
          <Campo rotulo={L('Departamento', 'Department')}>
            <input
              className="f"
              value={rascunho.departamento}
              onChange={(e) => setRascunho({ ...rascunho, departamento: e.target.value })}
            />
          </Campo>
          <Campo rotulo={L('Papéis', 'Roles')} largo>
            <Chips
              opcoes={PAPEIS.map(([v, pt, en]) => [v, L(pt, en)] as [EmpresaPapel, string])}
              valor={rascunho.papeis}
              onChange={(papeis) => setRascunho({ ...rascunho, papeis })}
            />
          </Campo>
        </Editor>
      )}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>{L('Empresa', 'Company')}</th>
              <th>{L('Papéis', 'Roles')}</th>
              <th>{L('Contratada por', 'Contracted by')}</th>
              <th>{L('Ferramenta', 'Tool')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {empresas.map((e) => (
              <tr key={e.id}>
                <td>
                  <div className="code">{e.nome}</div>
                  <div className="mmeta">
                    {e.tipo === 'propria' ? L('própria', 'in-house') : L('terceirizada', 'outsourced')}
                    {e.penalidades > 0 && ` · ${e.penalidades} ${L('penalidade(s)', 'penalty(ies)')}`}
                  </div>
                </td>
                <td className="co">
                  {e.papeis
                    .map((p) => {
                      const achado = PAPEIS.find(([v]) => v === p)
                      return achado ? L(achado[1], achado[2]) : p
                    })
                    .join(' · ') || '—'}
                </td>
                <td className="co">{nomeDe(e.contratada_por)}</td>
                <td className="co">{e.ferramenta ?? '—'}</td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <button
                    className="btn sm"
                    onClick={async () => setDetalhe(await api.empresas.obter(e.id))}
                  >
                    {L('Contatos', 'Contacts')}
                  </button>{' '}
                  <button className="btn sm" onClick={() => editar(e)}>
                    {L('Editar', 'Edit')}
                  </button>
                </td>
              </tr>
            ))}
            {empresas.length === 0 && (
              <tr>
                <td colSpan={5} className="empty">
                  {L('Nenhuma empresa cadastrada.', 'No companies yet.')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {detalhe && <Contatos empresa={detalhe} onFechar={() => setDetalhe(null)} />}
    </>
  )
}

function Contatos({ empresa, onFechar }: { empresa: EmpresaDetalhe; onFechar: () => void }) {
  const { L } = useI18n()
  const [contatos, setContatos] = useState(empresa.contatos)
  const [novo, setNovo] = useState({ nome: '', cargo: '', email: '', telefone: '', disciplina: '' })
  const [erro, setErro] = useState<string | null>(null)

  async function adicionar() {
    setErro(null)
    try {
      const corpo = Object.fromEntries(
        Object.entries(novo).map(([k, v]) => [k, v.trim() || null]),
      )
      const criado = await api.empresas.criarContato(empresa.id, corpo)
      setContatos([...contatos, criado])
      setNovo({ nome: '', cargo: '', email: '', telefone: '', disciplina: '' })
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : String(e))
    }
  }

  async function remover(id: string) {
    await api.empresas.removerContato(empresa.id, id)
    setContatos(contatos.filter((c) => c.id !== id))
  }

  return (
    <div className="editor" style={{ marginTop: 16 }}>
      <h3>
        {L('Contatos', 'Contacts')} · {empresa.nome}
      </h3>
      <Erro mensagem={erro} />

      <div className="card" style={{ marginBottom: 14 }}>
        <table>
          <tbody>
            {contatos.map((c) => (
              <tr key={c.id}>
                <td>
                  <b>{c.nome ?? '—'}</b>
                  <div className="mmeta">
                    {[c.cargo, c.email, c.telefone, c.disciplina].filter(Boolean).join(' · ')}
                  </div>
                </td>
                <td style={{ textAlign: 'right' }}>
                  <button className="btn sm danger" onClick={() => remover(c.id)}>
                    {L('Remover', 'Remove')}
                  </button>
                </td>
              </tr>
            ))}
            {contatos.length === 0 && (
              <tr>
                <td className="empty">{L('Nenhum contato.', 'No contacts.')}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="frow">
        {(['nome', 'cargo', 'email', 'telefone', 'disciplina'] as const).map((k) => (
          <Campo key={k} rotulo={k}>
            <input
              className="f"
              value={novo[k]}
              onChange={(e) => setNovo({ ...novo, [k]: e.target.value })}
            />
          </Campo>
        ))}
      </div>
      <div className="eact">
        <button className="btn pri" onClick={adicionar}>
          {L('Adicionar contato', 'Add contact')}
        </button>
        <button className="btn" onClick={onFechar}>
          {L('Fechar', 'Close')}
        </button>
      </div>
    </div>
  )
}
