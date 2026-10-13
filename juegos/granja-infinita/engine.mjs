// Motor de Granja Infinita: estado, reglas y economía. Sin DOM ni Canvas.
// Todo el dinero es Big (mantisa/exponente) para que la escala no tenga tope práctico.
import { Big, big } from './kit/core/bignum.js';
import { Rng } from './kit/core/rng.js';
import { BALANCE, eraDef, eraCost, gridSize, UPGRADES, EVENTS, ACHIEVEMENTS, GEM_SHOP, GAME } from './content.mjs';

const Z = () => ({ m: 0, e: 0 });

export function createSave() {
  return {
    coins: Z(), totalEarned: Z(), lifetimeEarned: Z(),
    gems: 0, era: 0, medals: 0,
    plots: Array.from({ length: gridSize(0) ** 2 }, () => ({ crop: null, t: 0, bug: false })),
    selectedCrop: 'zanahoria',
    upgrades: {},
    unlockedCrops: ['zanahoria'],
    milestones: [],
    achievements: [],
    weather: { type: 'soleado', t: 0, dur: 120 },
    event: null,
    boosts: { turboUntil: 0, adDoubleUntil: 0 },
    noAds: false, golden: false, entitlements: {},
    stats: { harvests: 0, prestiges: 0, bugs: 0, playSeconds: 0, eventsSeen: 0, erasUnlocked: 0 },
    settings: { sound: true, reducedMotion: false },
    lastSeen: 0,
  };
}

export function validateSave(s) {
  return !!(s && typeof s === 'object' && s.coins && typeof s.coins.m === 'number' && Array.isArray(s.plots) && typeof s.era === 'number' && s.stats);
}

export const MIGRATIONS = {};

const eraCache = new Map();
export function getEra(era) {
  if (!eraCache.has(era)) eraCache.set(era, eraDef(era));
  return eraCache.get(era);
}

export class Farm {
  constructor(save = createSave(), { rng, now = () => Date.now() } = {}) {
    this.s = save;
    this.s.coins = Big.from(save.coins);
    this.s.totalEarned = Big.from(save.totalEarned);
    this.s.lifetimeEarned = Big.from(save.lifetimeEarned);
    this.rng = rng || new Rng(Date.now() >>> 0);
    this.now = now;
    this.autoTimer = 0;
    this.eventTimer = BALANCE.EVENT_FIRST_DELAY;
    this.sessionTime = 0;
    this.events = []; // acontecimientos del último tick para la vista
  }

  eraName(era = this.s.era) { return getEra(era).name; }

  toSave() {
    const s = this.s;
    return { ...s, coins: s.coins.toJSON(), totalEarned: s.totalEarned.toJSON(), lifetimeEarned: s.lifetimeEarned.toJSON() };
  }

  // ----- catálogo -----
  crops() {
    const list = [];
    for (let e = 0; e <= this.s.era; e++) list.push(...getEra(e).crops);
    return list;
  }
  crop(id) { return this.crops().find((c) => c.id === id) || null; }
  isUnlocked(id) { return this.s.unlockedCrops.includes(id); }
  level(id) { return this.s.upgrades[id] || 0; }

  // ----- multiplicadores -----
  weatherDef() { return BALANCE.WEATHER[this.s.weather.type] || BALANCE.WEATHER.soleado; }

  incomeMultiplier(nowMs = this.now()) {
    const s = this.s;
    let m = 1;
    m *= 1 + 0.15 * this.level('herramientas');
    m *= 1 + 0.10 * this.level('abono');
    m *= 1 + 0.25 * this.level('mercado');
    m *= Math.pow(BALANCE.ERA_MULT, s.era);
    m *= Math.pow(BALANCE.MEDAL_MULT, s.medals);
    if (s.golden) m *= 2;
    if (s.boosts.turboUntil > nowMs) m *= 2;
    if (s.boosts.adDoubleUntil > nowMs) m *= 2;
    m *= this.weatherDef().value;
    if (s.event?.type === 'feria') m *= 3;
    if (s.event?.type === 'plaga' && s.event.penalty) m *= 0.7;
    return m;
  }

  // Velocidad de crecimiento (1 = tiempo nominal). Riego acorta y protege de la sequía.
  growSpeed() {
    const riego = this.level('riego');
    const w = this.weatherDef();
    let grow = w.grow;
    if (grow < 1) grow = 1 - (1 - grow) * (1 - Math.min(1, riego / 25));
    const timeMult = Math.max(0.35, Math.pow(0.96, riego));
    return grow / timeMult;
  }

  cropValue(crop, nowMs) { return big(crop.value).mul(this.incomeMultiplier(nowMs)); }
  cropTime(crop) { return crop.time / this.growSpeed(); }

