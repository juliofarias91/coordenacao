/** Padrões avançados de nomenclatura — portados do Auditer.
 *
 *  Convivem com o padrão do projeto (aba ao lado) sem substituí-lo:
 *    · o padrão do PROJETO vive no backend, vale para o time todo e é o que
 *      gera penalidade, notificação e trilha;
 *    · estes vivem no navegador de quem audita, aceitam separador por bloco e
 *      tipos (data, número, texto), e servem para conferir entregas que não são
 *      modelo — PDF de spec, planilha de controle, relatório.
 */
import { useMemo, useRef, useState } from 'react'

import { useI18n } from '@/i18n'
import {
  accPresetPatterns,
  describeSegment,
  exampleFor,
  lintPattern,
  newPattern,
  newSegment,
  patternToRegex,
  validateName,
  type Padrao,
  type SegmentoPadrao,
} from '@/lib/auditer/patterns'
import EditorSegmento from '@/pages/configuracao/nomenclatura/EditorSegmento'
import type { Bancada } from '@/pages/configuracao/nomenclatura/estado'

/** O padrão lido como cadeia de blocos e separadores. */
function Previa({ padrao }: { padrao: Padrao }) {
  const extensoes = (padrao.extensions ?? []).filter(Boolean)
  return (
    <div className="aud-previa">
      {padrao.segments.map((seg, i) => (
        <span key={seg.id} className="aud-previa-par">
          {i > 0 && (
            <span className="code co">
              {seg.sep === ' ' ? '␣' : seg.sep === '' ? '·' : seg.sep}
            </span>
          )}
          <span className={`setp${seg.type === 'literal' ? '' : ' ok'}`}>
            {seg.label && <span className="co">{seg.label}:&nbsp;</span>}
            {describeSegment(seg)}
          </span>
        </span>
      ))}
      {extensoes.length > 0 && <span className="code co">.{extensoes.join(' | .')}</span>}
    </div>
  )
}

/** Testador ao vivo: digitar um nome e ver o veredito na hora. */
function Testador({ padrao }: { padrao: Padrao }) {
  const { L } = useI18n()
  const [nome, setNome] = useState('')
  const veredicto = useMemo(
    () => (nome.trim() ? validateName(nome.trim(), padrao) : null),
    [nome, padrao],
  )

  return (
    <>
      <div className="frow">
        <div className="full">
          <label className="fl">{L('Testar um nome', 'Test a name')}</label>
          <input
            className="f code"
            placeholder={exampleFor(padrao)}
            value={nome}
            onChange={(e) => setNome(e.target.value)}
          />
        </div>
      </div>

      {veredicto &&
        (veredicto.ok ? (
          <p className="aud-bom">
            {L('O nome está de acordo com o padrão.', 'The name matches the pattern.')}
          </p>
        ) : (
          <ul className="aud-lista">
            {veredicto.issues.map((p, i) => (
              <li key={i}>
                <b className="aud-ruim">
                  {p.segment ? `${L('Segmento', 'Segment')} ${p.segment}` : p.label}
                </b>{' '}
                <span className="co">{p.message}</span>
              </li>
            ))}
          </ul>
        ))}
    </>
  )
}

