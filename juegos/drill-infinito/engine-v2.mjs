export const VERSION = '0.2.0';
export const ORES = {
  rock: { name: 'Roca', color: '#a2a8b9', hp: 28n, value: 8n, xp: 8n, icon: '▰' },
  copper: { name: 'Cobre', color: '#ed9672', hp: 38n, value: 15n, xp: 12n, icon: '◆' },
  gold: { name: 'Oro', color: '#ffcf70', hp: 52n, value: 30n, xp: 20n, icon: '◆' },
  gem: { name: 'Amatista', color: '#bc91f2', hp: 72n, value: 70n, xp: 35n, icon: '♦' },
};
export const PATTERN = ['rock','rock','copper','rock','gold','rock','copper','rock','rock','gem','rock','copper','rock','rock','gold','rock','copper','rock','rock','copper'];
export const BIOMES = [
  { name: 'La primera veta', wall: '#353946', light: '#515564', dark: '#242834', accent: '#ed9672' },
  { name: 'Galerías de cobre', wall: '#493b38', light: '#66514b', dark: '#2f292d', accent: '#f1a578' },
  { name: 'Cavernas de cristal', wall: '#383450', light: '#51466d', dark: '#242237', accent: '#be94ff' },
  { name: 'El núcleo antiguo', wall: '#493333', light: '#69463f', dark: '#2e252b', accent: '#ffad66' },
];
export const UPGRADES = {
  power: { name: 'Broca reforzada', short: 'POTENCIA', icon: '▼', base: 18n, linear: 15n, square: 4n, max: null, description: '+4 puntos de potencia base por rango.' },
  speed: { name: 'Motor turbo', short: 'VELOCIDAD', icon: '»', base: 25n, linear: 18n, square: 6n, max: null, description: '+25 % de velocidad base por rango.' },
  refine: { name: 'Refinería', short: 'GANANCIAS', icon: '◆', base: 40n, linear: 25n, square: 8n, max: null, description: '+20 % de monedas por mineral y rango.' },
  bay: { name: 'Batería de reserva', short: 'SIN CONEXIÓN', icon: '▣', base: 80n, linear: 40n, square: 10n, max: 3, description: '+2 horas de excavación al cerrar. Máximo: 8 horas.' },
};
const UNIT = 4000n;
const COUNTS = Object.fromEntries(Object.keys(ORES).map(key => [key, BigInt(PATTERN.filter(v => v === key).length) * 50n]));
const CHUNK_BASE = PATTERN.reduce((sum, key) => sum + ORES[key].hp, 0n) * 50n * UNIT;

export function newStore(now = Date.now()) {
  return {
    version: 2, started: false, paused: true, seed: 0x51a7a11, lastSeen: now,
    profile: {
      depth: '0', xp: '0', coins: '0', work: '0', energy: 100000,
      upgrades: { power: '0', speed: '0', refine: '0', bay: '0' },
      ores: { rock: '0', copper: '0', gold: '0', gem: '0' },
      stats: { bursts: '0', coinsEarned: '0' },
      settings: { sound: false, reducedMotion: false },
    },
  };
}