  // ----- acciones del jugador -----
  plant(i, cropId = this.s.selectedCrop) {
    const plot = this.s.plots[i];
    const crop = this.crop(cropId);
    if (!plot || plot.crop || !crop || !this.isUnlocked(cropId)) return false;
    plot.crop = cropId;
    plot.t = 0;
    return true;
  }

  isReady(plot) {
    if (!plot.crop) return false;
    const c = this.crop(plot.crop);
    return !!c && plot.t >= c.time;
  }

  harvest(i, nowMs = this.now()) {
    const plot = this.s.plots[i];
    if (!plot || !this.isReady(plot)) return null;
    const crop = this.crop(plot.crop);
    const value = this.cropValue(crop, nowMs);
    this.earn(value);
    this.s.stats.harvests++;
    plot.crop = null;
    plot.t = 0;
    if (this.level('sembradora') > 0) this.plant(i);
    return value;
  }

  earn(value) {
    this.s.coins = this.s.coins.add(value);
    this.s.totalEarned = this.s.totalEarned.add(value);
    this.s.lifetimeEarned = this.s.lifetimeEarned.add(value);
  }

  // Toque sobre una parcela: aplasta bicho > cosecha > siembra. Devuelve una descripción.
  tapPlot(i, nowMs = this.now()) {
    const plot = this.s.plots[i];
    if (!plot) return { kind: 'none' };
    if (plot.bug) {
      plot.bug = false;
      this.s.stats.bugs++;
      const bonus = this.cropValue(this.bestUnlockedCrop(), nowMs).mul(0.5);
      this.earn(bonus);
      if (this.s.event?.type === 'plaga') {
        this.s.event.left--;
        if (this.s.event.left <= 0) { this.s.event = null; return { kind: 'bug', bonus, cleared: true }; }
      }
      return { kind: 'bug', bonus };
    }
    if (this.isReady(plot)) { const crop = this.crop(plot.crop); return { kind: 'harvest', value: this.harvest(i, nowMs), crop }; }
    if (!plot.crop) return this.plant(i) ? { kind: 'plant', crop: plot.crop } : { kind: 'locked' };
    const c = this.crop(plot.crop);
    return { kind: 'growing', left: Math.max(0, (c.time - plot.t) / this.growSpeed()) };
  }

  bestUnlockedCrop() {
    let best = null;
    for (const c of this.crops()) if (this.isUnlocked(c.id) && (!best || c.value / c.time > best.value / best.time)) best = c;
    return best;
  }

  unlockCost(cropId) { const c = this.crop(cropId); return c ? big(c.unlock) : null; }
  unlockCrop(cropId) {
    const c = this.crop(cropId);
    if (!c || this.isUnlocked(cropId)) return false;
    const cost = big(c.unlock);
    if (this.s.coins.lt(cost)) return false;
    this.s.coins = this.s.coins.sub(cost);
    this.s.unlockedCrops.push(cropId);
    this.s.selectedCrop = cropId;
    return true;
  }

  upgradeDef(id) { return UPGRADES.find((u) => u.id === id); }
  upgradeCost(id) {
    const u = this.upgradeDef(id);
    const lvl = this.level(id);
    if (!u || lvl >= u.max) return null;
    return big(u.base).mul(big(u.r).pow(lvl)).mul(big(BALANCE.UPGRADE_ERA_SCALE).pow(this.s.era));
  }
  buyUpgrade(id) {
    const cost = this.upgradeCost(id);
    if (!cost || this.s.coins.lt(cost)) return false;
    this.s.coins = this.s.coins.sub(cost);
    this.s.upgrades[id] = this.level(id) + 1;
    return true;
  }

  // ----- eras -----
  eraCost() { return big(eraCost(this.s.era)); }
  eraProgress() { const c = this.eraCost(); return Math.min(1, this.s.coins.div(c).toNumber()); }
  canUnlockEra() { return this.s.coins.gte(this.eraCost()); }
  unlockEra() {
    if (!this.canUnlockEra()) return null;
    this.s.coins = this.s.coins.sub(this.eraCost());
    this.s.era++;
    this.s.stats.erasUnlocked++;
    this.s.gems += BALANCE.GEMS_PER_ERA;
    this.s.milestones = [];
    const size = gridSize(this.s.era);
    while (this.s.plots.length < size * size) this.s.plots.push({ crop: null, t: 0, bug: false });
    const def = getEra(this.s.era);
    // El primer cultivo de la nueva era es gratis: el "subidón" debe sentirse de inmediato.
    if (!this.isUnlocked(def.crops[0].id)) { this.s.unlockedCrops.push(def.crops[0].id); this.s.selectedCrop = def.crops[0].id; }
    return def;
  }

