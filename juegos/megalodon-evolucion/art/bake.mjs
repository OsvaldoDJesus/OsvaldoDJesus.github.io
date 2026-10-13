// Peces realistas: cada especie se "hornea" una vez como textura iluminada píxel a píxel
// (volumen por sección elíptica, relieve de escamas/dentículos, sol desde arriba, brillo especular,
// luz de borde del agua, aletas translúcidas con radios) y en el juego se deforma en tiras a lo
// largo de una columna ondulante. Coordenadas de textura: x = 0 en la cola, x = W en el hocico.
import { noiseFields, sample, TS, canvas2, baker } from './texture.mjs';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

export function profile(control, t) {
  if (t <= control[0][0]) return control[0][1];
  for (let i = 1; i < control.length; i++) {
    if (t <= control[i][0]) {
      const [t0, v0] = control[i - 1], [t1, v1] = control[i];
      return lerp(v0, v1, sstep(0, 1, (t - t0) / (t1 - t0 || 1)));
    }
  }
  return control[control.length - 1][1];
}

// ---------- especies ----------
const SHARK_PROF = [[0, 0.016], [0.04, 0.045], [0.1, 0.08], [0.22, 0.108], [0.36, 0.115], [0.52, 0.095], [0.72, 0.05], [0.9, 0.025], [1, 0.02]];
export const SPECS = {
  // ----- jugador -----
  alevin: { skin: 'smooth', gloss: 0.5, translucent: 0.45, prof: [[0, 0.06], [0.12, 0.16], [0.3, 0.17], [0.65, 0.09], [1, 0.035]], col: { back: '#8fa9b6', mid: '#cfe2ea', belly: '#f2f8fa', fin: '#bcd8e6', eye: '#1d2a33' }, eye: 0.075, eyeT: 0.13, dorsal: [{ t0: 0.4, t1: 0.75, h: 0.07 }], anal: { t0: 0.55, t1: 0.8, h: 0.05 }, pect: { t: 0.25, s: 0.13 }, tail: { type: 'round', s: 0.22 }, gut: true },
  damisela: { skin: 'scales', gloss: 0.7, prof: [[0, 0.05], [0.12, 0.17], [0.35, 0.21], [0.7, 0.12], [1, 0.04]], col: { back: '#1747a8', mid: '#2a7de0', belly: '#8cc8f5', fin: '#2f8ff0', eye: '#0b1630' }, eye: 0.055, dorsal: [{ t0: 0.2, t1: 0.82, h: 0.1, tip: 0.5 }], anal: { t0: 0.5, t1: 0.82, h: 0.09 }, pect: { t: 0.27, s: 0.14 }, tail: { type: 'fork', s: 0.24 }, pattern: { type: 'stripes', ts: [0.86], w: 0.08, color: '#ffc928' }, iridescent: 0.25 },
  angel: { skin: 'scales', gloss: 0.6, prof: [[0, 0.05], [0.1, 0.2], [0.3, 0.32], [0.55, 0.3], [0.8, 0.14], [1, 0.05]], col: { back: '#f2c21b', mid: '#ffdf6a', belly: '#fff2bf', fin: '#2563c9', eye: '#111' }, eye: 0.05, dorsal: [{ t0: 0.2, t1: 0.85, h: 0.28, tip: 0.75, concave: 0.2 }], anal: { t0: 0.35, t1: 0.85, h: 0.26, tip: 0.75 }, pect: { t: 0.28, s: 0.12 }, tail: { type: 'round', s: 0.2 }, pattern: { type: 'stripes', ts: [0.2, 0.48, 0.72], w: 0.07, color: '#162650' } },
  perca: { skin: 'scales', gloss: 0.45, prof: [[0, 0.04], [0.12, 0.13], [0.35, 0.17], [0.65, 0.11], [1, 0.035]], col: { back: '#3f5a22', mid: '#93a840', belly: '#ece0a6', fin: '#d96b26', eye: '#2b1a05' }, eye: 0.05, dorsal: [{ t0: 0.25, t1: 0.5, h: 0.12, spiny: true }, { t0: 0.55, t1: 0.72, h: 0.08 }], anal: { t0: 0.62, t1: 0.78, h: 0.07 }, pelvic: { t: 0.35, s: 0.07 }, pect: { t: 0.27, s: 0.12 }, tail: { type: 'fork', s: 0.22 }, pattern: { type: 'bands', ts: [0.3, 0.45, 0.6, 0.75], w: 0.06, color: '#1d2c0c' } },
  pirana: { skin: 'scales', gloss: 0.75, prof: [[0, 0.06], [0.1, 0.2], [0.3, 0.25], [0.6, 0.16], [1, 0.04]], top: 0.85, bot: 1.15, col: { back: '#4d5965', mid: '#97a4ae', belly: '#d9381f', fin: '#353e48', eye: '#ff3b1f' }, eye: 0.045, dorsal: [{ t0: 0.45, t1: 0.65, h: 0.1 }], anal: { t0: 0.55, t1: 0.85, h: 0.09 }, pect: { t: 0.28, s: 0.1 }, tail: { type: 'fork', s: 0.22 }, teeth: 1.6, jaw: 0.6, showTeeth: true, pattern: { type: 'spots', size: 0.16, color: '#c8d3dc', region: 'upper' }, iridescent: 0.2 },
  lucio: { skin: 'scales', gloss: 0.55, prof: [[0, 0.02], [0.08, 0.045], [0.2, 0.08], [0.5, 0.09], [0.8, 0.07], [1, 0.03]], col: { back: '#2a4224', mid: '#678534', belly: '#e6dfb0', fin: '#6f5d25', eye: '#d9b23a' }, eye: 0.03, eyeT: 0.1, dorsal: [{ t0: 0.68, t1: 0.82, h: 0.09 }], anal: { t0: 0.68, t1: 0.82, h: 0.08 }, pelvic: { t: 0.5, s: 0.06 }, pect: { t: 0.24, s: 0.09 }, tail: { type: 'fork', s: 0.2 }, teeth: 1.4, jaw: 0.55, mouthT: 0.18, pattern: { type: 'spots', size: 0.22, color: '#e5e0a0', region: 'all', bean: true } },
  atun: { skin: 'smooth', gloss: 1.1, prof: [[0, 0.03], [0.1, 0.1], [0.35, 0.15], [0.65, 0.1], [0.88, 0.03], [1, 0.02]], col: { back: '#0f2147', mid: '#3a6aab', belly: '#e9eff5', fin: '#f2c628', eye: '#0b0b12' }, eye: 0.035, dorsal: [{ t0: 0.3, t1: 0.45, h: 0.1 }, { t0: 0.55, t1: 0.66, h: 0.12, tip: 0.3 }], anal: { t0: 0.57, t1: 0.67, h: 0.11, tip: 0.3 }, pect: { t: 0.28, s: 0.2 }, tail: { type: 'lunate', s: 0.3 }, finlets: '#f2c628', stiff: true, wave: 0.7, iridescent: 0.35, sharpBelly: 0.15 },
  barracuda: { skin: 'scales', gloss: 0.9, prof: [[0, 0.02], [0.08, 0.045], [0.25, 0.07], [0.6, 0.065], [0.88, 0.03], [1, 0.02]], col: { back: '#2f4756', mid: '#9ab1bc', belly: '#f1f5f7', fin: '#4d6878', eye: '#e8c547' }, eye: 0.025, eyeT: 0.12, dorsal: [{ t0: 0.32, t1: 0.42, h: 0.08 }, { t0: 0.66, t1: 0.74, h: 0.06 }], anal: { t0: 0.66, t1: 0.74, h: 0.05 }, pect: { t: 0.24, s: 0.08 }, tail: { type: 'fork', s: 0.2 }, teeth: 2.2, jaw: 0.6, mouthT: 0.17, showTeeth: true, pattern: { type: 'bands', ts: [0.3, 0.42, 0.54, 0.66, 0.78], w: 0.03, color: '#24394a' } },
  martillo: { snoutFlat: 0.25, skin: 'denticles', gloss: 0.35, prof: SHARK_PROF, col: { back: '#5f717e', mid: '#8fa1ad', belly: '#f0f2f3', fin: '#55656f', eye: '#111' }, eye: 0.018, eyeT: 0.04, dorsal: [{ t0: 0.3, t1: 0.46, h: 0.2, tip: 0.35, concave: 0.5 }, { t0: 0.72, t1: 0.77, h: 0.04 }], anal: { t0: 0.7, t1: 0.75, h: 0.035 }, pelvic: { t: 0.55, s: 0.06 }, pect: { t: 0.24, s: 0.2 }, tail: { type: 'shark', s: 0.3 }, gills: 5, teeth: 1.2, jaw: 0.5, mouthT: 0.14, shark: true, hammer: true, stiff: true, sharpBelly: 0.08 },
  tigre: { snoutFlat: 0.3, skin: 'denticles', gloss: 0.35, prof: SHARK_PROF, col: { back: '#55634c', mid: '#929a7a', belly: '#edece0', fin: '#46523f', eye: '#0d0d0d' }, eye: 0.018, dorsal: [{ t0: 0.32, t1: 0.47, h: 0.17, tip: 0.35, concave: 0.5 }, { t0: 0.72, t1: 0.77, h: 0.04 }], anal: { t0: 0.7, t1: 0.75, h: 0.035 }, pelvic: { t: 0.55, s: 0.06 }, pect: { t: 0.24, s: 0.2 }, tail: { type: 'shark', s: 0.32 }, gills: 5, teeth: 1.6, jaw: 0.55, mouthT: 0.15, shark: true, stiff: true, sharpBelly: 0.08, pattern: { type: 'tiger', color: '#28311f' } },
  blanco: { skin: 'denticles', gloss: 0.4, prof: [[0, 0.016], [0.04, 0.05], [0.1, 0.09], [0.22, 0.125], [0.37, 0.135], [0.6, 0.1], [0.8, 0.05], [0.92, 0.031], [1, 0.027]], snoutFlat: 0.3, col: { back: '#46535e', mid: '#76858f', belly: '#f8f8f6', fin: '#3e4952', eye: '#050505' }, eye: 0.016, dorsal: [{ t0: 0.32, t1: 0.47, h: 0.19, tip: 0.3, concave: 0.55 }, { t0: 0.73, t1: 0.77, h: 0.035 }], anal: { t0: 0.72, t1: 0.76, h: 0.03 }, pelvic: { t: 0.56, s: 0.06 }, pect: { t: 0.25, s: 0.22 }, tail: { type: 'lunate', s: 0.33 }, gills: 5, teeth: 2.0, jaw: 0.6, mouthT: 0.15, shark: true, stiff: true, sharpBelly: 0.1, scars: 3, showTeeth: true },
  megalodon: { skin: 'denticles', gloss: 0.45, prof: [[0, 0.018], [0.04, 0.055], [0.1, 0.1], [0.22, 0.14], [0.38, 0.155], [0.6, 0.115], [0.8, 0.055], [0.92, 0.034], [1, 0.03]], snoutFlat: 0.3, col: { back: '#353e47', mid: '#636e78', belly: '#efefea', fin: '#2e353d', eye: '#020202' }, eye: 0.014, dorsal: [{ t0: 0.3, t1: 0.47, h: 0.2, tip: 0.3, concave: 0.55 }, { t0: 0.73, t1: 0.77, h: 0.035 }], anal: { t0: 0.72, t1: 0.76, h: 0.03 }, pelvic: { t: 0.56, s: 0.07 }, pect: { t: 0.25, s: 0.24 }, tail: { type: 'lunate', s: 0.34 }, gills: 5, teeth: 2.6, jaw: 0.7, mouthT: 0.16, shark: true, stiff: true, sharpBelly: 0.1, scars: 7, showTeeth: true },
  // ----- presas -----
  reef: { skin: 'scales', gloss: 0.7, prof: [[0, 0.05], [0.12, 0.17], [0.35, 0.2], [0.7, 0.11], [1, 0.04]], col: { back: '#e8650f', mid: '#ff9440', belly: '#ffd9b5', fin: '#ff8a2a', eye: '#111' }, eye: 0.06, dorsal: [{ t0: 0.25, t1: 0.8, h: 0.08 }], anal: { t0: 0.55, t1: 0.8, h: 0.07 }, pect: { t: 0.27, s: 0.12 }, tail: { type: 'round', s: 0.22 }, pattern: { type: 'stripes', ts: [0.22, 0.5, 0.8], w: 0.06, color: '#ffffff', outline: '#1a1a1a' } },
  tadpole: { skin: 'smooth', gloss: 0.6, prof: [[0, 0.12], [0.15, 0.22], [0.35, 0.16], [0.6, 0.05], [1, 0.01]], col: { back: '#2a251a', mid: '#463e2c', belly: '#857a5e', fin: '#544c3a', eye: '#c9c08a' }, eye: 0.07, eyeT: 0.14, tail: { type: 'tadpole', s: 0.45 }, wave: 1.8, waves: 1.4 },
  carp: { skin: 'scales', gloss: 0.8, prof: [[0, 0.05], [0.12, 0.15], [0.35, 0.19], [0.7, 0.11], [1, 0.04]], col: { back: '#8a5c14', mid: '#d0952e', belly: '#f4dea0', fin: '#bf7a24', eye: '#3a2408' }, eye: 0.04, dorsal: [{ t0: 0.3, t1: 0.7, h: 0.08 }], anal: { t0: 0.65, t1: 0.78, h: 0.07 }, pelvic: { t: 0.45, s: 0.07 }, pect: { t: 0.27, s: 0.11 }, tail: { type: 'fork', s: 0.22 }, barbels: true, bigScales: true },
  sardine: { skin: 'scales', gloss: 1.2, prof: [[0, 0.03], [0.12, 0.1], [0.4, 0.11], [0.75, 0.06], [1, 0.03]], col: { back: '#1a4562', mid: '#98bfd3', belly: '#f4fbff', fin: '#98bfd3', eye: '#111' }, eye: 0.05, dorsal: [{ t0: 0.42, t1: 0.55, h: 0.07 }], pect: { t: 0.25, s: 0.1 }, tail: { type: 'fork', s: 0.22 }, pattern: { type: 'dots', color: '#173548' }, iridescent: 0.4 },
  mackerel: { skin: 'smooth', gloss: 1.1, prof: [[0, 0.03], [0.12, 0.1], [0.4, 0.12], [0.8, 0.05], [1, 0.03]], col: { back: '#165e55', mid: '#7ab4ab', belly: '#f2f7f4', fin: '#447f78', eye: '#111' }, eye: 0.04, dorsal: [{ t0: 0.28, t1: 0.4, h: 0.08 }, { t0: 0.55, t1: 0.65, h: 0.06 }], anal: { t0: 0.58, t1: 0.66, h: 0.05 }, pect: { t: 0.25, s: 0.1 }, tail: { type: 'fork', s: 0.24 }, pattern: { type: 'wavy', color: '#0b302a' }, iridescent: 0.35 },
  lantern: { skin: 'scales', gloss: 0.9, prof: [[0, 0.06], [0.12, 0.15], [0.4, 0.15], [0.75, 0.07], [1, 0.03]], col: { back: '#10141c', mid: '#262c38', belly: '#394150', fin: '#1a2029', eye: '#9fe7ff' }, eye: 0.08, eyeT: 0.13, dorsal: [{ t0: 0.4, t1: 0.55, h: 0.07 }], pect: { t: 0.26, s: 0.1 }, tail: { type: 'fork', s: 0.22 }, glow: '#59e3ff', photophores: 9 },
  viper: { skin: 'smooth', gloss: 0.9, prof: [[0, 0.04], [0.1, 0.09], [0.3, 0.08], [0.7, 0.05], [1, 0.015]], col: { back: '#0b1215', mid: '#1c2930', belly: '#2b3a42', fin: '#142028', eye: '#bfffd8' }, eye: 0.05, dorsal: [{ t0: 0.2, t1: 0.26, h: 0.06 }], tail: { type: 'fork', s: 0.18 }, teeth: 3.4, jaw: 0.7, mouth: 0.4, glow: '#78ffb8', photophores: 12, lure: { t: 0.22, len: 0.35, color: '#9dffcf' }, wave: 1.4 },
  prehistoric: { skin: 'armor', gloss: 0.6, prof: [[0, 0.05], [0.14, 0.15], [0.4, 0.15], [0.8, 0.06], [1, 0.03]], col: { back: '#55452a', mid: '#94784a', belly: '#ddcb9b', fin: '#664f2c', eye: '#e2b13c' }, eye: 0.035, dorsal: [{ t0: 0.4, t1: 0.6, h: 0.07 }], anal: { t0: 0.6, t1: 0.75, h: 0.06 }, pect: { t: 0.27, s: 0.12 }, tail: { type: 'shark', s: 0.26 }, armor: { t1: 0.28, color: '#3a2d1a' } },
  // ----- depredadores / grandes -----
  morena: { skin: 'slimy', gloss: 1.0, prof: [[0, 0.03], [0.06, 0.05], [0.15, 0.055], [0.7, 0.045], [1, 0.006]], col: { back: '#2a4318', mid: '#56732a', belly: '#a3b366', fin: '#476322', eye: '#ffe066' }, eye: 0.018, eyeT: 0.06, dorsal: [{ t0: 0.12, t1: 0.98, h: 0.03, tip: 0.3 }], anal: { t0: 0.5, t1: 0.98, h: 0.025 }, tail: { type: 'eel', s: 0.02 }, teeth: 1.6, jaw: 0.75, mouthT: 0.08, wave: 2.2, waves: 1.6, pattern: { type: 'spots', size: 0.3, color: '#d1db68', region: 'all', reticulate: true } },
  orca: { skin: 'smooth', gloss: 0.9, prof: [[0, 0.04], [0.06, 0.09], [0.2, 0.13], [0.4, 0.14], [0.65, 0.09], [0.88, 0.035], [1, 0.03]], col: { back: '#0b0d10', mid: '#13161a', belly: '#f2f4f5', fin: '#090b0e', eye: '#000' }, eye: 0.014, eyeT: 0.12, dorsal: [{ t0: 0.38, t1: 0.52, h: 0.24, tip: 0.35, concave: 0.3 }], pect: { t: 0.26, s: 0.17, paddle: true }, tail: { type: 'fluke', s: 0.26 }, pattern: { type: 'orca' }, teeth: 1.2, jaw: 0.55, mouthT: 0.12, stiff: true, mammal: true },
  dunkleosteus: { skin: 'armor', gloss: 0.7, prof: [[0, 0.06], [0.08, 0.13], [0.25, 0.16], [0.55, 0.12], [0.85, 0.05], [1, 0.03]], col: { back: '#343929', mid: '#64664e', belly: '#c4bf9c', fin: '#44473a', eye: '#ffdd55' }, eye: 0.022, eyeT: 0.12, dorsal: [{ t0: 0.45, t1: 0.6, h: 0.1 }], anal: { t0: 0.65, t1: 0.75, h: 0.06 }, pect: { t: 0.3, s: 0.15 }, tail: { type: 'shark', s: 0.28 }, armor: { t1: 0.3, color: '#26271e', blades: true }, jaw: 0.7, stiff: true },
  livyatan: { skin: 'smooth', gloss: 0.55, prof: [[0, 0.1], [0.05, 0.14], [0.22, 0.15], [0.45, 0.14], [0.7, 0.08], [0.9, 0.03], [1, 0.025]], col: { back: '#2a2f33', mid: '#454c51', belly: '#959ca0', fin: '#25292c', eye: '#e8d07a' }, eye: 0.009, eyeT: 0.2, dorsal: [{ t0: 0.6, t1: 0.68, h: 0.03 }], pect: { t: 0.32, s: 0.11, paddle: true }, tail: { type: 'fluke', s: 0.24 }, teeth: 2.8, jaw: 0.5, mouthT: 0.3, blunt: true, scars: 14, wrinkles: true, stiff: true, mammal: true, showTeeth: true },
  ballena: { skin: 'smooth', gloss: 0.7, prof: [[0, 0.05], [0.1, 0.11], [0.3, 0.14], [0.55, 0.11], [0.8, 0.04], [1, 0.03]], col: { back: '#304961', mid: '#58738d', belly: '#c6d3df', fin: '#2a3f52', eye: '#111' }, eye: 0.011, eyeT: 0.16, dorsal: [{ t0: 0.66, t1: 0.71, h: 0.04 }], pect: { t: 0.3, s: 0.24, paddle: true }, tail: { type: 'fluke', s: 0.26 }, pattern: { type: 'grooves', color: '#94a8bb' }, stiff: true, mammal: true },
  pejesapo: { skin: 'slimy', gloss: 0.8, prof: [[0, 0.12], [0.1, 0.27], [0.35, 0.3], [0.65, 0.18], [1, 0.05]], col: { back: '#17120f', mid: '#2a221c', belly: '#3b3029', fin: '#211a15', eye: '#cfe9ff' }, eye: 0.03, eyeT: 0.2, dorsal: [{ t0: 0.55, t1: 0.75, h: 0.08 }], anal: { t0: 0.6, t1: 0.78, h: 0.07 }, pect: { t: 0.35, s: 0.12 }, tail: { type: 'round', s: 0.15 }, teeth: 3.0, jaw: 0.8, mouth: 0.25, mouthT: 0.3, lure: { t: 0.1, len: 0.45, color: '#bfffff' }, glow: '#7ff3ff', pattern: { type: 'spots', size: 0.25, color: '#3a302a', region: 'all' } },
  // Cuerpo del cocodrilo (patas y mandíbula se añaden aparte).
  croc: { skin: 'osteoderm', gloss: 0.35, prof: [[0, 0.012], [0.07, 0.028], [0.18, 0.04], [0.24, 0.065], [0.45, 0.08], [0.6, 0.055], [0.8, 0.03], [1, 0.006]], top: 0.9, col: { back: '#36421f', mid: '#59652f', belly: '#d2cb92', fin: '#36421f', eye: '#d6c23a' }, tail: { type: 'eel', s: 0.01 }, wave: 0.7, waves: 0.8, eye: 0.016, eyeT: 0.19, eyeY: -0.95, pattern: { type: 'croc' }, crocTeeth: true, teeth: 1.3, jaw: 0.75, mouthT: 0.23 },
  crocKing: { skin: 'osteoderm', gloss: 0.3, prof: [[0, 0.012], [0.07, 0.028], [0.18, 0.04], [0.24, 0.065], [0.45, 0.08], [0.6, 0.055], [0.8, 0.03], [1, 0.006]], top: 0.9, col: { back: '#20261a', mid: '#3a4123', belly: '#b9ad74', fin: '#20261a', eye: '#ffb000' }, tail: { type: 'eel', s: 0.01 }, wave: 0.7, waves: 0.8, eye: 0.016, eyeT: 0.19, eyeY: -0.95, pattern: { type: 'croc' }, crocTeeth: true, scars: 9, teeth: 1.4, jaw: 0.75, mouthT: 0.23 },
  // Manto del calamar.
  squidMantle: { skin: 'slimy', gloss: 1.2, translucent: 0.25, prof: [[0, 0.01], [0.08, 0.06], [0.35, 0.11], [0.75, 0.1], [0.92, 0.08], [1, 0.07]], col: { back: '#c9563f', mid: '#e98b6c', belly: '#ffd2bd', fin: '#d66a4f', eye: '#111' }, pattern: { type: 'chromatophores', color: '#8a2a1a' }, noEye: true },
  squidGlow: { skin: 'slimy', gloss: 1.2, translucent: 0.3, prof: [[0, 0.01], [0.08, 0.06], [0.35, 0.11], [0.75, 0.1], [0.92, 0.08], [1, 0.07]], col: { back: '#28306e', mid: '#4a56a8', belly: '#9fb2ff', fin: '#39439a', eye: '#111' }, glow: '#7fe0ff', photophores: 14, noEye: true },
  squidColossal: { skin: 'slimy', gloss: 1.0, prof: [[0, 0.01], [0.08, 0.06], [0.35, 0.11], [0.75, 0.1], [0.92, 0.08], [1, 0.07]], col: { back: '#5e1520', mid: '#8a2b36', belly: '#c96a72', fin: '#6e1d28', eye: '#111' }, pattern: { type: 'chromatophores', color: '#3a0810' }, noEye: true },
};

