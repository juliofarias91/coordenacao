/** PEB · Plano de Execução BIM — as três abas do protótipo (`pebView`).
 *
 *  É o documento normativo de onde os critérios derivam. A tela não o
 *  interpreta: guarda as diretrizes por escrito, as imagens que explicam a
 *  setorização, e desenha o ciclo em que a auditoria se encaixa.
 *
 *  ONDE ISTO É GUARDADO, e por que não numa tabela nova: diretriz e imagem de
 *  setor são `standard` com `tipo` próprio (`diretriz` e `setorizacao`).
 *  `standard.tipo` é coluna de TEXTO no banco, não enum do Postgres, então os
 *  dois tipos não custaram migration — e uma tabela separada teria duplicado
 *  projeto_id, RLS, CRUD e trilha para guardar um título e um texto.
 *
 *    diretriz     nome = título · referencia = o texto da regra
 *    setorizacao  nome = o setor (ADMIN, COLO1…) · referencia_url = chave no S3
 *
 *  A diferença que mais importa em relação ao protótipo: lá a imagem do setor
 *  virava uma data-URL na memória do navegador — não sobrevivia a um F5 nem
 *  chegava ao colega do lado. Aqui ela sobe para o S3 e é lida por URL
 *  assinada, porque o bucket é privado.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'

import { useAuth } from '@/auth/AuthContext'
import { Campo, Editor, Erro, Segmented, Vazio } from '@/components/ui'
import { useI18n } from '@/i18n'
import { ApiError, api } from '@/lib/api'
import type { Disciplina, Standard } from '@/lib/types'
import { useProjeto } from '@/projeto/ProjetoContext'

type Aba = 'diretrizes' | 'setorizacao' | 'fluxo'

type Rascunho = { id?: string; nome: string; texto: string }

export default function Peb() {
  const { L } = useI18n()
  const { projeto } = useProjeto()
  const { usuario } = useAuth()
  const podeEditar = !!usuario?.permissoes.includes('admin_cadastro')

  const [aba, setAba] = useState<Aba>('diretrizes')

  if (!projeto) return <p className="hint">{L('Carregando…', 'Loading…')}</p>

  const abas: Array<[Aba, string]> = [
    ['diretrizes', L('Diretrizes', 'Guidelines')],
    ['setorizacao', L('Dados & setorização', 'Data & sectorization')],
    ['fluxo', L('Fluxo da auditoria', 'Audit flow')],
  ]

  return (
    <>
      <Segmented itens={abas} valor={aba} onChange={setAba} />

      {aba === 'diretrizes' ? (
        <Diretrizes projetoId={projeto.id} podeEditar={podeEditar} />
      ) : aba === 'setorizacao' ? (
        <Setorizacao projetoId={projeto.id} podeEditar={podeEditar} />
      ) : (
        <Fluxo />
      )}
    </>
  )
}

/* ------------------------------------------------------------- diretrizes */

