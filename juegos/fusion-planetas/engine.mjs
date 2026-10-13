// Motor de Fusión de Planetas: físicas de círculos, fusiones, combos, peligro, deshacer.
// Determinista: sin Math.random; la cola de piezas usa un Rng con semilla.
import { Rng } from './kit/core/rng.js';
import { WORLD, TIERS, SPAWN_WEIGHTS, SUPERNOVA_POINTS, GAME } from './content.mjs';

export function createSave() {
  return {
    best: 0,
    dailyBest: {},        // 'YYYY-MM-DD' -> puntos
    coins: 0,
    gems: 0,
    games: 0,
    skin: 'planetas',
    unlockedSkins: ['planetas'],
    noAds: false,
    entitlements: {},
    settings: { sound: true },
    stats: { merges: 0, supernovas: 0, bestTier: 0 },
    lastSeen: 0,
  };
}

export function validateSave(s) {
  return !!(s && typeof s === 'object' && typeof s.best === 'number' && typeof s.coins === 'number' && Array.isArray(s.unlockedSkins));
}

export const MIGRATIONS = {};

let nextId = 1;
// Paso de cada subpaso físico. El bucle del kit usa 1/60; las velocidades se expresan en px/s
// pero internamente se integra por posiciones (Verlet) para que lo que reposa no tenga velocidad fantasma.
const H = 1 / 60 / WORLD.substeps;

export class MergeGame {
  constructor({ seed = 1, mode = 'classic' } = {}) {
    this.seed = seed;
    this.mode = mode;
    this.rng = new Rng(seed);
    this.bodies = [];
    this.score = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.over = false;
    this.danger = 0;
    this.cooldown = 0;
    this.time = 0;
    this.aimX = (WORLD.left + WORLD.right) / 2;
    this.current = this.rollTier();
    this.next = this.rollTier();
    this.snapshotData = null;
    this.continued = false;
    this.largestTier = 0;
    this.merges = 0;
    this.events = [];
  }

  rollTier() {
    const items = SPAWN_WEIGHTS.map((w, i) => ({ w, i }));
    return this.rng.weighted(items).i;
  }

  get currentRadius() { return TIERS[this.current].radius; }
  get canDrop() { return !this.over && this.cooldown <= 0; }

  setAim(x) {
    const r = this.currentRadius;
    this.aimX = Math.max(WORLD.left + r, Math.min(WORLD.right - r, x));
  }

  // Suelta la pieza actual. Devuelve el cuerpo o null.
  drop(x = this.aimX) {
    if (!this.canDrop) return null;
    this.setAim(x);
    this.snapshotData = this.snapshot();
    const body = this.spawn(this.aimX, WORLD.dropY, this.current, 0, 0);
    this.current = this.next;
    this.next = this.rollTier();
    this.cooldown = WORLD.dropCooldown;
    this.setAim(this.aimX);
    return body;
  }

  spawn(x, y, tier, vx = 0, vy = 0) {
    const b = { id: nextId++, x, y, px: x - vx * H, py: y - vy * H, vx, vy, r: TIERS[tier].radius, tier, age: 0, squash: 0, landed: false };
    this.bodies.push(b);
    if (this.bodies.length > WORLD.maxBodies) this.bodies.shift();
    return b;
  }

  snapshot() {
    return {
      bodies: this.bodies.map((b) => ({ ...b })),
      score: this.score, current: this.current, next: this.next,
      rngState: this.rng.state, combo: this.combo, comboTimer: this.comboTimer,
      largestTier: this.largestTier, merges: this.merges,
    };
  }

  // Deshace la última caída (una sola vez por caída).
  undo() {
    const s = this.snapshotData;
    if (!s) return false;
    this.bodies = s.bodies.map((b) => ({ ...b }));
    this.score = s.score; this.current = s.current; this.next = s.next;
    this.rng.state = s.rngState; this.combo = s.combo; this.comboTimer = s.comboTimer;
    this.largestTier = s.largestTier; this.merges = s.merges;
    this.over = false; this.danger = 0; this.cooldown = 0;
    this.snapshotData = null;
    return true;
  }

  // Continuar tras perder: elimina lo que hay en la zona alta y reanuda (una vez por partida).
  continueAfterOver() {
    if (!this.over || this.continued) return false;
    const cut = WORLD.dangerY + 160;
    const removed = this.bodies.filter((b) => b.y - b.r < cut);
    this.bodies = this.bodies.filter((b) => b.y - b.r >= cut);
    this.over = false; this.danger = 0; this.cooldown = 0.3; this.continued = true;
    return removed;
  }

  update(dt) {
    const out = [];
    if (this.over) { this.events = out; return out; }
    this.time += dt;
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.comboTimer > 0) { this.comboTimer -= dt; if (this.comboTimer <= 0) this.combo = 0; }

    const h = dt / WORLD.substeps;
    for (let s = 0; s < WORLD.substeps; s++) {
      this.integrate(h);
      this.collide(h, out);
      this.walls(out);
    }
    for (const b of this.bodies) { b.age += dt; if (b.squash > 0) b.squash = Math.max(0, b.squash - dt * 4); }

