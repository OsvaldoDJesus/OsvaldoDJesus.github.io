// Criaturas no pisciformes con sombreado volumétrico (degradados con luz desde arriba, translucidez,
// brillo especular). Cocodrilo y calamar reutilizan el cuerpo horneado de bake.mjs.
import { drawFish, drawFishLocal, frame, SPECS, spineAt, profile } from './bake.mjs';

const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

// Esfera iluminada desde arriba-izquierda (volumen barato y convincente).
function litBall(ctx, x, y, r, base, dark, hi = 'rgba(255,255,255,0.55)') {
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.45, r * 0.08, x, y, r);
  g.addColorStop(0, hi); g.addColorStop(0.25, base); g.addColorStop(1, dark);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
}

// ---------- plancton (copépodo translúcido) ----------
export function drawPlankton(ctx, o) {
  const { x, y, size: r, t, phase = 0, glow } = o;
  ctx.save();
  ctx.translate(x, y); ctx.rotate(Math.sin(t * 0.8 + phase) * 0.6 + phase);
  const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 3);
  halo.addColorStop(0, glow ? 'rgba(140,255,240,0.45)' : 'rgba(220,255,250,0.25)'); halo.addColorStop(1, 'rgba(220,255,250,0)');
  ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(0, 0, r * 3, 0, TAU); ctx.fill();
  const g = ctx.createRadialGradient(-r * 0.2, -r * 0.2, 0, 0, 0, r);
  g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.5, 'rgba(200,240,235,0.7)'); g.addColorStop(1, 'rgba(120,200,200,0.25)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.6, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(230,120,40,0.9)'; ctx.beginPath(); ctx.arc(r * 0.15, 0, r * 0.22, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(230,250,250,0.6)'; ctx.lineWidth = Math.max(0.4, r * 0.08);
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(r * 0.8, s * r * 0.2); ctx.quadraticCurveTo(r * 1.6, s * r * 1.2, r * 0.6 + Math.sin(t * 4 + s) * r * 0.2, s * r * 2.0); ctx.stroke(); }
  ctx.restore();
}

