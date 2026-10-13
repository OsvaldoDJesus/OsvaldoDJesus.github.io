// Pantallas del juego como texto HTML puro. No toca el DOM ni el motor: recibe datos y devuelve marcado, de modo
// que cada pantalla se puede probar en Node. Todo texto dinámico pasa por `esc`/`num`.
import { upgradeCost } from './engine.mjs';
import { icon } from './icons.mjs';
import { formatDisplay, sevenSegmentSvg, integrityModel } from './segments.mjs';
import { wordmarkSvg } from './wordmark.mjs';

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = value => String(value).replace(/[&<>"']/g, ch => ESCAPES[ch]);
const num = value => String(Math.max(0, Math.floor(Number.isFinite(value) ? value : 0)));
const pct = ratio => `${Math.round(Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0)) * 100)} %`;

export const UPGRADES = Object.freeze({
  damage: { icon: 'damage', title: 'IMPACTO +1', text: 'Más daño por proyectil' },
  tempo: { icon: 'tempo', title: 'CADENCIA +19 %', text: 'Disparas más a menudo' },
  spread: { icon: 'spread', title: 'DISPARO ABIERTO', text: 'Un proyectil más por ráfaga' },
  pierce: { icon: 'pierce', title: 'PERFORACIÓN', text: 'Cada proyectil atraviesa un enemigo más' },
  repair: { icon: 'repair', title: 'REPARAR +2', text: 'Recupera integridad del núcleo' },
  shield: { icon: 'shield', title: 'ESCUDO +1', text: 'Aumenta la vida máxima y la actual' },
});

export const SHOP = Object.freeze([
  { kind: 'armor', icon: 'armor', title: 'ESCUDO', text: '+1 vida inicial' },
  { kind: 'damage', icon: 'cannon', title: 'CAÑÓN', text: '+0,22 de daño inicial' },
  { kind: 'reactor', icon: 'reactor', title: 'REACTOR', text: 'Dispara más rápido desde el inicio' },
]);

// Acciones fijas que pueden emitir los botones (las mejoras y las compras del taller se derivan de UPGRADES y SHOP).
// main.mjs debe tener un manejador para cada una: lo comprueba al arrancar y tests/ui.test.mjs.
export const SCREEN_ACTIONS = Object.freeze([
  'start', 'continue', 'again', 'menu', 'retire', 'resume',
  'settings-open', 'settings-close', 'toggle-sound', 'toggle-haptics', 'toggle-reducefx', 'replay-tutorial',
]);

// Qué pantalla corresponde al estado actual. Ajustes y pausa se superponen a la partida; el resto sigue a la fase.
export function screenFor({ phase, paused = false, settingsOpen = false } = {}) {
  if (settingsOpen) return 'settings';
  if (phase === 'playing') return paused ? 'paused' : 'playing';
  if (phase === 'upgrade') return 'upgrade';
  if (phase === 'defeat' || phase === 'retreat') return 'results';
  return 'menu';
}

const button = (action, label, { kind = 'primary', iconName = '', disabled = false, sub = '' } = {}) =>
  `<button type="button" class="btn btn--${kind}" data-action="${esc(action)}"${disabled ? ' disabled' : ''}>` +
  `${iconName ? icon(iconName, { size: 20 }) : ''}<span class="btn__label">${label}</span>${sub ? `<span class="btn__sub">${sub}</span>` : ''}</button>`;

const crystals = (value, size = 14) => `<span class="gem">${icon('crystal', { size })}${num(value)}</span>`;

export function menuMarkup({ profile, pendingRun = null, version = '' } = {}) {
  const resumeWave = pendingRun ? (pendingRun.phase === 'upgrade' ? pendingRun.wave + 1 : pendingRun.wave) : 0;
  const actions = pendingRun
    ? button('continue', `Continuar · oleada ${num(resumeWave)}`, { iconName: 'play' }) +
      button('start', 'Nueva partida', { kind: 'secondary' }) +
      '<p class="note">Una partida nueva descarta la partida guardada.</p>'
    : button('start', 'Jugar', { iconName: 'play' });
  const rows = SHOP.map(item => {
    const level = { armor: profile.armor, damage: profile.damageLevel, reactor: profile.reactorLevel }[item.kind];
    const cost = upgradeCost(profile, item.kind);
    const affordable = Number.isFinite(cost) && profile.coins >= cost;
    return `<li><button type="button" class="shop__row${affordable ? ' is-affordable' : ''}" data-action="permanent-${item.kind}"${affordable ? '' : ' disabled'}>` +
      `<span class="shop__icon">${icon(item.icon, { size: 28 })}</span>` +
      `<span class="shop__main"><strong>${item.title}</strong><small>${item.text}</small></span>` +
      `<span class="shop__level"><em>NIV ${num(level)}</em><b>${Number.isFinite(cost) ? crystals(cost) : 'MÁX'}</b></span></button></li>`;
  }).join('');
  return `<section class="sheet sheet--menu" aria-labelledby="menu-title">` +
    `<h1 id="menu-title" class="sr-only">Pulso Orbital</h1>` +
    `<div class="marquee">${wordmarkSvg()}<p class="tagline">Apunta. El cañón dispara solo. Un jefe cada cinco oleadas.</p></div>` +
    `<div class="actions">${actions}</div>` +
    `<div class="plate plate--board"><h2 class="plate__title">Tabla de marcas</h2>` +
    `<dl class="board"><div class="board__main"><dt>Récord</dt><dd>${sevenSegmentSvg(formatDisplay(profile.best, 6), { className: 'seg seg--sm', label: `Récord ${num(profile.best)} puntos` })}</dd></div>` +
    `<div><dt>Mejor oleada</dt><dd>${num(profile.bestWave)}</dd></div><div><dt>Intentos</dt><dd>${num(profile.runs)}</dd></div></dl></div>` +
    `<div class="plate plate--shop"><h2 class="plate__title">Taller <span class="plate__aside">${crystals(profile.coins, 16)}</span></h2><ul class="shop">${rows}</ul></div>` +
    `<footer class="foot">${button('settings-open', 'Ajustes', { kind: 'ghost', iconName: 'gear' })}<span class="version">v${esc(version)}</span></footer></section>`;
}

export function upgradeMarkup({ wave, options = [], summary = null, rewardPreview = 0 } = {}) {
  const cards = options.filter(key => Object.hasOwn(UPGRADES, key)).map(key => {
    const upgrade = UPGRADES[key];
    return `<li><button type="button" class="card" data-action="${key}"><span class="card__icon">${icon(upgrade.icon, { size: 30 })}</span>` +
      `<span class="card__text"><strong>${upgrade.title}</strong><small>${upgrade.text}</small></span>` +
      `<span class="card__go">${icon('play', { size: 14 })}</span></button></li>`;
  }).join('');
  const report = summary
    ? `<dl class="report"><div><dt>Bajas</dt><dd>${num(summary.kills)}</dd></div><div><dt>Brechas</dt><dd>${num(summary.breaches)}</dd></div><div><dt>Precisión</dt><dd>${pct(summary.accuracy)}</dd></div></dl>`
    : '';
  return `<section class="sheet sheet--upgrade" aria-labelledby="up-title">` +
    `<div class="stamp">Oleada ${num(wave)} superada</div><h2 id="up-title">Elige una mejora</h2>` +
    `<p class="note">Dura solo esta partida. La siguiente oleada se adapta a cómo jugaste.</p>${report}` +
    `<ul class="cards">${cards}</ul>` +
    button('retire', 'Retirarme y cobrar', { kind: 'ghost', sub: crystals(rewardPreview) }) + `</section>`;
}

export function pauseMarkup({ wave, score = 0, rewardPreview = 0 } = {}) {
  return `<section class="sheet sheet--pause" aria-labelledby="pause-title">` +
    `<div class="stamp stamp--pause">Pausa</div><h2 id="pause-title" class="sr-only">Juego en pausa</h2>` +
    `<p class="note">Oleada ${num(wave)} · ${num(score)} puntos</p>` +
    button('resume', 'Continuar', { iconName: 'play' }) + button('settings-open', 'Ajustes', { kind: 'secondary', iconName: 'gear' }) +
    button('retire', 'Retirarme y cobrar', { kind: 'ghost', sub: crystals(rewardPreview) }) + `</section>`;
}

export function resultsMarkup(results) {
  const retired = results.phase === 'retreat';
  const verdict = results.newRecord
    ? '<div class="ribbon" role="status">Nuevo récord</div>'
    : results.previousBest > 0 ? `<p class="gap">A ${num(results.gap)} puntos de tu récord</p>` : '';
  const rows = [
    ['Puntos base', num(results.baseScore)],
    ['Bono de combo', `+${num(results.bonus)}`],
    ['Mejor combo', `×${num(results.maxMult)}`],
    ['Precisión', pct(results.accuracy)],
    ['Oleada', num(results.wave)],
    ['Bajas · brechas', `${num(results.kills)} · ${num(results.breaches)}`],
  ].map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('');
  return `<section class="sheet sheet--results" aria-labelledby="res-title">` +
    `<div class="stamp ${retired ? 'stamp--ok' : 'stamp--bad'}">${retired ? 'Repliegue seguro' : 'Núcleo caído'}</div>` +
    `<h2 id="res-title" class="sr-only">Resultados de la partida</h2>` +
    `<div class="plate plate--final"><small>Puntuación</small>${sevenSegmentSvg(formatDisplay(results.score, 6), { className: 'seg seg--lg', label: `${num(results.score)} puntos` })}${verdict}</div>` +
    `<dl class="ticket">${rows}</dl>` +
    `<p class="payout">Cristales ganados <b>${crystals(results.reward, 18)}</b></p>` +
    button('again', 'Otra vez', { iconName: 'play' }) + button('menu', 'Taller y marcas', { kind: 'secondary' }) + `</section>`;
}

export function settingsMarkup({ settings, hapticsAvailable = true } = {}) {
  const row = (action, label, checked, { disabled = false, note = '' } = {}) =>
    `<li><button type="button" class="switch" role="switch" aria-checked="${checked ? 'true' : 'false'}" data-action="${action}"${disabled ? ' disabled' : ''}>` +
    `<span class="switch__label">${label}${note ? `<small>${note}</small>` : ''}</span><i class="switch__knob" aria-hidden="true"></i></button></li>`;
  return `<section class="sheet sheet--settings" aria-labelledby="set-title"><div class="stamp">Ajustes</div><h2 id="set-title" class="sr-only">Ajustes</h2>` +
    `<ul class="switches">${row('toggle-sound', 'Sonido', settings.sound)}` +
    row('toggle-haptics', 'Vibración', settings.haptics && hapticsAvailable, { disabled: !hapticsAvailable, note: hapticsAvailable ? '' : 'No disponible en este dispositivo' }) +
    row('toggle-reducefx', 'Efectos reducidos', settings.reduceFx, { note: 'Menos sacudidas y partículas' }) + `</ul>` +
    button('replay-tutorial', 'Ver tutorial', { kind: 'secondary' }) + button('settings-close', 'Volver', { iconName: 'back' }) + `</section>`;
}

export function overlayMarkup(screen, context) {
  switch (screen) {
    case 'menu': return menuMarkup(context);
    case 'upgrade': return upgradeMarkup(context);
    case 'paused': return pauseMarkup(context);
    case 'results': return resultsMarkup(context.results);
    case 'settings': return settingsMarkup(context);
    default: return '';
  }
}

// Integridad del núcleo para el HUD: celdas macizas (o barra segmentada si hay mucha vida).
export function integrityMarkup(hp, maxHp) {
  const model = integrityModel(hp, maxHp);
  const label = `Integridad del núcleo ${model.hp} de ${model.max}`;
  if (model.mode === 'cells') {
    return { low: model.low, html: `<span class="cells" role="img" aria-label="${label}">${model.cells.map(on => `<i class="cell${on ? ' is-on' : ''}"></i>`).join('')}</span>` };
  }
  return { low: model.low, html: `<span class="meter" role="img" aria-label="${label}"><i style="width:${(model.ratio * 100).toFixed(1)}%"></i></span><b class="meter__text">${model.hp}/${model.max}</b>` };
}

export function bannerMarkup({ wave, label, boss = false, bossIn = 0 } = {}) {
  const tag = boss ? '<b class="banner__tag">¡Jefe!</b>' : bossIn > 0 ? `<b class="banner__tag banner__tag--dim">Jefe en ${num(bossIn)}</b>` : '';
  return `<div class="banner__plate${boss ? ' is-boss' : ''}"><small>Oleada</small><strong>${num(wave)}</strong><span>${esc(label)}</span>${tag}</div>`;
}
