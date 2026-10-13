// Lumen: Guardianes del Bosque. Orquesta los módulos: el motor decide, el renderizador dibuja, la interfaz muestra.
// Aquí solo viven el DOM, el bucle de fotogramas y el cableado entre módulos.
import { MAP, TOWERS } from './content.mjs';
import { createRun, build, upgrade, sell, upgradeCost, startWave, step, moveHero, pulse, snapshotRun, restoreRun } from './engine.mjs';
import { buyPower, powerCost, settle } from './profile.mjs';
import { createStore, resolveStorage } from './store.mjs';
import { createAudio } from './audio.mjs';
import { createCoach } from './coach.mjs';
import { createFx } from './fx.mjs';
import { createRenderer, readPalette } from './render.mjs';
import { insideWorld, padAt, toWorld } from './view.mjs';
import { icon } from './icons.mjs';
import { bannerMarkup, coachMarkup, helpMarkup, packetMarkup, pipsMarkup, resultsMarkup, retireMarkup, settingsMarkup, veilMarkup } from './ui.mjs';

const $ = id => document.getElementById(id);
const STEP = 1 / 60;
const LIVE = ['build', 'combat'];

const store = createStore(resolveStorage());
const { profile, recovered } = store.loadProfile();
const settings = store.loadSettings();
const audio = createAudio();
const fx = createFx();
const coach = createCoach({ done: settings.tutorialDone });
const palette = readPalette();
const font = getComputedStyle(document.documentElement).getPropertyValue('--serif').trim() || 'Georgia, serif';
const arena = createRenderer($('arena'), palette, { font });
const preview = createRenderer($('preview'), palette, { font });
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const reduced = () => settings.reduceFx || motion.matches;

// Escena decorativa de la pantalla de inicio.
const previewRun = createRun();
previewRun.towers = [{ pad: 1, type: 'thorn', level: 2 }, { pad: 4, type: 'frost', level: 1 }, { pad: 7, type: 'spore', level: 2 }];

let run = null;
let selected = -1;
let speed = 1;
let moving = false;
let last = 0;
let accumulator = 0;
let uiTimer = 0;
let closeAction = null;
let saveFailed = false;
let toastTimer = 0;
let bannerTimer = 0;
let coachKey = null;
let veilShown = false;
let pending = null; // punto de control disponible

const newRunId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
const isLive = () => Boolean(run) && LIVE.includes(run.phase);
const cached = new WeakMap();
function setHtml(element, html) { if (cached.get(element) !== html) { element.innerHTML = html; cached.set(element, html); } }

// --- Ajustes y persistencia ------------------------------------------------------------------------------
function applySettings() {
  document.documentElement.classList.toggle('large-text', settings.largeText);
  document.documentElement.classList.toggle('reduce-fx', reduced());
  fx.setReduced(reduced());
  audio.setSound(settings.sound);
}
function saveSettings() { store.saveSettings(settings); }
function persist() {
  saveFailed = !store.saveProfile(profile);
  if (saveFailed) showToast('No se pudo guardar. El progreso sigue disponible durante esta sesión.');
  return !saveFailed;
}
function refreshCheckpoint() {
  const raw = store.loadRun();
  pending = raw ? restoreRun(raw) : null;
  if (raw && (!pending || pending.runId === profile.lastRunId)) { store.clearRun(); pending = null; }
}
// Solo se borra el punto de control de esta expedición: uno anterior y distinto sigue siendo válido.
function clearCheckpointOf(finished) {
  const stored = store.loadRun();
  if (!stored || stored.runId === finished.runId) store.clearRun();
}

// --- Texto flotante, carteles y diálogos --------------------------------------------------------------------
function showToast(text) {
  const element = $('toast');
  element.textContent = text;
  element.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove('is-visible'), 3200);
}
function showBanner(markup) {
  $('banner').innerHTML = markup;
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => { $('banner').innerHTML = ''; }, 1900);
}
function renderCoach() {
  const view = isLive() ? coach.current() : null;
  const key = view?.key ?? null;
  if (key !== coachKey) { coachKey = key; $('coach').innerHTML = view ? coachMarkup(view.text) : ''; }
  if (coach.done && !settings.tutorialDone) { settings.tutorialDone = true; saveSettings(); }
}
function openModal(html, buttonLabel = 'Continuar', onClose = null) {
  if (isLive()) { run.paused = true; updateUI(); }
  $('modal-content').innerHTML = html;
  const title = $('modal-content').querySelector('h2');
  if (title) title.id = 'modal-title';
  $('modal-close').textContent = buttonLabel;
  closeAction = onClose;
  if (!$('modal').open) $('modal').showModal();
}
function closeModal() {
  const callback = closeAction;
  closeAction = null;
  if ($('modal').open) $('modal').close();
  callback?.();
}
const openHelp = () => openModal(helpMarkup(), 'Entendido');
const openSettings = () => openModal(settingsMarkup({ settings }), 'Cerrar');
function openRetire() {
  if (!run) return;
  openModal(retireMarkup(), 'Seguir jugando');
}

