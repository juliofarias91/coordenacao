import { useMemo, useState } from 'react'
import { Check, Plus, Trash2, X } from 'lucide-react'
import { Button, Card, EmptyState, Input, Label } from '../components/ui'

/**
 * Gerência das palavras aceitas (o "dicionário pessoal" do corretor). São os
 * termos que o corretor trata como corretos — jargão de obra, nome próprio,
 * sigla — e por isso nunca viram erro de ortografia. Alimentada pelo botão
 * "Aceitar palavra" na auditoria, e editável aqui à mão.
 */
export default function Aceitas({ ignoreWords, onAdd, onRemove, onClear }) {
  const [draft, setDraft] = useState('')

  // Ordena para leitura; sem alterar a ordem real guardada.
  const sorted = useMemo(() => [...ignoreWords].sort((a, b) => a.localeCompare(b, 'pt-BR')), [ignoreWords])

  const add = () => {
    const w = draft.trim()
    if (w) onAdd(w)
    setDraft('')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Palavras aceitas</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Termos que o corretor trata como corretos — jargão de obra, nomes próprios, siglas. Não são apontados como erro de
          ortografia em nenhum arquivo.
        </p>
      </div>

      <Card className="space-y-5">
        <div className="space-y-1.5">
          <Label>Adicionar palavra</Label>
          <div className="flex flex-wrap gap-2">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && add()}
              placeholder="ex.: pergolado"
              className="max-w-xs"
            />
            <Button size="sm" onClick={add} disabled={!draft.trim()}>
              <Plus className="h-4 w-4" /> Adicionar
            </Button>
          </div>
        </div>

        {ignoreWords.length === 0 ? (
          <EmptyState
            icon={Check}
            title="Nenhuma palavra aceita ainda"
            description="Use o botão “Aceitar palavra” num erro de ortografia da auditoria, ou adicione uma aqui em cima."
          />
        ) : (
          <div className="space-y-3 border-t border-border/50 pt-5">
            <div className="flex items-center justify-between">
              <Label>{ignoreWords.length} palavra(s)</Label>
              <Button variant="destructive" size="sm" onClick={onClear}>
                <Trash2 className="h-4 w-4" /> Limpar tudo
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {sorted.map((w) => (
                <span
                  key={w}
                  className="group inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 py-1 pl-3 pr-1.5 text-sm text-foreground"
                >
                  {w}
                  <button
                    type="button"
                    onClick={() => onRemove(w)}
                    aria-label={`Remover "${w}" das aceitas`}
                    title={`Remover "${w}" das aceitas`}
                    className="flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}
      </Card>

      <p className="text-xs text-muted-foreground">
        Remover uma palavra faz ela voltar a ser conferida nos <strong className="font-semibold text-foreground">próximos</strong>{' '}
        arquivos — reenvie um arquivo já auditado para reavaliá-lo. A lista fica salva neste navegador.
      </p>
    </div>
  )
}
