/** SHA-256 do conteúdo, para achar cópia salva com outro nome.
 *
 *  Usa a Web Crypto, que só existe em contexto seguro (https ou localhost).
 *  Servido em http puro numa LAN, devolve null e a detecção por conteúdo
 *  apenas não roda — nome e ortografia seguem normalmente.
 */
export function sha256(buffer: ArrayBuffer): Promise<string | null>
