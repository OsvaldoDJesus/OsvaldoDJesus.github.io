// Dibujo de Fusión de Planetas: fondo espacial, recipiente, planetas procedimentales por skin, HUD.
import { fillRoundRect, roundRect, text } from './kit/core/widgets.js';
import { Smooth, clamp01, lerp } from './kit/core/tween.js';
import { drawStar } from './kit/core/particles.js';
import { GAME, WORLD, TIERS, SKINS } from './content.mjs';

export class SpaceRenderer {
  constructor() {
    this.t = 0;
    this.stars = Array.from({ length: 120 }, (_, i) => ({ x: (i * 173) % 480, y: (i * 97) % 800, z: 0.3 + ((i * 7) % 10) / 10, tw: (i % 13) / 13 }));
    this.hue = new Smooth(260, 1.5);
    this.dangerGlow = new Smooth(0, 6);
    this.skin = SKINS[0];
  }

  setSkin(id) { this.skin = SKINS.find((s) => s.id === id) || SKINS[0]; }

  update(dt, game) {
    this.t += dt;
    if (game) {
      this.hue.set(260 + game.largestTier * 14);
      this.dangerGlow.set(game.dangerLevel());
    }
    this.hue.update(dt); this.dangerGlow.update(dt);
    for (const s of this.stars) { s.y += dt * 6 * s.z; if (s.y > 800) s.y -= 800; }
  }

