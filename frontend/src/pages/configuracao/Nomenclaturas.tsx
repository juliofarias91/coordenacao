/** SP-104 · Nomenclaturas & padrões.
 *
 *  O padrão de nomenclatura é editado segmento a segmento — é essa estrutura
 *  que o validador da Fase 3 (SP-301) consome para dizer, campo a campo, onde
 *  o nome do arquivo divergiu.
 */
import { useCallback, useEffect, useState } from 'react'

import { Campo, Erro } from '@/components/ui'
import ValidadorNome from '@/components/ValidadorNome'
import { useI18n } from '@/i18n'
import { ApiError, api } from '@/lib/api'
import type { Empresa, Segmento, Standard, TipoStandard } from '@/lib/types'
import { useProjeto } from '@/projeto/ProjetoContext'

const TIPOS: Array<[TipoStandard, string, string]> = [
  ['nomenclatura', 'Nomenclatura', 'Nomenclature'],
  ['conjunto_esperado', 'Conjunto esperado', 'Expected set'],
  ['vocabulario', 'Vocabulário', 'Vocabulary'],
  ['mapeamento', 'Mapeamento', 'Mapping'],
]

const SEGMENTOS_SUGERIDOS: Segmento[] = [
  { k: 'PROJETO', vals: [] },
  { k: 'MACRO', vals: ['A', 'C', 'M', 'S'] },
  { k: 'DISC', vals: [] },
  { k: 'SUB', vals: [] },
  { k: 'SETOR', vals: [] },
  // Opcional: o sufixo some para ferramentas que não são Revit/IFC.
  { k: 'SW', vals: ['R22', 'R24', 'RX3'], opcional: true },
]

