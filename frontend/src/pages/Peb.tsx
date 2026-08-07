/** DIRETRIZES — as regras do PEB por escrito.
 *
 *  É o documento normativo de onde os critérios derivam, e a tela não o
 *  interpreta: guarda as regras, uma a uma.
 *
 *  ═══ ELA ERA "PEB · diretrizes" E TINHA TRÊS ABAS (até 07/08/2026, a pedido)
 *
 *  Sobrou uma, e por isso o `Segmented` saiu junto — um segmento com um item só
 *  é um botão que não faz nada. Para onde foram as outras duas:
 *
 *  - `Fluxo da auditoria` → seção própria do painel (`configuracao/Fluxo.tsx`).
 *    Ela era ESTÁTICA no meio de duas que gravavam, e ninguém a abria.
 *  - `Dados & setorização` → a grade de imagens foi para `Setorização` (a antiga
 *    `Áreas`), que é onde os setores são DEFINIDOS. O bloco "Dados do projeto"
 *    dela não foi a lugar nenhum: era código, nome, cliente e coordenação só de
 *    leitura, os mesmos cinco campos que a Ficha edita uma seção acima.
 *
 *  O NOME DA SEÇÃO virou só `Diretrizes`, e a rota continua `peb` — ela está em
 *  link salvo e no histórico, e trocá-la não compraria nada.
 *
 *  ONDE ISTO É GUARDADO, e por que não numa tabela nova: diretriz e imagem de
 *  setor são `standard` com `tipo` próprio (`diretriz` e `setorizacao`).
 *  `standard.tipo` é coluna de TEXTO no banco, não enum do Postgres, então os
 *  dois tipos não custaram migration — e uma tabela separada teria duplicado
 *  projeto_id, RLS, CRUD e trilha para guardar um título e um texto.
 *
 *    diretriz     nome = título · referencia = o texto da regra
 *    setorizacao  nome = o setor (ADMIN, COLO1…) · referencia_url = chave no S3
 */
import { useCallback, useEffect, useState } from 'react'

import { useAuth } from '@/auth/AuthContext'
import { Campo, Editor, Erro, Vazio } from '@/components/ui'
import { useI18n } from '@/i18n'
import { ApiError, api } from '@/lib/api'
import type { Standard } from '@/lib/types'
import { useProjeto } from '@/projeto/ProjetoContext'

type Rascunho = { id?: string; nome: string; texto: string }

export default function Peb() {
  const { L } = useI18n()
  const { projeto } = useProjeto()
  const { usuario } = useAuth()
  const podeEditar = !!usuario?.permissoes.includes('admin_cadastro')

  if (!projeto) return <p className="hint">{L('Carregando…', 'Loading…')}</p>

  return <Diretrizes projetoId={projeto.id} podeEditar={podeEditar} />
}

/* ------------------------------------------------------------- diretrizes */

function Diretrizes({ projetoId, podeEditar }: { projetoId: string; podeEditar: boolean }) {
  const { L } = useI18n()
  const [itens, setItens] = useState<Standard[]>([])
  const [rascunho, setRascunho] = useState<Rascunho | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [carregando, setCarregando] = useState(true)

  const carregar = useCallback(async () => {
    setErro(null)
    try {
      setItens((await api.standards.listar(projetoId, 'diretriz')).itens)
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
    if (!rascunho) return
    if (!rascunho.nome.trim()) {
      setErro(L('A diretriz precisa de um título.', 'The guideline needs a title.'))
      return
    }
    setErro(null)
    setSalvando(true)
    const corpo = { nome: rascunho.nome.trim(), referencia: rascunho.texto.trim() || null }
    try {
      if (rascunho.id) await api.standards.atualizar(rascunho.id, corpo)
      else await api.standards.criar({ projeto_id: projetoId, tipo: 'diretriz', ...corpo })
      setRascunho(null)
      await carregar()
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : String(e))
    } finally {
      setSalvando(false)
    }
  }

  async function remover(d: Standard) {
    if (!confirm(L(`Remover a diretriz "${d.nome}"?`, `Remove the guideline "${d.nome}"?`))) return
    setErro(null)
    try {
      await api.standards.remover(d.id)
      await carregar()
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : String(e))
    }
  }

  if (carregando) return <p className="hint">{L('Carregando…', 'Loading…')}</p>

  return (
    <>
      {podeEditar && !rascunho && (
        <div className="acoes">
          <button className="btn pri" onClick={() => setRascunho({ nome: '', texto: '' })}>
            + {L('Nova diretriz', 'New guideline')}
          </button>
        </div>
      )}

      {!rascunho && <Erro mensagem={erro} />}

      {rascunho && (
        <Editor
          titulo={rascunho.id ? L('Editar diretriz', 'Edit guideline') : L('Nova diretriz', 'New guideline')}
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
              value={rascunho.nome}
              onChange={(e) => setRascunho({ ...rascunho, nome: e.target.value })}
            />
          </Campo>
          <Campo rotulo={L('Diretriz', 'Guideline')} largo>
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
          titulo={L('Nenhuma diretriz', 'No guidelines')}
          texto={L(
            'As diretrizes são as regras do PEB por escrito — coordenada compartilhada, nomenclatura, ritmo de entrega, LOD por fase. É delas que os critérios da auditoria derivam.',
            'Guidelines are the BEP rules written down — shared coordinates, naming, delivery cadence, LOD per phase. Audit criteria derive from them.',
          )}
        />
      ) : (
        <div className="card">
          {itens.map((d) => (
            <div key={d.id} className="libitem">
              <div className="lname">
                <b>{d.nome}</b>
                <span>{d.referencia ?? '—'}</span>
              </div>
              {podeEditar && (
                <>
                  <button
                    className="btn sm"
                    onClick={() =>
                      setRascunho({ id: d.id, nome: d.nome, texto: d.referencia ?? '' })
                    }
                  >
                    {L('editar', 'edit')}
                  </button>{' '}
                  <button className="btn sm danger" onClick={() => remover(d)}>
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
