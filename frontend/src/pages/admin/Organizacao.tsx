/** SP-106 · A organização.
 *
 *  Até aqui o tenant só nascia pelo `scripts/seed.py` e não tinha como ser
 *  visto nem renomeado pela plataforma.
 */
import { useCallback, useEffect, useState } from 'react'

import { Campo, Erro } from '@/components/ui'
import { useI18n } from '@/i18n'
import { ApiError, api } from '@/lib/api'
import type { ResumoOrganizacao } from '@/lib/types'

function Numero({ valor, rotulo }: { valor: number; rotulo: string }) {
  return (
    <div className="card" style={{ padding: '14px 16px', flex: '1 1 140px' }}>
      <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.1 }}>{valor}</div>
      <div className="co" style={{ fontSize: 12 }}>
        {rotulo}
      </div>
    </div>
  )
}

export default function AbaOrganizacao() {
  const { L } = useI18n()
  const [resumo, setResumo] = useState<ResumoOrganizacao | null>(null)
  const [nome, setNome] = useState('')
  const [slug, setSlug] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvo, setSalvo] = useState(false)
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async () => {
    try {
      const r = await api.organizacao.resumo()
      setResumo(r)
      setNome(r.organizacao.nome)
      setSlug(r.organizacao.slug ?? '')
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  async function salvar() {
    setErro(null)
    setSalvo(false)
    setSalvando(true)
    try {
      await api.organizacao.atualizar({ nome, slug: slug || undefined })
      setSalvo(true)
      await carregar()
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : String(e))
    } finally {
      setSalvando(false)
    }
  }

  if (!resumo) return <Erro mensagem={erro} />

  return (
    <>
      <div className="filters" style={{ gap: 10, marginBottom: 14 }}>
        <Numero valor={resumo.projetos} rotulo={L('Projetos', 'Projects')} />
        {/* Clientes e Empresas são números separados porque são lados opostos
            da mesa: empresa produz o modelo e responde por não-conformidade,
            cliente recebe o relatório. */}
        <Numero valor={resumo.clientes} rotulo={L('Clientes', 'Clients')} />
        <Numero
          valor={resumo.usuarios_ativos}
          rotulo={L('Usuários ativos', 'Active users')}
        />
        <Numero valor={resumo.usuarios} rotulo={L('Usuários no total', 'Users in total')} />
        <Numero valor={resumo.empresas} rotulo={L('Empresas', 'Companies')} />
      </div>

      <div className="editor">
        <h3>{L('Dados da organização', 'Organization data')}</h3>
        <Erro mensagem={erro} />
        {salvo && (
          <div className="pill ok" style={{ marginBottom: 12 }}>
            {L('Salvo', 'Saved')}
          </div>
        )}

        <div className="frow">
          <Campo rotulo={L('Nome', 'Name')}>
            <input className="f" value={nome} onChange={(e) => setNome(e.target.value)} />
          </Campo>
          <Campo rotulo={L('Slug', 'Slug')}>
            <input
              className="f code"
              placeholder="spbim"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
            />
          </Campo>
        </div>

        <p className="hint">
          {L(
            'O slug é único na plataforma inteira: é ele que identifica a organização no login antes de existir token.',
            'The slug is unique across the whole platform: it identifies the organization at sign-in, before a token exists.',
          )}
        </p>

        {/* NÃO HÁ INTERRUPTOR DE CADASTRO AQUI (06/08/2026, a pedido). Ele
            existiu entre as migrations 0016 e 0017 e saiu: criar conta não tem
            trava. Quem controla o acesso de verdade é o VÍNCULO DE PROJETO, em
            `/projetos/:id/membros` — uma conta recém-criada não alcança modelo,
            auditoria nem relatório enquanto ninguém a vincular. */}
        <p className="hint">
          {L(
            'Qualquer pessoa pode criar a própria conta nesta plataforma. Ela nasce como LEITOR e sem projeto nenhum — quem libera o acesso a um projeto é quem o coordena, na aba Membros do projeto.',
            'Anyone can create their own account on this platform. The account starts as READER with no projects at all — access to a project is granted by whoever coordinates it, on the project’s Members tab.',
          )}
        </p>

        <div className="eact">
          <button className="btn pri" onClick={salvar} disabled={salvando || !nome.trim()}>
            {salvando ? L('Salvando…', 'Saving…') : L('Salvar', 'Save')}
          </button>
        </div>
      </div>

      <div className="editor">
        <h3>{L('Onde os usuários vivem', 'Where the users live')}</h3>
        <p className="hint" style={{ margin: 0 }}>
          {L(
            'Os usuários ficam na tabela `usuario` do banco da plataforma — com papel, permissões, empresa e organização. Migrar o banco para o Supabase não muda nada disto: o Supabase é Postgres, e o isolamento por organização é row-level security do próprio Postgres. O que o Supabase acrescenta é banco gerenciado, storage S3 e, se ligado, login por OIDC. A autorização continua na API, porque ela depende de papel e permissão, que não vivem numa tabela de identidade.',
            'Users live in the platform `usuario` table — with role, permissions, company and organization. Moving the database to Supabase changes none of this: Supabase is Postgres, and per-organization isolation is Postgres row-level security. What Supabase adds is a managed database, S3 storage and, if enabled, OIDC sign-in. Authorization stays in the API, because it depends on role and permission, which do not live in an identity table.',
          )}
        </p>
      </div>
    </>
  )
}
