import { Navigate, Route, Routes } from 'react-router-dom'

import { useAuth } from '@/auth/AuthContext'
import { useI18n } from '@/i18n'
import Shell from '@/layout/Shell'
import Apontamentos from '@/pages/Apontamentos'
import Configuracao from '@/pages/configuracao'
import Criterios from '@/pages/Criterios'
import Integracoes from '@/pages/Integracoes'
import Kpis from '@/pages/Kpis'
import Login from '@/pages/Login'
import ModeloView from '@/pages/Modelo'
import Painel from '@/pages/Painel'
import Placeholder from '@/pages/Placeholder'
import Portal from '@/pages/Portal'
import Relatorios from '@/pages/Relatorios'
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
          {/* Com a Fase 2 no ar, o painel de controle volta a ser a porta de entrada. */}
          <Route index element={<Navigate to="/painel" replace />} />
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
          <Route path="*" element={<Navigate to="/painel" replace />} />
        </Route>
      </Routes>
    </ProjetoProvider>
  )
}