// --- Inicio ------------------------------------------------------------------------------------------------
function homeUI() {
  $('best').textContent = profile.best;
  $('seeds').textContent = profile.seeds;
  $('wins').textContent = profile.victories;
  $('power-level').textContent = `${profile.power} / 5`;
  const cost = powerCost(profile);
  $('buy-power').textContent = profile.power >= 5 ? 'Nivel máximo' : `Mejorar · ${cost} semillas`;
  $('buy-power').disabled = profile.power >= 5 || profile.seeds < cost;
  $('continue').hidden = !pending;
  if (pending) $('continue').textContent = `Continuar expedición · oleada ${pending.wave + 1}`;
  $('play').textContent = pending ? 'Nueva expedición' : 'Iniciar expedición';
}

function startRun(restored = null) {
  run = restored ?? createRun(profile.power, newRunId());
  run.paused = false;
  selected = -1; speed = 1; moving = false; accumulator = 0; coachKey = null; veilShown = false;
  fx.clear();
  document.body.classList.add('in-game');
  $('home').hidden = true;
  $('game').hidden = false;
  window.scrollTo(0, 0);
  arena.resize();
  if (!restored) coach.dispatch('start');
  else showToast(`Expedición retomada en la oleada ${run.wave + 1}.`);
  renderCoach();
  updateUI();
  $('arena').focus({ preventScroll: true });
}

function leaveGame() {
  run = null;
  document.body.classList.remove('in-game');
  $('game').hidden = true;
  $('home').hidden = false;
  $('banner').innerHTML = '';
  $('coach').innerHTML = '';
  coachKey = null;
  refreshCheckpoint();
  homeUI();
  preview.resize();
  $('play').focus({ preventScroll: true });
}

function finish() {
  if (!run || run.settled) return;
  const phase = run.phase;
  const previousBest = profile.best;
  const reward = settle(profile, run);
  persist();
  clearCheckpointOf(run);
  audio.play(phase === 'won' ? 'win' : phase === 'lost' ? 'lose' : 'ui');
  homeUI();
  openModal(resultsMarkup({ phase, completed: run.completed, kills: run.kills, reward, newBest: run.completed > previousBest && run.completed > 0, saveFailed }), 'Volver al refugio', leaveGame);
}

// --- Acciones del jugador -------------------------------------------------------------------------------------
function togglePause() {
  if (!isLive()) return;
  run.paused = !run.paused;
  audio.play('ui');
  updateUI();
}
function construct(type) {
  if (!isLive() || run.paused) return;
  const def = TOWERS[type];
  if (selected < 0) { showToast('Primero toca una parcela del mapa.'); return; }
  if (run.towers.some(t => t.pad === selected)) { showToast('Esa parcela ya tiene una defensa.'); return; }
  if (run.gold < def.cost) { showToast(`Te faltan ${def.cost - run.gold} de luz para plantar ${def.name}.`); return; }
  if (build(run, selected, type)) {
    const [x, y] = MAP.pads[selected];
    audio.play('build');
    fx.motes(x, y - 18, ['lantern', 'paper'], 8);
    fx.ring(x, y, 1, 'lantern');
    coach.dispatch('built');
    coach.dispatch('spent');
    showToast(`${def.name} plantada. ${def.description}.`);
  }
  renderCoach();
  updateUI();
}
function improve() {
  if (!isLive()) return;
  const tower = run.towers.find(t => t.pad === selected);
  if (!tower) return;
  if (tower.level < 3 && run.gold < upgradeCost(tower)) { showToast(`Te faltan ${upgradeCost(tower) - run.gold} de luz para mejorarla.`); return; }
  if (upgrade(run, selected)) {
    const [x, y] = MAP.pads[selected];
    audio.play('upgrade');
    fx.motes(x, y - 18, ['lantern', 'dew'], 10);
    fx.ring(x, y, 1.3, 'lantern');
    coach.dispatch('spent');
    renderCoach();
    showToast('Defensa mejorada: más daño y alcance.');
  }
  updateUI();
}
function retireTower() {
  if (!isLive() || !sell(run, selected)) return;
  audio.play('sell');
  showToast('Defensa retirada. Recuperaste el 65% de la luz invertida.');
  updateUI();
}
function nextWave() {
  if (!isLive() || !startWave(run)) return;
  const boss = run.wave === 12;
  audio.play(boss ? 'boss' : 'waveStart');
  showBanner(bannerMarkup({ wave: run.wave, boss }));
  coach.dispatch('wave-start');
  renderCoach();
  updateUI();
}
function lightPulse() {
  if (!isLive() || !pulse(run)) return;
  audio.play('pulse');
  fx.ring(run.hero.x, run.hero.y, 3.2, 'lantern');
  fx.motes(run.hero.x, run.hero.y, ['lantern', 'paper'], 12, 1.6);
  showToast('¡Pulso de luz! Daña a los invasores cercanos a Lyra.');
  updateUI();
}
function selectPad(index) {
  selected = index;
  audio.play('ui');
  coach.dispatch('selected');
  renderCoach();
  updateUI();
}

