// Orquestador: conecta motor, almacenamiento, pantallas, efectos, audio, tutorial y renderizado.
// La lógica del juego vive en engine.mjs; aquí solo hay estados de pantalla, entradas y el bucle.
import {
  BOSS_INTERVAL, COMBO_WINDOW, buildResults, buyPermanentUpgrade, chooseUpgrade, createGame, getUpgradeOptions,
  restoreGame, retireGame, rewardPreview, setAim, settleGame, snapshotGame, startGame, stepGame, totalScore,
} from './engine.mjs';
import { createStore, resolveStorage } from './storage.mjs';
import { SCREEN_ACTIONS, UPGRADES, bannerMarkup, esc, integrityMarkup, overlayMarkup, screenFor } from './ui.mjs';
import { formatDisplay, sevenSegmentSvg } from './segments.mjs';
import { icon } from './icons.mjs';
import { createFx } from './fx.mjs';
import { createRenderer, readPalette } from './render.mjs';
import { createAudio } from './audio.mjs';
import { createCoach } from './coach.mjs';

const VERSION_LABEL = '0.4.0';
const $ = selector => document.querySelector(selector);
const el = {
  app: $('#app'), canvas: $('#arena'), hud: $('#hud'), overlay: $('#overlay'), toast: $('#toast'), banner: $('#banner'), coach: $('#coach'),
  score: $('#scoreDisplay'), wave: $('#waveDisplay'), integrity: $('#integrity'), combo: $('#combo'), comboMult: $('#comboMult'),
  comboBar: $('#comboBar'), formation: $('#formation'), sound: $('#soundButton'), pause: $('#pauseButton'),
};

// --- Estado ----------------------------------------------------------------
const store = createStore(resolveStorage());
const audio = createAudio();
const fx = createFx();
const palette = readPalette();
const font = getComputedStyle(document.documentElement).getPropertyValue('--font').trim() || 'sans-serif';
const renderer = createRenderer(el.canvas, palette, { font });

function saveProfile() {
  if (!store.saveProfile(profile)) announce('No se pudo guardar el progreso en este dispositivo.');
}
function newRunId() {
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return id.replace(/[^A-Za-z0-9-]/g, '').slice(0, 64);
}
// Partida guardada al inicio de la última oleada o en la pantalla de mejoras; se ignora si ya se cobró.
function loadPendingRun() {
  const saved = restoreGame(store.loadRun());
  if (!saved || (saved.runId && saved.runId === profile.lastRunId)) { store.clearRun(); return null; }
  return saved;
}
function saveCheckpoint() {
  const snapshot = snapshotGame(game);
  if (snapshot) store.saveRun(snapshot);
}

const loaded = store.loadProfile();
let profile = loaded.profile;
let settings = store.loadSettings();
let pendingRun = loadPendingRun();
let game = createGame(profile, Date.now());
const coach = createCoach({ done: settings.tutorialDone });
let paused = false;
let settingsOpen = false;
let results = null;
let pointerActive = false;
let accumulator = 0;
let lastFrame = 0;
let lastScreen = '';
let toastTimer;
let coachKey = '';
const hudCache = { score: '', wave: '', integrity: '', formation: '', sound: '', screen: '' };
const analytics = [];

function track(type, data = {}) {
  analytics.push({ type, at: Date.now(), wave: game.wave, score: game.score, ...data });
  if (analytics.length > 200) analytics.shift();
}

function announce(message, ms = 2500) {
  el.toast.textContent = message;
  el.toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove('is-visible'), ms);
}
if (loaded.recovered) announce('El guardado estaba dañado: se conservó una copia aparte y se empezó de cero.', 6500);

function applySettings() {
  const systemReduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
  audio.setSound(settings.sound);
  audio.setHaptics(settings.haptics);
  fx.setReduced(settings.reduceFx || systemReduced);
  el.app.classList.toggle('fx-reduced', settings.reduceFx);
  el.sound.innerHTML = icon(settings.sound ? 'sound-on' : 'sound-off', { size: 22 });
  el.sound.setAttribute('aria-pressed', String(settings.sound));
  el.sound.setAttribute('aria-label', settings.sound ? 'Silenciar sonido' : 'Activar sonido');
}
function updateSettings(patch) {
  settings = { ...settings, ...patch };
  store.saveSettings(settings);
  applySettings();
}

