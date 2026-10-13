// Mundos: temas de color y luz, fondos texturizados, rocas y corales horneados, vegetación animada,
// cielo/orilla y panoramas lejanos desenfocados. Cada mundo tiene una identidad visual propia.
import { WORLDS } from '../content.mjs';
import { floorAt } from '../terrain.mjs';
import { noiseFields, sample, TS, canvas2, hash2, baker } from './texture.mjs';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgba = (h, a) => { const c = hex(h); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; };
const L = (() => { const v = [-0.35, -0.8, 0.5]; const m = Math.hypot(...v); return v.map((c) => c / m); })();

// ---------- temas ----------
export const THEMES = [
  { // Arrecife: agua turquesa cristalina, arena clara, sol fuerte.
    water: [[0, '#3fd2e6'], [0.25, '#18a5d4'], [0.6, '#0c66ad'], [1, '#06315f']],
    sky: ['#58b9ef', '#cdeefc'], sun: '#fff6d0', shore: 'islands', haze: '#bff4ff', hazeA: 0.1,
    rays: 0.26, rayLen: 1300, caustic: 0.55, absorb: '#0a4f9a', absorbMax: 0.45, floor: 'sand',
    particles: '#e9ffff', particleA: 0.45, glow: false, light: '#d8fbff', vignette: '#012240',
  },
  { // Lago: agua verde turbia, lodo, poca luz.
    water: [[0, '#6d9a5a'], [0.2, '#4a7a46'], [0.6, '#2c4f33'], [1, '#162a1d']],
    sky: ['#8fb3c9', '#dfe7d6'], sun: '#fff1c4', shore: 'forest', haze: '#9fbf7a', hazeA: 0.22,
    rays: 0.18, rayLen: 700, caustic: 0.28, absorb: '#2c4a22', absorbMax: 0.55, floor: 'mud',
    particles: '#d8e6b0', particleA: 0.6, glow: false, light: '#e6f2c8', vignette: '#0b160b',
  },
  { // Océano abierto: azul profundo, rayos largos.
    water: [[0, '#2aa4e0'], [0.18, '#1272c0'], [0.5, '#073f86'], [1, '#021a3a']],
    sky: ['#3f8fd6', '#bfe1f7'], sun: '#fffbe6', shore: 'none', haze: '#7cc8ff', hazeA: 0.08,
    rays: 0.3, rayLen: 1900, caustic: 0.3, absorb: '#04306e', absorbMax: 0.6, floor: 'oceanSand',
    particles: '#d6f1ff', particleA: 0.4, glow: false, light: '#d6f4ff', vignette: '#000c1e',
  },
  { // Fosa abisal: casi negro, bioluminiscencia.
    water: [[0, '#0f3a66'], [0.1, '#06213f'], [0.35, '#020c1c'], [1, '#00030a']],
    sky: ['#0b1f3a', '#1e4a75'], sun: '#9fc4e6', shore: 'none', haze: '#1f5a8a', hazeA: 0.06,
    rays: 0.1, rayLen: 600, caustic: 0.05, absorb: '#00081a', absorbMax: 0.75, floor: 'silt',
    particles: '#7ff6ff', particleA: 0.55, glow: true, light: '#5f8fb8', vignette: '#000000',
  },
  { // Mar prehistórico: verde azulado cálido, basalto volcánico, cielo de ceniza.
    water: [[0, '#3cb3a6'], [0.22, '#1d8079'], [0.6, '#0f4a4a'], [1, '#062224']],
    sky: ['#b35a3a', '#f0b27a'], sun: '#ffd28a', shore: 'volcano', haze: '#8fe0c8', hazeA: 0.12,
    rays: 0.24, rayLen: 1500, caustic: 0.38, absorb: '#0b3b38', absorbMax: 0.55, floor: 'basalt',
    particles: '#d9fff1', particleA: 0.45, glow: false, light: '#e9fff2', vignette: '#020f0d',
  },
];

export function waterColorStops(idx) { return THEMES[idx].water; }

// ---------- texturas de fondo (enlosables, iluminadas) ----------
const FLOOR_MAT = {
  sand: { base: '#e2cf9a', dark: '#a98e5a', ripple: 1, grain: 0.5 },
  mud: { base: '#5a4a32', dark: '#2a2016', ripple: 0, pebbles: 1, grain: 0.4 },
  oceanSand: { base: '#9aa8a6', dark: '#4f5f63', ripple: 0.7, grain: 0.4 },
  silt: { base: '#2a3038', dark: '#0b0e12', cracks: 1, grain: 0.3 },
  basalt: { base: '#463833', dark: '#14100e', cracks: 1.2, grain: 0.15, ember: true },
};
const floorTiles = new Map();
function* bakeFloorTile(mat) {
  const F = noiseFields(), M = FLOOR_MAT[mat];
  const c = canvas2(TS, TS), g = c.getContext('2d');
  const img = g.createImageData(TS, TS), d = img.data;
  const base = hex(M.base), dark = hex(M.dark);
  const H = (x, y) => {
    let h = sample(F.fbm, x, y) * 0.6;
    if (M.ripple) h += Math.sin(TAU * (x * 6 / TS + sample(F.fbm, x * 0.5, y * 0.5) * 0.9 + y * 1 / TS)) * 0.18 * M.ripple;
    if (M.pebbles) { const cc = sample(F.cell, x * 2, y * 2); h += Math.max(0, 0.32 - cc) * 2.2; }
    if (M.cracks) h -= (1 - sstep(0, 0.07, sample(F.edge, x * 1.5, y * 1.5))) * 0.35 * M.cracks;
    h += sample(F.fine, x * 2, y * 2) * 0.12 * M.grain;
    return h;
  };
  for (let y = 0; y < TS; y++) {
    for (let x = 0; x < TS; x++) {
      const h = H(x, y), hx = H(x + 1, y) - h, hy = H(x, y + 1) - h;
      let nx = -hx * 6, ny = -hy * 6, nz = 1; const m = Math.hypot(nx, ny, nz); nx /= m; ny /= m; nz /= m;
      const diff = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
      const k = 0.45 + 0.75 * diff;
      const tone = clamp(h * 0.9 + 0.3, 0, 1);
      const i = (y * TS + x) * 4;
      for (let ch = 0; ch < 3; ch++) d[i + ch] = clamp(lerp(dark[ch], base[ch], tone) * k, 0, 255);
      if (M.ember && sample(F.edge, x * 1.5, y * 1.5) < 0.015) { d[i] = 255; d[i + 1] = 110; d[i + 2] = 30; }
      d[i + 3] = 255;
    }
    if ((y & 15) === 15) yield;
  }
  g.putImageData(img, 0, 0);
  return c;
}

