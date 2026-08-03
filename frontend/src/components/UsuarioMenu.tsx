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
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { useAuth } from '@/auth/AuthContext'
import { useI18n } from '@/i18n'

/** Ícone de item do menu. Todos no mesmo tamanho e na mesma tinta apagada: o
 *  ícone aqui é âncora de varredura, não informação — quem distingue os itens
 *  é o rótulo, e um deles em cor puxaria a leitura para si (regra 2). */
function Ico({ children }: { children: ReactNode }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

/** A sigla do avatar: PRIMEIRA LETRA DO NOME E DA ÚLTIMA PALAVRA dele —
 *  "Leonardo Donati" → LD. Era só a primeira letra, e numa organização inteira
 *  de "L" a inicial sozinha não distingue ninguém: o avatar existe para se
 *  reconhecer a própria conta de relance, e um "L" serve a Leonardo, Lucas e
 *  Letícia igualmente.
 *
 *  A ÚLTIMA palavra, não a segunda: "Leonardo de Souza Donati" dá LD, e não LD
 *  de "de" — partícula não é sobrenome. Quem tem um nome só fica com uma letra,
 *  o que é honesto: não há sobrenome de onde tirar a segunda.
 *
 *  Sem nome cadastrado, o login serve de fonte e é quebrado nos separadores que
 *  e-mail usa: `leonardo.donati@…` também dá LD. Sem isso o fallback devolvia a
 *  primeira letra do e-mail inteiro e nunca uma sigla de duas. */
function iniciais(nome: string | null, login: string): string {
  const cru = nome?.trim() || login.split('@')[0] || ''
  const partes = cru.split(/[\s._-]+/).filter(Boolean)
  const primeira = partes[0]?.[0] ?? ''
  const ultima = partes.length > 1 ? (partes[partes.length - 1]?.[0] ?? '') : ''
  return (primeira + ultima).toUpperCase() || '?'
}

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
  const inicial = iniciais(usuario.nome, usuario.login)
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
          {/* CABEÇALHO — identidade em três linhas: nome, login e papel.
              O papel era uma LINHA À PARTE ("Papel · <pílula>"), e saiu de lá:
              ele é atributo de quem está no cabeçalho, não um item de menu, e
              a linha própria punha uma pílula colorida na primeira coisa que o
              painel mostra — o oposto da regra 2. O login inteiro só aqui: na
              barra seria ruído, mas é o que responde "estou logado com qual
              conta?" para quem tem duas. */}
          <div className="usercab">
            <div className="userbox">
              <div className="av">{inicial}</div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="nm">{nome}</div>
                <div className="em">{usuario.login}</div>
                <div className="rl">{usuario.papel}</div>
              </div>
            </div>
          </div>

          {/* As duas portas que saem daqui, e só elas: o andar de cima da
              organização, e as configurações da própria conta. A sidebar
              responde "o que faço neste projeto"; a conta responde "quem sou
              eu e o que administro".
              A guarda real continua no `requer_permissao` de cada rota — o
              sumiço do item é só conveniência de navegação. */}
          <div className="usergrupo">
            {podeAdministrar && (
              <Link
                to="/admin"
                className="useritem"
                role="menuitem"
                onClick={() => setAberto(false)}
              >
                <Ico>
                  <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
                  <path d="m9 12 2 2 4-4" />
                </Ico>
                {L('Painel administrativo', 'Admin panel')}
              </Link>
            )}

            <Link
              to="/configuracoes"
              className="useritem"
              role="menuitem"
              onClick={() => setAberto(false)}
            >
              <Ico>
                <circle cx="12" cy="12" r="3" />
                <path d="M12 1v6M12 17v6M4.2 4.2l4.3 4.3M15.5 15.5l4.3 4.3M1 12h6M17 12h6M4.2 19.8l4.3-4.3M15.5 8.5l4.3-4.3" />
              </Ico>
              {L('Configurações', 'Settings')}
            </Link>
          </div>

          {/* Segundo bloco: o que MEXE no que já existe. A lixeira desfaz uma
              remoção e Sair encerra a sessão — nenhum dos dois é navegação de
              rotina, e é isso que o divisor separa. */}
          <div className="usergrupo">
            {podeAdministrar && (
              <Link
                to="/lixeira"
                className="useritem"
                role="menuitem"
                onClick={() => setAberto(false)}
              >
                <Ico>
                  <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6" />
                </Ico>
                {L('Lixeira', 'Trash')}
              </Link>
            )}

            <button
              type="button"
              className="useritem usersair"
              onClick={sair}
              role="menuitem"
            >
              <Ico>
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
              </Ico>
              {L('Sair', 'Exit')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
