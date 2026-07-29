/** SP-406 · Log de atividade — a leitura da trilha de auditoria.
 *
 *  A escrita é automática desde a Fase 4 (`backend/app/db/trilha.py`, no
 *  `before_flush`): toda criação, alteração e remoção já vinha sendo gravada,
 *  e havia API para ler. Faltava a tela — o dado existia e ninguém via.
 *
 *  Mora na Administração, e não na barra lateral, porque não é uma tela de
 *  projeto: a trilha é da organização inteira, e a API exige `admin_cadastro`.
 *
 *  O CUIDADO CENTRAL DESTA TELA é o formato do `diff`, que muda conforme a
 *  ação — e é assim de propósito, diz a API:
 *
 *    criou/removeu → o estado inteiro       {"titulo": "Antes"}
 *    alterou       → só o que mudou         {"titulo": {"de": …, "para": …}}
 *
 *  Um formato único obrigaria a inventar um "de" que não existe na criação, ou
 *  a perder o contexto do que mais havia no registro removido.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'

import { Erro, Vazio } from '@/components/ui'
import { useI18n } from '@/i18n'
import { ApiError, api } from '@/lib/api'
import type { LinhaTrilha, UsuarioCadastro } from '@/lib/types'

/** As ações que o `before_flush` grava.
 *
 *  `restaurou` entrou com a lixeira. Ela e `removeu` são o MESMO UPDATE de
 *  `deleted_at` em direções opostas — e são ações distintas aqui porque tirar
 *  da lixeira é um ato de alguém, que o log precisa poder mostrar sozinho. */
const ACOES = ['criou', 'alterou', 'removeu', 'restaurou'] as const

const CLASSE_ACAO: Record<string, string> = {
  criou: 'pill ok',
  alterou: 'pill alerta',
  removeu: 'pill ruim',
  // Verde como `criou`: restaurar devolve o registro à vida, e o que a cor
  // responde nesta coluna é "isto tirou ou pôs dado no sistema".
  restaurou: 'pill ok',
}

const ROTULO_ACAO: Record<string, [string, string]> = {
  criou: ['criou', 'created'],
  alterou: ['alterou', 'changed'],
  removeu: ['removeu', 'removed'],
  restaurou: ['restaurou', 'restored'],
}

/** Nome de tabela → nome de gente. O que não estiver aqui aparece como veio:
 *  é melhor mostrar `versao_modelo` do que esconder a linha. */
const ROTULO_ENTIDADE: Record<string, [string, string]> = {
  auditoria: ['Auditoria', 'Audit'],
  apontamento: ['Apontamento', 'Issue'],
  cliente: ['Cliente', 'Client'],
  criterio: ['Critério', 'Criterion'],
  disciplina: ['Disciplina', 'Discipline'],
  empresa: ['Empresa', 'Company'],
  modelo: ['Modelo', 'Model'],
  nao_conformidade: ['Não-conformidade', 'Non-conformity'],
  organizacao: ['Organização', 'Organization'],
  projeto: ['Projeto', 'Project'],
  standard: ['Padrão', 'Standard'],
  usuario: ['Usuário', 'User'],
  versao_modelo: ['Versão de modelo', 'Model version'],
}

/** Um valor do diff em texto. `null` vira "—" e não "null": a tela é lida por
 *  quem coordena obra, não por quem escreve JSON. */
function texto(valor: unknown): string {
  if (valor === null || valor === undefined || valor === '') return '—'
  if (typeof valor === 'object') return JSON.stringify(valor)
  return String(valor)
}

/** Uma mudança de campo já normalizada, venha de que formato vier. */
type Mudanca = { campo: string; de: string | null; para: string }

function lerDiff(linha: LinhaTrilha): Mudanca[] {
  if (!linha.diff) return []
  return Object.entries(linha.diff).map(([campo, valor]) => {
    // `alterou` traz {de, para}; os outros trazem o valor direto. A checagem é
    // pela FORMA e não pela ação: uma linha antiga gravada noutro formato
    // ainda aparece, em vez de derrubar a tela.
    if (valor && typeof valor === 'object' && !Array.isArray(valor) && 'para' in valor) {
      const par = valor as { de?: unknown; para?: unknown }
      return { campo, de: texto(par.de), para: texto(par.para) }
    }
    return { campo, de: null, para: texto(valor) }
  })
}

