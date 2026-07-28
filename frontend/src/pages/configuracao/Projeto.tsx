/** SP-101 · Projeto & Cliente. */
import { useEffect, useState } from 'react'

import { Campo, Erro } from '@/components/ui'
import { useI18n } from '@/i18n'
import { api, ApiError } from '@/lib/api'
import type { Cliente } from '@/lib/types'
import { useProjeto } from '@/projeto/ProjetoContext'

export default function AbaProjeto() {
  const { projeto, recarregar } = useProjeto()
  const { L } = useI18n()
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [form, setForm] = useState({
    nome: '',
    // Id, não texto: o cliente virou entidade na migration 0003. O contato
    // mudou de lugar junto — é atributo do cliente, e editá-lo aqui gravaria
    // uma cópia por projeto.
    cliente_id: '',
    coordenacao: '',
    bep_ref: '',
    status: 'config',
  })
  const [erro, setErro] = useState<string | null>(null)
  const [salvo, setSalvo] = useState(false)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    api.clientes
      .listar()
      .then((r) => setClientes(r.itens))
      .catch(() => setClientes([]))
  }, [])

  useEffect(() => {
    if (!projeto) return
    setForm({
      nome: projeto.nome,
      cliente_id: projeto.cliente_id ?? '',
      coordenacao: projeto.coordenacao ?? '',
      bep_ref: projeto.bep_ref ?? '',
      status: projeto.status,
    })
  }, [projeto])

  if (!projeto) return null

  async function salvar() {
    if (!projeto) return
    setErro(null)
    setSalvo(false)
    setSalvando(true)
    try {
      // "sem cliente" é o valor '' do <select>, e a API espera UUID ou null —
      // mandar string vazia volta 422.
      await api.projetos.atualizar(projeto.id, {
        ...form,
        cliente_id: form.cliente_id || null,
      })
      await recarregar()
      setSalvo(true)
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : String(e))
    } finally {
      setSalvando(false)
    }
  }

  const campo = (k: keyof typeof form) => ({
    className: 'f',
    value: form[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm({ ...form, [k]: e.target.value }),
  })

  return (
    <div className="editor">
      <h3>
        {L('Dados do projeto', 'Project data')} · <span className="code">{projeto.codigo}</span>
      </h3>
      <Erro mensagem={erro} />
      {salvo && (
        <div className="pill ok" style={{ marginBottom: 12 }}>
          {L('Alterações salvas', 'Changes saved')}
        </div>
      )}

      <div className="frow">
        <Campo rotulo={L('Nome do projeto', 'Project name')}>
          <input {...campo('nome')} />
        </Campo>
        <Campo rotulo={L('Situação', 'Status')}>
          <select {...campo('status')}>
            <option value="config">{L('Em configuração', 'Setting up')}</option>
            <option value="ativo">{L('Ativo', 'Active')}</option>
            <option value="piloto">{L('Piloto', 'Pilot')}</option>
            <option value="encerrado">{L('Encerrado', 'Closed')}</option>
          </select>
        </Campo>
        <Campo rotulo={L('Cliente', 'Client')}>
          <select {...campo('cliente_id')}>
            <option value="">{L('— sem cliente —', '— no client —')}</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo={L('Coordenação', 'Coordination')}>
          <input {...campo('coordenacao')} />
        </Campo>
        <Campo rotulo={L('PEB de referência', 'Reference BEP')}>
          <input {...campo('bep_ref')} placeholder="A5.3.2 · Construction BEP" />
        </Campo>
      </div>

      <div className="eact">
        <button className="btn pri" onClick={salvar} disabled={salvando}>
          {salvando ? L('Salvando…', 'Saving…') : L('Salvar', 'Save')}
        </button>
      </div>

      <p className="hint">
        {L(
          'O código do projeto é imutável: ele é o primeiro segmento da nomenclatura de todos os arquivos.',
          'The project code is immutable: it is the first segment of every file name.',
        )}
      </p>
    </div>
  )
}