// ---------- rocas horneadas (relieve por píxel) ----------
const ROCK_MAT = [
  { base: '#9b8f7d', dark: '#4d463d', top: '#c46a7a', top2: '#6f9a4a' }, // arrecife: coralina rosa y algas
  { base: '#6c6a5c', dark: '#2a2a22', top: '#4f7a2a', top2: '#3f5a22' }, // lago: musgo
  { base: '#6f7b86', dark: '#2a323a', top: '#8a9aa6', top2: '#5b6f7f' }, // océano
  { base: '#2b3036', dark: '#07090c', top: '#3a4650', top2: '#1d252c' }, // fosa
  { base: '#3b302c', dark: '#100b0a', top: '#4a6a3a', top2: '#2e3d27' }, // mioceno
];
function* bakeRock(worldIdx, seed, w, h) {
  const F = noiseFields(), M = ROCK_MAT[worldIdx];
  const c = canvas2(w, h), g = c.getContext('2d');
  const img = g.createImageData(w, h), d = img.data;
  const base = hex(M.base), dark = hex(M.dark), top = hex(M.top), top2 = hex(M.top2);
  const ox = hash2(seed, 1) * 256, oy = hash2(seed, 2) * 256;
  const sc = 256 / w * 1.3;
  const height = (x, y) => {
    const u = (x / w - 0.5) * 2, v = (y / h - 1) ; // v: -1 arriba, 0 base
    const dome = 1 - (u * u + v * v * 1.1);
    const n = sample(F.fbm, ox + x * sc, oy + y * sc);
    const cr = 1 - sstep(0, 0.06, sample(F.edge, ox + x * sc * 1.6, oy + y * sc * 1.6));
    return dome * 0.95 + (n - 0.5) * 0.42 - cr * 0.08;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const hh = height(x, y);
      if (hh <= 0) continue;
      const a = clamp(hh * 12, 0, 1);
      const hx = height(x + 1, y) - hh, hy = height(x, y + 1) - hh;
      let nx = -hx * w * 0.28, ny = -hy * h * 0.28, nz = 1; const m = Math.hypot(nx, ny, nz); nx /= m; ny /= m; nz /= m;
      const diff = Math.max(0, (nx * L[0] + ny * L[1] + nz * L[2] + 0.35) / 1.35);
      const up = sstep(-0.2, -0.75, ny) * sstep(0.45, 0.65, sample(F.fbm, ox + x * sc * 2, oy + y * sc * 2));
      const tone = clamp(sample(F.fbm, ox + x * sc * 3, oy + y * sc * 3), 0, 1);
      const i = (y * w + x) * 4;
      for (let ch = 0; ch < 3; ch++) {
        let col = lerp(dark[ch], base[ch], tone);
        col = lerp(col, lerp(top[ch], top2[ch], hash2(Math.floor(x / 9), Math.floor(y / 9), seed)), up * 0.85);
        d[i + ch] = clamp(col * (0.45 + 0.85 * diff) * (0.75 + 0.25 * (1 - y / h)), 0, 255);
      }
      d[i + 3] = a * 255;
    }
    if ((y & 7) === 7) yield;
  }
  g.putImageData(img, 0, 0);
  return c;
}

// ---------- corales ----------
function* bakeBrainCoral(seed, w, h, color) {
  const F = noiseFields(), base = hex(color);
  const c = canvas2(w, h), g = c.getContext('2d');
  const img = g.createImageData(w, h), d = img.data;
  const ox = hash2(seed, 3) * 256;
  const H = (x, y) => {
    const u = (x / w - 0.5) * 2, v = y / h - 1;
    const dome = 1 - (u * u + v * v * 1.25);
    if (dome <= 0) return -1;
    const e = sample(F.edge, ox + x * 3.2 * 256 / w, y * 3.2 * 256 / w);
    return Math.sqrt(dome) + sstep(0.02, 0.14, e) * 0.08;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const hh = H(x, y);
      if (hh < 0) continue;
      const hx = H(x + 1, y) - hh, hy = H(x, y + 1) - hh;
      let nx = -hx * w * 0.5, ny = -hy * h * 0.5, nz = 1; const m = Math.hypot(nx, ny, nz); nx /= m; ny /= m; nz /= m;
      const diff = Math.max(0, (nx * L[0] + ny * L[1] + nz * L[2] + 0.25) / 1.25);
      const groove = sstep(0.0, 0.1, sample(F.edge, ox + x * 3.2 * 256 / w, y * 3.2 * 256 / w));
      const i = (y * w + x) * 4;
      for (let ch = 0; ch < 3; ch++) d[i + ch] = clamp(base[ch] * (0.35 + 0.8 * diff) * (0.65 + 0.35 * groove), 0, 255);
      d[i + 3] = 255;
    }
    if ((y & 7) === 7) yield;
  }
  g.putImageData(img, 0, 0);
  return c;
}

// Coral ramificado: tubos con volumen dibujados como esferas iluminadas encadenadas.
function bakeBranchCoral(seed, size, color) {
  const c = canvas2(size, size), g = c.getContext('2d');
  const col = hex(color);
  const ball = (x, y, r, tip) => {
    const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    gr.addColorStop(0, `rgb(${col.map((v) => Math.min(255, v + 90)).join(',')})`);
    gr.addColorStop(0.45, `rgb(${col.join(',')})`);
    gr.addColorStop(1, `rgb(${col.map((v) => v * 0.35).join(',')})`);
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    if (tip) { g.fillStyle = `rgba(255,255,240,0.55)`; g.beginPath(); g.arc(x, y - r * 0.2, r * 0.5, 0, TAU); g.fill(); }
  };
  let k = 0;
  const branch = (x, y, ang, len, r, depth) => {
    const steps = Math.max(4, Math.round(len / (r * 0.28))); // esferas muy solapadas = tubo continuo
    let px = x, py = y;
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const a = ang + Math.sin(u * 3 + seed + depth) * 0.15;
      px += Math.cos(a) * len / steps; py += Math.sin(a) * len / steps;
      ball(px, py, r * (1 - u * 0.3), depth === 0 && i === steps);
    }
    if (depth > 0) {
      const n = 2 + (hash2(seed, k++) > 0.5 ? 1 : 0);
      for (let j = 0; j < n; j++) branch(px, py, ang + (j - (n - 1) / 2) * 0.6 + (hash2(seed, k++) - 0.5) * 0.3, len * 0.72, r * 0.72, depth - 1);
    }
  };
  for (let j = 0; j < 3; j++) branch(size / 2 + (j - 1) * size * 0.08, size * 0.98, -Math.PI / 2 + (j - 1) * 0.45, size * 0.26, size * 0.035, 3);
  return c;
}

