export const W = 480;
export const H = 720;
export const CORE = { x: 240, y: 622 };
export const BALANCE_VERSION = 3;
export const BOSS_INTERVAL = 5;

const MAX_CURRENCY = 1_000_000_000_000_000;
const MAX_LEVEL = 10_000;
const MAX_WAVE = 1_000_000;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finiteInt = (value, max = MAX_CURRENCY) =>
  Number.isFinite(value) ? clamp(Math.floor(value), 0, max) : 0;
const finiteRange = (value, max) =>
  Number.isFinite(value) ? clamp(value, 0, max) : 0;
const safeAdd = (a, b) => Math.min(MAX_CURRENCY, a + b);
const inRange = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
const isInt = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;

const RUN_ID = /^[A-Za-z0-9-]{1,64}$/;
const cleanRunId = value => (typeof value === 'string' && RUN_ID.test(value) ? value : null);

// Combo: bajas seguidas con menos de COMBO_WINDOW s entre sí. Solo suma bono de PUNTUACIÓN: la recompensa en
// cristales se calcula con los puntos base, para no alterar la economía permanente.
export const COMBO_WINDOW = 2.4;
export const COMBO_STEP = 6;
export const COMBO_MAX = 5;
export const comboMultiplier = streak =>
  Number.isFinite(streak) ? clamp(1 + Math.floor(streak / COMBO_STEP), 1, COMBO_MAX) : 1;
const freshCombo = () => ({ streak: 0, timer: 0, mult: 1 });
const freshTotals = () => ({ shots: 0, hits: 0, breaches: 0, maxMult: 1 });

export function cleanProfile(value) {
  return {
    version: BALANCE_VERSION,
    lastRunId: cleanRunId(value?.lastRunId),
    coins: finiteInt(value?.coins),
    armor: finiteInt(value?.armor, MAX_LEVEL),
    damageLevel: finiteInt(value?.damageLevel, MAX_LEVEL),
    reactorLevel: finiteInt(value?.reactorLevel, MAX_LEVEL),
    best: finiteInt(value?.best),
    bestWave: finiteInt(value?.bestWave, Number.MAX_SAFE_INTEGER),
    runs: finiteInt(value?.runs),
    style: {
      accuracy: finiteRange(value?.style?.accuracy, 1),
      aimDistance: finiteRange(value?.style?.aimDistance, 100_000),
      breaches: finiteRange(value?.style?.breaches, 100),
      samples: finiteInt(value?.style?.samples, 1_000),
    },
  };
}

export function upgradeCost(profile, kind) {
  const current = cleanProfile(profile);
  const level = kind === 'armor' ? current.armor :
    kind === 'damage' ? current.damageLevel :
    kind === 'reactor' ? current.reactorLevel : -1;
  if (level < 0 || level >= MAX_LEVEL) return Infinity;
  const base = kind === 'armor' ? 20 : kind === 'damage' ? 25 : 35;
  return Math.min(MAX_CURRENCY, Math.ceil(base + (level + 1) ** 1.45 * base * .68));
}

export function buyPermanentUpgrade(profile, kind) {
  const current = cleanProfile(profile);
  const cost = upgradeCost(current, kind);
  if (!Number.isFinite(cost) || current.coins < cost) return current;
  const key = kind === 'armor' ? 'armor' : kind === 'damage' ? 'damageLevel' : 'reactorLevel';
  return { ...current, coins: current.coins - cost, [key]: current[key] + 1 };
}

// Compatibilidad con la compra de armadura de Beta 0.1.
export const armorCost = profile => upgradeCost(profile, 'armor');
export const buyArmor = profile => buyPermanentUpgrade(profile, 'armor');

function random(game) {
  game.seed = (Math.imul(game.seed, 1664525) + 1013904223) >>> 0;
  return game.seed / 4294967296;
}

