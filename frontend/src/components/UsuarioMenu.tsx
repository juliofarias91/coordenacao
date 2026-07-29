/** O usuário na topbar: avatar que abre nome, papel e a saída.
 *
 *  Vive como `.pillact` — a microinteração-assinatura do sistema. O avatar
 *  ocupa o lugar do ícone e o nome CRESCE no hover, exatamente como o sino e
 *  os seletores de tema e idioma. É o que permite pôr o usuário na barra sem
 *  gastar largura permanente com um nome que quase nunca se lê.
 *
 *  O que é ação destrutiva ("Sair") fica dentro do painel, nunca à mostra na
 *  barra: um clique errado ali derrubaria a sessão no meio de uma auditoria.
 */
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { useAuth } from '@/auth/AuthContext'
import { useI18n } from '@/i18n'

export default function UsuarioMenu() {
  const { usuario, sair } = useAuth()
  const { L } = useI18n()
  const [aberto, setAberto] = useState(false)
  const caixa = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!aberto) return

    function fora(e: MouseEvent) {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false)
    }
    // Esc fecha: o painel cobre conteúdo, e quem abriu sem querer procura o
    // teclado antes de procurar onde clicar.
    function tecla(e: KeyboardEvent) {
      if (e.key === 'Escape') setAberto(false)
    }
    document.addEventListener('mousedown', fora)
    document.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('mousedown', fora)
      document.removeEventListener('keydown', tecla)
    }
  }, [aberto])

  if (!usuario) return null

  const nome = usuario.nome ?? usuario.login
  const inicial = nome.slice(0, 1).toUpperCase()
  const podeAdministrar = usuario.permissoes.includes('admin_cadastro')

  return (
    <div className="usermenu" ref={caixa}>
      <button
        type="button"
        className={`pillact${aberto ? ' on' : ''}`}
        onClick={() => setAberto(!aberto)}
        title={nome}
        aria-label={L('Conta', 'Account')}
        aria-expanded={aberto}
        aria-haspopup="menu"
      >
        <span className="rot">{nome}</span>
        <span className="ico">
          <span className="av-mini">{inicial}</span>
        </span>
      </button>

      {aberto && (
        <div className="userpainel" role="menu">
          <div className="usercab">
            <div className="userbox">
              <div className="av">{inicial}</div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="nm">{nome}</div>
                {/* O login inteiro só aqui: na barra ele seria ruído, mas é o
                    que responde "estou logado com qual conta?". */}
                <div className="rl">{usuario.login}</div>
              </div>
            </div>
          </div>

          <div className="userlinha">
            <span className="mmeta">{L('Papel', 'Role')}</span>
            <span className="pill">{usuario.papel}</span>
          </div>

          {/* As duas portas que saem daqui, e só elas: o andar de cima da
              organização, e as configurações da própria conta. A sidebar
              responde "o que faço neste projeto"; a conta responde "quem sou
              eu e o que administro".
              A guarda real continua no `requer_permissao` de cada rota — o
              sumiço do item é só conveniência de navegação. */}
          {podeAdministrar && (
            <Link
              to="/admin"
              className="useritem"
              role="menuitem"
              onClick={() => setAberto(false)}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              {L('Painel administrativo', 'Admin panel')}
            </Link>
          )}

          <Link
            to="/configuracoes"
            className="useritem"
            role="menuitem"
            onClick={() => setAberto(false)}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M12 1v6M12 17v6M4.2 4.2l4.3 4.3M15.5 15.5l4.3 4.3M1 12h6M17 12h6M4.2 19.8l4.3-4.3M15.5 8.5l4.3-4.3" />
            </svg>
            {L('Configurações', 'Settings')}
          </Link>

          <button type="button" className="usersair" onClick={sair} role="menuitem">
            {L('Sair', 'Exit')}
          </button>
        </div>
      )}
    </div>
  )
}
