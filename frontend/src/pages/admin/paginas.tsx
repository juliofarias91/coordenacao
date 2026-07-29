/** Os cabeçalhos das telas do painel administrativo.
 *
 *  Cada uma destas era uma ABA de `pages/admin/index.tsx` e virou rota própria
 *  quando o painel ganhou sidebar (29/07/2026). O conteúdo continua nos mesmos
 *  arquivos — o que faltava a eles era só o título, porque antes quem o dava
 *  era a tela-mãe, uma vez para as quatro.
 *
 *  Ficam juntos num arquivo só de propósito: são cinco componentes de seis
 *  linhas, e espalhá-los em cinco arquivos esconderia o que eles têm de mais
 *  útil, que é poder ler os cinco títulos e subtítulos em sequência e notar
 *  quando dois estão dizendo a mesma coisa.
 */
import { Cabecalho } from '@/components/ui'
import { useI18n } from '@/i18n'
import AbaClientes from '@/pages/admin/Clientes'
import AbaOrganizacao from '@/pages/admin/Organizacao'
import AbaProjetos from '@/pages/admin/Projetos'
import AbaTrilha from '@/pages/admin/Trilha'
import AbaUsuarios from '@/pages/admin/Usuarios'

export function PaginaUsuarios() {
  const { L } = useI18n()
  return (
    <>
      <Cabecalho
        titulo={L('Usuários', 'Users')}
        sub={L(
          'Quem entra na plataforma, com que papel e com que permissões. O papel define o padrão; a lista de permissões, quando preenchida, prevalece sobre ele. Para dizer quem participa de um projeto específico, abra o projeto e vá em Membros.',
          'Who gets into the platform, with what role and permissions. The role sets the default; an explicit permission list overrides it. To say who takes part in a specific project, open the project and go to Members.',
        )}
      />
      <AbaUsuarios />
    </>
  )
}

export function PaginaLogs() {
  const { L } = useI18n()
  return (
    <>
      <Cabecalho
        titulo={L('Logs', 'Logs')}
        sub={L(
          'A trilha de auditoria: toda criação, alteração e remoção de cadastro, com autor, data e os campos afetados. É gravada sozinha e não é editável — nem por aqui, nem pela API.',
          'The audit trail: every record creation, change and removal, with author, timestamp and affected fields. Written automatically and not editable — neither here nor through the API.',
        )}
      />
      <AbaTrilha />
    </>
  )
}

export function PaginaOrganizacao() {
  const { L } = useI18n()
  return (
    <>
      <Cabecalho
        titulo={L('Organização', 'Organization')}
        sub={L(
          'Quem é o tenant e quanto ele tem de cada coisa. O slug é o que identifica a organização no login, antes de existir token.',
          'Who the tenant is and how much of each thing it has. The slug identifies the organization at sign-in, before a token exists.',
        )}
      />
      <AbaOrganizacao />
    </>
  )
}

export function PaginaClientes() {
  const { L } = useI18n()
  return (
    <>
      <Cabecalho
        titulo={L('Clientes', 'Clients')}
        sub={L(
          'Quem CONTRATA a auditoria. Não confundir com os projetistas, que produzem o modelo e respondem por não-conformidade — são lados opostos da mesa. O nome do cliente é a pasta dos projetos na tela inicial.',
          'Who COMMISSIONS the audit. Not to be confused with the design companies, which produce the model and answer for non-conformities — opposite sides of the table. The client name is the project folder on the home screen.',
        )}
      />
      <AbaClientes />
    </>
  )
}

export function PaginaProjetos() {
  const { L } = useI18n()
  return (
    <>
      <Cabecalho
        titulo={L('Projetos', 'Projects')}
        sub={L(
          'É aqui que um projeto novo nasce, antes de qualquer configuração de auditoria. A tela inicial lista os projetos por cliente; criar é deste lado.',
          'This is where a new project is born, before any audit setup. The home screen lists projects by client; creating happens here.',
        )}
      />
      <AbaProjetos />
    </>
  )
}
