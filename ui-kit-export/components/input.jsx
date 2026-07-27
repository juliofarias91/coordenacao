import * as React from 'react';
import { cn } from '../lib/utils';

// Campo de texto canônico. Encapsula o padrão que, sem componente, aparece
// redigitado em dezenas de telas — e diverge em metade delas.
//
// O foco muda a BORDA (focus:border-primary), não o anel. Anel de foco em cada
// input de um formulário denso vira ruído; a borda que acende é suficiente e
// não desloca layout (border-width não muda).
const Input = React.forwardRef(({ className, type = 'text', ...props }, ref) => (
  <input
    ref={ref}
    type={type}
    className={cn(
      'w-full appearance-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-primary disabled:cursor-not-allowed disabled:opacity-60',
      className,
    )}
    {...props}
  />
));
Input.displayName = 'Input';

// Rótulo do campo. Sempre acima, sempre nesta escala.
export function Label({ children, className }) {
  return (
    <p className={cn('mb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground', className)}>
      {children}
    </p>
  );
}

export function Field({ label, children, className }) {
  return <div className={className}><Label>{label}</Label>{children}</div>;
}

export { Input };
