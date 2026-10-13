import { W, H, CORE, createGame, startGame, stepGame, setAim, chooseUpgrade, getUpgradeOptions, settleGame, retireGame, cleanProfile, buyPermanentUpgrade, upgradeCost, enemyColor } from './engine.mjs';

const canvas = document.querySelector('#arena');
const ctx = canvas.getContext('2d', { alpha: false });
const overlay = document.querySelector('#overlay');
const toastEl = document.querySelector('#toast');
const waveLabel = document.querySelector('#waveLabel');
const scoreLabel = document.querySelector('#scoreLabel');
const patternLabel = document.querySelector('#patternLabel');
const hullLabel = document.querySelector('#hullLabel');
const hullFill = document.querySelector('#hullFill');
const soundButton = document.querySelector('#soundButton');
const pauseButton = document.querySelector('#pauseButton');
const aimHint = document.querySelector('#aimHint');
const STORAGE_KEY = 'pulso-orbital-beta01';

function loadProfile() {
  try { return cleanProfile(JSON.parse(localStorage.getItem(STORAGE_KEY))); }
  catch { return cleanProfile(); }
}
function saveProfile() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(profile)); }
  catch { announce('No se pudo guardar el progreso en este navegador.'); }
}

let profile = loadProfile();
let game = createGame(profile, Date.now());
let paused = false;
let soundOn = false;
let audioCtx;
let pointerActive = false;
let lastPhase = '';
let lastFrame = 0;
let accumulator = 0;
let toastTimer;
let flash = 0;
let shake = 0;
const particles = [];
const analytics = [];
const stars = Array.from({ length: 60 }, (_, i) => ({ x: (i * 149 + 31) % W, y: (i * 227 + 83) % H, size: i % 5 === 0 ? 2 : 1, speed: 0.2 + (i % 4) * 0.12 }));
let layout = { scale: 1, x: 0, y: 0, width: W, height: H, dpr: 1 };

function track(type, data = {}) {
  analytics.push({ type, at: Date.now(), wave: game.wave, score: game.score, ...data });
  if (analytics.length > 200) analytics.shift();
}
window.PulsoOrbitalQA = Object.freeze({ snapshot: () => ({
  phase: game.phase, wave: game.wave, hp: game.hp, score: game.score,
  profile: { ...profile }, paused,
  plan: { pattern: game.wavePlan.pattern, bosses: game.wavePlan.bossCount, count: game.wavePlan.entries.length, bias: game.wavePlan.bias },
  waveStats: { ...game.waveStats }, events: analytics.slice(),
}) });

function announce(message) {
  toastEl.textContent = message;
  toastEl.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('is-visible'), 2500);
}

function tone(freq, duration = 0.08, type = 'sine', volume = 0.035, endFreq = freq) {
  if (!soundOn) return;
  try {
    audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const oscillator = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(freq, audioCtx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), audioCtx.currentTime + duration);
    gain.gain.setValueAtTime(volume, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    oscillator.connect(gain).connect(audioCtx.destination);
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + duration);
  } catch { soundOn = false; updateSoundButton(); }
}

function updateSoundButton() {
  soundButton.textContent = soundOn ? '♫' : '♪';
  soundButton.setAttribute('aria-label', soundOn ? 'Silenciar sonido' : 'Activar sonido');
}

function burst(x, y, color, count = 10, force = 1) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) count = Math.min(3, count);
  for (let i = 0; i < count && particles.length < 150; i++) {
    const a = i * Math.PI * 2 / count + Math.random() * .3;
    const speed = (45 + Math.random() * 120) * force;
    particles.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: .25 + Math.random() * .35, max: .6, size: 2 + Math.random() * 3, color });
  }
}

