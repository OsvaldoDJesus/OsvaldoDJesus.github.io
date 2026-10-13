// Composición de la escena: agua, cielo, fondo, decoración, criaturas, partículas y post-proceso.
// Las criaturas se dibujan en coordenadas de mundo (transformación de cámara); el entorno en pantalla.
import { Particles, Shake } from './kit/index.js';
import { GAME, WORLDS, QUALITY } from './content.mjs';
import { floorAt } from './terrain.mjs';
import { drawFish, STAGE_SPECS, setTexScale, prebake } from './art/bake.mjs';
import { drawCreature, sizeForPrey } from './art/creatures.mjs';
import { baker } from './art/texture.mjs';
import * as WT from './art/water.mjs';
import * as WL from './art/worlds.mjs';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const BLOOD = ['#5a0a12', '#8a1220', '#6e0f1a'];
// Los animales grandes nadan casi horizontales: limita la inclinación visual (no la física).
function limitPitch(a, mp) { const c = Math.cos(a), s = Math.sin(a); const p = clamp(Math.atan2(s, Math.abs(c)), -mp, mp); return c >= 0 ? p : Math.PI - p; }
const PITCH = { cocodrilo: 0.35, orca: 0.6, livyatan: 0.45, 'calamar-colosal': 0.7, dunkleosteus: 0.6, morena: 0.9, pejesapo: 0.5 };

export class Renderer {
  constructor(surface) {
    this.surface = surface;
    this.W = GAME.width; this.H = GAME.height;
    this.cam = { x: 0, y: 0, zoom: 1 };
    this.t = 0;
    this.susp = new WT.Suspended(150, 7);
    this.bubbles = new WT.Bubbles(320);
    this.parts = new Particles({ max: 700 });
    this.shake = new Shake();
    this.hurt = 0;
    this.flash = 0;
    this.worldIdx = -1;
    this.fps = 60; this.frameMs = 16; this.slowFor = 0;
    this.setQuality('auto');
  }

  setQuality(q) {
    this.qualityKey = q;
    const Q = QUALITY[q] || QUALITY.auto;
    this.effects = Q.effects;
    setTexScale(Q.tex);
    this.surface.setMaxDpr(Q.dpr);
  }
  devScale() { return this.surface.canvas.width / this.W; }

  // Calidad automática: si el fotograma va lento de forma sostenida, baja un escalón.
  measure(dtReal) {
    this.frameMs = this.frameMs * 0.95 + dtReal * 1000 * 0.05;
    if (this.qualityKey !== 'auto') return;
    if (this.frameMs > 26) { this.slowFor += dtReal; if (this.slowFor > 3) { this.slowFor = 0; if (this.effects > 0) this.effects--; else if (this.surface.maxDpr > 1) this.surface.setMaxDpr(this.surface.maxDpr - 0.5); } }
    else this.slowFor = Math.max(0, this.slowFor - dtReal);
  }

  enterWorld(idx, ocean) {
    this.worldIdx = idx;
    WL.prepareWorld(idx, QUALITY[this.qualityKey]?.tex ?? 1);
    const p = ocean.p;
    this.cam.x = p.x; this.cam.y = p.y; this.cam.zoom = ocean.zoom();
    this.bubbles.items.length = 0; this.parts.clear();
  }

