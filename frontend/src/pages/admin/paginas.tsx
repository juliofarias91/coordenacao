/** O que sobrou dos "cabeçalhos das telas do painel administrativo".
 *
 *  Este arquivo tinha SETE componentes, e cada um fazia uma coisa só: pôr um
 *  `<Cabecalho>` acima da aba correspondente. Os títulos de página saíram em
 *  30/07/2026 (ver `components/ui.tsx`), e com isso seis dos sete viraram
 *  invólucros que só repassavam o filho — indireção sem conteúdo, que é pior do
 *  que a duplicação que ela evitava. As rotas passaram a apontar direto para as
 *  abas em `App.tsx`.
 *
 *  O SÉTIMO FICOU, porque nunca foi só cabeçalho: `PaginaGerenciarMembros`
 *  guarda a permissão. A porta do `/admin` passa pelo componente `Admin`, que
 *  confere `admin_cadastro` e entrega o `Outlet`; a da Home não passa por
 *  ninguém. Sem esta guarda, `/membros` seria aberta a qualquer um que digitasse
 *  a URL — e o 403 só apareceria depois, vindo da API, em forma de erro em vez
 *  de recusa.
 *
 *  ELA DEIXOU DE SER A MESMA TELA QUE `/admin/usuarios` (31/07/2026). As duas
 *  eram a mesma por duas portas, e a confusão era de assunto: `/admin/usuarios`
 *  é o cadastro de CONTAS — quem existe na organização, com que papel e que
 *  permissões. `/membros` passou a ser o dos VÍNCULOS — quem está em qual
 *  projeto, em que equipe, com que papel nele. São perguntas diferentes, e a
 *  segunda não tinha tela.
 */
import { useAuth } from '@/auth/AuthContext'
import { Vazio } from '@/components/ui'
import { useI18n } from '@/i18n'
import Membros from '@/pages/Membros'

export function PaginaGerenciarMembros() {
  const { L } = useI18n()
  const { usuario } = useAuth()

  if (!usuario?.permissoes.includes('admin_cadastro')) {
    return (
      <Vazio
        titulo={L('Sem permissão', 'No permission')}
        texto={L(
          'Gerenciar membros exige a permissão "Administrar cadastros". Peça a um administrador.',
          'Managing members requires the "Manage records" permission. Ask an administrator.',
        )}
      />
    )
  }

  return <Membros />
}
