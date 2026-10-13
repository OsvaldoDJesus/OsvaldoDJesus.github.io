// Motor de Megalodón: Evolución. Sin DOM ni Canvas: físicas de nado, presas, depredadores,
// combate, evolución, mundos y economía. Determinista con semilla y probable en Node.
import { Rng } from './kit/core/rng.js';
import { BALANCE, STAGES, WORLDS, PREY, PREDATORS, UPGRADES, GEM_SHOP } from './content.mjs';
import { floorAt } from './terrain.mjs';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };

// ---------- fórmulas de escala ----------
export const xpNeed = (s) => BALANCE.xpBase * Math.pow(BALANCE.xpGrowth, s);
export const hpFor = (s) => BALANCE.hpBase * Math.pow(BALANCE.hpGrowth, s);
export const biteFor = (s) => BALANCE.biteBase * Math.pow(BALANCE.biteGrowth, s);
export const incomeScale = (s) => Math.pow(BALANCE.incomeGrowth, s);
export const blFor = (s) => lerp(BALANCE.blStart, BALANCE.blEnd, s / (STAGES.length - 1));
export const preyXp = (def) => def.k * Math.pow(BALANCE.preyGrowth, def.minStage);
export function predStats(def) {
  return { hp: def.hpHits * biteFor(def.refStage), dmg: def.dmgFrac * hpFor(def.refStage), xp: def.xpK * Math.pow(BALANCE.preyGrowth, def.refStage) };
}

export function createSave() {
  return {
    coins: 0, xp: 0, stage: 0, world: 0, gems: 0,
    upgrades: {}, bosses: {}, medals: 0,
    noAds: false, golden: false, entitlements: {},
    boosts: { adUntil: 0, turboUntil: 0 },
    settings: { sound: true, quality: 'auto' },
    stats: { eaten: 0, kills: 0, bossKills: 0, deaths: 0, ascensions: 0, playSeconds: 0, evolutions: 0, lifetimeXp: 0 },
    lastSeen: 0,
  };
}

export function validateSave(s) {
  return !!(s && typeof s === 'object' && typeof s.coins === 'number' && typeof s.stage === 'number' && s.stage >= 0 && s.stage < STAGES.length
    && typeof s.world === 'number' && s.world >= 0 && s.world < WORLDS.length && s.upgrades && s.stats && s.settings);
}

export const MIGRATIONS = {};

const PREY_BY_WORLD = WORLDS.map((_, i) => PREY.filter((p) => p.world === i));
const PRED_BY_WORLD = WORLDS.map((_, i) => PREDATORS.filter((p) => p.world === i));

export class Ocean {
  constructor(save = createSave(), { seed = 1, now = () => Date.now() } = {}) {
    this.s = save;
    this.rng = new Rng(seed);
    this.now = now;
    this.clock = 0;
    this.nextId = 1;
    this.steer = { x: 0, y: 0, active: false };
    this.events = [];
    this.prey = [];
    this.preds = [];
    this.groups = new Map();
    this.respawns = [];
    this.chain = 0;
    this.chainTimer = 0;
    this.spawnTimer = 0;
    this.exitToast = 0;
    this._evoReady = false;
    this.enterWorld(save.world, 'start');
  }

  // ---------- consultas ----------
  get stageDef() { return STAGES[this.s.stage]; }
  get worldDef() { return WORLDS[this.s.world]; }
  lvl(id) { return this.s.upgrades[id] || 0; }
  progress() { return clamp(this.s.xp / xpNeed(this.s.stage), 0, 1); }

  // Longitud continua: el pez crece al comer dentro de cada etapa.
  len() {
    const st = this.stageDef, next = STAGES[this.s.stage + 1], prog = Math.pow(this.progress(), 0.8);
    if (next) return st.len + (next.len - st.len) * 0.6 * prog;
    return st.len * (1 + (BALANCE.megaGrowthCap - 1) * prog);
  }
  stageFloat() { return this.s.stage + this.progress() * 0.99; }
  // Zoom de cámara: el pez ocupa un tamaño en pantalla que crece con la etapa.
  zoom() {
    const t = clamp(this.stageFloat() / (STAGES.length - 1), 0, 1);
    const onScreen = lerp(BALANCE.onScreen[0], BALANCE.onScreen[1], t * t * 0.4 + t * 0.6);
    return onScreen / this.len();
  }
  viewSize(width = 960, height = 540) { const z = this.zoom(); return { w: width / z, h: height / z }; }

