/** A planilha da auditoria geral — a aba BASE GERAL, dentro do sistema.
 *
 *  É a tela que o pedido descreve: "toda vez que gerarmos um modelo ele deve ter
 *  um campo de auditoria pra ele pra imputarmos os dados". Uma linha por item,
 *  as colunas da planilha, e se digita nela.
 *
 *  AS COLUNAS SÃO AS DO ARQUIVO, e a correspondência é literal:
 *
 *    INFORMATION      → o nome do critério (com a instrução de como conferir)
 *    VERIFICATION     → o status: aprovado / reprovado / N/A / pendente
 *    COMENTARY        → `comentario`, o diagnóstico
 *    DIRECTION        → `direcao`, a orientação ao fornecedor (migration 0008)
 *    IMAGE            → as evidências
 *    ITEMS ANALYZED   → `itens_analisados` / `itens_ok`
 *
 *  DUAS COLUNAS DA PLANILHA NÃO VIERAM, e é decisão, não esquecimento:
 *
 *  A coluna `APPROVED (%)` de cada linha, que no arquivo é um `0` ou `1` somado
 *  no rodapé. Ela não é dado — é a implementação do SUM, e a linha já diz a
 *  mesma coisa no status. O agregado vive no cabeçalho e vem do SERVIDOR: a
 *  tela nunca calcula percentual, senão passariam a existir duas contas de
 *  aprovação que divergem no primeiro arredondamento.
 *
 *  E a coluna oculta de orientação (a coluna I) não é uma coluna aqui: ela é a
 *  instrução do critério, e aparece embaixo do nome do item. Na planilha ela
 *  ficava à direita justamente para não ir junto quando o arquivo era mandado
 *  ao fornecedor; aqui a visibilidade é do portal, não da posição na grade.
 *
 *  SALVA NO BLUR, um campo por vez. Não há botão "salvar planilha" porque não há
 *  rascunho: cada célula é um PATCH e a aprovação volta recalculada. Auditar 17
 *  itens acumulando alterações locais é o caminho para perder meia hora de
 *  trabalho num refresh.
 */
import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { Cabecalho, Erro, Vazio } from '@/components/ui'
import { useI18n } from '@/i18n'
import { ApiError, api } from '@/lib/api'
import type {
  Auditoria,
  AuditoriaDetalhe,
  AuditoriaEstado,
  CheckStatus,
  ModeloDetalhe,
  Resultado,
  Versao,
} from '@/lib/types'
import { rotaProjeto } from '@/projeto/ProjetoContext'

/** A ordem do ciclo é a da planilha, não a alfabética: o caminho normal é
 *  pendente → aprovado, e reprovado é o desvio. Quem audita 17 itens clica
 *  uma vez na maioria deles. */
const CICLO: CheckStatus[] = ['pendente', 'aprovado', 'reprovado', 'na']

const CLASSE_STATUS: Record<CheckStatus, string> = {
  aprovado: 'setp ok',
  reprovado: 'setp bad',
  pendente: 'setp wait',
  na: 'setp na',
}

/** O rótulo é o da planilha em inglês e o equivalente em português — a
 *  coordenação lê "APPROVED / NOT APPROVED" nos arquivos de hoje. */
const ROTULO_STATUS: Record<CheckStatus, [string, string]> = {
  aprovado: ['Aprovado', 'Approved'],
  reprovado: ['Não aprovado', 'Not approved'],
  pendente: ['Pendente', 'Pending'],
  na: ['N/A', 'N/A'],
}

const ESTADO_PILL: Record<AuditoriaEstado, string> = {
  publicado: 'ok',
  nao_publicado: '',
  desatualizado: 'alerta',
}

const ROTULO_ESTADO: Record<AuditoriaEstado, [string, string]> = {
  publicado: ['Publicado', 'Published'],
  nao_publicado: ['Em andamento', 'In progress'],
  desatualizado: ['Desatualizado', 'Outdated'],
}

