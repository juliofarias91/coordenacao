import { ThemeContext, useDarkObserver } from '../lib/theme-context';

// Envolva a app com isto se algum componente precisar saber o tema em JS
// (canvas, WebGL, SVG gerado, glassTokens). Quem só usa classes Tailwind
// (dark:*) não precisa do provider — a classe .dark no <html> já basta.
export function ThemeProvider({ children }) {
  const dark = useDarkObserver();
  return <ThemeContext.Provider value={dark}>{children}</ThemeContext.Provider>;
}

export default ThemeProvider;