function CartaoPadrao({
  padrao,
  onChange,
  onRemover,
  abertoInicialmente,
}: {
  padrao: Padrao
  onChange: (p: Padrao) => void
  onRemover: (id: string) => void
  abertoInicialmente: boolean
}) {
  const { L } = useI18n()
  const [aberto, setAberto] = useState(abertoInicialmente)
  // Enquanto o editor está aberto, as mudanças vivem num rascunho e só valem no
  // Salvar. Fora dele, mostra-se o padrão já salvo.
  const [rascunho, setRascunho] = useState(padrao)
  // Um padrão recém-criado ainda não foi salvo: Cancelar deve descartá-lo, e
  // não deixar um "Novo padrão" vazio na lista.
  const [nuncaSalvo, setNuncaSalvo] = useState(abertoInicialmente)
  const visao = aberto ? rascunho : padrao

  const avisos = useMemo(() => lintPattern(visao), [visao])
  const sujo = aberto && JSON.stringify(rascunho) !== JSON.stringify(padrao)

  const set = (patch: Partial<Padrao>) => setRascunho((d) => ({ ...d, ...patch }))

  function cancelar() {
    if (nuncaSalvo) {
      onRemover(padrao.id)
      return
    }
    setRascunho(padrao)
    setAberto(false)
  }

  function salvar() {
    onChange(rascunho)
    setNuncaSalvo(false)
    setAberto(false)
  }

  function moverSegmento(indice: number, direcao: -1 | 1) {
    const alvo = indice + direcao
    if (alvo < 0 || alvo >= rascunho.segments.length) return
    const segments = [...rascunho.segments]
    const a = segments[indice]
    const b = segments[alvo]
    if (!a || !b) return
    segments[indice] = b
    segments[alvo] = a
    // O primeiro bloco nunca leva separador antes; garante isso após mover.
    const primeiro = segments[0]
    if (primeiro) segments[0] = { ...primeiro, sep: '' }
    set({ segments })
  }

  return (
    <div className="editor">
      <div className="aud-padrao-cab">
        <div style={{ minWidth: 0, flex: 1 }}>
          {aberto ? (
            <input
              className="f"
              placeholder={L('Nome do padrão', 'Pattern name')}
              value={rascunho.name}
              onChange={(e) => set({ name: e.target.value })}
            />
          ) : (
            <h3 style={{ margin: 0 }}>{padrao.name || L('Sem nome', 'Unnamed')}</h3>
          )}
          <Previa padrao={visao} />
          <p className="hint code" style={{ margin: '6px 0 0' }}>
            {L('Ex.:', 'e.g.')} {exampleFor(visao)}
          </p>
        </div>

        <div className="eact" style={{ margin: 0 }}>
          {aberto ? (
            <>
              <button className="btn" onClick={cancelar}>
                {L('Cancelar', 'Cancel')}
              </button>
              <button className="btn pri" onClick={salvar}>
                {L('Salvar', 'Save')}
              </button>
            </>
          ) : (
            <button className="btn" onClick={() => { setRascunho(padrao); setAberto(true) }}>
              {L('Editar', 'Edit')}
            </button>
          )}
          <button className="btn danger" onClick={() => onRemover(padrao.id)}>
            {L('Excluir', 'Delete')}
          </button>
        </div>
      </div>

      {avisos.length > 0 && (
        <div className="erro" style={{ background: 'var(--wait-bg)', color: 'var(--wait)' }}>
          {avisos.map((a, i) => (
            <div key={i}>{a}</div>
          ))}
        </div>
      )}

      {aberto && (
        <>
          <div className="frow">
            <div className="full">
              <label className="fl">{L('Extensões aceitas', 'Accepted extensions')}</label>
              <input
                className="f"
                placeholder="pdf, xlsx"
                value={(rascunho.extensions ?? []).join(', ')}
                onChange={(e) =>
                  set({
                    extensions: e.target.value.split(',').map((v) => v.trim().replace(/^\./, '')),
                  })
                }
              />
            </div>
          </div>

          <div className="sectitle">{L('Segmentos', 'Segments')}</div>
          {rascunho.segments.length === 0 ? (
            <div className="card">
              <div className="empty">
                {L(
                  'Nenhum segmento. Adicione o primeiro bloco do nome.',
                  'No segment. Add the first block of the name.',
                )}
              </div>
            </div>
          ) : (
            rascunho.segments.map((seg, i) => (
              <EditorSegmento
                key={seg.id}
                segmento={seg}
                indice={i}
                total={rascunho.segments.length}
                onChange={(proximo: SegmentoPadrao) =>
                  set({ segments: rascunho.segments.map((s) => (s.id === proximo.id ? proximo : s)) })
                }
                onRemover={(id) => set({ segments: rascunho.segments.filter((s) => s.id !== id) })}
                onMover={moverSegmento}
              />
            ))
          )}

          <div className="eact">
            <button
              className="btn"
              onClick={() => set({ segments: [...rascunho.segments, newSegment('list', '_')] })}
            >
              + {L('Segmento', 'Segment')}
            </button>
          </div>

          <Testador padrao={rascunho} />

          <details style={{ marginTop: 12 }}>
            <summary className="hint" style={{ cursor: 'pointer' }}>
              {L('Ver expressão regular gerada', 'Show generated regular expression')}
            </summary>
            <pre className="code aud-regex">{patternToRegex(rascunho)}</pre>
          </details>

          <div className="eact">
            {sujo && (
              <span className="hint" style={{ marginRight: 'auto' }}>
                {L('Alterações não salvas', 'Unsaved changes')}
              </span>
            )}
            <button className="btn" onClick={cancelar}>
              {L('Cancelar', 'Cancel')}
            </button>
            <button className="btn pri" onClick={salvar}>
              {L('Salvar', 'Save')}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export default function AbaPadroesAvancados({ bancada }: { bancada: Bancada }) {
  const { L } = useI18n()
  const { padroes, setPadroes } = bancada
  const arquivoRef = useRef<HTMLInputElement>(null)
  const [aviso, setAviso] = useState<{ ruim: boolean; texto: string } | null>(null)
  const [ultimoCriado, setUltimoCriado] = useState<string | null>(null)

  function criar() {
    const p = newPattern()
    setPadroes([...padroes, p])
    setUltimoCriado(p.id)
  }

  function usarModeloAcc() {
    const modelo = accPresetPatterns()
    setPadroes([...padroes, ...modelo])
    setAviso({
      ruim: false,
      texto: L(
        `${modelo.length} padrões do modelo ACC adicionados. Ajuste os valores como precisar.`,
        `${modelo.length} ACC template patterns added. Adjust the values as needed.`,
      ),
    })
  }

  function exportar() {
    const blob = new Blob([JSON.stringify(padroes, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'padroes-nomenclatura.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function importar(arquivo: File) {
    try {
      const lido: unknown = JSON.parse(await arquivo.text())
      if (!Array.isArray(lido)) throw new Error(L('o arquivo não contém uma lista de padrões', 'the file does not contain a list of patterns'))
      // Ids novos: importar duas vezes o mesmo arquivo não pode gerar padrões
      // que se sobrescrevem ao editar.
      const novoId = () => Math.random().toString(36).slice(2, 10)
      const comIds = (lido as Padrao[]).map((p) => ({
        ...p,
        id: novoId(),
        segments: (p.segments ?? []).map((s) => ({ ...s, id: novoId() })),
      }))
      setPadroes([...padroes, ...comIds])
      setAviso({
        ruim: false,
        texto: L(`${comIds.length} padrão(ões) importado(s).`, `${comIds.length} pattern(s) imported.`),
      })
    } catch (err) {
      setAviso({
        ruim: true,
        texto: `${L('Não foi possível importar:', 'Could not import:')} ${
          err instanceof Error ? err.message : String(err)
        }`,
      })
    }
  }

  return (
    <>
      <div className="acoes">
        <input
          ref={arquivoRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const arquivo = e.target.files?.[0]
            if (arquivo) importar(arquivo)
            e.target.value = ''
          }}
        />
        <button className="btn pri" onClick={criar}>
          + {L('Novo padrão', 'New pattern')}
        </button>
        <button className="btn" onClick={usarModeloAcc}>
          {L('Modelo ACC', 'ACC template')}
        </button>
        <button className="btn" onClick={() => arquivoRef.current?.click()}>
          {L('Importar', 'Import')}
        </button>
        <button className="btn" onClick={exportar} disabled={!padroes.length}>
          {L('Exportar', 'Export')}
        </button>
      </div>

      {aviso && (
        <div
          className="erro"
          style={aviso.ruim ? undefined : { background: 'var(--ok-bg)', color: 'var(--ok)' }}
        >
          {aviso.texto}
          <button className="linkbtn" style={{ marginLeft: 10 }} onClick={() => setAviso(null)}>
            {L('fechar', 'close')}
          </button>
        </div>
      )}

      {padroes.length === 0 ? (
        <div className="card">
          <div className="empty">
            <b>{L('Nenhum padrão avançado', 'No advanced pattern')}</b>
            {L(
              'Comece pelo Modelo ACC (Spec Audit / 4D Parameter / Relatório de Auditoria) e ajuste os valores, ou crie um do zero.',
              'Start from the ACC template (Spec Audit / 4D Parameter / Audit Report) and adjust the values, or create one from scratch.',
            )}
          </div>
        </div>
      ) : (
        padroes.map((p) => (
          <CartaoPadrao
            key={p.id}
            padrao={p}
            abertoInicialmente={p.id === ultimoCriado}
            onChange={(proximo) => setPadroes(padroes.map((x) => (x.id === proximo.id ? proximo : x)))}
            onRemover={(id) => setPadroes(padroes.filter((x) => x.id !== id))}
          />
        ))
      )}

      <p className="hint">
        {L(
          'Estes padrões ficam salvos neste navegador. Use Exportar para levá-los a outra máquina — ou cadastre o padrão oficial do projeto na aba "Padrão do projeto", que vale para todo o time.',
          'These patterns are stored in this browser. Use Export to move them to another machine — or register the official project pattern in the "Project standard" tab, which applies to the whole team.',
        )}
      </p>
    </>
  )
}
