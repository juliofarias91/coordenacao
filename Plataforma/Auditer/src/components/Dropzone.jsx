import { useRef, useState } from 'react'
import { UploadCloud } from 'lucide-react'
import { cn } from '../lib/cn'

export default function Dropzone({ onFiles, disabled }) {
  const inputRef = useRef(null)
  const [over, setOver] = useState(false)

  // Aceita qualquer arquivo: a auditoria de NOME vale para PDF, DWG, etc.
  // A ortografia (só faz sentido em Excel) é aplicada seletivamente depois.
  const handle = (list) => {
    const files = Array.from(list)
    if (files.length) onFiles(files)
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        if (!disabled) setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        if (!disabled) handle(e.dataTransfer.files)
      }}
      onClick={() => !disabled && inputRef.current?.click()}
      className={cn(
        'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border border-dashed px-6 py-14 text-center transition-colors',
        over ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50',
        disabled && 'pointer-events-none opacity-50',
      )}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          handle(e.target.files)
          e.target.value = '' // permite reauditar o mesmo arquivo após uma correção
        }}
      />
      <UploadCloud className="h-8 w-8 text-muted-foreground/50" strokeWidth={1.5} />
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">Solte os arquivos aqui</p>
        <p className="text-sm text-muted-foreground">ou clique para escolher — PDF, Excel, qualquer arquivo</p>
      </div>
      <p className="text-xs text-muted-foreground/70">
        O nome é conferido em todos; a ortografia, só nos Excel. Nada sai do seu computador.
      </p>
    </div>
  )
}