  checkMilestones() {
    const k = this.eraProgress();
    const hit = [];
    for (const f of BALANCE.MILESTONES) {
      if (k >= f && !this.s.milestones.includes(f)) { this.s.milestones.push(f); this.s.gems += 1; hit.push(f); }
    }
    return hit;
  }

  // ----- prestigio (Herencia) -----
  canPrestige() { return this.s.era >= BALANCE.PRESTIGE_MIN_ERA; }
  medalsFor(lifetime) {
    const l = Big.from(lifetime).log10();
    return Math.max(0, Math.floor(2 * (l - 3.7)));
  }
  prestigeGain() { return Math.max(0, this.medalsFor(this.s.lifetimeEarned) - this.s.medals); }
  prestige() {
    if (!this.canPrestige()) return null;
    const gain = this.prestigeGain();
    const keep = this.s;
    const fresh = createSave();
    fresh.gems = keep.gems;
    fresh.medals = keep.medals + gain;
    fresh.noAds = keep.noAds;
    fresh.golden = keep.golden;
    fresh.entitlements = keep.entitlements;
    fresh.achievements = keep.achievements;
    fresh.settings = keep.settings;
    fresh.lifetimeEarned = keep.lifetimeEarned;
    fresh.stats = { ...keep.stats, prestiges: keep.stats.prestiges + 1 };
    fresh.boosts = keep.boosts;
    this.s = fresh;
    this.s.coins = Big.ZERO; this.s.totalEarned = Big.ZERO;
    this.s.lifetimeEarned = Big.from(keep.lifetimeEarned);
    return gain;
  }

  // ----- gemas -----
  spendGems(id, nowMs = this.now()) {
    const item = GEM_SHOP.find((g) => g.id === id);
    if (!item || this.s.gems < item.gems) return false;
    this.s.gems -= item.gems;
    if (id === 'cosecha_ya') for (const p of this.s.plots) if (p.crop) p.t = this.crop(p.crop).time;
    if (id === 'turbo') this.s.boosts.turboUntil = Math.max(nowMs, this.s.boosts.turboUntil) + 10 * 60 * 1000;
    return true;
  }

  grantAdDouble(nowMs = this.now(), minutes = 3) {
    this.s.boosts.adDoubleUntil = Math.max(nowMs, this.s.boosts.adDoubleUntil) + minutes * 60 * 1000;
  }

  // ----- clima y eventos -----
  rollWeather() {
    const entries = Object.entries(BALANCE.WEATHER).filter(([k]) => k !== this.s.weather.type).map(([k, v]) => ({ k, w: v.w, v }));
    const pick = this.rng.weighted(entries);
    this.s.weather = { type: pick.k, t: 0, dur: this.rng.range(pick.v.dur[0], pick.v.dur[1]) };
    return this.s.weather;
  }

  startEvent(type) {
    const def = EVENTS[type];
    if (!def) return null;
    const ev = { type, t: 0, dur: def.dur };
    if (type === 'plaga') {
      const candidates = this.s.plots.map((p, i) => i).filter((i) => this.s.plots[i].crop);
      const n = Math.min(def.bugs, Math.max(1, candidates.length));
      const chosen = this.rng.shuffle(candidates.length ? candidates : this.s.plots.map((_, i) => i)).slice(0, n);
      for (const i of chosen) this.s.plots[i].bug = true;
      ev.left = chosen.length;
      ev.penalty = false;
    }
    if (type === 'cofre') ev.opened = false;
    this.s.event = ev;
    this.s.stats.eventsSeen++;
    return ev;
  }

  rollEvent() {
    const entries = Object.entries(EVENTS).map(([k, v]) => ({ k, w: v.w }));
    // La plaga solo tiene sentido con cultivos plantados.
    const planted = this.s.plots.some((p) => p.crop);
    const pool = entries.filter((e) => planted || e.k !== 'plaga');
    return this.startEvent(this.rng.weighted(pool).k);
  }

  openChest(nowMs = this.now()) {
    const ev = this.s.event;
    if (!ev || ev.type !== 'cofre' || ev.opened) return null;
    ev.opened = true;
    const gems = this.rng.int(1, 3);
    const coins = this.estimateRate(nowMs).mul(30).max(this.cropValue(this.bestUnlockedCrop(), nowMs).mul(3));
    this.s.gems += gems;
    this.earn(coins);
    this.s.event = null;
    return { gems, coins };
  }

  dismissEvent() { this.s.event = null; }