// --- Pantallas -------------------------------------------------------------
function overlayContext(screen) {
  switch (screen) {
    case 'menu': return { profile, pendingRun, version: VERSION_LABEL };
    case 'upgrade': return { wave: game.wave, options: getUpgradeOptions(game), summary: game.lastWaveSummary, rewardPreview: rewardPreview(game) };
    case 'paused': return { wave: game.wave, score: totalScore(game), rewardPreview: rewardPreview(game) };
    case 'results': return { results };
    case 'settings': return { settings, hapticsAvailable: audio.hapticsAvailable() };
    default: return {};
  }
}

function syncScreen(force = false) {
  const screen = screenFor({ phase: game.phase, paused, settingsOpen });
  if (!force && screen === lastScreen) return;
  lastScreen = screen;
  el.overlay.hidden = screen === 'playing';
  el.overlay.dataset.screen = screen;
  el.overlay.innerHTML = screen === 'playing' ? '' : overlayMarkup(screen, overlayContext(screen));
  el.overlay.scrollTop = 0;
  el.hud.hidden = screen === 'menu';
  // El foco inicial ayuda a quien usa teclado; en pantallas táctiles dejaría un anillo visible sin motivo.
  const touchOnly = globalThis.matchMedia?.('(pointer: coarse)')?.matches ?? false;
  if (screen !== 'playing' && !touchOnly) el.overlay.querySelector('button:not(:disabled)')?.focus({ preventScroll: true });
}

function showBanner() {
  const plan = game.wavePlan;
  const bossIn = plan.bossWave ? 0 : BOSS_INTERVAL - (game.wave % BOSS_INTERVAL);
  el.banner.innerHTML = '';
  void el.banner.offsetWidth; // reinicia la animación
  el.banner.innerHTML = bannerMarkup({ wave: game.wave, label: plan.label, boss: plan.bossWave, bossIn });
}

function renderCoach(message) {
  const key = message?.key ?? '';
  if (key === coachKey) return;
  coachKey = key;
  el.coach.innerHTML = message ? `<div class="coach__plate">${icon(message.icon, { size: 22 })}<span>${esc(message.text)}</span></div>` : '';
}

function updateHud() {
  const total = totalScore(game);
  const scoreKey = String(total);
  if (scoreKey !== hudCache.score) {
    hudCache.score = scoreKey;
    el.score.innerHTML = sevenSegmentSvg(formatDisplay(total, 6), { label: `Puntuación ${total}` });
  }
  const waveKey = String(game.wave);
  if (waveKey !== hudCache.wave) {
    hudCache.wave = waveKey;
    el.wave.innerHTML = sevenSegmentSvg(formatDisplay(game.wave, 2), { label: `Oleada ${game.wave}` });
  }
  const integrityKey = `${game.hp}/${game.maxHp}`;
  if (integrityKey !== hudCache.integrity) {
    hudCache.integrity = integrityKey;
    const model = integrityMarkup(game.hp, game.maxHp);
    el.integrity.innerHTML = model.html;
    el.integrity.classList.toggle('is-low', model.low);
  }
  const formation = game.wavePlan.label + (game.wavePlan.bossWave ? ' · jefe' : '');
  if (formation !== hudCache.formation) { hudCache.formation = formation; el.formation.textContent = formation; }
  const combo = game.combo;
  const showCombo = game.phase === 'playing' && combo.streak >= 2;
  el.combo.hidden = !showCombo;
  if (showCombo) {
    el.comboMult.textContent = `×${combo.mult}`;
    el.comboBar.style.width = `${Math.max(0, Math.min(1, combo.timer / COMBO_WINDOW)) * 100}%`;
  }
  el.pause.disabled = game.phase !== 'playing' || settingsOpen;
  const danger = game.phase === 'playing' && (game.hp <= 2 || game.hp / game.maxHp <= 0.34);
  el.app.classList.toggle('is-danger', danger && !paused);
  return danger;
}