// ---------- camarón / krill ----------
export function drawShrimp(ctx, o) {
  const { x, y, ang, size, t, phase = 0, variant } = o;
  const glow = variant === 'glow';
  const body = glow ? [120, 200, 255] : [255, 150, 130];
  ctx.save(); frame(ctx, x, y, ang);
  const segs = 7, flick = Math.sin(phase * 2) * 0.15;
  let px = size * 0.42, py = 0, a = Math.PI;
  const pts = [];
  for (let k = 0; k < segs; k++) { pts.push([px, py, a, size * (0.15 - k * 0.014)]); a -= 0.13 + flick * (k / segs); px += Math.cos(a) * size * 0.13; py += Math.sin(a) * size * 0.13; }
  // Patas y antenas.
  ctx.strokeStyle = `rgba(${body.join(',')},0.6)`; ctx.lineWidth = Math.max(0.4, size * 0.018); ctx.lineCap = 'round';
  for (let k = 0; k < 5; k++) { const [lx, ly] = pts[k + 1]; ctx.beginPath(); ctx.moveTo(lx, ly + size * 0.06); ctx.lineTo(lx - size * 0.03, ly + size * 0.2 + Math.sin(t * 9 + k) * size * 0.03); ctx.stroke(); }
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(size * 0.5, -size * 0.04); ctx.quadraticCurveTo(size * 0.95, -size * 0.3 * s, size * 1.15, -size * (0.1 + 0.15 * s) + Math.sin(t * 3) * size * 0.05); ctx.stroke(); }
  if (glow) ctx.globalCompositeOperation = 'lighter';
  for (let k = segs - 1; k >= 0; k--) {
    const [sx, sy, sa, w] = pts[k];
    const g = ctx.createLinearGradient(sx, sy - w, sx, sy + w);
    g.addColorStop(0, `rgba(${body.map((c) => Math.min(255, c + 60)).join(',')},0.9)`);
    g.addColorStop(0.6, `rgba(${body.join(',')},0.75)`);
    g.addColorStop(1, `rgba(${body.map((c) => c * 0.6).join(',')},0.6)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(sx, sy, size * 0.09, w, sa, 0, TAU); ctx.fill();
  }
  const [tx, ty, ta] = pts[segs - 1];
  ctx.fillStyle = `rgba(${body.join(',')},0.7)`;
  ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx + Math.cos(ta - 0.5) * size * 0.2, ty + Math.sin(ta - 0.5) * size * 0.2); ctx.lineTo(tx + Math.cos(ta + 0.5) * size * 0.2, ty + Math.sin(ta + 0.5) * size * 0.2); ctx.closePath(); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  litBall(ctx, size * 0.47, -size * 0.06, Math.max(0.8, size * 0.04), '#202020', '#000');
  ctx.restore();
}

// ---------- cangrejo ----------
export function drawCrab(ctx, o) {
  const { x, y, size: s, t, variant, dir = 1, phase = 0 } = o;
  const river = variant === 'rio';
  const base = river ? '#6e4c2c' : '#d04a26', dark = river ? '#2e1d0f' : '#6a1c0a';
  ctx.save(); ctx.translate(x, y); ctx.scale(dir, 1);
  ctx.lineCap = 'round';
  // Patas articuladas.
  for (let k = 0; k < 3; k++) for (const side of [-1, 1]) {
    const bx = side * s * (0.22 + k * 0.1), by = s * 0.02;
    const step = Math.sin(phase * 3 + k + (side > 0 ? 1.5 : 0)) * s * 0.06;
    const kx = bx + side * s * 0.25, ky = by - s * 0.12 + step, fx = bx + side * s * 0.38, fy = by + s * 0.3;
    ctx.strokeStyle = dark; ctx.lineWidth = s * 0.075; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(kx, ky); ctx.lineTo(fx, fy); ctx.stroke();
    ctx.strokeStyle = base; ctx.lineWidth = s * 0.045; ctx.beginPath(); ctx.moveTo(bx, by - s * 0.01); ctx.lineTo(kx, ky - s * 0.01); ctx.lineTo(fx, fy); ctx.stroke();
  }
  // Pinzas.
  for (const side of [-1, 1]) {
    const open = 0.2 + 0.2 * Math.sin(t * 2 + side);
    ctx.strokeStyle = dark; ctx.lineWidth = s * 0.09; ctx.beginPath(); ctx.moveTo(side * s * 0.28, -s * 0.08); ctx.lineTo(side * s * 0.52, -s * 0.36); ctx.stroke();
    ctx.save(); ctx.translate(side * s * 0.6, -s * 0.46); ctx.rotate(side * 0.5);
    litBall(ctx, 0, 0, s * 0.17, base, dark);
    ctx.rotate(side * (-0.9 - open));
    ctx.fillStyle = dark; ctx.beginPath(); ctx.ellipse(0, -s * 0.16, s * 0.05, s * 0.13, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }
  // Caparazón con volumen y tubérculos.
  const g = ctx.createRadialGradient(-s * 0.12, -s * 0.2, s * 0.05, 0, -s * 0.03, s * 0.48);
  g.addColorStop(0, river ? '#b08458' : '#ff8c5a'); g.addColorStop(0.45, base); g.addColorStop(1, dark);
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, -s * 0.05, s * 0.42, s * 0.27, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  for (let k = 0; k < 9; k++) { ctx.beginPath(); ctx.arc((hash(k) - 0.5) * s * 0.6, -s * 0.12 + (hash(k + 9) - 0.5) * s * 0.2, s * 0.025, 0, TAU); ctx.fill(); }
  for (const side of [-1, 1]) { ctx.strokeStyle = dark; ctx.lineWidth = s * 0.03; ctx.beginPath(); ctx.moveTo(side * s * 0.1, -s * 0.26); ctx.lineTo(side * s * 0.14, -s * 0.4); ctx.stroke(); litBall(ctx, side * s * 0.14, -s * 0.42, s * 0.045, '#222', '#000'); }
  ctx.restore();
}

// ---------- medusa translúcida ----------
export function drawJelly(ctx, o) {
  const { x, y, size, t, variant, phase = 0 } = o;
  const pal = { rosa: [255, 150, 210], luna: [170, 210, 255], abisal: [255, 80, 160] }[variant] || [255, 150, 210];
  const glow = variant === 'abisal';
  const pulse = Math.sin(t * 2.2 + phase);
  const w = size * (1 + pulse * 0.08), h = size * 0.72 * (1 - pulse * 0.1);
  const rgb = (k, a) => `rgba(${pal.map((c) => Math.min(255, c * k)).join(',')},${a})`;
  ctx.save(); ctx.translate(x, y);
  if (glow) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const gl = ctx.createRadialGradient(0, -h * 0.3, 0, 0, -h * 0.3, size * 2.4);
    gl.addColorStop(0, rgb(1, 0.4)); gl.addColorStop(1, rgb(1, 0));
    ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(0, -h * 0.3, size * 2.4, 0, TAU); ctx.fill(); ctx.restore();
  }
  // Tentáculos finos con transparencia decreciente.
  for (let k = 0; k < 12; k++) {
    const bx = lerp(-w * 0.85, w * 0.85, k / 11);
    const g = ctx.createLinearGradient(0, 0, 0, size * 2);
    g.addColorStop(0, rgb(1, 0.5)); g.addColorStop(1, rgb(1, 0));
    ctx.strokeStyle = g; ctx.lineWidth = Math.max(0.5, size * 0.022);
    ctx.beginPath(); ctx.moveTo(bx, 0);
    for (let s = 1; s <= 10; s++) ctx.lineTo(bx + Math.sin(t * 2 + k * 0.7 + s * 0.6) * size * 0.1 * (s / 10), s * size * 0.2);
    ctx.stroke();
  }
  // Brazos orales con volantes.
  for (const s of [-1, 1]) {
    const g = ctx.createLinearGradient(0, 0, 0, h * 2);
    g.addColorStop(0, rgb(1.1, 0.55)); g.addColorStop(1, rgb(1, 0.05));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(s * w * 0.1, 0);
    for (let k = 1; k <= 8; k++) ctx.lineTo(s * w * (0.12 + Math.sin(k * 1.7 + t * 1.5) * 0.08), h * k * 0.24);
    ctx.lineTo(0, h * 1.9); ctx.closePath(); ctx.fill();
  }
  // Campana: borde iluminado (fresnel) y centro casi transparente.
  ctx.beginPath(); ctx.moveTo(-w, 0); ctx.bezierCurveTo(-w, -h * 1.35, w, -h * 1.35, w, 0);
  for (let k = 12; k >= 0; k--) ctx.lineTo(lerp(-w, w, k / 12), (k % 2 ? h * 0.1 : 0));
  ctx.closePath();
  const bell = ctx.createRadialGradient(0, -h * 0.35, size * 0.05, 0, -h * 0.2, size * 1.15);
  bell.addColorStop(0, rgb(1.2, 0.18)); bell.addColorStop(0.65, rgb(1, 0.32)); bell.addColorStop(0.92, rgb(1.15, 0.7)); bell.addColorStop(1, rgb(1.3, 0.85));
  ctx.fillStyle = bell; ctx.fill();
  ctx.strokeStyle = rgb(1.4, 0.5); ctx.lineWidth = Math.max(0.6, size * 0.025); ctx.stroke();
  if (variant === 'luna') { ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = Math.max(0.6, size * 0.045); for (const a of [-0.45, -0.15, 0.15, 0.45]) { ctx.beginPath(); ctx.arc(a * w * 1.1, -h * 0.45, size * 0.13, 0, TAU); ctx.stroke(); } }
  const spec = ctx.createRadialGradient(-w * 0.35, -h * 0.85, 0, -w * 0.35, -h * 0.85, w * 0.5);
  spec.addColorStop(0, 'rgba(255,255,255,0.55)'); spec.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = spec; ctx.beginPath(); ctx.arc(-w * 0.35, -h * 0.85, w * 0.5, 0, TAU); ctx.fill();
  ctx.restore();
}

// ---------- rana ----------
export function drawFrog(ctx, o) {
  const { x, y, ang, size: s, phase = 0 } = o;
  ctx.save(); frame(ctx, x, y, ang);
  const kick = (Math.sin(phase * 1.6) + 1) / 2;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const side of [-1, 1]) {
    const knee = [-s * 0.45 - kick * s * 0.2, side * s * (0.22 - kick * 0.12)];
    const foot = [-s * 0.62 - kick * s * 0.55, side * s * (0.12 - kick * 0.08)];
    ctx.strokeStyle = side < 0 ? '#2d5a1d' : '#3f7a28'; ctx.lineWidth = s * 0.15;
    ctx.beginPath(); ctx.moveTo(-s * 0.25, side * s * 0.1); ctx.lineTo(knee[0], knee[1]); ctx.lineTo(foot[0], foot[1]); ctx.stroke();
    ctx.fillStyle = 'rgba(70,120,45,0.85)';
    ctx.beginPath(); ctx.moveTo(foot[0], foot[1]); ctx.lineTo(foot[0] - s * 0.25, foot[1] - s * 0.1); ctx.lineTo(foot[0] - s * 0.25, foot[1] + s * 0.1); ctx.closePath(); ctx.fill();
  }
  const g = ctx.createRadialGradient(-s * 0.05, -s * 0.15, s * 0.05, 0, 0, s * 0.5);
  g.addColorStop(0, '#9ad66a'); g.addColorStop(0.5, '#5a9a35'); g.addColorStop(1, '#2a5418');
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, s * 0.46, s * 0.27, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(235,230,170,0.85)'; ctx.beginPath(); ctx.ellipse(s * 0.02, s * 0.14, s * 0.36, s * 0.1, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(25,55,15,0.75)';
  for (let k = 0; k < 7; k++) { ctx.beginPath(); ctx.ellipse(-s * 0.3 + k * s * 0.09, -s * 0.12 + (k % 2) * s * 0.07, s * 0.035, s * 0.025, 0, 0, TAU); ctx.fill(); }
  for (const side of [-1, 1]) { litBall(ctx, s * 0.3, side * s * 0.1 - s * 0.12, s * 0.09, '#5a9a35', '#2a5418'); litBall(ctx, s * 0.32, side * s * 0.1 - s * 0.14, s * 0.055, '#d9b23a', '#5a3a00', 'rgba(255,255,255,0.9)'); }
  ctx.restore();
}

// ---------- calamar (manto horneado + brazos dinámicos) ----------
export function drawSquid(ctx, o) {
  const { x, y, ang, size: L, t, variant, phase = 0, mouth = 0, hit = 0, px = L } = o;
  const id = variant === 'glow' ? 'squidGlow' : variant === 'colosal' ? 'squidColossal' : 'squidMantle';
  const spec = SPECS[id];
  const armCol = { squidMantle: [205, 95, 70], squidGlow: [60, 70, 150], squidColossal: [110, 30, 42] }[id];
  ctx.save(); frame(ctx, x, y, ang);
  const mantleLen = L * 0.55;
  ctx.save(); ctx.translate(L * 0.2, 0);
  // Brazos (detrás): tentáculos ahusados con ondulación.
  const arms = 10;
  for (let k = 0; k < arms; k++) {
    const long = k >= 8;
    const spread = (k / (arms - 1) - 0.5) * L * 0.12;
    const length = L * (long ? 0.95 : 0.42) * (variant === 'colosal' ? 1.25 : 1);
    const segs = 10, pts = [];
    for (let s = 0; s <= segs; s++) {
      const u = s / segs;
      pts.push([-mantleLen / 2 - L * 0.05 - length * u, spread * (0.4 + u * 1.1) + Math.sin(t * 2.4 + k + u * 4) * L * 0.05 * u + mouth * Math.sin(u * 3) * L * 0.1 * (k % 2 ? 1 : -1)]);
    }
    const w0 = L * (long ? 0.014 : 0.026);
    const g = ctx.createLinearGradient(pts[0][0], 0, pts[segs][0], 0);
    g.addColorStop(0, `rgb(${armCol.join(',')})`); g.addColorStop(1, `rgba(${armCol.map((c) => c * 0.7).join(',')},0.85)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    for (let s = 0; s <= segs; s++) { const w = w0 * (1 - (s / segs) * 0.85); ctx.lineTo(pts[s][0], pts[s][1] - w); }
    for (let s = segs; s >= 0; s--) { const w = w0 * (1 - (s / segs) * 0.85); ctx.lineTo(pts[s][0], pts[s][1] + w); }
    ctx.closePath(); ctx.fill();
    if (long) { const e = pts[segs - 1]; ctx.fillStyle = `rgb(${armCol.join(',')})`; ctx.beginPath(); ctx.ellipse(e[0], e[1], L * 0.06, L * 0.022, 0, 0, TAU); ctx.fill(); }
  }
  // Cabeza con ojo grande.
  const hx = -mantleLen / 2 - L * 0.02;
  const hg = ctx.createRadialGradient(hx, -L * 0.03, L * 0.01, hx, 0, L * 0.08);
  hg.addColorStop(0, `rgb(${armCol.map((c) => Math.min(255, c + 70)).join(',')})`); hg.addColorStop(1, `rgb(${armCol.join(',')})`);
  ctx.fillStyle = hg; ctx.beginPath(); ctx.ellipse(hx, 0, L * 0.08, L * 0.065, 0, 0, TAU); ctx.fill();
  // Manto horneado (hacia +x) con aletas.
  ctx.fillStyle = `rgba(${armCol.join(',')},0.85)`;
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(mantleLen * 0.5, 0); ctx.quadraticCurveTo(mantleLen * 0.35, s * L * 0.2, mantleLen * 0.12, s * L * 0.07); ctx.closePath(); ctx.fill(); }
  drawFishLocal(ctx, id, { len: mantleLen, phase: phase * 0.3, speedK: 0.1, t, hit, px: px * 0.55, noTail: true });
  const er = L * (variant === 'colosal' ? 0.05 : 0.035);
  if (variant === 'colosal') { ctx.save(); ctx.globalCompositeOperation = 'lighter'; const g2 = ctx.createRadialGradient(hx, -L * 0.02, 0, hx, -L * 0.02, er * 3.5); g2.addColorStop(0, 'rgba(255,215,120,0.6)'); g2.addColorStop(1, 'rgba(255,215,120,0)'); ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(hx, -L * 0.02, er * 3.5, 0, TAU); ctx.fill(); ctx.restore(); }
  litBall(ctx, hx, -L * 0.02, er, '#efe6c8', '#8a8070', 'rgba(255,255,255,0.95)');
  litBall(ctx, hx + er * 0.1, -L * 0.02, er * 0.6, '#151515', '#000', 'rgba(255,255,255,0.7)');
  ctx.restore();
  ctx.restore();
}