export const STAGE_SPECS = ['alevin', 'damisela', 'angel', 'perca', 'pirana', 'lucio', 'atun', 'barracuda', 'martillo', 'tigre', 'blanco', 'megalodon'];
const GOLD = { back: '#7d5a0c', mid: '#d9a92c', belly: '#fff0b0', fin: '#c08a18', eye: '#2a1a00' };

// ---------- iluminación ----------
const L = (() => { const v = [-0.25, -0.78, 0.58]; const m = Math.hypot(...v); return v.map((c) => c / m); })();
const Hv = (() => { const v = [L[0], L[1], L[2] + 1]; const m = Math.hypot(...v); return v.map((c) => c / m); })();
const SUN = [1.0, 0.97, 0.88], AMB = [0.42, 0.62, 0.82], RIM = [70, 150, 205];

// Relieve fino según el tipo de piel (0..1). nx, ny en unidades de longitud del cuerpo.
function detailHeight(F, skin, x, y, W, bigScales) {
  const k = TS / W;
  const fineMul = Math.min(4, W / 256), fineAmp = Math.min(1, W / 1024); // evita grano a baja resolución
  switch (skin) {
    case 'scales': {
      const sc = W * (bigScales ? 0.034 : 0.022);
      if (sc < 2.2) return sample(F.fbm, x * k * 2, y * k * 2) * 0.2;
      const row = Math.floor(y / sc), sh = (row & 1) * 0.5;
      const fx = x / sc + sh, cx = fx - Math.floor(fx), cy = y / sc - row;
      const d = 1 - ((cx - 0.6) * (cx - 0.6) * 2.4 + (cy - 0.5) * (cy - 0.5) * 2.8);
      return clamp(d, 0, 1) * 0.85 + sample(F.fine, x * k * fineMul, y * k * fineMul) * 0.1 * fineAmp;
    }
    case 'denticles': return sample(F.fine, x * k * fineMul, y * k * fineMul) * 0.18 * fineAmp + sample(F.fbm, x * k * 1.2, y * k * 1.2) * 0.3;
    case 'osteoderm': {
      // Escudos rectangulares en filas alternadas, separados por surcos.
      const cw = W * 0.021, chh = W * 0.013;
      const col = Math.floor(x / cw), gy = y / chh + (col & 1) * 0.5;
      const fx = x / cw - col, fy = gy - Math.floor(gy);
      const edgeD = Math.min(fx, 1 - fx, fy, 1 - fy);
      return sstep(0, 0.22, edgeD) * 0.75 + sample(F.fine, x * k * fineMul, y * k * fineMul) * 0.12 * fineAmp;
    }
    case 'armor': return sample(F.fbm, x * k * 2, y * k * 2) * 0.5 + sample(F.fine, x * k * fineMul, y * k * fineMul) * 0.15 * fineAmp;
    case 'slimy': return sample(F.fbm, x * k * 3, y * k * 3) * 0.35;
    default: return sample(F.fbm, x * k * 1.2, y * k * 1.2) * 0.18;
  }
}