  incomeMult(nowMs = this.now()) {
    let m = 1 + 0.20 * this.lvl('digestion');
    m *= Math.pow(BALANCE.medalMult, this.s.medals);
    if (this.s.golden) m *= 2;
    if (this.s.boosts.adUntil > nowMs) m *= 2;
    if (this.s.boosts.turboUntil > nowMs) m *= 2;
    return m;
  }
  speedMult() { return 1 + 0.06 * this.lvl('aletas'); }
  biteMult() { return 1 + 0.12 * this.lvl('mandibula'); }
  reachMult() { return 1 + 0.04 * this.lvl('mandibula'); }
  magnetR() { return this.len() * (0.40 + 0.05 * this.lvl('olfato')); }
  maxHp() { return hpFor(this.s.stage) * (1 + 0.10 * this.lvl('branquias')); }
  regenRate() { return BALANCE.regenRate * (1 + 0.15 * this.lvl('branquias')); }
  armor() { return Math.min(0.6, 0.03 * this.lvl('escamas')); }
  chainWindow() { return BALANCE.chainWindow + 0.1 * this.lvl('frenesi'); }
  chainStep() { return BALANCE.chainStep * (1 + 0.02 * this.lvl('frenesi')); }
  lungeCd() { return BALANCE.lungeCooldown * Math.pow(0.96, this.lvl('impulso')); }
  maxSpeed() { return this.len() * blFor(this.s.stage) * this.speedMult(); }
  passiveRate() { return this.lvl('cardumen') * 0.5 * incomeScale(this.s.stage) * this.incomeMult(); }
  biteDamage() { return biteFor(this.s.stage) * this.biteMult(); }

  upgradeDef(id) { return UPGRADES.find((u) => u.id === id); }
  upgradeCost(id) {
    const u = this.upgradeDef(id), lvl = this.lvl(id);
    if (!u || lvl >= u.max) return null;
    return u.base * Math.pow(u.r, lvl) * Math.pow(BALANCE.costStageGrowth, this.s.stage);
  }
  buyUpgrade(id) {
    const c = this.upgradeCost(id);
    if (c == null || this.s.coins < c) return false;
    this.s.coins -= c;
    this.s.upgrades[id] = this.lvl(id) + 1;
    if (id === 'branquias') this.p.hp = Math.min(this.maxHp(), this.p.hp + this.maxHp() * 0.1);
    return true;
  }

  // ---------- jugador ----------
  makePlayer(x, y, hpRatio = 1) {
    return { x, y, vx: 0, vy: 0, angle: 0, phase: 0, len: this.len(), hp: this.maxHp() * hpRatio, lungeT: 0, lungeCd: 0, hitSet: new Set(), invuln: 0, mouth: 0, flash: 0, sinceHit: 99, speed: 0, dead: 0 };
  }
  setSteer(x, y, active) { this.steer.x = x; this.steer.y = y; this.steer.active = !!active; }
  lunge() {
    const p = this.p;
    if (p.lungeCd > 0 || p.lungeT > 0 || p.dead > 0) return false;
    p.lungeT = BALANCE.lungeDuration;
    p.lungeCd = this.lungeCd();
    p.hitSet.clear();
    const sp = Math.hypot(p.vx, p.vy);
    const dir = sp > 5 ? Math.atan2(p.vy, p.vx) : p.angle;
    p.vx += Math.cos(dir) * this.maxSpeed() * 1.4;
    p.vy += Math.sin(dir) * this.maxSpeed() * 1.4;
    this.events.push({ type: 'lunge', x: p.x, y: p.y, angle: dir });
    return true;
  }
  mouthPos() { const p = this.p; return { x: p.x + Math.cos(p.angle) * p.len * 0.42, y: p.y + Math.sin(p.angle) * p.len * 0.42 }; }

  currentAt(x, y) {
    const c = this.worldDef.current;
    const k = 0.6 + 0.4 * Math.sin(this.clock * 0.2 + y * 0.002);
    return { x: c.x * k + Math.sin(this.clock * 0.35 + y * 0.004) * 4, y: c.y * k + Math.cos(this.clock * 0.3 + x * 0.003) * 2 };
  }