// ---------- mantarraya (vista de 3/4) ----------
export function drawRay(ctx, o) {
  const { x, y, ang, size: s, t, phase = 0 } = o;
  ctx.save(); frame(ctx, x, y, ang);
  const flap = Math.sin(phase * 1.2);
  const span = s * (0.75 + 0.15 * flap);
  const g = ctx.createLinearGradient(-s * 0.2, -span, s * 0.1, span);
  g.addColorStop(0, '#16212b'); g.addColorStop(0.45, '#2e4354'); g.addColorStop(0.55, '#2a3c4b'); g.addColorStop(1, '#101920');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(s * 0.35, 0);
  ctx.quadraticCurveTo(s * 0.2, -span * 0.5, -s * 0.15 + flap * s * 0.05, -span);
  ctx.quadraticCurveTo(-s * 0.15, -span * 0.4, -s * 0.4, 0);
  ctx.quadraticCurveTo(-s * 0.15, span * 0.4, -s * 0.15 - flap * s * 0.05, span);
  ctx.quadraticCurveTo(s * 0.2, span * 0.5, s * 0.35, 0);
  ctx.fill();
  // Manchas claras de los hombros y brillo del lomo.
  ctx.fillStyle = 'rgba(230,240,245,0.35)';
  for (const sd of [-1, 1]) { ctx.beginPath(); ctx.ellipse(s * 0.05, sd * span * 0.28, s * 0.12, span * 0.1, sd * 0.4, 0, TAU); ctx.fill(); }
  const hl = ctx.createRadialGradient(s * 0.1, -span * 0.1, 0, s * 0.1, 0, s * 0.45);
  hl.addColorStop(0, 'rgba(255,255,255,0.18)'); hl.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hl; ctx.beginPath(); ctx.arc(s * 0.1, 0, s * 0.45, 0, TAU); ctx.fill();
  ctx.fillStyle = '#16212b';
  for (const sd of [-1, 1]) { ctx.beginPath(); ctx.ellipse(s * 0.38, sd * s * 0.07, s * 0.07, s * 0.025, sd * 0.3, 0, TAU); ctx.fill(); }
  ctx.strokeStyle = '#16212b'; ctx.lineWidth = Math.max(0.6, s * 0.015); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-s * 0.4, 0); ctx.quadraticCurveTo(-s * 0.7, Math.sin(t * 2) * s * 0.06, -s * 0.95, Math.sin(t * 2 + 1) * s * 0.1); ctx.stroke();
  ctx.restore();
}