// Tronco hundido con corteza.
function* bakeLog(seed, w, h) {
  const F = noiseFields();
  const c = canvas2(w, h), g = c.getContext('2d');
  const img = g.createImageData(w, h), d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = (y / h) * 2 - 1;
      const endCut = x < h * 0.25 ? Math.sqrt(Math.max(0, 1 - Math.pow((x - h * 0.25) / (h * 0.25), 2))) : 1;
      if (Math.abs(v) > endCut) continue;
      const sq = Math.sqrt(1 - v * v);
      const bark = sample(F.fbm, x * 0.25 + seed * 31, y * 2.5) ;
      const groove = sstep(0.35, 0.65, sample(F.fbm, x * 0.12, y * 4 + seed));
      const diff = Math.max(0, (-v * 0.75 + sq * 0.6) + 0.15);
      const i = (y * w + x) * 4;
      const moss = sstep(-0.2, -0.8, v) * sstep(0.5, 0.65, sample(F.fbm, x * 0.6, y * 0.6 + 70));
      const base = [92 + bark * 40, 70 + bark * 30, 45 + bark * 20];
      const mc = [70, 105, 40];
      for (let ch = 0; ch < 3; ch++) d[i + ch] = clamp(lerp(base[ch], mc[ch], moss) * (0.35 + 0.9 * diff) * (0.6 + 0.4 * groove), 0, 255);
      d[i + 3] = 255;
    }
    if ((y & 7) === 7) yield;
  }
  g.putImageData(img, 0, 0);
  // Anillos del corte.
  g.strokeStyle = 'rgba(60,40,20,0.6)';
  for (let r = h * 0.05; r < h * 0.5; r += h * 0.07) { g.beginPath(); g.ellipse(h * 0.25, h / 2, r * 0.5, r, 0, 0, TAU); g.stroke(); }
  return c;
}

// Pecio: silueta de barco hundido con niebla.
function bakeWreck(w, h) {
  const c = canvas2(w, h), g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, '#2b4a5e'); gr.addColorStop(1, '#0f2433');
  g.fillStyle = gr;
  g.beginPath();
  g.moveTo(w * 0.05, h * 0.55); g.lineTo(w * 0.9, h * 0.5); g.quadraticCurveTo(w * 0.99, h * 0.62, w * 0.92, h * 0.95);
  g.lineTo(w * 0.12, h * 0.98); g.quadraticCurveTo(w * 0.02, h * 0.8, w * 0.05, h * 0.55); g.fill();
  g.fillRect(w * 0.3, h * 0.38, w * 0.22, h * 0.14);
  g.save(); g.translate(w * 0.62, h * 0.5); g.rotate(-0.35); g.fillRect(-w * 0.008, -h * 0.5, w * 0.016, h * 0.5); g.restore();
  g.save(); g.translate(w * 0.38, h * 0.4); g.rotate(0.15); g.fillRect(-w * 0.006, -h * 0.35, w * 0.012, h * 0.35); g.restore();
  g.fillStyle = 'rgba(0,0,0,0.5)';
  for (let k = 0; k < 6; k++) { g.beginPath(); g.arc(w * (0.2 + k * 0.1), h * 0.68, h * 0.025, 0, TAU); g.fill(); }
  g.fillStyle = 'rgba(160,190,200,0.25)';
  g.beginPath(); g.moveTo(w * 0.05, h * 0.55); g.lineTo(w * 0.9, h * 0.5); g.lineTo(w * 0.9, h * 0.54); g.lineTo(w * 0.05, h * 0.59); g.fill();
  return c;
}

// Esqueleto de ballena (caída de ballena en la fosa).
function bakeBones(w, h) {
  const c = canvas2(w, h), g = c.getContext('2d');
  g.strokeStyle = '#8f8a7c'; g.lineCap = 'round';
  g.lineWidth = h * 0.06;
  g.beginPath(); g.moveTo(w * 0.05, h * 0.75); g.quadraticCurveTo(w * 0.5, h * 0.6, w * 0.95, h * 0.8); g.stroke();
  g.lineWidth = h * 0.035;
  for (let k = 0; k < 11; k++) { const x = w * (0.2 + k * 0.06); g.beginPath(); g.moveTo(x, h * 0.68); g.quadraticCurveTo(x - w * 0.03, h * 0.3, x + w * 0.02, h * 0.15 + (k % 3) * h * 0.05); g.stroke(); }
  g.fillStyle = '#868070'; g.beginPath(); g.ellipse(w * 0.1, h * 0.72, w * 0.08, h * 0.13, -0.2, 0, TAU); g.fill();
  const sh = g.createLinearGradient(0, 0, 0, h); sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.45)');
  g.globalCompositeOperation = 'source-atop'; g.fillStyle = sh; g.fillRect(0, 0, w, h);
  return c;
}

// Columnas de basalto hexagonales con caras iluminadas.
function bakeBasalt(seed, w, h) {
  const c = canvas2(w, h), g = c.getContext('2d');
  const n = 5;
  for (let k = 0; k < n; k++) {
    const cw = w / n, x = k * cw, ch = h * (0.45 + hash2(seed, k) * 0.55), y = h - ch;
    const faces = [['#4a3d37', 0, 0.35], ['#2d2420', 0.35, 0.8], ['#1a1412', 0.8, 1]];
    for (const [col, a, b] of faces) { g.fillStyle = col; g.fillRect(x + cw * a, y + cw * 0.12, cw * (b - a) + 0.5, ch); }
    g.fillStyle = '#5e4e46'; g.beginPath(); g.moveTo(x, y + cw * 0.12); g.lineTo(x + cw * 0.3, y); g.lineTo(x + cw * 0.85, y); g.lineTo(x + cw, y + cw * 0.12); g.lineTo(x + cw * 0.7, y + cw * 0.24); g.lineTo(x + cw * 0.15, y + cw * 0.24); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1;
    for (let j = 1; j < 4; j++) { const yy = y + cw * 0.12 + ch * j / 4 + hash2(seed, k * 7 + j) * 10; g.beginPath(); g.moveTo(x, yy); g.lineTo(x + cw, yy + 3); g.stroke(); }
  }
  return c;
}

