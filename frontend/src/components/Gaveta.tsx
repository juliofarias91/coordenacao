/** Gaveta lateral direita — a superfície que SOBREPÕE.
 *
 *  Regra 4 do sistema visual: só a esquerda empurra. A sidebar empurra o
 *  conteúdo; um painel da direita sobrepõe. Se empurrasse, abrir a gaveta
 *  reflowaria a grade de projetos atrás dela e quem clicou "+ Novo projeto"
 *  perderia de vista a pasta em que estava.
 *
 *  LARGURA FIXA, e não percentual da janela. O que mora aqui dentro é
 *  formulário — um número conhecido de campos, um embaixo do outro. Uma gaveta
 *  que cresce com o monitor só estica os inputs, e um input de 900px não fica
 *  mais fácil de preencher; fica mais difícil de ler de ponta a ponta.
 *
 *  Não é modal de página (`--r-2xl`, centrado): encosta em três bordas da tela,
 *  então só o canto esquerdo é arredondado. Ela nasce colada ao topo para o
 *  cabeçalho de 56px cair exatamente sobre a topbar — a mesma régua de
 *  esqueleto, para as duas linharem.
 */
import { useEffect, type ReactNode } from 'react'

import { useI18n } from '@/i18n'

const X = 'M18 6 6 18M6 6l12 12'

export default function Gaveta({
  aberta,
  titulo,
  sub,
  onFechar,
  acoes,
  children,
}: {
  aberta: boolean
  titulo: string
  /** Uma linha abaixo do título, para o que a gaveta faz — não para instrução
   *  longa, que é `.hint` no corpo. */
  sub?: string
  onFechar: () => void
  /** O rodapé fixo. Fica FORA do corpo rolável: as ações de um formulário não
   *  podem depender de o usuário ter rolado até o fim para existirem. */
  acoes?: ReactNode
  children: ReactNode
}) {
  const { L } = useI18n()

  // Esc fecha. Registrado no documento e não na gaveta porque o foco pode estar
  // em qualquer campo de dentro — e, no primeiro instante, em nada.
  useEffect(() => {
    if (!aberta) return
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFechar()
    }
    document.addEventListener('keydown', aoTeclar)
    return () => document.removeEventListener('keydown', aoTeclar)
  }, [aberta, onFechar])

  // DESMONTA quando fecha, e não esconde: o formulário de dentro é estado
  // local, e mantê-lo montado faria a gaveta reabrir com o que a pessoa
  // digitou e desistiu de gravar na vez anterior.
  if (!aberta) return null

  return (
    <>
      {/* Escurece o que está atrás e fecha ao clique. Não é decoração: sem ele
          a gaveta parece parte da página e o clique fora não teria por que
          fechar nada. */}
      <div className="gaveta-fundo" onClick={onFechar} aria-hidden="true" />
      <div className="gaveta" role="dialog" aria-modal="true" aria-label={titulo}>
        <div className="gaveta-cab">
          <div className="gaveta-tit">
            <b>{titulo}</b>
            {sub && <span>{sub}</span>}
          </div>
          <button
            type="button"
            className="gaveta-x"
            onClick={onFechar}
            title={L('Fechar', 'Close')}
            aria-label={L('Fechar', 'Close')}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d={X} />
            </svg>
          </button>
        </div>

        <div className="gaveta-corpo thin-scroll">{children}</div>

        {acoes && <div className="gaveta-pe">{acoes}</div>}
      </div>
    </>
  )
}