  // ----- tiempo -----
  // Avanza la simulación `dt` segundos. Devuelve acontecimientos para la vista.
  tick(dt, nowMs = this.now()) {
    const s = this.s;
    const out = [];
    this.sessionTime += dt;
    s.stats.playSeconds += dt;

    // Clima.
    s.weather.t += dt;
    if (s.weather.t >= s.weather.dur) out.push({ type: 'weather', weather: this.rollWeather() });

    // Crecimiento.
    const speed = this.growSpeed();
    for (const p of s.plots) if (p.crop) p.t = Math.min(p.t + dt * speed, this.crop(p.crop).time + 1);

    // Jornaleros: cosecha automática periódica.
    const workers = this.level('jornaleros');
    if (workers > 0) {
      this.autoTimer += dt;
      const interval = Math.max(1, 12 / workers);
      if (this.autoTimer >= interval) {
        this.autoTimer = 0;
        let total = Big.ZERO, n = 0;
        for (let i = 0; i < s.plots.length; i++) {
          if (this.isReady(s.plots[i]) && !s.plots[i].bug) { total = total.add(this.harvest(i, nowMs)); n++; }
        }
        if (n > 0) out.push({ type: 'autoharvest', total, count: n });
      }
    }
    // Sembradora: replanta vacíos.
    if (this.level('sembradora') > 0) {
      for (let i = 0; i < s.plots.length; i++) if (!s.plots[i].crop) this.plant(i);
    }

    // Eventos.
    if (s.event) {
      s.event.t += dt;
      if (s.event.type === 'plaga' && !s.event.penalty && s.event.t >= s.event.dur) {
        s.event.penalty = true; s.event.dur += 30; // 30 s de castigo
        out.push({ type: 'plaga_penalty' });
      } else if (s.event.t >= s.event.dur) {
        for (const p of s.plots) p.bug = false;
        out.push({ type: 'event_end', event: s.event.type });
        s.event = null;
      }
    } else {
      this.eventTimer -= dt;
      if (this.eventTimer <= 0) {
        this.eventTimer = this.rng.range(BALANCE.EVENT_INTERVAL[0], BALANCE.EVENT_INTERVAL[1]);
        const ev = this.rollEvent();
        if (ev) out.push({ type: 'event', event: ev });
      }
    }

    for (const f of this.checkMilestones()) out.push({ type: 'milestone', fraction: f });
    for (const a of this.checkAchievements()) out.push({ type: 'achievement', achievement: a });
    this.events = out;
    return out;
  }

  checkAchievements() {
    const got = [];
    for (const a of ACHIEVEMENTS) {
      if (!this.s.achievements.includes(a.id) && a.test(this.s)) { this.s.achievements.push(a.id); this.s.gems += a.gems; got.push(a); }
    }
    return got;
  }

  // Ingreso automático estimado por segundo (solo lo que la granja gana sola).
  estimateRate(nowMs = this.now()) {
    if (this.level('jornaleros') === 0) return Big.ZERO;
    let rate = Big.ZERO;
    const speed = this.growSpeed();
    const replant = this.level('sembradora') > 0;
    for (const p of this.s.plots) {
      const c = p.crop ? this.crop(p.crop) : (replant ? this.crop(this.s.selectedCrop) : null);
      if (!c) continue;
      rate = rate.add(this.cropValue(c, nowMs).mul(speed / c.time));
    }
    return rate;
  }

  offlineHours() { return BALANCE.OFFLINE_HOURS_BASE + this.level('silo'); }

  // Aplica el tiempo fuera de línea. Devuelve { mode, seconds, capped, earned }.
  applyOffline(elapsedSec, nowMs = this.now()) {
    const cap = this.offlineHours() * 3600;
    const seconds = Math.min(Math.max(0, Math.floor(elapsedSec)), cap);
    const capped = elapsedSec > cap;
    if (seconds < 30) return { mode: 'none', seconds: 0, capped: false, earned: Big.ZERO };
    const workers = this.level('jornaleros') > 0;
    const replant = this.level('sembradora') > 0;
    let earned = Big.ZERO;
    if (workers && replant) {
      earned = this.estimateRate(nowMs).mul(seconds).mul(BALANCE.OFFLINE_EFFICIENCY);
      this.earn(earned);
      return { mode: 'auto', seconds, capped, earned };
    }
    // Sin automatización completa: los cultivos maduran; con jornaleros se cosechan una vez.
    const speed = this.growSpeed();
    for (let i = 0; i < this.s.plots.length; i++) {
      const p = this.s.plots[i];
      if (!p.crop) continue;
      p.t = Math.min(p.t + seconds * speed, this.crop(p.crop).time + 1);
      if (workers && this.isReady(p)) earned = earned.add(this.harvest(i, nowMs));
    }
    return { mode: workers ? 'harvested' : 'ripened', seconds, capped, earned };
  }
}

export { GAME };
