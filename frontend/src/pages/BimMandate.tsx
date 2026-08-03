/** BIM Mandate — o que o CONTRATANTE exige, por escrito.
 *
 *  Fica ao lado do PEB e não dentro dele porque são documentos de autores
 *  diferentes, e a distinção importa numa discussão de não-conformidade: o
 *  mandate é o que o cliente EXIGE (entregáveis, marcos, usos do modelo,
 *  responsabilidades); o PEB é como a equipe se propõe a atender. Quando os
 *  dois discordam, quem prevalece é o mandate — e para isso ele precisa estar
 *  registrado à parte, não diluído numa lista só.
 *
 *  Guarda em `standard` com `tipo: 'mandate'`, exatamente como as diretrizes do
 *  PEB: `standard.tipo` é coluna de texto no banco, então um tipo novo não
 *  custa migration, e a separação por tipo é o que mantém as duas listas
 *  distintas na mesma tabela.
 */
import { useCallback, useEffect, useState } from 'react'

import { useAuth } from '@/auth/AuthContext'
import { Campo, Editor, Erro, Vazio } from '@/components/ui'
import { useI18n } from '@/i18n'
import { ApiError, api } from '@/lib/api'
import type { Standard } from '@/lib/types'
import { useProjeto } from '@/projeto/ProjetoContext'

type Rascunho = { id?: string; nome: string; texto: string }

export default function BimMandate() {
  const { L } = useI18n()
  const { projeto } = useProjeto()
  const { usuario } = useAuth()
  const podeEditar = !!usuario?.permissoes.includes('admin_cadastro')

  const [itens, setItens] = useState<Standard[]>([])
  const [rascunho, setRascunho] = useState<Rascunho | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [carregando, setCarregando] = useState(true)

  const projetoId = projeto?.id

  const carregar = useCallback(async () => {
    if (!projetoId) return
    setErro(null)
    try {
      setItens((await api.standards.listar(projetoId, 'mandate')).itens)
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : String(e))
    } finally {
      setCarregando(false)
    }
  }, [projetoId])

  useEffect(() => {
    carregar()
  }, [carregar])

  async function salvar() {
    if (!rascunho || !projetoId) return
    if (!rascunho.nome.trim()) {
      setErro(L('A exigência precisa de um título.', 'The requirement needs a title.'))
      return
    }
    setErro(null)
    setSalvando(true)
    const corpo = { nome: rascunho.nome.trim(), referencia: rascunho.texto.trim() || null }
    try {
      if (rascunho.id) await api.standards.atualizar(rascunho.id, corpo)
      else await api.standards.criar({ projeto_id: projetoId, tipo: 'mandate', ...corpo })
      setRascunho(null)
      await carregar()
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : String(e))
    } finally {
      setSalvando(false)
    }
  }

  async function remover(m: Standard) {
    if (!confirm(L(`Remover "${m.nome}"?`, `Remove "${m.nome}"?`))) return
    setErro(null)
    try {
      await api.standards.remover(m.id)
      await carregar()
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : String(e))
    }
  }

  if (!projeto || carregando) return <p className="hint">{L('Carregando…', 'Loading…')}</p>

  return (
    <>
      {podeEditar && !rascunho && (
        <div className="acoes">
          <button className="btn pri" onClick={() => setRascunho({ nome: '', texto: '' })}>
            + {L('Nova exigência', 'New requirement')}
          </button>
        </div>
      )}

      {!rascunho && <Erro mensagem={erro} />}

      {rascunho && (
        <Editor
          titulo={
            rascunho.id ? L('Editar exigência', 'Edit requirement') : L('Nova exigência', 'New requirement')
          }
          onSalvar={salvar}
          onCancelar={() => {
            setRascunho(null)
            setErro(null)
          }}
          salvando={salvando}
          erro={erro}
        >
          <Campo rotulo={L('Título', 'Title')} largo>
            <input
              className="f"
              autoFocus
              placeholder={L('Entregáveis por marco', 'Deliverables per milestone')}
              value={rascunho.nome}
              onChange={(e) => setRascunho({ ...rascunho, nome: e.target.value })}
            />
          </Campo>
          <Campo rotulo={L('Exigência', 'Requirement')} largo>
            <textarea
              className="f"
              rows={3}
              value={rascunho.texto}
              onChange={(e) => setRascunho({ ...rascunho, texto: e.target.value })}
            />
          </Campo>
        </Editor>
      )}

      {itens.length === 0 ? (
        <Vazio
          titulo={L('Nenhuma exigência registrada', 'No requirements registered')}
          texto={L(
            'Registre aqui o que o contrato exige — é o documento que prevalece sobre o PEB numa divergência, e o que sustenta uma não-conformidade quando o fornecedor contesta.',
            'Register what the contract requires — it is the document that prevails over the BEP in a disagreement, and what backs a non-conformity when a supplier pushes back.',
          )}
        />
      ) : (
        <div className="card">
          {itens.map((m) => (
            <div key={m.id} className="libitem">
              <div className="lname">
                <b>{m.nome}</b>
                <span>{m.referencia ?? '—'}</span>
              </div>
              {podeEditar && (
                <>
                  <button
                    className="btn sm"
                    onClick={() => setRascunho({ id: m.id, nome: m.nome, texto: m.referencia ?? '' })}
                  >
                    {L('editar', 'edit')}
                  </button>{' '}
                  <button className="btn sm danger" onClick={() => remover(m)}>
                    {L('remover', 'remove')}
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  )
}