    // Peligro: cuerpos casi quietos por encima de la línea.
    let danger = false;
    for (const b of this.bodies) {
      if (b.age > 0.6 && b.y - b.r < WORLD.dangerY && Math.abs(b.vy) < 25) { danger = true; break; }
    }
    if (danger) { this.danger += dt; if (this.danger >= WORLD.dangerSeconds) { this.over = true; out.push({ type: 'gameover', score: this.score }); } }
    else this.danger = Math.max(0, this.danger - dt * 2);
    this.events = out;
    return out;
  }

  // Verlet: la velocidad es el desplazamiento del último subpaso. Un cuerpo que no se mueve tiene v = 0.
  integrate(h) {
    for (const b of this.bodies) {
      const dx = (b.x - b.px) * 0.999;
      const dy = (b.y - b.py) + WORLD.gravity * h * h;
      b.px = b.x; b.py = b.y;
      b.x += dx; b.y += dy;
    }
  }

  collide(h, out) {
    const bs = this.bodies;
    const merged = new Set();
    for (let i = 0; i < bs.length; i++) {
      const a = bs[i];
      if (merged.has(a.id)) continue;
      for (let j = i + 1; j < bs.length; j++) {
        const b = bs[j];
        if (merged.has(b.id)) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const rr = a.r + b.r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr) continue;
        const d = Math.sqrt(d2) || 0.0001;
        if (a.tier === b.tier && a.age > WORLD.mergeMinAge && b.age > WORLD.mergeMinAge) {
          merged.add(a.id); merged.add(b.id);
          this.merge(a, b, out);
          // `a` ya no existe: si siguiéramos comparándolo con el cuerpo nuevo (que se añade al
          // final del mismo arreglo), la corrección de solapamiento lo lanzaría por los aires.
          break;
        }
        // Velocidad relativa de aproximación (para el aplastamiento visual) antes de corregir.
        const nx = dx / d, ny = dy / d;
        const rvn = ((b.x - b.px) - (a.x - a.px)) * nx + ((b.y - b.py) - (a.y - a.py)) * ny;
        if (rvn / h < -140) { a.squash = Math.max(a.squash, 0.6); b.squash = Math.max(b.squash, 0.6); }
        // Separación ponderada por masa (área). Con Verlet esto ya frena el movimiento de aproximación.
        const ma = a.r * a.r, mb = b.r * b.r;
        const total = ma + mb;
        const overlap = rr - d;
        a.x -= nx * overlap * (mb / total);
        a.y -= ny * overlap * (mb / total);
        b.x += nx * overlap * (ma / total);
        b.y += ny * overlap * (ma / total);
      }
    }
    if (merged.size) this.bodies = this.bodies.filter((b) => !merged.has(b.id));
  }

  merge(a, b, out) {
    const tier = a.tier;
    const ma = a.r * a.r, mb = b.r * b.r;
    const x = (a.x * ma + b.x * mb) / (ma + mb);
    const y = (a.y * ma + b.y * mb) / (ma + mb);
    this.combo = this.comboTimer > 0 ? Math.min(WORLD.maxCombo, this.combo + 1) : 1;
    this.comboTimer = WORLD.comboWindow;
    this.merges++;
    if (tier === TIERS.length - 1) {
      // Dos soles: supernova. Elimina lo cercano y da muchos puntos.
      const victims = this.bodies.filter((c) => c !== a && c !== b && Math.hypot(c.x - x, c.y - y) < WORLD.supernovaRadius);
      const ids = new Set(victims.map((v) => v.id));
      this.bodies = this.bodies.filter((c) => !ids.has(c.id));
      const points = (SUPERNOVA_POINTS + victims.length * 10) * this.combo;
      this.score += points;
      out.push({ type: 'supernova', x, y, points, removed: victims.length, combo: this.combo });
      return null;
    }
    const nb = this.spawnMerged(x, y, tier + 1, (a.vx + b.vx) / 2, Math.min((a.vy + b.vy) / 2, 0) - 40);
    const points = TIERS[tier + 1].points * this.combo;
    this.score += points;
    this.largestTier = Math.max(this.largestTier, tier + 1);
    out.push({ type: 'merge', x, y, tier: tier + 1, points, combo: this.combo, body: nb });
    return nb;
  }

  spawnMerged(x, y, tier, vx, vy) {
    const r = TIERS[tier].radius;
    // Mantén el nuevo cuerpo dentro de las paredes.
    x = Math.max(WORLD.left + r, Math.min(WORLD.right - r, x));
    y = Math.min(WORLD.floor - r, y);
    const b = { id: nextId++, x, y, px: x - vx * H, py: y - vy * H, vx, vy, r, tier, age: WORLD.mergeMinAge + 0.01, squash: 1, landed: true };
    this.bodies.push(b);
    return b;
  }

  walls(out) {
    const h = H;
    for (const b of this.bodies) {
      let dx = b.x - b.px, dy = b.y - b.py;
      if (b.x - b.r < WORLD.left) { b.x = WORLD.left + b.r; b.px = b.x + dx * 0.3; }
      else if (b.x + b.r > WORLD.right) { b.x = WORLD.right - b.r; b.px = b.x + dx * 0.3; }
      if (b.y + b.r > WORLD.floor) {
        const vy = dy / h;
        if (!b.landed && vy > 150) { b.squash = Math.max(b.squash, 0.8); out.push({ type: 'land', x: b.x, y: b.y + b.r, tier: b.tier, speed: vy }); }
        b.landed = true;
        b.y = WORLD.floor - b.r;
        b.py = b.y + (vy > 60 ? dy * WORLD.restitution : 0); // rebote leve solo si llega con velocidad
        dx = b.x - b.px;
        b.px = b.x - dx * WORLD.friction;
      }
      // Techo blando: nada puede salir por arriba.
      if (b.y - b.r < 0) { b.y = b.r; b.py = b.y + dy * 0.2; }
      // Velocidad derivada, en px/s, para la vista y las comprobaciones de reposo.
      b.vx = (b.x - b.px) / h;
      b.vy = (b.y - b.py) / h;
    }
  }

  // Resumen para la vista.
  dangerLevel() { return Math.min(1, this.danger / WORLD.dangerSeconds); }
}

export { GAME, TIERS, WORLD };
