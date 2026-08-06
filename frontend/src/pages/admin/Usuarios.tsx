/** SP-103 · Usuários & acessos.
 *
 *  A EDIÇÃO ABRE NUMA GAVETA, não num editor inline (05/08/2026, a pedido).
 *  A engrenagem da linha já existia e já abria o formulário em um clique; o que
 *  mudou foi ONDE ele aparece.
 *
 *  O `.editor` nascia ACIMA da tabela e empurrava a lista inteira para baixo:
 *  quem clicava na engrenagem da décima linha via o formulário abrir fora da
 *  vista e a pessoa que ia editar sair da tela. É a regra 4 do sistema visual —
 *  só a esquerda empurra; painel da direita SOBREPÕE —, e é por isso que a tela
 *  de membros de projeto já usava a gaveta.
 *
 *  UM ARQUIVO, DUAS TELAS. Este componente é `/admin/usuarios` E a aba "Todos os
 *  membros" de `Gerenciar membros` (`pages/Membros.tsx` o renderiza inteiro, em
 *  vez de reimplementar a lista). Então a gaveta chega nos dois lugares de uma
 *  vez — que é a razão de a tela de contas ser uma só desde o começo.
 *
 *  ESTA TELA NÃO MEXE EM PERMISSÃO NEM EM VISUALIZAÇÃO DE PÁGINA (05/08/2026, a
 *  pedido). As duas coisas estiveram aqui e saíram:
 *
 *  - **Permissões finas** (o `Chips` de `ver_painel`, `executar`…) — sem elas, a
 *    coluna `usuario.permissoes` fica vazia e vale o PADRÃO DO PAPEL
 *    (`PERMISSOES_POR_PAPEL`, em `models/enums.py`). É o comportamento que o
 *    campo já anunciava com "vazio = padrão do papel"; agora é o único. Quem
 *    precisar de uma lista sob medida faz pela API — e faz sabendo que está
 *    saindo do padrão, em vez de desmarcar uma etiqueta sem perceber.
 *  - **Interruptores de página** — foram para a gaveta de MEMBRO DE PROJETO
 *    (`components/TabelaMembros.tsx`), que é onde se cuida de quem acompanha o
 *    quê. O dado continua sendo da conta; o que mudou foi de onde se mexe nele.
 *
 *  Consequência a saber: o PATCH desta tela NÃO manda `permissoes`. Pelo
 *  `exclude_unset` do `UsuarioUpdate`, campo ausente é "não mexa" — e é isso que
 *  impede esta gaveta de apagar o que a de membro gravou.
 */
import { useCallback, useEffect, useState } from 'react'

import { useAuth } from '@/auth/AuthContext'
import Gaveta from '@/components/Gaveta'
import { iniciais } from '@/components/TabelaMembros'
import { Campo, Erro } from '@/components/ui'
import { useI18n } from '@/i18n'
import { ApiError, api } from '@/lib/api'
import type { Empresa, UsuarioCadastro } from '@/lib/types'

/** OS PAPÉIS DE PLATAFORMA — três, e não os sete do enum (05/08/2026, a pedido).
 *
 *  O `select` mostrava os valores CRUS do banco: `admin`, `coordenador`,
 *  `auditor`, `revisor`, `fornecedor`, `leitor`, `cliente`. Sete opções em
 *  minúsculas, sem explicação, das quais três nunca foram usadas e uma
 *  (`cliente`) tranca a conta fora da plataforma inteira — quem escolhesse por
 *  engano criaria alguém que não consegue entrar.
 *
 *  Os três que ficam respondem a pergunta que se faz de verdade: *esta pessoa
 *  trabalha aqui, administra, ou manda na plataforma?*
 *
 *  SÃO VALORES QUE O ENUM JÁ TEM — mesma decisão de `PAPEIS_PROJETO`, em
 *  `components/TabelaMembros.tsx`: renomear o valor exigiria recriar o tipo no
 *  Postgres e reescrever as linhas por um texto que ninguém lê. O que muda é o
 *  rótulo e o que ele PROMETE:
 *
 *    Usuário      `auditor`      ver painel, executar auditoria, ver relatórios
 *    Admin        `coordenador`  + biblioteca, publicar, e o painel admin
 *    Super admin  `admin`        tudo, inclusive `admin_total`
 *
 *  O QUE SEPARA ADMIN DE SUPER ADMIN é a permissão `admin_total`
 *  (`models/enums.py`), criada para isto: antes os dois papéis tinham conjuntos
 *  IDÊNTICOS e as seis telas do painel exigiam a mesma `admin_cadastro`. Hoje o
 *  Super admin é o único que mexe na identidade da ORGANIZAÇÃO. */
