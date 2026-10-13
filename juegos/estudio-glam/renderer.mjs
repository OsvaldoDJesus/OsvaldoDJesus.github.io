// Dibujo de Estudio Glam: cara vectorial procedimental, capas de pintura con máscaras,
// pegatinas, pelo, extras, iconos de herramientas y pantallas.
import { fillRoundRect, roundRect, text } from './kit/core/widgets.js';
import { drawStar, drawHeart } from './kit/core/particles.js';
import { offscreen } from './kit/core/canvas.js';
import { GAME, FACE, TOOLS, PALETTES, STICKERS } from './content.mjs';

export const LAYER_ORDER = ['base', 'blush', 'shadow', 'liner', 'lips', 'gloss', 'glitter'];
const LAYER_SCALE = 2; // resolución interna de las capas para trazos nítidos en pantallas densas
const FACE_W = 480, FACE_H = 560; // zona de la cara (y lógica 0..560 corresponde a la cara)

export const LAYOUT = {
  face: { x: 0, y: 0, w: 480, h: 560 },
  tools: { x: 10, y: 566, w: 460, h: 86 },
  palette: { x: 10, y: 658, w: 460, h: 66 },
  bottom: { y: 730 },
};

// ---------- máscaras (Path2D en coordenadas lógicas) ----------
function ellipsePath(cx, cy, rx, ry) { const p = new Path2D(); p.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); return p; }

export function buildMasks() {
  const f = FACE;
  const head = ellipsePath(f.center.x, f.center.y, f.head.rx, f.head.ry);
  const eyes = new Path2D();
  eyes.addPath(ellipsePath(f.eyes.left.x, f.eyes.left.y, f.eyes.rx, f.eyes.ry));
  eyes.addPath(ellipsePath(f.eyes.right.x, f.eyes.right.y, f.eyes.rx, f.eyes.ry));
  const eyelids = new Path2D();
  for (const e of [f.eyes.left, f.eyes.right]) {
    // Media elipse sobre el ojo (de la línea del ojo hacia arriba).
    const p = new Path2D();
    p.ellipse(e.x, e.y + f.eyelids.dy, f.eyelids.rx, f.eyelids.ry, 0, Math.PI, Math.PI * 2);
    p.lineTo(e.x + f.eyelids.rx, e.y + 2); p.lineTo(e.x - f.eyelids.rx, e.y + 2); p.closePath();
    eyelids.addPath(p);
  }
  const cheeks = new Path2D();
  cheeks.addPath(ellipsePath(f.cheeks.left.x, f.cheeks.left.y, f.cheeks.rx, f.cheeks.ry));
  cheeks.addPath(ellipsePath(f.cheeks.right.x, f.cheeks.right.y, f.cheeks.rx, f.cheeks.ry));
  const lips = new Path2D();
  lips.addPath(ellipsePath(f.lips.x, f.lips.y + f.lips.upper.dy, f.lips.upper.rx, f.lips.upper.ry));
  lips.addPath(ellipsePath(f.lips.x, f.lips.y + f.lips.lower.dy, f.lips.lower.rx, f.lips.lower.ry));
  const lashline = new Path2D();
  for (const e of [f.eyes.left, f.eyes.right]) lashline.addPath(ellipsePath(e.x, e.y - f.eyes.ry + 2, f.eyes.rx + 6, f.lashline.ry));
  const eyesWide = new Path2D();
  for (const e of [f.eyes.left, f.eyes.right]) eyesWide.addPath(ellipsePath(e.x, e.y, f.eyes.rx + 12, f.eyes.ry + 14));
  return { skin: head, eyes, eyelids, cheeks, lips, lashline, eyesWide };
}

// ---------- capas de pintura ----------
export class PaintLayers {
  constructor() {
    this.masks = buildMasks();
    this.layers = {};
    for (const id of LAYER_ORDER) this.layers[id] = offscreen(FACE_W * LAYER_SCALE, FACE_H * LAYER_SCALE);
  }

  clear() { for (const l of Object.values(this.layers)) l.ctx.clearRect(0, 0, l.canvas.width, l.canvas.height); }

