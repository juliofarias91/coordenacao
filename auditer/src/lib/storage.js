/**
 * Persistência dos padrões em localStorage.
 *
 * Sem login e sem backend, o navegador é a única casa dos padrões — daí o
 * export/import em JSON na página de Padrões, que é como um padrão viaja entre
 * máquinas ou sobrevive a uma limpeza de cache.
 */
import { normalizePattern } from './patterns'

const KEY = 'auditer_patterns_v1'

export function loadPatterns() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    // Normaliza padrões salvos no formato antigo (delimitador único → sep por segmento).
    return Array.isArray(parsed) ? parsed.map(normalizePattern) : []
  } catch {
    return []
  }
}

export function savePatterns(patterns) {
  try {
    localStorage.setItem(KEY, JSON.stringify(patterns))
    return true
  } catch {
    return false
  }
}

const IGNORE_KEY = 'auditer_ignore_v1'

export function loadIgnoreWords() {
  try {
    const raw = localStorage.getItem(IGNORE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function saveIgnoreWords(words) {
  try {
    localStorage.setItem(IGNORE_KEY, JSON.stringify(words))
  } catch {}
}
