// Rótulo «PULSO ORBITAL»: letras de bloque estilo plantilla industrial, dibujadas con rectángulos y un polígono.
// Cada letra ocupa una caja de 50 × 70 unidades con trazo de 16; los cortes de 3 unidades entre piezas dan el
// aire de estarcido. No depende de ninguna tipografía externa (el juego funciona sin conexión y sin descargas).
const R = (x, y, w, h) => ['r', x, y, w, h];

const GLYPHS = {
  P: [R(0, 0, 16, 70), R(19, 0, 31, 16), R(34, 0, 16, 44), R(19, 28, 31, 16)],
  U: [R(0, 0, 16, 70), R(34, 0, 16, 70), R(19, 54, 15, 16)],
  L: [R(0, 0, 16, 70), R(19, 54, 31, 16)],
  S: [R(0, 0, 50, 16), R(0, 19, 16, 22), R(0, 27, 50, 16), R(34, 43, 16, 27), R(0, 54, 50, 16)],
  O: [R(0, 0, 50, 16), R(0, 19, 16, 32), R(34, 19, 16, 32), R(0, 54, 50, 16)],
  R: [R(0, 0, 16, 70), R(19, 0, 31, 16), R(34, 0, 16, 44), R(19, 28, 31, 16), ['p', [24, 47], [38, 47], [50, 70], [35, 70]]],
  B: [R(0, 0, 16, 70), R(19, 0, 31, 16), R(34, 19, 16, 11), R(19, 27, 31, 16), R(34, 40, 16, 30), R(19, 54, 31, 16)],
  I: [R(0, 0, 50, 16), R(17, 19, 16, 32), R(0, 54, 50, 16)],
  T: [R(0, 0, 50, 16), R(17, 19, 16, 51)],
  A: [R(0, 0, 50, 16), R(0, 19, 16, 51), R(34, 19, 16, 51), R(19, 38, 12, 14)],
};

export const GLYPH_BOX = Object.freeze({ width: 50, height: 70, gap: 10 });
export const WORDMARK_LETTERS = Object.freeze(Object.keys(GLYPHS));

const fmt = n => String(Math.round(n * 100) / 100);

// Contorno SVG de una palabra: devuelve `d` y las dimensiones resultantes.
export function wordPath(word, { scale = 1, x = 0, y = 0 } = {}) {
  const { width, gap } = GLYPH_BOX;
  let cursor = 0;
  const parts = [];
  for (const letter of word) {
    const shapes = GLYPHS[letter];
    if (!shapes) throw new Error(`Letra sin diseño: ${letter}`);
    for (const shape of shapes) {
      if (shape[0] === 'r') {
        const [, rx, ry, rw, rh] = shape;
        parts.push(`M${fmt(x + (cursor + rx) * scale)} ${fmt(y + ry * scale)}h${fmt(rw * scale)}v${fmt(rh * scale)}h${fmt(-rw * scale)}z`);
      } else {
        const points = shape.slice(1).map(([px, py]) => `${fmt(x + (cursor + px) * scale)} ${fmt(y + py * scale)}`);
        parts.push(`M${points.join('L')}z`);
      }
    }
    cursor += width + gap;
  }
  const letters = [...word].length;
  return { d: parts.join(''), width: (letters * width + (letters - 1) * gap) * scale, height: GLYPH_BOX.height * scale };
}

// Rótulo completo: PULSO grande sobre ORBITAL, con una copia desplazada que imita el desajuste de la impresión.
export function wordmarkSvg({ className = 'wordmark' } = {}) {
  const margin = 7;
  const offset = 5;
  const sub = wordPath('ORBITAL', { scale: 1 });
  const mainScale = sub.width / wordPath('PULSO').width;
  const main = wordPath('PULSO', { scale: mainScale });
  const width = Math.round(sub.width + margin * 2 + offset);
  const gapBetween = 16;
  const mainY = margin;
  const subY = mainY + main.height + gapBetween;
  const height = Math.round(subY + sub.height + margin + offset);
  const top = wordPath('PULSO', { scale: mainScale, x: margin, y: mainY });
  const bottom = wordPath('ORBITAL', { scale: 1, x: margin, y: subY });
  const topShadow = wordPath('PULSO', { scale: mainScale, x: margin + offset, y: mainY + offset });
  const bottomShadow = wordPath('ORBITAL', { scale: 1, x: margin + offset, y: subY + offset });
  return `<svg class="${className}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Pulso Orbital" focusable="false">` +
    `<path class="wm-shadow" d="${topShadow.d}"/><path class="wm-shadow wm-shadow--sub" d="${bottomShadow.d}"/>` +
    `<path class="wm-main" d="${top.d}"/><path class="wm-sub" d="${bottom.d}"/></svg>`;
}
