/** Um arquivo auditado: cabeçalho com os selos e o detalhe ao expandir. */
import { useState } from 'react'

import { useI18n } from '@/i18n'
import { downloadAuditReport, type ResultadoArquivo } from '@/lib/auditer/report'
import type { OcorrenciaOrtografia } from '@/lib/auditer/useSpellChecker'

export type Duplicidade = {
  name: { type: 'exact' | 'documento'; others: string[] } | null
  content: { others: string[] } | null
}

/** Destaca a palavra errada dentro do texto da célula. */
function Destaque({ texto, palavra, indice }: { texto: string; palavra: string; indice: number }) {
  const fim = indice + palavra.length
  // O índice vem do worker; se não bater com o texto, mostra o texto cru em vez
  // de recortar no lugar errado.
  if (indice < 0 || fim > texto.length || texto.slice(indice, fim) !== palavra) {
    return <span className="co">{texto}</span>
  }
  return (
    <span className="co">
      {texto.slice(0, indice)}
      <mark className="aud-marca">{palavra}</mark>
      {texto.slice(fim)}
    </span>
  )
}

function LinhaOrtografia({
  ocorrencia,
  onAceitar,
}: {
  ocorrencia: OcorrenciaOrtografia
  onAceitar: (palavra: string) => void
}) {
  const { L } = useI18n()
  return (
    <div className="aud-orto">
      <span className="code co aud-orto-local" title={ocorrencia.sheet}>
        {ocorrencia.kind === 'sheet' ? L('aba', 'sheet') : `${ocorrencia.sheet}!${ocorrencia.cell}`}
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{ margin: 0, wordBreak: 'break-word' }}>
          <Destaque texto={ocorrencia.text} palavra={ocorrencia.word} indice={ocorrencia.index} />
        </p>
        {ocorrencia.suggestions.length > 0 && (
          <p className="hint" style={{ margin: '4px 0 0' }}>
            {L('Sugestões:', 'Suggestions:')}{' '}
            <span style={{ color: 'var(--ok)' }}>{ocorrencia.suggestions.join(', ')}</span>
          </p>
        )}
      </div>
      <button
        className="btn sm"
        onClick={() => onAceitar(ocorrencia.word)}
        title={L(
          `Marcar "${ocorrencia.word}" como correta — não será mais apontada em nenhum arquivo.`,
          `Mark "${ocorrencia.word}" as correct — it will no longer be flagged in any file.`,
        )}
      >
        + {L('Aceitar', 'Accept')}
      </button>
    </div>
  )
}