const TYPES = {
  drone: { hp: 1, speed: 69, radius: 15, damage: 1, score: 10, color: '#e69af4' },
  dart: { hp: .8, speed: 105, radius: 12, damage: 1, score: 13, color: '#ffcf7b' },
  brute: { hp: 3.2, speed: 47, radius: 22, damage: 2, score: 25, color: '#ff9f8e' },
  swarm: { hp: .65, speed: 91, radius: 10, damage: 1, score: 8, color: '#8ee8fa' },
  splitter: { hp: 2, speed: 64, radius: 18, damage: 1, score: 20, color: '#caa9ff' },
  shard: { hp: .55, speed: 115, radius: 9, damage: 1, score: 5, color: '#d5bbff' },
  boss: { hp: 13, speed: 35, radius: 35, damage: 3, score: 100, color: '#ff737d' },
};

const PATTERNS = {
  balanced: { label: 'FORMACIÓN MIXTA', reason: 'presión variada', pool: ['drone', 'drone', 'dart', 'brute'] },
  rush: { label: 'ASALTO VELOZ', reason: 'ritmo de defensa alto', pool: ['dart', 'dart', 'swarm', 'drone'] },
  fortress: { label: 'BLINDAJE', reason: 'puntería precisa detectada', pool: ['brute', 'brute', 'drone', 'splitter'] },
  flock: { label: 'ENJAMBRE', reason: 'mira móvil detectada', pool: ['swarm', 'swarm', 'dart', 'splitter'] },
  recovery: { label: 'REAGRUPACIÓN', reason: 'núcleo bajo presión', pool: ['drone', 'drone', 'swarm'] },
};

function recentAverage(history, key) {
  if (!history.length) return 0;
  return history.reduce((total, item) => total + item[key], 0) / history.length;
}

function learnedSignal(game, key) {
  const history = game.director.history;
  const prior = game.director.prior;
  if (!prior.samples) return recentAverage(history, key);
  if (!history.length) return prior[key];
  return recentAverage(history, key) * .8 + prior[key] * .2;
}

function selectPattern(game) {
  if (game.wave === 1) return 'balanced';
  const history = game.director.history;
  const breaches = learnedSignal(game, 'breaches');
  const accuracy = learnedSignal(game, 'accuracy');
  const motion = learnedSignal(game, 'aimDistance');
  if (breaches >= 1 || game.hp <= game.maxHp * .35) return 'recovery';
  let candidate = 'balanced';
  if (game.wave % BOSS_INTERVAL === 0 || accuracy >= .28) candidate = 'fortress';
  else if (motion >= 450) candidate = 'flock';
  else if (game.wave % 3 === 0) candidate = 'rush';
  // Una misma fortaleza no se repite sin límite aunque el jugador mantenga el patrón.
  const recent = history.slice(-2);
  if (recent.length === 2 && recent.every(item => item.pattern === candidate)) {
    const alternatives = ['balanced', 'rush', 'fortress', 'flock'].filter(item => item !== candidate);
    return alternatives[game.wave % alternatives.length];
  }
  return candidate;
}

