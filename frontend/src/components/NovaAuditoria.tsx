/** A gaveta de NOVA AUDITORIA — planejar antes de executar.
 *
 *  Até aqui uma auditoria só nascia de dois jeitos: junto com a versão (a geral,
 *  automática) ou por um POST que o auditor disparava da tela do modelo. Nenhum
 *  dos dois permitia DIZER quem faz, para quando e com que urgência — o plano
 *  existia na cabeça de quem coordena e em nenhum campo.
 *
 *  É GAVETA, não card no meio da página: o painel de auditoria é tela de
 *  trabalho contínuo, e um formulário inline empurraria a lista de recortes para
 *  baixo. As regras da gaveta estão em `components/Gaveta.tsx`.
 *
 *  O MODELO SE BUSCA, não se rola num `<select>`. Um projeto real tem dezenas de
 *  modelos com códigos longos e parecidos (`CPQ11-C-STRC-CONCR-ADMIN-R22`), e num
 *  select nativo eles viram uma coluna de texto truncado. O filtro é local, como
 *  na busca global: a lista de modelos de um projeto cabe na memória do
 *  navegador com folga.
 *
 *  ABRE PELO MODELO E O SERVIDOR RESOLVE A ÚLTIMA VERSÃO. A auditoria pertence a
 *  uma versão — é ela que muda entre rounds —, mas quem coordena pensa "auditar
 *  o STRC". Fazer a tela listar versões para descartar todas menos uma seria pedir
 *  ao usuário que resolvesse um detalhe de modelagem nosso.
 */
import { useEffect, useMemo, useState } from 'react'

import Gaveta from '@/components/Gaveta'
import { Campo, Erro } from '@/components/ui'
import { useI18n } from '@/i18n'
import { CHECKLISTS, ROTULO_CHECKLIST, type Checklist } from '@/layout/nav'
import { ApiError, api } from '@/lib/api'
import { ANDAMENTOS, PRIORIDADES, type Andamento, type Prioridade } from '@/lib/types'
import type { Modelo, UsuarioCadastro } from '@/lib/types'

const ROTULO_ANDAMENTO: Record<Andamento, [string, string]> = {
  a_fazer: ['A fazer', 'To do'],
  em_andamento: ['Em andamento', 'In progress'],
  concluida: ['Concluída', 'Done'],
  bloqueada: ['Bloqueada', 'Blocked'],
}

const ROTULO_PRIORIDADE: Record<Prioridade, [string, string]> = {
  alta: ['Alta', 'High'],
  media: ['Média', 'Medium'],
  baixa: ['Baixa', 'Low'],
}