const PAPEIS: Array<{ valor: string; pt: string; en: string; dica: [string, string] }> = [
  {
    valor: 'auditor',
    pt: 'Usuário',
    en: 'User',
    dica: [
      'Trabalha nos projetos: preenche auditoria e lê relatórios.',
      'Works on projects: fills in audits and reads reports.',
    ],
  },
  {
    valor: 'coordenador',
    pt: 'Admin',
    en: 'Admin',
    dica: [
      'O acima, mais o painel administrativo: usuários, clientes, projetos e logs.',
      'The above, plus the admin panel: users, clients, projects and logs.',
    ],
  },
  {
    valor: 'admin',
    pt: 'Super admin',
    en: 'Super admin',
    dica: [
      'Acesso total, incluindo a identidade da organização.',
      'Full access, including the organization’s identity.',
    ],
  },
]

/** O rótulo do papel guardado. O FALLBACK É O VALOR CRU, e não um traço: contas
 *  antigas podem ter `revisor`, `fornecedor`, `leitor` ou `cliente`, e mostrar
 *  "—" para elas esconderia justamente a linha que alguém precisa arrumar. */
function rotuloPapel(papel: string, L: (pt: string, en: string) => string): string {
  const achado = PAPEIS.find((p) => p.valor === papel)
  return achado ? L(achado.pt, achado.en) : papel
}

type Rascunho = {
  id?: string
  login: string
  nome: string
  papel: string
  empresa_id: string
  status: 'ativo' | 'inativo'
}

const VAZIO: Rascunho = {
  login: '',
  nome: '',
  // O MENOS PODEROSO DOS TRÊS. Conta nova nasce podendo trabalhar e nada mais;
  // subir é uma escolha de quem cria, descer é uma correção depois do estrago.
  papel: 'auditor',
  empresa_id: '',
  status: 'ativo',
}

