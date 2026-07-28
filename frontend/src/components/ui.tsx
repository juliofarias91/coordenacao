/** Peças de UI compartilhadas, com as classes do protótipo. */
import type { ReactNode } from 'react'

import { useI18n } from '@/i18n'

export function Segmented<K extends string>({
  itens,
  valor,
  onChange,
}: {
  itens: Array<[K, string]>
  valor: K
  onChange: (k: K) => void
}) {
  return (
    <div className="seg">
      {itens.map(([k, rotulo]) => (
        <button key={k} className={valor === k ? 'on' : ''} onClick={() => onChange(k)}>
          {rotulo}
        </button>
      ))}
    </div>
  )
}

export function Campo({
  rotulo,
  children,
  largo,
}: {
  rotulo: string
  children: ReactNode
  largo?: boolean
}) {
  return (
    <div className={largo ? 'full' : undefined}>
      <label className="fl">{rotulo}</label>
      {children}
    </div>
  )
}

export function Editor({
  titulo,
  children,
  onSalvar,
  onCancelar,
  salvando,
  erro,
}: {
  titulo: string
  children: ReactNode
  onSalvar: () => void
  onCancelar: () => void
  salvando?: boolean
  erro?: string | null
}) {
  const { L } = useI18n()
  return (
    <div className="editor">
      <h3>{titulo}</h3>
      {erro && <div className="erro">{erro}</div>}
      <div className="frow">{children}</div>
      <div className="eact">
        <button className="btn pri" onClick={onSalvar} disabled={salvando}>
          {salvando ? L('Salvando…', 'Saving…') : L('Salvar', 'Save')}
        </button>
        <button className="btn" onClick={onCancelar} disabled={salvando}>
          {L('Cancelar', 'Cancel')}
        </button>
      </div>
    </div>
  )
}

/** Estado vazio de página. Borda tracejada e sem card: o tracejado é o sinal
 *  de "aqui caberia algo" e o card em volta só somaria uma moldura.
 *  O `texto` deve dizer o PRÓXIMO PASSO, não só "nada encontrado". */
export function Vazio({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="empty vazio">
      <b>{titulo}</b>
      {texto}
    </div>
  )
}

export function Cabecalho({ titulo, sub }: { titulo: string; sub?: string }) {
  return (
    <div className="top">
      <div>
        <h1>{titulo}</h1>
        {sub && <p className="sub">{sub}</p>}
      </div>
    </div>
  )
}

/** Etiquetas multi-seleção — papéis, checklists, áreas, permissões. */
export function Chips<V extends string>({
  opcoes,
  valor,
  onChange,
}: {
  opcoes: Array<[V, string]>
  valor: V[]
  onChange: (v: V[]) => void
}) {
  return (
    <div className="filters" style={{ marginBottom: 0 }}>
      {opcoes.map(([v, rotulo]) => {
        const ligado = valor.includes(v)
        return (
          <button
            key={v}
            type="button"
            className={`chip${ligado ? ' on' : ''}`}
            onClick={() => onChange(ligado ? valor.filter((x) => x !== v) : [...valor, v])}
          >
            {rotulo}
          </button>
        )
      })}
    </div>
  )
}

export function Erro({ mensagem }: { mensagem: string | null }) {
  return mensagem ? <div className="erro">{mensagem}</div> : null
}