  // Pinta un sello de un trazo en su capa, recortado por la máscara de la herramienta.
  stamp(tool, color, x, y, size, { erase = false } = {}) {
    const S = LAYER_SCALE;
    if (erase) {
      for (const l of Object.values(this.layers)) {
        const c = l.ctx;
        c.save(); c.scale(S, S);
        c.globalCompositeOperation = 'destination-out';
        const g = c.createRadialGradient(x, y, 0, x, y, size / 2);
        g.addColorStop(0, 'rgba(0,0,0,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g; c.beginPath(); c.arc(x, y, size / 2, 0, Math.PI * 2); c.fill();
        c.restore();
      }
      return;
    }
    const layer = this.layers[tool.layer];
    if (!layer) return;
    const c = layer.ctx;
    c.save();
    c.scale(S, S);
    const mask = this.masks[tool.mask];
    if (mask) c.clip(mask);
    const b = tool.brush;
    if (b.sparkle) {
      // Purpurina: puntitos brillantes dispersos.
      for (let i = 0; i < 5; i++) {
        const a = Math.random() * Math.PI * 2, d = Math.random() * size / 2;
        c.fillStyle = Math.random() < 0.5 ? color : '#fff';
        c.globalAlpha = 0.9;
        const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
        drawStar(c, px, py, 4, 1.6 + Math.random() * 1.6, 0.6);
      }
    } else if (b.soft) {
      const g = c.createRadialGradient(x, y, 0, x, y, size / 2);
      g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.globalAlpha = b.alpha;
      c.fillStyle = g;
      c.beginPath(); c.arc(x, y, size / 2, 0, Math.PI * 2); c.fill();
    } else {
      c.globalAlpha = b.alpha;
      c.fillStyle = color;
      c.beginPath(); c.arc(x, y, size / 2, 0, Math.PI * 2); c.fill();
    }
    c.restore();
  }

  // Reconstruye las capas desde los trazos del motor (carga, deshacer).
  rebuild(strokes, toolById) {
    this.clear();
    for (const s of strokes) {
      const tool = toolById(s.tool);
      if (!tool) continue;
      const erase = tool.kind === 'erase';
      if (!erase && !tool.layer) continue;
      const spacing = Math.max(2, s.size * 0.35);
      let [lx, ly] = s.pts[0];
      this.stamp(tool, s.color, lx, ly, s.size, { erase });
      for (let i = 1; i < s.pts.length; i++) {
        const [x, y] = s.pts[i];
        const d = Math.hypot(x - lx, y - ly);
        const n = Math.min(40, Math.max(1, Math.floor(d / spacing)));
        for (let k = 1; k <= n; k++) this.stamp(tool, s.color, lx + ((x - lx) * k) / n, ly + ((y - ly) * k) / n, s.size, { erase });
        lx = x; ly = y;
      }
    }
  }

  draw(ctx, ids = LAYER_ORDER) {
    for (const id of ids) {
      const l = this.layers[id];
      ctx.save();
      if (id === 'gloss') ctx.globalCompositeOperation = 'screen';
      if (id === 'glitter') ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(l.canvas, 0, 0, FACE_W, FACE_H);
      ctx.restore();
    }
  }
}

// ---------- cara ----------
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = (c) => Math.max(0, Math.min(255, Math.round(k > 0 ? c + (255 - c) * k : c * (1 + k))));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

export class FaceRenderer {
  constructor() {
    this.t = 0;
    this.blink = 0;      // 0 abierto, 1 cerrado
    this.nextBlink = 2.5;
    this.smile = 0;      // 0 neutra, 1 sonrisa grande
    this.lookX = 0; this.lookY = 0;
    this.paint = new PaintLayers();
  }

  update(dt, { pointer, happy = 0 } = {}) {
    this.t += dt;
    this.nextBlink -= dt;
    if (this.nextBlink <= 0) { this.nextBlink = 2 + Math.random() * 3; this.blinking = 0.001; }
    if (this.blinking) { this.blinking += dt; this.blink = Math.sin(Math.min(Math.PI, (this.blinking / 0.22) * Math.PI)); if (this.blinking > 0.22) { this.blinking = 0; this.blink = 0; } }
    const targetSmile = 0.25 + happy * 0.75;
    this.smile += (targetSmile - this.smile) * Math.min(1, dt * 3);
    if (pointer) {
      const tx = Math.max(-1, Math.min(1, (pointer.x - FACE.center.x) / 200));
      const ty = Math.max(-1, Math.min(1, (pointer.y - FACE.center.y) / 260));
      this.lookX += (tx - this.lookX) * Math.min(1, dt * 6);
      this.lookY += (ty - this.lookY) * Math.min(1, dt * 6);
    }
  }