function albedoAt(spec, C, t, v, x, y, W, F) {
  const { back, mid, belly } = C;
  // Contrasombreado: lomo oscuro, vientre claro (en tiburones con borde más marcado).
  const a1 = sstep(-0.95, 0.15, v);
  const bl = spec.sharpBelly != null ? spec.sharpBelly : 0.3;
  const blotch = (sample(F.fbm, x * (TS / W) * 2.2, y * (TS / W) * 2.2) - 0.5) * (spec.sharpBelly != null ? 0.35 : 0.1);
  const a2 = sstep(bl - 0.12, bl + (spec.sharpBelly != null ? 0.06 : 0.35), v + blotch - (spec.sharpBelly != null ? sstep(0.45, 0.85, t) * 1.2 : 0));
  let c = mix3(mix3(back, mid, a1), belly, a2);
  const k = TS / W;
  // Moteado orgánico.
  const mot = (sample(F.fbm, x * k * 1.4, y * k * 1.4) - 0.5) * 0.3 + (sample(F.fbm, x * k * 5, y * k * 5) - 0.5) * 0.08;
  c = c.map((ch) => ch * (1 + mot));
  const pt = spec.pattern;
  if (pt) {
    const pc = C.pc;
    const jit = (sample(F.fbm, x * k * 2.5, y * k * 2.5) - 0.5) * 0.03;
    switch (pt.type) {
      case 'stripes': for (const tc of pt.ts) {
        const d = Math.abs(t + jit - tc + v * 0.012);
        if (d < pt.w / 2) c = mix3(c, pc, sstep(pt.w / 2, pt.w / 2 - 0.008, d));
        else if (C.outline && d < pt.w / 2 + 0.008) c = mix3(c, C.outline, 0.8);
      } break;
      case 'bands': for (const tc of pt.ts) {
        const d = Math.abs(t + jit - tc);
        if (d < pt.w / 2 && v < 0.35) c = mix3(c, pc, 0.65 * sstep(pt.w / 2, pt.w / 4, d) * sstep(0.35, 0.0, v));
      } break;
      case 'spots': {
        const s = pt.size * 22;
        const cc = sample(F.cell, x * k * s * 0.12, y * k * s * (pt.bean ? 0.2 : 0.12));
        const region = pt.region === 'upper' ? sstep(0.1, -0.2, v) : 1;
        if (pt.reticulate) c = mix3(c, pc, sstep(0.22, 0.12, sample(F.edge, x * k * s * 0.12, y * k * s * 0.12)) * 0.85);
        else c = mix3(c, pc, sstep(0.38, 0.28, cc) * region * 0.9);
        break;
      }
      case 'dots': if (Math.abs(v + 0.25) < 0.12) { const tt = (t - 0.25) / 0.3; if (tt > 0 && tt < 1) { const f = tt * 4 - Math.floor(tt * 4); c = mix3(c, pc, sstep(0.35, 0.2, Math.hypot(f - 0.5, (v + 0.25) * 4))); } } break;
      case 'tiger': { const s = Math.sin((t + (sample(F.fbm, x * k * 3, y * k) - 0.5) * 0.12) * 85); c = mix3(c, pc, sstep(0.55, 0.85, s) * sstep(0.1, -0.4, v) * sstep(0.95, 0.4, t) * 0.65); break; }
      case 'wavy': { const s = Math.sin(t * 70 + v * 9 + sample(F.fbm, x * k * 2, y * k * 2) * 4); c = mix3(c, pc, sstep(0.5, 0.8, s) * sstep(0.05, -0.35, v) * 0.85); break; }
      case 'orca': {
        const white = [242, 244, 245];
        const eyePatch = Math.hypot((t - 0.17) / 0.07, (v + 0.35) / 0.22) < 1;
        const bellyW = v > 0.15 + 0.5 * sstep(0.05, 0.6, t) - (t > 0.5 && t < 0.7 ? 0.25 * Math.sin((t - 0.5) / 0.2 * Math.PI) : 0) && t < 0.75;
        if (eyePatch || bellyW) c = white;
        c = mix3(c, [120, 128, 136], 0.45 * sstep(1, 0.6, Math.hypot((t - 0.55) / 0.07, (v + 0.8) / 0.35)));
        break;
      }
      case 'grooves': if (v > 0.35 && t < 0.42) { const s = Math.sin(v * 70); c = c.map((ch) => ch * (1 - sstep(0.7, 0.95, s) * 0.25)); } break;
      case 'chromatophores': { const cc = sample(F.cell, x * k * 4, y * k * 4); c = mix3(c, pc, sstep(0.3, 0.15, cc) * 0.7); break; }
      case 'croc': {
        const bandT = Math.sin(t * 38 + sample(F.fbm, x * k * 2, y * k * 2) * 2);
        c = mix3(c, pc || [30, 36, 16], sstep(0.4, 0.9, bandT) * sstep(0.45, 0.95, t) * sstep(0.2, -0.3, v) * 0.6);
        break;
      }
      default: break;
    }
  }
  // Línea lateral.
  if (!spec.shark && !spec.mammal && Math.abs(v + 0.08 - Math.sin(t * 3) * 0.04) < 0.018 && t > 0.2 && t < 0.88) c = c.map((ch) => ch * 0.82);
  // Opérculo / hendiduras branquiales.
  if (spec.gills) {
    for (let g = 0; g < spec.gills; g++) {
      const tg = 0.19 + g * 0.022 + v * 0.012;
      const dg = t - tg;
      if (v > -0.45 && v < 0.55) { if (Math.abs(dg) < 0.0022) c = c.map((ch) => ch * 0.62); else if (dg > 0 && dg < 0.006) c = c.map((ch) => ch * 1.08); }
    }
  } else if (!spec.mammal && !spec.noEye && spec.skin !== 'osteoderm') {
    const tg = 0.21 + 0.04 * v * v;
    const d = t - tg;
    if (Math.abs(d) < 0.006 && Math.abs(v) < 0.85) c = c.map((ch) => ch * 0.7);
    else if (d > 0 && d < 0.05 && Math.abs(v) < 0.8) c = c.map((ch) => ch * 1.04);
  }
  if (spec.armor && t < spec.armor.t1 && v < 0.75) {
    c = mix3(c, C.armor, 0.7);
    for (const s of [0.08, 0.16, 0.24]) if (Math.abs(t - s - v * 0.02) < 0.004) c = c.map((ch) => ch * 0.55);
  }
  return c;
}