// Fumarola hidrotermal.
function bakeVent(seed, w, h) {
  const c = canvas2(w, h), g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, w, 0);
  gr.addColorStop(0, '#3a3530'); gr.addColorStop(0.4, '#1d1a17'); gr.addColorStop(1, '#0a0908');
  g.fillStyle = gr;
  g.beginPath(); g.moveTo(w * 0.1, h); g.bezierCurveTo(w * 0.25, h * 0.6, w * 0.32, h * 0.25, w * 0.4, 0); g.lineTo(w * 0.6, 0); g.bezierCurveTo(w * 0.68, h * 0.3, w * 0.8, h * 0.6, w * 0.92, h); g.closePath(); g.fill();
  g.fillStyle = 'rgba(200,120,60,0.35)';
  for (let k = 0; k < 14; k++) { g.beginPath(); g.arc(w * (0.3 + hash2(seed, k) * 0.4), h * (0.1 + hash2(seed, k + 50) * 0.85), w * 0.03, 0, TAU); g.fill(); }
  return c;
}

// ---------- decoración por mundo ----------
const sprites = new Map(); // `${world}:${key}` -> canvas
function spriteKey(w, k) { return `${w}:${k}`; }
export function getSprite(w, k) { return sprites.get(spriteKey(w, k)); }

// Encola los horneados del mundo; `onDone` se llama cuando está todo listo.
export function prepareWorld(idx, quality = 1) {
  const tex = quality >= 2 ? 1.6 : quality <= 0.5 ? 0.6 : 1;
  const add = (k, gen) => { if (sprites.has(spriteKey(idx, k))) return; baker.add(gen, (c) => sprites.set(spriteKey(idx, k), c)); };
  const sync = (k, fn) => { if (!sprites.has(spriteKey(idx, k))) sprites.set(spriteKey(idx, k), fn()); };
  const mat = THEMES[idx].floor;
  if (!floorTiles.has(mat)) baker.add(bakeFloorTile(mat), (c) => floorTiles.set(mat, c));
  for (let r = 0; r < 4; r++) add(`rock${r}`, bakeRock(idx, r * 17 + idx * 101, Math.round(260 * tex), Math.round(170 * tex)));
  if (idx === 0) {
    add('brain0', bakeBrainCoral(3, Math.round(220 * tex), Math.round(130 * tex), '#b89a5a'));
    add('brain1', bakeBrainCoral(7, Math.round(220 * tex), Math.round(130 * tex), '#7f9a55'));
    ['#ff6f8a', '#ff9b45', '#b07ae6', '#ffd24a'].forEach((col, i) => sync(`branch${i}`, () => bakeBranchCoral(i * 13 + 5, Math.round(300 * tex), col)));
  }
  if (idx === 1) { add('log0', bakeLog(1, Math.round(420 * tex), Math.round(70 * tex))); add('log1', bakeLog(2, Math.round(300 * tex), Math.round(56 * tex))); }
  if (idx === 2) sync('wreck', () => bakeWreck(Math.round(900 * tex), Math.round(380 * tex)));
  if (idx === 3) { sync('bones', () => bakeBones(Math.round(700 * tex), Math.round(240 * tex))); for (let v = 0; v < 2; v++) sync(`vent${v}`, () => bakeVent(v, Math.round(160 * tex), Math.round(380 * tex))); }
  if (idx === 4) for (let b = 0; b < 2; b++) sync(`basalt${b}`, () => bakeBasalt(b + 3, Math.round(360 * tex), Math.round(420 * tex)));
}

const decorCache = new Map();
// Lista determinista de elementos decorativos (coordenadas de mundo).
export function decorFor(idx) {
  if (decorCache.has(idx)) return decorCache.get(idx);
  const w = WORLDS[idx], items = [];
  const S = [1, 1.4, 2.2, 2.3, 2.6][idx]; // escala de los objetos según el tamaño del mundo
  const put = (kind, x, extra = {}) => items.push({ kind, x, y: floorAt(idx, x), s: S * (0.7 + hash2(items.length, 7, idx) * 0.7), seed: items.length * 13 + idx, ...extra });
  const n = Math.round(w.size.w / (idx === 2 ? 260 : 120));
  for (let i = 0; i < n; i++) {
    const x = (i + hash2(i, 1, idx)) / n * w.size.w;
    const r = hash2(i, 2, idx);
    if (idx === 0) put(r < 0.22 ? 'rock' : r < 0.38 ? 'brain' : r < 0.6 ? 'branch' : r < 0.72 ? 'fan' : r < 0.84 ? 'anemone' : 'grass', x);
    else if (idx === 1) put(r < 0.25 ? 'rock' : r < 0.36 ? 'log' : r < 0.75 ? 'reed' : 'weed', x);
    else if (idx === 2) put(r < 0.5 ? 'rock' : r < 0.65 ? 'fan' : 'grass', x);
    else if (idx === 3) put(r < 0.3 ? 'rock' : r < 0.45 ? 'vent' : r < 0.75 ? 'worms' : 'glowmat', x);
    else put(r < 0.12 ? 'basalt' : r < 0.6 ? 'kelp' : r < 0.85 ? 'rock' : 'table', x);
  }
  if (idx === 2) put('wreck', w.size.w * 0.55, { s: 1 });
  if (idx === 3) put('bones', w.size.w * 0.45, { s: 1 });
  // Elementos de superficie del lago.
  if (idx === 1) for (let i = 0; i < 26; i++) items.push({ kind: i % 3 ? 'lily' : 'roots', x: (i + hash2(i, 9, 1)) / 26 * w.size.w, y: 0, s: 1 + hash2(i, 5, 1) * 0.8, seed: i * 7 });
  items.sort((a, b) => a.x - b.x);
  decorCache.set(idx, items);
  return items;
}

// ---------- dibujo ----------
// cam: { x, y, zoom, W, H } en coordenadas de mundo; sx/sy convierten a pantalla.
export function makeView(cam) {
  return {
    ...cam,
    sx: (x) => (x - cam.x) * cam.zoom + cam.W / 2,
    sy: (y) => (y - cam.y) * cam.zoom + cam.H / 2,
  };
}

