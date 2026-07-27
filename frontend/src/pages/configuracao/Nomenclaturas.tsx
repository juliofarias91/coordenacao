/** SP-104 · Nomenclaturas & padrões.
 *
 *  Quatro abas, duas origens:
 *
 *    · `Padrão do projeto` fala com o backend. É o padrão oficial, vale para o
 *      time todo e é o que gera penalidade, notificação e trilha.
 *
 *    · As outras três vieram do **Auditer** e rodam inteiras no navegador —
 *      nenhum arquivo é enviado para a API. Elas cobrem o que a automação do
 *      servidor não cobre hoje: padrões com separador por bloco e tipos,
 *      duplicidade por conteúdo (SHA-256) e ortografia de planilha.
 *
 *  Os dois modelos convivem em vez de um substituir o outro porque respondem a
 *  perguntas diferentes: o do backend audita o MODELO entregue; o do Auditer
 *  audita a PASTA — PDF de spec, planilha de controle, relatório.
 */
import { lazy, Suspense, useState } from 'react'

import { Segmented } from '@/components/ui'
import { useI18n } from '@/i18n'
import { useBancadaAuditer } from '@/pages/configuracao/nomenclatura/estado'
import AbaPadraoDoProjeto from '@/pages/configuracao/nomenclatura/PadraoDoProjeto'

// Carregadas sob demanda: a auditoria de arquivos arrasta o SheetJS (~480 kB)
// e o motor de padrões. É uma aba de uma tela — cobrar esse peso de todo mundo
// no primeiro carregamento da plataforma seria pagar caro por pouco uso.
const AbaAuditoriaArquivos = lazy(
  () => import('@/pages/configuracao/nomenclatura/AuditoriaArquivos'),
)
const AbaPadroesAvancados = lazy(
  () => import('@/pages/configuracao/nomenclatura/PadroesAvancados'),
)
const AbaPalavrasAceitas = lazy(
  () => import('@/pages/configuracao/nomenclatura/PalavrasAceitas'),
)

type Aba = 'projeto' | 'arquivos' | 'avancados' | 'aceitas'

export default function AbaNomenclaturas() {
  const { L } = useI18n()
  const [aba, setAba] = useState<Aba>('projeto')
  // O estado vive aqui, e não em cada aba: aceitar uma palavra na auditoria tem
  // de aparecer na lista de aceitas, e um padrão criado tem de valer para a
  // auditoria — sem depender de remontar componente.
  const bancada = useBancadaAuditer()

  const abas: Array<[Aba, string]> = [
    ['projeto', L('Padrão do projeto', 'Project standard')],
    ['arquivos', L('Auditoria de arquivos', 'File audit')],
    [
      'avancados',
      `${L('Padrões avançados', 'Advanced patterns')}${
        bancada.padroes.length ? ` (${bancada.padroes.length})` : ''
      }`,
    ],
    [
      'aceitas',
      `${L('Palavras aceitas', 'Accepted words')}${
        bancada.aceitas.length ? ` (${bancada.aceitas.length})` : ''
      }`,
    ],
  ]

  return (
    <>
      <Segmented itens={abas} valor={aba} onChange={setAba} />

      {aba === 'projeto' ? (
        <AbaPadraoDoProjeto />
      ) : (
        <Suspense fallback={<p className="hint">{L('Carregando…', 'Loading…')}</p>}>
          {aba === 'arquivos' ? (
            <AbaAuditoriaArquivos bancada={bancada} />
          ) : aba === 'avancados' ? (
            <AbaPadroesAvancados bancada={bancada} />
          ) : (
            <AbaPalavrasAceitas bancada={bancada} />
          )}
        </Suspense>
      )}
    </>
  )
}