export default function LinhaResultado({
  resultado,
  duplicidade,
  onAceitarPalavra,
  onRemover,
}: {
  resultado: ResultadoArquivo
  duplicidade: Duplicidade | null
  onAceitarPalavra: (palavra: string) => void
  onRemover: (id: number) => void
}) {
  const { L } = useI18n()
  const [aberto, setAberto] = useState(false)
  const { file, status, name, hygiene, spelling, spellError } = resultado

  const nomeOk = name?.ok ?? null
  const higiene = hygiene ?? []
  const erros = spelling?.length ?? 0
  // 'not-excel' não é falha: é "ortografia não se aplica a este arquivo".
  const ortografiaSeAplica = spellError !== 'not-excel'
  const ortografiaFalhou = ortografiaSeAplica && !!spellError

  return (
    <div className="card aud-item">
      <div className="aud-cab" onClick={() => setAberto((v) => !v)}>
        <span className="co aud-seta">{aberto ? '▾' : '▸'}</span>
        <span className="code aud-nome" title={file.name}>
          {file.name}
        </span>

        <span className="aud-selos">
          {status === 'pending' && <span className="pill">{L('auditando…', 'auditing…')}</span>}
          {status === 'done' && (
            <>
              {duplicidade?.name && <span className="pill ruim">{L('duplicado', 'duplicate')}</span>}
              {duplicidade?.content && <span className="pill ruim">{L('cópia', 'copy')}</span>}
              {nomeOk === true && <span className="pill ok">{L('nome ok', 'name ok')}</span>}
              {nomeOk === false && (
                <span className="pill ruim">
                  {L('nome', 'name')}: {name?.issues.length}
                </span>
              )}
              {nomeOk === null && <span className="pill">{L('sem padrão', 'no pattern')}</span>}
              {higiene.length > 0 && (
                <span className="pill ruim">
                  {L('higiene', 'hygiene')}: {higiene.length}
                </span>
              )}
              {!ortografiaSeAplica && <span className="pill">{L('só nome', 'name only')}</span>}
              {ortografiaFalhou && (
                <span className="pill alerta">{L('ortografia indisp.', 'spelling n/a')}</span>
              )}
              {ortografiaSeAplica && !ortografiaFalhou && erros > 0 && (
                <span className="pill alerta">
                  {L('ortografia', 'spelling')}: {erros}
                </span>
              )}
              {ortografiaSeAplica && !ortografiaFalhou && erros === 0 && (
                <span className="pill ok">{L('ortografia ok', 'spelling ok')}</span>
              )}
            </>
          )}
          <button
            className="btn sm"
            onClick={(e) => {
              e.stopPropagation()
              onRemover(resultado.id)
            }}
            aria-label={L('Remover da lista', 'Remove from list')}
          >
            ×
          </button>
        </span>
      </div>

      {aberto && (
        <div className="aud-corpo">
          {status === 'done' && (
            <div className="eact" style={{ justifyContent: 'flex-end', marginBottom: 10 }}>
              <button
                className="btn sm"
                onClick={() => downloadAuditReport([resultado], { single: true })}
              >
                {L('Baixar auditoria (.xlsx)', 'Download audit (.xlsx)')}
              </button>
            </div>
          )}

          {duplicidade?.content && (
            <p className="erro">
              {L('Conteúdo idêntico a:', 'Content identical to:')}{' '}
              <span className="code">{duplicidade.content.others.join(', ')}</span>
              {' — '}
              {L(
                'é o mesmo arquivo salvo com outro nome.',
                'it is the same file saved under another name.',
              )}
            </p>
          )}
          {duplicidade?.name && (
            <p className="erro">
              {L('Nome duplicado — colide com:', 'Duplicate name — collides with:')}{' '}
              <span className="code">{duplicidade.name.others.join(', ')}</span>
              {'. '}
              {L(
                'No ACC isso vira conflito ou versão indevida.',
                'In ACC this becomes a conflict or an unintended version.',
              )}
            </p>
          )}

          {higiene.length > 0 && (
            <>
              <div className="sectitle">{L('Higiene do nome', 'Name hygiene')}</div>
              <ul className="aud-lista">
                {higiene.map((p, i) => (
                  <li key={i}>
                    <b className="aud-ruim">{p.label}</b> <span className="co">{p.message}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          <div className="sectitle">
            {L('Nome do arquivo', 'File name')}
            {name?.pattern && (
              <span className="co">
                {' '}
                · {L('padrão', 'pattern')} “{name.pattern.name}”
              </span>
            )}
          </div>
          {nomeOk === null && (
            <p className="hint" style={{ marginTop: 0 }}>
              {L(
                'Nenhum padrão cadastrado — o nome não foi conferido.',
                'No pattern registered — the name was not checked.',
              )}
            </p>
          )}
          {nomeOk === true && (
            <p className="aud-bom">{L('O nome segue o padrão.', 'The name follows the pattern.')}</p>
          )}
          {nomeOk === false && (
            <ul className="aud-lista">
              {name?.issues.map((p, i) => (
                <li key={i}>
                  <b className="aud-ruim">
                    {p.segment ? `${L('Segmento', 'Segment')} ${p.segment}` : p.label}
                  </b>{' '}
                  <span className="co">{p.message}</span>
                </li>
              ))}
            </ul>
          )}

          {ortografiaSeAplica && (
            <>
              <div className="sectitle">
                {L('Ortografia', 'Spelling')}
                {!ortografiaFalhou && erros > 0 && (
                  <span className="co">
                    {' '}
                    · {erros} {L('ocorrência(s)', 'occurrence(s)')}
                  </span>
                )}
              </div>
              {ortografiaFalhou ? (
                <p className="hint" style={{ marginTop: 0 }}>
                  {L(
                    'Não foi possível verificar a ortografia deste arquivo.',
                    'Could not check the spelling of this file.',
                  )}
                </p>
              ) : erros === 0 ? (
                <p className="aud-bom">{L('Nenhum erro encontrado.', 'No error found.')}</p>
              ) : (
                <div className="aud-orto-lista">
                  {spelling?.map((o, i) => (
                    <LinhaOrtografia
                      key={`${o.sheet}-${o.cell}-${o.index}-${i}`}
                      ocorrencia={o}
                      onAceitar={onAceitarPalavra}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
