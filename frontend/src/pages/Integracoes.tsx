/** SP-201 · Integrações — estado da conexão com o Autodesk Construction Cloud. */
import { useEffect, useState } from 'react'

import { Erro } from '@/components/ui'
import { useI18n } from '@/i18n'
import { ApiError, api } from '@/lib/api'
import type { StatusIntegracao } from '@/lib/types'

export default function Integracoes() {
  const { L } = useI18n()
  const [status, setStatus] = useState<StatusIntegracao | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    api
      .integracaoAcc()
      .then(setStatus)
      .catch((e) => setErro(e instanceof ApiError ? e.message : String(e)))
  }, [])

  return (
    <>
      <Erro mensagem={erro} />

      <div className="card">
        <table>
          <tbody>
            <tr>
              <td>
                <b>Autodesk Construction Cloud</b>
                <div className="mmeta">
                  {L(
                    'Ingestão de versões da pasta MODELS via webhook.',
                    'Version ingestion from the MODELS folder via webhook.',
                  )}
                </div>
              </td>
              <td style={{ textAlign: 'right' }}>
                {status === null ? (
                  <span className="pill">{L('verificando…', 'checking…')}</span>
                ) : status.configurado ? (
                  <span className="pill ok">{L('conectado', 'connected')}</span>
                ) : (
                  <span className="pill alerta">{L('não configurado', 'not configured')}</span>
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {status && !status.configurado && (
        <p className="hint">
          <b>{L('O que falta:', 'What is missing:')}</b> {status.detalhe}.{' '}
          {L(
            'Preencha APS_CLIENT_ID, APS_CLIENT_SECRET e APS_WEBHOOK_SECRET no .env e reinicie a API. Enquanto isso, as versões podem ser criadas manualmente na tela do modelo.',
            'Fill APS_CLIENT_ID, APS_CLIENT_SECRET and APS_WEBHOOK_SECRET in .env and restart the API. Meanwhile, versions can be created manually on the model screen.',
          )}
        </p>
      )}

      <div className="sectitle">{L('Endpoint do webhook', 'Webhook endpoint')}</div>
      <div className="card">
        <div style={{ padding: '14px 16px' }}>
          <span className="code">POST /api/v1/ingest/acc/webhook</span>
          <p className="hint" style={{ margin: '8px 0 0' }}>
            {L(
              'Aponte o webhook dm.version.added do ACC para cá. Todo evento é verificado por HMAC-SHA1 — sem o segredo configurado, nenhum evento é aceito.',
              'Point the ACC dm.version.added webhook here. Every event is verified with HMAC-SHA1 — with no secret configured, no event is accepted.',
            )}
          </p>
        </div>
      </div>
    </>
  )
}