// --- Flujo de la partida ---------------------------------------------------
function newRun() {
  // Empezar de cero descarta la partida guardada: el botón ya lo advierte en el menú.
  pendingRun = null;
  store.clearRun();
  audio.unlock();
  game = startGame(createGame(profile, Date.now(), newRunId()));
  paused = false;
  settingsOpen = false;
  results = null;
  accumulator = 0;
  fx.clear();
  if (!coach.done) renderCoach(coach.dispatch('start'));
  track('run_started');
  track('wave_generated', { pattern: game.wavePlan.pattern, bosses: 0, bias: 0 });
  syncScreen(true);
  showBanner();
  audio.play('start');
}

function completeRun() {
  const previousBest = profile.best;
  profile = settleGame(game, profile);
  results = buildResults(game, previousBest);
  saveProfile(); // primero el perfil (con el id de la partida cobrada); luego se borra el checkpoint
  store.clearRun();
  track('run_ended', { result: game.phase, reward: game.reward, duration_seconds: Math.round(game.elapsed) });
}

function continueRun() {
  if (!pendingRun) return;
  audio.unlock();
  game = pendingRun;
  pendingRun = null;
  paused = game.phase === 'playing'; // se reanuda en pausa: el jugador decide cuándo
  accumulator = 0;
  fx.clear();
  syncScreen(true);
  track('run_restored', { restored_wave: game.wave });
}

function retire() {
  paused = false;
  settingsOpen = false;
  if (retireGame(game)) { completeRun(); consume(game.events); syncScreen(true); }
}

function consume(events) {
  for (const event of events) {
    switch (event.type) {
      case 'shot': fx.kick({ muzzle: 0.05 }); audio.play('shot'); break;
      case 'hit': fx.shards(event.x, event.y, ['ivory', 'orangeHi'], 3, 0.5); audio.play('hit'); break;
      case 'destroy': {
        const boss = event.typeName === 'boss';
        fx.shards(event.x, event.y, boss ? ['orangeHi', 'ivory', 'rustHi'] : ['rustHi', 'ivory', 'orange'], boss ? 34 : 9);
        fx.ring(event.x, event.y, boss ? 2.2 : 1, boss ? 'orangeHi' : 'ivory');
        fx.popup(event.x, event.y - 14, `+${event.points}`, event.mult > 1 ? 'orangeHi' : 'ivory');
        if (boss) fx.kick({ shake: 7, hitStop: 0.07 });
        audio.play(boss ? 'bossDestroy' : 'destroy');
        track('enemy_destroyed', { enemy_type: event.typeName });
        break;
      }
      case 'boss': audio.play('boss'); track('boss_spawned'); break;
      case 'split': fx.shards(event.x, event.y, ['rustHi', 'ivory'], 10); break;
      case 'breach':
        fx.shards(event.x, event.y, ['rustHi', 'orange'], 14);
        fx.kick({ shake: 7, flash: 0.9, hitStop: 0.05 });
        audio.play('breach');
        renderCoach(coach.dispatch('breach'));
        track('core_hit', { hp: game.hp });
        break;
      case 'combo':
        fx.popup(event.x, event.y - 30, `×${event.mult}`, 'orangeHi');
        audio.play('combo', { pitch: 1 + (event.mult - 2) * 0.12 });
        renderCoach(coach.dispatch('combo'));
        track('combo_reached', { mult: event.mult });
        break;
      case 'combo-break': fx.popup(event.x, event.y, 'RACHA ✕', 'rustHi'); audio.play('comboBreak'); break;
      case 'wave-clear':
        fx.shards(240, 600, ['cobaltHi', 'ivory', 'orangeHi'], 26, 1.2);
        fx.ring(240, 622, 4, 'cobaltHi');
        audio.play('waveClear');
        track('wave_completed');
        saveCheckpoint();
        renderCoach(coach.dispatch('wave-clear'));
        if (coach.done && !settings.tutorialDone) updateSettings({ tutorialDone: true });
        break;
      case 'upgrade':
        fx.shards(240, 622, ['orangeHi', 'ivory'], 16, 1);
        audio.play('upgrade');
        saveCheckpoint();
        break;
      case 'retreat': audio.play('retreat'); break;
      case 'defeat': fx.kick({ shake: 9, flash: 1 }); audio.play('defeat'); break;
      default:
    }
  }
}