export function integerSqrt(n) {
  if (n < 0n) throw new RangeError('Raíz negativa.');
  if (n < 2n) return n;
  let x = 1n << BigInt(Math.ceil(n.toString(2).length / 2));
  let y = (x + n / x) / 2n;
  while (y < x) { x = y; y = (x + n / x) / 2n; }
  return x;
}
export function xpAtLevel(level) {
  const k = BigInt(level) - 1n;
  if (k < 0n) throw new RangeError('El nivel empieza en 1.');
  return 5n * k * (k + 5n);
}
export function levelAtXp(xp) {
  const n = BigInt(xp);
  if (n < 0n) throw new RangeError('XP negativa.');
  return (integerSqrt(25n + 4n * (n / 5n)) - 5n) / 2n + 1n;
}
export function progress(profile) {
  const xp = BigInt(profile.xp), level = levelAtXp(xp);
  const current = xp - xpAtLevel(level), needed = xpAtLevel(level + 1n) - xpAtLevel(level);
  return { level, current, needed, percent: Number(current * 1000n / needed) / 10 };
}
export function miningRate(profile) {
  // Quarter-work units per second. Multiplying by integer ms preserves fractions.
  return (10n + 4n * BigInt(profile.upgrades.power)) * (4n + BigInt(profile.upgrades.speed));
}
export function offlineLimit(profile) { return (2 + 2 * Number(profile.upgrades.bay)) * 3600000; }
export function blockInfo(store, depth = BigInt(store.profile.depth)) {
  const type = PATTERN[Number((depth + BigInt(store.seed % 20)) % 20n)];
  const ore = ORES[type], needed = (ore.hp + depth / 1000n) * UNIT;
  return { type, ore, needed, percent: Number(BigInt(store.profile.work) * 1000n / needed) / 10 };
}
export function upgradeCost(profile, key) {
  if (!Object.hasOwn(UPGRADES, key)) throw new RangeError('Mejora desconocida.');
  const n = BigInt(profile.upgrades[key]), item = UPGRADES[key];
  return item.base + item.linear * n + item.square * n * n;
}
export function buyUpgrade(store, key) {
  if (!Object.hasOwn(UPGRADES, key)) return { store, ok: false, reason: 'Mejora desconocida.' };
  const rank = BigInt(store.profile.upgrades[key]), item = UPGRADES[key];
  if (item.max !== null && rank >= BigInt(item.max)) return { store, ok: false, reason: 'Batería al máximo.' };
  const cost = upgradeCost(store.profile, key);
  if (BigInt(store.profile.coins) < cost) return { store, ok: false, reason: 'Sigue excavando para reunir más monedas.' };
  const next = structuredClone(store);
  next.profile.coins = (BigInt(next.profile.coins) - cost).toString();
  next.profile.upgrades[key] = (rank + 1n).toString();
  return { store: next, ok: true, cost };
}

function applyWork(store, added) {
  const next = structuredClone(store), p = next.profile;
  let depth = BigInt(p.depth), work = BigInt(p.work) + added;
  const counts = { rock: 0n, copper: 0n, gold: 0n, gem: 0n };
  const clearOne = () => {
    const info = blockInfo(next, depth);
    if (work < info.needed) return false;
    work -= info.needed; counts[info.type]++; depth++; return true;
  };
  // Align to a 1000-block stratum; at most 999 explicit blocks.
  while (depth % 1000n !== 0n && clearOne()) {}
  if (depth % 1000n === 0n) {
    // Exact quadratic bulk cost. Processes huge idle gains without huge loops.
    const a = 2000000n, b = CHUNK_BASE + 4000000n * (depth / 1000n) - a;
    const chunks = (integerSqrt(b * b + 4n * a * work) - b) / (2n * a);
    if (chunks > 0n) {
      work -= a * chunks * chunks + b * chunks;
      depth += chunks * 1000n;
      for (const key of Object.keys(ORES)) counts[key] += COUNTS[key] * chunks;
    }
  }
  // Remaining budget cannot clear a full chunk; this loop is bounded by 999.
  while (clearOne()) {}
  let coins = 0n, xp = 0n;
  const factor = 5n + BigInt(p.upgrades.refine);
  for (const [key, amount] of Object.entries(counts)) {
    p.ores[key] = (BigInt(p.ores[key]) + amount).toString();
    coins += amount * (ORES[key].value * factor / 5n);
    xp += amount * ORES[key].xp;
  }
  p.depth = depth.toString(); p.work = work.toString();
  p.coins = (BigInt(p.coins) + coins).toString(); p.xp = (BigInt(p.xp) + xp).toString();
  p.stats.coinsEarned = (BigInt(p.stats.coinsEarned) + coins).toString();
  return next;
}