export function generateWave(game) {
  const wave = game.wave;
  const pattern = selectPattern(game);
  const health = game.hp / game.maxHp;
  const breaches = learnedSignal(game, 'breaches');
  const accuracy = learnedSignal(game, 'accuracy');
  // La adaptación nunca supera ±15 % del escalado normal.
  const rawTarget = clamp((accuracy - .2) * .18 + (health - .65) * .14 - breaches * .045, -.15, .15);
  const target = pattern === 'recovery' ? Math.min(0, rawTarget) : rawTarget;
  const nextBias = clamp(game.director.bias * .55 + target * .45, -.15, .15);
  game.director.bias = wave === 1 ? 0 : pattern === 'recovery' ? Math.min(0, nextBias) : nextBias;
  const count = clamp(Math.round((5 + wave * .8 + Math.sqrt(wave)) * (1 + game.director.bias)), 6, 56);
  const bossWave = wave % BOSS_INTERVAL === 0;
  const bossCount = bossWave ? Math.min(3, 1 + Math.floor(wave / 25)) : 0;
  const pool = PATTERNS[pattern].pool;
  const entries = [];
  let rushLane = .5;
  for (let i = 0; i < count; i++) {
    let type = pool[Math.floor(random(game) * pool.length)];
    if (wave < 3 && type !== 'drone') type = 'drone';
    if (wave < 4 && type === 'splitter') type = 'drone';
    const mutationChance = Math.min(.34, .045 + wave * .005);
    const trait = wave >= 3 && random(game) < mutationChance ?
      (random(game) < .5 ? 'swift' : 'armored') : 'normal';
    let lane = random(game);
    let delayFactor = 1;
    if (pattern === 'rush') {
      if (i % 4 === 0) rushLane = .16 + random(game) * .68;
      lane = clamp(rushLane + (random(game) - .5) * .11, 0, 1);
      delayFactor = i % 4 === 3 ? 1.7 : .55;
    } else if (pattern === 'fortress') {
      lane = i % 2 === 0 ? .25 : .75;
      delayFactor = 1.12;
    } else if (pattern === 'flock') {
      lane = clamp((i % 5) / 4 + (random(game) - .5) * .08, 0, 1);
      delayFactor = .78;
    } else if (pattern === 'recovery') {
      lane = .18 + (i % 4) * .21;
      delayFactor = 1.3;
    }
    entries.push({ type, trait, lane, delayFactor });
  }
  for (let i = 0; i < bossCount; i++) {
    entries[entries.length - 1 - i] = {
      type: 'boss', trait: wave >= 10 && i === 0 ? 'armored' : 'normal',
      lane: bossCount === 1 ? .5 : .25 + i * .5 / (bossCount - 1),
      delayFactor: 1.5,
    };
  }
  return {
    wave, pattern, label: PATTERNS[pattern].label, reason: PATTERNS[pattern].reason,
    entries, bossWave, bossCount, bias: game.director.bias,
    hpScale: (1 + Math.max(0, wave - 1) * .085) * (1 + game.director.bias),
    speedScale: 1 + Math.min(.48, Math.max(0, wave - 1) * .012),
    interval: Math.max(.22, .83 - Math.min(30, wave) * .018),
  };
}

function newGameState(profile, seed, runId) {
  const saved = cleanProfile(profile);
  return {
    phase: 'ready', runId: cleanRunId(runId), seed: (seed >>> 0) || 1, wave: 1, completedWaves: 0, spawned: 0, spawnClock: .6,
    hp: 5 + saved.armor, maxHp: 5 + saved.armor,
    stats: { damage: 1 + saved.damageLevel * .22, interval: Math.max(.08, .32 / (1 + saved.reactorLevel * .045)), spread: 1, pierce: 0 },
    aim: { x: 240, y: 180 }, fireClock: 0, enemies: [], bullets: [], events: [],
    nextId: 1, score: 0, bonus: 0, combo: freshCombo(), totals: freshTotals(), kills: 0, elapsed: 0, reward: 0, settled: false,
    wavePlan: null, waveStats: { shots: 0, hits: 0, kills: 0, breaches: 0, aimDistance: 0, startedAt: 0 },
    director: { bias: 0, history: [], prior: { ...saved.style } }, lastWaveSummary: null,
  };
}

export function createGame(profile = {}, seed = 1, runId = null) {
  const game = newGameState(profile, seed, runId);
  game.wavePlan = generateWave(game);
  return game;
}

export function startGame(game) {
  if (game.phase === 'ready') game.phase = 'playing';
  return game;
}

export function setAim(game, x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  const nextX = clamp(x, 25, W - 25);
  const nextY = clamp(y, 72, CORE.y - 72);
  if (game.phase === 'playing') {
    game.waveStats.aimDistance += Math.hypot(nextX - game.aim.x, nextY - game.aim.y);
  }
  game.aim.x = nextX;
  game.aim.y = nextY;
}