  updatePlayer(dt) {
    const p = this.p, w = this.worldDef, st = this.steer;
    p.len = this.len();
    const vmax = this.maxSpeed() * (p.lungeT > 0 ? BALANCE.lungeSpeedMult : 1);
    let dvx = 0, dvy = 0;
    if (st.active && p.dead <= 0) {
      // La BOCA es lo que va al puntero: así el pez no se queda con la presa bajo el vientre.
      const m = this.mouthPos();
      const dx = st.x - m.x, dy = st.y - m.y, dist = Math.hypot(dx, dy);
      if (dist > p.len * 0.05) {
        const strength = clamp(dist / (p.len * 1.2), 0.2, 1);
        dvx = (dx / dist) * vmax * strength; dvy = (dy / dist) * vmax * strength;
      }
    }
    // Aceleración limitada hacia la velocidad deseada; sin entrada, el pez se desliza (inercia).
    const k = st.active ? 4.2 : 1.1;
    let ax = (dvx - p.vx) * k, ay = (dvy - p.vy) * k;
    const amax = vmax * 5;
    const am = Math.hypot(ax, ay);
    if (am > amax) { ax *= amax / am; ay *= amax / am; }
    p.vx += ax * dt; p.vy += ay * dt;
    // Arrastre: limita la sobrevelocidad tras el mordisco.
    const sp0 = Math.hypot(p.vx, p.vy);
    if (sp0 > vmax) { const f = Math.max(vmax / sp0, 1 - 6 * dt); p.vx *= f; p.vy *= f; }
    const cur = this.currentAt(p.x, p.y);
    p.x += (p.vx + cur.x * 0.5) * dt;
    p.y += (p.vy + cur.y * 0.5) * dt;
    // Límites: superficie, fondo y paredes.
    const minY = p.len * 0.22;
    if (p.y < minY) { p.y = minY; if (p.vy < 0) p.vy *= -0.2; }
    const fl = floorAt(this.s.world, p.x) - p.len * 0.14;
    if (p.y > fl) { if (p.vy > p.len * 0.8) this.events.push({ type: 'scrape', x: p.x, y: fl + p.len * 0.14, power: Math.min(1, p.vy / (p.len * 4)) }); p.y = fl; if (p.vy > 0) p.vy *= -0.25; }
    // Margen fijo: un pez enorme debe poder alcanzar la zona de salida del mundo.
    if (p.x < 40) { p.x = 40; if (p.vx < 0) p.vx *= -0.2; }
    if (p.x > w.size.w - 40) { p.x = w.size.w - 40; if (p.vx > 0) p.vx *= -0.2; }
    p.speed = Math.hypot(p.vx, p.vy);
    // Orientación suavizada.
    if (p.speed > vmax * 0.06) {
      const target = Math.atan2(p.vy, p.vx);
      const turn = (7 / (1 + p.len / 260)) * dt * (p.lungeT > 0 ? 2 : 1);
      p.angle += clamp(angDiff(p.angle, target), -turn, turn);
    }
    p.phase += dt * (1.2 + (p.speed / Math.max(1, p.len)) * 2.4);
    p.lungeT = Math.max(0, p.lungeT - dt);
    p.lungeCd = Math.max(0, p.lungeCd - dt);
    p.invuln = Math.max(0, p.invuln - dt);
    p.mouth = Math.max(0, p.mouth - dt * 4);
    p.flash = Math.max(0, p.flash - dt * 3);
    p.sinceHit += dt;
    p.dead = Math.max(0, p.dead - dt);
    if (p.sinceHit > BALANCE.regenDelay && p.hp < this.maxHp()) p.hp = Math.min(this.maxHp(), p.hp + this.maxHp() * this.regenRate() * dt);
  }

  // ---------- mundos ----------
  enterWorld(idx, from = 'start') {
    const w = WORLDS[idx];
    const hpRatio = this.p ? this.p.hp / Math.max(1, this.maxHp()) : 1;
    this.s.world = idx;
    this.prey.length = 0; this.preds.length = 0; this.groups.clear(); this.respawns.length = 0;
    const margin = BALANCE.exitWidth + 140;
    const x = from === 'right' ? w.size.w - margin : from === 'left' ? margin : w.size.w * 0.3;
    const y = w.size.h * (idx === 1 ? 0.22 : 0.3);
    this.p = this.makePlayer(x, y, Math.min(1, hpRatio));
    this.p.invuln = 1;
    for (const def of PRED_BY_WORLD[idx]) {
      if (def.boss && this.s.bosses[def.id]) continue;
      for (let i = 0; i < def.count; i++) this.spawnPredator(def, true);
    }
    this.maintainSpawns(true);
    this.events.push({ type: 'world', index: idx, from });
  }

  canTravel(dir) {
    const idx = this.s.world, tgt = idx + dir;
    if (tgt < 0 || tgt >= WORLDS.length) return { ok: false, reason: null };
    if (dir < 0) return { ok: true };
    const w = WORLDS[idx];
    if (this.s.stage < w.exitStage) return { ok: false, reason: `Necesitas ser ${STAGES[w.exitStage].name} para seguir` };
    if (w.bossId && !this.s.bosses[w.bossId]) {
      const b = PREDATORS.find((d) => d.id === w.bossId);
      return { ok: false, reason: `Derrota a ${b.name} para seguir` };
    }
    return { ok: true };
  }
  travel(dir) {
    const r = this.canTravel(dir);
    if (!r.ok) return r;
    this.enterWorld(this.s.world + dir, dir > 0 ? 'left' : 'right');
    return r;
  }
  checkExits(dt) {
    const p = this.p, w = this.worldDef;
    this.exitToast = Math.max(0, this.exitToast - dt);
    let dir = 0;
    if (p.x > w.size.w - BALANCE.exitWidth) dir = 1;
    else if (p.x < BALANCE.exitWidth && this.s.world > 0) dir = -1;
    if (!dir) return;
    const r = this.canTravel(dir);
    if (r.ok) this.travel(dir);
    else if (r.reason && this.exitToast <= 0) { this.exitToast = 4; this.events.push({ type: 'exit_blocked', reason: r.reason }); }
  }