// ---------- tortuga gigante ----------
export function drawTurtle(ctx, o) {
  const { x, y, ang, size: s, phase = 0 } = o;
  ctx.save(); frame(ctx, x, y, ang);
  const stroke = Math.sin(phase * 1.1);
  const flipper = (px, py, rot, l, w, c) => { ctx.save(); ctx.translate(px, py); ctx.rotate(rot); const g = ctx.createLinearGradient(0, -w, 0, w); g.addColorStop(0, '#8a8f68'); g.addColorStop(1, c); ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(-l, 0, l, w, 0, 0, TAU); ctx.fill(); ctx.restore(); };
  flipper(s * 0.12, s * 0.06, -0.35 - stroke * 0.5, s * 0.36, s * 0.07, '#3f452c');
  flipper(-s * 0.3, s * 0.06, -0.2 + stroke * 0.25, s * 0.15, s * 0.05, '#3f452c');
  litBall(ctx, s * 0.48, s * 0.02, s * 0.11, '#7a7f58', '#3a3d27');
  litBall(ctx, s * 0.54, -s * 0.01, s * 0.016, '#111', '#000', 'rgba(255,255,255,0.9)');
  // Caparazón con escudos individuales.
  const g = ctx.createLinearGradient(0, -s * 0.33, 0, s * 0.08);
  g.addColorStop(0, '#5b5236'); g.addColorStop(0.6, '#3a3524'); g.addColorStop(1, '#2a2618');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(-s * 0.45, s * 0.06); ctx.bezierCurveTo(-s * 0.4, -s * 0.38, s * 0.35, -s * 0.38, s * 0.4, s * 0.06); ctx.closePath(); ctx.fill();
  for (let k = -2; k <= 2; k++) {
    const cx = k * s * 0.15, cy = -s * 0.14 - (2 - Math.abs(k)) * s * 0.03;
    const sg = ctx.createRadialGradient(cx - s * 0.03, cy - s * 0.04, 0, cx, cy, s * 0.11);
    sg.addColorStop(0, 'rgba(160,150,105,0.55)'); sg.addColorStop(1, 'rgba(40,35,20,0.1)');
    ctx.fillStyle = sg; ctx.beginPath(); ctx.ellipse(cx, cy, s * 0.08, s * 0.07, 0, 0, TAU); ctx.fill();
  }
  ctx.fillStyle = '#c9b88a'; ctx.beginPath(); ctx.ellipse(0, s * 0.075, s * 0.42, s * 0.05, 0, 0, TAU); ctx.fill();
  flipper(s * 0.1, s * 0.09, -0.55 - stroke * 0.6, s * 0.38, s * 0.075, '#4a5034');
  ctx.restore();
}

