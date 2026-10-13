// Renderizador de Lumen. Solo dibuja: recibe la expedición y los efectos y no modifica ninguno.
// Dirección «herbario de luz»: ilustración entintada (contorno oscuro y rellenos planos), un farolillo ámbar como única
// luz mágica y una niebla de ojos pálidos como enemigo. El mapa se gira 90° en pantallas altas (ver view.mjs) y los
// destellos son sprites precalculados, no degradados por fotograma. Los colores se leen de las variables CSS.
import { MAP, TOWERS } from './content.mjs';
import { pointAt } from './engine.mjs';
import { WORLD, computeView, spriteScale, toScreen } from './view.mjs';

export const PALETTE_VARS = Object.freeze({
  night900: '--night-900', night800: '--night-800', night700: '--night-700', moss: '--moss', lichen: '--lichen',
  paper: '--paper', paperDim: '--paper-dim', ink: '--ink', lantern: '--lantern', lanternDeep: '--lantern-deep',
  dew: '--dew', spore: '--spore', ember: '--ember', bark: '--bark',
});
export const FALLBACK_PALETTE = Object.freeze({
  night900: '#0b1612', night800: '#10201b', night700: '#172b24', moss: '#2f4a3a', lichen: '#8fb184',
  paper: '#eadfc4', paperDim: '#cfc19c', ink: '#16231d', lantern: '#f2b44a', lanternDeep: '#84540f',
  dew: '#8fd3d0', spore: '#a99be0', ember: '#cf6b4b', bark: '#4a3626',
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

const TAU = Math.PI * 2;
// Con el mapa pequeño, los sprites se agrandan hasta 1,6× para seguir siendo legibles con el dedo encima.
const SPRITE_BOOST = [0.75, 1.6];
// Color de cada invasor de niebla: tonos azul-violeta apagados, distintos de la paleta amiga.
const FOG = { mite: '#6f6d93', runner: '#a3a5c4', brute: '#41435f', boss: '#1d1a33' };
const glows = new Map();

function glowSprite(color, radius) {
  const key = `${color}|${radius}`;
  if (glows.has(key)) return glows.get(key);
  const size = Math.ceil(radius * 2);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const c = canvas.getContext('2d');
  const g = c.createRadialGradient(radius, radius, 0, radius, radius, radius);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, size, size);
  glows.set(key, canvas);
  return canvas;
}

function rng(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }

function nearPath(x, y, margin) {
  return MAP.path.some(([px, py], j) => {
    if (!j) return false;
    const [ax, ay] = MAP.path[j - 1];
    const dx = px - ax, dy = py - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(x - ax - dx * t, y - ay - dy * t) < margin;
  });
}

function conifer(c, p, x, y, size, shade) {
  c.lineJoin = 'round';
  c.fillStyle = p.bark; c.strokeStyle = p.ink; c.lineWidth = 1.6;
  c.fillRect(x - 3, y - size * 0.35, 6, size * 0.5); c.strokeRect(x - 3, y - size * 0.35, 6, size * 0.5);
  for (let i = 0; i < 3; i++) {
    const top = y - size * (1.65 - i * 0.42), w = size * (0.5 + i * 0.18);
    c.fillStyle = shade[i % shade.length];
    c.beginPath(); c.moveTo(x, top); c.lineTo(x + w, top + size * 0.78); c.lineTo(x - w, top + size * 0.78); c.closePath();
    c.fill(); c.stroke();
  }
}

function mushroomDecor(c, p, x, y, s, color) {
  c.lineJoin = 'round'; c.strokeStyle = p.ink; c.lineWidth = 1.4;
  c.fillStyle = p.paperDim; c.fillRect(x - s * 0.14, y - s * 0.1, s * 0.28, s * 0.6); c.strokeRect(x - s * 0.14, y - s * 0.1, s * 0.28, s * 0.6);
  c.fillStyle = color; c.beginPath(); c.ellipse(x, y, s, s * 0.62, 0, Math.PI, TAU); c.closePath(); c.fill(); c.stroke();
}

// Terreno estático (el crepúsculo del claro): se compone una vez por tamaño y se dibuja como imagen. Con el mapa girado
// (`rotated`), la decoración se dibuja contragirada para que árboles y setas sigan en pie en la pantalla.
function buildTerrain(p, q, rotated = false) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(WORLD.width * q); canvas.height = Math.round(WORLD.height * q);
  const c = canvas.getContext('2d');
  c.scale(q, q);
  const base = c.createLinearGradient(0, 0, 0, WORLD.height);
  base.addColorStop(0, '#14281f'); base.addColorStop(1, '#0d1c16');
  c.fillStyle = base; c.fillRect(0, 0, WORLD.width, WORLD.height);
  const random = rng(712); // decoración determinista: el azar visual nunca toca el combate
  const upright = (x, y, draw) => { c.save(); c.translate(x, y); if (rotated) c.rotate(-Math.PI / 2); draw(); c.restore(); };
  c.fillStyle = '#1b3429';
  for (let i = 0; i < 46; i++) { c.globalAlpha = 0.45; c.beginPath(); c.ellipse(random() * 1000, random() * 600, 20 + random() * 50, 8 + random() * 22, random(), 0, TAU); c.fill(); }
  c.globalAlpha = 1;
  c.strokeStyle = p.lichen; c.lineWidth = 1.2; c.lineCap = 'round';
  for (let i = 0; i < 340; i++) {
    const x = random() * 1000, y = random() * 600;
    c.globalAlpha = 0.1 + random() * 0.14;
    const sway = (random() - 0.5) * 6, tall = 8 + random() * 4;
    upright(x, y, () => { c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(2, -5, sway, -tall); c.stroke(); });
  }
  c.globalAlpha = 1;
  // Sendero de tierra pisada con costura.
  c.lineCap = 'round'; c.lineJoin = 'round';
  for (const [width, color] of [[70, '#070f0c'], [60, '#3e3022'], [49, '#5d4a31'], [35, '#6f5b3a']]) {
    c.strokeStyle = color; c.lineWidth = width; c.beginPath();
    MAP.path.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.stroke();
  }
  c.strokeStyle = p.paper; c.globalAlpha = 0.2; c.lineWidth = 1.6; c.setLineDash([3, 13]); c.stroke(); c.setLineDash([]); c.globalAlpha = 1;
  // Árboles y setas, lejos del sendero, de las parcelas y de la semilla.
  for (let i = 0; i < 150; i++) {
    const x = random() * 1000, y = random() * 600;
    if (nearPath(x, y, 74) || MAP.pads.some(([px, py]) => Math.hypot(x - px, y - py) < 60) || Math.hypot(x - 940, y - 320) < 110) continue;
    if (i % 3 === 0) { const size = 5 + random() * 6; upright(x, y, () => mushroomDecor(c, p, 0, 0, size, i % 2 ? '#7f8fb0' : '#7fa88f')); }
    else { const size = 18 + random() * 21; upright(x, y, () => conifer(c, p, 0, 0, size, ['#173529', '#1d4033', '#24503f'])); }
  }
  for (const [x, y] of [[35, 80], [80, 110], [950, 100], [990, 135], [35, 550], [90, 590], [960, 560], [900, 600]]) upright(x, y, () => conifer(c, p, 0, 0, 48, ['#0f2a22', '#14352b', '#1a4033']));
  // Farolillos a lo largo del camino: la luz que da nombre al juego.
  for (const [x, y] of [[300, 215], [575, 330], [800, 280]]) {
    upright(x, y, () => {
      c.drawImage(glowSprite('rgba(242,180,74,0.28)', 60), -60, -70);
      c.strokeStyle = p.ink; c.lineWidth = 3; c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -30); c.stroke();
      c.fillStyle = p.lantern; c.strokeStyle = p.ink; c.lineWidth = 2; c.beginPath(); c.roundRect(-6, -46, 12, 17, 3); c.fill(); c.stroke();
    });
  }
  return canvas;
}