// Un paso fijo de simulación. Devuelve false cuando la partida deja de estar en juego (mejoras, derrota, retirada).
function stepOnce() {
  stepGame(game, 1 / 60);
  consume(game.events);
  if (game.phase === 'playing') return true;
  if (game.phase === 'defeat') completeRun();
  syncScreen(true);
  return false;
}

// --- Entradas --------------------------------------------------------------
const actions = {
  start: newRun, again: newRun, continue: continueRun, retire,
  resume() { paused = false; accumulator = 0; syncScreen(true); track('resumed'); },
  menu() { game = createGame(profile, Date.now()); results = null; syncScreen(true); },
  'settings-open'() { settingsOpen = true; syncScreen(true); },
  'settings-close'() { settingsOpen = false; syncScreen(true); },
  'toggle-sound'() { updateSettings({ sound: !settings.sound }); audio.unlock(); audio.play('ui'); syncScreen(true); },
  'toggle-haptics'() { updateSettings({ haptics: !settings.haptics }); audio.haptic('light'); syncScreen(true); },
  'toggle-reducefx'() { updateSettings({ reduceFx: !settings.reduceFx }); syncScreen(true); },
  'replay-tutorial'() { coach.restart(); updateSettings({ tutorialDone: false }); announce('El tutorial volverá a aparecer en tu próxima partida'); },
};

for (const name of SCREEN_ACTIONS) {
  if (typeof actions[name] !== 'function') throw new Error(`Acción sin manejador: ${name}`);
}

el.overlay.addEventListener('click', event => {
  const action = event.target.closest('button')?.dataset.action;
  if (!action) return;
  audio.unlock();
  if (Object.hasOwn(actions, action)) { actions[action](); return; }
  if (action.startsWith('permanent-')) {
    const next = buyPermanentUpgrade(profile, action.slice('permanent-'.length));
    if (next.coins !== profile.coins) {
      profile = next; saveProfile(); track('permanent_upgrade', { upgrade: action });
      syncScreen(true); audio.play('upgrade'); announce('MEJORA PERMANENTE ADQUIRIDA');
    }
    return;
  }
  if (Object.hasOwn(UPGRADES, action) && chooseUpgrade(game, action)) {
    track('upgrade_selected', { upgrade: action });
    track('wave_generated', { pattern: game.wavePlan.pattern, bosses: game.wavePlan.bossCount, bias: game.wavePlan.bias });
    consume(game.events);
    syncScreen(true);
    showBanner();
  }
});

function togglePause() {
  if (game.phase !== 'playing') return;
  if (settingsOpen) { settingsOpen = false; syncScreen(true); return; }
  paused = !paused;
  accumulator = 0;
  syncScreen(true);
  track(paused ? 'paused' : 'resumed');
}
el.pause.addEventListener('click', () => { audio.unlock(); togglePause(); });
el.sound.addEventListener('click', () => { actions['toggle-sound'](); });

function aimFromPointer(event) {
  const rect = el.canvas.getBoundingClientRect();
  const { layout } = renderer;
  setAim(game, (event.clientX - rect.left - layout.x) / layout.scale, (event.clientY - rect.top - layout.y) / layout.scale);
  renderCoach(coach.dispatch('aimed'));
}
el.canvas.addEventListener('pointerdown', event => {
  if (game.phase !== 'playing' || paused) return;
  audio.unlock();
  pointerActive = true;
  try { el.canvas.setPointerCapture(event.pointerId); } catch { /* puntero sintético o ya liberado */ }
  aimFromPointer(event);
  track('aim_input', { method: event.pointerType });
});
el.canvas.addEventListener('pointermove', event => {
  if (game.phase !== 'playing' || paused || (event.pointerType !== 'mouse' && !pointerActive)) return;
  aimFromPointer(event);
});
const endPointer = () => { pointerActive = false; };
el.canvas.addEventListener('pointerup', endPointer);
el.canvas.addEventListener('pointercancel', endPointer);

