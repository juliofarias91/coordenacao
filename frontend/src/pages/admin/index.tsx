/** SP-106 · Administração.
 *
 *  O andar de cima da plataforma: a organização, os projetos e as pessoas.
 *  `Configuração` opera sobre o projeto corrente; aqui se opera sobre a
 *  organização inteira — inclusive criando o projeto que a Configuração
 *  depois detalha.
 *
 *  A guarda de verdade é do backend (`requer_permissao("admin_cadastro")` em
 *  cada rota). Esta checagem só evita mostrar uma tela que responderia 403.
 */
import { useState } from 'react'

import { Cabecalho, Segmented, Vazio } from '@/components/ui'
import { useAuth } from '@/auth/AuthContext'
import { useI18n } from '@/i18n'
import AbaOrganizacao from '@/pages/admin/Organizacao'
import AbaProjetos from '@/pages/admin/Projetos'
import AbaUsuarios from '@/pages/admin/Usuarios'

type Aba = 'organizacao' | 'projetos' | 'usuarios'

export default function Admin() {
  const { L } = useI18n()
  const { usuario } = useAuth()
  const [aba, setAba] = useState<Aba>('organizacao')

  const abas: Array<[Aba, string]> = [
    ['organizacao', L('Organização', 'Organization')],
    ['projetos', L('Projetos', 'Projects')],
    ['usuarios', L('Usuários & acessos', 'Users & access')],
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
          'A organização, seus projetos e quem tem acesso a eles. É aqui que um projeto novo nasce e que uma pessoa ganha ou perde acesso — antes de qualquer configuração de auditoria.',
          'The organization, its projects and who can reach them. This is where a new project is born and where a person gains or loses access — before any audit setup.',
        )}
      />

      <Segmented itens={abas} valor={aba} onChange={setAba} />

      {aba === 'organizacao' ? (
        <AbaOrganizacao />
      ) : aba === 'projetos' ? (
        <AbaProjetos />
      ) : (
        <AbaUsuarios />
      )}
    </>
  )
}