export function createRenderer(canvas, palette, { font = 'Georgia, serif' } = {}) {
  const ctx = canvas.getContext('2d');
  let view = computeView(WORLD.width, WORLD.height);
  let dpr = 1;
  let terrain = null;
  let terrainKey = '';
  let measured = ''; // tamaño CSS y densidad con los que se dimensionó el lienzo

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    measured = `${canvas.clientWidth}x${canvas.clientHeight}@${dpr}`;
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    view = computeView(rect.width, rect.height);
    const quality = Math.min(2, Math.max(1, Math.round(view.scale * dpr * 2) / 2));
    const key = `${quality}|${canvas.id}|${view.rotated}`;
    if (key !== terrainKey) { terrain = buildTerrain(palette, quality, view.rotated); terrainKey = key; }
  }

  // Dibuja `fn` en coordenadas locales (1 unidad = 1 unidad del mundo × escala del sprite), centrado en el punto del mundo.
  function at(x, y, boost, fn) {
    const s = toScreen(view, x, y);
    const k = spriteScale(view, ...SPRITE_BOOST) * boost * dpr;
    ctx.save();
    ctx.setTransform(k, 0, 0, k, s.x * dpr, s.y * dpr);
    fn();
    ctx.restore();
  }

  function ring(color, alpha, lineWidth, rx, ry, dash) {
    ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = lineWidth;
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, TAU); ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha = 1;
  }

  function leafPips(level, color) {
    ctx.fillStyle = color; ctx.strokeStyle = palette.ink; ctx.lineWidth = 1.2;
    for (let i = 0; i < level; i++) {
      const x = (i - (level - 1) / 2) * 9;
      ctx.beginPath(); ctx.moveTo(x, 13); ctx.lineTo(x + 3.5, 17); ctx.lineTo(x, 21); ctx.lineTo(x - 3.5, 17); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  }

  function tower(type, level, time) {
    const def = TOWERS[type];
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.fillStyle = '#243a30'; ctx.strokeStyle = palette.ink; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.ellipse(0, 5, 24, 11, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.drawImage(glowSprite('rgba(242,180,74,0.22)', 46), -46, -60);
    if (type === 'thorn') {
      ctx.strokeStyle = palette.ink; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(0, 4); ctx.quadraticCurveTo(-9, -12, 0, -30); ctx.stroke();
      ctx.strokeStyle = palette.lichen; ctx.lineWidth = 5; ctx.stroke();
      ctx.fillStyle = palette.lantern; ctx.strokeStyle = palette.ink; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(0, -52); ctx.lineTo(12, -34); ctx.lineTo(0, -16); ctx.lineTo(-12, -34); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff2c4'; ctx.beginPath(); ctx.moveTo(0, -44); ctx.lineTo(5, -34); ctx.lineTo(0, -25); ctx.lineTo(-5, -34); ctx.closePath(); ctx.fill();
      for (const d of [-1, 1]) { ctx.strokeStyle = palette.ink; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(d * 15, -22); ctx.stroke(); ctx.strokeStyle = palette.lichen; ctx.lineWidth = 3; ctx.stroke(); }
    } else if (type === 'frost') {
      ctx.strokeStyle = palette.ink; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(0, 5); ctx.lineTo(0, -18); ctx.stroke();
      ctx.strokeStyle = palette.moss; ctx.lineWidth = 4; ctx.stroke();
      for (let i = 0; i < 6; i++) {
        ctx.save(); ctx.translate(0, -26); ctx.rotate(i * TAU / 6 + time * 0.1);
        ctx.fillStyle = palette.dew; ctx.strokeStyle = palette.ink; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(0, -12, 6.5, 13, 0, 0, TAU); ctx.fill(); ctx.stroke(); ctx.restore();
      }
      ctx.fillStyle = palette.paper; ctx.strokeStyle = palette.ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, -26, 7, 0, TAU); ctx.fill(); ctx.stroke();
    } else {
      for (const [x, y, s, color] of [[0, -16, 23, def.color === '#bd9dff' ? palette.spore : palette.spore], [18, -2, 10, '#8f84c8']]) {
        ctx.fillStyle = palette.paperDim; ctx.strokeStyle = palette.ink; ctx.lineWidth = 2;
        ctx.fillRect(x - s * 0.14, y - s * 0.1, s * 0.28, s * 0.72); ctx.strokeRect(x - s * 0.14, y - s * 0.1, s * 0.28, s * 0.72);
        ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x, y, s, s * 0.64, 0, Math.PI, TAU); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = palette.paper; ctx.beginPath(); ctx.arc(x - s * 0.35, y - s * 0.3, s * 0.11, 0, TAU); ctx.arc(x + s * 0.3, y - s * 0.34, s * 0.09, 0, TAU); ctx.fill();
      }
    }
    leafPips(level, palette.lantern);
  }

  function hero(h, time, reduced) {
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(0, 9, 15, 5, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = palette.ink; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(14, 8); ctx.lineTo(18, -30); ctx.stroke();
    ctx.strokeStyle = palette.bark; ctx.lineWidth = 3; ctx.stroke();
    ctx.drawImage(glowSprite('rgba(242,180,74,0.5)', 30), 18 - 30, -32 - 30);
    ctx.fillStyle = palette.lantern; ctx.strokeStyle = palette.ink; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(13, -40, 10, 13, 3); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#3e7d72'; ctx.beginPath(); ctx.moveTo(0, -19); ctx.lineTo(-13, 7); ctx.quadraticCurveTo(0, 14, 13, 7); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#2f6258'; ctx.beginPath(); ctx.arc(0, -21, 9, Math.PI, TAU); ctx.lineTo(9, -17); ctx.lineTo(-9, -17); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#e8cfa6'; ctx.beginPath(); ctx.arc(0, -19, 5.5, 0, TAU); ctx.fill(); ctx.stroke();
    if (!reduced && Math.hypot(h.targetX - h.x, h.targetY - h.y) > 10) { /* el destino se marca fuera, en coordenadas de mundo */ }
  }

  function fogCreature(e, time, reduced, dir) {
    const r = e.radius;
    const bob = reduced ? 0 : Math.sin(time * 6 + e.id) * 1.5;
    ctx.translate(0, bob);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (e.type === 'runner') {
      ctx.strokeStyle = 'rgba(163,165,196,0.5)'; ctx.lineWidth = 2;
      for (const o of [-4, 0, 4]) { ctx.beginPath(); ctx.moveTo(-dir.x * (r + 4) + o * dir.y, -dir.y * (r + 4) - o * dir.x); ctx.lineTo(-dir.x * (r + 16) + o * dir.y, -dir.y * (r + 16) - o * dir.x); ctx.stroke(); }
    }
    ctx.fillStyle = FOG[e.type] ?? FOG.mite; ctx.strokeStyle = palette.ink; ctx.lineWidth = e.type === 'boss' ? 3.4 : 2.2;
    ctx.beginPath();
    ctx.moveTo(-r, r * 0.55);
    ctx.quadraticCurveTo(-r * 1.25, -r * 0.55, 0, -r * 1.15);
    ctx.quadraticCurveTo(r * 1.25, -r * 0.55, r, r * 0.55);
    const tendrils = e.type === 'boss' ? 5 : e.type === 'brute' ? 4 : 3;
    for (let i = tendrils; i >= 0; i--) {
      const x = -r + (2 * r * i) / tendrils;
      const sway = reduced ? 0 : Math.sin(time * 4 + i + e.id) * r * 0.12;
      ctx.quadraticCurveTo(x + r / tendrils, r * 0.95 + sway, x, r * (i % 2 ? 0.55 : 1.05));
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    if (e.type === 'brute') {
      ctx.strokeStyle = palette.ink; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.arc(0, -r * 0.1, r * 0.78, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-r * 0.8, -r * 0.5); ctx.lineTo(-r * 1.05, -r * 1.05); ctx.moveTo(r * 0.8, -r * 0.5); ctx.lineTo(r * 1.05, -r * 1.05); ctx.stroke();
    }
    if (e.type === 'boss') {
      ctx.fillStyle = FOG.boss; ctx.strokeStyle = palette.ink; ctx.lineWidth = 3;
      for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * r * 0.36 - 5, -r * 0.95); ctx.lineTo(i * r * 0.36, -r * (1.45 - Math.abs(i) * 0.13)); ctx.lineTo(i * r * 0.36 + 5, -r * 0.95); ctx.closePath(); ctx.fill(); ctx.stroke(); }
      ctx.drawImage(glowSprite('rgba(242,180,74,0.35)', r * 1.6), -r * 1.6, -r * 1.7);
    }
    const eyeY = -r * 0.25, eyeX = r * 0.38, boss = e.type === 'boss';
    for (const d of [-1, 1]) {
      ctx.fillStyle = boss ? palette.lantern : palette.paper; ctx.strokeStyle = palette.ink; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.ellipse(d * eyeX, eyeY, r * 0.2, r * 0.26, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = palette.ink; ctx.beginPath(); ctx.arc(d * eyeX + dir.x * r * 0.06, eyeY + dir.y * r * 0.06, r * 0.09, 0, TAU); ctx.fill();
    }
    if (e.slow > 0) { ctx.strokeStyle = palette.dew; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, r + 5, 0, TAU); ctx.stroke(); }
  }

  function draw(run, { time = 0, selected = -1, preview = false, reduced = false, fx = null, highlightPads = false, moving = false } = {}) {
    const p = palette;
    const jitter = fx && !preview ? fx.shake : 0;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = p.night900;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Además del observador de tamaño, se comprueba aquí: un giro o un cambio de ventana siempre acaban redimensionando.
    if (!terrain || `${canvas.clientWidth}x${canvas.clientHeight}@${Math.min(window.devicePixelRatio || 1, 2)}` !== measured) resize();
    ctx.save();
    const sx = (Math.random() - 0.5) * jitter * 2, sy = (Math.random() - 0.5) * jitter * 2;
    const s = view.scale * dpr;
    if (view.rotated) ctx.setTransform(0, s, -s, 0, (view.ox + view.world.height * view.scale + sx) * dpr, (view.oy + sy) * dpr);
    else ctx.setTransform(s, 0, 0, s, (view.ox + sx) * dpr, (view.oy + sy) * dpr);
    ctx.drawImage(terrain, 0, 0, WORLD.width, WORLD.height);
    ctx.restore();

    const goal = MAP.path.at(-1);
    // La semilla ancestral, en el extremo del sendero.
    at(944, 322, 1, () => {
      ctx.drawImage(glowSprite('rgba(242,180,74,0.3)', 80), -80, -100);
      ctx.fillStyle = '#243a30'; ctx.strokeStyle = p.ink; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(0, 12, 36, 18, 0, 0, TAU); ctx.fill(); ctx.stroke();
      const bob = reduced ? 0 : Math.sin(time * 2) * 3;
      ctx.lineJoin = 'round'; ctx.fillStyle = p.lantern; ctx.beginPath(); ctx.moveTo(0, -42 + bob); ctx.lineTo(19, -18 + bob); ctx.lineTo(0, 6 + bob); ctx.lineTo(-19, -18 + bob); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff2c4'; ctx.beginPath(); ctx.moveTo(0, -30 + bob); ctx.lineTo(8, -18 + bob); ctx.lineTo(0, -6 + bob); ctx.lineTo(-8, -18 + bob); ctx.closePath(); ctx.fill();
    });
    void goal;

    // Parcelas y defensas, ordenadas por altura en pantalla para que se solapen bien.
    const pads = MAP.pads.map((pad, index) => ({ index, pad, y: toScreen(view, pad[0], pad[1]).y })).sort((a, b) => a.y - b.y);
    for (const { index, pad: [x, y] } of pads) {
      const built = run.towers.find(t => t.pad === index);
      if (index === selected) {
        const range = built ? TOWERS[built.type].range + (built.level - 1) * 12 : 145;
        const s2 = toScreen(view, x, y);
        ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = 'rgba(242,180,74,0.07)'; ctx.strokeStyle = 'rgba(242,180,74,0.5)'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 5]);
        ctx.beginPath(); ctx.arc(s2.x, s2.y, range * view.scale, 0, TAU); ctx.fill(); ctx.stroke(); ctx.restore();
      }
      if (built) { at(x, y, 1, () => tower(built.type, built.level, time)); }
      else {
        at(x, y, 1, () => {
          ctx.fillStyle = index === selected ? 'rgba(242,180,74,0.22)' : 'rgba(10,22,18,0.55)';
          ctx.beginPath(); ctx.ellipse(0, 0, 27, 19, 0, 0, TAU); ctx.fill();
          ring(index === selected ? p.lantern : p.lichen, index === selected ? 1 : 0.65, 2, 27, 19, [5, 5]);
          if (highlightPads && !reduced) ring(p.lantern, 0.35 + 0.35 * Math.sin(time * 4), 3, 33 + Math.sin(time * 4) * 3, 24 + Math.sin(time * 4) * 2);
          ctx.fillStyle = p.paper; ctx.strokeStyle = p.ink; ctx.lineWidth = 3; ctx.font = `700 22px ${font}`; ctx.textAlign = 'center';
          ctx.strokeText('+', 0, 7); ctx.fillText('+', 0, 7);
        });
      }
      const label = toScreen(view, x, y);
      ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.font = `700 11px ${font}`; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = p.ink; ctx.fillStyle = p.paper;
      const ly = label.y + 24 * spriteScale(view, ...SPRITE_BOOST);
      ctx.strokeText(String(index + 1), label.x, ly); ctx.fillText(String(index + 1), label.x, ly); ctx.restore();
    }

    // Invasores de niebla, de arriba abajo en pantalla.
    const enemies = [...run.enemies].sort((a, b) => toScreen(view, a.x, a.y).y - toScreen(view, b.x, b.y).y);
    for (const e of enemies) {
      const ahead = pointAt(e.distance + 6);
      const vx = ahead.x - e.x, vy = ahead.y - e.y;
      const len = Math.hypot(vx, vy) || 1;
      // Dirección de avance en pantalla (útil para las estelas y la mirada).
      const a = toScreen(view, e.x, e.y), b = toScreen(view, e.x + vx / len, e.y + vy / len);
      const dir = { x: b.x - a.x, y: b.y - a.y };
      const dl = Math.hypot(dir.x, dir.y) || 1;
      at(e.x, e.y, 1, () => {
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(2, e.radius * 0.9, e.radius, e.radius * 0.35, 0, 0, TAU); ctx.fill();
        fogCreature(e, time, reduced, { x: dir.x / dl, y: dir.y / dl });
        if (e.hp < e.maxHp || e.type === 'boss') {
          const w = e.type === 'boss' ? 56 : 30, top = -e.radius - 16;
          ctx.fillStyle = p.ink; ctx.fillRect(-w / 2 - 2, top - 2, w + 4, 8);
          ctx.fillStyle = e.type === 'boss' ? p.lantern : p.lichen; ctx.fillRect(-w / 2, top, w * Math.max(0, e.hp / e.maxHp), 4);
        }
      });
    }

    at(run.hero.x, run.hero.y, 1, () => hero(run.hero, time, reduced));
    if (Math.hypot(run.hero.targetX - run.hero.x, run.hero.targetY - run.hero.y) > 10) {
      at(run.hero.targetX, run.hero.targetY, 1, () => ring(p.lantern, 0.8, 2, 8 + (reduced ? 0 : Math.sin(time * 5) * 2), 5, [3, 3]));
    }

    // Efectos del motor: disparos y estallidos.
    for (const e of run.effects) {
      const alpha = Math.max(0, e.life / e.maxLife);
      if (e.kind === 'bolt') {
        const a = toScreen(view, e.x, e.y - 20), b = toScreen(view, e.tx, e.ty);
        ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalAlpha = alpha; ctx.strokeStyle = e.color; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.fillStyle = '#fff6d6'; ctx.beginPath(); ctx.arc(b.x, b.y, 2.6, 0, TAU); ctx.fill(); ctx.restore();
      } else {
        const growth = (1 - alpha) * (e.kind === 'pulse' ? 185 : 30) + 5;
        at(e.x, e.y, 1, () => { ctx.globalAlpha = alpha; ctx.strokeStyle = e.kind === 'pulse' ? p.lantern : e.color; ctx.lineWidth = e.kind === 'pulse' ? 4 : 2.5; ctx.beginPath(); ctx.arc(0, 0, growth, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1; });
      }
    }

    // Motas, anillos y números flotantes (presentación).
    if (fx) {
      for (const m of fx.motes) {
        const q = toScreen(view, m.x, m.y);
        ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalAlpha = Math.min(1, (m.life / m.max) * 1.6); ctx.fillStyle = p[m.color] ?? p.lantern;
        ctx.beginPath(); ctx.arc(q.x, q.y, m.size * Math.max(0.8, view.scale * 1.4), 0, TAU); ctx.fill(); ctx.restore();
      }
      for (const r of fx.rings) {
        const k = 1 - r.life / r.max;
        at(r.x, r.y, 1, () => { ctx.globalAlpha = 1 - k; ctx.strokeStyle = p[r.color] ?? p.lantern; ctx.lineWidth = 3 - 2 * k; ctx.beginPath(); ctx.arc(0, 0, (10 + 38 * k) * r.size, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1; });
      }
      for (const pop of fx.popups) {
        const q = toScreen(view, pop.x, pop.y);
        ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalAlpha = Math.min(1, (pop.life / pop.max) * 2); ctx.textAlign = 'center'; ctx.font = `700 14px ${font}`;
        ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.strokeStyle = p.ink; ctx.strokeText(pop.text, q.x, q.y); ctx.fillStyle = p[pop.color] ?? p.lantern; ctx.fillText(pop.text, q.x, q.y); ctx.restore();
      }
      if (fx.flash > 0) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = fx.flash * 0.28; ctx.fillStyle = p.ember; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.restore(); }
    }

    // Brumas: tres bandas muy tenues que derivan despacio (nada con «efectos reducidos»).
    if (!reduced) {
      ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      for (let i = 0; i < 3; i++) {
        const w = view.width * 0.9, x = ((time * 6 + i * 130) % (view.width + w)) - w * 0.5, y = view.height * (0.25 + i * 0.28);
        ctx.globalAlpha = 0.045; ctx.fillStyle = p.paper; ctx.beginPath(); ctx.ellipse(x, y, w * 0.5, view.height * 0.07, 0, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
  }

  return { resize, draw, get view() { return view; } };
}