  // ---------- evolución ----------
  evolveBlock() {
    const s = this.s;
    if (s.stage >= STAGES.length - 1) return 'Eres el Megalodón';
    if (s.xp < xpNeed(s.stage)) return 'Come más para evolucionar';
    const next = STAGES[s.stage + 1];
    if (next.world > s.world) return `Viaja a ${WORLDS[next.world].name} para evolucionar`;
    return null;
  }
  canEvolve() { return this.evolveBlock() === null; }
  evolve() {
    if (!this.canEvolve()) return false;
    const s = this.s;
    s.xp = Math.max(0, s.xp - xpNeed(s.stage));
    s.stage++;
    s.stats.evolutions++;
    this.p.len = this.len();
    this.p.hp = this.maxHp();
    this._evoReady = false;
    this.events.push({ type: 'evolve', stage: s.stage });
    return true;
  }

  // ---------- ascensión (prestigio) ----------
  canAscend() {
    const s = this.s;
    return s.stage === STAGES.length - 1 && s.world === WORLDS.length - 1 && !!s.bosses.livyatan && s.xp >= xpNeed(s.stage);
  }
  ascend() {
    if (!this.canAscend()) return false;
    const s = this.s;
    s.medals++;
    s.stats.ascensions++;
    s.coins = 0; s.xp = 0; s.stage = 0; s.upgrades = {}; s.bosses = {};
    this.p = null;
    this.enterWorld(0, 'start');
    this.events.push({ type: 'ascend', medals: s.medals });
    return true;
  }

  // ---------- gemas y boosts ----------
  spendGems(id) {
    const item = GEM_SHOP.find((g) => g.id === id);
    const s = this.s;
    if (!item || s.gems < item.gems) return false;
    s.gems -= item.gems;
    if (id === 'banquete') s.xp = Math.min(xpNeed(s.stage) * BALANCE.xpCapFactor, s.xp + xpNeed(s.stage) * 0.25);
    if (id === 'turbo') s.boosts.turboUntil = Math.max(this.now(), s.boosts.turboUntil) + 10 * 60 * 1000;
    if (id === 'curar') this.p.hp = this.maxHp();
    return true;
  }
  grantAdBoost(minutes = 3) { this.s.boosts.adUntil = Math.max(this.now(), this.s.boosts.adUntil) + minutes * 60 * 1000; }

