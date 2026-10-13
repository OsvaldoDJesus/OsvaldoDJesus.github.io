// Agua realista en espacio de pantalla: volumen con gradiente de profundidad, neblina volumétrica,
// rayos de luz texturizados, cáusticas animadas en bucle, superficie vista desde abajo,
// absorción de color con la profundidad, nieve marina y partículas desenfocadas (bokeh).
import { noiseFields, sample, TS, canvas2, hash2 } from './texture.mjs';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
export const rgba = (h, a) => { const c = hex(h); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; };

// ---------- cáusticas: N fotogramas enlosables que forman un bucle ----------
let causticFrames = null;
export function caustics(N = 12) {
  if (causticFrames) return causticFrames;
  const F = noiseFields();
  causticFrames = [];
  for (let k = 0; k < N; k++) {
    const ph = (k / N) * TAU;
    const c = canvas2(TS, TS), g = c.getContext('2d');
    const img = g.createImageData(TS, TS), d = img.data;
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      // Doble deformación del dominio: bordes de celda curvos y vivos, como la luz enfocada por las olas.
      const a = sample(F.fbm, x * 0.5, y * 0.5) * TAU, b = sample(F.fbm, x * 0.5 + 97, y * 0.5 + 41) * TAU;
      const wx = Math.sin(ph + a) * 13 + Math.sin(ph * 2 + b) * 5, wy = Math.cos(ph + b) * 13 + Math.cos(ph * 2 + a) * 5;
      const e1 = sample(F.edge, x + wx, y + wy);
      const e2 = sample(F.edge, x * 2 + wy * 1.6 + 31, y * 2 - wx * 1.6 + 17);
      const v = Math.exp(-e1 * 38) * 0.9 + Math.exp(-e1 * 10) * 0.25 + Math.exp(-e2 * 30) * 0.3;
      const i = (y * TS + x) * 4;
      d[i] = 255; d[i + 1] = 255; d[i + 2] = 255; d[i + 3] = clamp(v, 0, 1) * 255;
    }
    g.putImageData(img, 0, 0);
    causticFrames.push(c);
  }
  return causticFrames;
}

// Rellena un rectángulo con cáusticas animadas ancladas al mundo (mezcla entre fotogramas).
export function drawCaustics(ctx, { rect, t, worldX, worldY, zoom, scale = 320, alpha = 0.3, tint = '#ffffff' }) {
  const frames = caustics();
  const f = (t * 7) % frames.length, i0 = Math.floor(f), i1 = (i0 + 1) % frames.length, k = f - i0;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const s = (scale * zoom) / TS;
  for (const [idx, a] of [[i0, 1 - k], [i1, k]]) {
    const pat = ctx.createPattern(frames[idx], 'repeat');
    if (!pat || !pat.setTransform) continue;
    pat.setTransform(new DOMMatrix().translate(-worldX * zoom, -worldY * zoom).scale(s, s));
    ctx.globalAlpha = alpha * a;
    ctx.fillStyle = pat;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  }
  if (tint !== '#ffffff') { ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = 1; ctx.fillStyle = tint; }
  ctx.restore();
}

// ---------- textura de rayos de luz (vetas verticales) ----------
let rayTex = null;
function rays() {
  if (rayTex) return rayTex;
  const F = noiseFields();
  const W = 512, H = 512;
  const c = canvas2(W, H), g = c.getContext('2d');
  const img = g.createImageData(W, H), d = img.data;
  for (let x = 0; x < W; x++) {
    const n = sample(F.fbm, x * 0.5, 7) ;
    const streak = Math.pow(sstep(0.45, 0.85, n), 1.5) * 0.8 + Math.pow(sstep(0.5, 0.95, sample(F.fine, x * 0.5, 31)), 2) * 0.4;
    for (let y = 0; y < H; y++) {
      const fall = Math.exp(-y / H * 2.4) * (0.75 + 0.25 * sample(F.fbm, x * 0.25, y * 0.08 + 13));
      const i = (y * W + x) * 4;
      d[i] = 255; d[i + 1] = 255; d[i + 2] = 255; d[i + 3] = clamp(streak * fall, 0, 1) * 255;
    }
  }
  g.putImageData(img, 0, 0);
  rayTex = c;
  return c;
}

