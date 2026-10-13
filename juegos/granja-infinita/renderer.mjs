// Dibujo de Granja Infinita: cielo y clima, parcelas, cultivos procedimentales, HUD.
// No muta el motor; recibe estado y devuelve nada. Mantiene solo estado visual (gotas, nubes).
import { roundRect, fillRoundRect, text, progressBar } from './kit/core/widgets.js';
import { Smooth, lerp, clamp01 } from './kit/core/tween.js';
import { drawStar } from './kit/core/particles.js';
import { GAME, BALANCE } from './content.mjs';

export const LAYOUT = {
  hud: { x: 0, y: 0, w: 480, h: 96 },
  farm: { x: 20, y: 104, w: 440, h: 440 },
  panel: { x: 0, y: 556, w: 480, h: 244 },
  tabs: { x: 12, y: 562, w: 456, h: 38 },
  list: { x: 12, y: 606, w: 456, h: 188 },
};

const WEATHER_STYLE = {
  soleado: { top: '#6ec6ff', bottom: '#b9f0a3', tint: [255, 230, 120, 0], label: 'Soleado', icon: 'sun' },
  lluvia: { top: '#5c6f8a', bottom: '#7fa38a', tint: [60, 80, 120, 0.22], label: 'Lluvia ×1,6 crecimiento', icon: 'rain' },
  sequia: { top: '#f7b267', bottom: '#d9c27a', tint: [230, 140, 40, 0.22], label: 'Sequía: crece lento', icon: 'heat' },
  niebla: { top: '#9aa5b1', bottom: '#aeb9b4', tint: [220, 225, 230, 0.3], label: 'Niebla: vende +25%', icon: 'fog' },
};

export class FarmRenderer {
  constructor() {
    this.t = 0;
    this.drops = Array.from({ length: 90 }, (_, i) => ({ x: (i * 97) % 480, y: (i * 53) % 800, s: 0.6 + (i % 5) * 0.12 }));
    this.clouds = Array.from({ length: 4 }, (_, i) => ({ x: i * 140, y: 20 + (i % 2) * 22, s: 0.8 + (i % 3) * 0.25 }));
    this.tint = [new Smooth(255, 3), new Smooth(230, 3), new Smooth(120, 3), new Smooth(0, 3)];
    this.sky = { top: new Smooth(0, 2), bottom: new Smooth(0, 2) };
    this.rainAlpha = new Smooth(0, 3);
    this.fogAlpha = new Smooth(0, 3);
    this.coinsShown = new Smooth(0, 10);
    this.weatherType = 'soleado';
    this.readyPulse = 0;
  }

  update(dt, farm) {
    this.t += dt;
    const w = farm.s.weather.type;
    this.weatherType = w;
    const st = WEATHER_STYLE[w] || WEATHER_STYLE.soleado;
    st.tint.forEach((v, i) => this.tint[i].set(v));
    this.rainAlpha.set(w === 'lluvia' ? 1 : 0);
    this.fogAlpha.set(w === 'niebla' ? 1 : 0);
    for (const s of this.tint) s.update(dt);
    this.rainAlpha.update(dt); this.fogAlpha.update(dt);
    this.coinsShown.set(farm.s.coins.toNumber());
    this.coinsShown.update(dt);
    if (this.rainAlpha.value > 0.01) for (const d of this.drops) { d.y += dt * 900 * d.s; d.x -= dt * 120 * d.s; if (d.y > 800) { d.y = -10; d.x = Math.random() * 520; } if (d.x < -10) d.x = 490; }
    for (const c of this.clouds) { c.x += dt * 8 * c.s; if (c.x > 540) c.x = -120; }
    this.readyPulse = (Math.sin(this.t * 6) + 1) / 2;
  }

