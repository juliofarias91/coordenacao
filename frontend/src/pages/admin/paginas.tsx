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
import { useAuth } from '@/auth/AuthContext'
import { Cabecalho, Vazio } from '@/components/ui'
import { useI18n } from '@/i18n'
import AbaClientes from '@/pages/admin/Clientes'
import AbaOrganizacao from '@/pages/admin/Organizacao'
import AbaProjetos from '@/pages/admin/Projetos'
import AbaReportes from '@/pages/admin/Reportes'
import AbaTrilha from '@/pages/admin/Trilha'
import AbaUsuarios from '@/pages/admin/Usuarios'

/** A gestão de contas da organização.
 *
 *  Serve a DUAS ROTAS de propósito: `/membros`, no grupo Gestão da Home, e
 *  `/admin/usuarios`, dentro do painel administrativo. Quem coordena entra pela
 *  primeira várias vezes por semana; quem administra o tenant a encontra na
 *  segunda, junto de organização, clientes e logs.
 *
 *  Uma implementação só — o que muda é a barra lateral em volta. O título
 *  acompanha a porta pela qual se entrou, porque "Gerenciar membros" e
 *  "Usuários" são o mesmo cadastro visto de dois lugares.
 */
export function PaginaUsuarios({ titulo }: { titulo?: string }) {
  const { L } = useI18n()
  return (
    <>
      <Cabecalho
        titulo={titulo ?? L('Usuários', 'Users')}
        sub={L(
          'Quem entra na plataforma, com que papel e com que permissões. O papel define o padrão; a lista de permissões, quando preenchida, prevalece sobre ele. Para dizer quem participa de um projeto específico, abra o projeto e vá em Membros.',
          'Who gets into the platform, with what role and permissions. The role sets the default; an explicit permission list overrides it. To say who takes part in a specific project, open the project and go to Members.',
        )}
      />
      <AbaUsuarios />
    </>
  )
}

/** A mesma tela, entrada pela Home. Guarda a permissão por conta própria: no
 *  painel administrativo quem faz isso é o `Admin`, que aqui não existe. */
export function PaginaGerenciarMembros() {
  const { L } = useI18n()
  const { usuario } = useAuth()

  if (!usuario?.permissoes.includes('admin_cadastro')) {
    return (
      <>
        <Cabecalho titulo={L('Gerenciar membros', 'Manage members')} />
        <Vazio
          titulo={L('Sem permissão', 'No permission')}
          texto={L(
            'Gerenciar membros exige a permissão "Administrar cadastros". Peça a um administrador.',
            'Managing members requires the "Manage records" permission. Ask an administrator.',
          )}
        />
      </>
    )
  }

  return <PaginaUsuarios titulo={L('Gerenciar membros', 'Manage members')} />
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

export function PaginaReportes() {
  const { L } = useI18n()
  return (
    <>
      <Cabecalho
        titulo={L('Erros reportados', 'Reported problems')}
        sub={L(
          'O que quem usa a plataforma relatou pelo menu da conta, com a tela em que estava e, quando anexado, o print. Só quem administra vê esta lista: o print mostra dado de projeto.',
          'What people reported through the account menu, with the screen they were on and, when attached, the screenshot. Only administrators see this list: screenshots show project data.',
        )}
      />
      <AbaReportes />
    </>
  )
}