function spawnEnemy(game) {
  const entry = game.wavePlan.entries[game.spawned];
  const template = TYPES[entry.type];
  const traitHp = entry.trait === 'armored' ? 1.5 : 1;
  const traitSpeed = entry.trait === 'swift' ? 1.26 : 1;
  const hp = Math.max(1, Math.round(template.hp * game.wavePlan.hpScale * traitHp));
  const x = 48 + entry.lane * (W - 96);
  game.enemies.push({
    id: game.nextId++, type: entry.type, trait: entry.trait, x, y: -42,
    hp, maxHp: hp,
    speed: Math.min(210, template.speed * game.wavePlan.speedScale * traitSpeed),
    radius: template.radius, damage: template.damage, score: template.score,
    wobble: random(game) * Math.PI * 2, hit: 0, split: false,
  });
  game.spawned++;
  game.events.push({ type: entry.type === 'boss' ? 'boss' : 'spawn', x, y: 10 });
}

function fire(game) {
  if (game.bullets.length > 220) return;
  const angle = Math.atan2(game.aim.y - CORE.y, game.aim.x - CORE.x);
  const count = game.stats.spread;
  for (let i = 0; i < count; i++) {
    const a = angle + (i - (count - 1) / 2) * .15;
    game.bullets.push({
      x: CORE.x + Math.cos(a) * 28, y: CORE.y + Math.sin(a) * 28,
      vx: Math.cos(a) * 640, vy: Math.sin(a) * 640,
      radius: 5, pierce: game.stats.pierce, hitIds: [],
    });
  }
  game.waveStats.shots += count;
  game.totals.shots = safeAdd(game.totals.shots, count);
  game.events.push({ type: 'shot', x: CORE.x, y: CORE.y });
}

function spawnShards(game, enemy) {
  if (game.enemies.length > 95) return;
  for (const side of [-1, 1]) {
    const template = TYPES.shard;
    const hp = Math.max(1, Math.round(template.hp * game.wavePlan.hpScale));
    game.enemies.push({
      id: game.nextId++, type: 'shard', trait: 'normal',
      x: clamp(enemy.x + side * 15, 15, W - 15), y: enemy.y - 6,
      hp, maxHp: hp, speed: Math.min(210, template.speed * game.wavePlan.speedScale),
      radius: template.radius, damage: 1, score: template.score,
      wobble: random(game) * Math.PI * 2, hit: 0, split: false,
    });
  }
  game.events.push({ type: 'split', x: enemy.x, y: enemy.y });
}

function rewardFor(game) {
  return Math.min(MAX_CURRENCY, Math.floor(game.score / 20) + Math.floor(game.completedWaves * 1.5));
}

// Cristales que se cobrarían si la partida terminara ahora (para mostrarlo antes de retirarse).
export const rewardPreview = game => rewardFor(game);

function finish(game, phase) {
  game.phase = phase;
  game.reward = rewardFor(game);
  game.events.push({ type: phase, x: CORE.x, y: CORE.y });
}

export function retireGame(game) {
  if (!['playing', 'upgrade'].includes(game.phase)) return false;
  game.events = [];
  finish(game, 'retreat');
  return true;
}

function completeWave(game) {
  game.completedWaves++;
  const s = game.waveStats;
  const summary = {
    wave: game.wave, shots: s.shots, hits: s.hits, kills: s.kills,
    breaches: s.breaches, aimDistance: Math.round(s.aimDistance),
    accuracy: s.shots ? clamp(s.hits / s.shots, 0, 1) : 0,
    duration: Math.round(game.elapsed - s.startedAt),
    pattern: game.wavePlan.pattern,
  };
  game.lastWaveSummary = summary;
  game.director.history.push(summary);
  if (game.director.history.length > 4) game.director.history.shift();
  game.phase = 'upgrade';
  game.bullets = [];
  game.events.push({ type: 'wave-clear', x: CORE.x, y: CORE.y, summary });
}

