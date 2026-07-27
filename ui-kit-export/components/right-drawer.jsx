'use client';

import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';

import { cn } from '../lib/utils';
import { LAYOUT, MOTION, Z } from '../lib/design-tokens';

/**
 * Painel lateral direito. Desliza por cima do conteúdo.
 *
 * SEM SOMBRA E SEM ESCURECER A TELA — de propósito. Este drawer é para trabalhar
 * COM o conteúdo atrás dele visível (inspecionar um item da lista sem perder a
 * lista). Escurecer o fundo transformaria em modal, e modal é para quando o
 * contexto atrás NÃO importa. Se você precisa de dim, precisa de um diálogo.
 *
 * Duas regras de fechamento embutidas, para nenhuma tela precisar lembrar delas:
 *
 * 1) TROCAR DE PÁGINA FECHA. Mas navegar DENTRO da mesma página (só query
 *    params mudam) NÃO fecha — é o mesmo contexto. Por isso a comparação é de
 *    `pathname`, não da URL inteira.
 *
 * 2) ABRIR UM POPOVER DA TOPBAR FECHA (evento global 'ui:panel-open'). Dois
 *    painéis abertos ao mesmo tempo é sempre erro de coordenação, nunca intenção.
 */
export function RightDrawer({ open, onClose, width = LAYOUT.drawer.sm, children }) {
  useEffect(() => {
    if (!open) return;
    const close = () => onClose?.();
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('ui:panel-open', close);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('ui:panel-open', close); window.removeEventListener('keydown', onKey); };
  }, [open, onClose]);

  const { pathname } = useLocation();
  const openPathRef = useRef(pathname);
  useEffect(() => {
    if (!open) { openPathRef.current = pathname; return; } // fechado: rebaseia a âncora
    if (openPathRef.current !== pathname) onClose?.();      // aberto e mudou de página → fecha
  }, [open, pathname, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Captura de clique-fora, sem escurecer. Começa abaixo da topbar e
              fica sob a sidebar (z 45 < 50) para ela continuar clicável. */}
          <div onClick={onClose} className="fixed inset-x-0 bottom-0" style={{ top: LAYOUT.topbar, zIndex: Z.drawerCatch }} />
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={MOTION.tween}
            style={{ top: LAYOUT.topbar, zIndex: Z.drawer, height: `calc(100% - ${LAYOUT.topbar})` }}
            className={cn('fixed right-0 flex max-w-[95vw] flex-col border-l border-border bg-background text-foreground', width)}
          >
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="absolute right-3 top-2 z-10 flex h-8 w-8 appearance-none items-center justify-center rounded-full border border-border bg-muted/40 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="thin-scroll h-full overflow-y-auto pt-3">{children}</div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

export default RightDrawer;