// ---------- horneado del cuerpo (generador por columnas) ----------
export function* bakeBody(spec, W, golden = false) {
  const F = noiseFields();
  const col = golden ? GOLD : spec.col;
  const tb = spec.top ?? 1, bb = spec.bot ?? 1;
  let maxP = 0;
  for (let i = 0; i <= 60; i++) maxP = Math.max(maxP, profile(spec.prof, i / 60));
  const finUp = Math.max(0, ...(spec.dorsal || []).map((d) => d.h));
  const finDown = Math.max(spec.anal?.h || 0, spec.pelvic?.s || 0);
  const pad = 3;
  const top = Math.ceil((maxP * tb + finUp * 1.05) * W) + pad;
  const H = top + Math.ceil((maxP * bb + finDown * 1.05) * W) + pad;
  const y0 = top;
  const body = canvas2(W, H);
  const bctx = body.getContext('2d');
  const img = bctx.createImageData(W, H);
  const data = img.data;
  const hT = new Float32Array(W + 2), hB = new Float32Array(W + 2);
  for (let x = -1; x <= W; x++) {
    const t = 1 - (x + 0.5) / W; const p = profile(spec.prof, clamp(t, 0, 1)) * W;
    hT[x + 1] = p * tb * (1 - (spec.snoutFlat || 0) * sstep(0.32, 0, t)); hB[x + 1] = p * bb;
    if (spec.skin === 'osteoderm' && t > 0.24) { const s = Math.max(0, Math.sin((x / (W * 0.021)) * Math.PI)); hT[x + 1] += W * (t > 0.55 ? 0.009 : 0.005) * s * s; }
  }
  const gloss = (spec.gloss ?? 0.6) * (golden ? 1.8 : 1);
  const shin = 18 + gloss * 30;
  const bump = spec.skin === 'osteoderm' ? 1.4 : spec.skin === 'scales' ? 1.3 : spec.skin === 'armor' ? 1.6 : spec.skin === 'denticles' ? 0.5 : 0.8;
  const big = !!spec.bigScales;
  const translucent = spec.translucent || 0;
  const C = { back: hex(col.back), mid: hex(col.mid), belly: hex(col.belly), pc: spec.pattern?.color ? hex(spec.pattern.color) : null, outline: spec.pattern?.outline ? hex(spec.pattern.outline) : null, armor: spec.armor ? hex(spec.armor.color) : null };
  for (let x = 0; x < W; x++) {
    const t = 1 - (x + 0.5) / W;
    const ht = hT[x + 1], hb = hB[x + 1];
    const slope = ((hT[x + 2] + hB[x + 2]) - (hT[x] + hB[x])) / 4; // dh/dx (x hacia el hocico)
    const ymin = Math.max(0, Math.floor(y0 - ht - 1)), ymax = Math.min(H - 1, Math.ceil(y0 + hb + 1));
    for (let y = ymin; y <= ymax; y++) {
      const yy = y + 0.5 - y0;
      const lim = yy < 0 ? ht : hb;
      const cover = clamp(lim - Math.abs(yy) + 0.5, 0, 1);
      if (cover <= 0) continue;
      const v = clamp(yy / Math.max(0.5, lim), -1, 1);
      const sq = Math.sqrt(Math.max(0, 1 - v * v));
      let nx = -slope * 1.1 * sq, ny = v, nz = sq;
      // Relieve fino.
      const d0 = detailHeight(F, spec.skin, x, y, W, big);
      const dx = detailHeight(F, spec.skin, x + 1, y, W, big) - d0;
      const dy = detailHeight(F, spec.skin, x, y + 1, W, big) - d0;
      const bk = bump * sq; // el relieve se aplana en la silueta
      nx -= dx * bk; ny -= dy * bk;
      // Cresta dorsal del cocodrilo (escudos en relieve).
      if (spec.skin === 'osteoderm' && v < -0.7 && t > 0.24) { const r = Math.sin(t * 90) * 0.5 + 0.5; ny -= r * 0.6; }
      const m = Math.hypot(nx, ny, nz) || 1; nx /= m; ny /= m; nz /= m;
      const alb = albedoAt(spec, C, t, v, x, y, W, F);
      if (spec.skin === 'osteoderm') { const g = 0.68 + 0.32 * d0 / 0.87; alb[0] *= g; alb[1] *= g; alb[2] *= g; }
      const ndl = nx * L[0] + ny * L[1] + nz * L[2];
      const diff = Math.max(0, (ndl + 0.42) / 1.42);
      const sky = 0.5 - ny * 0.5;
      const ao = 1 - 0.25 * sstep(0.55, 1, v) - 0.15 * (1 - sq);
      let spc = Math.pow(Math.max(0, nx * Hv[0] + ny * Hv[1] + nz * Hv[2]), shin) * gloss;
      if (spec.skin === 'scales') spc *= 0.6 + d0 * 0.8;
      else spc *= 0.45 + 1.1 * sample(F.fbm, x * (TS / W) * 3, y * (TS / W) * 3);
      const rim = Math.pow(1 - nz, 3) * 0.5;
      const irid = spec.iridescent ? spec.iridescent * Math.pow(1 - nz, 1.5) * sstep(-0.6, 0.4, v) : 0;
      const i = (y * W + x) * 4;
      for (let ch = 0; ch < 3; ch++) {
        const lit = alb[ch] * (AMB[ch] * (0.72 + 0.28 * sky) * 0.85 * ao + SUN[ch] * diff * 0.72);
        const iri = irid * [60, 120, 200][ch] * (0.5 + 0.5 * Math.sin(t * 20 + ch * 2));
        data[i + ch] = clamp(lit + spc * 235 + rim * RIM[ch] + iri, 0, 255);
      }
      data[i + 3] = cover * 255 * (1 - translucent * 0.45 * sq);
    }
    if ((x & 7) === 7) yield;
  }
  bctx.putImageData(img, 0, 0);
  // ---------- composición: aletas detrás, cuerpo, detalles encima ----------
  const out = canvas2(W, H);
  const o = out.getContext('2d');
  const finHex = col.fin, finA = spec.translucent ? 0.6 : 0.92;
  const edge = (t, side) => { const x = (1 - t) * W; const p = profile(spec.prof, t) * W; return [x, y0 + (side < 0 ? -p * tb : p * bb)]; };
  const solid = !!(spec.shark || spec.mammal);
  for (const d of spec.dorsal || []) drawEdgeFin(o, edge, d, -1, finHex, finA, W, solid);
  if (spec.anal) drawEdgeFin(o, edge, spec.anal, 1, finHex, finA, W, solid);
  if (spec.pelvic) drawEdgeFin(o, edge, { t0: spec.pelvic.t - 0.03, t1: spec.pelvic.t + 0.03, h: spec.pelvic.s, tip: 0.8 }, 1, finHex, finA, W, solid);
  o.drawImage(body, 0, 0);
  if (spec.finlets) {
    o.fillStyle = spec.finlets;
    for (let k = 0; k < 5; k++) {
      const t = 0.7 + k * 0.045;
      for (const side of [-1, 1]) {
        const [px, py] = edge(t, side), s = W * 0.016;
        o.beginPath(); o.moveTo(px, py); o.lineTo(px - s, py + side * s); o.lineTo(px - s * 1.5, py); o.closePath(); o.fill();
      }
    }
  }
  drawHeadDetails(o, spec, col, W, y0, tb, bb);
  yield;
  // Máscara blanca para el destello de golpe.
  const mask = canvas2(W, H);
  const mc = mask.getContext('2d');
  mc.drawImage(out, 0, 0);
  mc.globalCompositeOperation = 'source-in';
  mc.fillStyle = '#fff'; mc.fillRect(0, 0, W, H);
  return { canvas: out, mask, W, H, y0, spec };
}