  // ---------- spawns ----------
  region() {
    const v = this.viewSize();
    const w = this.worldDef;
    return { w: Math.min(w.size.w, v.w * 2.6), h: Math.min(w.size.h, v.h * 2.6), view: v };
  }
  yBand(def) {
    const h = this.worldDef.size.h;
    return [def.y[0] * h, def.y[1] * h];
  }
  spawnPrey(def, x, y, group = null, offset = null) {
    const rng = this.rng;
    const r = def.r * rng.range(0.88, 1.14);
    const e = { id: this.nextId++, def, x, y, vx: 0, vy: 0, r, phase: rng.range(0, TAU), heading: rng.range(0, TAU), timer: rng.range(0.5, 3), spd: def.speed * rng.range(0.85, 1.15), group, ox: offset ? offset.x : 0, oy: offset ? offset.y : 0, dir: rng.chance(0.5) ? 1 : -1, glowPhase: rng.range(0, TAU) };
    this.prey.push(e);
    return e;
  }
  spawnAt(def, x, y) {
    const w = this.worldDef;
    if (def.behavior === 'floor') { x = clamp(x, 200, w.size.w - 200); y = floorAt(this.s.world, x) - def.r * 0.8; }
    else { x = clamp(x, 200, w.size.w - 200); const [a, b] = this.yBand(def); y = clamp(y, Math.max(a, def.r * 1.2), Math.min(b, floorAt(this.s.world, x) - def.r * 1.4)); }
    if (def.school) {
      const n = this.rng.int(def.school[0], def.school[1]);
      const g = { id: this.nextId++, def, x, y, vx: 0, vy: 0, heading: this.rng.range(0, TAU), timer: 2, members: 0 };
      this.groups.set(g.id, g);
      const R = def.r * Math.sqrt(n) * 2.4;
      for (let i = 0; i < n; i++) {
        const a = this.rng.range(0, TAU), d = Math.sqrt(this.rng.next()) * R;
        this.spawnPrey(def, x, y, g, { x: Math.cos(a) * d, y: Math.sin(a) * d * 0.6 });
        g.members++;
      }
    } else this.spawnPrey(def, x, y);
  }
  maintainSpawns(initial = false) {
    const p = this.p, defs = PREY_BY_WORLD[this.s.world];
    const reg = this.region();
    const regionArea = reg.w * reg.h, viewArea = reg.view.w * reg.view.h;
    // Un cardumen cuenta como una unidad, no como cada uno de sus peces.
    const per = new Map(), seen = new Set();
    for (const e of this.prey) {
      if (e.group) { if (seen.has(e.group.id)) continue; seen.add(e.group.id); }
      per.set(e.def.id, (per.get(e.def.id) || 0) + 1);
    }
    for (const def of defs) {
      const target = Math.ceil(def.perView * (regionArea / viewArea));
      let have = per.get(def.id) || 0;
      let budget = initial ? target : 3;
      while (have < target && budget-- > 0) {
        // Fuera de la pantalla visible salvo en el llenado inicial.
        let x, y, tries = 0;
        do {
          x = p.x + this.rng.range(-reg.w / 2, reg.w / 2);
          y = p.y + this.rng.range(-reg.h / 2, reg.h / 2);
          tries++;
        } while (!initial && tries < 8 && Math.abs(x - p.x) < reg.view.w * 0.55 && Math.abs(y - p.y) < reg.view.h * 0.55);
        this.spawnAt(def, x, y);
        have++;
      }
    }
    // Despawn lejano.
    const lx = reg.w * 0.8, ly = reg.h * 0.8;
    for (let i = this.prey.length - 1; i >= 0; i--) {
      const e = this.prey[i];
      if (Math.abs(e.x - p.x) > lx || Math.abs(e.y - p.y) > ly) { this.prey[i] = this.prey[this.prey.length - 1]; this.prey.pop(); this.dropMember(e); }
    }
  }
  dropMember(e) {
    if (!e.group) return;
    e.group.members--;
    if (e.group.members <= 0) this.groups.delete(e.group.id);
  }
  spawnPredator(def) {
    const w = this.worldDef, rng = this.rng, st = predStats(def);
    let x, y, tries = 0;
    do {
      x = rng.range(w.size.w * 0.12, w.size.w * 0.88);
      y = rng.range(def.y[0], def.y[1]) * w.size.h;
      tries++;
    } while (this.p && tries < 12 && Math.hypot(x - this.p.x, y - this.p.y) < 900);
    y = clamp(y, def.len * 0.12, floorAt(this.s.world, x) - def.len * 0.12);
    const e = { id: this.nextId++, def, x, y, vx: 0, vy: 0, angle: rng.range(0, TAU), heading: rng.range(0, TAU), hp: st.hp, maxHp: st.hp, dmg: st.dmg, xp: st.xp, state: 'patrol', timer: rng.range(1, 3), windupK: 0, hitFlash: 0, t: rng.range(0, 10), home: { x, y }, len: def.len };
    this.preds.push(e);
    return e;
  }

