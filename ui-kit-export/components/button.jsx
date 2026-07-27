import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';

import { cn } from '../lib/utils';

// Botão canônico. Forma: rounded-lg, font-semibold, text-sm.
// `variant` define a COR, `size` define a ALTURA — nunca misture as duas coisas
// numa variante nova.
//
// Nota sobre `dangerOutline`: destrutivo tem dois pesos. `destructive` é sólido
// (confirmação final, dentro de um diálogo); `dangerOutline` é a borda vermelha
// (a ação está disponível na tela, mas não convida). Ter só o sólido faz toda
// tela com "Excluir" parecer um alerta.
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        dangerOutline: 'border border-red-500/30 bg-transparent text-red-500 hover:border-red-500/50 hover:bg-red-500/10',
        outline: 'border border-border bg-transparent text-foreground hover:bg-muted',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'text-muted-foreground hover:bg-muted hover:text-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-lg px-3',
        lg: 'h-11 rounded-lg px-8',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button';
  return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
});
Button.displayName = 'Button';

export { Button, buttonVariants };