export function advance(store, elapsedMs) {
  if (!Number.isSafeInteger(elapsedMs) || elapsedMs < 0 || elapsedMs > 28800000) throw new RangeError('Intervalo no válido.');
  if (store.paused || !store.started) { const next = structuredClone(store); next.lastSeen += elapsedMs; return next; }
  const next = applyWork(store, miningRate(store.profile) * BigInt(elapsedMs));
  next.profile.energy = Math.min(100000, store.profile.energy + elapsedMs * 5);
  next.lastSeen += elapsedMs;
  return next;
}
export function burst(store) {
  if (store.paused || !store.started || store.profile.energy < 10000) return { store, ok: false };
  const next = applyWork(store, miningRate(store.profile) * 800n);
  next.profile.energy -= 10000;
  next.profile.stats.bursts = (BigInt(next.profile.stats.bursts) + 1n).toString();
  return { store: next, ok: true };
}
export function setPaused(store, paused, now) {
  const next = structuredClone(store); next.started = true; next.paused = paused; next.lastSeen = now; return next;
}
export function resumeOffline(store, now) {
  if (!Number.isSafeInteger(now) || now < 0) throw new RangeError('Fecha no válida.');
  const ms = Math.min(offlineLimit(store.profile), Math.max(0, now - store.lastSeen));
  const next = advance(store, ms); next.lastSeen = now;
  return { store: next, ms: store.paused || !store.started ? 0 : ms, coins: BigInt(next.profile.coins) - BigInt(store.profile.coins), depth: BigInt(next.profile.depth) - BigInt(store.profile.depth), xp: BigInt(next.profile.xp) - BigInt(store.profile.xp) };
}

const decimal = value => typeof value === 'string' && /^(0|[1-9][0-9]{0,1023})$/.test(value);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export function validateStore(input) {
  const fail = () => { throw new TypeError('Este respaldo no es válido para Drill Infinito.'); };
  if (!object(input) || input.version !== 2 || typeof input.started !== 'boolean' || typeof input.paused !== 'boolean'
    || !Number.isSafeInteger(input.lastSeen) || input.lastSeen < 0 || input.lastSeen > 8640000000000000
    || !Number.isInteger(input.seed) || input.seed < 0 || input.seed > 4294967295 || !object(input.profile)) fail();
  const p = input.profile;
  if (!object(p.upgrades) || !object(p.ores) || !object(p.stats) || !object(p.settings)) fail();
  const clean = newStore(input.lastSeen); clean.started = input.started; clean.paused = input.paused; clean.seed = input.seed;
  for (const key of ['depth','xp','coins','work']) { if (!decimal(p[key])) fail(); clean.profile[key] = p[key]; }
  for (const key of Object.keys(UPGRADES)) {
    if (!decimal(p.upgrades[key]) || (UPGRADES[key].max !== null && BigInt(p.upgrades[key]) > BigInt(UPGRADES[key].max))) fail();
    clean.profile.upgrades[key] = p.upgrades[key];
  }
  for (const key of Object.keys(ORES)) { if (!decimal(p.ores[key])) fail(); clean.profile.ores[key] = p.ores[key]; }
  for (const key of ['bursts','coinsEarned']) { if (!decimal(p.stats[key])) fail(); clean.profile.stats[key] = p.stats[key]; }
  if (!Number.isInteger(p.energy) || p.energy < 0 || p.energy > 100000) fail();
  clean.profile.energy = p.energy;
  if (typeof p.settings.sound !== 'boolean' || typeof p.settings.reducedMotion !== 'boolean') fail();
  clean.profile.settings = { sound: p.settings.sound, reducedMotion: p.settings.reducedMotion };
  if (BigInt(p.work) >= blockInfo(clean).needed || Object.values(clean.profile.ores).reduce((sum,v)=>sum+BigInt(v),0n) !== BigInt(p.depth)) fail();
  if (!clean.started && !clean.paused) fail();
  return clean;
}