export default function AbaNomenclaturas() {
  const { projeto } = useProjeto()
  const { L } = useI18n()
  const [standards, setStandards] = useState<Standard[]>([])
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [segmentos, setSegmentos] = useState<Segmento[]>([])
  const [temPadrao, setTemPadrao] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [salvo, setSalvo] = useState(false)
  const [novo, setNovo] = useState({ nome: '', tipo: 'nomenclatura' as TipoStandard, referencia: '' })

  const carregar = useCallback(async () => {
    if (!projeto) return
    const [listaStandards, listaEmpresas] = await Promise.all([
      api.standards.listar(projeto.id),
      api.empresas.listar(),
    ])
    setStandards(listaStandards.itens)
    setEmpresas(listaEmpresas.itens)
    try {
      const padrao = await api.nomenclatura.obter(projeto.id)
      setSegmentos(padrao.segmentos)
      setTemPadrao(true)
    } catch {
      // 404 = projeto ainda sem padrão; oferece a sugestão do PEB.
      setSegmentos(
        SEGMENTOS_SUGERIDOS.map((s) =>
          s.k === 'PROJETO' ? { k: 'PROJETO', vals: [projeto.codigo] } : s,
        ),
      )
      setTemPadrao(false)
    }
  }, [projeto])

  useEffect(() => {
    carregar()
  }, [carregar])

  if (!projeto) return null

  async function salvarPadrao() {
    if (!projeto) return
    setErro(null)
    setSalvo(false)
    try {
      await api.nomenclatura.definir(projeto.id, segmentos)
      setTemPadrao(true)
      setSalvo(true)
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : String(e))
    }
  }

  async function criarStandard() {
    if (!projeto || !novo.nome.trim()) return
    setErro(null)
    try {
      await api.standards.criar({ projeto_id: projeto.id, ...novo })
      setNovo({ nome: '', tipo: 'nomenclatura', referencia: '' })
      await carregar()
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : String(e))
    }
  }

  const exemplo = segmentos.map((s) => s.vals[0] ?? s.k).join('-')

  return (
    <>
      <div className="editor">
        <h3>{L('Padrão de nomenclatura de arquivos', 'File naming standard')}</h3>
        <Erro mensagem={erro} />
        {salvo && (
          <div className="pill ok" style={{ marginBottom: 12 }}>
            {L('Padrão salvo — o anterior foi arquivado', 'Standard saved — previous archived')}
          </div>
        )}

        <p className="hint" style={{ margin: '0 0 14px' }}>
          {L('Fica assim:', 'Reads as:')} <span className="code">{exemplo || '—'}</span>
          {!temPadrao && ` · ${L('(sugestão — ainda não salvo)', '(suggestion — not saved yet)')}`}
        </p>

        <div className="card" style={{ marginBottom: 14 }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th>{L('Segmento', 'Segment')}</th>
                <th>{L('Valores aceitos (vazio = livre)', 'Accepted values (empty = free)')}</th>
                <th style={{ textAlign: 'center' }}>{L('Opcional', 'Optional')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {segmentos.map((s, i) => (
                <tr key={i}>
                  <td className="co">{i + 1}</td>
                  <td>
                    <input
                      className="f"
                      value={s.k}
                      onChange={(e) => {
                        const copia = [...segmentos]
                        copia[i] = { ...s, k: e.target.value.toUpperCase() }
                        setSegmentos(copia)
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="f"
                      placeholder={L('separe por vírgula', 'comma separated')}
                      value={s.vals.join(', ')}
                      onChange={(e) => {
                        const copia = [...segmentos]
                        copia[i] = {
                          ...s,
                          vals: e.target.value
                            .split(',')
                            .map((v) => v.trim())
                            .filter(Boolean),
                        }
                        setSegmentos(copia)
                      }}
                    />
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={!!s.opcional}
                      title={L(
                        'Pode faltar no fim do nome (ex.: entregas de Navisworks, sem sufixo de software)',
                        'May be missing at the end of the name (e.g. Navisworks deliveries, no software suffix)',
                      )}
                      onChange={(e) => {
                        const copia = [...segmentos]
                        copia[i] = { ...s, opcional: e.target.checked }
                        setSegmentos(copia)
                      }}
                    />
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      className="btn sm danger"
                      onClick={() => setSegmentos(segmentos.filter((_, j) => j !== i))}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="eact">
          <button className="btn pri" onClick={salvarPadrao}>
            {L('Salvar padrão', 'Save standard')}
          </button>
          <button
            className="btn"
            onClick={() => setSegmentos([...segmentos, { k: '', vals: [] }])}
          >
            + {L('Segmento', 'Segment')}
          </button>
        </div>
      </div>

      {temPadrao && <ValidadorNome projetoId={projeto.id} empresas={empresas} />}

      <div className="sectitle">{L('Outros padrões', 'Other standards')}</div>
      <div className="card" style={{ marginBottom: 14 }}>
        <table>
          <thead>
            <tr>
              <th>{L('Nome', 'Name')}</th>
              <th>{L('Tipo', 'Type')}</th>
              <th>{L('Referência', 'Reference')}</th>
            </tr>
          </thead>
          <tbody>
            {standards.map((s) => {
              const t = TIPOS.find(([v]) => v === s.tipo)
              return (
                <tr key={s.id}>
                  <td>
                    <b>{s.nome}</b>
                  </td>
                  <td className="co">{t ? L(t[1], t[2]) : s.tipo}</td>
                  <td className="co">{s.referencia ?? '—'}</td>
                </tr>
              )
            })}
            {standards.length === 0 && (
              <tr>
                <td colSpan={3} className="empty">
                  {L(
                    'Nenhum padrão. Cadastre worksets, dicionário IFC, mapeamentos…',
                    'No standards yet. Register worksets, IFC dictionary, mappings…',
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="editor">
        <h3>{L('Novo padrão', 'New standard')}</h3>
        <div className="frow">
          <Campo rotulo={L('Nome', 'Name')}>
            <input
              className="f"
              value={novo.nome}
              onChange={(e) => setNovo({ ...novo, nome: e.target.value })}
            />
          </Campo>
          <Campo rotulo={L('Tipo', 'Type')}>
            <select
              className="f"
              value={novo.tipo}
              onChange={(e) => setNovo({ ...novo, tipo: e.target.value as TipoStandard })}
            >
              {TIPOS.map(([v, pt, en]) => (
                <option key={v} value={v}>
                  {L(pt, en)}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo={L('Referência', 'Reference')} largo>
            <input
              className="f"
              placeholder="IfcElementAssembly · WORKSET LIST · …"
              value={novo.referencia}
              onChange={(e) => setNovo({ ...novo, referencia: e.target.value })}
            />
          </Campo>
        </div>
        <div className="eact">
          <button className="btn pri" onClick={criarStandard}>
            {L('Adicionar', 'Add')}
          </button>
        </div>
      </div>
    </>
  )
}