window.addEventListener('keydown', event => {
  const key = event.key.toLowerCase();
  if (key === 'p' || event.key === 'Escape') { togglePause(); return; }
  if (key === 'm') { actions['toggle-sound'](); return; }
  if (game.phase !== 'playing' || paused) return;
  const shift = 24;
  if (event.key === 'ArrowLeft') setAim(game, game.aim.x - shift, game.aim.y);
  else if (event.key === 'ArrowRight') setAim(game, game.aim.x + shift, game.aim.y);
  else if (event.key === 'ArrowUp') setAim(game, game.aim.x, game.aim.y - shift);
  else if (event.key === 'ArrowDown') setAim(game, game.aim.x, game.aim.y + shift);
  else return;
  renderCoach(coach.dispatch('aimed'));
  event.preventDefault();
});

function safePause() {
  if (game.phase === 'playing' && !paused) { paused = true; accumulator = 0; syncScreen(true); track('paused', { reason: 'visibility' }); }
}
document.addEventListener('visibilitychange', () => { if (document.hidden) safePause(); });
window.addEventListener('blur', safePause);
window.addEventListener('resize', () => renderer.resize());
globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.addEventListener?.('change', applySettings);

// --- Depuración y verificación ---------------------------------------------
function drawNow(timestamp = performance.now()) {
  const danger = updateHud();
  renderer.draw({ game, fx: fx.state, danger, time: timestamp / 1000 });
}
const qaSnapshot = () => ({
  phase: game.phase, screen: lastScreen, wave: game.wave, hp: game.hp, maxHp: game.maxHp, score: game.score, total: totalScore(game),
  bonus: game.bonus, combo: { ...game.combo }, kills: game.kills, profile: { ...profile }, settings: { ...settings }, paused,
  pendingRunWave: pendingRun?.wave ?? null, coach: coach.current()?.key ?? null, results,
  plan: { pattern: game.wavePlan.pattern, bosses: game.wavePlan.bossCount, count: game.wavePlan.entries.length, bias: game.wavePlan.bias },
  fx: { particles: fx.state.particles.length, rings: fx.state.rings.length, popups: fx.state.popups.length },
  enemies: game.enemies.reduce((count, enemy) => ({ ...count, [enemy.type]: (count[enemy.type] ?? 0) + 1 }), {}),
  waveStats: { ...game.waveStats }, events: analytics.slice(),
});
// Avance determinista del tiempo para verificar en navegador (el panel suspende requestAnimationFrame en segundo plano).
// Solo existe en servidores locales y nunca dentro de la app nativa, para no ofrecer atajos al jugador.
function qaAdvance(seconds = 1, { autoAim = false } = {}) {
  const steps = Math.min(Math.max(0, Math.round(Number(seconds) * 60) || 0), 60 * 180);
  for (let i = 0; i < steps && game.phase === 'playing' && !paused; i++) {
    if (autoAim) {
      const target = game.enemies.toSorted((a, b) => b.y - a.y)[0];
      if (target) { setAim(game, target.x, target.y + Math.min(80, target.speed * 0.22)); coach.dispatch('aimed'); }
    }
    fx.update(1 / 60);
    if (!stepOnce()) break;
  }
  drawNow();
  return qaSnapshot();
}
const isLocalDev = !globalThis.Capacitor?.isNativePlatform?.() && ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
window.PulsoOrbitalQA = Object.freeze(isLocalDev ? { snapshot: qaSnapshot, advance: qaAdvance, render: drawNow } : { snapshot: qaSnapshot });

// --- Bucle -----------------------------------------------------------------
function frame(timestamp) {
  const dt = Math.min(0.05, Math.max(0, (timestamp - lastFrame) / 1000 || 0));
  lastFrame = timestamp;
  if (game.phase === 'playing' && !paused) {
    if (fx.consumeHitStop(dt) <= 0 && fx.state.hitStop <= 0) {
      accumulator += dt;
      let steps = 0;
      while (accumulator >= 1 / 60 && steps++ < 4) {
        accumulator -= 1 / 60;
        if (!stepOnce()) { accumulator = 0; break; }
      }
    }
    if (!coach.done) renderCoach(coach.tick(dt));
  }
  fx.update(dt);
  drawNow(timestamp);
  requestAnimationFrame(frame);
}

applySettings();
el.pause.innerHTML = icon('pause', { size: 22 });
renderer.resize();
syncScreen(true);
drawNow();
requestAnimationFrame(frame);