function consume(events) {
  for (const event of events) {
    switch (event.type) {
      case 'shot': tone(270, .045, 'triangle', .009, 130); break;
      case 'hit': burst(event.x, event.y, '#fff0a4', 4, .55); tone(180, .045, 'square', .016, 85); break;
      case 'destroy': burst(event.x, event.y, enemyColor(event.typeName), event.typeName === 'boss' ? 42 : 10); tone(520, .12, 'triangle', .04, 850); track('enemy_destroyed', { enemy_type: event.typeName }); break;
      case 'boss': announce('JEFE EN CAMINO'); tone(130, .4, 'sawtooth', .055, 70); track('boss_spawned'); break;
      case 'split': burst(event.x, event.y, '#d5bbff', 14); break;
      case 'breach': burst(event.x, event.y, '#ff737a', 14); shake = .23; flash = .2; tone(170, .27, 'sawtooth', .065, 55); track('core_hit', { hp: game.hp }); break;
      case 'wave-clear': burst(CORE.x, CORE.y, '#85ffe0', 30, 1.3); tone(520, .25, 'sine', .05, 950); track('wave_completed'); break;
      case 'upgrade': burst(CORE.x, CORE.y, '#8efcda', 20, 1.1); tone(640, .22, 'sine', .05, 1100); break;
      case 'retreat': tone(440, .2, 'sine', .035, 700); break;
      case 'defeat': tone(220, .48, 'sawtooth', .06, 70); break;
    }
  }
}

function updateHud() {
  waveLabel.textContent = `OLEADA ${game.wave} · ∞`;
  scoreLabel.textContent = `${String(game.score).padStart(4, '0')} PT`;
  patternLabel.textContent = game.wavePlan.label + (game.wavePlan.bossWave ? ' · JEFE' : '');
  hullLabel.textContent = `${game.hp}/${game.maxHp}`;
  hullFill.style.width = `${game.hp / game.maxHp * 100}%`;
  pauseButton.disabled = game.phase !== 'playing';
  aimHint.classList.toggle('is-hidden', game.phase !== 'playing');
}

function menuMarkup() {
  const choices = [
    ['armor', 'ESCUDO', profile.armor, '+1 vida inicial'],
    ['damage', 'CAÑÓN', profile.damageLevel, '+0,22 daño inicial'],
    ['reactor', 'REACTOR', profile.reactorLevel, 'más disparos iniciales'],
  ].map(([kind, label, level, effect]) => {
    const cost = upgradeCost(profile, kind);
    return `<button class="choice" data-action="permanent-${kind}" ${profile.coins < cost ? 'disabled' : ''}><strong>${label} · NIVEL ${level} <span class="choice__icon">${cost} ◈</span></strong><span>${effect}</span></button>`;
  }).join('');
  return `<div class="card"><div class="card__eyebrow">VERSIÓN DE PRUEBA · BETA 0.3.1</div><div class="card__hero" aria-hidden="true">◆</div><h1>PULSO <span>ORBITAL</span></h1><p>Defiende el núcleo sin límite de oleadas. Apunta; el cañón dispara solo. Cada cinco oleadas aparece un jefe.</p><button class="button" data-action="start">INICIAR DEFENSA <span aria-hidden="true">↗</span></button><div class="meta"><span>◈ ${profile.coins} CRISTALES</span><span>MEJOR OLEADA <strong>${profile.bestWave}</strong></span></div><div class="meta"><span>RÉCORD <strong>${profile.best} PT</strong></span><span>INTENTOS <strong>${profile.runs}</strong></span></div><div class="shop-title">MEJORAS PERMANENTES</div><div class="choice-grid">${choices}</div><p class="small">El director adapta la mezcla de enemigos a tus últimas oleadas, con cambios limitados. Ganas cristales por puntos y oleadas completadas; los cobras al caer o retirarte.</p></div>`;
}

const UPGRADE_COPY = {
  damage: ['✦ IMPACTO +1', 'Más daño por proyectil'],
  tempo: ['◌ CADENCIA +19 %', 'Disparas más a menudo'],
  spread: ['⌁ DISPARO ABIERTO', 'Un proyectil más por ráfaga'],
  pierce: ['⇧ PERFORACIÓN', 'Cada proyectil atraviesa un enemigo más'],
  repair: ['✚ REPARAR +2', 'Recupera integridad del núcleo'],
  shield: ['⬡ ESCUDO +1', 'Aumenta vida máxima y actual'],
};

