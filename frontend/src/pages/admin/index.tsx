/** SP-106 · Painel administrativo — uma ÁREA, não uma tela.
 *
 *  Troca a sidebar inteira, pelo mesmo mecanismo do escopo de projeto, e tem um
 *  caminho de volta no topo. Era uma tela só com abas até 29/07/2026; aba serve
 *  para alternar entre visões do MESMO assunto, e aqui são assuntos distintos —
 *  quem administra usuários não está a meio caminho de conferir o log. A fileira
 *  de abas ainda ia crescer a cada item novo até não caber na linha.
 *
 *  Este arquivo virou só a guarda de permissão e o `Outlet`: cada aba de antes é
 *  agora uma rota própria, e o título de cada uma vive na própria tela.
 *
 *  A guarda de verdade é do backend (`requer_permissao("admin_cadastro")` em
 *  cada rota). Esta checagem só evita mostrar uma tela que responderia 403.
 */
import { Outlet } from 'react-router-dom'

import { Cabecalho, Vazio } from '@/components/ui'
import { useAuth } from '@/auth/AuthContext'
import { useI18n } from '@/i18n'

export default function Admin() {
  const { L } = useI18n()
  const { usuario } = useAuth()

  if (!usuario?.permissoes.includes('admin_cadastro')) {
    return (
      <>
        <Cabecalho titulo={L('Painel administrativo', 'Admin panel')} />
        <Vazio
          titulo={L('Sem permissão', 'No permission')}
          texto={L(
            'O painel administrativo exige a permissão "Administrar cadastros". Peça a um administrador.',
            'The admin panel requires the "Manage records" permission. Ask an administrator.',
          )}
        />
      </>
    )
  }

  return <Outlet />
}
