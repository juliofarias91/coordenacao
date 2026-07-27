/** SP-105 · Disciplinas — o elo do cadastro.
 *
 *  É aqui que projetista, checklists, nomenclatura e áreas se encontram. A
 *  execução da auditoria (Fase 2) lê esta tela para saber quais abas abrir.
 */
import { useCallback, useEffect, useState } from 'react'

import { Campo, Chips, Editor, Erro } from '@/components/ui'
import { useI18n } from '@/i18n'
import { ApiError, api } from '@/lib/api'
import type { ChecklistTipo, Disciplina, Empresa, MacroDisc, Standard } from '@/lib/types'
import { useProjeto } from '@/projeto/ProjetoContext'

const MACROS: Array<[MacroDisc, string]> = [
  ['A', 'ARCH'],
  ['C', 'CIVIL/ESTRUT'],
  ['M', 'MEP'],
  ['S', 'SITE'],
]

const CHECKLISTS: Array<[ChecklistTipo, string, string]> = [
  ['geral', 'Geral', 'General'],
  ['ifc', 'IFC', 'IFC'],
  ['4d', '4D Parâmetros', '4D Parameters'],
  ['lod400', 'LOD 400', 'LOD 400'],
  ['lod500', 'LOD 500', 'LOD 500'],
]

// Setores do CPQ11 (especificação, seção 2.1). Editáveis por projeto no campo.
const AREAS_SUGERIDAS = ['ADMIN', 'COLO1', 'COLO2', 'COLO3', 'COLO4', 'COLO5', 'SITE', 'UTLS']

type Rascunho = {
  id?: string
  macro: MacroDisc
  disc: string
  sub: string
  projetista_id: string
  nomenclatura_id: string
  checklists: ChecklistTipo[]
  areas: string[]
}

const VAZIO: Rascunho = {
  macro: 'A',
  disc: '',
  sub: 'NONE',
  projetista_id: '',
  nomenclatura_id: '',
  checklists: [],
  areas: [],
}