// --- Eventos del motor ------------------------------------------------------------------------------------------
function onEvent(event) {
  if (event.type === 'kill') {
    fx.motes(event.x, event.y, ['lantern', 'paper'], 5);
    fx.popup(event.x, event.y - 14, `+${event.reward}`);
    audio.play('kill', { pitch: 0.9 + Math.random() * 0.3 });
  } else if (event.type === 'leak') {
    fx.hurt({ shake: 6, flash: 0.6 });
    fx.ring(event.x, event.y, 1.4, 'ember');
    audio.play('leak');
    coach.dispatch('leak');
    renderCoach();
  } else if (event.type === 'wave-clear') {
    audio.play('waveClear');
    showToast(`Oleada ${event.wave} superada. +${event.bonus} de luz. Refuerza tus defensas.`);
    coach.dispatch('wave-clear');
    renderCoach();
    const snapshot = snapshotRun(run);
    if (snapshot) store.saveRun(snapshot);
  }
}

// --- Interfaz ---------------------------------------------------------------------------------------------------------
function updateUI() {
  if (!run) return;
  const live = isLive();
  $('health').textContent = run.health;
  $('gold').textContent = run.gold;
  $('speed').textContent = `${speed}×`;
  $('speed').setAttribute('aria-label', `Velocidad ${speed}×; cambiar`);
  setHtml($('pause'), icon(run.paused ? 'play' : 'pause', { size: 22 }));
  $('pause').setAttribute('aria-label', run.paused ? 'Reanudar partida' : 'Pausar partida');
  $('wave-label').textContent = `${run.phase === 'combat' ? run.wave : run.completed} / 12`;
  setHtml($('pips'), pipsMarkup(run.phase === 'combat' ? run.wave : Math.min(12, run.completed + 1), run.completed));

  const waveButton = $('next-wave');
  waveButton.disabled = run.phase !== 'build' || run.paused;
  setHtml(waveButton, run.phase === 'combat' ? `${run.enemies.length + run.queue.length} invasores` : `${icon('play', { size: 18 })}Oleada ${Math.min(12, run.wave + 1)}`);
  $('pulse').disabled = run.phase !== 'combat' || run.hero.pulse > 0 || run.paused;
  $('pulse-label').textContent = run.hero.pulse > 0 ? `${Math.ceil(run.hero.pulse)} s` : 'Pulso';
  $('hero-move').setAttribute('aria-pressed', String(moving));
  $('hero-move').disabled = !live || run.paused;

  const tower = run.towers.find(t => t.pad === selected);
  $('selection-label').textContent = selected < 0 ? 'Toca una parcela del mapa' : tower ? `Parcela ${selected + 1} · ${TOWERS[tower.type].name} · nivel ${tower.level}` : `Parcela ${selected + 1} · elige una defensa`;
  $('build-buttons').hidden = Boolean(tower);
  $('tower-actions').hidden = !tower;
  for (const [type, def] of Object.entries(TOWERS)) {
    const packet = $(`build-${type}`);
    const blocked = selected < 0 || run.gold < def.cost || run.paused || !live;
    packet.setAttribute('aria-disabled', String(blocked));
  }
  if (tower) {
    const cost = upgradeCost(tower);
    setHtml($('upgrade'), tower.level >= 3 ? 'Nivel máximo' : `Mejorar · ${icon('lantern', { size: 16 })}${cost}`);
    $('upgrade').disabled = tower.level >= 3 || run.gold < cost || run.paused;
    setHtml($('sell'), `Vender · +${Math.floor(tower.spent * 0.65)}`);
    $('sell').disabled = run.paused;
  }
  [...$('plots').children].forEach((button, index) => {
    button.classList.toggle('selected', index === selected);
    button.setAttribute('aria-pressed', String(index === selected));
  });
  syncVeil();
}

