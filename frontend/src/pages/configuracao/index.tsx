/** Fase 1 · Configuração do projeto.
 *
 *  Mesmas abas do protótipo. "Convidar cliente" fica para a Fase 4 (SP-405),
 *  junto com o portal que o convite abre.
 */
import { useState } from 'react'

import { Cabecalho, Segmented, Vazio } from '@/components/ui'
import { useI18n } from '@/i18n'
import AbaCliente from '@/pages/configuracao/Cliente'
import AbaCores from '@/pages/configuracao/Cores'
import AbaDisciplinas from '@/pages/configuracao/Disciplinas'
import AbaNomenclaturas from '@/pages/configuracao/Nomenclaturas'
import AbaProjeto from '@/pages/configuracao/Projeto'
import AbaProjetistas from '@/pages/configuracao/Projetistas'
import AbaUsuarios from '@/pages/configuracao/Usuarios'
import { useProjeto } from '@/projeto/ProjetoContext'

type Aba = 'projeto' | 'projetistas' | 'nomenclaturas' | 'disciplinas' | 'cores' | 'usuarios' | 'cliente'

export default function Configuracao() {
  const { L } = useI18n()
  const { projeto, carregando } = useProjeto()
  const [aba, setAba] = useState<Aba>('projeto')

  const abas: Array<[Aba, string]> = [
    ['projeto', L('Projeto & Cliente', 'Project & Client')],
    ['projetistas', L('Projetistas', 'Designers')],
    ['nomenclaturas', L('Nomenclaturas & padrões', 'Nomenclatures & standards')],
    ['disciplinas', L('Disciplinas', 'Disciplines')],
    ['cores', L('Cores', 'Colors')],
    ['usuarios', L('Usuários & acessos', 'Users & access')],
    ['cliente', L('Convidar cliente', 'Invite client')],
  ]

  return (
    <>
      <Cabecalho
        titulo={L('Configuração do projeto', 'Project setup')}
        sub={L(
          'Cadastre projeto, cliente, projetistas, nomenclaturas e critérios do PEB uma vez. Tudo converge na disciplina — que amarra quem modela, o que é auditado, como é nomeado e em quais áreas.',
          'Register project, client, designers, nomenclatures and BEP criteria once. Everything converges on the discipline — which ties who models, what is audited, how it is named and in which areas.',
        )}
      />

      <Segmented itens={abas} valor={aba} onChange={setAba} />

      {carregando ? (
        <p className="hint">{L('Carregando…', 'Loading…')}</p>
      ) : !projeto ? (
        <Vazio
          titulo={L('Nenhum projeto nesta organização', 'No project in this organization')}
          texto={L(
            'Rode o seed do backend (python -m scripts.seed) ou crie um projeto pela API.',
            'Run the backend seed (python -m scripts.seed) or create a project through the API.',
          )}
        />
      ) : aba === 'projeto' ? (
        <AbaProjeto />
      ) : aba === 'projetistas' ? (
        <AbaProjetistas />
      ) : aba === 'nomenclaturas' ? (
        <AbaNomenclaturas />
      ) : aba === 'disciplinas' ? (
        <AbaDisciplinas />
      ) : aba === 'cores' ? (
        <AbaCores />
      ) : aba === 'usuarios' ? (
        <AbaUsuarios />
      ) : (
        <AbaCliente />
      )}
    </>
  )
}
