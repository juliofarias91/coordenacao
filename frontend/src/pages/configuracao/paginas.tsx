/** Os cabeçalhos das telas de Configuração do projeto.
 *
 *  Cada uma era uma ABA e virou rota quando a Configuração ganhou sidebar. O
 *  conteúdo continua nos mesmos arquivos — o que faltava a eles era só o
 *  título, porque antes quem o dava era a tela-mãe, uma vez para as sete.
 *
 *  Juntos num arquivo só de propósito: são componentes de seis linhas, e ler os
 *  seis títulos e subtítulos em sequência é o que denuncia quando dois estão
 *  dizendo a mesma coisa.
 */
import { Cabecalho } from '@/components/ui'
import { useI18n } from '@/i18n'
import AbaCliente from '@/pages/configuracao/Cliente'
import AbaCores from '@/pages/configuracao/Cores'
import AbaDisciplinas from '@/pages/configuracao/Disciplinas'
import AbaNomenclaturas from '@/pages/configuracao/Nomenclaturas'
import AbaProjeto from '@/pages/configuracao/Projeto'
import AbaProjetistas from '@/pages/configuracao/Projetistas'

export function CfgProjeto() {
  const { L } = useI18n()
  return (
    <>
      <Cabecalho
        titulo={L('Projeto & Cliente', 'Project & Client')}
        sub={L(
          'O código do projeto entra na nomenclatura de todo arquivo entregue, e por isso não muda depois de criado. O cliente é quem recebe o relatório.',
          'The project code goes into the file name of every delivery, which is why it cannot change after creation. The client is who receives the report.',
        )}
      />
      <AbaProjeto />
    </>
  )
}

export function CfgProjetistas() {
  const { L } = useI18n()
  return (
    <>
      <Cabecalho
        titulo={L('Projetistas', 'Designers')}
        sub={L(
          'As empresas que PRODUZEM o modelo e respondem por não-conformidade — instaladora, modeladora, coordenação. Não confundir com o cliente, que recebe o relatório.',
          'The companies that PRODUCE the model and answer for non-conformities — installer, modeler, coordination. Not to be confused with the client, who receives the report.',
        )}
      />
      <AbaProjetistas />
    </>
  )
}

export function CfgNomenclaturas() {
  const { L } = useI18n()
  return (
    <>
      <Cabecalho
        titulo={L('Nomenclaturas & padrões', 'Nomenclatures & standards')}
        sub={L(
          'O padrão de nome dos arquivos do projeto, e as ferramentas de auditoria de pasta. O padrão daqui é o que o validador da Fase 3 usa para gerar penalidade e notificação.',
          'The file naming standard for this project, plus the folder audit tools. The standard here is what the Phase 3 validator uses to raise penalties and notifications.',
        )}
      />
      <AbaNomenclaturas />
    </>
  )
}

export function CfgDisciplinas() {
  const { L } = useI18n()
  return (
    <>
      <Cabecalho
        titulo={L('Disciplinas', 'Disciplines')}
        sub={L(
          'O ELO do sistema: a disciplina amarra quem modela, quais auditorias se abrem, como o arquivo é nomeado e em que áreas ele é cobrado. Quase tudo o mais deriva daqui.',
          'The system’s LINK: the discipline ties who models, which audits open, how the file is named and in which areas it is required. Almost everything else derives from here.',
        )}
      />
      <AbaDisciplinas />
    </>
  )
}

export function CfgCores() {
  const { L } = useI18n()
  return (
    <>
      <Cabecalho
        titulo={L('Cores', 'Colors')}
        sub={L(
          'As quatro cores de macrodisciplina, usadas na matriz e na lista de modelos. A paleta foi validada nos dois temas — se mexer nela, revalide.',
          'The four macro-discipline colors, used in the matrix and the model list. The palette was validated in both themes — if you change it, validate again.',
        )}
      />
      <AbaCores />
    </>
  )
}

export function CfgCliente() {
  const { L } = useI18n()
  return (
    <>
      <Cabecalho
        titulo={L('Convidar cliente', 'Invite client')}
        sub={L(
          'Links de leitura do painel deste projeto, com visibilidade definida campo a campo. Quem recebe não precisa de conta — o link é a credencial.',
          'Read-only links to this project’s panel, with visibility set field by field. The recipient needs no account — the link is the credential.',
        )}
      />
      <AbaCliente />
    </>
  )
}
