/** Normalização de texto para BUSCA — caixa e acento fora do caminho.
 *
 *  Ela nasceu dentro de `components/BuscaGlobal.tsx` e saiu de lá em 07/08/2026,
 *  quando o painel da configuração passou a filtrar seções e precisou da mesma
 *  comparação. Duas cópias de uma normalização divergem na primeira vez que
 *  alguém acrescentar o hífen ou o apóstrofo a uma delas — e a divergência
 *  aparece como "a busca daquela tela não acha", que ninguém liga à causa.
 */
export function normalizar(s: string): string {
  // O intervalo é U+0300–U+036F: os diacríticos que o `normalize('NFD')`
  // separa da letra. Removendo-os, "critério" e "criterio" viram a mesma
  // coisa — e quem digita rápido não põe acento.
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}
