import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

import { useAuth } from '@/auth/AuthContext'
import { useI18n } from '@/i18n'
import Shell from '@/layout/Shell'
import Admin from '@/pages/admin'
import Apontamentos from '@/pages/Apontamentos'
import Auditoria from '@/pages/Auditoria'
import Configuracao from '@/pages/configuracao'
import Configuracoes from '@/pages/Configuracoes'
import Criterios from '@/pages/Criterios'
import Home from '@/pages/Home'
import Integracoes from '@/pages/Integracoes'
import Kpis from '@/pages/Kpis'
import Login from '@/pages/Login'
import {
  PaginaClientes,
  PaginaLogs,
  PaginaOrganizacao,
  PaginaProjetos,
  PaginaUsuarios,
} from '@/pages/admin/paginas'
import KpisGerais from '@/pages/KpisGerais'
import MembrosProjeto from '@/pages/MembrosProjeto'
import ModeloView from '@/pages/Modelo'
import Notificacoes from '@/pages/Notificacoes'
import Painel from '@/pages/Painel'
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

/** Telas que ainda não têm conteúdo. Ganham corpo nas fases indicadas. */
const PENDENTES: Array<{
  rota: string
  titulo: [string, string]
  descricao: [string, string]
  fase: number
}> = [
  {
    rota: 'peb',
    titulo: ['PEB · diretrizes', 'BEP · guidelines'],
    descricao: [
      'Documentos normativos que originam os critérios (BEP, A5.37, BIM Forum).',
      'Normative documents the criteria come from (BEP, A5.37, BIM Forum).',
    ],
    fase: 1,
  },
]

/** As URLs de antes de 29/07/2026, quando toda tela era global e o projeto
 *  vivia no `localStorage`. Continuam funcionando, redirecionando para o
 *  último projeto visitado — ver `RotaLegada`.
 *
 *  `apontamentos` e `integracoes` NÃO estão aqui de propósito: as duas
 *  passaram a ser globais de verdade, então a URL antiga já é a definitiva e
 *  casa com a rota real acima. Redirecioná-las para dentro de um projeto seria
 *  desfazer a mudança. */
const LEGADAS = [
  'painel',
  'kpis',
  'criterios',
  'relatorios',
  'configuracao',
  'peb',
  'modelos/:modeloId',
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
              <Route path="organizacao" element={<PaginaOrganizacao />} />
              <Route path="clientes" element={<PaginaClientes />} />
              <Route path="projetos" element={<PaginaProjetos />} />
            </Route>
            {/* O antigo item de Home apontava para cá; agora mora no painel. */}
            <Route path="membros" element={<Navigate to="/admin/usuarios" replace />} />
            {/* Da CONTA, não de um projeto. `configuracoes` (plural) é a conta;
                `configuracao` (singular), dentro de um projeto, é o projeto.
                Nomes próximos, escopos distintos — o plural marca a diferença
                e a URL diz qual é qual. */}
            <Route path="configuracoes" element={<Configuracoes />} />
            {/* Notificação é do usuário e do papel dele, não de um projeto —
                por isso fica aqui e não sob `/projetos/:projetoId`. */}
            <Route path="notificacoes" element={<Notificacoes />} />
            {/* A política também entra aqui, além da árvore pública: quem já
                entrou continua com a barra e o menu ao lê-la, em vez de cair
                numa página solta sem volta. */}
            <Route path="privacidade" element={<Privacidade />} />

            {/* POR PROJETO — o projeto está na URL, não no `localStorage`. É o
                que faz `/projetos/<id>/painel` significar a mesma coisa para
                todo mundo e virar um link que se manda a um colega. */}
            <Route path="projetos/:projetoId" element={<EscopoProjeto />}>
              {/* Sem tela, o projeto abre no painel — é o destino de quem
                  escolhe um projeto na home. */}
              <Route index element={<Navigate to="painel" replace />} />
              <Route path="painel" element={<Painel />} />
              <Route path="modelos/:modeloId" element={<ModeloView />} />
              <Route path="kpis" element={<Kpis />} />
              {/* Os seis recortes de auditoria são A MESMA TELA com outro
                  `checklist`. O backend já servia assim; faltava a porta. */}
              <Route path="auditoria/:checklist" element={<Auditoria />} />
              <Route path="auditoria" element={<Navigate to="geral" replace />} />
              <Route path="relatorios" element={<Relatorios />} />
              <Route path="configuracao" element={<Configuracao />} />
              <Route path="criterios" element={<Criterios />} />
              {/* Quem participa DESTE projeto — outra pergunta que `/membros`,
                  que é o cadastro de contas da organização. */}
              <Route path="membros" element={<MembrosProjeto />} />
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
            {LEGADAS.map((tela) => (
              <Route key={tela} path={tela} element={<RotaLegada tela={tela} />} />
            ))}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </ProjetoProvider>
  )
}
