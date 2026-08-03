/** SP-103 · Usuários & acessos. */
import { useCallback, useEffect, useState } from 'react'

import { iniciais } from '@/components/TabelaMembros'
import { Campo, Chips, Editor, Erro } from '@/components/ui'
import { useI18n } from '@/i18n'
import { ApiError, api } from '@/lib/api'
import { MIN_SENHA, problemaDaSenha } from '@/lib/senha'
import type { Empresa, Permissao, UsuarioCadastro } from '@/lib/types'

const PAPEIS = [
  'admin',
  'coordenador',
  'auditor',
  'revisor',
  'fornecedor',
  'leitor',
  'cliente',
] as const

const ROTULO_PERMISSAO: Record<string, [string, string]> = {
  ver_painel: ['Ver painel', 'View panel'],
  executar: ['Executar auditoria', 'Run audit'],
  editar_biblioteca: ['Editar biblioteca', 'Edit library'],
  publicar: ['Publicar round', 'Publish round'],
  gerar_relatorio: ['Gerar relatório', 'Generate report'],
  ver_relatorios: ['Ver relatórios', 'View reports'],
  admin_cadastro: ['Administrar cadastros', 'Manage records'],
}

type Rascunho = {
  id?: string
  login: string
  nome: string
  senha: string
  papel: (typeof PAPEIS)[number]
  empresa_id: string
  permissoes: string[]
  status: 'ativo' | 'inativo'
}

const VAZIO: Rascunho = {
  login: '',
  nome: '',
  senha: '',
  papel: 'leitor',
  empresa_id: '',
  permissoes: [],
  status: 'ativo',
}

