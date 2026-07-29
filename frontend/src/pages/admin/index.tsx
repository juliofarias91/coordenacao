/** SP-106 · Administração.
 *
 *  O andar de cima da plataforma: a organização, seus clientes, seus projetos e
 *  o registro do que foi mexido. `Configurações do projeto` opera sobre um
 *  projeto; aqui se opera sobre a organização inteira — inclusive criando o
 *  projeto que aquela tela depois detalha.
 *
 *  A GESTÃO DE MEMBROS SAIU DAQUI em 29/07/2026 e virou `/membros`, no nível da
 *  Home. Não é da mesma natureza do resto: o que mora nesta tela se configura
 *  uma vez, e membro entra e sai o tempo todo. Uma porta só para cada coisa —
 *  manter a aba aqui daria dois caminhos para a mesma tela, e o segundo
 *  envelheceria sem ninguém notar.
 *
 *  A guarda de verdade é do backend (`requer_permissao("admin_cadastro")` em
 *  cada rota). Esta checagem só evita mostrar uma tela que responderia 403.
 */
import { useState } from 'react'

import { Cabecalho, Segmented, Vazio } from '@/components/ui'
import { useAuth } from '@/auth/AuthContext'
import { useI18n } from '@/i18n'
import AbaClientes from '@/pages/admin/Clientes'
import AbaOrganizacao from '@/pages/admin/Organizacao'
import AbaProjetos from '@/pages/admin/Projetos'
import AbaTrilha from '@/pages/admin/Trilha'

type Aba = 'organizacao' | 'clientes' | 'projetos' | 'trilha'

export default function Admin() {
  const { L } = useI18n()
  const { usuario } = useAuth()
  const [aba, setAba] = useState<Aba>('organizacao')

  // A ordem é a do funil: a organização contém clientes, que contêm projetos,
  // que as pessoas acessam. Clientes vem antes de Projetos porque é o que se
  // cadastra primeiro — um projeto já nasce apontando para um cliente.
  const abas: Array<[Aba, string]> = [
    ['organizacao', L('Organização', 'Organization')],
    ['clientes', L('Clientes', 'Clients')],
    ['projetos', L('Projetos', 'Projects')],
    // Por último: as outras três são onde se MEXE, esta é onde se confere o
    // que foi mexido.
    ['trilha', L('Log de atividade', 'Activity log')],
  ]

  if (!usuario?.permissoes.includes('admin_cadastro')) {
    return (
      <>
        <Cabecalho titulo={L('Administração', 'Administration')} />
        <Vazio
          titulo={L('Sem permissão', 'No permission')}
          texto={L(
            'Administrar a organização exige a permissão "Administrar cadastros". Peça a um administrador.',
            'Administering the organization requires the "Manage records" permission. Ask an administrator.',
          )}
        />
      </>
    )
  }

  return (
    <>
      <Cabecalho
        titulo={L('Administração', 'Administration')}
        sub={L(
          'A organização, seus clientes e seus projetos — o que se define uma vez e passa a valer para todo o resto. É aqui que um projeto novo nasce, antes de qualquer configuração de auditoria. Quem tem acesso se gerencia em Gestão de membros.',
          'The organization, its clients and its projects — what gets defined once and holds for everything else. This is where a new project is born, before any audit setup. Access is managed under Member management.',
        )}
      />

      <Segmented itens={abas} valor={aba} onChange={setAba} />

      {aba === 'organizacao' ? (
        <AbaOrganizacao />
      ) : aba === 'clientes' ? (
        <AbaClientes />
      ) : aba === 'projetos' ? (
        <AbaProjetos />
      ) : (
        <AbaTrilha />
      )}
    </>
  )
}