export const totalScore = game => Math.min(MAX_CURRENCY, game.score + game.bonus);

function breakCombo(game, reason) {
  if (game.combo.streak >= COMBO_STEP) {
    game.events.push({ type: 'combo-break', reason, mult: game.combo.mult, x: CORE.x, y: CORE.y - 90 });
  }
  game.combo = freshCombo();
}

function registerKill(game, enemy) {
  const combo = game.combo;
  combo.streak++;
  combo.timer = COMBO_WINDOW;
  const mult = comboMultiplier(combo.streak);
  if (mult > combo.mult) {
    combo.mult = mult;
    game.totals.maxMult = Math.max(game.totals.maxMult, mult);
    game.events.push({ type: 'combo', mult, x: enemy.x, y: enemy.y });
  }
  game.bonus = safeAdd(game.bonus, enemy.score * (combo.mult - 1));
  return enemy.score * combo.mult; // puntos que vale esta baja, con el multiplicador ya aplicado
}

export function stepGame(game, dt) {
  game.events = [];
  if (game.phase !== 'playing' || !Number.isFinite(dt) || dt <= 0) return game;
  const step = Math.min(dt, 1 / 30);
  game.elapsed += step;
  if (game.combo.streak > 0) {
    game.combo.timer -= step;
    if (game.combo.timer <= 0) breakCombo(game, 'timeout');
  }

  if (game.spawned < game.wavePlan.entries.length) {
    game.spawnClock -= step;
    if (game.spawnClock <= 0) {
      spawnEnemy(game);
      game.spawnClock += game.wavePlan.interval * game.wavePlan.entries[game.spawned - 1].delayFactor;
    }
  }

  game.fireClock -= step;
  if (game.fireClock <= 0) {
    fire(game);
    game.fireClock += game.stats.interval;
  }

  for (const bullet of game.bullets) {
    bullet.x += bullet.vx * step;
    bullet.y += bullet.vy * step;
  }
  for (const enemy of game.enemies) {
    enemy.y += enemy.speed * step;
    enemy.x += Math.sin(game.elapsed * 2.6 + enemy.wobble) * 8 * step;
    enemy.hit = Math.max(0, enemy.hit - step);
  }

  for (let i = game.bullets.length - 1; i >= 0; i--) {
    const bullet = game.bullets[i];
    if (bullet.x < -12 || bullet.x > W + 12 || bullet.y < -12 || bullet.y > H + 12) {
      game.bullets.splice(i, 1);
      continue;
    }
    const enemy = game.enemies.find(item =>
      !bullet.hitIds.includes(item.id) &&
      (item.x - bullet.x) ** 2 + (item.y - bullet.y) ** 2 < (item.radius + bullet.radius) ** 2);
    if (!enemy) continue;
    bullet.hitIds.push(enemy.id);
    if (bullet.pierce <= 0) game.bullets.splice(i, 1);
    else bullet.pierce--;
    enemy.hp -= game.stats.damage;
    enemy.hit = .12;
    game.waveStats.hits++;
    game.totals.hits = safeAdd(game.totals.hits, 1);
    game.events.push({ type: 'hit', x: enemy.x, y: enemy.y, typeName: enemy.type });
    if (enemy.hp <= 0) {
      game.enemies.splice(game.enemies.indexOf(enemy), 1);
      game.kills++;
      game.waveStats.kills++;
      game.score = safeAdd(game.score, enemy.score);
      const points = registerKill(game, enemy);
      game.events.push({ type: 'destroy', x: enemy.x, y: enemy.y, typeName: enemy.type, points, mult: game.combo.mult });
      if (enemy.type === 'splitter') spawnShards(game, enemy);
    }
  }

  for (let i = game.enemies.length - 1; i >= 0; i--) {
    const enemy = game.enemies[i];
    if (enemy.y < CORE.y - 30) continue;
    game.enemies.splice(i, 1);
    game.hp -= enemy.damage;
    game.waveStats.breaches++;
    game.totals.breaches = safeAdd(game.totals.breaches, 1);
    breakCombo(game, 'breach');
    game.events.push({ type: 'breach', x: enemy.x, y: CORE.y, typeName: enemy.type });
  }

  if (game.hp <= 0) {
    game.hp = 0;
    finish(game, 'defeat');
  } else if (game.spawned === game.wavePlan.entries.length && game.enemies.length === 0) {
    completeWave(game);
  }
  return game;
}

