import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Mantém um único worker de ortografia vivo pela sessão e cuida da sua saúde.
 *
 * Init de worker que carrega WASM + dicionário tem duas falhas transitórias reais:
 * - a corrida do otimizador do Vite (o primeiro import do worker pega um chunk
 *   que o dev server acabou de invalidar → 504/erro de módulo);
 * - um chunk obsoleto após reiniciar o dev server, que um reload comum não cura.
 * Por isso, em vez de morrer no primeiro erro, o hook recria o worker algumas
 * vezes com um pequeno intervalo. Se ainda assim falhar, ele expõe o erro REAL
 * (arquivo/linha), não uma mensagem genérica — é o que permite descobrir a causa
 * de verdade quando o problema é do ambiente.
 */
const MAX_ATTEMPTS = 3

export function useSpellChecker() {
  const workerRef = useRef(null)
  const pending = useRef(new Map())
  const nextId = useRef(0)
  const attempt = useRef(0)
  const retryTimer = useRef(null)
  const disposed = useRef(false)

  const [status, setStatus] = useState('loading') // loading | ready | error
  const [error, setError] = useState(null)
  const [langs, setLangs] = useState([]) // idiomas carregados, ex.: ['pt', 'en']

  const spawn = useCallback(() => {
    // Encerra qualquer worker anterior antes de recriar.
    if (workerRef.current) {
      workerRef.current.terminate()
      workerRef.current = null
    }
    for (const { reject } of pending.current.values()) reject(new Error('corretor reiniciado'))
    pending.current.clear()

    setStatus('loading')
    setError(null)

    let worker
    try {
      worker = new Worker(new URL('../workers/spell.worker.js', import.meta.url), { type: 'module' })
    } catch (e) {
      // Falha ao sequer construir o worker (ex.: navegador sem suporte a module worker).
      setStatus('error')
      setError({ kind: 'module', message: e?.message || 'não foi possível criar o worker', detail: '' })
      return
    }
    workerRef.current = worker

    const scheduleRetry = (err) => {
      if (disposed.current) return
      if (attempt.current < MAX_ATTEMPTS) {
        const wait = 400 * attempt.current // 400ms, 800ms
        retryTimer.current = setTimeout(() => {
          attempt.current += 1
          spawn()
        }, wait)
      } else {
        setStatus('error')
        setError(err)
      }
    }

    worker.onmessage = (event) => {
      const msg = event.data
      if (msg.type === 'ready') {
        attempt.current = MAX_ATTEMPTS // trava: não recria mais depois de pronto
        setStatus('ready')
        setError(null)
        setLangs(msg.langs ?? ['pt'])
        return
      }
      if (msg.type === 'result') {
        pending.current.get(msg.id)?.resolve(msg.findings)
        pending.current.delete(msg.id)
        return
      }
      if (msg.type === 'error') {
        if (msg.id != null && pending.current.has(msg.id)) {
          // Erro de uma auditoria específica: não derruba o corretor.
          pending.current.get(msg.id).reject(new Error(msg.message))
          pending.current.delete(msg.id)
        } else {
          // Erro de init reportado pelo worker (ex.: dicionário 404).
          scheduleRetry({ kind: msg.dictionary ? 'dictionary' : 'init', message: msg.message, detail: '' })
        }
      }
    }

    // ErrorEvent de falha ao carregar/parsear o módulo do worker: traz arquivo e linha.
    worker.onerror = (e) => {
      e.preventDefault?.()
      const where = e.filename ? ` (${String(e.filename).split('/').pop()}:${e.lineno})` : ''
      scheduleRetry({ kind: 'module', message: e.message || 'falha ao carregar o módulo do corretor', detail: where })
    }

    worker.postMessage({ type: 'init' })
  }, [])

  useEffect(() => {
    disposed.current = false
    attempt.current = 1
    spawn()
    return () => {
      disposed.current = true
      clearTimeout(retryTimer.current)
      workerRef.current?.terminate()
      workerRef.current = null
      pending.current.clear()
    }
  }, [spawn])

  const retry = useCallback(() => {
    clearTimeout(retryTimer.current)
    attempt.current = 1
    spawn()
  }, [spawn])

  const check = useCallback((entries, options) => {
    const worker = workerRef.current
    if (!worker) return Promise.reject(new Error('corretor indisponível'))

    const id = nextId.current++
    return new Promise((resolve, reject) => {
      pending.current.set(id, { resolve, reject })
      worker.postMessage({ type: 'check', id, entries, options })
    })
  }, [])

  return { status, error, check, retry, langs }
}