function drawEdgeFin(o, edge, f, dir, finHex, finA, W, solid = false) {
  const steps = 10;
  const base = [];
  for (let k = 0; k <= steps; k++) base.push(edge(lerp(f.t0, f.t1, k / steps), dir));
  const apexIdx = Math.round((f.tip ?? 0.4) * steps);
  const h = f.h * W;
  const apex = [base[apexIdx][0] - h * 0.35, base[apexIdx][1] + dir * h]; // inclinada hacia la cola
  const b0 = base[0], b1 = base[steps];
  const c = hex(finHex);
  o.save();
  if (solid) apex[0] -= h * 0.2;
  o.beginPath();
  o.moveTo(b0[0], b0[1]);
  if (solid) o.quadraticCurveTo(lerp(b0[0], apex[0], 0.15), lerp(b0[1], apex[1], 0.55), apex[0], apex[1]);
  else o.quadraticCurveTo(lerp(b0[0], apex[0], 0.3), lerp(b0[1], apex[1], 0.9), apex[0], apex[1]);
  const cc = f.concave ?? 0.1;
  o.quadraticCurveTo(lerp(apex[0], b1[0], 0.5) - h * cc * 0.4, lerp(apex[1], b1[1], 0.5) + dir * h * cc * 0.3, b1[0], b1[1]);
  for (let k = steps - 1; k > 0; k--) o.lineTo(base[k][0], base[k][1]);
  o.closePath();
  const g = o.createLinearGradient(0, b0[1], 0, apex[1]);
  if (solid) { g.addColorStop(0, rgba(c, 1)); g.addColorStop(1, rgba(c.map((v) => v * 1.15 + 18), 1)); }
  else { g.addColorStop(0, rgba(c, finA)); g.addColorStop(1, rgba(c.map((v) => v * 0.8 + 40), finA * 0.55)); }
  o.fillStyle = g; o.fill();
  o.clip();
  if (solid) {
    // Volumen: borde de ataque iluminado, borde de fuga en sombra.
    const sg = o.createLinearGradient(b0[0], 0, b1[0], 0);
    sg.addColorStop(0, 'rgba(255,255,255,0.16)'); sg.addColorStop(1, 'rgba(0,0,0,0.25)');
    o.fillStyle = sg; o.fillRect(Math.min(b0[0], b1[0]) - h, Math.min(apex[1], b0[1]) - h, Math.abs(b1[0] - b0[0]) + 2 * h, 3 * h);
    o.restore();
    return;
  }
  // Radios de la aleta.
  o.strokeStyle = rgba(c.map((v) => v * 0.6), 0.55);
  o.lineWidth = Math.max(0.5, W * 0.0025);
  const rays = f.spiny ? 9 : 7;
  for (let k = 0; k <= rays; k++) {
    const b = base[Math.round((k / rays) * steps)];
    o.beginPath(); o.moveTo(b[0], b[1]); o.lineTo(lerp(b[0], apex[0], 1.2) + (k / rays - 0.5) * h * 0.6, lerp(b[1], apex[1], 1.2)); o.stroke();
  }
  o.restore();
}

