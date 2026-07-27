/**
 * Hash de conteúdo (SHA-256) para detectar cópias com nome diferente.
 *
 * Usa a Web Crypto (crypto.subtle), que só existe em contexto seguro — https ou
 * localhost. Servido em http puro numa LAN, `crypto.subtle` é undefined; nesse
 * caso devolvemos null e a detecção por conteúdo simplesmente não roda, sem
 * derrubar a auditoria de nome/ortografia (mesma filosofia do corretor).
 */
export async function sha256(buffer) {
  if (!globalThis.crypto?.subtle) return null
  try {
    const digest = await crypto.subtle.digest('SHA-256', buffer)
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
  } catch {
    return null
  }
}
