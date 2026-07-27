/** Área de soltar arquivos.
 *
 *  Aceita qualquer arquivo: a auditoria de NOME vale para PDF, DWG, IFC. A
 *  ortografia, que só faz sentido em Excel, é aplicada seletivamente depois.
 */
import { useRef, useState } from 'react'

import { useI18n } from '@/i18n'

export default function Dropzone({
  onArquivos,
  desabilitado,
}: {
  onArquivos: (arquivos: File[]) => void
  desabilitado?: boolean
}) {
  const { L } = useI18n()
  const inputRef = useRef<HTMLInputElement>(null)
  const [sobre, setSobre] = useState(false)

  function receber(lista: FileList | null) {
    const arquivos = Array.from(lista ?? [])
    if (arquivos.length) onArquivos(arquivos)
  }

  return (
    <div
      className={`dropzone${sobre ? ' sobre' : ''}${desabilitado ? ' off' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        if (!desabilitado) setSobre(true)
      }}
      onDragLeave={() => setSobre(false)}
      onDrop={(e) => {
        e.preventDefault()
        setSobre(false)
        if (!desabilitado) receber(e.dataTransfer.files)
      }}
      onClick={() => !desabilitado && inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          receber(e.target.files)
          // Permite reauditar o mesmo arquivo depois de uma correção.
          e.target.value = ''
        }}
      />
      <b>{L('Solte os arquivos aqui', 'Drop the files here')}</b>
      <span>
        {L(
          'ou clique para escolher — PDF, Excel, qualquer arquivo',
          'or click to pick — PDF, Excel, any file',
        )}
      </span>
      <span className="hint" style={{ margin: 0 }}>
        {L(
          'O nome é conferido em todos; a ortografia, só nos Excel. Nada sai do seu computador.',
          'The name is checked on every file; spelling only on Excel ones. Nothing leaves your computer.',
        )}
      </span>
    </div>
  )
}
