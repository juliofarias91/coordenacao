/** @type {import('tailwindcss').Config} */
// Config portável. Só mapeia os tokens HSL de tokens.css para classes utilitárias
// (bg-card, text-muted-foreground, border-border…).
//
// ⚠️ `preflight` — no projeto de origem está DESLIGADO para não resetar telas
// legadas com estilo inline. Em projeto NOVO, DEIXE LIGADO (apague o bloco
// corePlugins abaixo) e apague também o "RESET MANUAL" do tokens.css.
// Manter o preflight desligado sem precisar custa caro: <button> herda fonte e
// fundo do user-agent, e você acaba escrevendo `style={{ fontFamily:'inherit' }}`
// e `appearance-none border-0 bg-transparent` em todo botão do sistema.
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],

  // corePlugins: { preflight: false },   // <- só se houver legado inline a preservar

  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        'sidebar-border': 'hsl(var(--sidebar-border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        popover: { DEFAULT: 'hsl(var(--popover))', foreground: 'hsl(var(--popover-foreground))' },
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': { from: { height: '0' }, to: { height: 'var(--radix-accordion-content-height)' } },
        'accordion-up': { from: { height: 'var(--radix-accordion-content-height)' }, to: { height: '0' } },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [],
};
