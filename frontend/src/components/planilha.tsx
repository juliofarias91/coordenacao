/** As peças comuns das planilhas de auditoria.
 *
 *  Há DUAS planilhas — a geral (17 itens chapados) e a de LOD (elemento ×
 *  informação, com as colunas de parâmetro) — e elas diferem no que mostram, não
 *  em como funcionam. Carregar o modelo, achar a auditoria da versão vigente,
 *  gravar uma célula no blur, subir evidência, publicar o round: tudo igual.
 *
 *  Sem este arquivo seriam dois arquivos de 500 linhas quase idênticos, e a
 *  primeira correção entraria em um só. O corte é este: o COMPORTAMENTO mora
 *  aqui, as COLUNAS moram em cada tela.
 */
import { useCallback, useEffect, useState } from 'react'

import { useI18n } from '@/i18n'
import { ApiError, api } from '@/lib/api'
import type {
  Auditoria,
  AuditoriaDetalhe,
  AuditoriaEstado,
  CheckStatus,
  ChecklistTipo,
  ModeloDetalhe,
  Resultado,
  Versao,
} from '@/lib/types'

/** A ordem do ciclo é a da planilha, não a alfabética: o caminho normal é
 *  pendente → aprovado, e reprovado é o desvio. Quem responde 60 linhas clica
 *  uma vez na maioria delas. */
export const CICLO: CheckStatus[] = ['pendente', 'aprovado', 'reprovado', 'na']

export const CLASSE_STATUS: Record<CheckStatus, string> = {
  aprovado: 'setp ok',
  reprovado: 'setp bad',
  pendente: 'setp wait',
  na: 'setp na',
}

/** O rótulo é o da planilha em inglês e o equivalente em português — a
 *  coordenação lê "APPROVED / NOT APPROVED" nos arquivos de hoje. */
export const ROTULO_STATUS: Record<CheckStatus, [string, string]> = {
  aprovado: ['Aprovado', 'Approved'],
  reprovado: ['Não aprovado', 'Not approved'],
  pendente: ['Pendente', 'Pending'],
  na: ['N/A', 'N/A'],
}

export const CLASSE_ESTADO: Record<AuditoriaEstado, string> = {
  publicado: 'pill ok',
  nao_publicado: 'pill',
  desatualizado: 'pill alerta',
}

export const ROTULO_ESTADO: Record<AuditoriaEstado, [string, string]> = {
  publicado: ['Publicado', 'Published'],
  nao_publicado: ['Em andamento', 'In progress'],
  desatualizado: ['Desatualizado', 'Outdated'],
}

/** Tudo o que uma planilha precisa saber e fazer.
 *
 *  Um hook e não um componente porque o que ele devolve é montado de formas
 *  diferentes por cada tela — a de LOD agrupa por categoria, a geral não.
 */
export function usePlanilha(modeloId: string | undefined, checklist: ChecklistTipo) {
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
    const doRecorte = lista.filter((a) => a.checklist === checklist)
    // O maior round é o que vale — os anteriores são histórico.
    doRecorte.sort((a, b) => (b.round ?? 0) - (a.round ?? 0))
    setAuditoria(doRecorte[0] ?? null)
  }, [versaoId, checklist])

  const carregarDetalhe = useCallback(async () => {
    if (!auditoria) {
      setDetalhe(null)
      return
    }
    setDetalhe(await api.auditorias.obter(auditoria.id))
  }, [auditoria])

  const comErro = useCallback(async (acao: () => Promise<unknown>) => {
    setErro(null)
    setOcupado(true)
    try {
      await acao()
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : String(e))
    } finally {
      setOcupado(false)
    }
  }, [])

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

  const publicada = detalhe?.estado === 'publicado'
  const versao: Versao | undefined = modelo?.versoes.find((v) => v.id === versaoId)

  /** Grava um campo da linha. Recarrega o detalhe no fim, e não é preguiça: o
   *  PATCH recalcula a aprovação no SERVIDOR, e o cabeçalho tem de refletir
   *  isso. A tela nunca calcula percentual. */
  const salvar = useCallback(
    async (resultado: Resultado, campo: Record<string, unknown>) => {
      if (publicada) return
      await comErro(async () => {
        await api.resultados.atualizar(resultado.id, campo)
        await carregarDetalhe()
      })
    },
    [publicada, comErro, carregarDetalhe],
  )

  const ciclar = useCallback(
    async (resultado: Resultado) => {
      const proximo = CICLO[(CICLO.indexOf(resultado.status) + 1) % CICLO.length]!
      await salvar(resultado, { status: proximo })
    },
    [salvar],
  )

  const enviarEvidencia = useCallback(
    async (resultado: Resultado, arquivo: File) => {
      if (publicada) return
      await comErro(async () => {
        await api.resultados.enviarEvidencia(resultado.id, arquivo)
        await carregarDetalhe()
      })
    },
    [publicada, comErro, carregarDetalhe],
  )

  const abrirEvidencia = useCallback(
    async (evidenciaId: string) => {
      await comErro(async () => {
        const { url } = await api.evidencias.url(evidenciaId)
        window.open(url, '_blank', 'noopener')
      })
    },
    [comErro],
  )

  const publicar = useCallback(async () => {
    if (!detalhe) return
    await comErro(async () => {
      await api.auditorias.publicar(detalhe.id)
      await carregarDetalhe()
      await carregarAuditoria()
    })
  }, [detalhe, comErro, carregarDetalhe, carregarAuditoria])

  /** Gera a NC a partir da linha reprovada. NÃO manda descrição nem
   *  recomendação: o servidor herda `comentario` → descrição e `direcao` →
   *  recomendação, com os papéis certos. Mandar daqui duplicaria a regra. */
  const gerarNc = useCallback(
    async (resultado: Resultado) => {
      if (!detalhe) return
      await comErro(() => api.auditorias.criarNc(detalhe.id, { resultado_id: resultado.id }))
    },
    [detalhe, comErro],
  )

  return {
    modelo,
    versao,
    auditoria,
    detalhe,
    erro,
    ocupado,
    carregando,
    publicada,
    salvar,
    ciclar,
    enviarEvidencia,
    abrirEvidencia,
    publicar,
    gerarNc,
  }
}

