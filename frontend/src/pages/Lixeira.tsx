/** A lixeira — o que foi removido, e como trazer de volta.
 *
 *  Até a migration 0006 `DELETE` era definitivo. Apagar um cliente com doze
 *  projetos, um critério usado em três checklists ou o relato de um erro era um
 *  clique sem volta, numa plataforma que existe para que decisões de auditoria
 *  possam ser reconstruídas depois.
 *
 *  Esta é a ÚNICA tela que enxerga o removido: a policy de RLS o esconde de
 *  todas as outras, e nenhuma consulta filtra à mão.
 *
 *  DUAS AÇÕES, E ELAS NÃO SÃO SIMÉTRICAS. Restaurar é reversível — remove-se de
 *  novo se foi engano. "Apagar de vez" não é, e por isso pede confirmação
 *  nomeando o item: é o único ponto da plataforma em que dado sai do banco.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'

import { useAuth } from '@/auth/AuthContext'
import { Erro, Vazio } from '@/components/ui'
import { useI18n } from '@/i18n'
import { ApiError, api } from '@/lib/api'
import type { ItemLixeira } from '@/lib/types'

/** Nome de entidade → nome de gente. O que não estiver aqui aparece como veio:
 *  é melhor mostrar `evidencia` do que esconder a linha. */
const ROTULO_TIPO: Record<string, [string, string]> = {
  // Encabeça porque é o de maior consequência: o projeto é o pai de
  // disciplina, modelo e auditoria (migration 0011).
  projeto: ['Projeto', 'Project'],
  cliente: ['Cliente', 'Client'],
  criterio: ['Critério', 'Criterion'],
  standard: ['Padrão / diretriz', 'Standard / guideline'],
  apontamento: ['Apontamento', 'Issue'],
  membro: ['Membro de projeto', 'Project member'],
  reporte: ['Erro reportado', 'Reported problem'],
  contato: ['Contato', 'Contact'],
  evidencia: ['Evidência', 'Evidence'],
}

export default function Lixeira() {
  const { L } = useI18n()
  const { usuario } = useAuth()
  const podeAdministrar = !!usuario?.permissoes.includes('admin_cadastro')

  const [itens, setItens] = useState<ItemLixeira[]>([])
  const [filtro, setFiltro] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [ocupado, setOcupado] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    if (!podeAdministrar) {
      setCarregando(false)
      return
    }
    setErro(null)
    try {
      setItens(await api.lixeira.listar())
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : String(e))
    } finally {
      setCarregando(false)
    }
  }, [podeAdministrar])

  useEffect(() => {
    carregar()
  }, [carregar])

  const tipos = useMemo(() => [...new Set(itens.map((i) => i.tipo))].sort(), [itens])
  const visiveis = useMemo(
    () => (filtro && tipos.includes(filtro) ? itens.filter((i) => i.tipo === filtro) : itens),
    [itens, tipos, filtro],
  )

  const rotuloTipo = (t: string) => {
    const par = ROTULO_TIPO[t]
    return par ? L(par[0], par[1]) : t
  }

  async function restaurar(i: ItemLixeira) {
    setOcupado(i.id)
    setErro(null)
    try {
      await api.lixeira.restaurar(i.tipo, i.id)
      await carregar()
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : String(e))
    } finally {
      setOcupado(null)
    }
  }

  async function apagarDeVez(i: ItemLixeira) {
    // A confirmação NOMEIA o item e diz que não volta: é o único ponto da
    // plataforma em que dado sai do banco, e um "tem certeza?" genérico não
    // dá a quem lê a chance de perceber que clicou na linha errada.
    if (
      !confirm(
        L(
          `Apagar "${i.rotulo}" de vez? Isto não volta — nem por aqui, nem por backup do dia.`,
          `Permanently delete "${i.rotulo}"? This does not come back — not here, not from today’s backup.`,
        ),
      )
    ) {
      return
    }
    setOcupado(i.id)
    setErro(null)
    try {
      await api.lixeira.apagarDeVez(i.tipo, i.id)
      await carregar()
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : String(e))
    } finally {
      setOcupado(null)
    }
  }

  if (!podeAdministrar) {
    return (
      <>
        <Vazio
          titulo={L('Sem permissão', 'No permission')}
          texto={L(
            'A lixeira exige a permissão "Administrar cadastros": restaurar desfaz a decisão de outra pessoa. Peça a um administrador.',
            'The trash requires the "Manage records" permission: restoring undoes someone else’s decision. Ask an administrator.',
          )}
        />
      </>
    )
  }

  return (
    <>
      {tipos.length > 1 && (
        <div className="filters">
          <button
            type="button"
            className={`chip${filtro === '' ? ' on' : ''}`}
            onClick={() => setFiltro('')}
          >
            {L('Tudo', 'Everything')}
          </button>
          {tipos.map((t) => (
            <button
              key={t}
              type="button"
              className={`chip${filtro === t ? ' on' : ''}`}
              onClick={() => setFiltro(t)}
            >
              {rotuloTipo(t)}
            </button>
          ))}
        </div>
      )}

      <Erro mensagem={erro} />

      {carregando ? (
        <p className="hint">{L('Carregando…', 'Loading…')}</p>
      ) : visiveis.length === 0 ? (
        <Vazio
          titulo={L('A lixeira está vazia', 'The trash is empty')}
          texto={L(
            'Nada foi removido. Quando alguém apagar um projeto, um cliente, um critério, uma diretriz ou um apontamento, o item aparece aqui em vez de sumir.',
            'Nothing has been removed. When someone deletes a project, a client, a criterion, a guideline or an issue, it shows up here instead of vanishing.',
          )}
        />
      ) : (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th style={{ width: 150 }}>{L('Tipo', 'Type')}</th>
                <th>{L('Item', 'Item')}</th>
                <th style={{ width: 170 }}>{L('Removido em', 'Removed at')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visiveis.map((i) => (
                <tr key={`${i.tipo}-${i.id}`}>
                  <td className="co">{rotuloTipo(i.tipo)}</td>
                  <td>
                    <b>{i.rotulo}</b>
                  </td>
                  <td className="co">{new Date(i.removido_em).toLocaleString()}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button
                      className="btn sm"
                      style={{ marginRight: 6 }}
                      disabled={ocupado === i.id}
                      onClick={() => restaurar(i)}
                    >
                      {L('Restaurar', 'Restore')}
                    </button>
                    <button
                      className="btn sm danger"
                      disabled={ocupado === i.id}
                      onClick={() => apagarDeVez(i)}
                    >
                      {L('Apagar de vez', 'Delete for good')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