  draw(ctx, look, character, { showPaint = true } = {}) {
    const f = FACE;
    const skin = character.skin;
    const hair = look.hair || character.hair;
    // Fondo de la zona cara: degradado suave.
    const bg = ctx.createLinearGradient(0, 0, 0, FACE_H);
    bg.addColorStop(0, '#ffe3f1'); bg.addColorStop(1, '#f6d6ff');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, FACE_W, FACE_H);
    // Destellos suaves de fondo.
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (let i = 0; i < 12; i++) drawStar(ctx, (i * 97 + 30) % 480, (i * 53 + 20 + Math.sin(this.t + i) * 6) % 540, 4, 4 + (i % 3) * 2, 1.5);

    // Pelo trasero.
    drawHairBack(ctx, character.style, hair, f);
    // Cuello y hombros.
    ctx.fillStyle = shade(skin, -0.12);
    ctx.beginPath(); ctx.roundRect(f.center.x - 40, f.center.y + f.head.ry - 40, 80, 90, 20); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.ellipse(f.center.x, f.center.y + f.head.ry + 120, 190, 90, 0, Math.PI, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff8fab';
    ctx.beginPath(); ctx.ellipse(f.center.x, f.center.y + f.head.ry + 125, 170, 75, 0, Math.PI, Math.PI * 2); ctx.fill();
    // Cabeza.
    const g = ctx.createRadialGradient(f.center.x - 40, f.center.y - 60, 20, f.center.x, f.center.y, f.head.ry * 1.1);
    g.addColorStop(0, shade(skin, 0.12)); g.addColorStop(1, shade(skin, -0.08));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(f.center.x, f.center.y, f.head.rx, f.head.ry, 0, 0, Math.PI * 2); ctx.fill();
    // Orejas.
    ctx.fillStyle = shade(skin, -0.05);
    ctx.beginPath(); ctx.ellipse(f.center.x - f.head.rx - 4, f.center.y + 10, 14, 22, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(f.center.x + f.head.rx + 4, f.center.y + 10, 14, 22, 0, 0, Math.PI * 2); ctx.fill();
    // Sombra de pelo sobre la frente.
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    ctx.beginPath(); ctx.ellipse(f.center.x, f.center.y - f.head.ry + 40, f.head.rx * 0.95, 30, 0, 0, Math.PI * 2); ctx.fill();

    if (showPaint) this.paint.draw(ctx, ['base', 'blush', 'shadow']);

    // Ojos.
    for (const side of ['left', 'right']) {
      const e = f.eyes[side];
      drawEye(ctx, e.x, e.y, f.eyes.rx, f.eyes.ry, character.eyes, this.blink, this.lookX, this.lookY, look.lashes || 0, skin);
    }
    if (showPaint) this.paint.draw(ctx, ['liner']);
    // Cejas.
    ctx.strokeStyle = shade(hair, -0.2); ctx.lineWidth = 6; ctx.lineCap = 'round';
    for (const side of ['left', 'right']) {
      const e = f.eyes[side], dir = side === 'left' ? -1 : 1;
      ctx.beginPath(); ctx.moveTo(e.x - f.brows.half * 0.9, f.brows.y + 6); ctx.quadraticCurveTo(e.x + dir * 6, f.brows.y - 8, e.x + f.brows.half * 0.9, f.brows.y + 4 - dir * 2); ctx.stroke();
    }
    // Nariz.
    ctx.strokeStyle = shade(skin, -0.25); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(f.nose.x - 4, f.nose.y1); ctx.quadraticCurveTo(f.nose.x - 12, f.nose.y2, f.nose.x - 2, f.nose.y2 + 4); ctx.stroke();
    ctx.beginPath(); ctx.arc(f.nose.x + 8, f.nose.y2 + 2, 3, 0, Math.PI); ctx.stroke();
    // Labios naturales + sonrisa.
    drawLips(ctx, f, character.lips, this.smile);
    if (showPaint) this.paint.draw(ctx, ['lips', 'gloss']);
    // Pelo delantero.
    drawHairFront(ctx, character.style, hair, f);
    if (showPaint) this.paint.draw(ctx, ['glitter']);
    // Extras.
    for (const a of look.accessories || []) drawAccessory(ctx, a, f, hair);
    // Pegatinas.
    for (const s of look.stickers || []) drawSticker(ctx, s.id, s.x, s.y, s.size, s.rot, STICKERS.find((d) => d.id === s.id)?.color);
  }
}

function drawEye(ctx, x, y, rx, ry, iris, blink, lookX, lookY, lashes, skin) {
  const open = 1 - blink * 0.95;
  ctx.save();
  // Pestañas.
  const n = 5 + Math.round(lashes * 6);
  ctx.strokeStyle = '#1a1a1a'; ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const k = (i + 0.5) / n;
    const a = Math.PI + k * Math.PI;
    const px = x + Math.cos(a) * rx, py = y + Math.sin(a) * ry * open;
    const len = (5 + lashes * 14) * (0.6 + Math.sin(k * Math.PI) * 0.6);
    ctx.lineWidth = 1.5 + lashes * 1.5;
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(a - 0.3) * len, py + Math.sin(a - 0.3) * len * 1.2); ctx.stroke();
  }
  // Globo ocular.
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry * open, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#fff'; ctx.fill();
  ctx.save(); ctx.clip();
  const ix = x + lookX * 8, iy = y + lookY * 4;
  const ig = ctx.createRadialGradient(ix, iy, 2, ix, iy, 12);
  ig.addColorStop(0, shade(iris, 0.3)); ig.addColorStop(1, shade(iris, -0.3));
  ctx.fillStyle = ig; ctx.beginPath(); ctx.arc(ix, iy, 12, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(ix, iy, 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ix - 4, iy - 4, 3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(ix + 3, iy + 3, 1.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // Párpado superior (línea).
  ctx.strokeStyle = shade(skin, -0.45); ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry * open, 0, Math.PI, Math.PI * 2); ctx.stroke();
  if (blink > 0.5) { ctx.fillStyle = skin; ctx.beginPath(); ctx.ellipse(x, y, rx + 1, ry * (1 - open) + 1, 0, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}

function drawLips(ctx, f, color, smile) {
  const { x, y } = f.lips;
  const w = 32 + smile * 6;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x - w, y - smile * 4);
  ctx.quadraticCurveTo(x - w / 2, y - 12, x - 6, y - 8);
  ctx.quadraticCurveTo(x, y - 4, x + 6, y - 8);
  ctx.quadraticCurveTo(x + w / 2, y - 12, x + w, y - smile * 4);
  ctx.quadraticCurveTo(x, y + 2, x - w, y - smile * 4);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x - w, y - smile * 4);
  ctx.quadraticCurveTo(x, y + 22 + smile * 6, x + w, y - smile * 4);
  ctx.quadraticCurveTo(x, y + 4, x - w, y - smile * 4);
  ctx.fill();
  // Boca abierta levemente al sonreír.
  if (smile > 0.6) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(x - w * 0.6, y + 1); ctx.quadraticCurveTo(x, y + 8 * (smile - 0.6) * 2.5 + 1, x + w * 0.6, y + 1); ctx.fill(); }
}

function drawHairBack(ctx, style, color, f) {
  ctx.fillStyle = color;
  const cx = f.center.x, cy = f.center.y;
  switch (style) {
    case 'bob':
      ctx.beginPath(); ctx.ellipse(cx, cy + 10, f.head.rx + 26, f.head.ry + 10, 0, 0, Math.PI * 2); ctx.fill();
      break;
    case 'curly':
      for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * (f.head.rx + 18), cy + 10 + Math.sin(a) * (f.head.ry + 8), 34, 0, Math.PI * 2); ctx.fill(); }
      break;
    case 'ponytail':
      ctx.beginPath(); ctx.ellipse(cx, cy - 10, f.head.rx + 14, f.head.ry + 6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx + f.head.rx + 20, cy + 60, 34, 120, 0.3, 0, Math.PI * 2); ctx.fill();
      break;
    case 'braids':
      ctx.beginPath(); ctx.ellipse(cx, cy - 10, f.head.rx + 14, f.head.ry + 6, 0, 0, Math.PI * 2); ctx.fill();
      for (const dir of [-1, 1]) for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(cx + dir * (f.head.rx + 18), cy + 40 + i * 34, 20 - i, 0, Math.PI * 2); ctx.fill(); }
      break;
    default: // long
      ctx.beginPath(); ctx.ellipse(cx, cy + 60, f.head.rx + 40, f.head.ry + 90, 0, 0, Math.PI * 2); ctx.fill();
      break;
  }
}

