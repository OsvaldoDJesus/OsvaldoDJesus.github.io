// Iconografía del juego: formas geométricas sencillas en una rejilla de 24 × 24, pintadas con `currentColor`
// para heredar el color del contexto (marfil, naranja, óxido). Sin degradados ni sombras.
const ICONS = {
  // Mejoras de partida
  damage: '<path d="M12 1 14.6 8.4 22 7 16.6 12 22 17 14.6 15.6 12 23 9.4 15.6 2 17 7.4 12 2 7 9.4 8.4Z"/>',
  tempo: '<path d="M2 5 9 12 2 19V15L5.4 12 2 9ZM10 5 17 12 10 19V15L13.4 12 10 9ZM18 5 22 12 18 19V15L19.6 12 18 9Z"/>',
  spread: '<path d="M11 21V13L3 5 5 3 12 10 19 3 21 5 13 13V21Z"/><circle cx="12" cy="3" r="2"/>',
  pierce: '<path d="M3 10H15V5L23 12 15 19V14H3Z"/><rect x="9" y="2" width="3" height="20"/>',
  repair: '<path d="M9 2H15V9H22V15H15V22H9V15H2V9H9Z"/>',
  shield: '<path d="M12 1 21 5V12C21 17.5 17.5 21 12 23 6.5 21 3 17.5 3 12V5Z"/>',
  // Taller (mejoras permanentes)
  armor: '<path d="M12 1 21 5V12C21 17.5 17.5 21 12 23 6.5 21 3 17.5 3 12V5Z"/><path d="M12 6V18M7 11H17" stroke="var(--icon-cut, #1c1915)" stroke-width="2.2" fill="none"/>',
  cannon: '<path d="M9 2H15V14H9Z"/><path d="M5 14H19V22H5Z"/>',
  reactor: '<path d="M13 1 4 13H10L9 23 20 10H13.5Z"/>',
  // Interfaz
  crystal: '<path d="M12 1 20 9 12 23 4 9Z"/>',
  gear: '<path d="M10 1H14L14.6 4.2 17 5.4 19.8 3.6 22.4 6.2 20.6 9 21.8 11.4 23 12V14L21.8 14.6 20.6 17 22.4 19.8 19.8 22.4 17 20.6 14.6 21.8 14 23H10L9.4 21.8 7 20.6 4.2 22.4 1.6 19.8 3.4 17 2.2 14.6 1 14V10L2.2 9.4 3.4 7 1.6 4.2 4.2 1.6 7 3.4 9.4 2.2Z"/><circle cx="12" cy="12" r="3.4" fill="var(--icon-cut, #1c1915)"/>',
  pause: '<rect x="5" y="3" width="5" height="18"/><rect x="14" y="3" width="5" height="18"/>',
  play: '<path d="M6 3 21 12 6 21Z"/>',
  'sound-on': '<path d="M2 9H7L13 4V20L7 15H2Z"/><path d="M16 8C18 10 18 14 16 16M19 5C22.4 8.6 22.4 15.4 19 19" stroke="currentColor" stroke-width="2.2" fill="none"/>',
  'sound-off': '<path d="M2 9H7L13 4V20L7 15H2Z"/><path d="M16 9 22 15M22 9 16 15" stroke="currentColor" stroke-width="2.4" fill="none"/>',
  back: '<path d="M14 3 5 12 14 21 16.5 18.5 10 12 16.5 5.5Z"/>',
  aim: '<path d="M2 2H9V4H4V9H2ZM22 2V9H20V4H15V2ZM2 22V15H4V20H9V22ZM22 22H15V20H20V15H22Z"/><rect x="10" y="10" width="4" height="4"/>',
  warning: '<path d="M12 2 23 21H1Z"/><path d="M12 9V15M12 17.5V19" stroke="var(--icon-cut, #1c1915)" stroke-width="2.4" fill="none"/>',
};

export const ICON_NAMES = Object.freeze(Object.keys(ICONS));

export function icon(name, { size = 24, className = 'icon' } = {}) {
  const body = ICONS[name];
  if (!body) return '';
  const px = Math.max(8, Math.min(96, Math.round(Number(size) || 24)));
  return `<svg class="${className}" width="${px}" height="${px}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">${body}</svg>`;
}