  // ---------- fondo ----------
  drawBackground(ctx) {
    const st = WEATHER_STYLE[this.weatherType] || WEATHER_STYLE.soleado;
    const g = ctx.createLinearGradient(0, 0, 0, GAME.height);
    g.addColorStop(0, st.top);
    g.addColorStop(0.55, st.bottom);
    g.addColorStop(1, '#3e7c3a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, GAME.width, GAME.height);
    // Sol.
    if (this.weatherType !== 'lluvia') {
      ctx.save();
      ctx.translate(420, 60);
      ctx.rotate(this.t * 0.1);
      ctx.fillStyle = this.weatherType === 'sequia' ? 'rgba(255,170,60,0.35)' : 'rgba(255,240,150,0.35)';
      for (let i = 0; i < 8; i++) { ctx.rotate(Math.PI / 4); ctx.fillRect(-6, 30, 12, 34); }
      ctx.restore();
      ctx.fillStyle = this.weatherType === 'sequia' ? '#ffb347' : '#fff3a0';
      ctx.beginPath(); ctx.arc(420, 60, 26, 0, Math.PI * 2); ctx.fill();
    }
    // Nubes.
    ctx.fillStyle = this.weatherType === 'lluvia' ? 'rgba(200,210,225,0.85)' : 'rgba(255,255,255,0.8)';
    for (const c of this.clouds) {
      ctx.beginPath();
      ctx.arc(c.x, c.y + 40, 16 * c.s, 0, Math.PI * 2);
      ctx.arc(c.x + 18 * c.s, c.y + 32, 20 * c.s, 0, Math.PI * 2);
      ctx.arc(c.x + 40 * c.s, c.y + 40, 15 * c.s, 0, Math.PI * 2);
      ctx.fill();
    }
    // Colinas lejanas.
    ctx.fillStyle = 'rgba(60,130,70,0.55)';
    ctx.beginPath(); ctx.moveTo(0, 110);
    for (let x = 0; x <= 480; x += 20) ctx.lineTo(x, 100 + Math.sin(x / 70 + 1) * 10 + Math.sin(x / 31) * 4);
    ctx.lineTo(480, 140); ctx.lineTo(0, 140); ctx.fill();
  }

  drawWeatherOverlay(ctx) {
    const [r, g, b, a] = this.tint.map((s) => s.value);
    if (a > 0.005) { ctx.fillStyle = `rgba(${r | 0},${g | 0},${b | 0},${a})`; ctx.fillRect(0, 0, GAME.width, GAME.height); }
    if (this.rainAlpha.value > 0.01) {
      ctx.save();
      ctx.globalAlpha = this.rainAlpha.value * 0.6;
      ctx.strokeStyle = '#dbe9ff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (const d of this.drops) { ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - 3 * d.s, d.y + 14 * d.s); }
      ctx.stroke();
      ctx.restore();
    }
    if (this.fogAlpha.value > 0.01) {
      ctx.save();
      ctx.globalAlpha = this.fogAlpha.value * 0.35;
      for (let i = 0; i < 3; i++) {
        const y = 200 + i * 140 + Math.sin(this.t * 0.4 + i) * 20;
        const grad = ctx.createLinearGradient(0, y - 60, 0, y + 60);
        grad.addColorStop(0, 'rgba(255,255,255,0)'); grad.addColorStop(0.5, 'rgba(255,255,255,0.9)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = grad; ctx.fillRect(0, y - 60, GAME.width, 120);
      }
      ctx.restore();
    }
  }

  // ---------- granja ----------
  tileRect(farm, i) {
    const n = Math.round(Math.sqrt(farm.s.plots.length));
    const size = LAYOUT.farm.w / n;
    const col = i % n, row = Math.floor(i / n);
    return { x: LAYOUT.farm.x + col * size, y: LAYOUT.farm.y + row * size, w: size, h: size };
  }

  plotAt(farm, px, py) {
    const f = LAYOUT.farm;
    if (px < f.x || px >= f.x + f.w || py < f.y || py >= f.y + f.h) return -1;
    const n = Math.round(Math.sqrt(farm.s.plots.length));
    const size = f.w / n;
    return Math.floor((py - f.y) / size) * n + Math.floor((px - f.x) / size);
  }

  drawFarm(ctx, farm, { hoverIndex = -1 } = {}) {
    const f = LAYOUT.farm;
    // Marco de césped.
    fillRoundRect(ctx, f.x - 10, f.y - 10, f.w + 20, f.h + 20, 18, this.weatherType === 'sequia' ? '#9c9a4a' : '#4f9a3f');
    const dry = this.weatherType === 'sequia';
    for (let i = 0; i < farm.s.plots.length; i++) {
      const p = farm.s.plots[i];
      const r = this.tileRect(farm, i);
      const pad = Math.max(2, r.w * 0.06);
      const ready = farm.isReady(p);
      // Tierra.
      fillRoundRect(ctx, r.x + pad, r.y + pad, r.w - pad * 2, r.h - pad * 2, r.w * 0.14, dry ? '#a67c52' : '#7a4e2d');
      // Surcos.
      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      for (let k = 1; k < 4; k++) { const y = r.y + pad + ((r.h - pad * 2) * k) / 4; ctx.beginPath(); ctx.moveTo(r.x + pad * 2, y); ctx.lineTo(r.x + r.w - pad * 2, y); ctx.stroke(); }
      ctx.restore();
      if (i === hoverIndex) { ctx.save(); ctx.globalAlpha = 0.25; fillRoundRect(ctx, r.x + pad, r.y + pad, r.w - pad * 2, r.h - pad * 2, r.w * 0.14, '#fff'); ctx.restore(); }
      if (p.crop) {
        const crop = farm.crop(p.crop);
        const k = clamp01(p.t / crop.time);
        const bounce = ready ? Math.sin(this.t * 7 + i) * r.w * 0.03 : 0;
        if (ready) {
          ctx.save();
          ctx.globalAlpha = 0.35 + this.readyPulse * 0.35;
          fillRoundRect(ctx, r.x + pad, r.y + pad, r.w - pad * 2, r.h - pad * 2, r.w * 0.14, '#ffe66d');
          ctx.restore();
        }
        drawCrop(ctx, crop, k, r.x + r.w / 2, r.y + r.h * 0.62 + bounce, r.w * 0.78, this.t + i);
        if (!ready && r.w > 50) {
          progressBar(ctx, r.x + pad * 2, r.y + r.h - pad * 2 - 5, r.w - pad * 4, 4, k, { fg: crop.color, bg: 'rgba(0,0,0,0.35)' });
        }
      }
      if (p.bug) drawBug(ctx, r.x + r.w / 2 + Math.sin(this.t * 9 + i) * r.w * 0.15, r.y + r.h * 0.45 + Math.cos(this.t * 7 + i) * r.h * 0.1, r.w * 0.22, this.t);
    }
  }

  // ---------- HUD ----------
  drawHud(ctx, farm, { rate }) {
    const h = LAYOUT.hud;
    fillRoundRect(ctx, 8, 8, 464, 84, 18, 'rgba(20,30,20,0.66)');
    // Monedas.
    drawCoin(ctx, 34, 32, 12);
    text(ctx, formatNumber(this.coinsShown.value, farm.s.coins), 52, 32, { size: 24, weight: '800', color: '#ffe66d', shadow: 'rgba(0,0,0,0.5)' });
    text(ctx, rate.isZero() ? 'toca para cosechar' : `${rate.format()}/s automático`, 52, 56, { size: 13, color: 'rgba(255,255,255,0.85)' });
    // Gemas.
    drawGem(ctx, 372, 32, 11);
    text(ctx, String(farm.s.gems), 388, 32, { size: 20, weight: '800', color: '#9bf6ff', shadow: 'rgba(0,0,0,0.5)', maxWidth: 40 });
    // Clima.
    const st = WEATHER_STYLE[this.weatherType] || WEATHER_STYLE.soleado;
    text(ctx, st.label, 464, 56, { size: 12, align: 'right', color: 'rgba(255,255,255,0.85)' });
    // Era y progreso.
    text(ctx, eraTitle(farm), 24, 78, { size: 13, weight: '700', color: '#fff', maxWidth: 170 });
    const k = farm.eraProgress();
    progressBar(ctx, 200, 72, 256, 12, k, { fg: k >= 1 ? '#ffd166' : '#7bd389', label: k >= 1 ? '¡Era lista!' : `${Math.floor(k * 100)}% → ${farm.eraCost().format()}` });
    void h;
  }
}

export function eraTitle(farm) {
  const s = farm.s;
  return `Era ${s.era + 1}: ${farm.eraName()}${s.medals ? ` · ${s.medals} medallas` : ''}`;
}

export function formatNumber(shown, real) {
  // Muestra el valor animado si está cerca del real; con números enormes usa Big directamente.
  if (real.e > 14 || !Number.isFinite(shown)) return real.format();
  const BigCtor = real.constructor;
  return new BigCtor(Math.max(0, shown), 0).format();
}

// ---------- sprites procedimentales ----------
export function drawCrop(ctx, crop, k, cx, cy, s, t) {
  ctx.save();
  ctx.translate(cx, cy);
  const sway = Math.sin(t * 2) * 0.04 * k;
  ctx.rotate(sway);
  // Sombra.
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(0, s * 0.08, s * 0.28 * (0.4 + k * 0.6), s * 0.06, 0, 0, Math.PI * 2); ctx.fill();
  const leaf = crop.leaf || '#4caf50';
  const scale = 0.35 + k * 0.65;
  ctx.scale(scale, scale);
  if (k < 0.3) { // brote
    ctx.strokeStyle = leaf; ctx.lineWidth = s * 0.06; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -s * 0.25); ctx.stroke();
    ctx.fillStyle = leaf;
    ctx.beginPath(); ctx.ellipse(-s * 0.1, -s * 0.22, s * 0.12, s * 0.06, -0.6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(s * 0.1, -s * 0.22, s * 0.12, s * 0.06, 0.6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    return;
  }
  const mature = k >= 1;
  switch (crop.shape) {
    case 'root': {
      ctx.strokeStyle = leaf; ctx.lineWidth = s * 0.05; ctx.lineCap = 'round';
      for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(i * s * 0.08, -s * 0.2, i * s * 0.14, -s * 0.38); ctx.stroke(); }
      if (k > 0.6) { ctx.fillStyle = crop.color; ctx.beginPath(); ctx.moveTo(-s * 0.13, 0); ctx.lineTo(s * 0.13, 0); ctx.lineTo(0, s * 0.3 * (k - 0.5) * 2); ctx.closePath(); ctx.fill(); }
      break;
    }
    case 'stalk': {
      ctx.strokeStyle = leaf; ctx.lineWidth = s * 0.045; ctx.lineCap = 'round';
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath(); ctx.moveTo(i * s * 0.08, 0); ctx.lineTo(i * s * 0.1, -s * 0.42); ctx.stroke();
        if (k > 0.6) { ctx.fillStyle = crop.color; ctx.beginPath(); ctx.ellipse(i * s * 0.1, -s * 0.44, s * 0.05, s * 0.12, 0, 0, Math.PI * 2); ctx.fill(); }
      }
      break;
    }
    case 'cob': {
      ctx.strokeStyle = leaf; ctx.lineWidth = s * 0.07; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -s * 0.46); ctx.stroke();
      ctx.fillStyle = leaf;
      ctx.beginPath(); ctx.ellipse(-s * 0.14, -s * 0.2, s * 0.16, s * 0.06, -0.9, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(s * 0.14, -s * 0.3, s * 0.16, s * 0.06, 0.9, 0, Math.PI * 2); ctx.fill();
      if (k > 0.6) { ctx.fillStyle = crop.color; ctx.beginPath(); ctx.ellipse(s * 0.09, -s * 0.22, s * 0.07, s * 0.17, 0.25, 0, Math.PI * 2); ctx.fill(); }
      break;
    }
    case 'round': {
      ctx.strokeStyle = leaf; ctx.lineWidth = s * 0.05; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-s * 0.25, 0); ctx.quadraticCurveTo(0, -s * 0.3, s * 0.25, -s * 0.05); ctx.stroke();
      ctx.fillStyle = leaf;
      ctx.beginPath(); ctx.ellipse(-s * 0.18, -s * 0.2, s * 0.13, s * 0.07, -0.5, 0, Math.PI * 2); ctx.fill();
      if (k > 0.5) {
        const rr = s * 0.22 * (k - 0.4) / 0.6;
        ctx.fillStyle = crop.color; ctx.beginPath(); ctx.arc(s * 0.08, -rr * 0.6, rr, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.beginPath(); ctx.arc(s * 0.02, -rr * 0.9, rr * 0.3, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case 'berry': {
      ctx.strokeStyle = leaf; ctx.lineWidth = s * 0.05; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -s * 0.3); ctx.stroke();
      ctx.fillStyle = leaf;
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(Math.cos(i * 2.1) * s * 0.15, -s * 0.3 + Math.sin(i * 2.1) * s * 0.08, s * 0.12, s * 0.06, i, 0, Math.PI * 2); ctx.fill(); }
      if (k > 0.6) { ctx.fillStyle = crop.color; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(Math.cos(i * 1.26) * s * 0.11, -s * 0.2 + Math.sin(i * 1.26) * s * 0.09, s * 0.06, 0, Math.PI * 2); ctx.fill(); } }
      break;
    }
    case 'flower':
    default: {
      ctx.strokeStyle = leaf; ctx.lineWidth = s * 0.05; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -s * 0.36); ctx.stroke();
      if (k > 0.6) {
        ctx.fillStyle = crop.color;
        for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + t * 0.3; ctx.beginPath(); ctx.ellipse(Math.cos(a) * s * 0.1, -s * 0.38 + Math.sin(a) * s * 0.1, s * 0.08, s * 0.05, a, 0, Math.PI * 2); ctx.fill(); }
        ctx.fillStyle = '#5a3e1b'; ctx.beginPath(); ctx.arc(0, -s * 0.38, s * 0.06, 0, Math.PI * 2); ctx.fill();
      } else { ctx.fillStyle = leaf; ctx.beginPath(); ctx.arc(0, -s * 0.36, s * 0.07, 0, Math.PI * 2); ctx.fill(); }
      break;
    }
  }
  if (mature) {
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    const a = t * 3;
    drawStar(ctx, Math.cos(a) * s * 0.26, -s * 0.5 + Math.sin(a * 1.3) * s * 0.06, 4, s * 0.06, s * 0.025);
  }
  ctx.restore();
}