// Rayos desde la superficie (sy) hacia abajo, inclinados, en dos capas que se deslizan.
export function drawGodRays(ctx, { W, H, sy, t, camX, zoom, color = '#e6fbff', alpha = 0.22, length = 1100, slant = 0.32 }) {
  if (alpha <= 0.005) return;
  const tex = rays();
  const len = length * zoom;
  if (sy + len < 0 || sy > H) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const [layer, speed, sc, a] of [[0, 9, 1.0, 1], [1, -6, 1.6, 0.6]]) {
    const tw = 900 * sc;
    const off = ((-camX * zoom * 0.25 + t * speed + layer * 333) % tw + tw) % tw;
    ctx.save();
    ctx.setTransform(ctx.getTransform().multiply(new DOMMatrix([1, 0, -slant, 1, 0, 0])));
    ctx.globalAlpha = alpha * a;
    for (let x = -off - tw; x < W + tw + len * slant; x += tw) ctx.drawImage(tex, x + sy * slant, sy, tw, len);
    ctx.restore();
  }
  ctx.restore();
  void color;
}

// ---------- neblina volumétrica ----------
const hazeCache = new Map();
function haze(color) {
  if (hazeCache.has(color)) return hazeCache.get(color);
  const F = noiseFields();
  const W = 512, H = 256, c = canvas2(W, H), g = c.getContext('2d');
  const img = g.createImageData(W, H), d = img.data, col = hex(color);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = sample(F.fbm, x * 0.5, y * 0.5 + 50);
    const a = sstep(0.35, 0.8, v);
    const i = (y * W + x) * 4;
    d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = a * 255;
  }
  g.putImageData(img, 0, 0);
  hazeCache.set(color, c);
  return c;
}
export function drawHaze(ctx, { W, H, t, camX, camY, zoom, color, alpha = 0.12 }) {
  const tex = haze(color);
  ctx.save();
  ctx.globalAlpha = alpha;
  for (const [par, sp, sc] of [[0.12, 4, 2.2], [0.3, -7, 1.4]]) {
    const tw = 512 * sc * 1.6, th = 256 * sc * 1.6;
    const ox = ((-camX * zoom * par + t * sp) % tw + tw) % tw, oy = ((-camY * zoom * par * 0.6) % th + th) % th;
    for (let x = -ox - tw; x < W; x += tw) for (let y = -oy - th; y < H; y += th) ctx.drawImage(tex, x, y, tw, th);
  }
  ctx.restore();
}

