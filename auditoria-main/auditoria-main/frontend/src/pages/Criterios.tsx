/** SP-106 · Biblioteca de critérios.
 *
 *  O critério é canônico: aparece uma vez aqui e é instanciado em quantos
 *  checklists forem necessários. A coluna "usado em N" existe para deixar
 *  visível que uma edição aqui atinge todos eles.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'

import { Campo, Cabecalho, Chips, Editor, Erro, Segmented, Vazio } from '@/components/ui'
import { useI18n } from '@/i18n'
import { ApiError, api } from '@/lib/api'
import type { Automacao, ChecklistTipo, CriterioComUso, CriterioNivel } from '@/lib/types'
import { useProjeto } from '@/projeto/ProjetoContext'

const CHECKLISTS: Array<[ChecklistTipo, string, string]> = [
  ['geral', 'Geral', 'General'],
  ['ifc', 'IFC', 'IFC'],
  ['4d', '4D Parâmetros', '4D Parameters'],
  ['lod400', 'LOD 400', 'LOD 400'],
  ['lod500', 'LOD 500', 'LOD 500'],
]

const AUTOMACOES: Array<[Automacao, string, string, string]> = [
  ['auto', 'Auto', 'Auto', 'a'],
  ['design_automation', 'Design Auto', 'Design Auto', 'd'],
  ['manual', 'Manual', 'Manual', 'm'],
]

type Rascunho = {
  id?: string
  codigo: string
  nome_pt: string
  nome_en: string
  categoria: string
  nivel: CriterioNivel
  automacao: Automacao
  parametro_esperado: string
  instrucao: string
}

const VAZIO: Rascunho = {
  codigo: '',
  nome_pt: '',
  nome_en: '',
  categoria: '',
  nivel: 'modelo',
  automacao: 'manual',
  parametro_esperado: '',
  instrucao: '',
}

export default function Criterios() {
  const { projeto, carregando } = useProjeto()
  const { L, lang } = useI18n()
  const [criterios, setCriterios] = useState<CriterioComUso[]>([])
  const [checklist, setChecklist] = useState<ChecklistTipo>('geral')
  const [selecionados, setSelecionados] = useState<string[]>([])
  const [rascunho, setRascunho] = useState<Rascunho | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [modo, setModo] = useState<'biblioteca' | 'checklist'>('biblioteca')

  const carregar = useCallback(async () => {
    if (!projeto) return
    setCriterios((await api.criterios.listar(projeto.id)).itens)
  }, [projeto])

  const carregarChecklist = useCallback(async () => {
    if (!projeto) return
    const c = await api.checklists.obter(checklist, projeto.id)
    setSelecionados(c.itens.map((i) => i.criterio_id))
  }, [projeto, checklist])

  useEffect(() => {
    carregar()
  }, [carregar])

  useEffect(() => {
    if (modo === 'checklist') carregarChecklist()
  }, [modo, carregarChecklist])

  const categorias = useMemo(
    () => [...new Set(criterios.map((c) => c.categoria).filter(Boolean))] as string[],
    [criterios],
  )

  if (carregando) return <p className="hint">{L('Carregando…', 'Loading…')}</p>
  if (!projeto) {
    return (
      <>
        <Cabecalho titulo={L('Biblioteca de critérios', 'Criteria library')} />
        <Vazio
          titulo={L('Nenhum projeto', 'No project')}
          texto={L('Cadastre um projeto primeiro.', 'Register a project first.')}
        />
      </>
    )
  }

  async function salvar() {
    if (!rascunho || !projeto) return
    setErro(null)
    setSalvando(true)
    const corpo = {
      nome_pt: rascunho.nome_pt,
      nome_en: rascunho.nome_en,
      categoria: rascunho.categoria || null,
      nivel: rascunho.nivel,
      automacao: rascunho.automacao,
      parametro_esperado: rascunho.parametro_esperado || null,
      instrucao: rascunho.instrucao || null,
    }
    try {
      if (rascunho.id) await api.criterios.atualizar(rascunho.id, corpo)
      else await api.criterios.criar({ projeto_id: projeto.id, codigo: rascunho.codigo, ...corpo })
      setRascunho(null)
      await carregar()
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : String(e))
    } finally {
      setSalvando(false)
    }
  }

  async function remover(id: string) {
    setErro(null)
    try {
      await api.criterios.remover(id)
      await carregar()
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : String(e))
    }
  }

  async function salvarChecklist() {
    if (!projeto) return
    setErro(null)
    setSalvando(true)
    try {
      await api.checklists.definirItens(checklist, projeto.id, selecionados)
      await carregar()
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : String(e))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <>
      <Cabecalho
        titulo={L('Biblioteca de critérios', 'Criteria library')}
        sub={L(
          'Cada critério existe uma vez e é reutilizado nos checklists. Editar aqui reflete em todas as auditorias que o usam — é o que substitui a duplicação entre planilhas.',
          'Each criterion exists once and is reused across checklists. Editing here reflects in every audit that uses it — this is what replaces the duplication between spreadsheets.',
        )}
      />

      <Segmented
        itens={[
          ['biblioteca', L('Biblioteca', 'Library')],
          ['checklist', L('Compor checklist', 'Compose checklist')],
        ]}
        valor={modo}
        onChange={setModo}
      />

      {!rascunho && <Erro mensagem={erro} />}

      {modo === 'biblioteca' ? (
        <>
          <div className="acoes">
            <button className="btn pri" onClick={() => setRascunho({ ...VAZIO })}>
              + {L('Novo critério', 'New criterion')}
            </button>
            <span className="hint" style={{ margin: 0 }}>
              {criterios.length} {L('critério(s)', 'criteria')}
              {categorias.length > 0 && ` · ${categorias.length} ${L('categoria(s)', 'categories')}`}
            </span>
          </div>

          {rascunho && (
            <Editor
              titulo={
                rascunho.id ? L('Editar critério', 'Edit criterion') : L('Novo critério', 'New criterion')
              }
              onSalvar={salvar}
              onCancelar={() => {
                setRascunho(null)
                setErro(null)
              }}
              salvando={salvando}
              erro={erro}
            >
              <Campo rotulo={L('Código', 'Code')}>
                <input
                  className="f code"
                  placeholder="MODEL_NAME"
                  disabled={!!rascunho.id}
                  value={rascunho.codigo}
                  onChange={(e) =>
                    setRascunho({ ...rascunho, codigo: e.target.value.toUpperCase() })
                  }
                />
              </Campo>
              <Campo rotulo={L('Categoria', 'Category')}>
                <input
                  className="f"
                  placeholder={L('Aspectos gerais', 'General aspects')}
                  value={rascunho.categoria}
                  onChange={(e) => setRascunho({ ...rascunho, categoria: e.target.value })}
                />
              </Campo>
              <Campo rotulo={L('Nome (PT)', 'Name (PT)')}>
                <input
                  className="f"
                  value={rascunho.nome_pt}
                  onChange={(e) => setRascunho({ ...rascunho, nome_pt: e.target.value })}
                />
              </Campo>
              <Campo rotulo={L('Nome (EN)', 'Name (EN)')}>
                <input
                  className="f"
                  value={rascunho.nome_en}
                  onChange={(e) => setRascunho({ ...rascunho, nome_en: e.target.value })}
                />
              </Campo>
              <Campo rotulo={L('Nível', 'Level')}>
                <select
                  className="f"
                  value={rascunho.nivel}
                  onChange={(e) =>
                    setRascunho({ ...rascunho, nivel: e.target.value as CriterioNivel })
                  }
                >
                  <option value="modelo">{L('Modelo (pass/fail)', 'Model (pass/fail)')}</option>
                  <option value="elemento">
                    {L('Elemento (explode em IDs)', 'Element (explodes into IDs)')}
                  </option>
                </select>
              </Campo>
              <Campo rotulo={L('Automação', 'Automation')}>
                <select
                  className="f"
                  value={rascunho.automacao}
                  onChange={(e) =>
                    setRascunho({ ...rascunho, automacao: e.target.value as Automacao })
                  }
                >
                  {AUTOMACOES.map(([v, pt, en]) => (
                    <option key={v} value={v}>
                      {L(pt, en)}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo rotulo={L('Parâmetro esperado', 'Expected parameter')} largo>
                <input
                  className="f code"
                  placeholder="4D_AREA · BF_FIRE RATING"
                  value={rascunho.parametro_esperado}
                  onChange={(e) => setRascunho({ ...rascunho, parametro_esperado: e.target.value })}
                />
              </Campo>
              <Campo rotulo={L('Instrução de verificação', 'Verification instruction')} largo>
                <textarea
                  className="f"
                  rows={2}
                  value={rascunho.instrucao}
                  onChange={(e) => setRascunho({ ...rascunho, instrucao: e.target.value })}
                />
              </Campo>
            </Editor>
          )}

          <div className="card">
            {criterios.map((c) => {
              const auto = AUTOMACOES.find(([v]) => v === c.automacao)
              return (
                <div className="libitem" key={c.id}>
                  <span className="lcode">{c.codigo}</span>
                  <div className="lname">
                    <b>{lang === 'pt' ? c.nome_pt : c.nome_en}</b>
                    <span>
                      {[c.categoria, c.parametro_esperado, c.instrucao].filter(Boolean).join(' · ') ||
                        '—'}
                    </span>
                  </div>
                  <span className={`auto ${auto?.[3] ?? 'm'}`}>{auto ? L(auto[1], auto[2]) : ''}</span>
                  <span className="used">
                    {c.usos > 0
                      ? L(`usado em ${c.usos}`, `used in ${c.usos}`)
                      : L('sem uso', 'unused')}
                  </span>
                  <button className="btn sm" onClick={() => setRascunho({
                    id: c.id,
                    codigo: c.codigo,
                    nome_pt: c.nome_pt,
                    nome_en: c.nome_en,
                    categoria: c.categoria ?? '',
                    nivel: c.nivel,
                    automacao: c.automacao,
                    parametro_esperado: c.parametro_esperado ?? '',
                    instrucao: c.instrucao ?? '',
                  })}>
                    {L('Editar', 'Edit')}
                  </button>
                  {c.usos === 0 && (
                    <button className="btn sm danger" onClick={() => remover(c.id)}>
                      {L('Excluir', 'Delete')}
                    </button>
                  )}
                </div>
              )
            })}
            {criterios.length === 0 && (
              <div className="empty">
                <b>{L('Biblioteca vazia', 'Empty library')}</b>
                {L(
                  'Os critérios derivam do PEB e do A5.37. Cadastre-os uma vez e reutilize em todos os checklists.',
                  'Criteria derive from the BEP and A5.37. Register them once and reuse across every checklist.',
                )}
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="acoes">
            <Chips
              opcoes={CHECKLISTS.map(([v, pt, en]) => [v, L(pt, en)] as [ChecklistTipo, string])}
              valor={[checklist]}
              onChange={(v) => {
                const outro = v.find((x) => x !== checklist)
                if (outro) setChecklist(outro)
              }}
            />
          </div>

          <div className="card" style={{ marginBottom: 14 }}>
            {criterios.map((c) => {
              const dentro = selecionados.includes(c.id)
              return (
                <div className="libitem" key={c.id}>
                  <input
                    type="checkbox"
                    checked={dentro}
                    onChange={() =>
                      setSelecionados(
                        dentro ? selecionados.filter((x) => x !== c.id) : [...selecionados, c.id],
                      )
                    }
                  />
                  <span className="lcode">{c.codigo}</span>
                  <div className="lname">
                    <b>{lang === 'pt' ? c.nome_pt : c.nome_en}</b>
                    <span>{c.categoria ?? '—'}</span>
                  </div>
                </div>
              )
            })}
            {criterios.length === 0 && (
              <div className="empty">
                {L('Cadastre critérios na biblioteca primeiro.', 'Register criteria in the library first.')}
              </div>
            )}
          </div>

          <div className="eact">
            <button className="btn pri" onClick={salvarChecklist} disabled={salvando}>
              {salvando
                ? L('Salvando…', 'Saving…')
                : L(
                    `Salvar checklist (${selecionados.length} itens)`,
                    `Save checklist (${selecionados.length} items)`,
                  )}
            </button>
          </div>

          <p className="hint">
            {L(
              'Salvar substitui a composição inteira deste checklist — a ordem dos itens segue a ordem da lista.',
              'Saving replaces this checklist entirely — item order follows the list order.',
            )}
          </p>
        </>
      )}
    </>
  )
}