export function drawWaterBody(ctx, idx, v) {
  const w = WORLDS[idx], th = THEMES[idx];
  const y0 = v.sy(0), y1 = v.sy(w.size.h);
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  for (const [f, c] of th.water) g.addColorStop(f, c);
  ctx.fillStyle = g;
  ctx.fillRect(0, Math.max(0, y0), v.W, v.H);
}

// Cielo, sol, nubes y orilla (solo si la superficie está en pantalla).
export function drawSky(ctx, idx, v, t) {
  const sy = v.sy(0);
  if (sy <= 0) return;
  const th = THEMES[idx];
  const g = ctx.createLinearGradient(0, 0, 0, sy);
  g.addColorStop(0, th.sky[0]); g.addColorStop(1, th.sky[1]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, v.W, sy);
  // Sol con halo.
  const sx = v.W * 0.78 - v.x * v.zoom * 0.02, sY = sy - Math.min(sy * 0.6, 160);
  const halo = ctx.createRadialGradient(sx, sY, 0, sx, sY, 220);
  halo.addColorStop(0, rgba(th.sun, 0.9)); halo.addColorStop(0.12, rgba(th.sun, 0.5)); halo.addColorStop(1, rgba(th.sun, 0));
  ctx.fillStyle = halo; ctx.fillRect(sx - 220, sY - 220, 440, 440);
  // Orilla / horizonte según el mundo.
  const base = sy - 2;
  const par = (k) => -v.x * v.zoom * k;
  if (th.shore === 'islands') {
    ctx.fillStyle = 'rgba(70,120,140,0.55)';
    for (let i = 0; i < 4; i++) { const x = ((i * 420 + par(0.05)) % 1700 + 1700) % 1700 - 300; ctx.beginPath(); ctx.ellipse(x, base, 150 + i * 30, 26 + i * 6, 0, Math.PI, TAU); ctx.fill(); }
    ctx.strokeStyle = 'rgba(40,80,60,0.7)'; ctx.lineWidth = 3;
    for (let i = 0; i < 4; i++) { const x = ((i * 420 + par(0.05)) % 1700 + 1700) % 1700 - 300; ctx.beginPath(); ctx.moveTo(x, base - 24); ctx.quadraticCurveTo(x + 8, base - 60, x + 20, base - 70); ctx.stroke(); }
  } else if (th.shore === 'forest') {
    for (const [k, col, hgt] of [[0.04, 'rgba(90,120,100,0.6)', 70], [0.08, 'rgba(45,70,45,0.85)', 46]]) {
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, base);
      for (let x = 0; x <= v.W + 20; x += 18) { const wx = x - par(k); ctx.lineTo(x, base - hgt - Math.sin(wx * 0.013) * 14 - Math.abs(Math.sin(wx * 0.07)) * 16); }
      ctx.lineTo(v.W, base); ctx.closePath(); ctx.fill();
    }
  } else if (th.shore === 'volcano') {
    const x = v.W * 0.3 + par(0.03);
    ctx.fillStyle = 'rgba(60,30,25,0.85)'; ctx.beginPath(); ctx.moveTo(x - 280, base); ctx.lineTo(x - 50, base - 150); ctx.lineTo(x + 40, base - 150); ctx.lineTo(x + 300, base); ctx.fill();
    const lava = ctx.createRadialGradient(x, base - 150, 0, x, base - 150, 120);
    lava.addColorStop(0, 'rgba(255,140,40,0.8)'); lava.addColorStop(1, 'rgba(255,90,20,0)');
    ctx.fillStyle = lava; ctx.fillRect(x - 120, base - 270, 240, 240);
    ctx.fillStyle = 'rgba(70,55,55,0.35)';
    for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(x + Math.sin(t * 0.2 + i) * 30 + i * 18, base - 190 - i * 28 - (t * 6 % 40), 36 + i * 9, 0, TAU); ctx.fill(); }
  }
}

// Fondo marino texturizado con borde iluminado y cáusticas.
export function drawFloor(ctx, idx, v, t, { caustics, quality = 1 } = {}) {
  const w = WORLDS[idx], th = THEMES[idx];
  const x0 = v.x - v.W / 2 / v.zoom - 40, x1 = v.x + v.W / 2 / v.zoom + 40;
  const step = Math.max(6, 14 / v.zoom);
  const pts = [];
  for (let x = x0; x <= x1; x += step) pts.push([v.sx(x), v.sy(floorAt(idx, x))]);
  const minY = Math.min(...pts.map((p) => p[1]));
  if (minY > v.H) return;
  const path = () => { ctx.beginPath(); ctx.moveTo(pts[0][0], v.H + 10); for (const p of pts) ctx.lineTo(p[0], p[1]); ctx.lineTo(pts[pts.length - 1][0], v.H + 10); ctx.closePath(); };
  const tile = floorTiles.get(th.floor);
  path();
  if (tile) {
    const pat = ctx.createPattern(tile, 'repeat');
    const sc = (180 * v.zoom * [1, 1.2, 2.6, 3, 3.6][idx]) / TS;
    pat.setTransform(new DOMMatrix().translate(v.sx(0), v.sy(0)).scale(sc, sc));
    ctx.fillStyle = pat;
  } else ctx.fillStyle = FLOOR_MAT[th.floor].dark;
  ctx.fill();
  // Profundidad del corte del lecho: más oscuro hacia abajo.
  path();
  const g = ctx.createLinearGradient(0, minY, 0, minY + 260 * Math.max(0.6, v.zoom));
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, rgba(th.vignette, 0.75));
  ctx.fillStyle = g; ctx.fill();
  // Cáusticas sobre el lecho (solo donde llega la luz).
  if (caustics && th.caustic > 0.02) {
    const depthK = 1 - clamp(floorAt(idx, v.x) / w.size.h, 0, 1) * 0.6;
    ctx.save(); path(); ctx.clip();
    caustics(ctx, { rect: { x: 0, y: minY - 10, w: v.W, h: v.H - minY + 20 }, t, worldX: v.x - v.W / 2 / v.zoom, worldY: v.y - v.H / 2 / v.zoom, zoom: v.zoom, scale: 240 * [1, 1.2, 2.4, 3, 3.4][idx], alpha: th.caustic * depthK * (quality > 0 ? 1 : 0) });
    ctx.restore();
  }
  // Borde superior iluminado.
  ctx.strokeStyle = rgba(th.light, 0.35); ctx.lineWidth = Math.max(1, 2 * Math.min(1.5, v.zoom));
  ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke();
}

