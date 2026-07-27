/** SP-103 · Usuários & acessos. */
import { useCallback, useEffect, useState } from 'react'

import { Campo, Chips, Editor, Erro } from '@/components/ui'
import { useI18n } from '@/i18n'
import { ApiError, api } from '@/lib/api'
import type { Empresa, Permissao, UsuarioCadastro } from '@/lib/types'

const PAPEIS = [
  'admin',
  'coordenador',
  'auditor',
  'revisor',
  'fornecedor',
  'leitor',
  'cliente',
] as const

const ROTULO_PERMISSAO: Record<string, [string, string]> = {
  ver_painel: ['Ver painel', 'View panel'],
  executar: ['Executar auditoria', 'Run audit'],
  editar_biblioteca: ['Editar biblioteca', 'Edit library'],
  publicar: ['Publicar round', 'Publish round'],
  gerar_relatorio: ['Gerar relatório', 'Generate report'],
  ver_relatorios: ['Ver relatórios', 'View reports'],
  admin_cadastro: ['Administrar cadastros', 'Manage records'],
}

type Rascunho = {
  id?: string
  login: string
  nome: string
  senha: string
  papel: (typeof PAPEIS)[number]
  empresa_id: string
  permissoes: string[]
  status: 'ativo' | 'inativo'
}

const VAZIO: Rascunho = {
  login: '',
  nome: '',
  senha: '',
  papel: 'leitor',
  empresa_id: '',
  permissoes: [],
  status: 'ativo',
}

export default function AbaUsuarios() {
  const { L } = useI18n()
  const [usuarios, setUsuarios] = useState<UsuarioCadastro[]>([])
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [permissoes, setPermissoes] = useState<Permissao[]>([])
  const [rascunho, setRascunho] = useState<Rascunho | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async () => {
    const [u, e, p] = await Promise.all([
      api.usuarios.listar(),
      api.empresas.listar(),
      api.usuarios.permissoes(),
    ])
    setUsuarios(u.itens)
    setEmpresas(e.itens)
    setPermissoes(p)
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  async function salvar() {
    if (!rascunho) return
    setErro(null)
    setSalvando(true)
    const base = {
      nome: rascunho.nome || null,
      papel: rascunho.papel,
      empresa_id: rascunho.empresa_id || null,
      permissoes: rascunho.permissoes,
      status: rascunho.status,
    }
    try {
      if (rascunho.id) {
        await api.usuarios.atualizar(rascunho.id, base)
        if (rascunho.senha) await api.usuarios.definirSenha(rascunho.id, rascunho.senha)
      } else {
        await api.usuarios.criar({
          ...base,
          login: rascunho.login,
          // Sem senha = usuário que só entra por SSO.
          senha: rascunho.senha || null,
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

  const nomeEmpresa = (id: string | null) => empresas.find((e) => e.id === id)?.nome ?? '—'

  return (
    <>
      <div className="acoes">
        <button className="btn pri" onClick={() => setRascunho({ ...VAZIO })}>
          + {L('Novo usuário', 'New user')}
        </button>
      </div>

      {!rascunho && <Erro mensagem={erro} />}

      {rascunho && (
        <Editor
          titulo={rascunho.id ? L('Editar usuário', 'Edit user') : L('Novo usuário', 'New user')}
          onSalvar={salvar}
          onCancelar={() => {
            setRascunho(null)
            setErro(null)
          }}
          salvando={salvando}
          erro={erro}
        >
          <Campo rotulo={L('E-mail (login)', 'E-mail (login)')}>
            <input
              className="f"
              type="email"
              disabled={!!rascunho.id}
              value={rascunho.login}
              onChange={(e) => setRascunho({ ...rascunho, login: e.target.value })}
            />
          </Campo>
          <Campo rotulo={L('Nome', 'Name')}>
            <input
              className="f"
              value={rascunho.nome}
              onChange={(e) => setRascunho({ ...rascunho, nome: e.target.value })}
            />
          </Campo>
          <Campo rotulo={L('Papel', 'Role')}>
            <select
              className="f"
              value={rascunho.papel}
              onChange={(e) =>
                setRascunho({ ...rascunho, papel: e.target.value as Rascunho['papel'] })
              }
            >
              {PAPEIS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo={L('Empresa', 'Company')}>
            <select
              className="f"
              value={rascunho.empresa_id}
              onChange={(e) => setRascunho({ ...rascunho, empresa_id: e.target.value })}
            >
              <option value="">{L('— nenhuma —', '— none —')}</option>
              {empresas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </select>
          </Campo>
          <Campo
            rotulo={
              rascunho.id
                ? L('Nova senha (deixe vazio para manter)', 'New password (blank keeps it)')
                : L('Senha (vazio = só SSO)', 'Password (blank = SSO only)')
            }
          >
            <input
              className="f"
              type="password"
              autoComplete="new-password"
              value={rascunho.senha}
              onChange={(e) => setRascunho({ ...rascunho, senha: e.target.value })}
            />
          </Campo>
          <Campo rotulo={L('Situação', 'Status')}>
            <select
              className="f"
              value={rascunho.status}
              onChange={(e) =>
                setRascunho({ ...rascunho, status: e.target.value as Rascunho['status'] })
              }
            >
              <option value="ativo">{L('Ativo', 'Active')}</option>
              <option value="inativo">{L('Inativo', 'Inactive')}</option>
            </select>
          </Campo>
          <Campo rotulo={L('Permissões (vazio = padrão do papel)', 'Permissions (blank = role default)')} largo>
            <Chips
              opcoes={permissoes.map((p) => {
                const r = ROTULO_PERMISSAO[p.codigo]
                return [p.codigo, r ? L(r[0], r[1]) : p.codigo] as [string, string]
              })}
              valor={rascunho.permissoes}
              onChange={(permissoes) => setRascunho({ ...rascunho, permissoes })}
            />
          </Campo>
        </Editor>
      )}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>{L('Usuário', 'User')}</th>
              <th>{L('Papel', 'Role')}</th>
              <th>{L('Empresa', 'Company')}</th>
              <th>{L('Situação', 'Status')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <tr key={u.id}>
                <td>
                  <b>{u.nome ?? u.login}</b>
                  <div className="mmeta">{u.login}</div>
                </td>
                <td className="co">{u.papel}</td>
                <td className="co">{nomeEmpresa(u.empresa_id)}</td>
                <td>
                  <span className={`pill${u.status === 'ativo' ? ' ok' : ''}`}>
                    {u.status === 'ativo' ? L('ativo', 'active') : L('inativo', 'inactive')}
                  </span>
                </td>
                <td style={{ textAlign: 'right' }}>
                  <button
                    className="btn sm"
                    onClick={() =>
                      setRascunho({
                        id: u.id,
                        login: u.login,
                        nome: u.nome ?? '',
                        senha: '',
                        papel: u.papel as Rascunho['papel'],
                        empresa_id: u.empresa_id ?? '',
                        permissoes: u.permissoes,
                        status: u.status as Rascunho['status'],
                      })
                    }
                  >
                    {L('Editar', 'Edit')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