export default function PlanilhaGeral() {
  const { projetoId, modeloId } = useParams<{ projetoId: string; modeloId: string }>()
  const { L, lang } = useI18n()

  const [modelo, setModelo] = useState<ModeloDetalhe | null>(null)
  const [versaoId, setVersaoId] = useState<string | null>(null)
  const [auditoria, setAuditoria] = useState<Auditoria | null>(null)
  const [detalhe, setDetalhe] = useState<AuditoriaDetalhe | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [carregando, setCarregando] = useState(true)

  const carregarModelo = useCallback(async () => {
    if (!modeloId) return
    const m = await api.modelos.obter(modeloId)
    setModelo(m)
    // A última versão é a que se audita. `versoes` vem mais nova primeiro.
    setVersaoId((atual) => atual ?? m.versoes[0]?.id ?? null)
  }, [modeloId])

  const carregarAuditoria = useCallback(async () => {
    if (!versaoId) {
      setAuditoria(null)
      return
    }
    const lista = await api.versoes.auditorias(versaoId)
    // Só a geral: esta tela é a aba BASE GERAL, não o painel de auditorias.
    const geral = lista.filter((a) => a.checklist === 'geral')
    // O maior round é o que vale — os anteriores são histórico.
    geral.sort((a, b) => (b.round ?? 0) - (a.round ?? 0))
    setAuditoria(geral[0] ?? null)
  }, [versaoId])

  const carregarDetalhe = useCallback(async () => {
    if (!auditoria) {
      setDetalhe(null)
      return
    }
    setDetalhe(await api.auditorias.obter(auditoria.id))
  }, [auditoria])

  useEffect(() => {
    carregarModelo()
      .catch((e) => setErro(e instanceof ApiError ? e.message : String(e)))
      .finally(() => setCarregando(false))
  }, [carregarModelo])
  useEffect(() => {
    carregarAuditoria().catch((e) => setErro(e instanceof ApiError ? e.message : String(e)))
  }, [carregarAuditoria])
  useEffect(() => {
    carregarDetalhe().catch((e) => setErro(e instanceof ApiError ? e.message : String(e)))
  }, [carregarDetalhe])

  async function comErro(acao: () => Promise<unknown>) {
    setErro(null)
    setOcupado(true)
    try {
      await acao()
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : String(e))
    } finally {
      setOcupado(false)
    }
  }

  const publicada = detalhe?.estado === 'publicado'

  /** Grava um campo da linha. `carregarDetalhe` no fim não é preguiça: o PATCH
   *  recalcula a aprovação no servidor, e o cabeçalho tem de refletir isso. */
  async function salvar(resultado: Resultado, campo: Record<string, unknown>) {
    if (publicada) return
    await comErro(async () => {
      await api.resultados.atualizar(resultado.id, campo)
      await carregarDetalhe()
    })
  }

  async function ciclar(resultado: Resultado) {
    const proximo = CICLO[(CICLO.indexOf(resultado.status) + 1) % CICLO.length]!
    await salvar(resultado, { status: proximo })
  }

  async function enviarEvidencia(resultado: Resultado, arquivo: File) {
    if (publicada) return
    await comErro(async () => {
      await api.resultados.enviarEvidencia(resultado.id, arquivo)
      await carregarDetalhe()
    })
  }

  async function abrirEvidencia(evidenciaId: string) {
    await comErro(async () => {
      const { url } = await api.evidencias.url(evidenciaId)
      window.open(url, '_blank', 'noopener')
    })
  }

  async function publicar() {
    if (!detalhe) return
    await comErro(async () => {
      await api.auditorias.publicar(detalhe.id)
      await carregarDetalhe()
      await carregarAuditoria()
    })
  }

  /** Gera a NC a partir da linha reprovada. NÃO manda descrição nem
   *  recomendação: o servidor herda `comentario` → descrição e `direcao` →
   *  recomendação, com os papéis certos. Mandar daqui duplicaria a regra. */
  async function gerarNc(resultado: Resultado) {
    if (!detalhe) return
    await comErro(async () => {
      await api.auditorias.criarNc(detalhe.id, { resultado_id: resultado.id })
    })
  }

  if (carregando) return <p className="hint">{L('Carregando…', 'Loading…')}</p>

  const trilha = (
    <div className="crumb">
      <Link to={rotaProjeto(projetoId ?? '', 'auditoria/geral')}>
        {L('Auditoria geral', 'General audit')}
      </Link>{' '}
      / <b>{modelo?.codigo ?? '—'}</b>
    </div>
  )

  if (!modelo) {
    return (
      <>
        {trilha}
        <Erro mensagem={erro} />
        <Vazio
          titulo={L('Modelo não encontrado', 'Model not found')}
          texto={L(
            'O modelo pode ter sido removido. Volte à auditoria geral para ver a lista.',
            'The model may have been removed. Go back to the general audit for the list.',
          )}
        />
      </>
    )
  }

  const versao: Versao | undefined = modelo.versoes.find((v) => v.id === versaoId)

  if (!versao) {
    return (
      <>
        {trilha}
        <Erro mensagem={erro} />
        <Vazio
          titulo={L('Sem versão para auditar', 'No version to audit')}
          texto={L(
            'Este modelo não tem nenhuma versão registrada. A planilha nasce com a versão — registre a primeira na tela do modelo.',
            'This model has no registered version. The sheet is created with the version — register the first one on the model screen.',
          )}
        />
      </>
    )
  }

  if (!auditoria || !detalhe) {
    return (
      <>
        {trilha}
        <Erro mensagem={erro} />
        <Vazio
          titulo={L('A auditoria geral não está aberta', 'The general audit is not open')}
          texto={L(
            'A disciplina deste modelo não declara a auditoria geral, ou esta versão é anterior à abertura automática. Abra pela tela do modelo.',
            'This model’s discipline does not declare the general audit, or this version predates automatic opening. Open it from the model screen.',
          )}
        />
      </>
    )
  }

  if (detalhe.resultados.length === 0) {
    return (
      <>
        {trilha}
        <Erro mensagem={erro} />
        <Vazio
          titulo={L('A planilha está sem linhas', 'The sheet has no rows')}
          texto={L(
            'A auditoria existe, mas o projeto não tem itens no checklist geral — não há o que responder. Aplique o gabarito dos 17 itens em Configuração › Biblioteca de critérios.',
            'The audit exists, but the project has no items in the general checklist — there is nothing to answer. Apply the 17-item template under Settings › Criteria library.',
          )}
        />
      </>
    )
  }

  const pct = detalhe.aprovacao_pct === null ? null : Math.round(Number(detalhe.aprovacao_pct))

  return (
    <>
      {trilha}

      <Cabecalho
        titulo={`${L('Auditoria geral', 'General audit')} · ${modelo.codigo}`}
        sub={L(
          'Uma linha por item. O que se digita aqui é a auditoria — painel, matriz, relatório e KPIs são leituras disto. Cada campo salva ao sair dele; não há botão de salvar a planilha.',
          'One row per item. What you type here IS the audit — dashboard, matrix, report and KPIs are readings of it. Each field saves when you leave it; there is no save-sheet button.',
        )}
      />

      {/* O cabeçalho do arquivo: ANALYZED VERSION, ITEMS, APPROVED %, estado.
          O percentual vem do SERVIDOR — a tela não soma nada, senão passariam a
          existir duas contas de aprovação que divergem no arredondamento. */}
      <div className="metrics">
        <div className="metric">
          <div className="lb">{L('Versão analisada', 'Analyzed version')}</div>
          <div className="vl">
            {versao.versao}
            {detalhe.round !== null && <small> · round {detalhe.round}</small>}
          </div>
        </div>
        <div className="metric">
          <div className="lb">{L('Itens', 'Items')}</div>
          <div className="vl">
            {detalhe.resultados.length}
            {detalhe.pendentes > 0 && (
              <small>
                {' '}
                · {detalhe.pendentes} {L('pendente(s)', 'pending')}
              </small>
            )}
          </div>
        </div>
        <div className="metric">
          <div className="lb">{L('Aprovação', 'Approved')}</div>
          {/* Regra 2: o número fica em `--ink`. Uma fileira de números coloridos
              vira semáforo e perde-se qual valor é grande. */}
          <div className="vl">{pct === null ? '—' : `${pct}%`}</div>
        </div>
        <div className="metric">
          <div className="lb">{L('Estado', 'State')}</div>
          <div className="vl">
            <span className={`pill ${ESTADO_PILL[detalhe.estado]}`}>
              {L(...ROTULO_ESTADO[detalhe.estado])}
            </span>
          </div>
        </div>
      </div>

      <div className="acoes">
        <div style={{ flex: 1 }} />
        <Link className="btn" to={rotaProjeto(projetoId ?? '', `modelos/${modelo.id}`)}>
          {L('Ver o modelo', 'Open the model')}
        </Link>
        {!publicada && (
          <button
            className="btn pri"
            onClick={publicar}
            disabled={ocupado || detalhe.pendentes > 0}
            title={
              detalhe.pendentes > 0
                ? L(
                    `Ainda há ${detalhe.pendentes} item(ns) pendente(s)`,
                    `${detalhe.pendentes} item(s) still pending`,
                  )
                : undefined
            }
          >
            {L('Publicar round', 'Publish round')}
          </button>
        )}
      </div>

      <Erro mensagem={erro} />

      {publicada && (
        <p className="hint">
          {L(
            'Round publicado — a planilha ficou somente leitura. Uma versão nova reabre a auditoria em outro round.',
            'Round published — the sheet is read-only. A new version reopens the audit in another round.',
          )}
        </p>
      )}

      {/* `overflowX` no card, como em `components/Matriz.tsx`: `.card` tem
          `overflow: hidden`, então sem isto a grade larga seria CORTADA em vez
          de rolar. E a rolagem fica aqui dentro — o corpo da página nunca rola
          de lado. */}
      <div className="card" style={{ overflowX: 'auto' }}>
        <table className="plan">
          <thead>
            <tr>
              <th style={{ width: 34 }}>#</th>
              <th>{L('Informação', 'Information')}</th>
              <th style={{ width: 132 }}>{L('Verificação', 'Verification')}</th>
              <th>{L('Comentário', 'Comentary')}</th>
              <th>{L('Direção', 'Direction')}</th>
              <th style={{ width: 118 }}>{L('Itens', 'Items')}</th>
              <th style={{ width: 150 }}>{L('Imagem', 'Image')}</th>
            </tr>
          </thead>
          <tbody>
            {detalhe.resultados.map((r, i) => (
              <Linha
                key={r.id}
                numero={i + 1}
                resultado={r}
                idioma={lang}
                travada={publicada}
                ocupado={ocupado}
                onCiclar={() => ciclar(r)}
                onSalvar={(campo) => salvar(r, campo)}
                onEvidencia={(arquivo) => enviarEvidencia(r, arquivo)}
                onAbrirEvidencia={abrirEvidencia}
                onGerarNc={() => gerarNc(r)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

/** Uma linha da planilha.
 *
 *  O texto é estado LOCAL enquanto se digita e só sobe no blur. Sem isso cada
 *  tecla seria um PATCH — e, como o PATCH devolve a auditoria recalculada e a
 *  tela recarrega, o cursor saltaria para o fim do campo a cada letra.
 */
function Linha({
  numero,
  resultado,
  idioma,
  travada,
  ocupado,
  onCiclar,
  onSalvar,
  onEvidencia,
  onAbrirEvidencia,
  onGerarNc,
}: {
  numero: number
  resultado: Resultado
  idioma: 'pt' | 'en'
  travada: boolean
  ocupado: boolean
  onCiclar: () => void
  onSalvar: (campo: Record<string, unknown>) => void
  onEvidencia: (arquivo: File) => void
  onAbrirEvidencia: (id: string) => void
  onGerarNc: () => void
}) {
  const { L } = useI18n()
  const [comentario, setComentario] = useState(resultado.comentario ?? '')
  const [direcao, setDirecao] = useState(resultado.direcao ?? '')
  const [analisados, setAnalisados] = useState(resultado.itens_analisados?.toString() ?? '')
  const [ok, setOk] = useState(resultado.itens_ok?.toString() ?? '')

  // Se o servidor mudou o valor (automação, outra aba), o campo acompanha —
  // mas só quando não é o que o usuário acabou de digitar.
  useEffect(() => setComentario(resultado.comentario ?? ''), [resultado.comentario])
  useEffect(() => setDirecao(resultado.direcao ?? ''), [resultado.direcao])

  const criterio = resultado.criterio
  const nome = idioma === 'pt' ? criterio.nome_pt : criterio.nome_en
  const instrucao = criterio.instrucao

  function numeroOuNulo(texto: string): number | null {
    const limpo = texto.trim()
    if (limpo === '') return null
    const n = Number(limpo)
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : null
  }

  return (
    <tr>
      <td className="co plan-num">{numero}</td>

      <td>
        <div className="plan-nome">{nome}</div>
        {/* A instrução é a coluna oculta da planilha: diz COMO conferir. */}
        {instrucao && <div className="plan-instrucao">{instrucao}</div>}
        <div className="plan-codigo">
          {criterio.codigo}
          {resultado.origem === 'automatico' && (
            <span className="auto a">{L('automático', 'automatic')}</span>
          )}
        </div>
      </td>

      <td>
        <button
          className={CLASSE_STATUS[resultado.status]}
          onClick={onCiclar}
          disabled={travada || ocupado}
          title={
            travada
              ? L('Round publicado', 'Published round')
              : L('Clique para trocar', 'Click to change')
          }
        >
          {L(...ROTULO_STATUS[resultado.status])}
        </button>
        {/* Só aparece no reprovado porque o backend só aceita aí — "só itens
            reprovados geram não-conformidade". Um botão que devolve 409 é pior
            do que botão nenhum. */}
        {resultado.status === 'reprovado' && !travada && (
          <button
            className="btn sm plan-nc"
            onClick={onGerarNc}
            disabled={ocupado}
            title={L(
              'Cria a não-conformidade com estas duas frases: comentário → descrição, direção → recomendação.',
              'Creates the non-conformity from these two sentences: comment → description, direction → recommendation.',
            )}
          >
            {L('Gerar NC', 'Raise NC')}
          </button>
        )}
      </td>

      <td>
        <textarea
          className="cel"
          rows={2}
          value={comentario}
          readOnly={travada}
          placeholder={travada ? '' : L('O que está errado', 'What is wrong')}
          onChange={(e) => setComentario(e.target.value)}
          onBlur={() => {
            if (comentario !== (resultado.comentario ?? '')) onSalvar({ comentario })
          }}
        />
      </td>

      <td>
        <textarea
          className="cel"
          rows={2}
          value={direcao}
          readOnly={travada}
          placeholder={travada ? '' : L('O que o fornecedor deve fazer', 'What the supplier must do')}
          onChange={(e) => setDirecao(e.target.value)}
          onBlur={() => {
            if (direcao !== (resultado.direcao ?? '')) onSalvar({ direcao })
          }}
        />
      </td>

      {/* `ok / analisados` — a coluna ITEMS ANALYZED. Na planilha ela é `1.0`
          em toda linha, porque lá cada item é um check e o número não tem para
          onde variar. Aqui ela serve ao critério de nível ELEMENTO (4D, LOD),
          em que "12 de 340 elementos" é a resposta. Fica vazia no nível modelo,
          que é mais honesto do que uma coluna de 1,0. */}
      <td>
        <div className="plan-contagem">
          <input
            className="cel"
            inputMode="numeric"
            value={ok}
            readOnly={travada}
            aria-label={L('Itens conformes', 'Items OK')}
            onChange={(e) => setOk(e.target.value)}
            onBlur={() => {
              const v = numeroOuNulo(ok)
              if (v !== resultado.itens_ok) onSalvar({ itens_ok: v })
            }}
          />
          <span className="co">/</span>
          <input
            className="cel"
            inputMode="numeric"
            value={analisados}
            readOnly={travada}
            aria-label={L('Itens analisados', 'Items analyzed')}
            onChange={(e) => setAnalisados(e.target.value)}
            onBlur={() => {
              const v = numeroOuNulo(analisados)
              if (v !== resultado.itens_analisados) onSalvar({ itens_analisados: v })
            }}
          />
        </div>
      </td>

      <td>
        <div className="plan-imagens">
          {resultado.evidencias.map((ev) => (
            <button
              key={ev.id}
              className="btn sm"
              onClick={() => onAbrirEvidencia(ev.id)}
              title={ev.legenda ?? ev.arquivo_url}
            >
              {ev.legenda || L('ver imagem', 'view image')}
            </button>
          ))}
          {!travada && (
            <label className="btn sm" style={{ cursor: 'pointer' }}>
              {L('+ imagem', '+ image')}
              <input
                type="file"
                accept="image/*,.pdf"
                hidden
                onChange={(e) => {
                  const arquivo = e.target.files?.[0]
                  if (arquivo) onEvidencia(arquivo)
                  // Zera o input: sem isto, reenviar o MESMO arquivo depois de
                  // um erro não dispara `change` e nada acontece.
                  e.target.value = ''
                }}
              />
            </label>
          )}
        </div>
      </td>
    </tr>
  )
}
