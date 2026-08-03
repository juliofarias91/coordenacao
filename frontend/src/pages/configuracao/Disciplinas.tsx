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

/** As quatro macrodisciplinas e o token de cor de cada uma.
 *
 *  A ABA "CORES" FOI ABSORVIDA AQUI (31/07/2026, a pedido). Ela era uma tabela
 *  de quatro linhas, só leitura, dizendo qual cor é qual macrodisciplina — uma
 *  legenda numa aba separada da coisa que ela legenda. Agora a cor aparece ao
 *  lado de cada disciplina, que é onde ela significa algo, e a legenda é uma
 *  `.hint` junto da tabela (a regra do CLAUDE.md: o que precisa ser explicado
 *  vira hint JUNTO DO DADO).
 *
 *  A COR NÃO VIROU EDITÁVEL, e essa é a parte que importa. Ela sai de `macro` e
 *  a paleta é categórica VALIDADA — banda de luminosidade, piso de saturação,
 *  daltonismo. Uma cor por disciplina daria duas fontes para a mesma informação
 *  e deixaria escolher um tom que some no modo escuro ou some para um daltônico.
 *  Por isso a migration 0015 traz `nome` e NÃO traz `cor`.
 *
 *  O TOKEN e não o hex da API: o modo escuro tem passos próprios da paleta, e
 *  `cor_macro` devolve um valor só. É a regra "ao criar gráfico" do CLAUDE.md. */
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
  nome: string
  macro: MacroDisc
  disc: string
  sub: string
  projetista_id: string
  nomenclatura_id: string
  checklists: ChecklistTipo[]
  areas: string[]
}

const VAZIO: Rascunho = {
  nome: '',
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
      // `|| null` e não a string vazia: "sem nome por extenso" é ausência, e o
      // banco a representa com NULL. Gravar '' faria a tela mostrar
      // "  (STRC-STEEL)" com um vazio antes do parêntese.
      nome: rascunho.nome.trim() || null,
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
          {/* O NOME PRIMEIRO, e é de propósito: quem cadastra pensa "vou pôr a
              estrutura metálica" e só depois traduz isso em sigla. Pedir a sigla
              antes é pedir o código de algo que a pessoa ainda não nomeou. */}
          <Campo rotulo={L('Nome da disciplina', 'Discipline name')} largo>
            <input
              className="f"
              placeholder={L('Arquitetura, Estrutura metálica…', 'Architecture, Steel structure…')}
              value={rascunho.nome}
              onChange={(e) => setRascunho({ ...rascunho, nome: e.target.value })}
            />
          </Campo>
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
          {/* A COR da macrodisciplina escolhida, à vista no momento da escolha.
              É o que sobrou de útil da aba Cores: mostrar a consequência da
              escolha enquanto ela é feita, em vez de numa tabela à parte. */}
          <Campo rotulo={L('Cor', 'Colour')}>
            <div className="disc-cor">
              <span className="macro" style={{ background: `var(--macro-${rascunho.macro})` }} />
              <span className="hint" style={{ margin: 0 }}>
                {L('vem da macrodisciplina', 'comes from the macro-discipline')}
              </span>
            </div>
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
                    {/* O TOKEN, não `d.cor_macro`: a paleta tem passos próprios
                        no modo escuro e o hex da API é um valor só. */}
                    <span className="macro" style={{ background: `var(--macro-${d.macro})` }} />
                    <div>
                      {/* NOME EM CIMA E SIGLA ABAIXO quando há nome: é o nome que
                          se procura na lista, e o código que se confere. Sem
                          nome, a sigla assume a primeira linha em vez de deixar
                          um vazio ali. */}
                      <div className={d.nome ? 'disc-nome' : 'code'}>{d.nome ?? d.codigo}</div>
                      <div className="mmeta">
                        {d.nome && <span className="code">{d.codigo}</span>}
                        {d.nome && ' · '}
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
                        nome: d.nome ?? '',
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

      {/* A LEGENDA DE COR, que era uma aba inteira. Aqui ela fica junto da
          tabela que usa as cores, e é o que a torna legível: quatro amostras numa
          linha se comparam de relance, que era o único trabalho que a aba fazia. */}
      <div className="disc-legenda">
        {MACROS.map(([v, rotulo]) => (
          <span key={v} className="disc-legenda-item">
            <span className="macro" style={{ background: `var(--macro-${v})` }} />
            <span className="code">{v}</span>
            <span className="co">{rotulo}</span>
          </span>
        ))}
      </div>

      <p className="hint">
        {L(
          'O código é derivado de DISC-SUB e não é digitado — assim ele nunca diverge dos campos que o compõem. O nome por extenso é opcional e serve à leitura: quem identifica a disciplina no nome do arquivo é sempre o código.',
          'The code derives from DISC-SUB and is never typed — so it cannot drift from its parts. The full name is optional and serves reading: what identifies the discipline in a file name is always the code.',
        )}
      </p>
      <p className="hint">
        {L(
          'A cor identifica a MACRODISCIPLINA em listas, na matriz e nos gráficos, e não se escolhe por disciplina: a paleta foi validada para os dois temas e para daltonismo, e uma cor livre por disciplina quebraria isso. Para trocar a cor de uma disciplina, mude a macrodisciplina dela.',
          'The colour identifies the MACRO-DISCIPLINE in lists, in the matrix and in charts, and is not picked per discipline: the palette was validated for both themes and for colour blindness, and a free colour per discipline would break that. To change a discipline’s colour, change its macro-discipline.',
        )}
      </p>
    </>
  )
}