function upgradeMarkup() {
  const s = game.lastWaveSummary;
  const options = getUpgradeOptions(game).map(action => {
    const [label, description] = UPGRADE_COPY[action];
    return `<button class="choice" data-action="${action}"><strong>${label} <span class="choice__icon">↗</span></strong><span>${description}</span></button>`;
  }).join('');
  const report = s ? `${s.kills} enemigos · ${s.breaches} brechas · ${Math.round(s.accuracy * 100)} % impactos` : '';
  return `<div class="card"><div class="card__eyebrow">OLEADA ${game.wave} SUPERADA · ${report}</div><h2>EVOLUCIONA TU DEFENSA</h2><p>Elige una mejora para esta partida. La oleada ${game.wave + 1} se generará según tu desempeño reciente.</p><div class="choice-grid">${options}</div><button class="button button--secondary" data-action="retire">RETIRARME Y COBRAR</button></div>`;
}

function resultMarkup() {
  const retired = game.phase === 'retreat';
  return `<div class="card"><div class="card__eyebrow">${retired ? 'REPLIEGUE SEGURO' : 'NÚCLEO CAÍDO'}</div><h2>OLEADA ${game.wave}</h2><p>${retired ? 'Conservas lo ganado y puedes mejorar tu base.' : 'La próxima partida puede superar este récord.'}</p><div class="result-score">${game.score}<span>PUNTOS</span></div><p>+${game.reward} ◈ cristales · ${game.kills} enemigos detenidos</p><button class="button" data-action="again">OTRO INTENTO <span aria-hidden="true">↗</span></button><button class="button button--secondary" data-action="menu">VER HANGAR</button><p class="small">Tus cristales y mejor oleada permanecen. Las mejoras de esta partida se reinician.</p></div>`;
}

function pauseMarkup() {
  return `<div class="card"><div class="card__eyebrow">DEFENSA EN PAUSA</div><h2>RESPIRA</h2><p>Oleada ${game.wave}. Puedes continuar o retirarte y cobrar los cristales ganados.</p><button class="button" data-action="resume">CONTINUAR</button><button class="button button--secondary" data-action="retire">RETIRARME Y COBRAR</button></div>`;
}

function syncOverlay() {
  const key = paused ? 'paused' : game.phase;
  if (key === lastPhase) return;
  lastPhase = key;
  overlay.hidden = key === 'playing';
  if (overlay.hidden) { overlay.innerHTML = ''; return; }
  overlay.innerHTML = key === 'ready' ? menuMarkup() : key === 'upgrade' ? upgradeMarkup() : key === 'paused' ? pauseMarkup() : resultMarkup();
  overlay.querySelector('button:not(:disabled)')?.focus({ preventScroll: true });
}

function newRun() {
  game = startGame(createGame(profile, Date.now()));
  paused = false;
  accumulator = 0;
  particles.length = 0;
  track('run_started');
  track('wave_generated', { pattern: game.wavePlan.pattern, bosses: 0, bias: 0 });
  lastPhase = '';
  syncOverlay();
  tone(360, .18, 'sine', .045, 720);
}

function completeRun() {
  profile = settleGame(game, profile);
  saveProfile();
  track('run_ended', { result: game.phase, reward: game.reward, duration_seconds: Math.round(game.elapsed) });
}

