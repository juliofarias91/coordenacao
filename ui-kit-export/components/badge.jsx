import * as React from 'react';
import { cva } from 'class-variance-authority';

import { cn } from '../lib/utils';
import { TONES } from '../lib/design-tokens';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground hover:bg-primary/80',
        secondary: 'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
        destructive: 'border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80',
        outline: 'text-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

function Badge({ className, variant, ...props }) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

// Pílula de ESTADO (status, prioridade, resultado). Diferente do Badge: fundo
// translúcido /10 em vez de sólido.
//
// Quando usar qual: Badge sólido é IDENTIDADE (papel, plano, contagem — vale por
// si). Pill translúcida é ESTADO (aberto/resolvido/atrasado — vale por comparação
// com as outras linhas da lista). Uma lista de badges sólidos coloridos vira um
// mostruário; a mesma lista com pills lê como uma coluna.
function Pill({ tone = 'primary', className, children }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
      TONES[tone], className,
    )}>
      {children}
    </span>
  );
}

export { Badge, badgeVariants, Pill };