function syncVeil() {
  const show = Boolean(run) && run.paused && isLive() && !$('modal').open;
  const veil = $('veil');
  if (show !== veilShown) {
    veilShown = show;
    veil.hidden = !show;
    if (show) { veil.innerHTML = veilMarkup(); veil.querySelector('[data-veil="resume"]')?.focus({ preventScroll: true }); }
    else veil.innerHTML = '';
  }
}

// --- Cableado de eventos del DOM ---------------------------------------------------------------------------------
for (const element of document.querySelectorAll('[data-icon]')) element.innerHTML = icon(element.dataset.icon, { size: Number(element.dataset.size) || 24 });
for (const [type, def] of Object.entries(TOWERS)) $('build-buttons').insertAdjacentHTML('beforeend', packetMarkup(type, def));
for (let i = 0; i < MAP.pads.length; i++) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = String(i + 1);
  button.setAttribute('aria-label', `Seleccionar parcela ${i + 1}`);
  button.addEventListener('click', () => selectPad(i));
  $('plots').append(button);
}
// Con ratón y pantalla amplia el selector de parcelas por botones empieza abierto; en móviles (aunque apaisados) no.
if (matchMedia('(min-width: 900px) and (min-height: 600px) and (pointer: fine)').matches) $('plots-wrap').open = true;

document.addEventListener('pointerdown', () => audio.unlock(), { capture: true });
$('build-buttons').addEventListener('click', event => { const packet = event.target.closest('[data-tower]'); if (packet) construct(packet.dataset.tower); });
$('upgrade').addEventListener('click', improve);
$('sell').addEventListener('click', retireTower);
$('next-wave').addEventListener('click', nextWave);
$('pulse').addEventListener('click', lightPulse);
$('hero-move').addEventListener('click', () => { moving = !moving; if (moving) showToast('Toca el mapa para mover a Lyra.'); updateUI(); });
$('pause').addEventListener('click', togglePause);
$('speed').addEventListener('click', () => { speed = speed === 1 ? 2 : 1; audio.play('ui'); updateUI(); });
$('help').addEventListener('click', openHelp);
$('settings').addEventListener('click', openSettings);
$('play').addEventListener('click', () => startRun());
$('continue').addEventListener('click', () => { if (pending) { const saved = pending; pending = null; startRun(saved); } });
$('buy-power').addEventListener('click', () => {
  if (!buyPower(profile)) return;
  persist();
  homeUI();
  audio.play('upgrade');
  if (saveFailed) openModal('<small class="kicker">Aviso</small><h2>Guardado no disponible</h2><p>La mejora se conserva durante esta sesión, pero el almacenamiento del dispositivo la ha rechazado.</p>');
});
$('brand').addEventListener('click', event => { event.preventDefault(); if (!run) window.scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' }); });

$('veil').addEventListener('click', event => {
  const action = event.target.closest('[data-veil]')?.dataset.veil;
  if (action === 'resume') { run.paused = false; updateUI(); $('arena').focus({ preventScroll: true }); }
  else if (action === 'settings') openSettings();
  else if (action === 'help') openHelp();
  else if (action === 'retire') openRetire();
});

$('modal-close').addEventListener('click', closeModal);
$('modal').addEventListener('cancel', event => { event.preventDefault(); closeModal(); });
$('modal').addEventListener('close', () => { if (run) updateUI(); });
$('modal-content').addEventListener('click', event => {
  const control = event.target.closest('[data-action]');
  if (!control) return;
  const action = control.dataset.action;
  if (action === 'close') closeModal();
  else if (action === 'confirm-retire') { closeAction = null; $('modal').close(); run.phase = 'retired'; finish(); }
  else if (action === 'replay-tutorial') {
    coach.restart(); settings.tutorialDone = false; saveSettings();
    closeAction = null; $('modal').close();
    if (isLive()) { coach.dispatch('start'); renderCoach(); } else showToast('El tutorial se mostrará en tu próxima expedición.');
  } else {
    if (action === 'toggle-sound') { settings.sound = !settings.sound; applySettings(); audio.unlock(); audio.play('ui'); }
    else if (action === 'toggle-reducefx') { settings.reduceFx = !settings.reduceFx; applySettings(); }
    else if (action === 'toggle-largetext') { settings.largeText = !settings.largeText; applySettings(); }
    else return;
    saveSettings();
    $('modal-content').innerHTML = settingsMarkup({ settings });
    $('modal-content').querySelector(`[data-action="${action}"]`)?.focus();
    const title = $('modal-content').querySelector('h2');
    if (title) title.id = 'modal-title';
    resizeAll();
  }
});

// Un toque sobre una parcela la selecciona; sobre el suelo (o con «Mover a Lyra» activo) mueve a Lyra.
$('arena').addEventListener('pointerdown', event => {
  if (!isLive() || run.paused) return;
  const rect = $('arena').getBoundingClientRect();
  const px = event.clientX - rect.left;
  const py = event.clientY - rect.top;
  const pad = padAt(arena.view, px, py, MAP.pads);
  if (pad >= 0 && !moving) { selectPad(pad); return; }
  const point = toWorld(arena.view, px, py);
  if (!insideWorld(point)) return;
  moveHero(run, point.x, point.y);
  fx.ring(point.x, point.y, 0.6, 'lantern');
  moving = false;
  updateUI();
});

document.addEventListener('keydown', event => {
  if (!run || $('modal').open) return;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code) && event.target === document.body) event.preventDefault();
  if (event.code === 'Escape') { togglePause(); return; }
  if (event.repeat && !event.code.startsWith('Arrow')) return;
  if (!isLive() || run.paused) return;
  if (event.code === 'Space' && event.target?.tagName !== 'BUTTON') { event.preventDefault(); nextWave(); }
  else if (event.code === 'KeyQ') lightPulse();
  else if (event.code === 'KeyA') construct('thorn');
  else if (event.code === 'KeyR') construct('frost');
  else if (event.code === 'KeyE') construct('spore');
  else if (/^Digit[1-9]$/.test(event.code)) selectPad(Number(event.code.slice(5)) - 1);
  else {
    const delta = { ArrowLeft: [-40, 0], ArrowRight: [40, 0], ArrowUp: [0, -40], ArrowDown: [0, 40] }[event.code];
    if (delta) moveHero(run, run.hero.targetX + delta[0], run.hero.targetY + delta[1]);
  }
});

