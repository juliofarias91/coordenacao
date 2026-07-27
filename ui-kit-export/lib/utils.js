import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Junta classes condicionais e resolve conflitos do Tailwind (a última vence).
// Sem twMerge, `cn('p-2', 'p-4')` deixa as duas no DOM e quem ganha é a ordem do
// CSS gerado — não a ordem da chamada. É a base de todo componente com `className`.
// deps: clsx, tailwind-merge
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
