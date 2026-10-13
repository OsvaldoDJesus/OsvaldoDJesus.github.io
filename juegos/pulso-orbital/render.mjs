// Renderizador del lienzo. Solo dibuja: recibe el estado del juego y de los efectos y no modifica ninguno.
// Identidad arcade: formas planas con contorno oscuro y filo marfil, sin resplandores (nada de shadowBlur) y con el
// fondo precompuesto una sola vez por tamaño. Los colores se leen de las variables CSS (fuente única de la paleta).
import { W, H, CORE } from './engine.mjs';

export const PALETTE_VARS = Object.freeze({
  carbon900: '--carbon-900', carbon800: '--carbon-800', carbon700: '--carbon-700', carbon600: '--carbon-600',
  ivory: '--ivory', ivoryDim: '--ivory-dim', orange: '--orange', orangeHi: '--orange-hi', orangeDeep: '--orange-deep',
  cobalt: '--cobalt', cobaltHi: '--cobalt-hi', cobaltDeep: '--cobalt-deep', rust: '--rust', rustHi: '--rust-hi', rustDeep: '--rust-deep',
});

export const FALLBACK_PALETTE = Object.freeze({
  carbon900: '#14120f', carbon800: '#1c1915', carbon700: '#28241e', carbon600: '#38322a',
  ivory: '#f0e6cf', ivoryDim: '#bdb199', orange: '#f4721b', orangeHi: '#ff9440', orangeDeep: '#a8480c',
  cobalt: '#3a6be0', cobaltHi: '#86a6f7', cobaltDeep: '#243f8f', rust: '#c4502d', rustHi: '#e5714a', rustDeep: '#7a2d17',
});

export function readPalette(root = globalThis.document?.documentElement) {
  const palette = { ...FALLBACK_PALETTE };
  if (!root || typeof getComputedStyle !== 'function') return palette;
  const styles = getComputedStyle(root);
  for (const [key, name] of Object.entries(PALETTE_VARS)) {
    const value = styles.getPropertyValue(name).trim();
    if (value) palette[key] = value;
  }
  return palette;
}

// Silueta propia de cada enemigo: se distinguen por forma, no solo por color.
const ENEMY_STYLE = {
  drone: { sides: 4, rot: Math.PI / 4, fill: 'rust' },
  dart: { sides: 3, rot: Math.PI / 2, fill: 'rustHi' },
  brute: { sides: 6, rot: 0, fill: 'rustDeep' },
  swarm: { sides: 5, rot: -Math.PI / 2, fill: 'rustHi' },
  splitter: { sides: 4, rot: 0, fill: 'rust' },
  shard: { sides: 3, rot: Math.PI / 2, fill: 'rustHi' },
  boss: { sides: 8, rot: Math.PI / 8, fill: 'rustDeep' },
};

function polygon(c, cx, cy, radius, sides, rotation) {
  c.beginPath();
  for (let i = 0; i < sides; i++) {
    const angle = rotation + (i * Math.PI * 2) / sides;
    const px = cx + Math.cos(angle) * radius;
    const py = cy + Math.sin(angle) * radius;
    if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
  }
  c.closePath();
}

function bracket(c, x, y, size, dx, dy) {
  c.beginPath();
  c.moveTo(x + dx * size, y);
  c.lineTo(x, y);
  c.lineTo(x, y + dy * size);
  c.stroke();
}

