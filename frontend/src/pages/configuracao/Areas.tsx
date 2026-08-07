/** SETORIZAÇÃO — as áreas do projeto e as imagens que as explicam.
 *
 *  ADMIN, COLO1..5, SITE, UTLS no CPQ11. Elas já existiam em dois lugares e não
 *  eram definidas em nenhum: um `text[]` por disciplina e uma lista CHAPADA no
 *  código desta pasta (`AREAS_SUGERIDAS`, em `Disciplinas.tsx`) com os setores
 *  do CPQ11 — quem cadastrava outro projeto marcava COLO1..5 porque era o que a
 *  tela oferecia. Agora a área nasce aqui e a disciplina MARCA quais audita.
 *
 *  ═══ A SEÇÃO CHAMA-SE `Setorização` DESDE 07/08/2026, a pedido
 *
 *  E A GRADE DE IMAGENS VEIO JUNTO, da aba `Dados & setorização` do PEB. Elas
 *  estavam em telas diferentes dizendo respeito à mesma coisa: uma DEFINIA os
 *  setores e a outra mostrava o desenho deles, e quem acrescentava um setor aqui
 *  tinha de ir a outra seção para dizer o que ele é. Agora a definição e o
 *  retrato ficam um debaixo do outro.
 *
 *  A ENTIDADE CONTINUA SENDO "ÁREA", e isto não é desleixo: `projeto.areas`,
 *  `disciplina.areas` e `auditoria.area` guardam o nome, a aba de Disciplinas
 *  fala em "áreas que audita" e a matriz chama a coluna de área. `Setorização` é
 *  o ASSUNTO da seção — dividir a obra em setores —, e "área" é a unidade. Trocar
 *  a palavra na tela sem trocá-la no domínio deixaria as duas metades do produto
 *  falando línguas diferentes. A rota continua `areas` pela mesma razão que a das
 *  diretrizes continua `peb`: link salvo e histórico.
 *
 *  A TELA MOSTRA O QUE DEPENDE DE CADA UMA, e é o que a torna operável: remover
 *  uma área com auditoria dentro é 409, e sem os dois números na linha isso só se
 *  descobriria clicando. O contador de disciplinas serve à outra metade — remover
 *  uma área usada por seis disciplinas tira o setor das seis de uma vez, e é isso
 *  que a confirmação diz antes de acontecer.
 *
 *  RENOMEAR É OPERAÇÃO PRÓPRIA, não "apagar e criar". O nome está gravado em
 *  `disciplina.areas`, em `auditoria.area` e — desde que a grade veio para cá —
 *  no `standard` de tipo `setorizacao`, que também é casado por NOME; a rota
 *  cascateia para os três. Foi para poder distinguir os dois atos que não existe
 *  um "gravar a lista" — `['ADMIN','TORRE 1']` no lugar de `['ADMIN','COLO1']`
 *  chega igual nos dois casos, e eles fazem coisas opostas com o que já foi
 *  auditado.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'

import { useAuth } from '@/auth/AuthContext'
import { Erro, Vazio } from '@/components/ui'
import { useI18n } from '@/i18n'
import { ApiError, api } from '@/lib/api'
import type { Area, Standard } from '@/lib/types'
import { useProjeto } from '@/projeto/ProjetoContext'

export default function AbaAreas() {
  const { L } = useI18n()
  // `recarregar` porque `projeto.areas` vem do provider, e é dele que a aba de
  // Disciplinas e a setorização do PEB leem a lista. Sem isto, acrescentar uma
  // área aqui e ir marcar a disciplina mostraria a lista de antes.
  const { projeto, recarregar } = useProjeto()
  const [areas, setAreas] = useState<Area[]>([])
  const [nova, setNova] = useState('')
  /** Qual linha está em edição, e o texto dela. Duas coisas, um estado só: só
   *  há uma linha em edição por vez, e guardar o texto por linha manteria
   *  rascunho de linhas que ninguém está editando. */
  const [editando, setEditando] = useState<{ de: string; para: string } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [carregando, setCarregando] = useState(true)

  const carregar = useCallback(async () => {
    if (!projeto) return
    try {
      setAreas(await api.projetos.areas.listar(projeto.id))
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : String(e))
    } finally {
      setCarregando(false)
    }
  }, [projeto])

  useEffect(() => {
    carregar()
  }, [carregar])

  if (!projeto) return null

  /** Toda escrita passa por aqui: mesma trava, mesmo erro, mesma recarga —
   *  inclusive a do provider, que é o que faz a lista nova valer nas outras
   *  abas sem recarregar a página. */
  async function gravar(acao: () => Promise<unknown>) {
    setErro(null)
    setOcupado(true)
    try {
      await acao()
      await Promise.all([carregar(), recarregar()])
      return true
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : String(e))
      return false
    } finally {
      setOcupado(false)
    }
  }

  async function acrescentar(evento: React.FormEvent) {
    evento.preventDefault()
    const nome = nova.trim()
    if (!nome || !projeto) return
    if (await gravar(() => api.projetos.areas.criar(projeto.id, nome))) setNova('')
  }

  async function renomear() {
    if (!editando || !projeto) return
    const para = editando.para.trim()
    // Sem mudança não é gravação: um PATCH que não muda nada ainda assim
    // percorreria as auditorias da área para reescrever o mesmo nome.
    if (!para || para === editando.de) return setEditando(null)
    if (await gravar(() => api.projetos.areas.renomear(projeto.id, editando.de, para))) {
      setEditando(null)
    }
  }

  async function remover(area: Area) {
    if (!projeto) return
    // O AVISO DIZ O ESTRAGO, e não "tem certeza?". Tirar a área do projeto a
    // tira também das disciplinas que a auditam — e essa parte não volta
    // sozinha se ela for recriada depois.
    const aviso =
      area.disciplinas > 0
        ? L(
            `Remover a área "${area.nome}"? Ela sai também de ${area.disciplinas} disciplina(s) que a auditam.`,
            `Remove the area "${area.nome}"? It will also be dropped from ${area.disciplinas} discipline(s) auditing it.`,
          )
        : L(`Remover a área "${area.nome}"?`, `Remove the area "${area.nome}"?`)
    if (!confirm(aviso)) return
    await gravar(() => api.projetos.areas.remover(projeto.id, area.nome))
  }

  if (carregando) return <p className="hint">{L('Carregando…', 'Loading…')}</p>

  return (
    <>
      {/* O formulário é UMA LINHA, não um `Editor`: a área é um campo só, e a
          moldura de editor em volta de um input pediria mais tela do que o dado
          que ela guarda. */}
      <form className="acoes" onSubmit={acrescentar}>
        <input
          className="f"
          style={{ maxWidth: 240 }}
          value={nova}
          onChange={(e) => setNova(e.target.value)}
          placeholder={L('Nova área (ADMIN, COLO1…)', 'New area (ADMIN, COLO1…)')}
          maxLength={40}
        />
        <button className="btn pri" disabled={ocupado || !nova.trim()}>
          + {L('Acrescentar', 'Add')}
        </button>
      </form>

      <Erro mensagem={erro} />

      {areas.length === 0 ? (
        <Vazio
          titulo={L('Nenhuma área definida', 'No areas defined')}
          texto={L(
            'As áreas são os setores da obra. Elas viram as colunas da matriz do LOD 400 e 500, e é entre elas que cada disciplina marca as que audita.',
            'Areas are the site sectors. They become the columns of the LOD 400 and 500 matrix, and each discipline picks the ones it audits from them.',
          )}
        />
      ) : (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>{L('Área', 'Area')}</th>
                <th>{L('Disciplinas', 'Disciplines')}</th>
                <th>{L('Auditorias', 'Audits')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {areas.map((a) => {
                const emEdicao = editando?.de === a.nome
                return (
                  <tr key={a.nome}>
                    <td>
                      {emEdicao ? (
                        <input
                          className="f"
                          autoFocus
                          value={editando.para}
                          onChange={(e) => setEditando({ de: a.nome, para: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') renomear()
                            if (e.key === 'Escape') setEditando(null)
                          }}
                          maxLength={40}
                        />
                      ) : (
                        <span className="code">{a.nome}</span>
                      )}
                    </td>
                    <td className="co">{a.disciplinas || '—'}</td>
                    <td className="co">{a.auditorias || '—'}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {emEdicao ? (
                        <button className="btn sm pri" onClick={renomear} disabled={ocupado}>
                          {L('Salvar', 'Save')}
                        </button>
                      ) : (
                        <>
                          <button
                            className="btn sm"
                            onClick={() => setEditando({ de: a.nome, para: a.nome })}
                          >
                            {L('Renomear', 'Rename')}
                          </button>{' '}
                          {/* DESABILITADO, e não escondido, quando há auditoria:
                              o botão ausente faria a linha parecer diferente das
                              outras sem dizer por quê. O `title` responde. */}
                          <button
                            className="btn sm danger"
                            onClick={() => remover(a)}
                            disabled={ocupado || a.auditorias > 0}
                            title={
                              a.auditorias > 0
                                ? L(
                                    'Há auditoria nesta área — renomeie-a, ou remova antes as auditorias dela.',
                                    'This area has audits — rename it, or remove its audits first.',
                                  )
                                : undefined
                            }
                          >
                            {L('Remover', 'Remove')}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* A regra do produto JUNTO DO DADO que ela explica, não em subtítulo no
          topo: é aqui que se descobre por que o nome importa. */}
      <p className="hint" style={{ margin: '12px 4px 0' }}>
        {L(
          'A área é o setor da obra. Ela vira coluna na matriz do LOD 400 e 500, e cada disciplina marca em Disciplinas quais audita. Renomear muda o nome também nas disciplinas, nas auditorias e na imagem do setor.',
          'An area is a site sector. It becomes a column in the LOD 400 and 500 matrix, and each discipline picks the ones it audits under Disciplines. Renaming also updates the disciplines, the audits and the sector image.',
        )}
      </p>

      <Setores projetoId={projeto.id} areas={areas.map((a) => a.nome)} />
    </>
  )
}

/* ------------------------------------------------- as imagens dos setores */

/** A grade de imagens, vinda da aba `Dados & setorização` do PEB (07/08/2026).
 *
 *  A LISTA DE SETORES VEM DA TELA, e não de `projeto.areas` como vinha antes:
 *  é a mesma lista, mas esta já está carregada aqui e muda no mesmo instante em
 *  que se acrescenta, renomeia ou remove uma linha da tabela acima. Lendo do
 *  provider, a grade ficaria um passo atrás até o `recarregar()` responder — e
 *  acrescentar um setor sem ver onde pôr a imagem dele é o que esta junção veio
 *  desfazer.
 *
 *  COMPONENTE À PARTE, e não mais estado dentro da tabela: são dois recursos
 *  diferentes (a lista de áreas e os `standard` de setorização), com carga e erro
 *  próprios. Um erro ao assinar a URL de uma imagem não pode apagar a tabela de
 *  onde se administra as áreas.
 *
 *  A diferença que mais importa em relação ao protótipo: lá a imagem do setor
 *  virava uma data-URL na memória do navegador — não sobrevivia a um F5 nem
 *  chegava ao colega do lado. Aqui ela sobe para o S3 e é lida por URL assinada,
 *  porque o bucket é privado.
 */
function Setores({ projetoId, areas }: { projetoId: string; areas: string[] }) {
  const { L } = useI18n()
  const { usuario } = useAuth()
  const podeEditar = !!usuario?.permissoes.includes('admin_cadastro')

  const [imagens, setImagens] = useState<Standard[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState<string | null>(null)

  // A DEPENDÊNCIA É O CONTEÚDO DA LISTA, não o vetor: `areas` é um `map` novo a
  // cada render da tela de cima, e um efeito que dependesse dele recarregaria
  // sem parar. É a mesma armadilha do `useMigalha`.
  const chave = areas.join(' ')

  const carregar = useCallback(async () => {
    setErro(null)
    try {
      const ss = await api.standards.listar(projetoId, 'setorizacao')
      setImagens(ss.itens)

      // Uma URL assinada por imagem existente. São poucas e expiram, então não
      // vale guardar — pedir a cada abertura da seção é o comportamento correto.
      const comArquivo = ss.itens.filter((s) => s.referencia_url)
      const resolvidas = await Promise.all(
        comArquivo.map(async (s) => {
          try {
            return [s.nome, (await api.standards.imagemUrl(s.id)).url] as const
          } catch {
            return [s.nome, null] as const
          }
        }),
      )
      setUrls(Object.fromEntries(resolvidas.filter(([, u]) => u) as Array<[string, string]>))
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : String(e))
    }
  }, [projetoId])

  // Recarrega quando a LISTA DE ÁREAS muda, e não só na montagem: renomear uma
  // área renomeia o `standard` dela no servidor, e sem isto a grade continuaria
  // mostrando o nome velho ao lado da tabela já corrigida.
  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carregar, chave])

  const porSetor = useMemo(() => new Map(imagens.map((s) => [s.nome, s])), [imagens])

  async function enviar(setor: string, arquivo: File) {
    setErro(null)
    setEnviando(setor)
    try {
      // O registro pode não existir ainda: cria-se na hora do primeiro envio,
      // para não poluir o banco com um standard vazio por setor declarado.
      let alvo = porSetor.get(setor)
      if (!alvo) {
        alvo = await api.standards.criar({
          projeto_id: projetoId,
          tipo: 'setorizacao',
          nome: setor,
        })
      }
      await api.standards.enviarImagem(alvo.id, arquivo)
      await carregar()
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : String(e))
    } finally {
      setEnviando(null)
    }
  }

  // Sem área definida não há grade: a mensagem de vazio da tabela acima já
  // explica o que fazer, e um segundo bloco vazio repetindo-a seria ruído.
  if (areas.length === 0) return null

  return (
    <>
      <div className="exlabel" style={{ marginTop: 22 }}>
        {L('Imagens dos setores', 'Sector images')}
      </div>

      <Erro mensagem={erro} />

      <p className="hint" style={{ margin: '0 4px 12px' }}>
        {L(
          'Imagens de referência da setorização e da nomenclatura, para todos entenderem os setores da obra.',
          'Reference images for sectorization and naming, so everyone understands the site sectors.',
        )}
      </p>

      <div className="peb-setores">
        {areas.map((setor) => {
          const url = urls[setor]
          return (
            <div key={setor} className="card peb-setor">
              <div className="peb-setor-nome">{setor}</div>
              {url ? (
                <img src={url} alt={setor} />
              ) : (
                <div className="peb-setor-vazio">
                  {enviando === setor ? L('Enviando…', 'Uploading…') : L('Sem imagem', 'No image')}
                </div>
              )}
              {podeEditar && (
                <label className="btn sm peb-setor-envio">
                  {url ? L('trocar', 'replace') : L('Enviar imagem', 'Upload image')}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      // Zera o input: sem isso, reenviar o MESMO arquivo depois
                      // de um erro não dispara `change` e nada acontece.
                      e.target.value = ''
                      if (f) enviar(setor, f)
                    }}
                  />
                </label>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}