/** Uma célula de texto que salva ao SAIR dela.
 *
 *  O texto é estado LOCAL enquanto se digita. Sem isso cada tecla seria um
 *  PATCH — e, como o PATCH devolve a auditoria recalculada e a tela recarrega,
 *  o cursor saltaria para o fim do campo a cada letra.
 *
 *  O `useEffect` de sincronia existe para o caso oposto: quando o valor muda no
 *  SERVIDOR (a automação preencheu, outra aba editou), o campo acompanha.
 */
export function CelulaTexto({
  valor,
  travada,
  dica,
  linhas = 2,
  onSalvar,
}: {
  valor: string | null
  travada: boolean
  dica?: string
  linhas?: number
  onSalvar: (novo: string) => void
}) {
  const original = valor ?? ''
  const [texto, setTexto] = useState(original)

  useEffect(() => setTexto(original), [original])

  return (
    <textarea
      className="cel"
      rows={linhas}
      value={texto}
      readOnly={travada}
      placeholder={travada ? '' : dica}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={() => {
        if (texto !== original) onSalvar(texto)
      }}
    />
  )
}

/** Uma célula de número inteiro não-negativo, ou vazia. */
export function CelulaNumero({
  valor,
  travada,
  rotulo,
  onSalvar,
}: {
  valor: number | null
  travada: boolean
  rotulo: string
  onSalvar: (novo: number | null) => void
}) {
  const original = valor?.toString() ?? ''
  const [texto, setTexto] = useState(original)

  useEffect(() => setTexto(original), [original])

  return (
    <input
      className="cel"
      inputMode="numeric"
      value={texto}
      readOnly={travada}
      aria-label={rotulo}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={() => {
        const limpo = texto.trim()
        if (limpo === '') {
          if (valor !== null) onSalvar(null)
          return
        }
        const n = Number(limpo)
        const valido = Number.isFinite(n) && n >= 0 ? Math.round(n) : null
        if (valido !== valor) onSalvar(valido)
      }}
    />
  )
}

/** A pílula de VERIFICATION: clica e cicla. */
export function BotaoStatus({
  status,
  travada,
  ocupado,
  onCiclar,
}: {
  status: CheckStatus
  travada: boolean
  ocupado: boolean
  onCiclar: () => void
}) {
  const { L } = useI18n()
  return (
    <button
      className={CLASSE_STATUS[status]}
      onClick={onCiclar}
      disabled={travada || ocupado}
      title={
        travada ? L('Round publicado', 'Published round') : L('Clique para trocar', 'Click to change')
      }
    >
      {L(...ROTULO_STATUS[status])}
    </button>
  )
}

/** A coluna IMAGE: o que já subiu, e o botão de subir mais. */
export function Imagens({
  resultado,
  travada,
  onEnviar,
  onAbrir,
}: {
  resultado: Resultado
  travada: boolean
  onEnviar: (arquivo: File) => void
  onAbrir: (evidenciaId: string) => void
}) {
  const { L } = useI18n()
  return (
    <div className="plan-imagens">
      {resultado.evidencias.map((ev) => (
        <button
          key={ev.id}
          className="btn sm"
          onClick={() => onAbrir(ev.id)}
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
              if (arquivo) onEnviar(arquivo)
              // Zera o input: sem isto, reenviar o MESMO arquivo depois de um
              // erro não dispara `change` e nada acontece.
              e.target.value = ''
            }}
          />
        </label>
      )}
    </div>
  )
}

/** O cabeçalho de números da planilha, igual nas duas.
 *
 *  O percentual vem do SERVIDOR. A tela não soma nada, senão passariam a
 *  existir duas contas de aprovação que divergem no primeiro arredondamento.
 */
export function CabecalhoPlanilha({
  versao,
  detalhe,
}: {
  versao: Versao
  detalhe: AuditoriaDetalhe
}) {
  const { L } = useI18n()
  const pct = detalhe.aprovacao_pct === null ? null : Math.round(Number(detalhe.aprovacao_pct))

  return (
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
          <span className={CLASSE_ESTADO[detalhe.estado]}>
            {L(...ROTULO_ESTADO[detalhe.estado])}
          </span>
        </div>
      </div>
    </div>
  )
}