export function getUpgradeOptions(game) {
  if (game.phase !== 'upgrade') return [];
  const options = ['damage'];
  if (game.hp <= game.maxHp - 2) options.push('repair');
  const pool = ['tempo', 'spread', 'pierce', 'shield'];
  const offset = game.wave % pool.length;
  for (let i = 0; i < pool.length && options.length < 4; i++) {
    const candidate = pool[(offset + i) % pool.length];
    if (candidate === 'tempo' && game.stats.interval <= .081) continue;
    if (candidate === 'spread' && game.stats.spread >= 5) continue;
    if (candidate === 'pierce' && game.stats.pierce >= 3) continue;
    options.push(candidate);
  }
  return options;
}

export function chooseUpgrade(game, upgrade) {
  if (!getUpgradeOptions(game).includes(upgrade)) return false;
  if (upgrade === 'damage') game.stats.damage += 1;
  else if (upgrade === 'tempo') game.stats.interval = Math.max(.08, +(game.stats.interval * .84).toFixed(3));
  else if (upgrade === 'spread') game.stats.spread++;
  else if (upgrade === 'pierce') game.stats.pierce++;
  else if (upgrade === 'repair') game.hp = Math.min(game.maxHp, game.hp + 2);
  else if (upgrade === 'shield') { game.maxHp++; game.hp++; }
  game.wave++;
  game.wavePlan = generateWave(game);
  game.spawned = 0;
  game.spawnClock = .65;
  game.fireClock = 0;
  game.waveStats = { shots: 0, hits: 0, kills: 0, breaches: 0, aimDistance: 0, startedAt: game.elapsed };
  game.combo = freshCombo();
  game.phase = 'playing';
  game.events = [{ type: 'upgrade', x: CORE.x, y: CORE.y, choice: upgrade }];
  return true;
}

export function settleGame(game, profile) {
  const current = cleanProfile(profile);
  if (game.settled || !['defeat', 'retreat'].includes(game.phase)) return current;
  game.settled = true;
  // La misma partida no se cobra dos veces aunque el proceso muera entre guardar el perfil y borrar el checkpoint.
  if (game.runId && game.runId === current.lastRunId) return current;
  const history = game.director.history;
  const style = { ...current.style };
  if (history.length) {
    const weight = style.samples ? .25 : 1;
    for (const key of ['accuracy', 'aimDistance', 'breaches']) {
      style[key] = style[key] * (1 - weight) + recentAverage(history, key) * weight;
    }
    style.samples = Math.min(1_000, style.samples + 1);
  }
  return {
    ...current, coins: safeAdd(current.coins, game.reward),
    best: Math.max(current.best, totalScore(game)),
    bestWave: Math.max(current.bestWave, game.wave),
    runs: safeAdd(current.runs, 1),
    lastRunId: game.runId ?? current.lastRunId,
    style,
  };
}