// Vegetación y objetos del fondo. layer: 'back' (detrás de las criaturas) o 'front'.
export function drawDecor(ctx, idx, v, t, layer = 'back', quality = 1) {
  const items = decorFor(idx);
  const margin = 700 / v.zoom;
  const xa = v.x - v.W / 2 / v.zoom - margin, xb = v.x + v.W / 2 / v.zoom + margin;
  for (const it of items) {
    if (it.x < xa || it.x > xb) continue;
    const front = (it.seed % 5 === 0) && (it.kind === 'grass' || it.kind === 'weed' || it.kind === 'reed' || it.kind === 'kelp');
    if ((layer === 'front') !== front) continue;
    const x = v.sx(it.x), y = v.sy(it.y), z = v.zoom * it.s;
    if (y < -900 * z || (it.kind !== 'lily' && it.kind !== 'roots' && y > v.H + 400 * z)) continue;
    drawItem(ctx, idx, it, x, y, z, t, v, quality, front);
  }
}

function sprite(ctx, img, x, y, w, h, ax = 0.5, ay = 1) { if (img) ctx.drawImage(img, x - w * ax, y - h * ay, w, h); }

function blade(ctx, x, y, h, w, sway, c0, c1, curl = 0) {
  const g = ctx.createLinearGradient(x, y, x, y - h);
  g.addColorStop(0, c0); g.addColorStop(1, c1);
  ctx.fillStyle = g;
  const tx = x + sway * h * 0.35 + curl * h * 0.2, ty = y - h;
  ctx.beginPath(); ctx.moveTo(x - w / 2, y);
  ctx.quadraticCurveTo(x - w * 0.3 + sway * h * 0.15, y - h * 0.55, tx, ty);
  ctx.quadraticCurveTo(x + w * 0.3 + sway * h * 0.15, y - h * 0.5, x + w / 2, y);
  ctx.closePath(); ctx.fill();
}