export function drawBug(ctx, x, y, s, t) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#2b2b2b';
  ctx.beginPath(); ctx.ellipse(0, 0, s * 0.5, s * 0.35, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#d62828';
  ctx.beginPath(); ctx.ellipse(0, s * 0.02, s * 0.42, s * 0.28, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#111';
  for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc((i % 2 ? 1 : -1) * s * 0.18, (i < 2 ? -1 : 1) * s * 0.1, s * 0.06, 0, Math.PI * 2); ctx.fill(); }
  ctx.strokeStyle = '#111'; ctx.lineWidth = Math.max(1, s * 0.05);
  for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(i * s * 0.15, -s * 0.3); ctx.lineTo(i * s * 0.22 + Math.sin(t * 20) * 2, -s * 0.5); ctx.stroke(); }
  ctx.restore();
}

export function drawCoin(ctx, x, y, r) {
  ctx.save();
  ctx.fillStyle = '#e0a800'; ctx.beginPath(); ctx.arc(x, y + 1.5, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffd60a'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff3a0'; ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.3, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

export function drawGem(ctx, x, y, r) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#48cae4';
  ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(r * 0.9, -r * 0.3); ctx.lineTo(r * 0.55, r); ctx.lineTo(-r * 0.55, r); ctx.lineTo(-r * 0.9, -r * 0.3); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath(); ctx.moveTo(-r * 0.5, -r * 0.3); ctx.lineTo(0, -r * 0.9); ctx.lineTo(r * 0.3, -r * 0.4); ctx.closePath(); ctx.fill();
  ctx.restore();
}

export function drawIcon(ctx, kind, x, y, s, color = '#fff') {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineWidth = s * 0.14; ctx.lineCap = 'round';
  switch (kind) {
    case 'tool': ctx.beginPath(); ctx.moveTo(-s * 0.4, s * 0.4); ctx.lineTo(s * 0.2, -s * 0.2); ctx.stroke(); ctx.fillRect(s * 0.05, -s * 0.5, s * 0.45, s * 0.3); break;
    case 'water': ctx.beginPath(); ctx.moveTo(0, -s * 0.5); ctx.bezierCurveTo(s * 0.5, s * 0.1, s * 0.4, s * 0.5, 0, s * 0.5); ctx.bezierCurveTo(-s * 0.4, s * 0.5, -s * 0.5, s * 0.1, 0, -s * 0.5); ctx.fill(); break;
    case 'leaf': ctx.beginPath(); ctx.ellipse(0, 0, s * 0.5, s * 0.25, -0.7, 0, Math.PI * 2); ctx.fill(); break;
    case 'worker': ctx.beginPath(); ctx.arc(0, -s * 0.25, s * 0.2, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(0, s * 0.35, s * 0.4, Math.PI, 0); ctx.fill(); break;
    case 'seed': for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse((i - 1) * s * 0.3, (i % 2) * s * 0.2, s * 0.12, s * 0.2, 0.4, 0, Math.PI * 2); ctx.fill(); } break;
    case 'market': ctx.fillRect(-s * 0.45, -s * 0.1, s * 0.9, s * 0.5); ctx.beginPath(); ctx.moveTo(-s * 0.5, -s * 0.1); ctx.lineTo(0, -s * 0.5); ctx.lineTo(s * 0.5, -s * 0.1); ctx.fill(); break;
    case 'silo': ctx.fillRect(-s * 0.3, -s * 0.2, s * 0.6, s * 0.7); ctx.beginPath(); ctx.arc(0, -s * 0.2, s * 0.3, Math.PI, 0); ctx.fill(); break;
    case 'gem': drawGem(ctx, 0, 0, s * 0.5); break;
    case 'coin': drawCoin(ctx, 0, 0, s * 0.45); break;
    case 'lock': ctx.fillRect(-s * 0.35, -s * 0.05, s * 0.7, s * 0.5); ctx.beginPath(); ctx.arc(0, -s * 0.1, s * 0.25, Math.PI, 0); ctx.stroke(); break;
    case 'check': ctx.beginPath(); ctx.moveTo(-s * 0.4, 0); ctx.lineTo(-s * 0.1, s * 0.3); ctx.lineTo(s * 0.45, -s * 0.35); ctx.stroke(); break;
    case 'play': ctx.beginPath(); ctx.moveTo(-s * 0.3, -s * 0.4); ctx.lineTo(s * 0.4, 0); ctx.lineTo(-s * 0.3, s * 0.4); ctx.closePath(); ctx.fill(); break;
    default: break;
  }
  ctx.restore();
}

export function drawSplashField(ctx, t) {
  const g = ctx.createLinearGradient(0, 0, 0, GAME.height);
  const k = clamp01(t / 2);
  g.addColorStop(0, `rgb(${lerp(40, 110, k)|0},${lerp(30, 180, k)|0},${lerp(80, 255, k)|0})`);
  g.addColorStop(0.6, `rgb(${lerp(120, 185, k)|0},${lerp(90, 240, k)|0},${lerp(60, 163, k)|0})`);
  g.addColorStop(1, '#3e7c3a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, GAME.width, GAME.height);
  // Sol que sale.
  const sy = lerp(520, 260, clamp01(t / 2.2));
  ctx.fillStyle = 'rgba(255,230,120,0.25)'; ctx.beginPath(); ctx.arc(240, sy, 120, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff3a0'; ctx.beginPath(); ctx.arc(240, sy, 70, 0, Math.PI * 2); ctx.fill();
  // Colinas.
  ctx.fillStyle = '#4f9a3f'; ctx.beginPath(); ctx.moveTo(0, 520);
  for (let x = 0; x <= 480; x += 16) ctx.lineTo(x, 500 + Math.sin(x / 60) * 24);
  ctx.lineTo(480, 800); ctx.lineTo(0, 800); ctx.fill();
  ctx.fillStyle = '#3e7c3a'; ctx.beginPath(); ctx.moveTo(0, 600);
  for (let x = 0; x <= 480; x += 16) ctx.lineTo(x, 590 + Math.cos(x / 45) * 18);
  ctx.lineTo(480, 800); ctx.lineTo(0, 800); ctx.fill();
  // Surcos.
  ctx.strokeStyle = 'rgba(90,50,20,0.5)'; ctx.lineWidth = 6;
  for (let i = 0; i < 7; i++) { ctx.beginPath(); ctx.moveTo(240 + (i - 3) * 20, 640); ctx.lineTo(240 + (i - 3) * 110, 800); ctx.stroke(); }
}

export { roundRect, fillRoundRect, text, progressBar, BALANCE };
