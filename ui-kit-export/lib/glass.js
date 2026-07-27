// ============================================================================
// LIQUID GLASS — a superfície do chrome que flutua SOBRE conteúdo arbitrário
// (mapa, vídeo, canvas 3D, foto). Espelha as classes .ui-glass do tokens.css;
// esta versão em JS existe para quem precisa de style={{}} (viewers que calculam
// o tema por conta própria, portais, canvas overlays).
//
// Fonte ÚNICA — a regra que vale mais que os valores: quando cada viewer tem a
// sua receita de vidro, o produto ganha três vidros visivelmente diferentes e
// ninguém percebe até ver duas telas lado a lado.
//
// Passe o booleano `dark` (de useIsDark() ou do que o viewer já calcula) — o
// helper não impõe COMO detectar o tema.
// ============================================================================

export function glassTokens(dark) {
  return {
    bg: dark ? 'rgba(15,15,18,0.68)' : 'rgba(250,250,252,0.55)',
    border: dark ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.7)',
    text: dark ? '#ffffff' : '#1a1a2e',
    // Item/ferramenta ATIVO dentro de uma toolbar glass: CINZA translúcido,
    // nunca a cor de accent. Sobre imagem arbitrária o accent some ou briga com
    // a foto; o cinza translúcido lê em qualquer fundo.
    active: dark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.08)',
    blur: 'blur(14px)',
    shadow: dark ? '0 8px 28px rgba(0,0,0,0.45)' : '0 8px 28px rgba(0,0,0,0.15)',
  };
}

// Container glass pronto para spread em style={{}}. Já traz o -webkit do Safari.
export function glassSurface(dark) {
  const g = glassTokens(dark);
  return {
    background: g.bg,
    border: `1px solid ${g.border}`,
    backdropFilter: g.blur,
    WebkitBackdropFilter: g.blur,
    boxShadow: g.shadow,
    color: g.text,
  };
}

// Traço fino legível sobre QUALQUER fundo (planta clara, planta escura, foto
// aérea): duas linhas idênticas, a de baixo mais grossa e preta translúcida.
// Use isto em vez de caçar uma cor "que dê pra ver nas duas".
export const HALO = { stroke: '#000', opacity: 0.5 };   // linha de baixo, +2px de largura
export const CORE = { stroke: '#fff', opacity: 1 };     // linha de cima
