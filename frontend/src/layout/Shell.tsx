import { NavLink, Outlet } from 'react-router-dom'

import { useAuth } from '@/auth/AuthContext'
import Sino from '@/components/Sino'
import { useI18n } from '@/i18n'
import { ITENS_NAV } from '@/layout/nav'
import { useProjeto } from '@/projeto/ProjetoContext'
import { useTheme } from '@/theme/ThemeProvider'

function Icone({ path }: { path: string }) {
  return (
    <svg
      className="ic"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  )
}

export default function Shell() {
  const { usuario, sair } = useAuth()
  const { lang, setLang, L } = useI18n()
  const { theme, setTheme } = useTheme()
  const { projeto, projetos, selecionar } = useProjeto()

  return (
    <div className="app">
      <aside>
        <div className="brand">
          <div className="mk">SP</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <b>SPBIM</b>
            <span>
              {L('Central de Auditoria', 'Audit Center')}
              {projeto ? ` · ${projeto.codigo}` : ''}
            </span>
          </div>
          <Sino />
        </div>

        {projetos.length > 1 && (
          <select
            className="projsel"
            value={projeto?.id ?? ''}
            onChange={(e) => selecionar(e.target.value)}
            aria-label={L('Projeto', 'Project')}
          >
            {projetos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.codigo} — {p.nome}
              </option>
            ))}
          </select>
        )}

        <nav>
          {ITENS_NAV.filter(
            // `permissoes` do /auth/me já vem resolvido: o backend aplica o
            // padrão do papel quando o usuário não tem lista própria.
            (item) => !item.exigePermissao || usuario?.permissoes.includes(item.exigePermissao),
          ).map((item) => (
            <NavLink
              key={item.rota}
              to={item.rota}
              className={({ isActive }) => (isActive ? 'on' : '')}
            >
              <Icone path={item.path} />
              {L(item.pt, item.en)}
            </NavLink>
          ))}
        </nav>

        <div className="side-foot">
          {usuario && (
            <div className="userbox">
              <div className="av">{(usuario.nome ?? usuario.login).slice(0, 1).toUpperCase()}</div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="nm">{usuario.nome ?? usuario.login}</div>
                <div className="rl">{usuario.papel}</div>
              </div>
              <button className="linkbtn" onClick={sair}>
                {L('Sair', 'Exit')}
              </button>
            </div>
          )}

          <div className="switch">
            {(['pt', 'en'] as const).map((l) => (
              <button key={l} className={lang === l ? 'on' : ''} onClick={() => setLang(l)}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="switch">
            {(
              [
                ['light', '☀'],
                ['dark', '☾'],
              ] as const
            ).map(([k, ic]) => (
              <button
                key={k}
                className={theme === k ? 'on' : ''}
                onClick={() => setTheme(k)}
                title={k === 'light' ? L('Claro', 'Light') : L('Escuro', 'Dark')}
              >
                {ic}
              </button>
            ))}
          </div>

          <div className="foot-t">
            {L('Fase 0 · fundação', 'Phase 0 · foundation')}
            <br />
            {L('controle → execução → relatório', 'control → execution → report')}
          </div>
        </div>
      </aside>

      <main>
        <Outlet />
      </main>
    </div>
  )
}