// Fondo estático: campo, trama de impresión, anillos de alcance con marcas, plancha de defensa y marco.
function buildBackdrop(palette, pixelScale) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(W * pixelScale));
  canvas.height = Math.max(1, Math.round(H * pixelScale));
  const c = canvas.getContext('2d');
  c.scale(pixelScale, pixelScale);
  c.fillStyle = palette.carbon800;
  c.fillRect(0, 0, W, H);

  c.fillStyle = '#ffffff0b';
  for (let y = 7; y < H; y += 14) for (let x = (y / 14) % 2 ? 14 : 7; x < W; x += 14) c.fillRect(x - 1, y - 1, 2, 2);

  c.lineCap = 'butt';
  for (const radius of [120, 215, 315]) {
    c.strokeStyle = '#f0e6cf2e';
    c.lineWidth = 2;
    c.setLineDash([14, 8]);
    c.beginPath(); c.arc(CORE.x, CORE.y, radius, Math.PI, Math.PI * 2); c.stroke();
    c.setLineDash([]);
    c.strokeStyle = '#f0e6cf3d';
    for (let step = 0; step <= 24; step++) {
      const angle = Math.PI + (step * Math.PI) / 24;
      const major = step % 6 === 0;
      const inner = radius - (major ? 9 : 4);
      const outer = radius + (major ? 9 : 4);
      c.lineWidth = major ? 3 : 2;
      c.beginPath();
      c.moveTo(CORE.x + Math.cos(angle) * inner, CORE.y + Math.sin(angle) * inner);
      c.lineTo(CORE.x + Math.cos(angle) * outer, CORE.y + Math.sin(angle) * outer);
      c.stroke();
    }
  }

  // Plancha de defensa con franja de peligro y remaches.
  const plateTop = CORE.y + 24;
  c.fillStyle = palette.carbon600;
  c.fillRect(0, plateTop, W, H - plateTop);
  c.save();
  c.beginPath(); c.rect(0, plateTop, W, 9); c.clip();
  c.fillStyle = palette.orange;
  c.fillRect(0, plateTop, W, 9);
  c.fillStyle = palette.carbon900;
  for (let x = -20; x < W + 20; x += 24) {
    c.beginPath(); c.moveTo(x, plateTop + 9); c.lineTo(x + 12, plateTop + 9); c.lineTo(x + 21, plateTop); c.lineTo(x + 9, plateTop); c.closePath(); c.fill();
  }
  c.restore();
  c.fillStyle = palette.carbon900;
  c.fillRect(0, plateTop + 9, W, 3);
  c.fillStyle = palette.carbon700;
  c.strokeStyle = '#f0e6cf55';
  c.lineWidth = 1.5;
  for (let x = 24; x < W; x += 48) { c.beginPath(); c.arc(x, plateTop + 36, 3.4, 0, Math.PI * 2); c.fill(); c.stroke(); }
  c.fillStyle = '#f0e6cf33';
  c.font = '800 11px sans-serif';
  c.textAlign = 'center';
  c.fillText('LÍNEA DE DEFENSA', W / 2, plateTop + 62);

  // Marco: borde y escuadras de esquina, como el visor de una máquina.
  c.strokeStyle = palette.carbon600;
  c.lineWidth = 6;
  c.strokeRect(0, 0, W, H);
  c.strokeStyle = '#f0e6cf80';
  c.lineWidth = 3;
  bracket(c, 10, 10, 20, 1, 1); bracket(c, W - 10, 10, 20, -1, 1);
  bracket(c, 10, H - 10, 20, 1, -1); bracket(c, W - 10, H - 10, 20, -1, -1);
  return canvas;
}

