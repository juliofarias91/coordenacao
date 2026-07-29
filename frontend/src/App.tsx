import { Navigate, Route, Routes } from 'react-router-dom'

import { useAuth } from '@/auth/AuthContext'
import { useI18n } from '@/i18n'
import Shell from '@/layout/Shell'
import Admin from '@/pages/admin'
import Apontamentos from '@/pages/Apontamentos'
import Configuracao from '@/pages/configuracao'
import Criterios from '@/pages/Criterios'
import Home from '@/pages/Home'
import Integracoes from '@/pages/Integracoes'
import Kpis from '@/pages/Kpis'
import Login from '@/pages/Login'
import ModeloView from '@/pages/Modelo'
import Painel from '@/pages/Painel'
import Placeholder from '@/pages/Placeholder'
import Portal from '@/pages/Portal'
import Relatorios from '@/pages/Relatorios'
import EscopoProjeto, { RotaLegada } from '@/projeto/EscopoProjeto'
import { ProjetoProvider } from '@/projeto/ProjetoContext'

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
 *  último projeto visitado — ver `RotaLegada`. */
const LEGADAS = [
  'painel',
  'kpis',
  'criterios',
  'apontamentos',
  'relatorios',
  'integracoes',
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

  if (!usuario) {
    return (
      <Routes>
        {/* O portal é público: o cliente não tem usuário na plataforma, e o
            token da URL é a credencial. Precisa vir antes do catch-all de
            login, senão o convite cai na tela de entrar. */}
        <Route path="/portal/:token" element={<Portal />} />
        <Route path="*" element={<Login />} />
      </Routes>
    )
  }

  return (
    <ProjetoProvider>
      <Routes>
        <Route path="/portal/:token" element={<Portal />} />
        <Route element={<Shell />}>
          {/* GLOBAL — vale para a organização inteira. A porta de entrada é a
              home: os projetos por cliente. Escolher o projeto é justamente o
              que ela faz; entrar direto no painel obrigava a adivinhar qual. */}
          <Route index element={<Home />} />
          <Route path="admin" element={<Admin />} />

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
            <Route path="apontamentos" element={<Apontamentos />} />
            <Route path="relatorios" element={<Relatorios />} />
            <Route path="integracoes" element={<Integracoes />} />
            <Route path="configuracao" element={<Configuracao />} />
            <Route path="criterios" element={<Criterios />} />
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
    </ProjetoProvider>
  )
}
