import { motion } from 'framer-motion';

import { cn } from '../lib/utils';
import { MOTION } from '../lib/design-tokens';

const LABEL_WIDTH = 72;

/**
 * Dock de navegação inferior (mobile). Recebe os MESMOS itens da sidebar — é a
 * mesma navegação em outro corpo, não uma navegação paralela.
 *
 * Pílula FLUTUANTE (bottom-4, w-fit, rounded-full, shadow-xl), não uma barra
 * colada na borda: a barra colada come a área de gesto do sistema no iOS.
 *
 * O rótulo do item ativo se REVELA por largura animada (spring) — mesma
 * microinteração dos botões que crescem no hover, adaptada ao toque, onde não
 * existe hover.
 */
export function BottomNav({ className, items = [], activeKey, onSelect, sticky = true }) {
  return (
    <motion.nav
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={MOTION.springEnter}
      role="navigation"
      aria-label="Navegação"
      className={cn(
        'flex h-[52px] max-w-[95vw] items-center space-x-1 overflow-x-auto rounded-full border border-border bg-card p-2 shadow-xl',
        sticky && 'fixed inset-x-0 bottom-4 z-30 mx-auto w-fit',
        className,
      )}
    >
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = activeKey === item.key;
        return (
          <motion.button
            key={item.key}
            type="button"
            whileTap={{ scale: 0.97 }}
            onClick={() => onSelect?.(item.key)}
            aria-label={item.label}
            className={cn(
              'relative flex h-10 min-h-[40px] min-w-[44px] cursor-pointer appearance-none items-center rounded-full border-0 px-3 py-2 transition-colors duration-200 focus:outline-none',
              isActive ? 'gap-2 font-semibold text-foreground' : 'gap-0 text-muted-foreground hover:text-foreground',
            )}
          >
            {Icon && <Icon size={22} strokeWidth={2} aria-hidden />}
            <motion.div
              initial={false}
              animate={{
                width: isActive ? `${LABEL_WIDTH}px` : '0px',
                opacity: isActive ? 1 : 0,
                marginLeft: isActive ? '8px' : '0px',
              }}
              transition={{
                width: MOTION.springLabel,
                opacity: { duration: 0.19 },
                marginLeft: { duration: 0.19 },
              }}
              className="flex max-w-[72px] items-center overflow-hidden"
            >
              <span
                title={item.label}
                className={cn(
                  'select-none overflow-hidden text-ellipsis whitespace-nowrap text-xs leading-[1.9] transition-opacity duration-200',
                  isActive ? 'font-semibold text-foreground' : 'opacity-0',
                )}
              >
                {item.label}
              </span>
            </motion.div>
          </motion.button>
        );
      })}
    </motion.nav>
  );
}

export default BottomNav;