overlay.addEventListener('click', event => {
  const action = event.target.closest('button')?.dataset.action;
  if (!action) return;
  if (action === 'start' || action === 'again') newRun();
  else if (action.startsWith('permanent-')) {
    const kind = action.slice('permanent-'.length);
    const next = buyPermanentUpgrade(profile, kind);
    if (next.coins !== profile.coins) {
      profile = next; saveProfile(); track('permanent_upgrade', { upgrade: kind });
      lastPhase = ''; syncOverlay(); tone(760, .2, 'sine', .05, 1050);
      announce('MEJORA PERMANENTE ADQUIRIDA');
    }
  } else if (UPGRADE_COPY[action]) {
    if (chooseUpgrade(game, action)) {
      track('upgrade_selected', { upgrade: action });
      track('wave_generated', { pattern: game.wavePlan.pattern, bosses: game.wavePlan.bossCount, bias: game.wavePlan.bias });
      consume(game.events); lastPhase = ''; syncOverlay();
      announce(game.wavePlan.label + ' · ' + game.wavePlan.reason);
    }
  } else if (action === 'resume') { paused = false; accumulator = 0; lastPhase = ''; syncOverlay(); track('resumed'); }
  else if (action === 'retire') {
    paused = false;
    if (retireGame(game)) { completeRun(); lastPhase = ''; syncOverlay(); }
  } else if (action === 'menu') { game = createGame(profile, Date.now()); lastPhase = ''; syncOverlay(); }
});

pauseButton.addEventListener('click', () => {
  if (game.phase !== 'playing') return;
  paused = !paused;
  accumulator = 0;
  lastPhase = '';
  syncOverlay();
  track(paused ? 'paused' : 'resumed');
});
soundButton.addEventListener('click', () => { soundOn = !soundOn; updateSoundButton(); if (soundOn) tone(660, .12, 'sine', .045, 850); });

function aimFromPointer(event) {
  const rect = canvas.getBoundingClientRect();
  const x = (event.clientX - rect.left - layout.x) / layout.scale;
  const y = (event.clientY - rect.top - layout.y) / layout.scale;
  setAim(game, x, y);
}
canvas.addEventListener('pointerdown', event => {
  if (game.phase !== 'playing' || paused) return;
  pointerActive = true;
  canvas.setPointerCapture(event.pointerId);
  aimFromPointer(event);
  track('aim_input', { method: event.pointerType });
});
canvas.addEventListener('pointermove', event => {
  if (game.phase !== 'playing' || paused || (event.pointerType !== 'mouse' && !pointerActive)) return;
  aimFromPointer(event);
});
const endPointer = () => { pointerActive = false; };
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);

window.addEventListener('keydown', event => {
  if (event.key.toLowerCase() === 'p' || event.key === 'Escape') { if (game.phase === 'playing') pauseButton.click(); return; }
  if (event.key.toLowerCase() === 'm') { soundButton.click(); return; }
  if (game.phase !== 'playing' || paused) return;
  const shift = 24;
  if (event.key === 'ArrowLeft') setAim(game, game.aim.x - shift, game.aim.y);
  else if (event.key === 'ArrowRight') setAim(game, game.aim.x + shift, game.aim.y);
  else if (event.key === 'ArrowUp') setAim(game, game.aim.x, game.aim.y - shift);
  else if (event.key === 'ArrowDown') setAim(game, game.aim.x, game.aim.y + shift);
  else return;
  event.preventDefault();
});

function safePause() {
  if (game.phase === 'playing' && !paused) { paused = true; accumulator = 0; lastPhase = ''; syncOverlay(); track('paused', { reason: 'visibility' }); }
}
document.addEventListener('visibilitychange', () => { if (document.hidden) safePause(); });
window.addEventListener('blur', safePause);

function resize() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
  const scale = Math.min(rect.width / W, rect.height / H);
  layout = { scale, x: (rect.width - W * scale) / 2, y: (rect.height - H * scale) / 2, width: rect.width, height: rect.height, dpr };
}
window.addEventListener('resize', resize);
resize();

function roundedRect(x, y, width, height, radius, fill, stroke) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
}

