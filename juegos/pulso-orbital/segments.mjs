// Marcador de siete segmentos y modelo de integridad del núcleo. Funciones puras: devuelven texto SVG/datos y no
// tocan el DOM, así que se prueban en Node.

// Geometría de un dígito en una caja de 10 × 18 unidades.
const SEGMENTS = {
  a: '1.3,1 2.3,0 7.7,0 8.7,1 7.7,2 2.3,2',
  b: '9,1.3 10,2.3 10,7.7 9,8.7 8,7.7 8,2.3',
  c: '9,9.3 10,10.3 10,15.7 9,16.7 8,15.7 8,10.3',
  d: '1.3,17 2.3,16 7.7,16 8.7,17 7.7,18 2.3,18',
  e: '1,9.3 2,10.3 2,15.7 1,16.7 0,15.7 0,10.3',
  f: '1,1.3 2,2.3 2,7.7 1,8.7 0,7.7 0,2.3',
  g: '1.3,9 2.3,8 7.7,8 8.7,9 7.7,10 2.3,10',
};

export const SEGMENT_MAP = Object.freeze({
  0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg',
  '-': 'g', ' ': '',
});

const PITCH = 13;
const HEIGHT = 18;

const clampInt = (value, min, max) => Math.max(min, Math.min(max, Math.floor(Number.isFinite(value) ? value : min)));

// Texto del marcador: entero no negativo, con ceros a la izquierda hasta `digits` cifras.
export function formatDisplay(value, digits = 6) {
  const n = clampInt(value, 0, 10 ** 15 - 1);
  return String(n).padStart(clampInt(digits, 1, 15), '0');
}

// SVG de un marcador: segmentos encendidos y apagados («fantasma»), con ligera inclinación como los marcadores reales.
export function sevenSegmentSvg(text, { className = 'seg', label = '' } = {}) {
  const chars = [...String(text)].map(ch => (ch in SEGMENT_MAP ? ch : ' '));
  const width = chars.length * PITCH - (PITCH - 10);
  const body = chars.map((ch, index) => {
    const lit = SEGMENT_MAP[ch];
    const polygons = Object.entries(SEGMENTS)
      .map(([id, points]) => `<polygon class="${lit.includes(id) ? 'on' : 'off'}" points="${points}"/>`)
      .join('');
    return `<g transform="translate(${index * PITCH} 0)">${polygons}</g>`;
  }).join('');
  const aria = label ? `role="img" aria-label="${label.replace(/[^\p{L}\p{N} .,:%×+-]/gu, '')}"` : 'aria-hidden="true"';
  return `<svg class="${className}" viewBox="-2 0 ${width + 4} ${HEIGHT}" ${aria} focusable="false"><g transform="skewX(-6)">${body}</g></svg>`;
}

// Integridad del núcleo: celdas sueltas hasta `cap`; con más vida se muestra una barra segmentada.
export function integrityModel(hp, maxHp, cap = 12) {
  const max = clampInt(maxHp, 1, 1_000_000_000);
  const current = clampInt(hp, 0, max);
  const low = current <= 2 || current / max <= .34;
  if (max <= cap) return { mode: 'cells', cells: Array.from({ length: max }, (_, index) => index < current), hp: current, max, low };
  return { mode: 'bar', ratio: current / max, hp: current, max, low };
}