export function createRenderer(canvas, palette, { font = 'sans-serif' } = {}) {
  const ctx = canvas.getContext('2d', { alpha: false });
  let layout = { scale: 1, x: 0, y: 0, width: W, height: H, dpr: 1 };
  let backdrop = null;

  function resize(bottomInset = 14) {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    const scale = Math.max(0.1, Math.min(rect.width / W, (rect.height - bottomInset) / H));
    layout = { scale, x: (rect.width - W * scale) / 2, y: Math.max(0, rect.height - H * scale - bottomInset), width: rect.width, height: rect.height, dpr };
    backdrop = buildBackdrop(palette, scale * dpr);
  }

  function drawEnemy(enemy) {
    const style = ENEMY_STYLE[enemy.type] ?? ENEMY_STYLE.drone;
    const r = enemy.radius;
    const { x, y } = enemy;
    ctx.lineJoin = 'miter';
    polygon(ctx, x, y, r, style.sides, style.rot);
    ctx.lineWidth = enemy.type === 'boss' ? 7 : 5;
    ctx.strokeStyle = palette.carbon900;
    ctx.stroke();
    ctx.fillStyle = enemy.hit > 0 ? palette.ivory : palette[style.fill];
    ctx.fill();
    polygon(ctx, x, y, r - 2.5, style.sides, style.rot);
    ctx.lineWidth = enemy.trait === 'armored' ? 3 : 1.5;
    ctx.strokeStyle = palette.ivory;
    ctx.stroke();
    ctx.strokeStyle = palette.carbon900;
    ctx.fillStyle = palette.carbon900;
    switch (enemy.type) {
      case 'drone':
        ctx.beginPath(); ctx.arc(x, y, r * 0.3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = palette.ivory; ctx.beginPath(); ctx.arc(x, y, r * 0.1, 0, Math.PI * 2); ctx.fill();
        break;
      case 'dart':
        ctx.strokeStyle = palette.ivoryDim; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(x - r * 0.55, y - r * 1.5); ctx.lineTo(x - r * 0.55, y - r * 0.8); ctx.moveTo(x + r * 0.55, y - r * 1.5); ctx.lineTo(x + r * 0.55, y - r * 0.8); ctx.stroke();
        break;
      case 'brute':
        polygon(ctx, x, y, r * 0.58, 6, 0); ctx.lineWidth = 3; ctx.stroke();
        ctx.beginPath(); ctx.arc(x, y, r * 0.15, 0, Math.PI * 2); ctx.fill();
        break;
      case 'swarm':
        ctx.beginPath(); ctx.arc(x, y, r * 0.22, 0, Math.PI * 2); ctx.fill();
        break;
      case 'splitter':
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(x - r * 0.7, y); ctx.lineTo(x + r * 0.7, y); ctx.moveTo(x, y - r * 0.7); ctx.lineTo(x, y + r * 0.7); ctx.stroke();
        break;
      case 'boss':
        polygon(ctx, x, y, r * 0.5, 8, Math.PI / 8); ctx.fill();
        ctx.fillStyle = palette.orangeHi; ctx.beginPath(); ctx.arc(x, y, r * 0.16, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = palette.orange; ctx.lineWidth = 5; ctx.setLineDash([9, 9]); ctx.lineDashOffset = -(enemy.y * 0.5);
        ctx.beginPath(); ctx.arc(x, y, r + 9, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
        break;
      default:
    }
    if (enemy.trait === 'swift') {
      ctx.strokeStyle = palette.orangeHi; ctx.lineWidth = 2.5;
      for (const dy of [r + 8, r + 15]) { ctx.beginPath(); ctx.moveTo(x - 6, y - dy); ctx.lineTo(x, y - dy - 5); ctx.lineTo(x + 6, y - dy); ctx.stroke(); }
    }
    if (enemy.maxHp > 1 && (enemy.type === 'boss' || enemy.hp < enemy.maxHp)) {
      const width = enemy.type === 'boss' ? 96 : Math.max(24, r * 2.2);
      const top = y - r - (enemy.type === 'boss' ? 24 : 14);
      ctx.fillStyle = palette.carbon900; ctx.fillRect(x - width / 2 - 2, top - 2, width + 4, 9);
      ctx.fillStyle = enemy.type === 'boss' ? palette.orange : palette.rustHi;
      ctx.fillRect(x - width / 2, top, width * Math.max(0, enemy.hp) / enemy.maxHp, 5);
    }
  }

  function drawCore(game, fx, danger) {
    const angle = Math.atan2(game.aim.y - CORE.y, game.aim.x - CORE.x);
    ctx.lineJoin = 'miter';
    polygon(ctx, CORE.x, CORE.y, 31, 8, Math.PI / 8);
    ctx.lineWidth = 6; ctx.strokeStyle = palette.carbon900; ctx.stroke();
    ctx.fillStyle = danger ? palette.rust : palette.cobaltDeep; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = palette.ivory;
    polygon(ctx, CORE.x, CORE.y, 28, 8, Math.PI / 8); ctx.stroke();
    ctx.fillStyle = palette.ivoryDim;
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      ctx.beginPath(); ctx.arc(CORE.x + Math.cos(a) * 22, CORE.y + Math.sin(a) * 22, 2.2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.save();
    ctx.translate(CORE.x, CORE.y);
    ctx.rotate(angle + Math.PI / 2);
    ctx.lineWidth = 3.5; ctx.strokeStyle = palette.carbon900;
    ctx.fillStyle = palette.orange; ctx.fillRect(-7, -54, 14, 38); ctx.strokeRect(-7, -54, 14, 38);
    ctx.fillStyle = palette.ivory; ctx.fillRect(-7, -44, 14, 5);
    ctx.fillStyle = palette.ivoryDim; ctx.fillRect(-10, -58, 20, 7); ctx.strokeRect(-10, -58, 20, 7);
    ctx.restore();
    ctx.fillStyle = danger ? palette.rustHi : palette.cobalt;
    ctx.beginPath(); ctx.arc(CORE.x, CORE.y, 14, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = palette.ivory; ctx.stroke();
    ctx.fillStyle = palette.carbon900; ctx.beginPath(); ctx.arc(CORE.x, CORE.y, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = palette.orangeHi; ctx.beginPath(); ctx.arc(CORE.x, CORE.y, 2.6, 0, Math.PI * 2); ctx.fill();
    if (fx.muzzle > 0) {
      const tipX = CORE.x + Math.cos(angle) * 62;
      const tipY = CORE.y + Math.sin(angle) * 62;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = angle + (i * Math.PI) / 4;
        const radius = i % 2 === 0 ? 11 : 4;
        const px = tipX + Math.cos(a) * radius, py = tipY + Math.sin(a) * radius;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.fillStyle = palette.ivory; ctx.fill();
    }
  }

  function drawAim(game) {
    const angle = Math.atan2(game.aim.y - CORE.y, game.aim.x - CORE.x);
    ctx.strokeStyle = '#f0e6cf73'; ctx.lineWidth = 2; ctx.setLineDash([3, 9]);
    ctx.beginPath(); ctx.moveTo(CORE.x + Math.cos(angle) * 64, CORE.y + Math.sin(angle) * 64); ctx.lineTo(game.aim.x, game.aim.y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = palette.ivory; ctx.lineWidth = 3;
    const { x, y } = game.aim;
    const s = 15;
    bracket(ctx, x - s, y - s, 9, 1, 1); bracket(ctx, x + s, y - s, 9, -1, 1);
    bracket(ctx, x - s, y + s, 9, 1, -1); bracket(ctx, x + s, y + s, 9, -1, -1);
    ctx.fillStyle = palette.orange; ctx.fillRect(x - 3, y - 3, 6, 6);
  }

  function drawBullets(bullets) {
    if (!bullets.length) return;
    ctx.lineCap = 'butt'; ctx.lineWidth = 3.5; ctx.strokeStyle = palette.ivory;
    ctx.beginPath();
    for (const b of bullets) { ctx.moveTo(b.x - b.vx * 0.032, b.y - b.vy * 0.032); ctx.lineTo(b.x, b.y); }
    ctx.stroke();
    ctx.fillStyle = palette.orange;
    ctx.beginPath();
    for (const b of bullets) { ctx.moveTo(b.x + 3.4, b.y); ctx.arc(b.x, b.y, 3.4, 0, Math.PI * 2); }
    ctx.fill();
  }

  function drawFx(fx, reduced) {
    for (const ring of fx.rings) {
      const k = 1 - ring.life / ring.max;
      ctx.strokeStyle = palette[ring.color] ?? palette.ivory;
      ctx.lineWidth = 4 - 3 * k;
      ctx.beginPath(); ctx.arc(ring.x, ring.y, (8 + 26 * k) * ring.size, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.lineCap = 'square';
    for (const p of fx.particles) {
      ctx.globalAlpha = Math.min(1, (p.life / p.max) * 1.8);
      ctx.strokeStyle = palette[p.color] ?? palette.ivory; ctx.lineWidth = p.width;
      const speed = Math.hypot(p.vx, p.vy) || 1;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - (p.vx / speed) * p.len, p.y - (p.vy / speed) * p.len); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.lineCap = 'butt';
    if (!reduced || fx.popups.length) {
      ctx.textAlign = 'center'; ctx.lineJoin = 'round';
      for (const pop of fx.popups) {
        ctx.globalAlpha = Math.min(1, (pop.life / pop.max) * 2);
        ctx.font = `900 16px ${font}`;
        ctx.lineWidth = 4; ctx.strokeStyle = palette.carbon900; ctx.strokeText(pop.text, pop.x, pop.y);
        ctx.fillStyle = palette[pop.color] ?? palette.ivory; ctx.fillText(pop.text, pop.x, pop.y);
      }
      ctx.globalAlpha = 1; ctx.lineJoin = 'miter';
    }
  }

  function draw({ game, fx, danger = false, random = Math.random }) {
    const { dpr, width, height, scale, x, y } = layout;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = palette.carbon900;
    ctx.fillRect(0, 0, width, height);
    const jitter = fx.shake * scale;
    ctx.save();
    ctx.translate(x + (random() - 0.5) * jitter * 2, y + (random() - 0.5) * jitter * 2);
    ctx.scale(scale, scale);
    if (backdrop) ctx.drawImage(backdrop, 0, 0, W, H);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
    if (game.phase === 'playing' || game.phase === 'ready') drawAim(game);
    for (const enemy of game.enemies) drawEnemy(enemy);
    drawBullets(game.bullets);
    drawCore(game, fx, danger);
    drawFx(fx, fx.reduced);
    if (fx.flash > 0) { ctx.globalAlpha = fx.flash * 0.4; ctx.fillStyle = palette.rustHi; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
    ctx.restore();
    ctx.restore();
  }

  return { resize, draw, get layout() { return layout; } };
}
