/** OS INTERRUPTORES DE VISUALIZAÇÃO DE PÁGINA.
 *
 *  Dois consumidores, e é por isso que ele é componente e não JSX repetido: a
 *  gaveta de CONTA (`pages/admin/Usuarios.tsx`) e a de MEMBRO DE PROJETO
 *  (`components/TabelaMembros.tsx`). Duas cópias divergiriam na primeira tela
 *  nova que ganhasse tratamento especial.
 *
 *  A LISTA É O PRÓPRIO MENU (`PAGINAS_OCULTAVEIS`, derivada de `ITENS_GLOBAIS` e
 *  `ITENS_PROJETO` em `layout/nav.ts`), nos mesmos grupos e na mesma ordem: quem
 *  desliga está olhando para a sequência que a pessoa do outro lado vai ver.
 *
 *  LIGADO É "VÊ", e o valor guarda o contrário. A razão de o BANCO guardar as
 *  OCULTAS está em `models/enums.py` — tela nova nasce visível. A razão de a
 *  TELA mostrar as visíveis é que a pergunta de quem edita é "o que essa pessoa
 *  enxerga?", e um painel inteiro de interruptores desligados para alguém que vê
 *  tudo lê-se como acesso negado.
 *
 *  O AVISO VEM DE FORA (`children`) porque ele muda com o lugar: na gaveta de
 *  conta basta dizer que isto não é permissão; na de projeto é preciso dizer,
 *  ANTES disso, que a escolha vale em todos os projetos — o dado é da conta, não
 *  do vínculo.
 */
import type { ReactNode } from 'react'

import { useI18n } from '@/i18n'
import { PAGINAS_OCULTAVEIS } from '@/layout/nav'

export default function PaginasVisiveis({
  ocultas,
  onMudar,
  children,
}: {
  /** As rotas ESCONDIDAS. É o que o servidor guarda; a tela desenha o inverso. */
  ocultas: string[]
  onMudar: (ocultas: string[]) => void
  /** O aviso sob os interruptores. Ver o cabeçalho. */
  children?: ReactNode
}) {
  const { L } = useI18n()

  return (
    <div className="usr-paginas">
      <div className="usr-pagtit">{L('Visualização de páginas', 'Page visibility')}</div>

      {PAGINAS_OCULTAVEIS.map((g) => {
        const rotas = g.itens.map((i) => i.rota)
        const todasOcultas = rotas.every((r) => ocultas.includes(r))
        return (
          <div key={g.grupo} className="usr-paggrupo">
            <div className="usr-pagcab">
              <span>{L(g.pt, g.en)}</span>
              {/* O rótulo VIRA O INVERSO quando o grupo já está todo oculto: um
                  botão que diz "ocultar todas" com tudo apagado é um botão que
                  não faz nada, e quem o clica conclui que a tela travou. */}
              <button
                type="button"
                className="linkmudo"
                onClick={() =>
                  onMudar(
                    todasOcultas
                      ? ocultas.filter((r) => !rotas.includes(r))
                      : [...new Set([...ocultas, ...rotas])],
                  )
                }
              >
                {todasOcultas ? L('Mostrar todas', 'Show all') : L('Ocultar todas', 'Hide all')}
              </button>
            </div>

            {g.itens.map((i) => {
              const visivel = !ocultas.includes(i.rota)
              return (
                <div key={i.rota} className="usr-pagitem">
                  <span>{L(i.pt, i.en)}</span>
                  {/* `role="switch"` e não checkbox: o desenho é um interruptor,
                      e o leitor de tela deve anunciar o mesmo que o olho vê. */}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={visivel}
                    aria-label={L(i.pt, i.en)}
                    className={`chave${visivel ? ' on' : ''}`}
                    onClick={() =>
                      onMudar(
                        visivel ? [...ocultas, i.rota] : ocultas.filter((r) => r !== i.rota),
                      )
                    }
                  >
                    <span className="chave-bola" />
                  </button>
                </div>
              )
            })}
          </div>
        )
      })}

      {children}
    </div>
  )
}
