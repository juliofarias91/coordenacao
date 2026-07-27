/** Estado compartilhado das três abas do módulo de auditoria de arquivos.
 *
 *  Padrões e palavras aceitas vivem no localStorage: são a bancada de quem
 *  audita, não configuração do projeto. O padrão do PROJETO — o que gera
 *  penalidade e notificação — continua no backend, na aba `Padrão do projeto`.
 */
import { useCallback, useEffect, useState } from 'react'

import type { Padrao } from '@/lib/auditer/patterns'
import {
  loadIgnoreWords,
  loadPatterns,
  saveIgnoreWords,
  savePatterns,
} from '@/lib/auditer/storage'

export function useBancadaAuditer() {
  const [padroes, setPadroes] = useState<Padrao[]>(() => loadPatterns())
  const [aceitas, setAceitas] = useState<string[]>(() => loadIgnoreWords())

  // Corpo com chaves de propósito: `savePatterns` devolve boolean e o React
  // trataria um retorno de efeito como função de limpeza.
  useEffect(() => {
    savePatterns(padroes)
  }, [padroes])

  useEffect(() => {
    saveIgnoreWords(aceitas)
  }, [aceitas])

  const aceitarPalavra = useCallback((palavra: string) => {
    const limpa = palavra.trim()
    if (!limpa) return
    setAceitas((atuais) =>
      atuais.some((p) => p.toLowerCase() === limpa.toLowerCase()) ? atuais : [...atuais, limpa],
    )
  }, [])

  const removerPalavra = useCallback((palavra: string) => {
    setAceitas((atuais) => atuais.filter((p) => p !== palavra))
  }, [])

  return { padroes, setPadroes, aceitas, aceitarPalavra, removerPalavra, setAceitas }
}

export type Bancada = ReturnType<typeof useBancadaAuditer>