function drawItem(ctx, idx, it, x, y, z, t, v, quality, front) {
  const sw = (k = 1) => Math.sin(t * 0.9 * k + it.seed) * 0.5 + Math.sin(t * 0.37 + it.seed * 2) * 0.3;
  switch (it.kind) {
    case 'rock': { const img = getSprite(idx, `rock${it.seed % 4}`); sprite(ctx, img, x, y + 16 * z, 260 * z * 0.75, 170 * z * 0.75); break; }
    case 'brain': sprite(ctx, getSprite(0, `brain${it.seed % 2}`), x, y + 6 * z, 120 * z, 70 * z); break;
    case 'branch': sprite(ctx, getSprite(0, `branch${it.seed % 4}`), x, y + 8 * z, 150 * z, 150 * z); break;
    case 'fan': {
      ctx.save(); ctx.translate(x, y); ctx.rotate(sw(0.6) * 0.06);
      const col = idx === 0 ? ['#c24a8a', '#ff7fbf'] : ['#5a6f8a', '#8fb1d6'];
      ctx.strokeStyle = col[0]; ctx.lineCap = 'round';
      for (let k = 0; k < 9; k++) { const a = -Math.PI / 2 + (k - 4) * 0.17; ctx.lineWidth = Math.max(0.6, 2.2 * z); ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(Math.cos(a) * 40 * z, Math.sin(a) * 50 * z, Math.cos(a) * 75 * z, Math.sin(a) * 95 * z); ctx.stroke(); }
      ctx.strokeStyle = col[1]; ctx.globalAlpha = 0.6; ctx.lineWidth = Math.max(0.5, 1 * z);
      for (let r = 30; r <= 90; r += 15) { ctx.beginPath(); ctx.arc(0, 0, r * z, -Math.PI / 2 - 0.75, -Math.PI / 2 + 0.75); ctx.stroke(); }
      ctx.restore(); break;
    }
    case 'anemone': {
      ctx.save(); ctx.translate(x, y);
      const base = ctx.createRadialGradient(-6 * z, -16 * z, 2, 0, -8 * z, 26 * z);
      base.addColorStop(0, '#ffb070'); base.addColorStop(1, '#a8452a');
      ctx.fillStyle = base; ctx.beginPath(); ctx.ellipse(0, -8 * z, 22 * z, 14 * z, 0, 0, TAU); ctx.fill();
      for (let k = 0; k < 22; k++) {
        const a = -Math.PI + (k / 21) * Math.PI, l = (28 + (k % 4) * 6) * z;
        const s = Math.sin(t * 1.4 + k * 0.6) * 0.35;
        const g = ctx.createLinearGradient(0, -14 * z, 0, -14 * z - l);
        g.addColorStop(0, '#ff8a5a'); g.addColorStop(1, '#ffe0b0');
        ctx.strokeStyle = g; ctx.lineWidth = Math.max(0.6, 4 * z); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(Math.cos(a) * 14 * z, -12 * z + Math.sin(a) * 4 * z);
        ctx.quadraticCurveTo(Math.cos(a + s) * l * 0.6, -14 * z - l * 0.6, Math.cos(a + s * 2) * l * 0.85, -14 * z - l * 0.9 * (0.6 + 0.4 * Math.abs(Math.sin(a))));
        ctx.stroke();
      }
      ctx.restore(); break;
    }
    case 'grass': case 'weed': {
      const n = 7, c0 = idx === 1 ? '#1f3a18' : '#1f5a3a', c1 = idx === 1 ? '#5f8a3a' : '#7fc06a';
      for (let k = 0; k < n; k++) blade(ctx, x + (k - n / 2) * 6 * z, y + 4 * z, (60 + (k * 13) % 40) * z * (front ? 1.3 : 1), 5 * z, sw(1 + k * 0.1), c0, c1, (k - n / 2) * 0.1);
      break;
    }
    case 'reed': {
      const top = Math.min(v.sy(0) + 40 * v.zoom, y - 80 * z);
      const h = y - top;
      for (let k = 0; k < 4; k++) {
        const bx = x + (k - 1.5) * 9 * z, s = sw(0.5 + k * 0.1) * 0.15;
        ctx.strokeStyle = k % 2 ? '#3d5a24' : '#56743a'; ctx.lineWidth = Math.max(0.8, 3.5 * z); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(bx, y + 4 * z); ctx.quadraticCurveTo(bx + s * h * 0.3, y - h * 0.5, bx + s * h * 0.5, y - h - 20 * z * k); ctx.stroke();
      }
      break;
    }
    case 'log': { const img = getSprite(1, `log${it.seed % 2}`); if (img) { ctx.save(); ctx.translate(x, y - 10 * z); ctx.rotate(((it.seed % 7) - 3) * 0.04); ctx.drawImage(img, -img.width / 2 * z * 0.6, -img.height * z * 0.6, img.width * z * 0.6, img.height * z * 0.6); ctx.restore(); } break; }
    case 'lily': {
      const sy0 = v.sy(0);
      ctx.strokeStyle = 'rgba(40,70,30,0.7)'; ctx.lineWidth = Math.max(0.8, 2.5 * v.zoom * it.s);
      ctx.beginPath(); ctx.moveTo(x, sy0 + 6 * v.zoom); ctx.quadraticCurveTo(x + Math.sin(t * 0.5 + it.seed) * 30 * v.zoom, sy0 + 260 * v.zoom, x - 10 * v.zoom, v.sy(floorAt(1, it.x))); ctx.stroke();
      const r = 44 * v.zoom * it.s;
      const g = ctx.createRadialGradient(x, sy0 + 4 * v.zoom, r * 0.2, x, sy0 + 4 * v.zoom, r);
      g.addColorStop(0, 'rgba(20,45,20,0.95)'); g.addColorStop(0.85, 'rgba(35,70,30,0.9)'); g.addColorStop(1, 'rgba(160,220,120,0.9)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, sy0 + 4 * v.zoom, r, r * 0.16, 0, 0, TAU); ctx.fill();
      break;
    }
    case 'roots': {
      const sy0 = v.sy(0);
      ctx.strokeStyle = 'rgba(30,24,16,0.55)'; ctx.lineCap = 'round';
      for (let k = 0; k < 6; k++) { ctx.lineWidth = Math.max(1, (7 - k) * v.zoom * it.s); ctx.beginPath(); ctx.moveTo(x + k * 12 * v.zoom, sy0); ctx.bezierCurveTo(x + (k - 3) * 40 * v.zoom, sy0 + 120 * v.zoom, x + (k - 2) * 50 * v.zoom, sy0 + 200 * v.zoom, x + (k - 3) * 30 * v.zoom, sy0 + (250 + k * 30) * v.zoom); ctx.stroke(); }
      break;
    }
    case 'wreck': sprite(ctx, getSprite(2, 'wreck'), x, y + 40 * v.zoom, 900 * v.zoom * 3.2, 380 * v.zoom * 3.2); break;
    case 'bones': sprite(ctx, getSprite(3, 'bones'), x, y + 10 * v.zoom, 700 * v.zoom * 3, 240 * v.zoom * 3); break;
    case 'vent': {
      const img = getSprite(3, `vent${it.seed % 2}`);
      const w = 160 * z * 0.7, h = 380 * z * 0.7;
      sprite(ctx, img, x, y + 10 * z, w, h);
      // Columna de humo negro con brillo cálido en la base.
      const base = y - h + 14 * z;
      ctx.save();
      for (let k = 0; k < 10; k++) {
        const u = ((t * 0.18 + k / 10) % 1), r = (18 + u * 70) * z;
        const px = x + Math.sin(t * 0.7 + k) * 10 * z * u, py = base - u * 420 * z;
        const g = ctx.createRadialGradient(px, py, 0, px, py, r);
        g.addColorStop(0, `rgba(10,10,12,${0.55 * (1 - u)})`); g.addColorStop(1, 'rgba(10,10,12,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, r, 0, TAU); ctx.fill();
      }
      ctx.globalCompositeOperation = 'lighter';
      const glow = ctx.createRadialGradient(x, base, 0, x, base, 60 * z);
      glow.addColorStop(0, 'rgba(255,140,60,0.5)'); glow.addColorStop(1, 'rgba(255,90,20,0)');
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, base, 60 * z, 0, TAU); ctx.fill();
      ctx.restore(); break;
    }
    case 'worms': {
      // Gusanos tubícolas: tubos anillados beige y penachos rojos plumosos que se mecen.
      for (let k = 0; k < 6; k++) {
        const bx = x + (k - 3) * 7 * z + Math.sin(k * 2.3) * 4 * z, h = (34 + (k * 17) % 30) * z, s = Math.sin(t * 0.8 + k) * 2.5 * z;
        const g = ctx.createLinearGradient(bx - 2.5 * z, 0, bx + 2.5 * z, 0);
        g.addColorStop(0, '#6e6658'); g.addColorStop(0.4, '#c9c0a8'); g.addColorStop(1, '#5a5348');
        ctx.strokeStyle = g; ctx.lineWidth = Math.max(0.8, 4.2 * z); ctx.lineCap = 'butt';
        ctx.beginPath(); ctx.moveTo(bx, y + 4 * z); ctx.quadraticCurveTo(bx + s * 0.5, y - h * 0.5, bx + s, y - h); ctx.stroke();
        ctx.strokeStyle = 'rgba(60,55,45,0.5)'; ctx.lineWidth = Math.max(0.5, 0.6 * z);
        for (let r = 1; r < 6; r++) { const yy = y - h * r / 6; ctx.beginPath(); ctx.moveTo(bx - 2 * z, yy); ctx.lineTo(bx + 2 * z, yy - 0.6 * z); ctx.stroke(); }
        ctx.strokeStyle = '#c4243a'; ctx.lineWidth = Math.max(0.5, 1.1 * z); ctx.lineCap = 'round';
        for (let f = 0; f < 9; f++) {
          const a = -Math.PI / 2 + (f - 4) * 0.22 + Math.sin(t * 1.3 + k + f) * 0.08, l = (7 + (f % 3) * 2) * z;
          ctx.beginPath(); ctx.moveTo(bx + s, y - h); ctx.quadraticCurveTo(bx + s + Math.cos(a) * l * 0.5, y - h + Math.sin(a) * l * 0.6, bx + s + Math.cos(a) * l, y - h + Math.sin(a) * l); ctx.stroke();
        }
      }
      break;
    }
    case 'glowmat': {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 14; k++) {
        const px = x + (hash2(it.seed, k) - 0.5) * 160 * z, py = y - hash2(it.seed, k + 30) * 10 * z;
        const r = (4 + hash2(it.seed, k + 60) * 8) * z * (0.7 + 0.3 * Math.sin(t * 2 + k));
        const g = ctx.createRadialGradient(px, py, 0, px, py, r * 3);
        g.addColorStop(0, 'rgba(120,255,230,0.8)'); g.addColorStop(1, 'rgba(60,200,255,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, r * 3, 0, TAU); ctx.fill();
      }
      ctx.restore(); break;
    }
    case 'basalt': ctx.save(); ctx.globalAlpha = 0.9; sprite(ctx, getSprite(4, `basalt${it.seed % 2}`), x, y + 20 * z, 360 * z * 0.45, 420 * z * 0.45); ctx.restore(); break;
    case 'table': {
      // Coral de placas escalonadas (antiguo), cada placa con borde iluminado.
      ctx.save(); ctx.translate(x, y);
      for (let k = 0; k < 4; k++) {
        const py = -10 * z - k * 16 * z, rx = (46 - k * 8) * z, ox = Math.sin(k * 1.7) * 10 * z;
        const g = ctx.createLinearGradient(0, py - 6 * z, 0, py + 6 * z);
        g.addColorStop(0, '#c9b47a'); g.addColorStop(0.4, '#8f7a48'); g.addColorStop(1, '#3e3220');
        ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(ox, py, rx, 6 * z, 0, 0, TAU); ctx.fill();
      }
      ctx.restore(); break;
    }
    case 'kelp': {
      const top = Math.max(v.sy(0) + 30 * v.zoom, y - 1400 * z);
      const h = y - top, segs = 14;
      const sway = (u) => Math.sin(t * 0.6 + it.seed + u * 2.5) * h * 0.06 * u;
      ctx.strokeStyle = front ? '#2d4a1c' : '#3e6a2a'; ctx.lineWidth = Math.max(1, 2.6 * z); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x, y + 6 * z);
      for (let s = 1; s <= segs; s++) { const u = s / segs; ctx.lineTo(x + sway(u), y - h * u); }
      ctx.stroke();
      // Láminas largas y estrechas, translúcidas en la punta, con vejiga de gas en la base.
      for (let s = 1; s <= segs * 2; s++) {
        const u = s / (segs * 2), px = x + sway(u), py = y - h * u, side = s % 2 ? 1 : -1;
        const len = 44 * z, ang = -Math.PI / 2 + side * (0.75 + Math.sin(t * 0.9 + s) * 0.12);
        const ex = px + Math.cos(ang) * len, ey = py + Math.sin(ang) * len;
        const g = ctx.createLinearGradient(px, py, ex, ey);
        g.addColorStop(0, front ? '#33501c' : '#5a7f2c'); g.addColorStop(1, front ? 'rgba(70,100,35,0.55)' : 'rgba(170,200,90,0.5)');
        ctx.fillStyle = g;
        const nx = -Math.sin(ang) * 3.2 * z, ny = Math.cos(ang) * 3.2 * z;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.quadraticCurveTo((px + ex) / 2 + nx, (py + ey) / 2 + ny, ex, ey); ctx.quadraticCurveTo((px + ex) / 2 - nx, (py + ey) / 2 - ny, px, py); ctx.fill();
        if (s % 4 === 0) { const b = ctx.createRadialGradient(px - z, py - z, 0, px, py, 3.5 * z); b.addColorStop(0, '#d8c870'); b.addColorStop(1, '#6a5a20'); ctx.fillStyle = b; ctx.beginPath(); ctx.arc(px, py, 3.5 * z, 0, TAU); ctx.fill(); }
      }
      break;
    }
    default: break;
  }
}

