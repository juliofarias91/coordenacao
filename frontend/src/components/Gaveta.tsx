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
 *  então só o canto esquerdo é arredondado.
 *
 *  ELA NÃO COBRE MAIS O CHROME (05/08/2026, a pedido). Nasce ABAIXO da topbar e
 *  o véu começa à DIREITA do trilho de navegação: os dois seguem clicáveis com a
 *  gaveta aberta. Antes ela tomava a janela inteira, e para trocar de tela — ou
 *  só para ver em que projeto se estava — era preciso fechá-la primeiro.
 *
 *  O TOPO CAI NO `.pghead`, e não por acaso: o `.pgsplit` começa na borda de
 *  baixo da topbar, então `top: var(--h-topbar)` põe a gaveta no mesmo nível do
 *  título da seção. O cabeçalho dela seguiu junto de 56px para 48px — deixou de
 *  vizinhar a topbar e passou a vizinhar o header de seção, e é com o traço dele
 *  que o seu tem de linhar. A régua está na seção GAVETA LATERAL do `app.css`.
 */
import { useEffect, useState, type ReactNode } from 'react'

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
  /** SEGUE NA TELA DEPOIS DE `aberta` VIRAR FALSO, e só até a saída terminar.
   *
   *  É o que permite animar o fechamento: um elemento desmontado não anima, e
   *  antes a gaveta sumia no mesmo quadro do clique. Quem devolve `false` é o
   *  `onAnimationEnd` da própria animação de saída — não um `setTimeout` casado
   *  com `--dur`, que passaria a mentir no dia em que a curva mudasse. */
  const [presente, setPresente] = useState(aberta)

  useEffect(() => {
    if (aberta) {
      setPresente(true)
      return
    }
    // REDE DE SEGURANÇA, não o mecanismo. Quem desmonta é o `onAnimationEnd`;
    // este teto existe para o caso de a animação NÃO RODAR — hoje o projeto não
    // tem regra de `prefers-reduced-motion`, mas basta alguém acrescentar um
    // `animation: none` para o evento nunca disparar e a gaveta ficar presa na
    // tela, aberta e sem saída. Folgado de propósito: ele não deve competir com
    // a curva real, só garantir que a gaveta some.
    const teto = setTimeout(() => setPresente(false), 1000)
    return () => clearTimeout(teto)
  }, [aberta])

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
  // digitou e desistiu de gravar na vez anterior. O que mudou em 05/08/2026 é
  // QUANDO — no fim da animação de saída, não no clique.
  if (!presente) return null

  const saindo = !aberta

  return (
    <>
      {/* FECHA AO CLIQUE, E NÃO ESCURECE NADA (05/08/2026, a pedido). Ele era um
          véu preto a 45%; ficou transparente. O que separa a gaveta do fundo é a
          borda e a sombra — as mesmas que já a separavam com o véu ali.
          Continua existindo porque é ele quem captura o clique fora, e sem isso
          uma das três saídas da gaveta deixaria de existir. */}
      <div
        className={`gaveta-fundo${saindo ? ' saindo' : ''}`}
        onClick={onFechar}
        aria-hidden="true"
      />
      <div
        className={`gaveta${saindo ? ' saindo' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        onAnimationEnd={(e) => {
          // SÓ A ANIMAÇÃO DESTE ELEMENTO. `animationend` borbulha, e um filho
          // animado (o "salvando…", um realce) desmontaria a gaveta no meio.
          if (e.target === e.currentTarget && saindo) setPresente(false)
        }}
      >
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
