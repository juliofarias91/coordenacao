/** Fase 1 · Configuração do projeto — UMA PÁGINA com abas.
 *
 *  Aqui se define disciplinas, projeto & cliente, projetistas, nomenclatura &
 *  padrões e cores. **Tudo dentro da página**: a barra lateral do projeto não
 *  sai da tela e não é trocada por outra.
 *
 *  ELA JÁ FOI UMA ÁREA COM SIDEBAR PRÓPRIA, e voltou a ser abas em 29/07/2026,
 *  a pedido. O argumento de então — "aba serve para alternar entre visões do
 *  MESMO assunto, e aqui são assuntos distintos" — estava errado sobre o que
 *  estas seis são: elas são o cadastro de UM projeto, feito de uma vez, e quem
 *  o preenche passa por todas em sequência. Trocar a barra inteira a cada
 *  seção fazia perder de vista em que projeto se estava, e a área nova ficava
 *  indistinguível do painel administrativo — que é de outro escopo.
 *
 *  As ROTAS ficaram (`configuracao/projeto`, `/disciplinas`, …). A aba é um
 *  `NavLink`, não estado local: o endereço continua dizendo em que seção se
 *  está, o link é copiável e o botão voltar do navegador funciona entre abas.
 *  Um `useState` aqui teria custado as três coisas de uma vez.
 */
import { NavLink, Outlet } from 'react-router-dom'

import { Vazio } from '@/components/ui'
import { useI18n } from '@/i18n'
import { useProjeto } from '@/projeto/ProjetoContext'

/** A ordem é a de quem monta um projeto do zero: diz quem produz, define como o
 *  arquivo se chama, e só então as disciplinas — que dependem de projetista e de
 *  nomenclatura para fazerem sentido.
 *
 *  `Projeto & Cliente` SAIU em 30/07/2026, quando a Ficha do projeto entrou na
 *  barra. As duas editavam os mesmos cinco campos, e duas telas para o mesmo
 *  dado divergem na primeira mudança. A divisão que ficou é limpa: a **ficha**
 *  diz QUEM É a obra, a **configuração** diz COMO ela é auditada. */
/** `Cores` SAIU em 31/07/2026, a pedido, absorvida por `Disciplinas`. Era uma
 *  tabela de quatro linhas, só leitura, dizendo qual cor é qual macrodisciplina —
 *  uma legenda numa aba separada da coisa que ela legenda. Quem cadastra uma
 *  disciplina escolhe a macrodisciplina, e é ali que a cor importa; agora a
 *  amostra aparece no formulário, na tabela e numa legenda ao pé dela.
 *  A cor NÃO virou editável — ela sai de `macro` e a paleta é validada. A rota
 *  `cores` redireciona, para não quebrar link nem histórico. */
const ABAS: Array<[string, string, string]> = [
  ['projetistas', 'Projetistas', 'Designers'],
  ['nomenclaturas', 'Nomenclaturas & padrões', 'Nomenclatures & standards'],
  ['disciplinas', 'Disciplinas', 'Disciplines'],
  ['cliente', 'Convidar cliente', 'Invite client'],
]

export default function Configuracao() {
  const { L } = useI18n()
  const { projeto, carregando } = useProjeto()

  if (carregando) return <p className="hint">{L('Carregando…', 'Loading…')}</p>

  if (!projeto) {
    return (
      <Vazio
        titulo={L('Nenhum projeto nesta organização', 'No project in this organization')}
        texto={L(
          'Crie o primeiro no Painel administrativo › Projetos.',
          'Create the first one under Admin panel › Projects.',
        )}
      />
    )
  }

  return (
    <>
      {/* Regra 1: a aba ativa é TINTA CHEIA E NEGRITO, sem pílula colorida —
          `.abas` está em `app.css` e é a mesma receita do resto do sistema. */}
      <nav className="abas">
        {ABAS.map(([rota, pt, en]) => (
          <NavLink
            key={rota}
            to={rota}
            className={({ isActive }) => (isActive ? 'aba on' : 'aba')}
          >
            {L(pt, en)}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </>
  )
}