  // ---------- eventos del motor → efectos ----------
  onEvents(evs, ocean) {
    const p = ocean.p;
    for (const e of evs) {
      switch (e.type) {
        case 'eat': {
          const big = e.r > p.len * 0.12;
          this.bubbles.emit(e.x, e.y, big ? 6 : 2, { spread: e.r, size: Math.max(1.5, e.r * 0.25), speed: 30 + e.r });
          this.parts.emit({ x: e.x, y: e.y, count: big ? 10 : 4, colors: big ? BLOOD : ['rgba(255,255,255,0.6)'], speed: 20 + e.r * 3, life: 0.6, gravity: 10, size: Math.max(1, e.r * 0.3), drag: 0.9 });
          break;
        }
        case 'lunge': this.bubbles.emit(p.x - Math.cos(e.angle) * p.len * 0.4, p.y - Math.sin(e.angle) * p.len * 0.4, 10, { spread: p.len * 0.3, size: p.len * 0.03, speed: 30 }); break;
        case 'hit_pred': this.parts.emit({ x: e.x, y: e.y, count: 26, colors: BLOOD, speed: e.pred.len * 0.5, life: 1.4, gravity: 4, size: e.pred.len * 0.03, drag: 0.92 }); this.shake.hit(4, 0.2); break;
        case 'kill': this.parts.emit({ x: e.x, y: e.y, count: 70, colors: BLOOD, speed: e.pred.len * 0.8, life: 2.2, gravity: 3, size: e.pred.len * 0.05, drag: 0.93 }); this.bubbles.emit(e.x, e.y, 30, { spread: e.pred.len * 0.4, size: e.pred.len * 0.02, speed: 60 }); this.shake.hit(e.boss ? 14 : 7, e.boss ? 0.8 : 0.35); this.flash = e.boss ? 0.8 : 0.2; break;
        case 'player_hit': this.hurt = 1; this.shake.hit(9, 0.35); this.parts.emit({ x: e.x, y: e.y, count: 18, colors: BLOOD, speed: p.len * 0.6, life: 1.2, gravity: 4, size: p.len * 0.04, drag: 0.92 }); break;
        case 'scrape': { const sand = ['#cdb98a', '#a99068', '#8a7a5a']; this.parts.emit({ x: e.x, y: e.y, count: 14, colors: sand, speed: p.len * 0.8 * e.power + 20, spread: Math.PI, angle: -Math.PI / 2, life: 1.2, gravity: 30, size: p.len * 0.03, drag: 0.9 }); break; }
        case 'evolve': this.flash = 1; this.bubbles.emit(p.x, p.y, 60, { spread: p.len, size: p.len * 0.04, speed: 80 }); this.shake.hit(10, 0.5); break;
        case 'death': this.flash = 0.6; break;
        case 'world': this.enterWorld(e.index, ocean); break;
        default: break;
      }
    }
  }

  // ---------- actualización ----------
  update(dt, ocean) {
    this.t += dt;
    const p = ocean.p, w = WORLDS[ocean.s.world];
    if (this.worldIdx !== ocean.s.world) this.enterWorld(ocean.s.world, ocean);
    // Cámara con anticipación y zoom suave.
    const zt = ocean.zoom();
    this.cam.zoom += (zt - this.cam.zoom) * Math.min(1, dt * 1.5);
    const z = this.cam.zoom;
    const lead = 0.35;
    const tx = p.x + p.vx * lead, ty = p.y + p.vy * lead * 0.6;
    this.cam.x += (tx - this.cam.x) * Math.min(1, dt * 3);
    this.cam.y += (ty - this.cam.y) * Math.min(1, dt * 3);
    const hw = this.W / 2 / z, hh = this.H / 2 / z;
    this.cam.x = clamp(this.cam.x, hw, Math.max(hw, w.size.w - hw));
    this.cam.y = clamp(this.cam.y, -hh * 0.55, Math.max(-hh * 0.55, w.size.h - hh * 0.9));
    // Animación de presas y depredadores (orientación suavizada y fase de nado).
    for (const e of ocean.prey) {
      const sp = Math.hypot(e.vx, e.vy);
      if (e.ang === undefined) e.ang = Math.atan2(e.vy, e.vx) || 0;
      if (sp > 2) e.ang += angDiff(e.ang, Math.atan2(e.vy, e.vx)) * Math.min(1, dt * 7);
      e.anim = (e.anim || e.phase) + dt * (2 + sp / Math.max(1, e.r) * 0.6);
    }
    for (const e of ocean.preds) e.anim = (e.anim || 0) + dt * (2 + Math.hypot(e.vx, e.vy) / e.len * 3);
    // Burbujas del pez al nadar rápido.
    if (p.speed > ocean.maxSpeed() * 0.8 && Math.random() < dt * 8) this.bubbles.emit(p.x - Math.cos(p.angle) * p.len * 0.45, p.y - Math.sin(p.angle) * p.len * 0.45, 1, { spread: p.len * 0.1, size: p.len * 0.025, speed: 25 });
    this.bubbles.update(dt);
    this.parts.update(dt);
    this.shake.update(dt);
    this.hurt = Math.max(0, this.hurt - dt * 1.5);
    this.flash = Math.max(0, this.flash - dt * 1.8);
    baker.run(this.effects >= 2 ? 6 : 4);
  }

  view() { return WL.makeView({ x: this.cam.x, y: this.cam.y, zoom: this.cam.zoom, W: this.W, H: this.H }); }