function drawBackdrop(t) {
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0d2133'); bg.addColorStop(.55, '#0b2940'); bg.addColorStop(1, '#071b2c');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(CORE.x, CORE.y, 0, CORE.x, CORE.y, 410);
  glow.addColorStop(0, '#31c0ba22'); glow.addColorStop(1, '#31c0ba00');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#89d9d611'; ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 48) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y <= H; y += 48) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  for (const star of stars) { ctx.fillStyle = `rgba(160,240,236,${.3 + .25 * Math.sin(t * star.speed + star.x)})`; ctx.fillRect(star.x, star.y, star.size, star.size); }
  ctx.strokeStyle = '#73e8cf3b'; ctx.lineWidth = 1;
  for (const r of [116, 210, 320]) { ctx.beginPath(); ctx.arc(CORE.x, CORE.y, r, Math.PI, 2 * Math.PI); ctx.stroke(); }
  ctx.fillStyle = '#4de6d91c'; ctx.fillRect(0, CORE.y + 15, W, 3);
  ctx.fillStyle = '#56d9cf55'; ctx.fillRect(0, CORE.y + 15, W, 1);
}

function drawCore(t) {
  const a = Math.atan2(game.aim.y - CORE.y, game.aim.x - CORE.x);
  ctx.save();
  ctx.translate(CORE.x, CORE.y);
  ctx.shadowColor = game.hp <= 2 ? '#ff777b' : '#4af8d5'; ctx.shadowBlur = 25;
  ctx.fillStyle = '#162f46'; ctx.strokeStyle = '#6ee8d3'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.rotate(a + Math.PI / 2);
  roundedRect(-11, -48, 22, 31, 5, '#a6fff0', '#ffffff');
  roundedRect(-5, -60, 10, 14, 3, '#64e9ce');
  ctx.restore();
  ctx.save(); ctx.translate(CORE.x, CORE.y); ctx.rotate(t * .4);
  ctx.strokeStyle = '#70e5df88'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, 42, -.2, 2.3); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, 42, 2.9, 5.4); ctx.stroke();
  ctx.restore();
  ctx.fillStyle = '#b8fff2'; ctx.beginPath(); ctx.arc(CORE.x, CORE.y, 13 + Math.sin(t * 3) * 2, 0, Math.PI * 2); ctx.fill();
}

function drawEnemy(enemy, t) {
  const r = enemy.radius;
  const color = enemyColor(enemy.type);
  ctx.save(); ctx.translate(enemy.x, enemy.y);
  ctx.rotate(t * (enemy.type === 'boss' ? .5 : enemy.type === 'dart' ? 2.8 : 1.5) + enemy.wobble);
  ctx.shadowColor = color; ctx.shadowBlur = enemy.hit > 0 ? 25 : enemy.type === 'boss' ? 30 : 13;
  ctx.fillStyle = enemy.hit > 0 ? '#ffffff' : color;
  ctx.strokeStyle = '#fff8'; ctx.lineWidth = enemy.type === 'boss' ? 4 : 2;
  const sides = enemy.type === 'boss' ? 8 : enemy.type === 'brute' ? 6 : enemy.type === 'dart' ? 3 : enemy.type === 'swarm' ? 5 : 4;
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = i * Math.PI * 2 / sides;
    const px = Math.cos(a) * r, py = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#172537'; ctx.beginPath(); ctx.arc(0, 0, enemy.type === 'boss' ? 13 : enemy.type === 'brute' ? 8 : 5, 0, Math.PI * 2); ctx.fill();
  if (enemy.type === 'splitter') {
    ctx.strokeStyle = '#f4d8ff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(8, 0); ctx.moveTo(0, -8); ctx.lineTo(0, 8); ctx.stroke();
  }
  if (enemy.trait !== 'normal') {
    ctx.strokeStyle = enemy.trait === 'swift' ? '#72f9f2' : '#ffe694';
    ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, r + 5, 0, Math.PI * 2); ctx.stroke();
  }
  if (enemy.type === 'boss') {
    ctx.strokeStyle = '#ffb3b9'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, r + 10 + Math.sin(t * 4) * 3, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
  if (enemy.maxHp > 1) {
    const width = enemy.type === 'boss' ? 90 : r * 2;
    roundedRect(enemy.x - width / 2, enemy.y - r - 14, width, 4, 2, '#1c3042');
    roundedRect(enemy.x - width / 2, enemy.y - r - 14, width * Math.max(0, enemy.hp) / enemy.maxHp, 4, 2, color);
  }
}