function drawHairFront(ctx, style, color, f) {
  const cx = f.center.x, top = f.center.y - f.head.ry;
  ctx.fillStyle = color;
  // Flequillo / raya según estilo.
  ctx.beginPath();
  ctx.moveTo(cx - f.head.rx - 6, top + 70);
  ctx.quadraticCurveTo(cx - f.head.rx - 10, top - 20, cx, top - 24);
  ctx.quadraticCurveTo(cx + f.head.rx + 10, top - 20, cx + f.head.rx + 6, top + 70);
  if (style === 'bob' || style === 'curly') {
    ctx.quadraticCurveTo(cx + 60, top + 30, cx + 20, top + 52);
    ctx.quadraticCurveTo(cx, top + 20, cx - 30, top + 56);
    ctx.quadraticCurveTo(cx - 70, top + 30, cx - f.head.rx - 6, top + 70);
  } else {
    ctx.quadraticCurveTo(cx + 40, top + 10, cx + 10, top + 46);
    ctx.quadraticCurveTo(cx - 10, top + 10, cx - 50, top + 60);
    ctx.quadraticCurveTo(cx - 90, top + 30, cx - f.head.rx - 6, top + 70);
  }
  ctx.closePath(); ctx.fill();
  // Brillo del pelo.
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(cx - 60, top + 10); ctx.quadraticCurveTo(cx - 20, top - 4, cx + 30, top + 6); ctx.stroke();
}

