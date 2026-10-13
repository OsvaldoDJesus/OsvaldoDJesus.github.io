// Revisión visual del arte (no forma parte del juego). Abre preview.html.
//   ?sheet=stages | prey | preds | one&id=megalodon[&px=900&mouth=0.8&ang=0]
// window.__preview.draw(t) redibuja; window.__preview.flush() termina los horneados pendientes.
import { createCanvas } from './kit/index.js';
import { drawFish, SPECS, STAGE_SPECS, prebake, setTexScale } from './art/bake.mjs';
import { baker, noiseFields } from './art/texture.mjs';
import { STAGES, PREY, PREDATORS } from './content.mjs';

const q = new URLSearchParams(location.search);
const surface = createCanvas({ parent: document.getElementById('game'), width: 960, height: 540, maxDpr: 3, background: '#041526' });
const ctx = surface.ctx;
const sheet = q.get('sheet') || 'stages';
setTexScale(Number(q.get('tex') || 1));
const t0 = performance.now();
noiseFields();
const noiseMs = performance.now() - t0;
const devScale = () => surface.canvas.width / 960;

let creatures = null;
async function loadCreatures() { try { creatures = await import('./art/creatures.mjs'); } catch { creatures = null; } }

function bg() {
  const g = ctx.createLinearGradient(0, 0, 0, 540);
  g.addColorStop(0, '#2a8fb8'); g.addColorStop(0.5, '#0f5a8a'); g.addColorStop(1, '#062544');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 960, 540);
}
function label(s, x, y) {
  ctx.font = '600 11px system-ui, sans-serif'; ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillText(s, x + 1, y + 1);
  ctx.fillStyle = '#fff'; ctx.fillText(s, x, y);
}
function fish(id, x, y, len, i, t, extra = {}) {
  drawFish(ctx, id, { x, y, ang: extra.ang ?? 0, len, phase: t * 3 + i, speedK: 0.7, mouth: extra.mouth ?? 0, t, px: len * devScale() });
}

function draw(t = 1.3) {
  bg();
  if (sheet === 'stages') {
    STAGES.forEach((st, i) => {
      const col = i % 4, row = Math.floor(i / 4);
      const x = 120 + col * 240, y = 95 + row * 175;
      fish(STAGE_SPECS[i], x, y, Math.min(200, 70 + i * 12), i, t, { mouth: i % 2 ? 0.8 : 0, ang: i % 3 === 2 ? Math.PI : 0 });
      label(`${i} ${st.name}`, x, y + 72);
    });
  } else if (sheet === 'one') {
    const id = q.get('id') || 'megalodon';
    const len = Number(q.get('len') || 640);
    if (SPECS[id]) fish(id, 480, 270, len, 0, t, { mouth: Number(q.get('mouth') || 0), ang: Number(q.get('ang') || 0) });
    else if (creatures) creatures.drawCreature(ctx, id, { x: 480, y: 270, ang: Number(q.get('ang') || 0), size: len, len, phase: t * 3, t, variant: q.get('variant') || undefined, mouth: Number(q.get('mouth') || 0), speedK: 0.7, px: len * devScale(), quality: 2 });
    label(`${id} · ruido ${noiseMs.toFixed(0)} ms`, 480, 525);
  } else if (sheet === 'prey' && creatures) {
    PREY.forEach((p, i) => {
      const col = i % 6, row = Math.floor(i / 6);
      const x = 85 + col * 158, y = 75 + row * 125;
      const size = Math.min(115, creatures.sizeForPrey(p.art, p.r) * (p.r < 10 ? 6 : p.r < 40 ? 2.2 : 0.55));
      creatures.drawCreature(ctx, p.art, { x, y, ang: 0.15, size, len: size, phase: t * 3 + i, t, variant: p.variant, quality: 2, speedK: 0.6, px: size * devScale() });
      label(p.name, x, y + 54);
    });
  } else if (sheet === 'preds' && creatures) {
    PREDATORS.forEach((d, i) => {
      const col = i % 3, row = Math.floor(i / 3);
      const x = 160 + col * 320, y = 95 + row * 170;
      creatures.drawCreature(ctx, d.art, { x, y, ang: 0.05, size: 250, len: 250, phase: t * 3 + i, t, variant: d.variant, quality: 2, mouth: i % 2 ? 0.9 : 0.15, speedK: 0.6, px: 250 * devScale() });
      label(d.name, x, y + 78);
    });
  }
}

// ?sheet=world&w=0&stage=1[&y=0.3] — mundo real con el motor y el renderer (sin interfaz).
let worldScene = null;
async function setupWorld() {
  const { Ocean, createSave } = await import('./engine.mjs');
  const { Renderer } = await import('./renderer.mjs');
  const w = Number(q.get('w') || 0), stage = Number(q.get('stage') || [0, 3, 6, 9, 11][w]);
  const ocean = new Ocean({ ...createSave(), world: w, stage }, { seed: 3 });
  if (q.has('y')) ocean.p.y = Number(q.get('y')) * (await import('./content.mjs')).WORLDS[w].size.h;
  const r = new Renderer(surface);
  r.setQuality(q.get('q') || 'auto');
  r.enterWorld(w, ocean);
  ocean.setSteer(ocean.p.x + 600, ocean.p.y, true);
  worldScene = { ocean, r, step(dt) { const evs = ocean.tick(dt); r.onEvents(evs, ocean); r.update(dt, ocean); }, draw() { r.render(ctx, ocean); } };
  for (let i = 0; i < 30; i++) worldScene.step(1 / 30);
}

function frame() {
  baker.run(12);
  if (worldScene) { worldScene.step(1 / 60); worldScene.draw(); } else draw((performance.now() - t0) / 1000);
  requestAnimationFrame(frame);
}
await loadCreatures();
if (sheet === 'world') await setupWorld(); else prebake(STAGE_SPECS, 192);
if (worldScene) worldScene.draw(); else draw();
requestAnimationFrame(frame);
window.__preview = {
  draw, baker,
  flush: () => { baker.flush(); if (worldScene) worldScene.draw(); else draw(1.3); },
  // Avanza la simulación s segundos y mide el coste medio de dibujo.
  run(s = 1) { if (!worldScene) return null; for (let t = 0; t < s; t += 1 / 30) worldScene.step(1 / 30); const t1 = performance.now(); const n = 20; for (let i = 0; i < n; i++) worldScene.draw(); return { ms: +((performance.now() - t1) / n).toFixed(2), prey: worldScene.ocean.prey.length, preds: worldScene.ocean.preds.length, canvas: surface.canvas.width + 'x' + surface.canvas.height }; },
  get scene() { return worldScene; },
};