  // ---------- IA de presas ----------
  updateGroups(dt) {
    const p = this.p;
    for (const g of this.groups.values()) {
      const def = g.def;
      g.timer -= dt;
      if (g.timer <= 0) { g.heading += this.rng.range(-0.9, 0.9); g.timer = this.rng.range(2, 5); }
      const dx = g.x - p.x, dy = g.y - p.y, dp = Math.hypot(dx, dy) || 1;
      let sp = def.speed * 0.55, hx = Math.cos(g.heading), hy = Math.sin(g.heading);
      if (def.flee && p.len > def.r * 1.8 && dp < def.r * 12 + p.len * 2) { hx = dx / dp; hy = dy / dp; sp = def.speed * 1.5; g.heading = Math.atan2(hy, hx); }
      g.vx += (hx * sp - g.vx) * Math.min(1, dt * 2);
      g.vy += (hy * sp - g.vy) * Math.min(1, dt * 2);
      g.x += g.vx * dt; g.y += g.vy * dt;
      const w = this.worldDef;
      const [ya, yb] = this.yBand(def);
      if (g.x < 220 || g.x > w.size.w - 220) { g.heading = Math.PI - g.heading; g.x = clamp(g.x, 220, w.size.w - 220); }
      const fl = floorAt(this.s.world, g.x) - def.r * 3;
      if (g.y < Math.max(ya, def.r * 3) || g.y > Math.min(yb, fl)) { g.heading = -g.heading; g.y = clamp(g.y, Math.max(ya, def.r * 3), Math.min(yb, fl)); }
    }
  }
  updatePrey(dt) {
    const p = this.p, w = this.worldDef, wid = this.s.world;
    const wakeR = p.len * 1.6, wakeK = Math.min(1, p.speed / Math.max(1, this.maxSpeed()));
    const magR = this.magnetR(), mouth = this.mouthPos();
    for (let i = 0; i < this.prey.length; i++) {
      const e = this.prey[i], d = e.def;
      const cur = this.currentAt(e.x, e.y);
      let dvx = 0, dvy = 0;
      const dx = e.x - p.x, dy = e.y - p.y, dp = Math.hypot(dx, dy) || 1;
      if (e.group) {
        const g = e.group;
        const tx = g.x + e.ox, ty = g.y + e.oy;
        dvx = (tx - e.x) * 2.2 + g.vx; dvy = (ty - e.y) * 2.2 + g.vy;
        const m = Math.hypot(dvx, dvy), cap = d.speed * 1.7;
        if (m > cap) { dvx *= cap / m; dvy *= cap / m; }
      } else if (d.behavior === 'drift') {
        dvx = Math.sin(this.clock * 0.7 + e.phase) * d.speed; dvy = Math.cos(this.clock * 0.5 + e.phase * 1.3) * d.speed * 0.6;
      } else if (d.behavior === 'bob') {
        dvx = Math.cos(this.clock * 0.25 + e.phase) * d.speed * 0.5; dvy = Math.sin(this.clock * 0.6 + e.phase) * d.speed;
      } else if (d.behavior === 'floor') {
        e.timer -= dt; if (e.timer <= 0) { e.dir = this.rng.chance(0.5) ? 1 : -1; e.timer = this.rng.range(2, 6); }
        dvx = e.dir * e.spd;
      } else { // wander
        e.timer -= dt; if (e.timer <= 0) { e.heading += this.rng.range(-1.2, 1.2); e.timer = this.rng.range(1.5, 4); }
        dvx = Math.cos(e.heading) * e.spd * 0.6; dvy = Math.sin(e.heading) * e.spd * 0.6;
      }
      // Huida: solo si el jugador es una amenaza (más grande que la presa).
      const threat = p.len > e.r * 1.6;
      if (d.flee && threat && dp < e.r * 10 + p.len * 1.4 && d.behavior !== 'floor') {
        dvx = (dx / dp) * e.spd * 2.2; dvy = (dy / dp) * e.spd * 2.2;
        e.heading = Math.atan2(dvy, dvx);
      }
      // Succión del olfato: solo comida comestible.
      if (d.minStage <= this.s.stage && magR > 0) {
        const mdx = mouth.x - e.x, mdy = mouth.y - e.y, md = Math.hypot(mdx, mdy) || 1;
        if (md < magR) { const pull = (1 - md / magR) * (p.len * 0.9 + 20); dvx += (mdx / md) * pull; dvy += (mdy / md) * pull; }
      }
      // Estela del nadador: el agua desplazada empuja lo ligero.
      if (dp < wakeR && e.r < p.len * 0.6) {
        const f = (1 - dp / wakeR) * wakeK * p.len * 0.9;
        dvx += (dx / dp) * f; dvy += (dy / dp) * f;
      }
      const k = Math.min(1, dt * (e.group ? 3.5 : 3));
      e.vx += (dvx - e.vx) * k; e.vy += (dvy - e.vy) * k;
      e.x += (e.vx + cur.x * 0.5) * dt; e.y += (e.vy + cur.y * 0.5) * dt;
      if (e.x < 60) { e.x = 60; e.vx = Math.abs(e.vx); e.heading = 0; }
      if (e.x > w.size.w - 60) { e.x = w.size.w - 60; e.vx = -Math.abs(e.vx); e.heading = Math.PI; }
      const fl = floorAt(wid, e.x);
      if (d.behavior === 'floor') e.y = fl - e.r * 0.8;
      else {
        if (e.y > fl - e.r * 1.2) { e.y = fl - e.r * 1.2; e.vy = -Math.abs(e.vy); e.heading = -Math.abs(e.heading); }
        if (e.y < e.r * 1.2) { e.y = e.r * 1.2; e.vy = Math.abs(e.vy); e.heading = Math.abs(e.heading); }
      }
    }
  }