function drawHeadDetails(o, spec, col, W, y0, tb, bb) {
  const pAt = (t) => profile(spec.prof, t) * W;
  const pTop = (t) => pAt(t) * tb * (1 - (spec.snoutFlat || 0) * sstep(0.32, 0, t));
  // Ojo.
  if (!spec.noEye) {
    const t = spec.eyeT ?? 0.12, x = (1 - t) * W, h = pAt(t);
    const y = y0 + (spec.eyeY ?? -0.28) * (spec.eyeY < -0.9 ? pTop(t) : Math.min(h, pTop(t) * 1.2));
    const r = Math.max(1.2, (spec.eye || 0.04) * W);
    const sock = o.createRadialGradient(x, y, r * 0.6, x, y, r * 1.6);
    sock.addColorStop(0, 'rgba(0,0,0,0.35)'); sock.addColorStop(1, 'rgba(0,0,0,0)');
    o.fillStyle = sock; o.beginPath(); o.arc(x, y, r * 1.6, 0, TAU); o.fill();
    if (spec.shark || spec.mammal) {
      const g = o.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
      g.addColorStop(0, '#2a2f35'); g.addColorStop(1, '#020203');
      o.fillStyle = g; o.beginPath(); o.arc(x, y, r, 0, TAU); o.fill();
    } else {
      const ic = hex(col.eye);
      const g = o.createRadialGradient(x, y, r * 0.15, x, y, r);
      g.addColorStop(0, rgba(ic.map((v) => v * 0.6), 1)); g.addColorStop(0.55, rgba(ic, 1)); g.addColorStop(1, rgba(ic.map((v) => v * 0.45), 1));
      o.fillStyle = g; o.beginPath(); o.arc(x, y, r, 0, TAU); o.fill();
      o.fillStyle = '#030303'; o.beginPath(); o.arc(x + r * 0.12, y, r * 0.5, 0, TAU); o.fill();
      o.strokeStyle = 'rgba(0,0,0,0.6)'; o.lineWidth = Math.max(0.6, r * 0.12); o.beginPath(); o.arc(x, y, r, 0, TAU); o.stroke();
    }
    o.fillStyle = 'rgba(255,255,255,0.92)'; o.beginPath(); o.arc(x + r * 0.32, y - r * 0.34, Math.max(0.6, r * 0.22), 0, TAU); o.fill();
    o.fillStyle = 'rgba(255,255,255,0.35)'; o.beginPath(); o.arc(x - r * 0.3, y + r * 0.35, Math.max(0.4, r * 0.12), 0, TAU); o.fill();
  }
  // Boca cerrada (y dientes visibles si procede).
  if (!spec.noEye) {
    const shark = spec.shark;
    const tTip = shark ? 0.045 : 0.0, tH = spec.mouthT ?? 0.12;
    const tipX = (1 - tTip) * W + (shark ? 0 : W * 0.004), tipY = y0 + (shark ? pAt(tTip) * 0.7 : pAt(0.01) * 0.15);
    const hx = (1 - tH) * W, hy = y0 + pAt(tH) * (shark ? 0.62 : 0.22);
    o.strokeStyle = 'rgba(15,10,10,0.75)'; o.lineWidth = Math.max(0.7, W * 0.004); o.lineCap = 'round';
    o.beginPath(); o.moveTo(hx, hy); o.quadraticCurveTo((hx + tipX) / 2, (hy + tipY) / 2 + (shark ? -W * 0.006 : W * 0.006), tipX, tipY); o.stroke();
    if (spec.showTeeth && spec.teeth) {
      const n = Math.max(4, Math.round(5 + spec.teeth * 1.5));
      for (let k = 0; k < n; k++) {
        const u = (k + 0.5) / n, x = lerp(hx, tipX, u), y = lerp(hy, tipY, u) + 0.5;
        const s = W * 0.0035 * spec.teeth * (0.6 + 0.4 * Math.sin(u * Math.PI));
        const g = o.createLinearGradient(x, y, x, y + s);
        g.addColorStop(0, '#fffdf3'); g.addColorStop(1, '#c9c2a8');
        o.fillStyle = g;
        o.beginPath(); o.moveTo(x - s * 0.45, y); o.lineTo(x + s * 0.45, y); o.lineTo(x, y + s); o.closePath(); o.fill();
      }
    }
    if (spec.crocTeeth) {
      for (let k = 0; k < 13; k++) {
        const u = (k + 0.5) / 13, x = lerp((1 - 0.23) * W, W * 0.995, u), y = y0 + lerp(pAt(0.23) * 0.2, pAt(0.01) * 0.1, u);
        const s = W * 0.011 * (k % 3 === 0 ? 1.4 : 1);
        o.fillStyle = '#efe6c8';
        o.beginPath(); o.moveTo(x - s * 0.35, y - s * 0.1); o.lineTo(x + s * 0.35, y - s * 0.1); o.lineTo(x, y + (k % 2 ? s : -s)); o.closePath(); o.fill();
      }
    }
    if (shark) { // fosa nasal
      o.strokeStyle = 'rgba(0,0,0,0.5)'; o.lineWidth = Math.max(0.6, W * 0.003);
      o.beginPath(); o.arc((1 - 0.025) * W, y0 + pAt(0.025) * 0.25, W * 0.006, 0.3, 2.6); o.stroke();
    }
  }
  // Cicatrices.
  if (spec.scars) {
    o.strokeStyle = 'rgba(230,228,220,0.42)'; o.lineWidth = Math.max(0.6, W * 0.0022);
    for (let k = 0; k < spec.scars; k++) {
      const t = 0.15 + ((k * 0.618) % 1) * 0.55, x = (1 - t) * W, h = pAt(t);
      const y = y0 - h * (0.2 + ((k * 0.37) % 1) * 0.6);
      o.beginPath(); o.moveTo(x, y); o.quadraticCurveTo(x - W * 0.015, y + W * 0.004, x - W * (0.025 + (k % 3) * 0.01), y + W * 0.012); o.stroke();
    }
  }
  if (spec.wrinkles) {
    o.strokeStyle = 'rgba(0,0,0,0.16)'; o.lineWidth = Math.max(0.6, W * 0.002);
    for (let k = 0; k < 12; k++) { const t = 0.3 + k * 0.035, x = (1 - t) * W, h = pAt(t); o.beginPath(); o.moveTo(x, y0 - h * 0.7); o.quadraticCurveTo(x - W * 0.01, y0, x, y0 + h * 0.4); o.stroke(); }
  }
}