// Datos de la pantalla de resultados: puros, para poder probarlos sin interfaz.
export function buildResults(game, previousBest = 0) {
  const score = totalScore(game);
  const best = finiteInt(previousBest);
  const shots = game.totals.shots;
  return {
    phase: game.phase, wave: game.wave, completedWaves: game.completedWaves,
    score, baseScore: game.score, bonus: game.bonus, maxMult: game.totals.maxMult,
    accuracy: shots ? clamp(game.totals.hits / shots, 0, 1) : 0,
    kills: game.kills, breaches: game.totals.breaches, reward: game.reward,
    previousBest: best, newRecord: score > best && score > 0, gap: Math.max(0, best - score),
  };
}

// --- Checkpoint de partida -------------------------------------------------
// Solo se guarda en límites seguros (inicio de oleada o pantalla de mejoras): sin enemigos ni proyectiles
// en vuelo, así que no hay que serializar nada transitorio. La restauración rechaza cualquier dato que
// una partida real no pueda producir; es una protección contra corrupción, no un antitrampas.
export const CHECKPOINT_VERSION = 1;
const PLAN_TRAITS = ['normal', 'swift', 'armored'];

function cleanSummary(item) {
  if (!item || typeof item !== 'object' || !Object.hasOwn(PATTERNS, item.pattern)) return null;
  const { wave, shots, hits, kills, breaches, aimDistance, accuracy, duration } = item;
  if (!isInt(wave, 1, MAX_WAVE) || !isInt(shots, 0, 10_000_000) || !isInt(hits, 0, 10_000_000) ||
      !isInt(kills, 0, 10_000) || !isInt(breaches, 0, 10_000) || !isInt(aimDistance, 0, 100_000_000) ||
      !isInt(duration, 0, 1_000_000) || !inRange(accuracy, 0, 1)) return null;
  return { wave, shots, hits, kills, breaches, aimDistance, accuracy, duration, pattern: item.pattern };
}

function cleanTotals(totals) {
  if (!totals || typeof totals !== 'object' || !isInt(totals.shots, 0, 1_000_000_000) ||
      !isInt(totals.hits, 0, 1_000_000_000) || !isInt(totals.breaches, 0, 1_000_000_000) ||
      !isInt(totals.maxMult, 1, COMBO_MAX)) return null;
  return { shots: totals.shots, hits: totals.hits, breaches: totals.breaches, maxMult: totals.maxMult };
}

function cleanPlan(plan, wave) {
  if (!plan || typeof plan !== 'object' || plan.wave !== wave || !Object.hasOwn(PATTERNS, plan.pattern)) return null;
  if (!Array.isArray(plan.entries) || plan.entries.length < 1 || plan.entries.length > 60) return null;
  const entries = [];
  for (const entry of plan.entries) {
    if (!entry || typeof entry !== 'object' || !Object.hasOwn(TYPES, entry.type) ||
        !PLAN_TRAITS.includes(entry.trait) || !inRange(entry.lane, 0, 1) ||
        !inRange(entry.delayFactor, .1, 3)) return null;
    entries.push({ type: entry.type, trait: entry.trait, lane: entry.lane, delayFactor: entry.delayFactor });
  }
  const scale = 1 + Math.max(0, wave - 1) * .085;
  const eps = 1e-9;
  if (!inRange(plan.bias, -.15 - eps, .15 + eps) || !inRange(plan.hpScale, scale * .85 - eps, scale * 1.15 + eps) ||
      !inRange(plan.speedScale, 1 - eps, 1.48 + eps) || !inRange(plan.interval, .22 - eps, .83 + eps) ||
      !isInt(plan.bossCount, 0, 3)) return null;
  const { label, reason } = PATTERNS[plan.pattern];
  return {
    wave, pattern: plan.pattern, label, reason, entries, bossWave: wave % BOSS_INTERVAL === 0,
    bossCount: plan.bossCount, bias: plan.bias, hpScale: plan.hpScale, speedScale: plan.speedScale, interval: plan.interval,
  };
}