/** Chave de dia, no fuso de quem lê. O log é agrupado por dia porque é assim
 *  que se procura nele: "o que mudou ontem", nunca "o que mudou às 14h". */
function dia(iso: string): string {
  return new Date(iso).toLocaleDateString()
}

function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function AbaTrilha() {
  const { L } = useI18n()
  const [linhas, setLinhas] = useState<LinhaTrilha[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [usuarios, setUsuarios] = useState<UsuarioCadastro[]>([])
  /** As entidades já vistas, para o seletor. Só CRESCE, e é alimentada na
   *  carga sem filtro: se saísse das linhas visíveis, filtrar por `projeto`
   *  deixaria o seletor com uma opção só e não haveria como voltar. */
  const [entidades, setEntidades] = useState<string[]>([])
  const [entidade, setEntidade] = useState('')
  const [acao, setAcao] = useState('')
  const [usuarioId, setUsuarioId] = useState('')
  const [aberta, setAberta] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [buscandoMais, setBuscandoMais] = useState(false)

  const filtros = useMemo(
    () => ({ entidade: entidade || undefined, acao: acao || undefined, usuario_id: usuarioId || undefined }),
    [entidade, acao, usuarioId],
  )

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro(null)
    try {
      const pagina = await api.trilha(filtros)
      setLinhas(pagina.itens)
      setCursor(pagina.proximo_cursor)
      // O universo de entidades só se acumula quando ninguém filtrou por uma.
      if (!filtros.entidade) {
        setEntidades((atual) => {
          const todas = new Set(atual)
          for (const l of pagina.itens) if (l.entidade) todas.add(l.entidade)
          return [...todas].sort()
        })
      }
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : String(e))
    } finally {
      setCarregando(false)
    }
  }, [filtros])

  useEffect(() => {
    carregar()
  }, [carregar])

  useEffect(() => {
    // Uma vez só: a lista de usuários serve para trocar id por nome e para o
    // seletor, e não muda enquanto se lê um log.
    api.usuarios
      .listar()
      .then((p) => setUsuarios(p.itens))
      .catch(() => setUsuarios([]))
  }, [])

  async function carregarMais() {
    if (!cursor) return
    setBuscandoMais(true)
    try {
      const pagina = await api.trilha({ ...filtros, cursor })
      setLinhas((atual) => [...atual, ...pagina.itens])
      setCursor(pagina.proximo_cursor)
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : String(e))
    } finally {
      setBuscandoMais(false)
    }
  }

  const nomePorId = useMemo(() => {
    const mapa = new Map<string, string>()
    for (const u of usuarios) mapa.set(u.id, u.nome || u.login)
    return mapa
  }, [usuarios])

  /** As linhas em blocos de dia, preservando a ordem que veio da API
   *  (`created_at DESC`). */
  const porDia = useMemo(() => {
    const blocos: Array<{ dia: string; itens: LinhaTrilha[] }> = []
    for (const l of linhas) {
      const d = dia(l.created_at)
      const ultimo = blocos[blocos.length - 1]
      if (ultimo && ultimo.dia === d) ultimo.itens.push(l)
      else blocos.push({ dia: d, itens: [l] })
    }
    return blocos
  }, [linhas])

  // Ambos caem no valor CRU quando a chave não está no dicionário: uma ação ou
  // tabela nova entra na tela sem tradução, em vez de sumir dela.
  const rotuloEntidade = (e: string | null) => {
    if (!e) return '—'
    const par = ROTULO_ENTIDADE[e]
    return par ? L(par[0], par[1]) : e
  }

  const rotuloAcao = (a: string | null) => {
    if (!a) return '—'
    const par = ROTULO_ACAO[a]
    return par ? L(par[0], par[1]) : a
  }

  const temFiltro = !!(entidade || acao || usuarioId)

  return (
    <>
      <div className="filters">
        <select className="f" value={entidade} onChange={(e) => setEntidade(e.target.value)}>
          <option value="">{L('Tudo', 'Everything')}</option>
          {entidades.map((e) => (
            <option key={e} value={e}>
              {rotuloEntidade(e)}
            </option>
          ))}
        </select>

        <select className="f" value={acao} onChange={(e) => setAcao(e.target.value)}>
          <option value="">{L('Qualquer ação', 'Any action')}</option>
          {ACOES.map((a) => (
            <option key={a} value={a}>
              {rotuloAcao(a)}
            </option>
          ))}
        </select>

        <select className="f" value={usuarioId} onChange={(e) => setUsuarioId(e.target.value)}>
          <option value="">{L('Qualquer pessoa', 'Anyone')}</option>
          {usuarios.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nome || u.login}
            </option>
          ))}
        </select>

        {temFiltro && (
          <button
            className="btn sm"
            onClick={() => {
              setEntidade('')
              setAcao('')
              setUsuarioId('')
            }}
          >
            {L('Limpar', 'Clear')}
          </button>
        )}
      </div>

      <Erro mensagem={erro} />

      {carregando && <p className="hint">{L('Carregando…', 'Loading…')}</p>}

      {!carregando && linhas.length === 0 && (
        <Vazio
          titulo={L('Nada registrado', 'Nothing recorded')}
          texto={
            temFiltro
              ? L(
                  'Nenhuma atividade com estes filtros. Limpe-os para ver o log inteiro.',
                  'No activity with these filters. Clear them to see the whole log.',
                )
              : L(
                  'A trilha grava sozinha toda criação, alteração e remoção. Assim que alguém mexer num cadastro, a atividade aparece aqui.',
                  'The trail records every create, change and removal on its own. As soon as someone edits a record, the activity shows up here.',
                )
          }
        />
      )}

      {porDia.map((bloco) => (
        <div key={bloco.dia} className="card" style={{ marginBottom: 12 }}>
          {/* `.grp` é o cabeçalho de bloco que a lista de critérios do modelo
              já usa — não vale inventar um degrau novo para o mesmo papel. */}
          <div className="grp">{bloco.dia}</div>
          <table>
            <tbody>
              {bloco.itens.map((l) => {
                const mudancas = lerDiff(l)
                const expandida = aberta === l.id
                return (
                  <tr
                    key={l.id}
                    // A linha inteira abre o detalhe: o alvo é a linha, não um
                    // ícone de 12px no fim dela.
                    className={mudancas.length ? 'clk' : undefined}
                    onClick={() => mudancas.length && setAberta(expandida ? null : l.id)}
                  >
                    <td className="co" style={{ width: 58, whiteSpace: 'nowrap' }}>
                      {hora(l.created_at)}
                    </td>
                    <td style={{ width: 96 }}>
                      <span className={CLASSE_ACAO[l.acao ?? ''] ?? 'pill'}>
                        {rotuloAcao(l.acao)}
                      </span>
                    </td>
                    <td>
                      <b>{rotuloEntidade(l.entidade)}</b>
                      {/* O autor vem do AutorMiddleware, não da sessão da
                          rota — e pode faltar: importador YAML, seed e worker
                          do Celery gravam sem usuário. */}
                      <div className="mmeta">
                        {l.usuario_id
                          ? (nomePorId.get(l.usuario_id) ?? L('usuário removido', 'removed user'))
                          : L('automático', 'automatic')}
                      </div>

                      {expandida && mudancas.length > 0 && (
                        <div className="trilha-diff">
                          {mudancas.map((m) => (
                            <div key={m.campo} className="trilha-campo">
                              <span className="trilha-nome">{m.campo}</span>
                              {/* `de` só existe em `alterou`. Em criou/removeu
                                  o diff é o estado inteiro, e uma seta a
                                  partir de "—" sugeriria uma mudança que não
                                  houve. */}
                              {m.de !== null && (
                                <>
                                  <span className="trilha-de">{m.de}</span>
                                  <span className="trilha-seta">→</span>
                                </>
                              )}
                              <span className="trilha-para">{m.para}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="co" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {mudancas.length > 0 &&
                        (expandida
                          ? L('fechar', 'close')
                          : `${mudancas.length} ${
                              mudancas.length === 1 ? L('campo', 'field') : L('campos', 'fields')
                            }`)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ))}

      {cursor && (
        <div className="acoes">
          <button className="btn" onClick={carregarMais} disabled={buscandoMais}>
            {buscandoMais ? L('Carregando…', 'Loading…') : L('Carregar mais', 'Load more')}
          </button>
        </div>
      )}
    </>
  )
}
