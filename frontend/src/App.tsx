import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

import { useAuth } from '@/auth/AuthContext'
import { useI18n } from '@/i18n'
import Shell from '@/layout/Shell'
import Admin from '@/pages/admin'
import Apontamentos from '@/pages/Apontamentos'
import Auditoria from '@/pages/Auditoria'
import BimMandate from '@/pages/BimMandate'
import Configuracao from '@/pages/configuracao'
import {
  CfgCliente,
  CfgCores,
  CfgDisciplinas,
  CfgNomenclaturas,
  CfgProjetistas,
  CfgProjeto,
} from '@/pages/configuracao/paginas'
import Configuracoes from '@/pages/Configuracoes'
import Criterios from '@/pages/Criterios'
import Home from '@/pages/Home'
import Integracoes from '@/pages/Integracoes'
import Kpis from '@/pages/Kpis'
import Login from '@/pages/Login'
import {
  PaginaClientes,
  PaginaGerenciarMembros,
  PaginaLogs,
  PaginaOrganizacao,
  PaginaProjetos,
  PaginaReportes,
  PaginaUsuarios,
} from '@/pages/admin/paginas'
import KpisGerais from '@/pages/KpisGerais'
import Lixeira from '@/pages/Lixeira'
import MembrosProjeto from '@/pages/MembrosProjeto'
import ModeloView from '@/pages/Modelo'
import Notificacoes from '@/pages/Notificacoes'
import Painel from '@/pages/Painel'
import Peb from '@/pages/Peb'
import Placeholder from '@/pages/Placeholder'
import Portal from '@/pages/Portal'
import Relatorios from '@/pages/Relatorios'
import EscopoProjeto, { RotaLegada } from '@/projeto/EscopoProjeto'
import { ProjetoProvider } from '@/projeto/ProjetoContext'

/** A política entra por LAZY IMPORT, como as abas do auditer.
 *
 *  É a única tela de texto corrido da plataforma — alguns milhares de palavras
 *  em dois idiomas — e é visitada uma vez, ou nenhuma. Estaticamente, esse
 *  texto viajaria no chunk principal em toda abertura do painel. */
const Privacidade = lazy(() => import('@/pages/Privacidade'))

/** Telas que ainda não têm conteúdo. Ganham corpo nas fases indicadas.
 *
 *  VAZIO desde que o PEB ganhou tela — não havia mais nenhuma. O mecanismo
 *  fica: uma tela nova entra aqui primeiro, dizendo o que vai ser, em vez de
 *  virar um item de menu que leva a lugar nenhum. */
const PENDENTES: Array<{
  rota: string
  titulo: [string, string]
  descricao: [string, string]
  fase: number
}> = []

/** As URLs de antes de 29/07/2026, quando toda tela era global e o projeto
 *  vivia no `localStorage`. Continuam funcionando, redirecionando para o
 *  último projeto visitado — ver `RotaLegada`.
 *
 *  `apontamentos` e `integracoes` NÃO estão aqui de propósito: as duas
 *  passaram a ser globais de verdade, então a URL antiga já é a definitiva e
 *  casa com a rota real acima. Redirecioná-las para dentro de um projeto seria
 *  desfazer a mudança. */
const LEGADAS = [
  'kpis',
  'criterios',
  'relatorios',
  'configuracao',
  'peb',
  'modelos/:modeloId',
  // `painel` virou `modelos` quando a tela passou a se chamar pelo que mostra.
  // A URL antiga continua chegando à tela certa: `RotaLegada` recebe o destino
  // NOVO, e o `path` da rota é que guarda o endereço velho.
  { de: 'painel', para: 'modelos' },
]

