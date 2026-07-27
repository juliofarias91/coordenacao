import { createContext, useContext, useEffect, useState } from 'react';

// Contexto do tema. Separado do Provider (que é JSX) por causa do Fast Refresh:
// um módulo que exporta componente E hook/constante perde o hot reload.
export const ThemeContext = createContext(false);

// true quando o tema escuro está ativo.
export function useIsDark() {
  return useContext(ThemeContext);
}

// A verdade é a classe `.dark` no <html> (escrita por lib/theme.js). Este hook
// só OBSERVA e re-renderiza.
//
// Por que observar em vez de guardar estado próprio: o tema muda por caminhos
// que o React não controla — boot antes do mount, media query do SO, outra aba.
// Um useState paralelo dessincroniza; o MutationObserver nunca.
export function useDarkObserver() {
  const [dark, setDark] = useState(() =>
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark'));

  useEffect(() => {
    const el = document.documentElement;
    const sync = () => setDark(el.classList.contains('dark'));
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(el, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  return dark;
}
