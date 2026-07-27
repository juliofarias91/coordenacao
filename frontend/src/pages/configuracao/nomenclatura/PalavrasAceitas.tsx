/** Palavras aceitas pelo corretor.
 *
 *  O dicionário pt-BR + inglês não conhece sigla de projeto, código de área nem
 *  nome de fornecedor. Sem esta lista, cada planilha nova reapontaria as mesmas
 *  dezenas de "erros" que já foram julgados corretos uma vez.
 */
import { useState } from 'react'

import { useI18n } from '@/i18n'
import type { Bancada } from '@/pages/configuracao/nomenclatura/estado'

export default function AbaPalavrasAceitas({ bancada }: { bancada: Bancada }) {
  const { L } = useI18n()
  const { aceitas, aceitarPalavra, removerPalavra, setAceitas } = bancada
  const [nova, setNova] = useState('')

  function adicionar() {
    // Aceita várias de uma vez: colar uma lista é o jeito natural de povoar
    // isto a partir de um glossário que já existe.
    for (const parte of nova.split(/[,;\n]/)) aceitarPalavra(parte)
    setNova('')
  }

  const ordenadas = [...aceitas].sort((a, b) => a.localeCompare(b, 'pt-BR'))

  return (
    <>
      <div className="editor">
        <h3>{L('Adicionar palavras', 'Add words')}</h3>
        <div className="frow">
          <div className="full">
            <label className="fl">
              {L('Palavra (ou várias, separadas por vírgula)', 'Word (or several, comma separated)')}
            </label>
            <input
              className="f"
              placeholder="CPQ11, workset, as-built"
              value={nova}
              onChange={(e) => setNova(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && adicionar()}
            />
          </div>
        </div>
        <div className="eact">
          <button className="btn pri" onClick={adicionar} disabled={!nova.trim()}>
            {L('Adicionar', 'Add')}
          </button>
          {aceitas.length > 0 && (
            <button className="btn danger" onClick={() => setAceitas([])}>
              {L('Limpar tudo', 'Clear all')}
            </button>
          )}
        </div>
        <p className="hint">
          {L(
            'Uma palavra aceita deixa de ser apontada em qualquer arquivo, agora e nos próximos. Vale só neste navegador.',
            'An accepted word stops being flagged in any file, now and later. It applies to this browser only.',
          )}
        </p>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>{L('Palavra', 'Word')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {ordenadas.map((palavra) => (
              <tr key={palavra}>
                <td className="code">{palavra}</td>
                <td style={{ textAlign: 'right' }}>
                  <button className="btn sm danger" onClick={() => removerPalavra(palavra)}>
                    {L('Remover', 'Remove')}
                  </button>
                </td>
              </tr>
            ))}
            {ordenadas.length === 0 && (
              <tr>
                <td colSpan={2} className="empty">
                  {L(
                    'Nenhuma palavra aceita ainda. Elas entram aqui pelo botão "Aceitar" ao lado de cada erro de ortografia.',
                    'No accepted word yet. They land here through the "Accept" button next to each spelling error.',
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
