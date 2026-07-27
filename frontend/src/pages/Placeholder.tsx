/** Tela ainda não implementada.
 *
 *  Existe para o shell ser navegável desde a Fase 0 (SP-005 · CA: "navegação
 *  entre telas vazias"). Cada uma declara em que fase do roadmap ela ganha
 *  conteúdo — assim a navegação também serve de mapa do que falta.
 */
import { useI18n } from '@/i18n'

type Props = { titulo: [string, string]; descricao: [string, string]; fase: number }

export default function Placeholder({ titulo, descricao, fase }: Props) {
  const { L } = useI18n()
  return (
    <>
      <div className="top">
        <div>
          <h1>{L(titulo[0], titulo[1])}</h1>
          <p className="sub">{L(descricao[0], descricao[1])}</p>
        </div>
      </div>
      <div className="card">
        <div className="empty">
          <b>{L('Tela ainda não construída', 'Screen not built yet')}</b>
          {L(
            `Entra na Fase ${fase} do roadmap. O protótipo em docs/prototipo_auditoria_bim.html é a referência de layout.`,
            `Lands in phase ${fase} of the roadmap. The prototype in docs/prototipo_auditoria_bim.html is the layout reference.`,
          )}
        </div>
      </div>
    </>
  )
}
