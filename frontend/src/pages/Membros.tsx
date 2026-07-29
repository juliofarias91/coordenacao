/** Gestão de membros — quem tem acesso à organização, e com que poder.
 *
 *  O conteúdo é o mesmo que era a aba "Usuários & acessos" da Administração
 *  (`pages/admin/Usuarios.tsx`); o que mudou em 29/07/2026 foi ONDE ele mora.
 *
 *  Saiu do painel administrativo porque não é da mesma natureza do resto de lá.
 *  Administração é o andar de cima: a organização, seus projetos, sua trilha —
 *  coisas que se configuram uma vez. Membro entra e sai o tempo todo, e é
 *  operação de rotina de quem coordena, não de quem administra o tenant.
 *  Enterrá-la duas camadas abaixo cobrava três cliques por convite.
 *
 *  A guarda de verdade continua no `requer_permissao("admin_cadastro")` de
 *  cada rota da API; o item some do menu para quem não a tem, o que é
 *  conveniência de navegação e não segurança.
 */
import { Cabecalho, Vazio } from '@/components/ui'
import { useAuth } from '@/auth/AuthContext'
import { useI18n } from '@/i18n'
import AbaUsuarios from '@/pages/admin/Usuarios'

export default function Membros() {
  const { L } = useI18n()
  const { usuario } = useAuth()

  if (!usuario?.permissoes.includes('admin_cadastro')) {
    return (
      <>
        <Cabecalho titulo={L('Gestão de membros', 'Member management')} />
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

  return (
    <>
      <Cabecalho
        titulo={L('Gestão de membros', 'Member management')}
        sub={L(
          'Quem entra na plataforma, com que papel e com que permissões. O papel define o padrão; a lista de permissões, quando preenchida, prevalece sobre ele.',
          'Who gets into the platform, with what role and permissions. The role sets the default; an explicit permission list overrides it.',
        )}
      />
      <AbaUsuarios />
    </>
  )
}