// ---------- superficie vista desde abajo ----------
export function surfaceWave(x, t, amp = 1) {
  return (Math.sin(x * 0.011 + t * 1.3) * 5 + Math.sin(x * 0.027 - t * 1.9) * 2.6 + Math.sin(x * 0.0043 + t * 0.6) * 8) * amp;
}
export function drawSurfaceUnder(ctx, { W, sy, t, zoom, camX, light = '#cdf6ff', amp = 1 }) {
  if (sy < -80 || sy > 800) return;
  const step = 10;
  const wy = (x) => sy + surfaceWave((x - W / 2) / zoom + camX, t, amp) * zoom;
  ctx.save();
  // Lámina luminosa ondulada justo bajo la superficie (luz que atraviesa las olas).
  ctx.beginPath();
  for (let x = -20; x <= W + 20; x += step) { const y = wy(x); if (x === -20) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
  ctx.lineTo(W + 20, sy + 220 * zoom); ctx.lineTo(-20, sy + 220 * zoom); ctx.closePath();
  const g = ctx.createLinearGradient(0, sy, 0, sy + 220 * zoom);
  g.addColorStop(0, rgba(light, 0.55)); g.addColorStop(0.15, rgba(light, 0.18)); g.addColorStop(1, rgba(light, 0));
  ctx.fillStyle = g; ctx.fill();
  // Destellos de las crestas.
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = Math.max(1, 1.6 * Math.min(2, zoom));
  ctx.beginPath();
  for (let x = -20; x <= W + 20; x += step) { const y = wy(x); if (x === -20) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
  ctx.stroke();
  for (let i = 0; i < 40; i++) {
    const wx = Math.floor(camX / 300) * 300 + (i - 20) * 37 + hash2(i, Math.floor(camX / 300)) * 37;
    const x = (wx - camX) * zoom + W / 2;
    if (x < 0 || x > W) continue;
    const a = Math.max(0, Math.sin(t * 2.3 + i * 1.7)) * 0.7;
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    ctx.fillRect(x, wy(x) + 2, (5 + (i % 4) * 4) * Math.min(2, zoom), 1.5);
  }
  ctx.restore();
}

// ---------- absorción de color y viñeta ----------
export function drawAbsorption(ctx, W, H, color, k) {
  if (k <= 0.01) return;
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  const c = hex(color);
  const m = (ch) => Math.round(255 + (ch - 255) * clamp(k, 0, 1));
  ctx.fillStyle = `rgb(${m(c[0])},${m(c[1])},${m(c[2])})`;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}
export function drawVignette(ctx, W, H, strength = 0.5, tint = '#000814') {
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.38, W / 2, H / 2, Math.max(W, H) * 0.78);
  g.addColorStop(0, rgba(tint, 0)); g.addColorStop(1, rgba(tint, strength));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

// ---------- partículas en suspensión ----------
export class Suspended {
  constructor(count = 120, seed = 1) {
    this.items = Array.from({ length: count }, (_, i) => ({ u: hash2(i, 1, seed), v: hash2(i, 2, seed), z: 0.2 + hash2(i, 3, seed) * 1.0, s: 0.5 + hash2(i, 4, seed) * 1.5, ph: hash2(i, 5, seed) * TAU }));
  }
  // bokeh = las más cercanas se dibujan grandes y desenfocadas.
  draw(ctx, { W, H, camX, camY, zoom, t, color = '#e8ffff', alpha = 0.5, glow = false, bokeh = true, count }) {
    ctx.save();
    if (glow) ctx.globalCompositeOperation = 'lighter';
    const n = count ?? this.items.length;
    const z0 = Math.min(3, Math.max(0.6, zoom));
    for (let i = 0; i < n; i++) {
      const p = this.items[i];
      const span = 1.3;
      const px = (p.u * W * span - camX * zoom * p.z * 0.5 + Math.sin(t * 0.3 + p.ph) * 12 * p.z) % (W * span);
      const py = (p.v * H * span - camY * zoom * p.z * 0.5 + t * 5 * p.z) % (H * span);
      const x = (px + W * span) % (W * span) - W * 0.15, y = (py + H * span) % (H * span) - H * 0.15;
      const near = p.z > 1.0 && bokeh;
      const r = near ? p.s * 5 * p.z : p.s * p.z * 0.9 * z0;
      const a = alpha * (near ? 0.12 : 0.3 + 0.7 * p.z) * (0.6 + 0.4 * Math.sin(t * 0.8 + p.ph));
      if (near) {
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, rgba(color, a)); g.addColorStop(0.7, rgba(color, a * 0.6)); g.addColorStop(1, rgba(color, 0));
        ctx.fillStyle = g;
      } else ctx.fillStyle = rgba(color, a);
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
}

// ---------- burbujas ----------
export class Bubbles {
  constructor(max = 300) { this.max = max; this.items = []; }
  emit(x, y, n = 1, { spread = 10, size = 3, speed = 40, life = 2.5 } = {}) {
    for (let i = 0; i < n; i++) {
      if (this.items.length >= this.max) this.items.shift();
      this.items.push({ x: x + (Math.random() - 0.5) * spread, y: y + (Math.random() - 0.5) * spread, r: size * (0.5 + Math.random()), vy: -speed * (0.6 + Math.random() * 0.8), ph: Math.random() * TAU, life, max: life });
    }
  }
  update(dt) {
    const out = [];
    for (const b of this.items) {
      b.life -= dt; b.y += b.vy * dt; b.x += Math.sin(b.ph + b.life * 5) * b.r * 2 * dt; b.vy -= 18 * dt;
      if (b.life > 0 && b.y > 0) out.push(b);
    }
    this.items = out;
  }
  draw(ctx) {
    ctx.save();
    for (const b of this.items) {
      const k = clamp(b.life / b.max, 0, 1), a = Math.min(1, k * 1.6);
      const g = ctx.createRadialGradient(b.x - b.r * 0.3, b.y - b.r * 0.35, 0, b.x, b.y, b.r);
      g.addColorStop(0, `rgba(255,255,255,${0.75 * a})`); g.addColorStop(0.45, `rgba(200,240,255,${0.08 * a})`); g.addColorStop(0.85, `rgba(220,250,255,${0.35 * a})`); g.addColorStop(1, `rgba(220,250,255,0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
}