  drawBackground(ctx) {
    const [c0, c1] = this.skin.bg;
    const g = ctx.createLinearGradient(0, 0, 0, GAME.height);
    g.addColorStop(0, c0); g.addColorStop(1, c1);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, GAME.width, GAME.height);
    // Nebulosa que cambia de tono con el planeta más grande conseguido.
    const neb = ctx.createRadialGradient(240, 460, 20, 240, 460, 420);
    neb.addColorStop(0, `hsla(${this.hue.value | 0}, 70%, 55%, 0.22)`);
    neb.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = neb;
    ctx.fillRect(0, 0, GAME.width, GAME.height);
    for (const s of this.stars) {
      const a = 0.35 + 0.5 * Math.abs(Math.sin(this.t * (0.6 + s.tw) + s.x));
      ctx.fillStyle = `rgba(255,255,255,${a * s.z})`;
      ctx.fillRect(s.x, s.y, 1.2 + s.z, 1.2 + s.z);
    }
  }

  drawBucket(ctx) {
    const x = WORLD.left - 8, y = WORLD.top, w = WORLD.right - WORLD.left + 16, h = WORLD.floor - WORLD.top + 10;
    ctx.save();
    // Cristal.
    fillRoundRect(ctx, x, y, w, h, 22, 'rgba(255,255,255,0.06)');
    roundRect(ctx, x, y, w, h, 22);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.stroke();
    // Brillo inferior.
    const g = ctx.createLinearGradient(0, WORLD.floor - 120, 0, WORLD.floor + 10);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,0.12)');
    ctx.fillStyle = g;
    ctx.fillRect(x + 3, WORLD.floor - 120, w - 6, 130);
    // Línea de peligro.
    const d = this.dangerGlow.value;
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 10);
    ctx.setLineDash([10, 8]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = d > 0.02 ? `rgba(255,${(120 - d * 120) | 0},${(120 - d * 120) | 0},${0.5 + d * 0.5 * pulse})` : 'rgba(255,255,255,0.25)';
    ctx.beginPath(); ctx.moveTo(WORLD.left, WORLD.dangerY); ctx.lineTo(WORLD.right, WORLD.dangerY); ctx.stroke();
    ctx.setLineDash([]);
    if (d > 0.05) {
      ctx.fillStyle = `rgba(255,60,60,${d * 0.18 * pulse})`;
      ctx.fillRect(WORLD.left, WORLD.top, WORLD.right - WORLD.left, WORLD.dangerY - WORLD.top);
    }
    ctx.restore();
  }

  drawBodies(ctx, game) {
    for (const b of game.bodies) drawPlanet(ctx, b.tier, b.x, b.y, b.r, this.skin, { squash: b.squash, t: this.t, seed: b.id });
  }

  drawGhost(ctx, game) {
    if (!game.canDrop) return;
    const r = game.currentRadius;
    ctx.save();
    ctx.setLineDash([6, 10]);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(game.aimX, WORLD.dropY + r); ctx.lineTo(game.aimX, WORLD.floor); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.95;
    drawPlanet(ctx, game.current, game.aimX, WORLD.dropY, r, this.skin, { t: this.t, seed: 99 });
    ctx.restore();
  }

  drawHud(ctx, game, { best, modeLabel, coins }) {
    text(ctx, String(game.score), 240, 48, { size: 44, weight: '900', align: 'center', color: '#fff', shadow: 'rgba(0,0,0,0.5)' });
    text(ctx, `Récord ${best}`, 240, 84, { size: 14, align: 'center', color: 'rgba(255,255,255,0.75)' });
    text(ctx, modeLabel, 16, 24, { size: 13, weight: '700', color: 'rgba(255,255,255,0.8)' });
    text(ctx, `🪙 ${coins}`, 16, 48, { size: 14, weight: '700', color: '#ffe66d', shadow: 'rgba(0,0,0,0.4)' });
    // Siguiente.
    text(ctx, 'Siguiente', 424, 20, { size: 12, align: 'center', color: 'rgba(255,255,255,0.7)' });
    fillRoundRect(ctx, 396, 30, 56, 56, 14, 'rgba(255,255,255,0.08)');
    drawPlanet(ctx, game.next, 424, 58, Math.min(20, TIERS[game.next].radius * 0.5), this.skin, { t: this.t, seed: 7 });
    // Combo.
    if (game.combo > 1 && game.comboTimer > 0) {
      const k = clamp01(game.comboTimer / WORLD.comboWindow);
      ctx.save();
      ctx.globalAlpha = Math.min(1, k * 2);
      text(ctx, `¡Combo ×${game.combo}!`, 240, 120, { size: 26 + (1 - k) * 6, weight: '900', align: 'center', color: '#ffd166', shadow: 'rgba(0,0,0,0.6)' });
      ctx.restore();
    }
  }

  // Cadena de evolución bajo el recipiente, con el mayor conseguido resaltado.
  drawChain(ctx, game) {
    const n = TIERS.length;
    const gap = 42;
    const x0 = 240 - ((n - 1) * gap) / 2;
    for (let i = 0; i < n; i++) {
      const x = x0 + i * gap, y = 772;
      const reached = i <= game.largestTier;
      ctx.save();
      ctx.globalAlpha = reached ? 1 : 0.3;
      drawPlanet(ctx, i, x, y, 11 + i * 0.6, this.skin, { t: this.t, seed: i, simple: true });
      ctx.restore();
      if (i < n - 1) { ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(x + 16, y - 1, gap - 32, 2); }
    }
  }
}

