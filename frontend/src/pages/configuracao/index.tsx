/** Fase 1 · Configuração do projeto — uma ÁREA com sidebar própria.
 *
 *  Eram sete abas numa linha só. Aba serve para alternar entre visões do MESMO
 *  assunto; aqui são sete assuntos distintos — quem cadastra projetista não
 *  está a meio caminho de escolher cores —, e sete rótulos como "Nomenclaturas
 *  & padrões" não cabem lado a lado sem quebrar em duas linhas.
 *
 *  É a QUARTA área contextual da plataforma, pelo mesmo mecanismo das outras
 *  (`layout/nav.ts`): entra-se nela e a barra troca inteira, com o caminho de
 *  volta no topo. Como no painel administrativo, este arquivo ficou só com a
 *  guarda e o `Outlet` — cada aba virou rota, e o título de cada uma vive na
 *  própria tela.
 *
 *  A aba "Usuários & acessos" SAIU: o CRUD de usuário é de nível de
 *  organização e já tem duas portas (Home › Gerenciar membros e o painel
 *  administrativo). Uma terceira, dentro da configuração de UM projeto,
 *  sugeria que o cadastro fosse do projeto — e não é.
 */
import { Outlet } from 'react-router-dom'

import { Vazio } from '@/components/ui'
import { useI18n } from '@/i18n'
import { useProjeto } from '@/projeto/ProjetoContext'

export default function Configuracao() {
  const { L } = useI18n()
  const { projeto, carregando } = useProjeto()

  if (carregando) return <p className="hint">{L('Carregando…', 'Loading…')}</p>

  if (!projeto) {
    return (
      <Vazio
        titulo={L('Nenhum projeto nesta organização', 'No project in this organization')}
        texto={L(
          'Crie o primeiro no Painel administrativo › Projetos.',
          'Create the first one under Admin panel › Projects.',
        )}
      />
    )
  }

  return <Outlet />
}