// ---------- sprites de cola y aleta pectoral ----------
export function bakeTail(spec, W, golden = false) {
  const col = golden ? GOLD : spec.col;
  const t = spec.tail || { type: 'fork', s: 0.2 };
  if (t.type === 'eel') return null;
  const s = t.s * W;
  const cw = Math.ceil(s * 1.15) + 4, ch = Math.ceil(s * 2.1) + 4;
  const c = canvas2(cw, ch);
  const o = c.getContext('2d');
  const cy = ch / 2;
  const hb = Math.max(1.5, profile(spec.prof, 1) * W);
  o.translate(1, cy);
  o.beginPath();
  o.moveTo(0, -hb);
  switch (t.type) {
    case 'lunate': o.quadraticCurveTo(s * 0.3, -s * 0.4, s * 0.95, -s * 0.95); o.quadraticCurveTo(s * 0.45, -s * 0.2, s * 0.32, 0); o.quadraticCurveTo(s * 0.45, s * 0.2, s * 0.95, s * 0.95); o.quadraticCurveTo(s * 0.3, s * 0.4, 0, hb); break;
    case 'round': o.bezierCurveTo(s * 0.5, -s * 0.7, s * 1.1, -s * 0.45, s * 1.05, 0); o.bezierCurveTo(s * 1.1, s * 0.45, s * 0.5, s * 0.7, 0, hb); break;
    case 'shark': o.quadraticCurveTo(s * 0.45, -s * 0.45, s * 1.05, -s * 1.0); o.quadraticCurveTo(s * 0.62, -s * 0.28, s * 0.36, s * 0.04); o.quadraticCurveTo(s * 0.55, s * 0.24, s * 0.62, s * 0.56); o.quadraticCurveTo(s * 0.28, s * 0.3, 0, hb); break;
    case 'fluke': o.quadraticCurveTo(s * 0.5, -s * 0.16, s * 1.0, -s * 0.13); o.quadraticCurveTo(s * 0.7, 0, s * 1.0, s * 0.13); o.quadraticCurveTo(s * 0.5, s * 0.16, 0, hb); break;
    case 'tadpole': o.quadraticCurveTo(s * 0.55, -s * 0.42, s * 1.0, 0); o.quadraticCurveTo(s * 0.55, s * 0.42, 0, hb); break;
    default: o.quadraticCurveTo(s * 0.4, -s * 0.35, s * 1.0, -s * 0.75); o.quadraticCurveTo(s * 0.55, -s * 0.18, s * 0.45, 0); o.quadraticCurveTo(s * 0.55, s * 0.18, s * 1.0, s * 0.75); o.quadraticCurveTo(s * 0.4, s * 0.35, 0, hb);
  }
  o.closePath();
  const fc = hex(col.fin);
  const solid = spec.shark || spec.mammal || t.type === 'shark';
  const g = o.createLinearGradient(0, 0, s, 0);
  g.addColorStop(0, rgba(fc, 0.96)); g.addColorStop(1, rgba(fc.map((v) => v * 0.85 + 30), solid ? 0.92 : 0.55));
  o.fillStyle = g; o.fill();
  o.save(); o.clip();
  // Luz desde arriba y radios.
  const lg = o.createLinearGradient(0, -s, 0, s);
  lg.addColorStop(0, 'rgba(255,255,255,0.18)'); lg.addColorStop(0.5, 'rgba(255,255,255,0)'); lg.addColorStop(1, 'rgba(0,0,0,0.22)');
  o.fillStyle = lg; o.fillRect(0, -s, s * 1.2, s * 2);
  if (!solid) {
    o.strokeStyle = rgba(fc.map((v) => v * 0.55), 0.5); o.lineWidth = Math.max(0.5, W * 0.0025);
    for (let k = -6; k <= 6; k++) { o.beginPath(); o.moveTo(0, k * hb / 7); o.lineTo(s * 1.1, k * s * 0.17); o.stroke(); }
  }
  o.restore();
  return { canvas: c, ax: 1, ay: cy, scale: 1 };
}

export function bakePect(spec, W, golden = false) {
  if (!spec.pect) return null;
  const col = golden ? GOLD : spec.col;
  const s = spec.pect.s * W;
  const c = canvas2(s + 4, s * 0.5 + 4);
  const o = c.getContext('2d');
  const cy = c.height / 2;
  o.translate(1, cy);
  o.beginPath();
  if (spec.pect.paddle) { o.moveTo(0, -s * 0.12); o.quadraticCurveTo(s * 0.7, -s * 0.22, s, s * 0.02); o.quadraticCurveTo(s * 0.6, s * 0.2, 0, s * 0.12); }
  else { o.moveTo(0, -s * 0.1); o.quadraticCurveTo(s * 0.55, -s * 0.28, s, s * 0.05); o.quadraticCurveTo(s * 0.5, s * 0.18, 0, s * 0.1); }
  o.closePath();
  const fc = hex(col.fin);
  const solid = spec.shark || spec.mammal;
  const g = o.createLinearGradient(0, -s * 0.2, 0, s * 0.2);
  g.addColorStop(0, rgba(fc.map((v) => v * 1.15 + 15), solid ? 0.98 : 0.8)); g.addColorStop(1, rgba(fc.map((v) => v * 0.7), solid ? 0.98 : 0.6));
  o.fillStyle = g; o.fill();
  if (!solid) { o.save(); o.clip(); o.strokeStyle = rgba(fc.map((v) => v * 0.5), 0.45); o.lineWidth = Math.max(0.5, W * 0.002); for (let k = -3; k <= 3; k++) { o.beginPath(); o.moveTo(0, k * 1.2); o.lineTo(s, k * s * 0.05); o.stroke(); } o.restore(); }
  return { canvas: c, ax: 1, ay: cy };
}

// ---------- caché con niveles de detalle ----------
const LODS = [96, 192, 384, 768, 1280];
const cache = new Map(); // key -> { lods: Map(W -> baked), pending: Set }
export let texScale = 1; // calidad: multiplica la resolución pedida
export function setTexScale(k) { texScale = k; }

function entry(id, golden) {
  const key = id + (golden ? ':g' : '');
  let e = cache.get(key);
  if (!e) { e = { lods: new Map(), pending: new Set() }; cache.set(key, e); }
  return e;
}
function bakeSync(id, W, golden) {
  const gen = bakeBody(SPECS[id], W, golden);
  let r = gen.next();
  while (!r.done) r = gen.next();
  return { body: r.value, tail: bakeTail(SPECS[id], W, golden), pect: bakePect(SPECS[id], W, golden) };
}
// Devuelve la mejor textura disponible para `px` píxeles de pantalla y encola una mejor.
export function getBaked(id, px, golden = false) {
  const e = entry(id, golden);
  const want = LODS.find((w) => w >= px * texScale) || LODS[LODS.length - 1];
  if (!e.lods.size) e.lods.set(LODS[0], bakeSync(id, LODS[0], golden));
  if (!e.lods.has(want) && !e.pending.has(want)) {
    e.pending.add(want);
    const spec = SPECS[id];
    baker.add(bakeBody(spec, want, golden), (body) => { e.lods.set(want, { body, tail: bakeTail(spec, want, golden), pect: bakePect(spec, want, golden) }); e.pending.delete(want); });
  }
  // La mayor disponible que no supere la deseada (la de 96 siempre existe).
  let best = null;
  for (const [w, b] of e.lods) if (w <= want && (!best || w > best.w)) best = { w, b };
  return (best || { b: e.lods.values().next().value }).b;
}
export function prebake(ids, px = 192) { for (const id of ids) getBaked(id, px); }
export { spineAt };

// ---------- dibujo deformable ----------
// o: { x, y, ang, len, phase, speedK, mouth, t, hit, golden, px (longitud en píxeles de pantalla) }
// Marco local: traslada, rota y voltea para que el vientre quede siempre abajo.
export function frame(ctx, x, y, ang) {
  ctx.translate(x, y); ctx.rotate(ang); if (Math.cos(ang) < 0) ctx.scale(1, -1);
}

export function drawFish(ctx, id, o) {
  ctx.save();
  frame(ctx, o.x, o.y, o.ang || 0);
  const sp = drawFishLocal(ctx, id, o);
  ctx.restore();
  return sp;
}

// Dibuja en el marco local ya establecido (cabeza hacia +x). Devuelve la columna (cabeza→cola).
export function drawFishLocal(ctx, id, o) {
  const spec = SPECS[id];
  const { len, phase = 0, speedK = 0.5, mouth = 0, t = 0, hit = 0, golden = false, px = len, noTail = false } = o;
  const baked = getBaked(id, px, golden);
  const body = baked.body, W = body.W, sc = len / W;
  // Columna ondulante: muestras de la cabeza (u = 0) a la cola (u = 1).
  const K = clamp(Math.round(px / 14), 1, 26);
  // Nadadores rígidos (atún, tiburones, cetáceos) solo flexionan la parte trasera: onda larga y baja.
  const amp = len * (spec.stiff ? 0.032 : 0.045) * (spec.wave || 1) * (0.45 + 0.75 * speedK);
  const waves = spec.waves || (spec.stiff ? 0.6 : 1.0);
  const sp = [];
  for (let i = 0; i <= K; i++) {
    const u = i / K;
    const env = spec.stiff ? 0.04 + 0.96 * Math.pow(u, 2.2) : 0.12 + 0.88 * u * u;
    sp.push([(0.5 - u) * len, Math.sin(phase - u * waves * TAU) * amp * env]);
  }
  // Cola.
  if (baked.tail && !noTail) {
    const a = sp[K - 1], b = sp[K];
    const ta = Math.atan2(b[1] - a[1], b[0] - a[0]) + Math.sin(phase - 1.2) * 0.22 * (0.4 + speedK);
    ctx.save(); ctx.translate(b[0], b[1]); ctx.rotate(ta);
    ctx.drawImage(baked.tail.canvas, -baked.tail.ax * sc - 1, -baked.tail.ay * sc, baked.tail.canvas.width * sc, baked.tail.canvas.height * sc);
    ctx.restore();
  }
  // Cuerpo en tiras.
  const drawStrips = (img) => {
    if (K === 1) { ctx.drawImage(img, -len / 2, -body.y0 * sc, len, body.H * sc); return; }
    for (let i = 0; i < K; i++) {
      const p0 = sp[i], p1 = sp[i + 1];
      const mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2;
      const a = Math.atan2(p0[1] - p1[1], p0[0] - p1[0]);
      const seg = Math.hypot(p0[0] - p1[0], p0[1] - p1[1]);
      const sx0 = (i / K) * W, sw = W / K;
      const srcX = W - sx0 - sw;
      ctx.save(); ctx.translate(mx, my); ctx.rotate(a);
      const ov = Math.min(1.2, sw * 0.3);
      ctx.drawImage(img, Math.max(0, srcX - ov), 0, Math.min(W, sw + ov * 2), body.H, -seg / 2 - ov * sc, -body.y0 * sc, seg + ov * 2 * sc, body.H * sc);
      ctx.restore();
    }
  };
  drawStrips(body.canvas);
  if (hit > 0) { ctx.globalAlpha = hit * 0.6; drawStrips(body.mask); ctx.globalAlpha = 1; }
  // Aleta pectoral (lado cercano).
  if (baked.pect) {
    const u = spec.pect.t, i = clamp(Math.round(u * K), 0, K);
    const h = profile(spec.prof, u) * len;
    const px0 = sp[i][0], py0 = sp[i][1] + h * 0.35;
    ctx.save(); ctx.translate(px0, py0); ctx.rotate(Math.PI - 0.45 - Math.sin(phase * 0.8) * 0.22);
    ctx.drawImage(baked.pect.canvas, -baked.pect.ax * sc, -baked.pect.ay * sc, baked.pect.canvas.width * sc, baked.pect.canvas.height * sc);
    ctx.restore();
  }
  if (spec.hammer) drawHammer(ctx, sp, spec, len);
  const open = Math.max(mouth, spec.mouth || 0);
  if (open > 0.04 && !spec.noEye) drawOpenMouth(ctx, sp, spec, len, open, golden ? GOLD : spec.col);
  if (spec.glow) drawGlow(ctx, sp, spec, len, t);
  if (spec.lure) drawLure(ctx, sp, spec, len, t);
  if (spec.barbels) drawBarbels(ctx, sp, spec, len, t);
  return sp;
}