export default function App() {
  const { usuario, carregando } = useAuth()
  const { L } = useI18n()

  if (carregando) {
    return (
      <div className="loginwrap">
        <div className="hint">{L('Carregando…', 'Loading…')}</div>
      </div>
    )
  }

  const carregandoTela = <div className="hint">{L('Carregando…', 'Loading…')}</div>

  if (!usuario) {
    return (
      <Suspense fallback={carregandoTela}>
        <Routes>
          {/* O portal é público: o cliente não tem usuário na plataforma, e o
              token da URL é a credencial. Precisa vir antes do catch-all de
              login, senão o convite cai na tela de entrar. */}
          <Route path="/portal/:token" element={<Portal />} />
          {/* A política também: ela informa sobre o tratamento de dados, e uma
              política que só se lê depois de entrar chega tarde demais. */}
          <Route path="/privacidade" element={<Privacidade />} />
          <Route path="*" element={<Login />} />
        </Routes>
      </Suspense>
    )
  }

  return (
    <ProjetoProvider>
      <Suspense fallback={carregandoTela}>
        <Routes>
          <Route path="/portal/:token" element={<Portal />} />
          <Route element={<Shell />}>
            {/* GLOBAL — vale para a organização inteira. A porta de entrada é
                a home: os projetos por cliente. Escolher o projeto é
                justamente o que ela faz; entrar direto no painel obrigava a
                adivinhar qual. */}
            <Route index element={<Home />} />
            {/* Apontamentos e Integrações vivem AQUI, não dentro de um
                projeto. Os dois já eram globais no backend — o de apontamentos
                sempre aceitou listar sem `projeto_id`, e o de integrações
                sequer tem projeto. Estavam no menu errado desde o começo. */}
            <Route path="apontamentos" element={<Apontamentos />} />
            {/* KPIs de TODOS os projetos. O `/projetos/:id/kpis` continua
                existindo e é o do projeto — este responde outra pergunta. */}
            <Route path="kpis" element={<KpisGerais />} />
            <Route path="integracoes" element={<Integracoes />} />

            {/* PAINEL ADMINISTRATIVO — a terceira área com sidebar própria.
                Cada aba de antes virou rota; `Admin` ficou só com a guarda de
                permissão e o `Outlet`. */}
            <Route path="admin" element={<Admin />}>
              <Route index element={<Navigate to="usuarios" replace />} />
              <Route path="usuarios" element={<PaginaUsuarios />} />
              <Route path="logs" element={<PaginaLogs />} />
              <Route path="reportes" element={<PaginaReportes />} />
              <Route path="organizacao" element={<PaginaOrganizacao />} />
              <Route path="clientes" element={<PaginaClientes />} />
              <Route path="projetos" element={<PaginaProjetos />} />
            </Route>
            {/* A MESMA TELA de `/admin/usuarios`, por duas portas: aqui, no
                grupo Gestão da Home, para quem coordena; e lá, junto de
                organização, clientes e logs, para quem administra o tenant.
                Uma implementação só — o que muda é a barra lateral em volta. */}
            <Route path="membros" element={<PaginaGerenciarMembros />} />
            {/* Da CONTA, não de um projeto. `configuracoes` (plural) é a conta;
                `configuracao` (singular), dentro de um projeto, é o projeto.
                Nomes próximos, escopos distintos — o plural marca a diferença
                e a URL diz qual é qual. */}
            <Route path="configuracoes" element={<Configuracoes />} />
            {/* A lixeira é global: o que foi removido pode ter vindo de
                qualquer projeto, e uma lixeira por projeto obrigaria a
                procurar em cada um. */}
            <Route path="lixeira" element={<Lixeira />} />
            {/* Notificação é do usuário e do papel dele, não de um projeto —
                por isso fica aqui e não sob `/projetos/:projetoId`. */}
            <Route path="notificacoes" element={<Notificacoes />} />
            {/* A política também entra aqui, além da árvore pública: quem já
                entrou continua com a barra e o menu ao lê-la, em vez de cair
                numa página solta sem volta. */}
            <Route path="privacidade" element={<Privacidade />} />

            {/* POR PROJETO — o projeto está na URL, não no `localStorage`. É o
                que faz `/projetos/<id>/modelos` significar a mesma coisa para
                todo mundo e virar um link que se manda a um colega. */}
            <Route path="projetos/:projetoId" element={<EscopoProjeto />}>
              {/* Sem tela, o projeto abre nos modelos — é o destino de quem
                  escolhe um projeto na home. */}
              <Route index element={<Navigate to="modelos" replace />} />
              {/* A lista e o detalhe de um modelo, aninhados como devem ser.
                  A lista chamava-se `painel`, herança do nome da planilha que
                  ela substitui; o endereço antigo redireciona logo abaixo. */}
              <Route path="modelos" element={<Painel />} />
              <Route path="modelos/:modeloId" element={<ModeloView />} />
              <Route path="painel" element={<Navigate to="../modelos" replace />} />
              <Route path="kpis" element={<Kpis />} />
              {/* Os seis recortes de auditoria são A MESMA TELA com outro
                  `checklist`. O backend já servia assim; faltava a porta. */}
              <Route path="auditoria/:checklist" element={<Auditoria />} />
              <Route path="auditoria" element={<Navigate to="geral" replace />} />
              <Route path="relatorios" element={<Relatorios />} />
              {/* CONFIGURAÇÃO — a quarta área com sidebar própria. Eram sete
                  abas numa linha só; cada uma virou rota, e `Configuracao`
                  ficou com a guarda de projeto e o `Outlet`. */}
              <Route path="configuracao" element={<Configuracao />}>
                <Route index element={<Navigate to="projeto" replace />} />
                <Route path="projeto" element={<CfgProjeto />} />
                <Route path="disciplinas" element={<CfgDisciplinas />} />
                <Route path="projetistas" element={<CfgProjetistas />} />
                <Route path="nomenclaturas" element={<CfgNomenclaturas />} />
                <Route path="cores" element={<CfgCores />} />
                <Route path="cliente" element={<CfgCliente />} />
              </Route>
              <Route path="criterios" element={<Criterios />} />
              {/* Quem participa DESTE projeto — outra pergunta que `/membros`,
                  que é o cadastro de contas da organização. */}
              <Route path="membros" element={<MembrosProjeto />} />
              <Route path="peb" element={<Peb />} />
              <Route path="mandate" element={<BimMandate />} />
              {PENDENTES.map((t) => (
                <Route
                  key={t.rota}
                  path={t.rota}
                  element={<Placeholder titulo={t.titulo} descricao={t.descricao} fase={t.fase} />}
                />
              ))}
            </Route>

            {/* Os links salvos antes da mudança. Precisam vir DEPOIS das rotas
                reais e antes do catch-all. */}
            {LEGADAS.map((entrada) => {
              const de = typeof entrada === 'string' ? entrada : entrada.de
              const para = typeof entrada === 'string' ? entrada : entrada.para
              return <Route key={de} path={de} element={<RotaLegada tela={para} />} />
            })}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </ProjetoProvider>
  )
}
