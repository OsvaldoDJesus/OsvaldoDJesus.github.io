// Contenidos de la interfaz de Lumen como texto HTML puro (diálogos, carteles, paquetes de semillas). No toca el DOM
// ni el motor, así que se prueba en Node. Nada de atributos `style`: la política de contenido del juego los bloquea.
import { icon } from './icons.mjs';

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = value => String(value).replace(/[&<>"']/g, ch => ESCAPES[ch]);
export const num = value => String(Math.max(0, Math.floor(Number.isFinite(value) ? value : 0)));

// Acciones fijas que pueden emitir los botones de los diálogos. app.mjs debe tener un manejador para cada una.
export const DIALOG_ACTIONS = Object.freeze([
  'close', 'toggle-sound', 'toggle-reducefx', 'toggle-largetext', 'replay-tutorial', 'confirm-retire',
]);

const sprig = `<span class="sprig" aria-hidden="true">${icon('sprig', { size: 28 })}</span>`;

export function helpMarkup() {
  return `<small class="kicker">Guía del claro</small><h2>Cada luz cuenta</h2>${sprig}` +
    `<ol class="steps"><li>Toca una <strong>parcela</strong> y planta una defensa con tu luz.</li>` +
    `<li><strong>Aguja</strong> ataca rápido, <strong>Rocío</strong> ralentiza y <strong>Espora</strong> daña a los grupos.</li>` +
    `<li>Comienza la oleada: ganas luz al vencer invasores y al completarla.</li>` +
    `<li>Toca el suelo para mover a <strong>Lyra</strong> y usa su pulso contra los que se acercan.</li>` +
    `<li>Protege la semilla durante 12 oleadas. Las semillas eternas que ganes mejoran tus próximas expediciones.</li></ol>` +
    `<p class="note">Teclado: 1–9 parcelas · A, R, E construir · flechas mover a Lyra · Q pulso · Espacio oleada · Esc pausa.</p>` +
    `<p class="note">El perfil se guarda al terminar y al comprar. Al superar cada oleada se guarda un punto de control: si cierras la partida, podrás continuarla.</p>`;
}

export function settingsMarkup({ settings }) {
  const row = (action, label, hint, checked) =>
    `<li><button type="button" class="switch" role="switch" aria-checked="${checked ? 'true' : 'false'}" data-action="${action}">` +
    `<span class="switch__label">${label}<small>${hint}</small></span><i class="switch__knob" aria-hidden="true"></i></button></li>`;
  return `<small class="kicker">Ajustes</small><h2>Tu claro</h2>${sprig}` +
    `<ul class="switches">${row('toggle-sound', 'Sonido', 'Notas suaves al jugar', settings.sound)}` +
    row('toggle-reducefx', 'Efectos reducidos', 'Sin sacudidas, destellos ni brumas', settings.reduceFx) +
    row('toggle-largetext', 'Texto grande', 'Aumenta el tamaño de la letra', settings.largeText) + `</ul>` +
    `<button type="button" class="btn btn--paper" data-action="replay-tutorial">Ver el tutorial otra vez</button>`;
}

export function retireMarkup() {
  return `<small class="kicker">Volver al refugio</small><h2>¿Terminar la expedición?</h2>${sprig}` +
    `<p>Conservarás las semillas de las oleadas completadas. Esta expedición terminará.</p>` +
    `<button type="button" class="btn btn--paper" data-action="confirm-retire">Terminar expedición</button>`;
}

export function resultsMarkup({ phase, completed, kills, reward, newBest = false, saveFailed = false }) {
  const won = phase === 'won';
  const title = won ? 'El bosque vuelve a respirar.' : phase === 'retired' ? 'De vuelta al refugio.' : 'La luz volverá a crecer.';
  const hint = phase === 'lost'
    ? 'Combina Rocío y Espora cerca de las curvas y mejora tus defensas antes del Devoraluz.'
    : won ? 'Has protegido la semilla ancestral y derrotado al Devoraluz.' : 'Las semillas corresponden a las oleadas completadas.';
  return `<small class="kicker">Expedición ${won ? 'completada' : 'finalizada'}</small><h2>${esc(title)}</h2>${sprig}` +
    `<div class="result"><b>${num(completed)}</b><span> / 12 oleadas</span></div>` +
    (newBest ? '<p class="stamp" role="status">Mejor expedición</p>' : '') +
    `<dl class="ticket"><div><dt>Invasores detenidos</dt><dd>${num(kills)}</dd></div><div><dt>Semillas eternas</dt><dd>+${num(reward)}</dd></div></dl>` +
    `<p class="note">${esc(hint)}</p>` +
    (saveFailed ? '<p class="note warn">No se pudo guardar el perfil: el progreso solo está disponible en esta sesión.</p>' : '');
}

export function bannerMarkup({ wave, boss = false } = {}) {
  return `<div class="banner__plate${boss ? ' is-boss' : ''}"><small>${boss ? 'Oleada final' : 'Oleada'}</small><strong>${num(wave)}</strong>` +
    `<span>${boss ? 'El Devoraluz se acerca' : 'La niebla avanza'}</span></div>`;
}

export function pipsMarkup(wave, completed, total = 12) {
  const dots = Array.from({ length: total }, (_, i) => `<i class="pip${i < completed ? ' is-done' : i === wave - 1 ? ' is-now' : ''}"></i>`).join('');
  return `<span class="pips" role="img" aria-label="Oleada ${num(wave)} de ${total}, ${num(completed)} completadas">${dots}</span>`;
}

export function packetMarkup(type, def) {
  return `<button type="button" class="packet packet--${esc(type)}" data-tower="${esc(type)}" id="build-${esc(type)}" title="${esc(def.description)}">` +
    `<span class="packet__icon">${icon(type, { size: 34 })}</span>` +
    `<span class="packet__text"><strong>${esc(def.short)}</strong><small>${icon('lantern', { size: 14 })}${num(def.cost)}</small></span></button>`;
}

// Velo de pausa dentro del campo: reanudar, ajustes, guía y volver al refugio. Cada botón emite una acción de VEIL_ACTIONS.
export const VEIL_ACTIONS = Object.freeze(['resume', 'settings', 'help', 'retire']);
export function veilMarkup() {
  return `<small class="kicker">En pausa</small><strong>El claro espera</strong>` +
    `<button type="button" class="btn btn--lantern" data-veil="resume">${icon('play', { size: 20 })}Reanudar</button>` +
    `<button type="button" class="btn btn--paper" data-veil="settings">${icon('gear', { size: 20 })}Ajustes</button>` +
    `<button type="button" class="btn btn--paper" data-veil="help">${icon('help', { size: 20 })}Cómo jugar</button>` +
    `<button type="button" class="btn btn--ghost" data-veil="retire">${icon('back', { size: 20 })}Volver al refugio</button>`;
}

export function coachMarkup(text) {
  return `<div class="coach__plate">${esc(text)}</div>`;
}
