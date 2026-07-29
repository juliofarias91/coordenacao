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
import { Link } from 'react-router-dom'

import { Campo, Editor, Erro } from '@/components/ui'
import { useI18n } from '@/i18n'
import { ApiError, api } from '@/lib/api'
import type { Cliente, Projeto } from '@/lib/types'
import { rotaProjeto, useProjeto } from '@/projeto/ProjetoContext'

const STATUS = ['config', 'ativo', 'pausado', 'encerrado'] as const

/** Valor do seletor que abre o campo de cliente novo. Não é um id, então nunca
 *  colide com um cliente de verdade. */
const NOVO_CLIENTE = '__novo__'

type Rascunho = {
  id?: string
  codigo: string
  nome: string
  /** Id do cliente, '' para nenhum, ou NOVO_CLIENTE enquanto se digita um novo.
   *  Deixou de ser texto livre na migration 0003 — ver `docs/SUPABASE.md`. */
  cliente_id: string
  /** Só usado quando `cliente_id === NOVO_CLIENTE`: o nome a cadastrar. */
  cliente_novo: string
  coordenacao: string
  bep_ref: string
  status: string
}

const VAZIO: Rascunho = {
  codigo: '',
  nome: '',
  cliente_id: '',
  cliente_novo: '',
  coordenacao: '',
  bep_ref: '',
  status: 'config',
}

export default function AbaProjetos() {
  const { L } = useI18n()
  const { recarregar } = useProjeto()
  const [projetos, setProjetos] = useState<Projeto[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [rascunho, setRascunho] = useState<Rascunho | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async () => {
    const [ps, cs] = await Promise.all([api.projetos.listar(), api.clientes.listar()])
    setProjetos(ps.itens)
    setClientes(cs.itens)
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
    try {
      // Cliente novo digitado no formulário: cadastra antes, para o projeto já
      // nascer apontando para ele. Se falhar (nome repetido, por exemplo), o
      // projeto não é criado e a mensagem explica o porquê — melhor do que
      // gravar o projeto sem cliente e deixar a correção para depois.
      let clienteId: string | null = rascunho.cliente_id || null
      if (rascunho.cliente_id === NOVO_CLIENTE) {
        const nome = rascunho.cliente_novo.trim()
        clienteId = nome ? (await api.clientes.criar({ nome })).id : null
      }

      const base = {
        nome: rascunho.nome.trim(),
        cliente_id: clienteId,
        coordenacao: opcional(rascunho.coordenacao),
        bep_ref: opcional(rascunho.bep_ref),
        status: rascunho.status,
      }
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
          {/* Seletor, e não campo livre: é o que impede 'Microsoft' e
              'microsoft' de virarem dois clientes — e duas pastas na home. */}
          <Campo rotulo={L('Cliente', 'Client')}>
            <select
              className="f"
              value={rascunho.cliente_id}
              onChange={(e) => setRascunho({ ...rascunho, cliente_id: e.target.value })}
            >
              <option value="">{L('— sem cliente —', '— no client —')}</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
              <option value={NOVO_CLIENTE}>{L('+ novo cliente…', '+ new client…')}</option>
            </select>
          </Campo>
          {rascunho.cliente_id === NOVO_CLIENTE && (
            <Campo rotulo={L('Nome do novo cliente', 'New client name')}>
              <input
                className="f"
                autoFocus
                placeholder="Microsoft"
                value={rascunho.cliente_novo}
                onChange={(e) => setRascunho({ ...rascunho, cliente_novo: e.target.value })}
              />
            </Campo>
          )}
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
                <td className="co">{p.cliente_nome ?? '—'}</td>
                <td className="co">{p.coordenacao ?? '—'}</td>
                <td>
                  <span className={`pill${p.status === 'ativo' ? ' ok' : ''}`}>{p.status}</span>
                </td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {/* "Abrir" agora é um link de verdade: dá para copiar o
                      endereço, abrir noutra aba, mandar a um colega. Antes
                      trocava o projeto guardado e a administração continuava
                      na tela — o efeito só aparecia no menu. */}
                  <Link className="btn sm" to={rotaProjeto(p.id)} style={{ marginRight: 6 }}>
                    {L('Abrir', 'Open')}
                  </Link>
                  <button
                    className="btn sm"
                    onClick={() =>
                      setRascunho({
                        id: p.id,
                        codigo: p.codigo,
                        nome: p.nome,
                        cliente_id: p.cliente_id ?? '',
                        cliente_novo: '',
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