// ---------- planetas procedimentales ----------
function shade(hex, k) {
  // Aclara (k>0) u oscurece (k<0) un color #rrggbb.
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = (c) => Math.max(0, Math.min(255, Math.round(k > 0 ? c + (255 - c) * k : c * (1 + k))));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

export function drawPlanet(ctx, tier, x, y, r, skin = SKINS[0], { squash = 0, t = 0, seed = 0, simple = false } = {}) {
  const color = skin.colors[tier] || '#fff';
  ctx.save();
  ctx.translate(x, y);
  if (squash > 0) ctx.scale(1 + squash * 0.12, 1 - squash * 0.12);
  const isSun = skin.id === 'planetas' && tier === TIERS.length - 1;
  if (isSun && !simple) {
    ctx.shadowColor = '#ffb703';
    ctx.shadowBlur = 40 + Math.sin(t * 3) * 8;
  }
  // Anillo trasero de Saturno.
  if (skin.id === 'planetas' && tier === 7 && !simple) drawRing(ctx, r, color, true);
  const g = ctx.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.1, 0, 0, r);
  g.addColorStop(0, shade(color, 0.45));
  g.addColorStop(0.6, color);
  g.addColorStop(1, shade(color, -0.45));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
  if (!simple) {
    ctx.save();
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.clip();
    if (skin.id === 'planetas') drawPlanetDetail(ctx, tier, r, color, t, seed);
    else if (skin.id === 'gemas') drawFacets(ctx, r, color);
    else drawFace(ctx, r, t, seed);
    ctx.restore();
    if (skin.id === 'planetas' && tier === 7) drawRing(ctx, r, color, false);
  }
  // Brillo especular.
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath(); ctx.ellipse(-r * 0.35, -r * 0.4, r * 0.22, r * 0.12, -0.7, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawRing(ctx, r, color, back) {
  ctx.save();
  ctx.rotate(-0.35);
  ctx.strokeStyle = shade(color, back ? -0.2 : 0.2);
  ctx.lineWidth = r * 0.22;
  ctx.beginPath();
  if (back) ctx.ellipse(0, 0, r * 1.7, r * 0.45, 0, Math.PI, Math.PI * 2);
  else ctx.ellipse(0, 0, r * 1.7, r * 0.45, 0, 0, Math.PI);
  ctx.stroke();
  ctx.restore();
}

function drawPlanetDetail(ctx, tier, r, color, t, seed) {
  const dark = shade(color, -0.3), light = shade(color, 0.3);
  const s = (k) => Math.sin(seed * 12.9898 + k * 78.233) * 0.5 + 0.5;
  switch (tier) {
    case 0: case 1: // cráteres
      ctx.fillStyle = dark;
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc((s(i) - 0.5) * r * 1.4, (s(i + 9) - 0.5) * r * 1.4, r * (0.1 + s(i + 3) * 0.14), 0, Math.PI * 2); ctx.fill(); }
      break;
    case 2: // Marte: casquete polar y mancha
      ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.beginPath(); ctx.ellipse(0, -r * 0.85, r * 0.5, r * 0.22, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = dark; ctx.beginPath(); ctx.ellipse(r * 0.2, r * 0.15, r * 0.45, r * 0.25, 0.4, 0, Math.PI * 2); ctx.fill();
      break;
    case 3: // Venus: bandas suaves
      ctx.strokeStyle = light; ctx.lineWidth = r * 0.12;
      for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.ellipse(0, i * r * 0.35, r * 1.1, r * 0.18, 0.2, 0, Math.PI * 2); ctx.stroke(); }
      break;
    case 4: // Tierra: continentes y nubes
      ctx.fillStyle = '#4caf50';
      ctx.beginPath(); ctx.ellipse(-r * 0.3, -r * 0.1, r * 0.4, r * 0.3, 0.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(r * 0.35, r * 0.3, r * 0.3, r * 0.22, -0.4, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = r * 0.1; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-r * 0.6, r * 0.5); ctx.quadraticCurveTo(0, r * 0.3, r * 0.5, r * 0.6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-r * 0.2, -r * 0.6); ctx.lineTo(r * 0.4, -r * 0.5); ctx.stroke();
      break;
    case 5: // Neptuno: gran mancha oscura
      ctx.fillStyle = dark; ctx.beginPath(); ctx.ellipse(r * 0.2, -r * 0.1, r * 0.35, r * 0.2, 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = light; ctx.lineWidth = r * 0.08; ctx.beginPath(); ctx.ellipse(0, r * 0.45, r * 1.1, r * 0.12, 0, 0, Math.PI * 2); ctx.stroke();
      break;
    case 6: // Urano: anillo vertical tenue
      ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = r * 0.08;
      ctx.beginPath(); ctx.ellipse(0, 0, r * 0.3, r * 1.5, 0.3, 0, Math.PI * 2); ctx.stroke();
      break;
    case 7: break; // Saturno: anillo fuera del clip
    case 8: // Júpiter: bandas y mancha roja
      for (let i = -3; i <= 3; i++) { ctx.fillStyle = i % 2 ? dark : light; ctx.globalAlpha = 0.5; ctx.fillRect(-r, i * r * 0.28 - r * 0.1, r * 2, r * 0.2); }
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#c1440e'; ctx.beginPath(); ctx.ellipse(r * 0.3, r * 0.25, r * 0.3, r * 0.17, 0, 0, Math.PI * 2); ctx.fill();
      break;
    case 9: // Sol: corona
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      for (let i = 0; i < 7; i++) { const a = t * 0.8 + i * 0.9; ctx.beginPath(); ctx.arc(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5, r * 0.18, 0, Math.PI * 2); ctx.fill(); }
      break;
    default: break;
  }
}

function drawFace(ctx, r, t, seed) {
  const blink = ((t * 0.7 + seed) % 4) > 3.85;
  ctx.fillStyle = '#2b2b2b';
  const ey = -r * 0.05, ex = r * 0.32, er = r * 0.1;
  if (blink) { ctx.lineWidth = Math.max(1.5, r * 0.06); ctx.strokeStyle = '#2b2b2b'; ctx.beginPath(); ctx.moveTo(-ex - er, ey); ctx.lineTo(-ex + er, ey); ctx.moveTo(ex - er, ey); ctx.lineTo(ex + er, ey); ctx.stroke(); }
  else {
    ctx.beginPath(); ctx.arc(-ex, ey, er, 0, Math.PI * 2); ctx.arc(ex, ey, er, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-ex + er * 0.3, ey - er * 0.3, er * 0.35, 0, Math.PI * 2); ctx.arc(ex + er * 0.3, ey - er * 0.3, er * 0.35, 0, Math.PI * 2); ctx.fill();
  }
  ctx.strokeStyle = '#2b2b2b'; ctx.lineWidth = Math.max(1.5, r * 0.06); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(0, r * 0.2, r * 0.22, 0.2, Math.PI - 0.2); ctx.stroke();
  ctx.fillStyle = 'rgba(255,120,150,0.45)';
  ctx.beginPath(); ctx.arc(-r * 0.5, r * 0.22, r * 0.12, 0, Math.PI * 2); ctx.arc(r * 0.5, r * 0.22, r * 0.12, 0, Math.PI * 2); ctx.fill();
}

function drawFacets(ctx, r, color) {
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = Math.max(1, r * 0.04);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); ctx.stroke(); }
  ctx.beginPath();
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + Math.PI / 6; const px = Math.cos(a) * r * 0.55, py = Math.sin(a) * r * 0.55; if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
  ctx.closePath(); ctx.stroke();
  ctx.fillStyle = shade(color, 0.5); ctx.globalAlpha = 0.35; ctx.fill();
}

export function drawSplashScene(ctx, t, skin = SKINS[0]) {
  const g = ctx.createLinearGradient(0, 0, 0, GAME.height);
  g.addColorStop(0, skin.bg[0]); g.addColorStop(1, skin.bg[1]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, GAME.width, GAME.height);
  for (let i = 0; i < 80; i++) { ctx.fillStyle = `rgba(255,255,255,${0.3 + 0.5 * Math.abs(Math.sin(t + i))})`; ctx.fillRect((i * 173) % 480, (i * 97 + t * 10) % 800, 2, 2); }
  // Planetas orbitando.
  for (let i = 0; i < 6; i++) {
    const a = t * (0.4 + i * 0.08) + i * 1.1;
    const rr = 120 + i * 28;
    drawPlanet(ctx, i + 2, 240 + Math.cos(a) * rr, 330 + Math.sin(a) * rr * 0.45, 14 + i * 4, skin, { t, seed: i });
  }
  drawPlanet(ctx, TIERS.length - 1, 240, 330, 70 + Math.sin(t * 2) * 3, skin, { t, seed: 1 });
  ctx.fillStyle = '#fff';
  drawStar(ctx, 90 + Math.sin(t) * 10, 140, 4, 10, 4);
  drawStar(ctx, 390, 180 + Math.cos(t) * 10, 4, 7, 3);
}

export { text, fillRoundRect, lerp };