  // ---------- dibujo ----------
  render(ctx, ocean, { golden = false } = {}) {
    const idx = ocean.s.world, th = WL.THEMES[idx], w = WORLDS[idx];
    const v = this.view();
    const fx = this.effects;
    ctx.save();
    ctx.translate(this.shake.x, this.shake.y);
    // Fondo.
    ctx.fillStyle = th.water[th.water.length - 1][1];
    ctx.fillRect(-20, -20, this.W + 40, this.H + 40);
    WL.drawWaterBody(ctx, idx, v);
    WL.drawSky(ctx, idx, v, this.t);
    if (fx >= 1) WT.drawHaze(ctx, { W: this.W, H: this.H, t: this.t, camX: v.x, camY: v.y, zoom: v.zoom, color: th.haze, alpha: th.hazeA });
    if (fx >= 1) WL.drawBackdrop(ctx, idx, v);
    if (fx >= 1) WT.drawGodRays(ctx, { W: this.W, H: this.H, sy: v.sy(0), t: this.t, camX: v.x, zoom: v.zoom, alpha: th.rays, length: th.rayLen });
    WL.drawDecor(ctx, idx, v, this.t, 'back', fx);
    WL.drawFloor(ctx, idx, v, this.t, { caustics: fx >= 1 ? WT.drawCaustics : null, quality: fx });
    // Criaturas en coordenadas de mundo.
    ctx.save();
    ctx.translate(this.W / 2, this.H / 2); ctx.scale(v.zoom, v.zoom); ctx.translate(-v.x, -v.y);
    this.drawCreatures(ctx, ocean, v, golden);
    this.bubbles.draw(ctx);
    this.parts.render(ctx);
    ctx.restore();
    WL.drawDecor(ctx, idx, v, this.t, 'front', fx);
    // Partículas en suspensión (nieve marina, bokeh).
    this.susp.draw(ctx, { W: this.W, H: this.H, camX: v.x, camY: v.y, zoom: v.zoom, t: this.t, color: th.particles, alpha: th.particleA, glow: th.glow, bokeh: fx >= 1, count: fx >= 2 ? 150 : fx >= 1 ? 90 : 40 });
    WT.drawSurfaceUnder(ctx, { W: this.W, sy: v.sy(0), t: this.t, zoom: v.zoom, camX: v.x, light: th.light });
    // Absorción: la luz roja desaparece primero con la profundidad.
    const dk = WL.depthK(idx, v.y);
    WT.drawAbsorption(ctx, this.W, this.H, th.absorb, Math.pow(dk, 0.8) * th.absorbMax);
    if (th.glow || idx === 3) this.drawGlowPass(ctx, ocean, v);
    WT.drawVignette(ctx, this.W, this.H, 0.35 + dk * 0.35, th.vignette);
    ctx.restore();
    // Destellos de pantalla.
    if (this.hurt > 0) { const g = ctx.createRadialGradient(this.W / 2, this.H / 2, this.H * 0.3, this.W / 2, this.H / 2, this.W * 0.7); g.addColorStop(0, 'rgba(160,0,0,0)'); g.addColorStop(1, `rgba(160,0,0,${this.hurt * 0.45})`); ctx.fillStyle = g; ctx.fillRect(0, 0, this.W, this.H); }
    const lowHp = ocean.p.hp / ocean.maxHp();
    if (lowHp < 0.3) { const a = (0.3 - lowHp) * (0.6 + 0.4 * Math.sin(this.t * 6)); const g = ctx.createRadialGradient(this.W / 2, this.H / 2, this.H * 0.35, this.W / 2, this.H / 2, this.W * 0.7); g.addColorStop(0, 'rgba(120,0,0,0)'); g.addColorStop(1, `rgba(120,0,0,${a})`); ctx.fillStyle = g; ctx.fillRect(0, 0, this.W, this.H); }
    if (this.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${this.flash * 0.5})`; ctx.fillRect(0, 0, this.W, this.H); }
  }

  drawCreatures(ctx, ocean, v, golden) {
    const ds = this.devScale(), t = this.t, z = v.zoom;
    const hw = this.W / 2 / z + 60, hh = this.H / 2 / z + 60;
    const visible = (x, y, r) => Math.abs(x - v.x) < hw + r && Math.abs(y - v.y) < hh + r;
    const p = ocean.p, mouth = ocean.mouthPos();
    // Presas.
    for (const e of ocean.prey) {
      const d = e.def, size = sizeForPrey(d.art, e.r);
      if (!visible(e.x, e.y, size)) continue;
      const px = size * z * ds;
      if (px < 1.2) continue;
      const edible = d.minStage <= ocean.s.stage;
      if (edible && Math.hypot(e.x - mouth.x, e.y - mouth.y) < p.len * 2.2) {
        ctx.strokeStyle = 'rgba(180,255,190,0.22)'; ctx.lineWidth = Math.max(0.6, 1 / z);
        ctx.beginPath(); ctx.arc(e.x, e.y, size * 0.6 + 2 / z, 0, TAU); ctx.stroke();
      }
      const o = { x: e.x, y: e.y, ang: d.behavior === 'floor' || d.art === 'medusa' ? 0 : e.ang, size, len: size, phase: e.anim, t, variant: d.variant, speedK: clamp(Math.hypot(e.vx, e.vy) / (d.speed || 1), 0, 1), px, dir: e.vx >= 0 ? 1 : -1, glow: d.glow };
      drawCreature(ctx, d.art, o);
    }
    // Depredadores (con aviso rojo al preparar el ataque).
    for (const e of ocean.preds) {
      if (!visible(e.x, e.y, e.len)) continue;
      if (e.windupK > 0) {
        const hx = e.x + Math.cos(e.angle) * e.len * 0.4, hy = e.y + Math.sin(e.angle) * e.len * 0.4;
        const g = ctx.createRadialGradient(hx, hy, 0, hx, hy, e.len * 0.45);
        g.addColorStop(0, `rgba(255,40,40,${0.35 * e.windupK})`); g.addColorStop(1, 'rgba(255,40,40,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(hx, hy, e.len * 0.45, 0, TAU); ctx.fill();
      }
      drawCreature(ctx, e.def.art, { x: e.x, y: e.y, ang: limitPitch(e.angle, PITCH[e.def.art] ?? 0.7), size: e.len, len: e.len, phase: e.anim, t, variant: e.def.variant, mouth: Math.max(e.windupK, e.state === 'recover' ? 0.3 : 0), hit: e.hitFlash * 3, speedK: clamp(Math.hypot(e.vx, e.vy) / e.def.speed, 0, 1), px: e.len * z * ds });
    }
    // Jugador.
    const blink = p.invuln > 0 && p.dead <= 0 && Math.floor(this.t * 12) % 2 === 0;
    if (p.dead <= 0 || Math.floor(this.t * 8) % 2) {
      ctx.save(); if (blink) ctx.globalAlpha = 0.5;
      drawFish(ctx, STAGE_SPECS[ocean.s.stage], { x: p.x, y: p.y, ang: limitPitch(p.angle, ocean.s.stage >= 6 ? 0.9 : 1.25), len: p.len, phase: p.phase, speedK: clamp(p.speed / ocean.maxSpeed(), 0, 1.3), mouth: p.mouth, t, hit: p.flash, golden, px: p.len * z * ds });
      ctx.restore();
    }
  }

  // Bioluminiscencia tras la absorción para que siga brillando en la oscuridad.
  drawGlowPass(ctx, ocean, v) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const draw = (x, y, r, col, a) => {
      const sx = v.sx(x), sy = v.sy(y), rr = r * v.zoom;
      if (sx < -rr || sx > this.W + rr || sy < -rr || sy > this.H + rr) return;
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, rr);
      g.addColorStop(0, col.replace('A', a)); g.addColorStop(1, col.replace('A', 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, rr, 0, TAU); ctx.fill();
    };
    for (const e of ocean.prey) if (e.def.glow) draw(e.x, e.y, e.r * 3, 'rgba(110,240,255,A)', 0.22 + 0.1 * Math.sin(this.t * 2 + e.glowPhase));
    for (const e of ocean.preds) if (e.def.art === 'pejesapo') draw(e.x + Math.cos(e.angle) * e.len * 0.55, e.y - e.len * 0.35, e.len * 0.5, 'rgba(160,255,255,A)', 0.3);
    ctx.restore();
  }

  // Precalienta texturas del jugador y de las presas del mundo (pantalla de carga).
  warmup(ocean) {
    prebake(STAGE_SPECS.slice(Math.max(0, ocean.s.stage - 1), ocean.s.stage + 2), 192);
    WL.prepareWorld(ocean.s.world, QUALITY[this.qualityKey]?.tex ?? 1);
  }
}

export { floorAt };
