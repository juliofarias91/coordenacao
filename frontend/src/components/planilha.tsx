/** O COMPORTAMENTO da planilha de auditoria: carregar, gravar, anexar.
 *
 *  Um hook, e não uma tela — a tela é `pages/auditoria/Recorte.tsx`, uma só para
 *  os cinco recortes. Este arquivo nasceu quando eram DUAS telas (a geral e a de
 *  LOD) e existia para elas não divergirem; hoje o corte é outro e continua
 *  valendo: aqui mora o que se FAZ com a auditoria, lá mora como ela se DESENHA.
 *
 *  As células, o cabeçalho de status e a coluna de imagens moravam aqui e saíram
 *  em 01/08/2026 com as duas telas antigas. O que as substituiu está em
 *  `components/GradePlanilha.tsx` (a grade) e `components/ImagemDaLinha.tsx` (o
 *  painel de colar imagem).
 *
 *  PUBLICAR ROUND NÃO ESTÁ AQUI, e é decisão de 01/08/2026: o botão saiu da
 *  planilha a pedido, e a porta dele continua sendo a TELA DO MODELO
 *  (`pages/Modelo.tsx`) — que é onde se cuida do modelo, enquanto aqui se
 *  preenche a auditoria dele. Um método de hook que ninguém chama é andaime.
 */
import { useCallback, useEffect, useState } from 'react'

import { ApiError, api } from '@/lib/api'
import type {
  Auditoria,
  AuditoriaDetalhe,
  ChecklistTipo,
  ModeloDetalhe,
  Resultado,
  Versao,
} from '@/lib/types'

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

  /** Remove uma evidência. Vai para a LIXEIRA como todo o resto — colar a
   *  imagem errada é o erro mais barato desta tela, e ele não devia custar uma
   *  perda definitiva. */
  const removerEvidencia = useCallback(
    async (evidenciaId: string) => {
      if (publicada) return
      await comErro(async () => {
        await api.evidencias.remover(evidenciaId)
        await carregarDetalhe()
      })
    },
    [publicada, comErro, carregarDetalhe],
  )

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
    enviarEvidencia,
    abrirEvidencia,
    removerEvidencia,
    gerarNc,
  }
}
