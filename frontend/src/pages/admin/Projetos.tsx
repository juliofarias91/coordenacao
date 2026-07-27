/** SP-101 · Projetos, no nível da organização.
 *
 *  A API de projetos existe desde a Fase 1, mas não havia tela: um projeto
 *  novo só nascia por `scripts/seed.py` ou pelo importador de YAML. Aqui ele
 *  nasce pela plataforma.
 *
 *  A aba `Configuração › Projeto & Cliente` continua existindo e edita o
 *  projeto **corrente**; esta lista é o andar de cima, onde se cria e se vê
 *  todos.
 */
import { useCallback, useEffect, useState } from 'react'

import { Campo, Editor, Erro } from '@/components/ui'
import { useI18n } from '@/i18n'
import { ApiError, api } from '@/lib/api'
import type { Projeto } from '@/lib/types'
import { useProjeto } from '@/projeto/ProjetoContext'

const STATUS = ['config', 'ativo', 'pausado', 'encerrado'] as const

type Rascunho = {
  id?: string
  codigo: string
  nome: string
  cliente: string
  cliente_contato: string
  coordenacao: string
  bep_ref: string
  status: string
}

const VAZIO: Rascunho = {
  codigo: '',
  nome: '',
  cliente: '',
  cliente_contato: '',
  coordenacao: '',
  bep_ref: '',
  status: 'config',
}

export default function AbaProjetos() {
  const { L } = useI18n()
  const { projeto: corrente, selecionar, recarregar } = useProjeto()
  const [projetos, setProjetos] = useState<Projeto[]>([])
  const [rascunho, setRascunho] = useState<Rascunho | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async () => {
    setProjetos((await api.projetos.listar()).itens)
  }, [])

  useEffect(() => {
    carregar().catch((e) => setErro(e instanceof ApiError ? e.message : String(e)))
  }, [carregar])

  async function salvar() {
    if (!rascunho) return
    setErro(null)
    setSalvando(true)
    // Campo de texto vazio é ausência, não string vazia: o backend guarda
    // null e a tela mostra "—".
    const opcional = (v: string) => v.trim() || null
    const base = {
      nome: rascunho.nome.trim(),
      cliente: opcional(rascunho.cliente),
      cliente_contato: opcional(rascunho.cliente_contato),
      coordenacao: opcional(rascunho.coordenacao),
      bep_ref: opcional(rascunho.bep_ref),
      status: rascunho.status,
    }
    try {
      if (rascunho.id) {
        await api.projetos.atualizar(rascunho.id, base)
      } else {
        await api.projetos.criar({ ...base, codigo: rascunho.codigo.trim().toUpperCase() })
      }
      setRascunho(null)
      await carregar()
      // O seletor da barra lateral lê do contexto, não desta lista.
      await recarregar()
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : String(e))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <>
      <div className="acoes">
        <button className="btn pri" onClick={() => setRascunho({ ...VAZIO })}>
          + {L('Novo projeto', 'New project')}
        </button>
      </div>

      {!rascunho && <Erro mensagem={erro} />}

      {rascunho && (
        <Editor
          titulo={rascunho.id ? L('Editar projeto', 'Edit project') : L('Novo projeto', 'New project')}
          onSalvar={salvar}
          onCancelar={() => {
            setRascunho(null)
            setErro(null)
          }}
          salvando={salvando}
          erro={erro}
        >
          <Campo rotulo={L('Código', 'Code')}>
            <input
              className="f code"
              placeholder="CPQ11"
              // O código é a chave do projeto na organização e aparece na
              // nomenclatura de todo arquivo. Trocar depois invalidaria os
              // nomes já entregues.
              disabled={!!rascunho.id}
              value={rascunho.codigo}
              onChange={(e) => setRascunho({ ...rascunho, codigo: e.target.value.toUpperCase() })}
            />
          </Campo>
          <Campo rotulo={L('Nome', 'Name')}>
            <input
              className="f"
              placeholder="CPQ11 — Data Center"
              value={rascunho.nome}
              onChange={(e) => setRascunho({ ...rascunho, nome: e.target.value })}
            />
          </Campo>
          <Campo rotulo={L('Cliente', 'Client')}>
            <input
              className="f"
              value={rascunho.cliente}
              onChange={(e) => setRascunho({ ...rascunho, cliente: e.target.value })}
            />
          </Campo>
          <Campo rotulo={L('Contato do cliente', 'Client contact')}>
            <input
              className="f"
              value={rascunho.cliente_contato}
              onChange={(e) => setRascunho({ ...rascunho, cliente_contato: e.target.value })}
            />
          </Campo>
          <Campo rotulo={L('Coordenação', 'Coordination')}>
            <input
              className="f"
              value={rascunho.coordenacao}
              onChange={(e) => setRascunho({ ...rascunho, coordenacao: e.target.value })}
            />
          </Campo>
          <Campo rotulo={L('Referência do PEB', 'BEP reference')}>
            <input
              className="f"
              placeholder="A5.3.2 · Construction BEP"
              value={rascunho.bep_ref}
              onChange={(e) => setRascunho({ ...rascunho, bep_ref: e.target.value })}
            />
          </Campo>
          <Campo rotulo={L('Situação', 'Status')}>
            <select
              className="f"
              value={rascunho.status}
              onChange={(e) => setRascunho({ ...rascunho, status: e.target.value })}
            >
              {STATUS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Campo>
        </Editor>
      )}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>{L('Projeto', 'Project')}</th>
              <th>{L('Cliente', 'Client')}</th>
              <th>{L('Coordenação', 'Coordination')}</th>
              <th>{L('Situação', 'Status')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {projetos.map((p) => (
              <tr key={p.id}>
                <td>
                  <b className="code">{p.codigo}</b>
                  <div className="mmeta">{p.nome}</div>
                </td>
                <td className="co">{p.cliente ?? '—'}</td>
                <td className="co">{p.coordenacao ?? '—'}</td>
                <td>
                  <span className={`pill${p.status === 'ativo' ? ' ok' : ''}`}>{p.status}</span>
                </td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {corrente?.id !== p.id && (
                    <button
                      className="btn sm"
                      onClick={() => selecionar(p.id)}
                      style={{ marginRight: 6 }}
                    >
                      {L('Abrir', 'Open')}
                    </button>
                  )}
                  <button
                    className="btn sm"
                    onClick={() =>
                      setRascunho({
                        id: p.id,
                        codigo: p.codigo,
                        nome: p.nome,
                        cliente: p.cliente ?? '',
                        cliente_contato: p.cliente_contato ?? '',
                        coordenacao: p.coordenacao ?? '',
                        bep_ref: p.bep_ref ?? '',
                        status: p.status,
                      })
                    }
                  >
                    {L('Editar', 'Edit')}
                  </button>
                </td>
              </tr>
            ))}
            {projetos.length === 0 && (
              <tr>
                <td colSpan={5} className="empty">
                  {L('Nenhum projeto nesta organização.', 'No project in this organization.')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
