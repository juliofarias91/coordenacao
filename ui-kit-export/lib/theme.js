// ============================================================================
// TEMA — claro / escuro / automático + ACCENT dinâmico.
//
// Duas preferências, duas chaves:
//   ui_theme_mode : o que o usuário ESCOLHEU     ('light' | 'dark' | 'system')
//   ui_theme      : o que foi RESOLVIDO agora    ('light' | 'dark')
//   ui_accent     : cor primária escolhida       ('#RRGGBB')
//
// Guardar as duas coisas separadas é o que permite "automático" existir: sem
// `mode`, ao seguir o sistema você perde a informação de que o usuário pediu
// para seguir o sistema, e na próxima visita ele fica preso no valor resolvido.
//
// A fonte da verdade em runtime é a classe `.dark` no <html>. Chame initTheme()
// uma vez no boot (main.jsx), antes de renderizar.
// ============================================================================

const MODE_KEY = 'ui_theme_mode';
const THEME_KEY = 'ui_theme';
const ACCENT_KEY = 'ui_accent';

export const DEFAULT_ACCENT = '#3b82f6';

// Paleta de accents oferecida ao usuário (tela de configurações).
export const ACCENT_PRESETS = [
  '#3b82f6', '#6366f1', '#0ea5e9', '#ec4899', '#a855f7',
  '#2563eb', '#f97316', '#14b8a6', '#a8a29e', '#10b981',
];

// #RRGGBB -> "H S% L%", o formato que as variáveis CSS esperam.
function hexToHsl(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return null;
  const r = parseInt(m[1], 16) / 255, g = parseInt(m[2], 16) / 255, b = parseInt(m[3], 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0; const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

export function getAccent() { return localStorage.getItem(ACCENT_KEY) || DEFAULT_ACCENT; }

export function setAccent(hex) { localStorage.setItem(ACCENT_KEY, hex); applyAccent(hex); }

function applyAccent(hex) {
  const hsl = hexToHsl(hex || DEFAULT_ACCENT);
  // Sobrescreve --primary no <html> em runtime: tudo que usa bg-primary /
  // text-primary / ring-ring segue junto, sem recompilar CSS.
  if (hsl) document.documentElement.style.setProperty('--primary', hsl);
  // Componentes que pintam FORA do CSS (canvas, WebGL, SVG gerado em JS) não
  // enxergam a variável mudar. Este evento é o gancho deles.
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('ui:accent'));
}

export function getThemeMode() {
  const m = localStorage.getItem(MODE_KEY);
  if (m === 'light' || m === 'dark' || m === 'system') return m;
  return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
}

export function systemPrefersDark() {
  return typeof window !== 'undefined' && !!window.matchMedia
    && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function resolveDark(mode = getThemeMode()) {
  return mode === 'system' ? systemPrefersDark() : mode === 'dark';
}

export function applyResolvedTheme(dark) {
  localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light');
  document.documentElement.classList.toggle('dark', dark);
}

export function setThemeMode(mode) {
  localStorage.setItem(MODE_KEY, mode);
  applyResolvedTheme(resolveDark(mode));
}

// Chame no boot. Aplica tema + accent e passa a ouvir o SO quando o modo é 'system'.
export function initTheme() {
  applyResolvedTheme(resolveDark());
  applyAccent(getAccent());
  if (typeof window !== 'undefined' && window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => { if (getThemeMode() === 'system') applyResolvedTheme(systemPrefersDark()); };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }
}