export default function NovaAuditoria({
  aberta,
  projetoId,
  /** O recorte em que o painel está — vira o tipo pré-escolhido. Quem clicou no
   *  "+" estando em LOD 300 quase certamente quer uma de LOD 300. */
  checklistInicial,
  onFechar,
  onCriada,
}: {
  aberta: boolean
  projetoId: string
  checklistInicial?: Checklist
  onFechar: () => void
  onCriada: () => void
}) {
  const { L } = useI18n()

  const [checklist, setChecklist] = useState<Checklist>(checklistInicial ?? 'geral')
  const [modelos, setModelos] = useState<Modelo[]>([])
  const [pessoas, setPessoas] = useState<UsuarioCadastro[]>([])
  const [busca, setBusca] = useState('')
  const [modeloId, setModeloId] = useState('')
  const [auditorId, setAuditorId] = useState('')
  const [inicio, setInicio] = useState('')
  const [fim, setFim] = useState('')
  const [planejada, setPlanejada] = useState('')
  const [andamento, setAndamento] = useState<Andamento>('a_fazer')
  const [prioridade, setPrioridade] = useState<Prioridade | ''>('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  // Carrega ao ABRIR, e não na montagem: a gaveta vive montada no painel e
  // buscar modelos e usuários toda vez que a tela de auditoria abre gastaria
  // duas requisições que ninguém pediu.
  useEffect(() => {
    if (!aberta) return
    setChecklist(checklistInicial ?? 'geral')
    api.modelos
      .listar(projetoId)
      .then((r) => setModelos(r.itens))
      .catch(() => setModelos([]))
    api.usuarios
      .listar()
      .then((r) => setPessoas(r.itens))
      .catch(() => setPessoas([]))
  }, [aberta, projetoId, checklistInicial])

  const achados = useMemo(() => {
    const t = busca.trim().toLowerCase()
    if (!t) return modelos.slice(0, 8)
    return modelos.filter((m) => m.codigo.toLowerCase().includes(t)).slice(0, 8)
  }, [modelos, busca])

  const escolhido = modelos.find((m) => m.id === modeloId) ?? null

  async function criar() {
    if (!modeloId) {
      setErro(L('Escolha o modelo a auditar.', 'Pick the model to audit.'))
      return
    }
    setErro(null)
    setSalvando(true)
    try {
      // `|| null` e não `|| undefined`: campo vazio na tela é "não definido", e
      // `null` é como o backend o representa. `undefined` seria omitido do JSON
      // e o PATCH o leria como "não mexa" — o que na CRIAÇÃO dá no mesmo, mas
      // divergiria no dia em que esta gaveta passasse a editar.
      await api.auditorias.abrirNoModelo(modeloId, {
        checklist,
        auditor_id: auditorId || null,
        data_inicio: inicio ? new Date(inicio).toISOString() : null,
        data_fim: fim ? new Date(fim).toISOString() : null,
        entrega_estimada: planejada || null,
        andamento,
        prioridade: prioridade || null,
      })
      onCriada()
      onFechar()
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : String(e))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Gaveta
      aberta={aberta}
      titulo={L('Nova auditoria', 'New audit')}
      sub={L('Do modelo, na última versão', 'Of the model, on its latest version')}
      onFechar={onFechar}
      acoes={
        <button className="btn pri" onClick={criar} disabled={salvando}>
          {salvando ? L('Abrindo…', 'Opening…') : L('Abrir auditoria', 'Open audit')}
        </button>
      }
    >
      <Erro mensagem={erro} />

      <Campo rotulo={L('Tipo de auditoria', 'Audit type')}>
        <select
          className="f"
          value={checklist}
          onChange={(e) => setChecklist(e.target.value as Checklist)}
        >
          {CHECKLISTS.map((c) => (
            <option key={c} value={c}>
              {L(...ROTULO_CHECKLIST[c])}
            </option>
          ))}
        </select>
      </Campo>

      <Campo rotulo={L('Modelo', 'Model')}>
        {/* O escolhido fica À VISTA depois de escolhido, e não só como linha
            marcada na lista: a lista filtra e o item pode sair dela na próxima
            letra digitada, deixando a gaveta sem dizer o que vai ser auditado. */}
        {escolhido ? (
          <div className="aud-escolhido">
            <b>{escolhido.codigo}</b>
            <button type="button" className="linkmudo" onClick={() => setModeloId('')}>
              {L('trocar', 'change')}
            </button>
          </div>
        ) : (
          <>
            <input
              className="f"
              autoFocus
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder={L('Buscar pelo código…', 'Search by code…')}
            />
            <div className="aud-achados">
              {achados.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className="aud-achado"
                  onClick={() => setModeloId(m.id)}
                >
                  {m.codigo}
                </button>
              ))}
              {achados.length === 0 && (
                <span className="hint">
                  {modelos.length === 0
                    ? L('Este projeto não tem modelos.', 'This project has no models.')
                    : L('Nenhum modelo com esse código.', 'No model with that code.')}
                </span>
              )}
            </div>
          </>
        )}
      </Campo>

      <Campo rotulo={L('Responsável', 'Assignee')}>
        <select className="f" value={auditorId} onChange={(e) => setAuditorId(e.target.value)}>
          <option value="">{L('Sem responsável', 'Unassigned')}</option>
          {pessoas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome ?? p.login}
            </option>
          ))}
        </select>
      </Campo>

      <div className="frow">
        <Campo rotulo={L('Início', 'Start')}>
          <input
            className="f"
            type="date"
            value={inicio}
            onChange={(e) => setInicio(e.target.value)}
          />
        </Campo>
        <Campo rotulo={L('Fim', 'End')}>
          <input className="f" type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
        </Campo>
        <Campo rotulo={L('Planejada', 'Planned')}>
          <input
            className="f"
            type="date"
            value={planejada}
            onChange={(e) => setPlanejada(e.target.value)}
          />
        </Campo>
      </div>

      <div className="frow">
        <Campo rotulo={L('Andamento', 'Progress')}>
          <select
            className="f"
            value={andamento}
            onChange={(e) => setAndamento(e.target.value as Andamento)}
          >
            {ANDAMENTOS.map((a) => (
              <option key={a} value={a}>
                {L(...ROTULO_ANDAMENTO[a])}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo={L('Prioridade', 'Priority')}>
          <select
            className="f"
            value={prioridade}
            onChange={(e) => setPrioridade(e.target.value as Prioridade | '')}
          >
            <option value="">{L('Sem prioridade', 'No priority')}</option>
            {PRIORIDADES.map((p) => (
              <option key={p} value={p}>
                {L(...ROTULO_PRIORIDADE[p])}
              </option>
            ))}
          </select>
        </Campo>
      </div>

      {/* A REGRA DITA ANTES DE ERRAR. Andamento e publicação são coisas
          diferentes, e é a pergunta que este formulário mais provoca. */}
      <p className="hint">
        {L(
          'Andamento é o trabalho de quem audita; publicar é o que torna o resultado visível ao fornecedor, e continua sendo um ato à parte na planilha. Se já existir auditoria deste tipo para este modelo, ela é reaproveitada e passa a valer este plano.',
          'Progress tracks the auditor’s work; publishing is what makes the result visible to the supplier, and remains a separate action in the sheet. If an audit of this type already exists for this model, it is reused and takes on this plan.',
        )}
      </p>
    </Gaveta>
  )
}

export { ROTULO_ANDAMENTO, ROTULO_PRIORIDADE }
