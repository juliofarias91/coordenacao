/** O que fica entre a rota `/projetos/:projetoId/...` e a tela.
 *
 *  Duas responsabilidades, ambas coisas que ninguém quer repetir em nove telas:
 *  segurar a renderização até a lista de projetos chegar, e dar uma resposta
 *  honesta quando o id da URL não corresponde a nada.
 */
import { Link, Navigate, Outlet, useLocation, useParams } from 'react-router-dom'

import { Vazio } from '@/components/ui'
import { useI18n } from '@/i18n'
import { rotaProjeto, useProjeto } from '@/projeto/ProjetoContext'

export default function EscopoProjeto() {
  const { L } = useI18n()
  const { carregando, naoEncontrado } = useProjeto()

  if (carregando) return <p className="hint">{L('Carregando…', 'Loading…')}</p>

  if (naoEncontrado) {
    return (
      <>
        <Vazio
          titulo={L('Projeto não encontrado', 'Project not found')}
          texto={L(
            'Este projeto não existe, foi removido, ou pertence a outra organização. Verifique o link.',
            'This project does not exist, was removed, or belongs to another organization. Check the link.',
          )}
        />
        <p className="hint">
          <Link to="/">{L('Ver todos os projetos', 'See all projects')}</Link>
        </p>
      </>
    )
  }

  return <Outlet />
}

/** Link antigo (`/painel`, `/modelos/:id`) para o novo formato.
 *
 *  A plataforma já está publicada e as pessoas já salvaram links. Um 404 —
 *  ou o catch-all jogando tudo na home — perderia a tela pretendida sem
 *  dizer por quê. O destino é o ÚLTIMO PROJETO VISITADO, que é exatamente o
 *  que a URL antiga queria dizer: o link nunca carregou projeto nenhum, era o
 *  `localStorage` que respondia.
 */
export function RotaLegada({ tela }: { tela: string }) {
  const { L } = useI18n()
  const { referencia, carregando } = useProjeto()
  const { search, hash } = useLocation()
  const params = useParams()

  if (carregando) return <p className="hint">{L('Carregando…', 'Loading…')}</p>
  // Organização sem nenhum projeto: a home é a única tela que faz sentido, e é
  // ela que ensina a criar o primeiro.
  if (!referencia) return <Navigate to="/" replace />

  // `modelos/:modeloId` é a única rota legada com parâmetro próprio.
  const destino = tela.replace(/:(\w+)/g, (todo, nome: string) => params[nome] ?? todo)
  return <Navigate to={`${rotaProjeto(referencia.id, destino)}${search}${hash}`} replace />
}