  // ---------- comer ----------
  eatPrey(dt) {
    const p = this.p, s = this.s;
    this.chainTimer = Math.max(0, this.chainTimer - dt);
    if (this.chainTimer <= 0) this.chain = 0;
    if (p.dead > 0) return;
    const mouth = this.mouthPos();
    const reachBase = p.len * 0.2 * this.reachMult() * (p.lungeT > 0 ? 1.4 : 1);
    const cap = xpNeed(s.stage) * BALANCE.xpCapFactor;
    for (let i = this.prey.length - 1; i >= 0; i--) {
      const e = this.prey[i], d = e.def;
      if (d.minStage > s.stage) continue;
      const dx = e.x - mouth.x, dy = e.y - mouth.y;
      const reach = reachBase + e.r * 0.7;
      if (dx * dx + dy * dy > reach * reach) continue;
      this.chain = this.chainTimer > 0 ? Math.min(BALANCE.chainMax, this.chain + 1) : 1;
      this.chainTimer = this.chainWindow();
      const mult = this.incomeMult() * (1 + this.chainStep() * (this.chain - 1));
      const xp = preyXp(d) * mult, coins = xp * 0.7;
      s.xp = Math.min(cap, s.xp + xp);
      s.coins += coins;
      s.stats.eaten++; s.stats.lifetimeXp += xp;
      p.mouth = 1;
      this.events.push({ type: 'eat', x: e.x, y: e.y, r: e.r, def: d, xp, coins, chain: this.chain });
      this.prey[i] = this.prey[this.prey.length - 1]; this.prey.pop();
      this.dropMember(e);
    }
    if (!this._evoReady && this.canEvolve()) { this._evoReady = true; this.events.push({ type: 'evolve_ready' }); }
    if (this._evoReady && !this.canEvolve()) this._evoReady = false;
  }

  // ---------- combate ----------
  damagePlayer(dmg, from) {
    const p = this.p;
    if (p.invuln > 0 || p.dead > 0) return false;
    dmg *= 1 - this.armor();
    p.hp -= dmg; p.invuln = BALANCE.invulnAfterHit; p.sinceHit = 0; p.flash = 1;
    const dx = p.x - from.x, dy = p.y - from.y, d = Math.hypot(dx, dy) || 1;
    p.vx += (dx / d) * this.maxSpeed() * 0.9; p.vy += (dy / d) * this.maxSpeed() * 0.9;
    this.chain = 0; this.chainTimer = 0;
    this.events.push({ type: 'player_hit', dmg, x: p.x, y: p.y, from });
    if (p.hp <= 0) this.die();
    return true;
  }
  die() {
    const s = this.s, p = this.p;
    s.stats.deaths++;
    const loss = s.coins * BALANCE.deathCoinLoss;
    s.coins -= loss;
    this.events.push({ type: 'death', loss, x: p.x, y: p.y });
    const w = this.worldDef;
    p.x = w.size.w * 0.3; p.y = w.size.h * (this.s.world === 1 ? 0.22 : 0.3);
    p.vx = p.vy = 0; p.hp = this.maxHp(); p.invuln = BALANCE.respawnInvuln; p.dead = 1.2;
    for (const e of this.preds) { e.state = 'patrol'; e.timer = 2; e.windupK = 0; }
  }
  lungeHits() {
    const p = this.p;
    if (p.lungeT <= 0) return;
    const mouth = this.mouthPos();
    const ratio = clamp(p.speed / Math.max(1, this.maxSpeed() * BALANCE.lungeSpeedMult), 0, 1);
    for (let i = this.preds.length - 1; i >= 0; i--) {
      const e = this.preds[i];
      if (p.hitSet.has(e.id)) continue;
      const dx = e.x - mouth.x, dy = e.y - mouth.y;
      const r = e.len * 0.34 + p.len * 0.2;
      if (dx * dx + dy * dy > r * r) continue;
      p.hitSet.add(e.id);
      const dmg = this.biteDamage() * (0.8 + 0.4 * ratio);
      e.hp -= dmg; e.hitFlash = 0.25;
      const d = Math.hypot(dx, dy) || 1;
      e.vx += (dx / d) * e.def.speed * 0.5; e.vy += (dy / d) * e.def.speed * 0.5;
      p.mouth = 1;
      this.events.push({ type: 'hit_pred', pred: e, dmg, x: e.x, y: e.y });
      if (e.hp <= 0) this.killPredator(i);
    }
  }
  killPredator(i) {
    const e = this.preds[i], d = e.def, s = this.s;
    this.preds[i] = this.preds[this.preds.length - 1]; this.preds.pop();
    const mult = this.incomeMult();
    const xp = e.xp * mult, coins = xp * 0.7;
    s.xp = Math.min(xpNeed(s.stage) * BALANCE.xpCapFactor, s.xp + xp); s.coins += coins;
    s.stats.kills++; s.stats.lifetimeXp += xp;
    this.events.push({ type: 'kill', pred: e, x: e.x, y: e.y, xp, coins, boss: !!d.boss });
    if (d.boss) { s.bosses[d.id] = true; s.stats.bossKills++; this.events.push({ type: 'boss_kill', def: d }); }
    else this.respawns.push({ at: this.clock + BALANCE.respawnPredSeconds, def: d, world: s.world });
  }