export default function AbaUsuarios({
  novoEm,
}: {
  /** UM CONTADOR, não um booleano. Quando ele muda, abre o editor em branco — e
   *  é assim que a tela de Gerenciar membros põe o "+" no cabeçalho do PAINEL,
   *  como no VDCity, em vez de deixá-lo solto acima da tabela.
   *
   *  Contador porque a ação se repete: com booleano, fechar o editor e clicar de
   *  novo não mudaria a prop e nada aconteceria. Ausente (`undefined`), a tela
   *  desenha o próprio botão — é como ela funciona em `/admin/usuarios`, onde não
   *  há painel para hospedá-lo. */
  novoEm?: number
} = {}) {
  const { L } = useI18n()
  const [usuarios, setUsuarios] = useState<UsuarioCadastro[]>([])
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [permissoes, setPermissoes] = useState<Permissao[]>([])
  const [rascunho, setRascunho] = useState<Rascunho | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  /** O link recém-gerado, por usuário. Some ao recarregar a lista: o token só
   *  volta UMA vez do servidor, e guardá-lo além disso seria manter uma
   *  credencial viva na memória da aba sem motivo. */
  const [links, setLinks] = useState<Record<string, string>>({})
  const [copiado, setCopiado] = useState<string | null>(null)
  /** CARREGANDO COMEÇA EM `true`, e isso não é detalhe. Sem ele, os primeiros
   *  segundos — que contra um banco remoto são vários — mostram a tabela vazia,
   *  e a tabela vazia AFIRMA "nenhuma conta ainda". Uma tela que mente enquanto
   *  carrega é pior do que uma que demora: manda a pessoa criar uma conta que já
   *  existe. Enquanto era um `<tbody>` sem linhas ninguém notava; passou a notar
   *  no dia em que o estado vazio ganhou texto. */
  const [carregando, setCarregando] = useState(true)

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const [u, e, p] = await Promise.all([
        api.usuarios.listar(),
        api.empresas.listar(),
        api.usuarios.permissoes(),
      ])
      setUsuarios(u.itens)
      setEmpresas(e.itens)
      setPermissoes(p)
    } catch (e) {
      // SEM `catch`, uma das três falhando rejeitava o `Promise.all` inteiro e a
      // lista ficava vazia em silêncio — indistinguível de "não há ninguém".
      setErro(e instanceof ApiError ? e.message : String(e))
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  // O "+" do painel pediu um editor novo. `novoEm` só é `undefined` quando
  // ninguém está controlando isso de fora, e aí este efeito não faz nada.
  useEffect(() => {
    if (novoEm) setRascunho({ ...VAZIO })
  }, [novoEm])

  async function salvar() {
    if (!rascunho) return
    setErro(null)

    // Senha vazia é intencional aqui — significa "só SSO" no cadastro e "manter
    // a atual" na edição. Só o que foi digitado é validado, e sem confirmação:
    // isto define a senha de OUTRA pessoa, que vai trocá-la de todo modo.
    if (rascunho.senha) {
      const problema = problemaDaSenha(rascunho.senha)
      if (problema) {
        setErro(L(...problema))
        return
      }
    }

    setSalvando(true)
    const base = {
      nome: rascunho.nome || null,
      papel: rascunho.papel,
      empresa_id: rascunho.empresa_id || null,
      permissoes: rascunho.permissoes,
      status: rascunho.status,
    }
    try {
      if (rascunho.id) {
        await api.usuarios.atualizar(rascunho.id, base)
        if (rascunho.senha) await api.usuarios.definirSenha(rascunho.id, rascunho.senha)
      } else {
        await api.usuarios.criar({
          ...base,
          login: rascunho.login,
          // Sem senha = usuário que só entra por SSO.
          senha: rascunho.senha || null,
        })
      }
      setRascunho(null)
      await carregar()
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : String(e))
    } finally {
      setSalvando(false)
    }
  }

  const nomeEmpresa = (id: string | null) => empresas.find((e) => e.id === id)?.nome ?? '—'

  /** Gera o link de definição de senha e copia na hora.
   *
   *  É O CAMINHO RECOMENDADO para dar acesso a alguém, e não o campo de senha do
   *  editor: ali quem administra fica sabendo a senha da pessoa e a manda por
   *  mensagem. Aqui, não — a pessoa escolhe a própria, e o link vale uma vez.
   *
   *  Copia junto porque o link SÓ SERVE copiado, e o token não volta do servidor
   *  uma segunda vez: exigir um segundo clique seria pedir duas ações para uma
   *  intenção, com a chance de perder o token no meio.
   */
  async function gerarLink(u: UsuarioCadastro) {
    setErro(null)
    try {
      const criado = await api.usuarios.gerarConvite(u.id)
      const url = `${window.location.origin}${criado.caminho}`
      setLinks((atuais) => ({ ...atuais, [u.id]: url }))
      await navigator.clipboard.writeText(url)
      setCopiado(u.id)
      setTimeout(() => setCopiado(null), 2500)
    } catch (e) {
      // Sem área de transferência (http, ou o navegador negou), o link fica
      // visível na linha para copiar à mão — por isso ele entra no estado
      // ANTES da tentativa de cópia.
      setErro(e instanceof ApiError ? e.message : String(e))
    }
  }

  return (
    <>
      {/* O BOTÃO SÓ APARECE QUANDO NINGUÉM O HOSPEDA. Em `/admin/usuarios` não há
          painel lateral, então ele mora aqui; em Gerenciar membros ele vive no
          cabeçalho do painel, ao lado da busca, e desenhá-lo nos dois lugares
          daria dois "+" na mesma tela, em cantos diferentes.
          `.pillact` e não `.btn pri`: um retângulo azul sólido acima de uma
          tabela era o elemento mais pesado da tela, e o que se faz aqui quase
          sempre é LER a lista. */}
      {novoEm === undefined && (
        <div className="acoes">
          <button
            type="button"
            className="pillact pgacao"
            onClick={() => setRascunho({ ...VAZIO })}
            title={L('Novo usuário', 'New user')}
            aria-label={L('Novo usuário', 'New user')}
          >
            <span className="ico">
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
                <path d="M12 5v14M5 12h14" />
              </svg>
            </span>
            <span className="rot">{L('Novo usuário', 'New user')}</span>
          </button>
        </div>
      )}

      {!rascunho && <Erro mensagem={erro} />}

      {rascunho && (
        <Editor
          titulo={rascunho.id ? L('Editar usuário', 'Edit user') : L('Novo usuário', 'New user')}
          onSalvar={salvar}
          onCancelar={() => {
            setRascunho(null)
            setErro(null)
          }}
          salvando={salvando}
          erro={erro}
        >
          <Campo rotulo={L('E-mail (login)', 'E-mail (login)')}>
            <input
              className="f"
              type="email"
              disabled={!!rascunho.id}
              value={rascunho.login}
              onChange={(e) => setRascunho({ ...rascunho, login: e.target.value })}
            />
          </Campo>
          <Campo rotulo={L('Nome', 'Name')}>
            <input
              className="f"
              value={rascunho.nome}
              onChange={(e) => setRascunho({ ...rascunho, nome: e.target.value })}
            />
          </Campo>
          <Campo rotulo={L('Papel', 'Role')}>
            <select
              className="f"
              value={rascunho.papel}
              onChange={(e) =>
                setRascunho({ ...rascunho, papel: e.target.value as Rascunho['papel'] })
              }
            >
              {PAPEIS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo={L('Empresa', 'Company')}>
            <select
              className="f"
              value={rascunho.empresa_id}
              onChange={(e) => setRascunho({ ...rascunho, empresa_id: e.target.value })}
            >
              <option value="">{L('— nenhuma —', '— none —')}</option>
              {empresas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </select>
          </Campo>
          <Campo
            rotulo={
              rascunho.id
                ? L(
                    `Nova senha (vazio mantém · mín. ${MIN_SENHA})`,
                    `New password (blank keeps it · min. ${MIN_SENHA})`,
                  )
                : L(
                    `Senha (vazio = só SSO · mín. ${MIN_SENHA})`,
                    `Password (blank = SSO only · min. ${MIN_SENHA})`,
                  )
            }
          >
            <input
              className="f"
              type="password"
              autoComplete="new-password"
              value={rascunho.senha}
              onChange={(e) => setRascunho({ ...rascunho, senha: e.target.value })}
            />
          </Campo>
          <Campo rotulo={L('Situação', 'Status')}>
            <select
              className="f"
              value={rascunho.status}
              onChange={(e) =>
                setRascunho({ ...rascunho, status: e.target.value as Rascunho['status'] })
              }
            >
              <option value="ativo">{L('Ativo', 'Active')}</option>
              <option value="inativo">{L('Inativo', 'Inactive')}</option>
            </select>
          </Campo>
          <Campo rotulo={L('Permissões (vazio = padrão do papel)', 'Permissions (blank = role default)')} largo>
            <Chips
              opcoes={permissoes.map((p) => {
                const r = ROTULO_PERMISSAO[p.codigo]
                return [p.codigo, r ? L(r[0], r[1]) : p.codigo] as [string, string]
              })}
              valor={rascunho.permissoes}
              onChange={(permissoes) => setRascunho({ ...rascunho, permissoes })}
            />
          </Campo>

          {/* O LINK DE SENHA SAIU DA LINHA DA TABELA E VEIO PARA CÁ. Ele era um
              botão contornado em toda linha da lista, e é ação sobre UMA pessoa —
              o lugar dela é onde já se está editando aquela pessoa. Só na edição:
              numa conta que ainda não existe não há para quem gerar link.
              SENHA NÃO SE DIGITA PARA OUTRA PESSOA (ver o CLAUDE.md): este é o
              caminho recomendado, e o campo de senha acima é o atalho de quem
              aceita saber a senha alheia. */}
          {rascunho.id && (
            <Campo rotulo={L('Acesso', 'Access')} largo>
              <div className="usr-link">
                <button
                  type="button"
                  className="btn sm"
                  onClick={() => gerarLink({ id: rascunho.id } as UsuarioCadastro)}
                  title={L(
                    'Gera um link de uso único para a pessoa definir a própria senha. Convite (7 dias) para quem nunca teve senha; redefinição (2 horas) para quem já tinha.',
                    'Creates a single-use link for the person to set their own password. Invitation (7 days) if they never had one; reset (2 hours) if they did.',
                  )}
                >
                  {L('Gerar link de senha', 'Create password link')}
                </button>
                {links[rascunho.id] && (
                  <span className="mmeta usr-link-url">
                    {copiado === rascunho.id
                      ? L('copiado · ', 'copied · ')
                      : L('gerado · ', 'created · ')}
                    {links[rascunho.id]}
                  </span>
                )}
              </div>
            </Campo>
          )}
        </Editor>
      )}

      {/* A MESMA TABELA DA TELA DE MEMBROS (`.memb-tabela`): avatar de iniciais,
          nome e e-mail em colunas próprias, papel e situação em pílula, e UMA
          ação por linha. Eram dois botões contornados em toda linha — "Link de
          senha" e "Editar" —, e dois controles por linha em vinte linhas são
          quarenta molduras competindo com os nomes, que é o que se veio ler.
          A geração do link foi para DENTRO do editor, onde ela pertence: é ação
          sobre uma pessoa, não uma coluna da lista. */}
      <div className="memb-tabela">
        <table>
          <thead>
            <tr>
              <th>{L('Nome', 'Name')}</th>
              <th>{L('E-mail', 'E-mail')}</th>
              <th>{L('Papel', 'Role')}</th>
              <th>{L('Empresa', 'Company')}</th>
              <th>{L('Situação', 'Status')}</th>
              <th className="memb-acoes-col">{L('Ações', 'Actions')}</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <tr key={u.id}>
                <td>
                  <div className="mcell">
                    <span className="memb-av">{iniciais(u.nome, u.login)}</span>
                    <span className="memb-nome">{u.nome ?? u.login}</span>
                  </div>
                </td>
                <td className="co">{u.login}</td>
                <td className="co">{u.papel}</td>
                <td className="co">{nomeEmpresa(u.empresa_id)}</td>
                <td>
                  <span className={`pill${u.status === 'ativo' ? ' ok' : ''}`}>
                    {u.status === 'ativo' ? L('Ativo', 'Active') : L('Inativo', 'Inactive')}
                  </span>
                </td>
                <td className="memb-acoes-col">
                  <button
                    type="button"
                    className="memb-eng"
                    title={L('Editar', 'Edit')}
                    aria-label={L('Editar', 'Edit')}
                    onClick={() =>
                      setRascunho({
                        id: u.id,
                        login: u.login,
                        nome: u.nome ?? '',
                        senha: '',
                        papel: u.papel as Rascunho['papel'],
                        empresa_id: u.empresa_id ?? '',
                        permissoes: u.permissoes,
                        status: u.status as Rascunho['status'],
                      })
                    }
                  >
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
                      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                    </svg>
                  </button>
                </td>
              </tr>
            ))}
            {usuarios.length === 0 && (
              <tr>
                <td colSpan={6} className="empty">
                  {carregando
                    ? L('Carregando…', 'Loading…')
                    : L('Nenhuma conta ainda.', 'No accounts yet.')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