// ---------- ammonite ----------
export function drawAmmonite(ctx, o) {
  const { x, y, ang, size: s, t } = o;
  ctx.save(); frame(ctx, x, y, ang);
  ctx.lineCap = 'round';
  for (let k = 0; k < 9; k++) {
    const sp = (k / 8 - 0.5) * s * 0.3;
    const g = ctx.createLinearGradient(s * 0.2, 0, s * 0.65, 0);
    g.addColorStop(0, '#c97a5a'); g.addColorStop(1, 'rgba(201,122,90,0.6)');
    ctx.strokeStyle = g; ctx.lineWidth = Math.max(0.6, s * 0.032);
    ctx.beginPath(); ctx.moveTo(s * 0.22, sp * 0.4); ctx.quadraticCurveTo(s * 0.45, sp + Math.sin(t * 2 + k) * s * 0.05, s * 0.64, sp * 1.4 + Math.sin(t * 2 + k + 1) * s * 0.08); ctx.stroke();
  }
  const g = ctx.createRadialGradient(-s * 0.12, -s * 0.14, s * 0.04, 0, 0, s * 0.42);
  g.addColorStop(0, '#fbe9c4'); g.addColorStop(0.5, '#c99a62'); g.addColorStop(1, '#6b4523');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, s * 0.38, 0, TAU); ctx.fill();
  // Costillas con luz y sombra (relieve).
  for (let k = 0; k < 26; k++) {
    const a = (k / 26) * TAU + t * 0.03;
    ctx.strokeStyle = 'rgba(70,40,15,0.45)'; ctx.lineWidth = Math.max(0.5, s * 0.018);
    ctx.beginPath(); ctx.moveTo(Math.cos(a) * s * 0.2, Math.sin(a) * s * 0.2); ctx.lineTo(Math.cos(a) * s * 0.37, Math.sin(a) * s * 0.37); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,240,210,0.35)'; ctx.lineWidth = Math.max(0.4, s * 0.008);
    ctx.beginPath(); ctx.moveTo(Math.cos(a + 0.04) * s * 0.2, Math.sin(a + 0.04) * s * 0.2); ctx.lineTo(Math.cos(a + 0.04) * s * 0.37, Math.sin(a + 0.04) * s * 0.37); ctx.stroke();
  }
  ctx.strokeStyle = '#5a3a1c'; ctx.lineWidth = Math.max(0.6, s * 0.03);
  ctx.beginPath();
  for (let a = 0; a < TAU * 3.2; a += 0.12) { const r = s * 0.38 * Math.exp(-a * 0.16); const px = Math.cos(a) * r, py = Math.sin(a) * r; if (a === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
  ctx.stroke();
  litBall(ctx, s * 0.31, -s * 0.06, s * 0.03, '#111', '#000', 'rgba(255,255,255,0.9)');
  ctx.restore();
}

// ---------- cocodrilo (cuerpo horneado + patas + mandíbula) ----------
export function drawCroc(ctx, o) {
  const { x, y, ang, len, phase = 0, speedK = 0.5, mouth = 0, t = 0, hit = 0, variant, px = len } = o;
  const id = variant === 'rey' ? 'crocKing' : 'croc';
  const spec = SPECS[id];
  const col = spec.col;
  ctx.save(); frame(ctx, x, y, ang);
  // Columna aproximada para anclar las patas antes de dibujar el cuerpo.
  const sp = [];
  const K = 20, amp = len * 0.045 * 0.7 * (0.45 + 0.75 * speedK);
  for (let i = 0; i <= K; i++) { const u = i / K; sp.push([(0.5 - u) * len, Math.sin(phase - u * 0.8 * TAU) * amp * (0.12 + 0.88 * u * u)]); }
  // Patas recogidas junto al cuerpo al nadar, con un leve remo; miembros ahusados e iluminados.
  const limb = (x0, y0, x1, y1, w0, w1, c0, c1) => {
    const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
    const g = ctx.createLinearGradient(x0 + nx * w0, y0 + ny * w0, x0 - nx * w0, y0 - ny * w0);
    g.addColorStop(0, c1); g.addColorStop(1, c0);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(x0 + nx * w0, y0 + ny * w0); ctx.lineTo(x1 + nx * w1, y1 + ny * w1); ctx.lineTo(x1 - nx * w1, y1 - ny * w1); ctx.lineTo(x0 - nx * w0, y0 - ny * w0); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(x1, y1, w1, 0, TAU); ctx.fill();
  };
  const leg = (u, near, ph) => {
    const s = spineAt(sp, u), h = profile(spec.prof, u) * len;
    const bx = s[0], by = s[1] + h * 0.6;
    const sw = Math.sin(phase * 1.3 + ph) * 0.35;
    const L1 = len * 0.07, L2 = len * 0.06;
    const a1 = 2.55 + sw, a2 = 2.95 + sw * 0.5;
    const kx = bx + Math.cos(a1) * L1, ky = by + Math.sin(a1) * L1;
    const fx = kx + Math.cos(a2) * L2, fy = ky + Math.sin(a2) * L2;
    const c0 = near ? col.belly : '#3a4022', c1 = near ? col.mid : '#1c2310';
    limb(bx, by, kx, ky, len * 0.016, len * 0.011, c0, c1);
    limb(kx, ky, fx, fy, len * 0.011, len * 0.007, c0, c1);
    ctx.strokeStyle = 'rgba(40,36,24,0.9)'; ctx.lineWidth = len * 0.004; ctx.lineCap = 'round';
    for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx - len * 0.022, fy + k * len * 0.008); ctx.stroke(); }
  };
  leg(0.3, false, 0.6); leg(0.56, false, 2.2);
  drawFishLocal(ctx, id, { len, phase, speedK, mouth: mouth * 0.9, t, hit, px });
  leg(0.3, true, 0); leg(0.56, true, 1.6);
  ctx.restore();
}