// Al salir de la aplicación o perder el foco, la expedición se pone en pausa.
function pauseForFocusLoss() { if (isLive() && !run.paused) { run.paused = true; accumulator = 0; updateUI(); } }
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseForFocusLoss(); });
window.addEventListener('blur', () => { if (!$('modal').open) pauseForFocusLoss(); });
motion.addEventListener?.('change', applySettings);

function resizeAll() { arena.resize(); preview.resize(); }
if (typeof ResizeObserver === 'function') {
  const observer = new ResizeObserver(resizeAll);
  observer.observe($('arena'));
  observer.observe($('preview'));
}
window.addEventListener('resize', resizeAll);

// --- Bucle ----------------------------------------------------------------------------------------------------------------
function frame(now) {
  const dt = Math.min((now - last) / 1000 || 0, 0.1);
  last = now;
  if (run) {
    if (isLive() && !run.paused) {
      accumulator += dt * speed;
      let guard = 0;
      while (accumulator >= STEP && guard++ < 12 && isLive()) {
        step(run, STEP);
        accumulator -= STEP;
        for (const event of run.events) onEvent(event);
      }
      fx.update(dt);
      coach.tick(dt);
      renderCoach();
    } else accumulator = 0;
    if ((run.phase === 'won' || run.phase === 'lost') && !run.settled) finish();
    arena.draw(run, { time: now / 1000, selected, reduced: reduced(), fx: fx.state, highlightPads: coachKey === 'select', moving });
    uiTimer += dt;
    if (uiTimer > 0.12) { updateUI(); uiTimer = 0; }
  } else if (!$('home').hidden) {
    preview.draw(previewRun, { time: now / 1000, preview: true, reduced: reduced() });
  }
  requestAnimationFrame(frame);
}

// Gancho de pruebas manuales: solo en el navegador local, nunca en la aplicación empaquetada.
if (['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) && !globalThis.Capacitor?.isNativePlatform?.()) {
  globalThis.LumenQA = {
    state: () => ({ run, selected, speed, moving, view: arena.view, profile, pending, coach: coach.current(), settings }),
    tick(frames = 60) { for (let i = 0; i < frames && isLive(); i++) { step(run, STEP); for (const event of run.events) onEvent(event); } updateUI(); },
    give(gold) { if (run) { run.gold += gold; updateUI(); } },
  };
}

applySettings();
refreshCheckpoint();
homeUI();
resizeAll();
if (recovered) openModal('<small class="kicker">Aviso</small><h2>Perfil restaurado</h2><p>El guardado anterior estaba dañado. Se conservó una copia aparte y empiezas de cero.</p>');
requestAnimationFrame(frame);
