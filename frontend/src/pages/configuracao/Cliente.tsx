/** SP-405 · Convite do cliente, com visibilidade por campo.
 *
 *  A tela mostra exatamente o que o cliente vai ver: cada chave ligada aqui é
 *  uma seção ou coluna que sai na resposta do portal, e nada além disso.
 */
import { useCallback, useEffect, useState } from 'react'

import { Campo, Erro } from '@/components/ui'
import { useI18n } from '@/i18n'
import { ApiError, api } from '@/lib/api'
import type { Convite } from '@/lib/types'
import { useProjeto } from '@/projeto/ProjetoContext'

const SECOES: Array<[string, string, string]> = [
  ['painel', 'Painel de modelos', 'Model panel'],
  ['matriz', 'Matriz por área', 'Matrix by area'],
  ['avanco', 'Avanço e indicadores', 'Progress and indicators'],
  ['relatorio', 'Não-conformidades', 'Non-conformities'],
]

const COLUNAS: Array<[string, string, string]> = [
  ['code', 'Código do modelo', 'Model code'],
  ['disc', 'Disciplina', 'Discipline'],
  ['co', 'Projetista', 'Designer'],
  ['ver', 'Versão', 'Version'],
  ['appr', 'Aprovação', 'Approval'],
  ['status', 'Situação', 'Status'],
]

export default function AbaCliente() {
  const { projeto } = useProjeto()
  const { L } = useI18n()
  const [convites, setConvites] = useState<Convite[]>([])
  const [novo, setNovo] = useState({ cliente_nome: '', cliente_email: '' })
  const [erro, setErro] = useState<string | null>(null)
  const [copiado, setCopiado] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    if (!projeto) return
    try {
      setConvites(await api.convites.listar(projeto.id))
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : String(e))
    }
  }, [projeto])

  useEffect(() => {
    carregar()
  }, [carregar])

  if (!projeto) return null

  async function criar() {
    if (!projeto) return
    setErro(null)
    try {
      await api.convites.criar(projeto.id, {
        cliente_nome: novo.cliente_nome || null,
        cliente_email: novo.cliente_email || null,
      })
      setNovo({ cliente_nome: '', cliente_email: '' })
      await carregar()
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : String(e))
    }
  }

  async function alternar(convite: Convite, grupo: 'secoes' | 'colunas', chave: string) {
    setErro(null)
    const atual = convite[grupo] ?? {}
    try {
      await api.convites.atualizar(convite.id, { [grupo]: { [chave]: !atual[chave] } })
      await carregar()
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : String(e))
    }
  }

  async function revogar(convite: Convite) {
    await api.convites.revogar(convite.id)
    await carregar()
  }

  function copiar(token: string) {
    const url = `${window.location.origin}/portal/${token}`
    navigator.clipboard?.writeText(url)
    setCopiado(token)
    setTimeout(() => setCopiado(null), 2000)
  }

  return (
    <>
      <Erro mensagem={erro} />

      {convites.map((convite) => (
        <div className="editor" key={convite.id}>
          <h3>
            {convite.cliente_nome || L('Convite sem nome', 'Unnamed invite')}{' '}
            {!convite.ativo && <span className="pill ruim">{L('revogado', 'revoked')}</span>}
          </h3>

          <div className="frow">
            <Campo rotulo={L('Link do portal', 'Portal link')} largo>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="f code"
                  readOnly
                  value={`${window.location.origin}/portal/${convite.token}`}
                />
                <button className="btn" onClick={() => copiar(convite.token)}>
                  {copiado === convite.token ? L('copiado ✓', 'copied ✓') : L('Copiar', 'Copy')}
                </button>
              </div>
            </Campo>
          </div>

          <div className="exlabel">{L('Seções liberadas', 'Enabled sections')}</div>
          <div className="filters" style={{ marginBottom: 12 }}>
            {SECOES.map(([chave, pt, en]) => (
              <button
                key={chave}
                type="button"
                className={`chip${convite.secoes?.[chave] ? ' on' : ''}`}
                onClick={() => alternar(convite, 'secoes', chave)}
                disabled={!convite.ativo}
              >
                {L(pt, en)}
              </button>
            ))}
          </div>

          <div className="exlabel">{L('Colunas do painel', 'Panel columns')}</div>
          <div className="filters" style={{ marginBottom: 12 }}>
            {COLUNAS.map(([chave, pt, en]) => (
              <button
                key={chave}
                type="button"
                className={`chip${convite.colunas?.[chave] ? ' on' : ''}`}
                onClick={() => alternar(convite, 'colunas', chave)}
                disabled={!convite.ativo}
              >
                {L(pt, en)}
              </button>
            ))}
          </div>

          {convite.ativo && (
            <div className="eact">
              <button className="btn danger" onClick={() => revogar(convite)}>
                {L('Revogar acesso', 'Revoke access')}
              </button>
            </div>
          )}
        </div>
      ))}

      <div className="editor">
        <h3>{L('Novo convite', 'New invite')}</h3>
        <div className="frow">
          <Campo rotulo={L('Nome do cliente', 'Client name')}>
            <input
              className="f"
              value={novo.cliente_nome}
              onChange={(e) => setNovo({ ...novo, cliente_nome: e.target.value })}
            />
          </Campo>
          <Campo rotulo={L('E-mail', 'E-mail')}>
            <input
              className="f"
              type="email"
              value={novo.cliente_email}
              onChange={(e) => setNovo({ ...novo, cliente_email: e.target.value })}
            />
          </Campo>
        </div>
        <div className="eact">
          <button className="btn pri" onClick={criar}>
            {L('Gerar convite', 'Generate invite')}
          </button>
        </div>
        <p className="hint">
          {L(
            'O link é a única credencial do portal — quem o tiver entra. Revogue para cortar o acesso sem apagar o histórico.',
            'The link is the portal only credential — anyone holding it gets in. Revoke to cut access without erasing the record.',
          )}
        </p>
      </div>
    </>
  )
}