// ---------- despachador ----------
const FISH_ART = { ballena: 'ballena', morena: 'morena', orca: 'orca', dunkleosteus: 'dunkleosteus', livyatan: 'livyatan', pejesapo: 'pejesapo' };
export function drawCreature(ctx, kind, o) {
  switch (kind) {
    case 'plancton': return drawPlankton(ctx, o);
    case 'camaron': return drawShrimp(ctx, o);
    case 'cangrejo': return drawCrab(ctx, o);
    case 'medusa': return drawJelly(ctx, o);
    case 'rana': return drawFrog(ctx, o);
    case 'calamar': return drawSquid(ctx, o);
    case 'calamar-colosal': return drawSquid(ctx, { ...o, variant: 'colosal' });
    case 'raya': return drawRay(ctx, o);
    case 'tortuga': return drawTurtle(ctx, o);
    case 'ammonite': return drawAmmonite(ctx, o);
    case 'cocodrilo': return drawCroc(ctx, { ...o, len: o.len ?? o.size });
    case 'pez': return drawFish(ctx, SPECS[o.variant] ? o.variant : 'reef', { ...o, len: o.len ?? o.size });
    default: return drawFish(ctx, FISH_ART[kind] || (SPECS[kind] ? kind : 'reef'), { ...o, len: o.len ?? o.size });
  }
}

// Tamaño de dibujo (longitud) a partir del radio de colisión de una presa.
export function sizeForPrey(art, r) {
  switch (art) {
    case 'plancton': return r;
    case 'camaron': return r * 2.4;
    case 'cangrejo': return r * 2.2;
    case 'medusa': return r * 1.1;
    case 'rana': return r * 2.2;
    case 'calamar': return r * 2.6;
    case 'raya': return r * 1.5;
    case 'tortuga': return r * 2.1;
    case 'ammonite': return r * 2.4;
    case 'ballena': return r * 2.5;
    default: return r * 2.4;
  }
}