  updatePreds(dt) {
    const p = this.p, w = this.worldDef;
    for (const e of this.preds) {
      const d = e.def;
      e.t += dt; e.hitFlash = Math.max(0, e.hitFlash - dt);
      const dx = p.x - e.x, dy = p.y - e.y, dist = Math.hypot(dx, dy) || 1;
      const attackDist = d.attackRange + p.len * 0.25;
      let dvx = 0, dvy = 0;
      const speed = d.speed;
      if (e.state === 'patrol') {
        e.timer -= dt; if (e.timer <= 0) { e.heading += this.rng.range(-1.2, 1.2); e.timer = this.rng.range(2, 5); }
        // Vuelve a su territorio si se aleja demasiado.
        const hx = e.home.x - e.x, hy = e.home.y - e.y;
        if (Math.hypot(hx, hy) > 1100) e.heading = Math.atan2(hy, hx);
        dvx = Math.cos(e.heading) * speed * 0.35; dvy = Math.sin(e.heading) * speed * 0.35;
        if (dist < d.detect && p.dead <= 0 && p.invuln <= 0.2) e.state = 'chase';
      } else if (e.state === 'chase') {
        const lx = p.x + p.vx * 0.25, ly = p.y + p.vy * 0.25;
        const tx = lx - e.x, ty = ly - e.y, td = Math.hypot(tx, ty) || 1;
        dvx = (tx / td) * speed; dvy = (ty / td) * speed;
        if (dist > d.detect * 1.8 || p.dead > 0) e.state = 'patrol';
        else if (dist < attackDist) { e.state = 'windup'; e.timer = d.windup; }
      } else if (e.state === 'windup') {
        e.timer -= dt; e.windupK = 1 - clamp(e.timer / d.windup, 0, 1);
        dvx = (dx / dist) * speed * 0.15; dvy = (dy / dist) * speed * 0.15;
        if (e.timer <= 0) {
          if (dist < attackDist * 1.25) this.damagePlayer(e.dmg, e);
          e.state = 'recover'; e.timer = d.cooldown; e.windupK = 0;
          this.events.push({ type: 'pred_bite', pred: e });
        }
      } else { // recover
        e.timer -= dt;
        dvx = -(dx / dist) * speed * 0.25; dvy = -(dy / dist) * speed * 0.25;
        if (e.timer <= 0) e.state = dist < d.detect ? 'chase' : 'patrol';
      }
      const k = Math.min(1, dt * 2.5);
      e.vx += (dvx - e.vx) * k; e.vy += (dvy - e.vy) * k;
      const cur = this.currentAt(e.x, e.y);
      e.x += (e.vx + cur.x * 0.3) * dt; e.y += (e.vy + cur.y * 0.3) * dt;
      const minY = e.len * 0.12, maxY = Math.min(floorAt(this.s.world, e.x) - e.len * 0.12, d.maxDepth ? d.maxDepth * w.size.h : 1e9);
      if (e.y < minY) { e.y = minY; e.vy = Math.abs(e.vy) * 0.3; }
      if (e.y > maxY) { e.y = maxY; e.vy = -Math.abs(e.vy) * 0.3; }
      if (e.x < 200) { e.x = 200; e.heading = 0; e.vx = Math.abs(e.vx); }
      if (e.x > w.size.w - 200) { e.x = w.size.w - 200; e.heading = Math.PI; e.vx = -Math.abs(e.vx); }
      if (Math.hypot(e.vx, e.vy) > 8) e.angle += clamp(angDiff(e.angle, Math.atan2(e.vy, e.vx)), -3 * dt, 3 * dt);
    }
    // Reapariciones de depredadores normales.
    for (let i = this.respawns.length - 1; i >= 0; i--) {
      const r = this.respawns[i];
      if (this.clock >= r.at) { if (r.world === this.s.world) this.spawnPredator(r.def); this.respawns.splice(i, 1); }
    }
  }

  // ---------- bucle ----------
  tick(dt) {
    this.events = [];
    this.clock += dt;
    const s = this.s;
    s.stats.playSeconds += dt;
    this.updatePlayer(dt);
    this.updateGroups(dt);
    this.updatePrey(dt);
    this.eatPrey(dt);
    this.lungeHits();
    this.updatePreds(dt);
    // Ingresos pasivos del cardumen aliado.
    const pr = this.passiveRate();
    if (pr > 0) s.coins += pr * dt;
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) { this.spawnTimer = 0.25; this.maintainSpawns(false); }
    this.checkExits(dt);
    return this.events;
  }

  // ---------- sin conexión ----------
  applyOffline(elapsedSec) {
    const rate = this.passiveRate();
    const cap = BALANCE.offlineHours * 3600;
    const seconds = Math.min(Math.max(0, Math.floor(elapsedSec)), cap);
    if (rate <= 0 || seconds < 30) return { seconds: 0, capped: false, earned: 0 };
    const earned = rate * seconds * BALANCE.offlineEfficiency;
    this.s.coins += earned;
    return { seconds, capped: elapsedSec > cap, earned };
  }

  toSave() { return this.s; }
}

export { STAGES, WORLDS, PREY, PREDATORS, UPGRADES };