function drawWorld(t) {
  drawBackdrop(t);
  const a = Math.atan2(game.aim.y - CORE.y, game.aim.x - CORE.x);
  ctx.strokeStyle = '#a6ffed57'; ctx.lineWidth = 2; ctx.setLineDash([4, 9]);
  ctx.beginPath(); ctx.moveTo(CORE.x + Math.cos(a) * 48, CORE.y + Math.sin(a) * 48); ctx.lineTo(game.aim.x, game.aim.y); ctx.stroke(); ctx.setLineDash([]);
  for (const bullet of game.bullets) {
    ctx.strokeStyle = '#7affdeaa'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(bullet.x - bullet.vx * .022, bullet.y - bullet.vy * .022); ctx.lineTo(bullet.x, bullet.y); ctx.stroke();
    ctx.fillStyle = '#e7fff2'; ctx.shadowColor = '#86ffe4'; ctx.shadowBlur = 12; ctx.beginPath(); ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
  }
  for (const enemy of game.enemies) drawEnemy(enemy, t);
  drawCore(t);
  ctx.strokeStyle = '#86ffdb'; ctx.lineWidth = 2; ctx.shadowColor = '#60ffe1'; ctx.shadowBlur = 12;
  ctx.beginPath(); ctx.arc(game.aim.x, game.aim.y, 15 + Math.sin(t * 5) * 2, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(game.aim.x - 24, game.aim.y); ctx.lineTo(game.aim.x - 12, game.aim.y); ctx.moveTo(game.aim.x + 12, game.aim.y); ctx.lineTo(game.aim.x + 24, game.aim.y); ctx.moveTo(game.aim.x, game.aim.y - 24); ctx.lineTo(game.aim.x, game.aim.y - 12); ctx.moveTo(game.aim.x, game.aim.y + 12); ctx.lineTo(game.aim.x, game.aim.y + 24); ctx.stroke(); ctx.shadowBlur = 0;
  for (const particle of particles) {
    ctx.globalAlpha = Math.min(1, particle.life / particle.max * 1.6);
    ctx.fillStyle = particle.color;
    ctx.beginPath(); ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  if (flash > 0) { ctx.fillStyle = `rgba(255,105,110,${flash * .65})`; ctx.fillRect(0, 0, W, H); }
}

function render(t) {
  const { dpr, width, height, scale, x, y } = layout;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#071724'; ctx.fillRect(0, 0, width, height);
  ctx.save();
  const displacement = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : shake * 9;
  ctx.translate(x + (Math.random() - .5) * displacement, y + (Math.random() - .5) * displacement);
  ctx.scale(scale, scale);
  drawWorld(t);
  ctx.restore();
}

function frame(timestamp) {
  const dt = Math.min(.05, Math.max(0, (timestamp - lastFrame) / 1000 || 0));
  lastFrame = timestamp;
  if (game.phase === 'playing' && !paused) {
    accumulator += dt;
    let steps = 0;
    while (accumulator >= 1 / 60 && steps++ < 4) {
      stepGame(game, 1 / 60);
      consume(game.events);
      accumulator -= 1 / 60;
      if (game.phase !== 'playing') {
        if (game.phase === 'defeat') completeRun();
        lastPhase = '';
        syncOverlay();
        accumulator = 0;
        break;
      }
    }
  }
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .97; p.vy *= .97; p.life -= dt;
    if (p.life <= 0) particles.splice(i, 1);
  }
  flash = Math.max(0, flash - dt); shake = Math.max(0, shake - dt);
  updateHud(); render(timestamp / 1000); requestAnimationFrame(frame);
}

updateSoundButton();
syncOverlay();
requestAnimationFrame(frame);