// ---------- panorama lejano desenfocado (profundidad de campo) ----------
const panoCache = new Map();
function panorama(idx, layer) {
  const key = `${idx}:${layer}`;
  if (panoCache.has(key)) return panoCache.get(key);
  const W = 1600, H = 420;
  const raw = canvas2(W, H), g = raw.getContext('2d');
  const th = THEMES[idx];
  const deep = th.water[Math.min(th.water.length - 1, 2)][1];
  g.fillStyle = rgba(deep, layer ? 0.75 : 0.55);
  g.beginPath(); g.moveTo(0, H);
  for (let x = 0; x <= W; x += 20) {
    const n = Math.sin(x * 0.006 + layer * 2 + idx) * 0.5 + Math.sin(x * 0.019 + idx * 3) * 0.3 + Math.sin(x * 0.047) * 0.2;
    const peak = idx === 3 ? 0.75 : idx === 4 ? 0.55 : 0.4;
    g.lineTo(x, H - (H * 0.25 + n * H * 0.2) - (hash2(Math.floor(x / 160), layer, idx) > 0.8 ? H * peak * 0.5 : 0));
  }
  g.lineTo(W, H); g.closePath(); g.fill();
  // Siluetas propias del mundo.
  g.fillStyle = rgba(deep, layer ? 0.85 : 0.6);
  for (let k = 0; k < 9; k++) {
    const x = (k + 0.5) * W / 9, b = H * 0.72;
    if (idx === 0) { for (let j = 0; j < 5; j++) { g.beginPath(); g.arc(x + j * 14 - 28, b - 30 - j * 6, 18 + j * 3, 0, TAU); g.fill(); } }
    else if (idx === 1 || idx === 4) { g.fillRect(x - 3, b - 220, 6, 220); for (let j = 0; j < 6; j++) { g.beginPath(); g.ellipse(x + (j % 2 ? 18 : -18), b - 40 - j * 32, 20, 6, 0, 0, TAU); g.fill(); } }
    else if (idx === 3) { g.beginPath(); g.moveTo(x - 30, b); g.lineTo(x - 8, b - 260); g.lineTo(x + 12, b - 200); g.lineTo(x + 34, b); g.fill(); }
  }
  const out = canvas2(W, H), o = out.getContext('2d');
  o.filter = `blur(${layer ? 3 : 7}px)`;
  o.drawImage(raw, 0, 0);
  panoCache.set(key, out);
  return out;
}

export function drawBackdrop(ctx, idx, v) {
  const floorY = v.sy(floorAt(idx, v.x));
  if (floorY < -200) return;
  for (const [layer, par, scale, lift] of [[0, 0.18, 1.25, 120], [1, 0.42, 1.0, 40]]) {
    const img = panorama(idx, layer);
    const w = img.width * scale, h = img.height * scale;
    const ox = ((-v.x * v.zoom * par) % w + w) % w;
    const y = floorY - h + lift;
    for (let x = -ox - w; x < v.W + w; x += w) ctx.drawImage(img, x, y, w, h);
  }
}

// Factor de profundidad de la cámara (0 en superficie, 1 en el fondo).
export function depthK(idx, camY) { return clamp(camY / WORLDS[idx].size.h, 0, 1); }
export { floorTiles };
