/** Persistência dos padrões avançados e das palavras aceitas.
 *
 *  Vive no localStorage do navegador. É deliberadamente separado do padrão de
 *  nomenclatura do projeto, que mora no backend (`api.nomenclatura`) e vale
 *  para todo o time: estes padrões são a bancada de trabalho de quem audita,
 *  e o Exportar/Importar em JSON é como eles viajam entre máquinas.
 */
import type { Padrao } from './patterns'

export function loadPatterns(): Padrao[]
/** false quando o localStorage está indisponível ou cheio. */
export function savePatterns(patterns: Padrao[]): boolean
export function loadIgnoreWords(): string[]
export function saveIgnoreWords(words: string[]): void