function drawAccessory(ctx, id, f, hair) {
  const cx = f.center.x, top = f.center.y - f.head.ry;
  switch (id) {
    case 'aretes':
      for (const dir of [-1, 1]) { ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.arc(cx + dir * (f.head.rx + 4), f.center.y + 36, 7, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#4cc9f0'; ctx.beginPath(); ctx.arc(cx + dir * (f.head.rx + 4), f.center.y + 36, 3.5, 0, Math.PI * 2); ctx.fill(); }
      break;
    case 'tiara':
      ctx.fillStyle = '#ffd166';
      ctx.beginPath(); ctx.moveTo(cx - 70, top + 4); ctx.lineTo(cx - 40, top - 40); ctx.lineTo(cx - 18, top - 10); ctx.lineTo(cx, top - 56); ctx.lineTo(cx + 18, top - 10); ctx.lineTo(cx + 40, top - 40); ctx.lineTo(cx + 70, top + 4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ff5d8f'; ctx.beginPath(); ctx.arc(cx, top - 40, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#4cc9f0'; ctx.beginPath(); ctx.arc(cx - 40, top - 28, 5, 0, Math.PI * 2); ctx.arc(cx + 40, top - 28, 5, 0, Math.PI * 2); ctx.fill();
      break;
    case 'gafas':
      ctx.strokeStyle = '#ff5d8f'; ctx.lineWidth = 5;
      for (const side of ['left', 'right']) { const e = f.eyes[side]; ctx.beginPath(); ctx.ellipse(e.x, e.y, f.eyes.rx + 10, f.eyes.ry + 14, 0, 0, Math.PI * 2); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(f.eyes.left.x + f.eyes.rx + 10, f.eyes.left.y); ctx.lineTo(f.eyes.right.x - f.eyes.rx - 10, f.eyes.right.y); ctx.stroke();
      ctx.fillStyle = 'rgba(160,220,255,0.25)';
      for (const side of ['left', 'right']) { const e = f.eyes[side]; ctx.beginPath(); ctx.ellipse(e.x, e.y, f.eyes.rx + 10, f.eyes.ry + 14, 0, 0, Math.PI * 2); ctx.fill(); }
      break;
    case 'flor-pelo':
      drawSticker(ctx, 'flor', cx - f.head.rx + 10, top + 50, 34, 0, '#ff8fab');
      break;
    case 'diadema':
      ctx.strokeStyle = '#c77dff'; ctx.lineWidth = 10; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.ellipse(cx, top + 24, f.head.rx + 4, 30, 0, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
      ctx.fillStyle = '#fff'; for (let i = 0; i < 5; i++) drawStar(ctx, cx - 60 + i * 30, top + 24 - Math.sin((i / 4) * Math.PI) * 26, 5, 5, 2);
      void hair;
      break;
    default: break;
  }
}

export function drawSticker(ctx, id, x, y, size, rot = 0, color = '#ffd166') {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((rot * Math.PI) / 180);
  ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 2;
  ctx.fillStyle = color;
  const s = size / 2;
  switch (id) {
    case 'estrella': drawStar(ctx, 0, 0, 5, s, s * 0.45); break;
    case 'corazon': drawHeart(ctx, 0, 0, s); break;
    case 'flor':
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; ctx.beginPath(); ctx.ellipse(Math.cos(a) * s * 0.55, Math.sin(a) * s * 0.55, s * 0.4, s * 0.28, a, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.arc(0, 0, s * 0.3, 0, Math.PI * 2); ctx.fill();
      break;
    case 'luna':
      ctx.beginPath(); ctx.arc(0, 0, s, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'destination-out'; ctx.beginPath(); ctx.arc(s * 0.45, -s * 0.2, s * 0.8, 0, Math.PI * 2); ctx.fill();
      break;
    case 'diamante':
      ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.9, -s * 0.3); ctx.lineTo(s * 0.5, s); ctx.lineTo(-s * 0.5, s); ctx.lineTo(-s * 0.9, -s * 0.3); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.moveTo(-s * 0.5, -s * 0.3); ctx.lineTo(0, -s * 0.9); ctx.lineTo(s * 0.3, -s * 0.4); ctx.closePath(); ctx.fill();
      break;
    case 'mariposa':
      for (const d of [-1, 1]) { ctx.beginPath(); ctx.ellipse(d * s * 0.5, -s * 0.25, s * 0.5, s * 0.4, d * 0.5, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.ellipse(d * s * 0.4, s * 0.35, s * 0.35, s * 0.3, -d * 0.5, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#2b2b2b'; ctx.beginPath(); ctx.ellipse(0, 0, s * 0.1, s * 0.6, 0, 0, Math.PI * 2); ctx.fill();
      break;
    case 'lazo':
      for (const d of [-1, 1]) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(d * s, -s * 0.6); ctx.lineTo(d * s, s * 0.6); ctx.closePath(); ctx.fill(); }
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, s * 0.25, 0, Math.PI * 2); ctx.fill();
      break;
    case 'corona':
      ctx.beginPath(); ctx.moveTo(-s, s * 0.6); ctx.lineTo(-s, -s * 0.3); ctx.lineTo(-s * 0.5, s * 0.1); ctx.lineTo(0, -s); ctx.lineTo(s * 0.5, s * 0.1); ctx.lineTo(s, -s * 0.3); ctx.lineTo(s, s * 0.6); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ff5d8f'; ctx.beginPath(); ctx.arc(0, s * 0.25, s * 0.18, 0, Math.PI * 2); ctx.fill();
      break;
    default: ctx.beginPath(); ctx.arc(0, 0, s, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

// ---------- iconos de herramientas ----------
export function drawToolIcon(ctx, icon, x, y, s, color = '#fff') {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineWidth = s * 0.14; ctx.lineCap = 'round';
  switch (icon) {
    case 'drop': ctx.beginPath(); ctx.moveTo(0, -s * 0.5); ctx.bezierCurveTo(s * 0.5, s * 0.1, s * 0.4, s * 0.5, 0, s * 0.5); ctx.bezierCurveTo(-s * 0.4, s * 0.5, -s * 0.5, s * 0.1, 0, -s * 0.5); ctx.fill(); break;
    case 'brush': ctx.beginPath(); ctx.moveTo(-s * 0.4, s * 0.4); ctx.lineTo(s * 0.2, -s * 0.3); ctx.stroke(); ctx.beginPath(); ctx.ellipse(s * 0.28, -s * 0.38, s * 0.2, s * 0.14, -0.8, 0, Math.PI * 2); ctx.fill(); break;
    case 'eye': ctx.beginPath(); ctx.ellipse(0, 0, s * 0.5, s * 0.28, 0, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, s * 0.13, 0, Math.PI * 2); ctx.fill(); break;
    case 'pen': ctx.beginPath(); ctx.moveTo(-s * 0.4, s * 0.4); ctx.lineTo(s * 0.35, -s * 0.35); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-s * 0.45, s * 0.45); ctx.lineTo(-s * 0.25, s * 0.42); ctx.lineTo(-s * 0.42, s * 0.25); ctx.closePath(); ctx.fill(); break;
    case 'lash': ctx.beginPath(); ctx.ellipse(0, s * 0.15, s * 0.5, s * 0.25, 0, Math.PI, Math.PI * 2); ctx.stroke(); for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * s * 0.2, -s * 0.1 - Math.abs(i) * 0.02 * s); ctx.lineTo(i * s * 0.26, -s * 0.45); ctx.stroke(); } break;
    case 'lips': ctx.beginPath(); ctx.moveTo(-s * 0.5, 0); ctx.quadraticCurveTo(-s * 0.2, -s * 0.4, 0, -s * 0.15); ctx.quadraticCurveTo(s * 0.2, -s * 0.4, s * 0.5, 0); ctx.quadraticCurveTo(0, s * 0.5, -s * 0.5, 0); ctx.fill(); break;
    case 'shine': drawStar(ctx, 0, 0, 4, s * 0.5, s * 0.15); break;
    case 'sparkle': drawStar(ctx, -s * 0.15, s * 0.1, 4, s * 0.35, s * 0.1); drawStar(ctx, s * 0.3, -s * 0.3, 4, s * 0.2, s * 0.06); break;
    case 'star': drawStar(ctx, 0, 0, 5, s * 0.5, s * 0.22); break;
    case 'hair': ctx.beginPath(); ctx.arc(0, -s * 0.1, s * 0.4, Math.PI, 0); ctx.lineTo(s * 0.4, s * 0.45); ctx.lineTo(-s * 0.4, s * 0.45); ctx.closePath(); ctx.fill(); break;
    case 'crown': ctx.beginPath(); ctx.moveTo(-s * 0.5, s * 0.35); ctx.lineTo(-s * 0.5, -s * 0.15); ctx.lineTo(-s * 0.25, s * 0.05); ctx.lineTo(0, -s * 0.45); ctx.lineTo(s * 0.25, s * 0.05); ctx.lineTo(s * 0.5, -s * 0.15); ctx.lineTo(s * 0.5, s * 0.35); ctx.closePath(); ctx.fill(); break;
    case 'cotton': ctx.beginPath(); ctx.arc(-s * 0.15, 0, s * 0.3, 0, Math.PI * 2); ctx.arc(s * 0.15, -s * 0.1, s * 0.3, 0, Math.PI * 2); ctx.arc(s * 0.05, s * 0.18, s * 0.28, 0, Math.PI * 2); ctx.fill(); break;
    case 'water': for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(i * s * 0.3, -s * 0.3); ctx.bezierCurveTo(i * s * 0.3 + s * 0.25, s * 0.05, i * s * 0.3 + s * 0.2, s * 0.3, i * s * 0.3, s * 0.3); ctx.bezierCurveTo(i * s * 0.3 - s * 0.2, s * 0.3, i * s * 0.3 - s * 0.25, s * 0.05, i * s * 0.3, -s * 0.3); ctx.fill(); } break;
    default: ctx.beginPath(); ctx.arc(0, 0, s * 0.4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

export function drawLock(ctx, x, y, s) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath(); ctx.arc(x, y, s, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.fillRect(x - s * 0.35, y - s * 0.05, s * 0.7, s * 0.5);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = s * 0.14;
  ctx.beginPath(); ctx.arc(x, y - s * 0.1, s * 0.25, Math.PI, 0); ctx.stroke();
  ctx.restore();
}

export { fillRoundRect, roundRect, text, GAME, TOOLS, PALETTES, FACE, FACE_W, FACE_H };
