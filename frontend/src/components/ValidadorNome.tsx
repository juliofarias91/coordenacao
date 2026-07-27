/** SP-301 · Testador de nomenclatura.
 *
 *  Validar é livre e sem efeito colateral — a coordenação precisa poder
 *  conferir um nome antes de cobrar o fornecedor. Registrar a penalidade é um
 *  segundo passo, explícito.
 */
import { useState } from 'react'

import { useI18n } from '@/i18n'
import { ApiError, api } from '@/lib/api'
import type { Empresa, VeredictoNome } from '@/lib/types'

export default function ValidadorNome({
  projetoId,
  empresas,
}: {
  projetoId: string
  empresas: Empresa[]
}) {
  const { L } = useI18n()
  const [nome, setNome] = useState('')
  const [empresaId, setEmpresaId] = useState('')
  const [veredicto, setVeredicto] = useState<VeredictoNome | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  async function validar(registrar: boolean) {
    if (!nome.trim()) return
    setErro(null)
    setOcupado(true)
    try {
      setVeredicto(
        await api.nomenclaturaValidar({
          nome,
          projeto_id: projetoId,
          empresa_id: registrar ? empresaId || null : null,
          registrar,
        }),
      )
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : String(e))
      setVeredicto(null)
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div className="editor">
      <h3>{L('Testar um nome de arquivo', 'Test a file name')}</h3>

      {erro && <div className="erro">{erro}</div>}

      <div className="frow">
        <div className="full">
          <label className="fl">{L('Nome do arquivo', 'File name')}</label>
          <input
            className="f code"
            placeholder="CPQ11-C-STRC-CONCR-ADMIN-R22.ifc"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && validar(false)}
          />
        </div>
      </div>

      <div className="eact">
        <button className="btn pri" onClick={() => validar(false)} disabled={ocupado || !nome.trim()}>
          {L('Validar', 'Validate')}
        </button>
      </div>

      {veredicto && (
        <>
          <div style={{ margin: '16px 0 10px' }}>
            <span className={veredicto.ok ? 'pill ok' : 'pill ruim'}>
              {veredicto.ok ? L('Conforme', 'Compliant') : L('Divergente', 'Non-compliant')}
            </span>{' '}
            <span className="hint" style={{ margin: 0 }}>
              {L('padrão:', 'pattern:')} <span className="code">{veredicto.padrao}</span>
            </span>
          </div>

          <div className="card" style={{ marginBottom: 12 }}>
            <table>
              <thead>
                <tr>
                  <th>{L('Segmento', 'Segment')}</th>
                  <th>{L('Valor', 'Value')}</th>
                  <th>{L('Observação', 'Note')}</th>
                </tr>
              </thead>
              <tbody>
                {veredicto.segmentos.map((s, i) => (
                  <tr key={`${s.k}-${i}`}>
                    <td className="code">{s.k}</td>
                    <td>
                      <span className={s.ok ? 'setp ok' : 'setp bad'}>{s.valor || '—'}</span>
                    </td>
                    <td className="co">
                      {s.motivo ??
                        (s.esperados.length > 0
                          ? `${L('aceita', 'accepts')}: ${s.esperados.join(', ')}`
                          : L('livre', 'free'))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!veredicto.ok && (
            <>
              <div className="frow">
                <div className="full">
                  <label className="fl">
                    {L('Registrar penalidade para', 'Register penalty for')}
                  </label>
                  <select
                    className="f"
                    value={empresaId}
                    onChange={(e) => setEmpresaId(e.target.value)}
                  >
                    <option value="">{L('— escolha a empresa —', '— pick the company —')}</option>
                    {empresas.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.nome}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="eact">
                <button
                  className="btn danger"
                  onClick={() => validar(true)}
                  disabled={ocupado || !empresaId}
                >
                  {L('Registrar penalidade', 'Register penalty')}
                </button>
              </div>
              {veredicto.penalidade_id && (
                <p className="hint">
                  {L(
                    'Penalidade lançada no ledger e o responsável foi notificado.',
                    'Penalty recorded in the ledger and the responsible party was notified.',
                  )}
                </p>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
