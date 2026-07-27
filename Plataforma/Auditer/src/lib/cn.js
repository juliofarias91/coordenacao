import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Junta classes resolvendo conflitos do Tailwind (a convenção do shadcn).
 *
 * O twMerge não é enfeite: sem ele, `cn('w-full', 'w-auto')` deixa as duas
 * classes na string e quem vence é a ordem do CSS gerado, não a da chamada —
 * o que faz um `w-auto` local ser silenciosamente ignorado.
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs))
}