function spineAt(sp, u) { const K = sp.length - 1, f = clamp(u, 0, 1) * K, i = Math.min(K - 1, Math.floor(f)), k = f - i; return [lerp(sp[i][0], sp[i + 1][0], k), lerp(sp[i][1], sp[i + 1][1], k)]; }

function drawOpenMouth(ctx, sp, spec, len, open, col) {
  const h = (u) => profile(spec.prof, u) * len;
  const tTip = spec.shark ? 0.045 : 0.0, tH = spec.mouthT ?? 0.12;
  const s0 = spineAt(sp, tTip), sH = spineAt(sp, tH);
  const tip = [s0[0] + (spec.shark ? 0 : len * 0.004), s0[1] + (spec.shark ? h(tTip) * 0.7 : h(0.01) * 0.15)];
  const hinge = [sH[0], sH[1] + h(tH) * (spec.shark ? 0.62 : 0.22)];
  const vx = tip[0] - hinge[0], vy = tip[1] - hinge[1], L = Math.hypot(vx, vy) || 1;
  const a = open * (spec.jaw ?? 0.5);
  const jaw = [hinge[0] + vx * Math.cos(a) - vy * Math.sin(a), hinge[1] + vx * Math.sin(a) + vy * Math.cos(a)];
  const g = ctx.createLinearGradient(hinge[0], hinge[1], tip[0], tip[1]);
  g.addColorStop(0, '#24030a'); g.addColorStop(0.6, '#6e1424'); g.addColorStop(1, '#a8394c');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(hinge[0], hinge[1]); ctx.lineTo(tip[0], tip[1]); ctx.lineTo(jaw[0], jaw[1]); ctx.closePath(); ctx.fill();
  const n = clamp(Math.round(4 + L / 9), 4, 14), ts = len * 0.012 * (spec.teeth || 1);
  const row = (x0, y0, x1, y1, nx, ny) => {
    for (let k = 0; k < n; k++) {
      const u0 = (k + 0.1) / n, u1 = (k + 0.9) / n, um = (k + 0.5) / n;
      const s = ts * (0.7 + 0.3 * Math.sin(um * Math.PI));
      const bx = lerp(x0, x1, um), by = lerp(y0, y1, um);
      const tg = ctx.createLinearGradient(bx, by, bx + nx * s, by + ny * s);
      tg.addColorStop(0, '#d9d2b8'); tg.addColorStop(1, '#fffef6');
      ctx.fillStyle = tg;
      ctx.beginPath(); ctx.moveTo(lerp(x0, x1, u0), lerp(y0, y1, u0)); ctx.lineTo(lerp(x0, x1, u1), lerp(y0, y1, u1)); ctx.lineTo(bx + nx * s, by + ny * s); ctx.closePath(); ctx.fill();
    }
  };
  if (spec.teeth) row(hinge[0], hinge[1], tip[0], tip[1], -vy / L, vx / L);
  const jx = (jaw[0] - hinge[0]) / L, jy = (jaw[1] - hinge[1]) / L;
  if (spec.teeth) row(hinge[0], hinge[1], jaw[0], jaw[1], jy, -jx);
  // Mandíbula inferior con volumen.
  const th = h(tH) * 0.38;
  const px = -jy, py = jx;
  const lg = ctx.createLinearGradient(jaw[0], jaw[1], jaw[0] + px * th, jaw[1] + py * th);
  lg.addColorStop(0, col.belly); lg.addColorStop(1, col.mid);
  ctx.fillStyle = lg;
  ctx.beginPath(); ctx.moveTo(hinge[0], hinge[1]); ctx.lineTo(jaw[0], jaw[1]); ctx.lineTo(jaw[0] + px * th * 0.45, jaw[1] + py * th * 0.45); ctx.lineTo(hinge[0] + px * th, hinge[1] + py * th); ctx.closePath(); ctx.fill();
}

function drawHammer(ctx, sp, spec, len) {
  const s0 = sp[0], h = profile(spec.prof, 0.02) * len;
  const x = s0[0] - len * 0.01, y = s0[1] - h * 0.1, hh = len * 0.17, w = len * 0.05;
  const g = ctx.createLinearGradient(x, y - hh, x + w, y + hh);
  g.addColorStop(0, '#7a8b97'); g.addColorStop(0.5, '#93a4af'); g.addColorStop(1, '#c9d2d8');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(x, y, w, hh, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#050505';
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(x + w * 0.2, y + s * hh * 0.84, len * 0.011, 0, TAU); ctx.fill(); }
}

function drawGlow(ctx, sp, spec, len, t) {
  if (!spec.photophores) return;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let k = 0; k < spec.photophores; k++) {
    const u = 0.15 + (k / spec.photophores) * 0.7, s = spineAt(sp, u), h = profile(spec.prof, u) * len;
    const x = s[0], y = s[1] + h * 0.72, r = Math.max(1, len * 0.02) * (0.8 + 0.2 * Math.sin(t * 2.5 + k));
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3.5);
    g.addColorStop(0, spec.glow); g.addColorStop(0.3, spec.glow + '88'); g.addColorStop(1, spec.glow + '00');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 3.5, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

function drawLure(ctx, sp, spec, len, t) {
  const Lr = spec.lure, s = spineAt(sp, Lr.t), h = profile(spec.prof, Lr.t) * len;
  const base = [s[0], s[1] - h];
  const L2 = Lr.len * len;
  const tip = [base[0] + L2 * 0.75, base[1] - L2 * 0.55 + Math.sin(t * 1.6) * L2 * 0.08];
  ctx.strokeStyle = 'rgba(190,180,160,0.85)'; ctx.lineWidth = Math.max(0.6, len * 0.01); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(base[0], base[1]); ctx.quadraticCurveTo(base[0] + L2 * 0.2, base[1] - L2 * 0.9, tip[0], tip[1]); ctx.stroke();
  const r = Math.max(1.5, len * 0.035), pulse = 0.75 + 0.25 * Math.sin(t * 3);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(tip[0], tip[1], 0, tip[0], tip[1], r * 7);
  g.addColorStop(0, `rgba(220,255,255,${0.95 * pulse})`); g.addColorStop(0.2, Lr.color + 'aa'); g.addColorStop(1, Lr.color + '00');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(tip[0], tip[1], r * 7, 0, TAU); ctx.fill();
  ctx.restore();
}

function drawBarbels(ctx, sp, spec, len, t) {
  const s = sp[0], h = profile(spec.prof, 0.02) * len;
  ctx.strokeStyle = 'rgba(150,100,40,0.85)'; ctx.lineWidth = Math.max(0.6, len * 0.008); ctx.lineCap = 'round';
  for (const k of [1, 1.6]) { ctx.beginPath(); ctx.moveTo(s[0] - len * 0.01 * k, s[1] + h * 0.5); ctx.quadraticCurveTo(s[0] - len * 0.02 * k, s[1] + len * 0.06, s[0] - len * 0.07 * k + Math.sin(t * 2 + k) * len * 0.01, s[1] + len * 0.08); ctx.stroke(); }
}