export default function AbaDisciplinas() {
  const { projeto } = useProjeto()
  const { L } = useI18n()
  const [disciplinas, setDisciplinas] = useState<Disciplina[]>([])
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [nomenclaturas, setNomenclaturas] = useState<Standard[]>([])
  const [rascunho, setRascunho] = useState<Rascunho | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async () => {
    if (!projeto) return
    const [d, e, s] = await Promise.all([
      api.disciplinas.listar(projeto.id),
      api.empresas.listar(),
      api.standards.listar(projeto.id),
    ])
    setDisciplinas(d.itens)
    setEmpresas(e.itens)
    setNomenclaturas(s.itens.filter((x) => x.tipo === 'nomenclatura'))
  }, [projeto])

  useEffect(() => {
    carregar()
  }, [carregar])

  if (!projeto) return null

  async function salvar() {
    if (!rascunho || !projeto) return
    setErro(null)
    setSalvando(true)
    const corpo = {
      macro: rascunho.macro,
      disc: rascunho.disc.toUpperCase(),
      sub: rascunho.sub.toUpperCase() || 'NONE',
      projetista_id: rascunho.projetista_id || null,
      nomenclatura_id: rascunho.nomenclatura_id || null,
      checklists: rascunho.checklists,
      areas: rascunho.areas,
    }
    try {
      if (rascunho.id) await api.disciplinas.atualizar(rascunho.id, corpo)
      else await api.disciplinas.criar({ projeto_id: projeto.id, ...corpo })
      setRascunho(null)
      await carregar()
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : String(e))
    } finally {
      setSalvando(false)
    }
  }

  const nomeEmpresa = (id: string | null) => empresas.find((e) => e.id === id)?.nome ?? '—'

  return (
    <>
      <div className="acoes">
        <button className="btn pri" onClick={() => setRascunho({ ...VAZIO })}>
          + {L('Nova disciplina', 'New discipline')}
        </button>
      </div>

      {!rascunho && <Erro mensagem={erro} />}

      {rascunho && (
        <Editor
          titulo={
            rascunho.id ? L('Editar disciplina', 'Edit discipline') : L('Nova disciplina', 'New discipline')
          }
          onSalvar={salvar}
          onCancelar={() => {
            setRascunho(null)
            setErro(null)
          }}
          salvando={salvando}
          erro={erro}
        >
          <Campo rotulo={L('Macrodisciplina', 'Macro-discipline')}>
            <select
              className="f"
              value={rascunho.macro}
              onChange={(e) => setRascunho({ ...rascunho, macro: e.target.value as MacroDisc })}
            >
              {MACROS.map(([v, rotulo]) => (
                <option key={v} value={v}>
                  {v} — {rotulo}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo={L('Projetista', 'Designer')}>
            <select
              className="f"
              value={rascunho.projetista_id}
              onChange={(e) => setRascunho({ ...rascunho, projetista_id: e.target.value })}
            >
              <option value="">{L('— a definir —', '— to define —')}</option>
              {empresas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo={L('Disciplina (DISC)', 'Discipline (DISC)')}>
            <input
              className="f code"
              placeholder="STRC"
              value={rascunho.disc}
              onChange={(e) => setRascunho({ ...rascunho, disc: e.target.value.toUpperCase() })}
            />
          </Campo>
          <Campo rotulo={L('Subdisciplina (SUB)', 'Subdiscipline (SUB)')}>
            <input
              className="f code"
              placeholder="STEEL / NONE"
              value={rascunho.sub}
              onChange={(e) => setRascunho({ ...rascunho, sub: e.target.value.toUpperCase() })}
            />
          </Campo>
          <Campo rotulo={L('Nomenclatura', 'Nomenclature')} largo>
            <select
              className="f"
              value={rascunho.nomenclatura_id}
              onChange={(e) => setRascunho({ ...rascunho, nomenclatura_id: e.target.value })}
            >
              <option value="">{L('— padrão do projeto —', '— project default —')}</option>
              {nomenclaturas.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo={L('Auditorias aplicáveis', 'Applicable audits')} largo>
            <Chips
              opcoes={CHECKLISTS.map(([v, pt, en]) => [v, L(pt, en)] as [ChecklistTipo, string])}
              valor={rascunho.checklists}
              onChange={(checklists) => setRascunho({ ...rascunho, checklists })}
            />
          </Campo>
          <Campo rotulo={L('Áreas auditadas', 'Audited areas')} largo>
            <Chips
              opcoes={AREAS_SUGERIDAS.map((a) => [a, a] as [string, string])}
              valor={rascunho.areas}
              onChange={(areas) => setRascunho({ ...rascunho, areas })}
            />
          </Campo>
        </Editor>
      )}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>{L('Disciplina', 'Discipline')}</th>
              <th>{L('Projetista', 'Designer')}</th>
              <th>{L('Auditorias', 'Audits')}</th>
              <th>{L('Áreas', 'Areas')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {disciplinas.map((d) => (
              <tr key={d.id}>
                <td>
                  <div className="mcell">
                    <span className="macro" style={{ background: d.cor_macro }} />
                    <div>
                      <div className="code">{d.codigo}</div>
                      <div className="mmeta">
                        {MACROS.find(([v]) => v === d.macro)?.[1] ?? d.macro}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="co">{nomeEmpresa(d.projetista_id)}</td>
                <td className="co">
                  {d.checklists
                    .map((c) => {
                      const achado = CHECKLISTS.find(([v]) => v === c)
                      return achado ? L(achado[1], achado[2]) : c
                    })
                    .join(' · ') || '—'}
                </td>
                <td className="co">{d.areas.join(', ') || '—'}</td>
                <td style={{ textAlign: 'right' }}>
                  <button
                    className="btn sm"
                    onClick={() =>
                      setRascunho({
                        id: d.id,
                        macro: d.macro,
                        disc: d.disc,
                        sub: d.sub,
                        projetista_id: d.projetista_id ?? '',
                        nomenclatura_id: d.nomenclatura_id ?? '',
                        checklists: d.checklists,
                        areas: d.areas,
                      })
                    }
                  >
                    {L('Editar', 'Edit')}
                  </button>
                </td>
              </tr>
            ))}
            {disciplinas.length === 0 && (
              <tr>
                <td colSpan={5} className="empty">
                  {L('Nenhuma disciplina cadastrada.', 'No disciplines yet.')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="hint">
        {L(
          'O código é derivado de DISC-SUB e não é digitado — assim ele nunca diverge dos campos que o compõem.',
          'The code derives from DISC-SUB and is never typed — so it cannot drift from its parts.',
        )}
      </p>
    </>
  )
}