export default function AbaUsuarios({
  novoEm,
  comAcoes = true,
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
  /** A ENGRENAGEM DE CADA LINHA — e, com ela, a gaveta de edição.
   *
   *  DESLIGADA EM "TODOS OS MEMBROS" (05/08/2026, a pedido). Aquele recorte
   *  responde QUEM EXISTE na organização: é uma lista para conferir, e o que se
   *  edita ali — papel de organização, empresa, situação — vale para a pessoa em
   *  TODOS os projetos, não no que se está olhando. Deixar a engrenagem ali
   *  convida a mexer no alcance global a partir de uma tela cujo assunto é a
   *  equipe de um projeto.
   *
   *  Editar conta continua existindo, e num lugar só: `Painel administrativo ›
   *  Usuários`, que é esta mesma tela sem a prop. Dentro de um projeto, a
   *  engrenagem é a do VÍNCULO (`components/TabelaMembros.tsx`) — outra gaveta,
   *  outro assunto: papel e equipe NAQUELE projeto. */
  comAcoes?: boolean
} = {}) {
  const { L } = useI18n()
  const { usuario: logado } = useAuth()
  const [usuarios, setUsuarios] = useState<UsuarioCadastro[]>([])
  const [empresas, setEmpresas] = useState<Empresa[]>([])
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

  /** O nome se edita na CRIAÇÃO e na PRÓPRIA conta — nunca na de outra pessoa.
   *  Ver o campo, mais abaixo, e a guarda em `api/v1/usuarios.py`. */
  const podeEditarNome = !rascunho?.id || rascunho.id === logado?.id

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const [u, e] = await Promise.all([api.usuarios.listar(), api.empresas.listar()])
      setUsuarios(u.itens)
      setEmpresas(e.itens)
    } catch (e) {
      // SEM `catch`, uma das duas falhando rejeitava o `Promise.all` inteiro e a
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

    setSalvando(true)
    const base = {
      papel: rascunho.papel,
      empresa_id: rascunho.empresa_id || null,
      // O NOME SÓ VAI QUANDO ESTA TELA PODE EDITÁ-LO. Mandá-lo sempre passaria
      // no servidor (a guarda de lá compara com o valor atual e um no-op não
      // dispara), mas seria a tela afirmando editar o que ela desabilitou —
      // e bastaria um campo desatualizado em memória para virar 409.
      ...(podeEditarNome ? { nome: rascunho.nome || null } : {}),
      // `permissoes` NÃO VAI, e é o que preserva o que esta tela deixou de
      // editar: pelo `exclude_unset` do `UsuarioUpdate`, campo ausente é "não
      // mexa". Mandá-lo com o que a tela tem em mãos apagaria as telas
      // escondidas que a gaveta de MEMBRO gravou.
      status: rascunho.status,
    }
    try {
      if (rascunho.id) {
        await api.usuarios.atualizar(rascunho.id, base)
      } else {
        await api.usuarios.criar({
          ...base,
          login: rascunho.login,
          // SEM SENHA, SEMPRE. Quem acabou de nascer define a própria pelo link
          // de acesso — ver o campo `Acesso`, no fim da gaveta. Não é o mesmo
          // que "só SSO": é que ninguém digita senha por outra pessoa.
          senha: null,
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

      <Gaveta
        aberta={!!rascunho}
        titulo={rascunho?.id ? L('Editar usuário', 'Edit user') : L('Novo usuário', 'New user')}
        // O e-mail no subtítulo: a gaveta abre de uma linha de tabela, e numa
        // lista de homônimos é ele que diz QUEM se está editando. Na criação não
        // há e-mail ainda, e o campo é a primeira coisa do corpo.
        sub={rascunho?.id ? rascunho.login : undefined}
        onFechar={() => {
          setRascunho(null)
          setErro(null)
        }}
        acoes={
          <button className="btn pri" onClick={salvar} disabled={salvando}>
            {salvando ? L('Salvando…', 'Saving…') : L('Salvar', 'Save')}
          </button>
        }
      >
        {/* SEM O `Cancelar` DO `Editor`. A gaveta já tem três saídas — o X, o
            clique fora e o Esc — e nenhuma grava nada; um quarto caminho para
            "não fazer" ao lado do único caminho para "fazer" daria o mesmo peso
            visual a duas coisas de peso muito diferente. As regras estão em
            `components/Gaveta.tsx`. */}
        {rascunho && (
          <div className="gaveta-campos">
            <Erro mensagem={erro} />

            <Campo rotulo={L('E-mail (login)', 'E-mail (login)')}>
              <input
                className="f"
                type="email"
                disabled={!!rascunho.id}
                value={rascunho.login}
                onChange={(e) => setRascunho({ ...rascunho, login: e.target.value })}
              />
            </Campo>
            {/* O NOME É DE QUEM O USA (05/08/2026, a pedido). Quem administra
                define papel, empresa e situação — como a pessoa se chama é dela.
                Editável só na CRIAÇÃO (ali ainda não há a quem pertença, e uma
                conta sem nome é uma linha que ninguém identifica na lista) e na
                PRÓPRIA conta. A guarda de verdade está no servidor: desabilitar
                um input não impede quem chama a rota direto. */}
            <Campo rotulo={L('Nome', 'Name')}>
              <input
                className="f"
                disabled={!podeEditarNome}
                value={rascunho.nome}
                onChange={(e) => setRascunho({ ...rascunho, nome: e.target.value })}
              />
            </Campo>
            {!podeEditarNome && (
              <p className="hint">
                {L(
                  'O nome é da própria pessoa — ela o altera em Configurações › Perfil.',
                  'The name belongs to the person — they change it under Settings › Profile.',
                )}
              </p>
            )}
            <Campo rotulo={L('Papel na plataforma', 'Platform role')}>
              <select
                className="f"
                value={rascunho.papel}
                onChange={(e) => setRascunho({ ...rascunho, papel: e.target.value })}
              >
                {PAPEIS.map((p) => (
                  <option key={p.valor} value={p.valor}>
                    {L(p.pt, p.en)}
                  </option>
                ))}
                {/* O PAPEL ANTIGO, quando a conta tem um dos quatro que saíram
                    da lista (`revisor`, `fornecedor`, `leitor`, `cliente`). Sem
                    esta opção o `select` abriria no primeiro item e SALVAR
                    rebaixaria a pessoa sem ninguém ter escolhido isso. Ela some
                    assim que se escolher um dos três. */}
                {!PAPEIS.some((p) => p.valor === rascunho.papel) && (
                  <option value={rascunho.papel}>{rascunho.papel}</option>
                )}
              </select>
            </Campo>
            {/* O que o papel escolhido significa, sob o campo e só o dele:
                listar os três obriga a procurar qual é o que importa. */}
            {(() => {
              const p = PAPEIS.find((x) => x.valor === rascunho.papel)
              return p ? <p className="hint">{L(...p.dica)}</p> : null
            })()}
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
            {/* O ÚNICO CAMINHO PARA A SENHA (05/08/2026, a pedido). Havia acima
                um campo `Nova senha`, e ele saiu: quem o usava ficava sabendo a
                senha de outra pessoa e a mandava por mensagem. SENHA NÃO SE
                DIGITA PARA OUTRA PESSOA — é a decisão de 30/07 registrada no
                CLAUDE.md, e agora a tela não oferece mais o atalho contrário.

                ⚠ O BOTÃO NÃO MANDA E-MAIL, E O RÓTULO NÃO PROMETE QUE MANDA. A
                plataforma não tem SMTP (`services/acesso.py` diz isso em
                letras: "quem entrega o link é quem chama"), então o que existe é
                o link de uso único, copiado na hora para quem administra
                repassar. No dia em que houver servidor de e-mail, é este botão
                que passa a disparar o envio — o token e a validade já são os
                mesmos que um e-mail carregaria.

                COPIA JUNTO porque o link só serve copiado, e o token não volta
                do servidor uma segunda vez: pedir um segundo clique seria duas
                ações para uma intenção, com a chance de perdê-lo no meio. */}
            {rascunho.id ? (
              <Campo rotulo={L('Acesso', 'Access')}>
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
                    {L('Gerar link de redefinição', 'Create reset link')}
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
                <p className="hint">
                  {L(
                    'A pessoa escolhe a própria senha pelo link, que vale uma vez. Ainda não há servidor de e-mail: o link é copiado para você repassar.',
                    'The person picks their own password through the link, which works once. There is no mail server yet: the link is copied for you to forward.',
                  )}
                </p>
              </Campo>
            ) : (
              <p className="hint">
                {L(
                  'A conta nasce sem senha. Depois de salvar, abra-a de novo e gere o link de acesso — é por ele que a pessoa escolhe a própria.',
                  'The account is created without a password. After saving, open it again and create the access link — that is how the person picks their own.',
                )}
              </p>
            )}
          </div>
        )}
      </Gaveta>

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
              {comAcoes && <th className="memb-acoes-col">{L('Ações', 'Actions')}</th>}
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
                <td className="co">{rotuloPapel(u.papel, L)}</td>
                <td className="co">{nomeEmpresa(u.empresa_id)}</td>
                <td>
                  <span className={`pill${u.status === 'ativo' ? ' ok' : ''}`}>
                    {u.status === 'ativo' ? L('Ativo', 'Active') : L('Inativo', 'Inactive')}
                  </span>
                </td>
                {/* A COLUNA INTEIRA SOME, cabeçalho junto — não um botão
                    invisível numa coluna vazia. Uma faixa de 56px sem conteúdo à
                    direita de toda linha faria a tabela parecer cortada. */}
                {comAcoes && (
                  <td className="memb-acoes-col">
                    {/* ⚠ NINGUÉM EDITA A PRÓPRIA CONTA AQUI (05/08/2026, a
                        pedido). Papel, empresa e situação decidem o que a pessoa
                        pode fazer na plataforma, e o erro aqui é de desfazer
                        caro: um super admin que se rebaixa por engano pode ficar
                        sem ninguém que o traga de volta. O que é DA pessoa —
                        senha, idioma, tema — segue em `Configurações`.
                        Desabilitado e não escondido, com o porquê no `title`: uma
                        célula vazia na sua linha faz procurar o botão que sumiu.
                        A guarda de verdade está na API. */}
                    <button
                      type="button"
                      className="memb-eng"
                      disabled={u.id === logado?.id}
                      title={
                        u.id === logado?.id
                          ? L(
                              'Você não edita a sua própria conta — peça a outro administrador. Senha e preferências ficam em Configurações.',
                              'You cannot edit your own account — ask another admin. Password and preferences live under Settings.',
                            )
                          : L('Editar', 'Edit')
                      }
                      aria-label={L('Editar', 'Edit')}
                      onClick={() =>
                        setRascunho({
                          id: u.id,
                          login: u.login,
                          nome: u.nome ?? '',
                          papel: u.papel,
                          empresa_id: u.empresa_id ?? '',
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
                )}
              </tr>
            ))}
            {usuarios.length === 0 && (
              <tr>
                {/* Acompanha a coluna de ações: um `colSpan` maior que o número
                    de colunas estica a tabela além do cabeçalho. */}
                <td colSpan={comAcoes ? 6 : 5} className="empty">
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