export function snapshotGame(game) {
  if (!game || game.settled) return null;
  const atWaveStart = game.phase === 'playing' && game.spawned === 0 && game.enemies.length === 0;
  if (game.phase !== 'upgrade' && !atWaveStart) return null;
  return JSON.parse(JSON.stringify({
    v: CHECKPOINT_VERSION, runId: game.runId, phase: game.phase, seed: game.seed, wave: game.wave,
    completedWaves: game.completedWaves, hp: game.hp, maxHp: game.maxHp, score: game.score,
    bonus: game.bonus, totals: game.totals, kills: game.kills, elapsed: game.elapsed, stats: game.stats, director: game.director,
    wavePlan: game.wavePlan, lastWaveSummary: game.lastWaveSummary,
  }));
}

export function restoreGame(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.v !== CHECKPOINT_VERSION) return null;
  const { phase, wave } = raw;
  if (!['playing', 'upgrade'].includes(phase) || !isInt(wave, 1, MAX_WAVE)) return null;
  if (raw.completedWaves !== (phase === 'upgrade' ? wave : wave - 1)) return null;
  if (!Number.isInteger(raw.seed) || raw.seed < 0 || raw.seed > 0xFFFFFFFF) return null;
  if (!isInt(raw.maxHp, 5, 5 + MAX_LEVEL + wave) || !isInt(raw.hp, 1, raw.maxHp)) return null;
  if (!isInt(raw.score, 0, wave * 10_000) || !isInt(raw.kills, 0, wave * 200) || !inRange(raw.elapsed, 0, wave * 600)) return null;
  const stats = raw.stats;
  if (!stats || typeof stats !== 'object' || !inRange(stats.damage, 1, 1 + MAX_LEVEL * .22 + wave) ||
      !inRange(stats.interval, .08 - 1e-9, .32 + 1e-9) || !isInt(stats.spread, 1, 5) || !isInt(stats.pierce, 0, 3)) return null;
  const director = raw.director;
  if (!director || typeof director !== 'object' || !inRange(director.bias, -.15 - 1e-9, .15 + 1e-9) ||
      !Array.isArray(director.history) || director.history.length > 4) return null;
  const history = director.history.map(cleanSummary);
  const prior = director.prior;
  if (history.includes(null) || !prior || typeof prior !== 'object' || !inRange(prior.accuracy, 0, 1) ||
      !inRange(prior.aimDistance, 0, 100_000) || !inRange(prior.breaches, 0, 100) || !isInt(prior.samples, 0, 1_000)) return null;
  const lastWaveSummary = raw.lastWaveSummary == null ? null : cleanSummary(raw.lastWaveSummary);
  if (raw.lastWaveSummary != null && !lastWaveSummary) return null;
  const wavePlan = cleanPlan(raw.wavePlan, wave);
  if (!wavePlan) return null;
  const bonus = raw.bonus === undefined ? 0 : raw.bonus;
  if (!isInt(bonus, 0, wave * 40_000)) return null;
  const totals = raw.totals === undefined ? freshTotals() : cleanTotals(raw.totals);
  if (!totals) return null;

  const game = newGameState({}, raw.seed, raw.runId);
  game.seed = raw.seed;
  Object.assign(game, {
    phase, wave, completedWaves: raw.completedWaves, hp: raw.hp, maxHp: raw.maxHp, score: raw.score,
    bonus, totals, kills: raw.kills, elapsed: raw.elapsed, lastWaveSummary, wavePlan,
    stats: { damage: stats.damage, interval: stats.interval, spread: stats.spread, pierce: stats.pierce },
    director: {
      bias: director.bias, history,
      prior: { accuracy: prior.accuracy, aimDistance: prior.aimDistance, breaches: prior.breaches, samples: prior.samples },
    },
    spawnClock: phase === 'playing' ? .65 : .6, fireClock: 0,
  });
  game.waveStats.startedAt = game.elapsed;
  return game;
}

export function enemyColor(type) {
  return TYPES[type]?.color || TYPES.drone.color;
}
