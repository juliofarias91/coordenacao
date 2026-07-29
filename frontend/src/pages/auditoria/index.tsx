/** A auditoria — UMA entrada na barra, seis recortes num painel da página.
 *
 *  Os recortes já foram seis itens da barra lateral do projeto, e o grupo
 *  Auditoria ficou com nove linhas: mais do que Visão geral e Projeto somados,
 *  empurrando para fora da vista justamente o que se configura ANTES de
 *  auditar. E seis rótulos que começam com a mesma palavra ("Auditoria geral",
 *  "Auditoria 4D"…) obrigam a ler até o fim de cada um para escolher.
 *
 *  O FORMATO É O DOS CANAIS DO VDCITY: painel de 300px à esquerda, conteúdo à
 *  direita, e os dois cabeçalhos na mesma linha de 48px. O painel RECOLHE — e
 *  recolher o desmonta, não o transforma em trilho de ícones: seis rótulos como
 *  "Auditoria LOD350" não sobrevivem a virar ícone, e um trilho de seis selos
 *  idênticos não diria nada.
 *
 *  O botão de recolher fica no cabeçalho do CONTEÚDO. Se ficasse no do painel,
 *  recolher levaria embora o botão de trazer de volta.
 *
 *  Este arquivo é só o esqueleto e o painel. O que cada recorte mostra está em
 *  `Recorte.tsx`, e a planilha de um modelo nas suas próprias telas — todas
 *  filhas desta rota, para que o painel não pisque ao navegar entre elas.
 */
import { useCallback, useEffect, useState } from 'react'
import { Outlet, useLocation, useNavigate, useParams } from 'react-router-dom'

import { useI18n } from '@/i18n'
import { CHECKLISTS, ROTULO_CHECKLIST } from '@/layout/nav'
import { rotaProjeto, useProjeto } from '@/projeto/ProjetoContext'

const CHAVE_PAINEL = 'spbim_auditoria_painel'

/** O ícone `PanelLeft` do lucide, o mesmo do VDCity: um retângulo com a coluna
 *  da esquerda destacada. Diz o que o botão faz sem depender de rótulo. */
const PATH_PAINEL = 'M3 3h18v18H3zM9 3v18'

function leRecolhido(): boolean {
  try {
    return localStorage.getItem(CHAVE_PAINEL) === '1'
  } catch {
    return false
  }
}

export default function Auditoria() {
  const { L } = useI18n()
  const { projeto } = useProjeto()
  const navegar = useNavigate()
  const { pathname } = useLocation()
  const { checklist, modeloId } = useParams<{ checklist: string; modeloId: string }>()

  const [recolhido, setRecolhido] = useState(leRecolhido)

  const alternar = useCallback(() => {
    setRecolhido((atual) => {
      const proximo = !atual
      try {
        localStorage.setItem(CHAVE_PAINEL, proximo ? '1' : '0')
      } catch {
        /* modo privado: a preferência vale só nesta sessão */
      }
      return proximo
    })
  }, [])

  // `/auditoria` sem recorte cai na geral. Feito aqui, e não com um `<Navigate>`
  // na rota, porque o recorte-padrão é conhecimento desta tela: se um dia a
  // geral deixar de ser o ponto de partida, muda-se uma linha.
  useEffect(() => {
    if (!checklist && projeto) {
      navegar(rotaProjeto(projeto.id, 'auditoria/geral'), { replace: true })
    }
  }, [checklist, projeto, navegar])

  if (!projeto) return <p className="hint">{L('Carregando…', 'Loading…')}</p>

  const atual = CHECKLISTS.find((c) => c === checklist)
  const titulo = atual
    ? L(...ROTULO_CHECKLIST[atual])
    : L('Auditoria', 'Audit')

  return (
    <div className="pgsplit">
      {/* Desmontado quando recolhido — o `flex: 1` do conteúdo reflui e ocupa
          os 300px, que é o ponto de recolher. */}
      {!recolhido && (
        <aside className="pgside">
          <div className="pghead">{L('Recortes', 'Scopes')}</div>
          <nav className="pglist">
            {CHECKLISTS.map((c) => {
              // `endsWith` e não igualdade: dentro da planilha de um modelo o
              // caminho é `auditoria/geral/<id>`, e o recorte continua sendo o
              // geral — o item tem de seguir marcado.
              const dentro = checklist === c
              return (
                <button
                  key={c}
                  type="button"
                  className={`pgitem${dentro ? ' on' : ''}`}
                  aria-current={dentro ? 'page' : undefined}
                  onClick={() => navegar(rotaProjeto(projeto.id, `auditoria/${c}`))}
                >
                  {L(...ROTULO_CHECKLIST[c])}
                </button>
              )
            })}
          </nav>
        </aside>
      )}

      <section className="pgmain">
        <div className="pghead">
          <button
            type="button"
            className="pgtoggle"
            aria-pressed={recolhido}
            onClick={alternar}
            title={
              recolhido
                ? L('Mostrar os recortes', 'Show scopes')
                : L('Recolher os recortes', 'Collapse scopes')
            }
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d={PATH_PAINEL} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <span>{titulo}</span>
          {/* Dentro da planilha de um modelo, o cabeçalho diz de qual — é a
              única pista, já que o título continua sendo o do recorte. */}
          {modeloId && <span className="co">· {L('planilha', 'sheet')}</span>}
        </div>
        <div className="pgbody" key={pathname}>
          <Outlet />
        </div>
      </section>
    </div>
  )
}