function Diretrizes({ projetoId, podeEditar }: { projetoId: string; podeEditar: boolean }) {
  const { L } = useI18n()
  const [itens, setItens] = useState<Standard[]>([])
  const [rascunho, setRascunho] = useState<Rascunho | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [carregando, setCarregando] = useState(true)

  const carregar = useCallback(async () => {
    setErro(null)
    try {
      setItens((await api.standards.listar(projetoId, 'diretriz')).itens)
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : String(e))
    } finally {
      setCarregando(false)
    }
  }, [projetoId])

  useEffect(() => {
    carregar()
  }, [carregar])

  async function salvar() {
    if (!rascunho) return
    if (!rascunho.nome.trim()) {
      setErro(L('A diretriz precisa de um título.', 'The guideline needs a title.'))
      return
    }
    setErro(null)
    setSalvando(true)
    const corpo = { nome: rascunho.nome.trim(), referencia: rascunho.texto.trim() || null }
    try {
      if (rascunho.id) await api.standards.atualizar(rascunho.id, corpo)
      else await api.standards.criar({ projeto_id: projetoId, tipo: 'diretriz', ...corpo })
      setRascunho(null)
      await carregar()
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : String(e))
    } finally {
      setSalvando(false)
    }
  }

  async function remover(d: Standard) {
    if (!confirm(L(`Remover a diretriz "${d.nome}"?`, `Remove the guideline "${d.nome}"?`))) return
    setErro(null)
    try {
      await api.standards.remover(d.id)
      await carregar()
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : String(e))
    }
  }

  if (carregando) return <p className="hint">{L('Carregando…', 'Loading…')}</p>

  return (
    <>
      {podeEditar && !rascunho && (
        <div className="acoes">
          <button className="btn pri" onClick={() => setRascunho({ nome: '', texto: '' })}>
            + {L('Nova diretriz', 'New guideline')}
          </button>
        </div>
      )}

      {!rascunho && <Erro mensagem={erro} />}

      {rascunho && (
        <Editor
          titulo={rascunho.id ? L('Editar diretriz', 'Edit guideline') : L('Nova diretriz', 'New guideline')}
          onSalvar={salvar}
          onCancelar={() => {
            setRascunho(null)
            setErro(null)
          }}
          salvando={salvando}
          erro={erro}
        >
          <Campo rotulo={L('Título', 'Title')} largo>
            <input
              className="f"
              autoFocus
              value={rascunho.nome}
              onChange={(e) => setRascunho({ ...rascunho, nome: e.target.value })}
            />
          </Campo>
          <Campo rotulo={L('Diretriz', 'Guideline')} largo>
            <textarea
              className="f"
              rows={3}
              value={rascunho.texto}
              onChange={(e) => setRascunho({ ...rascunho, texto: e.target.value })}
            />
          </Campo>
        </Editor>
      )}

      {itens.length === 0 ? (
        <Vazio
          titulo={L('Nenhuma diretriz', 'No guidelines')}
          texto={L(
            'As diretrizes são as regras do PEB por escrito — coordenada compartilhada, nomenclatura, ritmo de entrega, LOD por fase. É delas que os critérios da auditoria derivam.',
            'Guidelines are the BEP rules written down — shared coordinates, naming, delivery cadence, LOD per phase. Audit criteria derive from them.',
          )}
        />
      ) : (
        <div className="card">
          {itens.map((d) => (
            <div key={d.id} className="libitem">
              <div className="lname">
                <b>{d.nome}</b>
                <span>{d.referencia ?? '—'}</span>
              </div>
              {podeEditar && (
                <>
                  <button
                    className="btn sm"
                    onClick={() =>
                      setRascunho({ id: d.id, nome: d.nome, texto: d.referencia ?? '' })
                    }
                  >
                    {L('editar', 'edit')}
                  </button>{' '}
                  <button className="btn sm danger" onClick={() => remover(d)}>
                    {L('remover', 'remove')}
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  )
}

/* ------------------------------------------------------------ setorização */

function Setorizacao({ projetoId, podeEditar }: { projetoId: string; podeEditar: boolean }) {
  const { L } = useI18n()
  const { projeto } = useProjeto()
  const [disciplinas, setDisciplinas] = useState<Disciplina[]>([])
  const [imagens, setImagens] = useState<Standard[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)

  const carregar = useCallback(async () => {
    setErro(null)
    try {
      const [ds, ss] = await Promise.all([
        api.disciplinas.listar(projetoId),
        api.standards.listar(projetoId, 'setorizacao'),
      ])
      setDisciplinas(ds.itens)
      setImagens(ss.itens)

      // Uma URL assinada por imagem existente. São poucas e expiram, então não
      // vale guardar — pedir a cada abertura da aba é o comportamento correto.
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
    } finally {
      setCarregando(false)
    }
  }, [projetoId])

  useEffect(() => {
    carregar()
  }, [carregar])

  /** OS SETORES SAEM DAS DISCIPLINAS, não de uma lista fixa. `areas` é o
   *  escopo declarado em cada disciplina (ADMIN, COLO1…), e é exatamente o que
   *  a matriz usa como coluna — se a lista viesse de outro lugar, um setor
   *  auditado poderia não ter onde receber imagem. */
  const setores = useMemo(() => {
    const todos = new Set<string>()
    for (const d of disciplinas) for (const a of d.areas) todos.add(a)
    return [...todos].sort()
  }, [disciplinas])

  const porSetor = useMemo(
    () => new Map(imagens.map((s) => [s.nome, s])),
    [imagens],
  )

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

  if (carregando) return <p className="hint">{L('Carregando…', 'Loading…')}</p>

  return (
    <>
      <div className="editor">
        <h3>{L('Dados do projeto', 'Project data')}</h3>
        <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>
          <b>
            {projeto?.codigo} — {projeto?.nome}
          </b>{' '}
          · {L('Cliente', 'Client')}: {projeto?.cliente_nome ?? '—'} ·{' '}
          {L('Coordenação', 'Coordination')}: {projeto?.coordenacao ?? '—'}
        </div>
      </div>

      <Erro mensagem={erro} />

      <p className="hint" style={{ margin: '0 4px 12px' }}>
        {L(
          'Imagens de referência da setorização e nomenclatura, para todos entenderem os setores. Os setores saem das áreas declaradas nas disciplinas — os mesmos que viram coluna na matriz.',
          'Reference images for sectorization and naming, so everyone understands the sectors. Sectors come from the areas declared on the disciplines — the same ones that become matrix columns.',
        )}
      </p>

      {setores.length === 0 ? (
        <Vazio
          titulo={L('Nenhum setor declarado', 'No sectors declared')}
          texto={L(
            'Os setores vêm das áreas das disciplinas do projeto. Declare-as em Configurações do projeto › Disciplinas e eles aparecem aqui.',
            'Sectors come from the areas on the project disciplines. Declare them under Project setup › Disciplines and they show up here.',
          )}
        />
      ) : (
        <div className="peb-setores">
          {setores.map((setor) => {
            const url = urls[setor]
            return (
              <div key={setor} className="card peb-setor">
                <div className="peb-setor-nome">{setor}</div>
                {url ? (
                  <img src={url} alt={setor} />
                ) : (
                  <div className="peb-setor-vazio">
                    {enviando === setor
                      ? L('Enviando…', 'Uploading…')
                      : L('Sem imagem', 'No image')}
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
      )}
    </>
  )
}

/* ------------------------------------------------------------------ fluxo */

/** O ciclo em que a auditoria se encaixa. Estático de propósito: é o processo
 *  contratado, igual em todo projeto — não há o que ler do banco. */
function Fluxo() {
  const { L } = useI18n()

  const etapas: Array<[string, string, boolean]> = [
    [L('Modelagem', 'Modeling'), L('Projetista', 'Designer'), false],
    [L('Entrega no ACC', 'ACC delivery'), L('Semanal', 'Weekly'), false],
    [L('Auditoria', 'Audit'), 'SPBIM', true],
    [L('RNC', 'NCR'), L('Não-conformidades', 'Non-conformities'), false],
    [L('Correção', 'Correction'), L('Fornecedor', 'Supplier'), false],
    [L('Republicação', 'Republish'), L('Nova versão', 'New version'), false],
  ]

  const bw = 168
  const gap = 22
  const largura = etapas.length * bw + (etapas.length - 1) * gap + 20
  const altura = 155
  const cx0 = 10 + bw / 2
  const cxN = 10 + (etapas.length - 1) * (bw + gap) + bw / 2

  return (
    <>
      <div className="card" style={{ padding: 16, overflowX: 'auto' }}>
        <svg viewBox={`0 0 ${largura} ${altura}`} style={{ minWidth: largura, maxWidth: '100%' }}>
          <defs>
            <marker
              id="peb-seta"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto"
            >
              <path
                d="M2 1L8 5L2 9"
                fill="none"
                stroke="var(--ink-3)"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </marker>
          </defs>

          {etapas.map(([titulo, papel, destaque], i) => {
            const x = 10 + i * (bw + gap)
            return (
              <g key={titulo}>
                {/* A auditoria é a única em accent: é onde a SPBIM entra, e o
                    diagrama existe para mostrar exatamente isso. Cor é
                    significado — as outras cinco não precisam dela. */}
                <rect
                  x={x}
                  y={40}
                  width={bw}
                  height={62}
                  rx={10}
                  fill={destaque ? 'var(--accent-soft)' : 'var(--panel-2)'}
                  stroke={destaque ? 'var(--accent)' : 'var(--line-2)'}
                  strokeWidth={destaque ? 1.5 : 0.5}
                />
                <text
                  x={x + bw / 2}
                  y={66}
                  textAnchor="middle"
                  fontSize={14}
                  fontWeight={600}
                  fill={destaque ? 'var(--accent)' : 'var(--ink)'}
                >
                  {titulo}
                </text>
                <text
                  x={x + bw / 2}
                  y={85}
                  textAnchor="middle"
                  fontSize={11.5}
                  fill="var(--ink-3)"
                >
                  {papel}
                </text>
                {i < etapas.length - 1 && (
                  <path
                    d={`M${x + bw} 71 L${x + bw + gap} 71`}
                    stroke="var(--ink-3)"
                    strokeWidth={1.5}
                    markerEnd="url(#peb-seta)"
                  />
                )}
              </g>
            )
          })}

          {/* O retorno: tracejado porque não é uma etapa, é a repetição. */}
          <path
            d={`M${cxN} 102 L${cxN} 128 L${cx0} 128 L${cx0} 102`}
            fill="none"
            stroke="var(--ink-3)"
            strokeWidth={1.2}
            strokeDasharray="5 4"
            markerEnd="url(#peb-seta)"
          />
          <text x={largura / 2} y={124} textAnchor="middle" fontSize={11} fill="var(--ink-3)">
            {L('ciclo por versão', 'per-version cycle')}
          </text>
        </svg>
      </div>

      <p className="hint">
        {L(
          'A auditoria (SPBIM) entra entre a entrega no ACC e a devolutiva de RNC — cada versão nova reinicia o ciclo.',
          'The audit (SPBIM) sits between ACC delivery and the NCR feedback — each new version restarts the cycle.',
        )}
      </p>
    </>
  )
}
