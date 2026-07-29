/** Clientes, no nível da organização.
 *
 *  Quem CONTRATA a auditoria. Não confundir com `Configuração › Projetistas`
 *  (empresas): empresa produz o modelo e responde por não-conformidade,
 *  cliente recebe o relatório — lados opostos da mesa.
 *
 *  Cliente virou entidade em 28/07 (migration 0003) e ganhou API no mesmo dia,
 *  mas nascia só de carona: pelo formulário de projeto, no "+ novo cliente…".
 *  Aqui ele nasce sozinho, e é a única tela onde se corrige o nome de um — o
 *  que importa porque o nome do cliente é a PASTA da home.
 */
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { Campo, Editor, Erro, Vazio } from '@/components/ui'
import { useI18n } from '@/i18n'
import { ApiError, api } from '@/lib/api'
import type { ClientePasta } from '@/lib/types'

const STATUS = ['ativo', 'inativo'] as const

type Rascunho = {
  id?: string
  nome: string
  contato: string
  email: string
  status: string
}

const VAZIO: Rascunho = { nome: '', contato: '', email: '', status: 'ativo' }

export default function AbaClientes() {
  const { L } = useI18n()
  // `pastas` e não `listar`: é o mesmo cliente, mas com a contagem de projetos
  // agregada no SQL. Sem ela a tela não consegue dizer o que se perde ao
  // remover um — e é justamente essa a pergunta na hora de remover.
  const [clientes, setClientes] = useState<ClientePasta[]>([])
  const [rascunho, setRascunho] = useState<Rascunho | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [carregando, setCarregando] = useState(true)

  const carregar = useCallback(async () => {
    setClientes(await api.clientes.pastas())
  }, [])

  useEffect(() => {
    carregar()
      .catch((e) => setErro(e instanceof ApiError ? e.message : String(e)))
      .finally(() => setCarregando(false))
  }, [carregar])

  async function salvar() {
    if (!rascunho) return
    setErro(null)
    setSalvando(true)
    // Campo de texto vazio é ausência, não string vazia: o backend guarda null
    // e a tela mostra "—".
    const opcional = (v: string) => v.trim() || null
    const corpo = {
      nome: rascunho.nome.trim(),
      contato: opcional(rascunho.contato),
      email: opcional(rascunho.email),
      status: rascunho.status,
    }
    try {
      if (rascunho.id) await api.clientes.atualizar(rascunho.id, corpo)
      else await api.clientes.criar(corpo)
      setRascunho(null)
      await carregar()
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : String(e))
    } finally {
      setSalvando(false)
    }
  }

  async function remover(c: ClientePasta) {
    // O aviso diz o NÚMERO de projetos que ficam órfãos, não um genérico
    // "tem certeza?". Remover um cliente com 12 projetos e um com nenhum são
    // decisões diferentes, e só a tela sabe qual é qual.
    const aviso = c.projetos
      ? L(
          `Remover ${c.nome}? Os ${c.projetos} projetos dele NÃO são apagados — ficam sem cliente, agrupados em "Sem cliente" na home.`,
          `Remove ${c.nome}? Its ${c.projetos} projects are NOT deleted — they end up with no client, grouped under "No client" on the home page.`,
        )
      : L(`Remover ${c.nome}?`, `Remove ${c.nome}?`)
    if (!confirm(aviso)) return
    setErro(null)
    try {
      await api.clientes.remover(c.id)
      await carregar()
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : String(e))
    }
  }

  if (carregando) return <p className="hint">{L('Carregando…', 'Loading…')}</p>

  return (
    <>
      <div className="acoes">
        <button className="btn pri" onClick={() => setRascunho({ ...VAZIO })}>
          + {L('Novo cliente', 'New client')}
        </button>
      </div>

      {!rascunho && <Erro mensagem={erro} />}

      {rascunho && (
        <Editor
          titulo={
            rascunho.id ? L('Editar cliente', 'Edit client') : L('Novo cliente', 'New client')
          }
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
              autoFocus
              placeholder="Microsoft"
              value={rascunho.nome}
              onChange={(e) => setRascunho({ ...rascunho, nome: e.target.value })}
            />
          </Campo>
          <Campo rotulo={L('Contato', 'Contact')}>
            <input
              className="f"
              placeholder={L('Nome de quem responde', 'Who to talk to')}
              value={rascunho.contato}
              onChange={(e) => setRascunho({ ...rascunho, contato: e.target.value })}
            />
          </Campo>
          <Campo rotulo={L('E-mail', 'Email')}>
            <input
              className="f"
              type="email"
              placeholder="coordenacao@cliente.com"
              value={rascunho.email}
              onChange={(e) => setRascunho({ ...rascunho, email: e.target.value })}
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

      {clientes.length === 0 ? (
        <Vazio
          titulo={L('Nenhum cliente', 'No clients')}
          texto={L(
            'Cadastre o primeiro cliente aqui. É ele que vira a pasta dos projetos na tela inicial.',
            'Register the first client here. It becomes the project folder on the home screen.',
          )}
        />
      ) : (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>{L('Cliente', 'Client')}</th>
                <th>{L('Contato', 'Contact')}</th>
                <th>{L('Projetos', 'Projects')}</th>
                <th>{L('Situação', 'Status')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {clientes.map((c) => (
                <tr key={c.id}>
                  <td>
                    <b>{c.nome}</b>
                    {c.email && <div className="mmeta">{c.email}</div>}
                  </td>
                  <td className="co">{c.contato ?? '—'}</td>
                  <td className="co">{c.projetos}</td>
                  <td>
                    <span className={`pill${c.status === 'ativo' ? ' ok' : ''}`}>{c.status}</span>
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {/* A pasta do cliente é a home, e é lá que se vê os
                        projetos dele — não vale duplicar a listagem aqui. */}
                    <Link className="btn sm" to="/" style={{ marginRight: 6 }}>
                      {L('Ver projetos', 'See projects')}
                    </Link>
                    <button
                      className="btn sm"
                      style={{ marginRight: 6 }}
                      onClick={() =>
                        setRascunho({
                          id: c.id,
                          nome: c.nome,
                          contato: c.contato ?? '',
                          email: c.email ?? '',
                          status: c.status,
                        })
                      }
                    >
                      {L('Editar', 'Edit')}
                    </button>
                    {/* Destrutivo: é o único lugar da linha que leva cor. */}
                    <button className="btn sm danger" onClick={() => remover(c)}>
                      {L('Remover', 'Remove')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
