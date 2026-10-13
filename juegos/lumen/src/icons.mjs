// Iconografía de Lumen: siluetas botánicas y de farolillo sobre una rejilla de 24 × 24, pintadas con `currentColor`
// (y, en algunas, con la variable `--accent` del contexto). Sin imágenes externas, sin degradados.
const ICONS = {
  // Recursos
  lantern: '<path d="M9 2h6v2H9zM8 4h8l2 4v9l-2 3H8l-2-3V8z"/><path d="M12 8c2 2 2 5 0 7-2-2-2-5 0-7z" fill="var(--accent, #16231d)"/><rect x="9" y="20" width="6" height="2"/>',
  life: '<path d="M12 21C5 16 3 12 3 8.6 3 5.9 5 4 7.4 4c1.8 0 3.4 1 4.6 2.8C13.2 5 14.800 4 16.600 4 19 4 21 5.900 21 8.600 21 12 19 16 12 21z"/><path d="M12 8v8M12 12l3-2M12 14l-3-2" stroke="var(--accent, #16231d)" stroke-width="1.600" fill="none" stroke-linecap="round"/>',
  // Controles
  pause: '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
  play: '<path d="M7 4l13 8-13 8z"/>',
  fast: '<path d="M3 5l8 7-8 7zM12 5l8 7-8 7z"/>',
  gear: '<path d="M10 2h4l.6 3 2.100 1.200 2.800-1.100 2 3.500-2.300 2V12l2.300 2-2 3.500-2.800-1.100L14.600 18l-.6 3h-4l-.6-3-2.100-1.200-2.800 1.100-2-3.500 2.300-2V10l-2.300-2 2-3.500 2.800 1.100L9.400 5z"/><circle cx="12" cy="12" r="3" fill="var(--accent, #16231d)"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9 9.500c0-2 1.400-3 3-3s3 1 3 2.600c0 2-3 2.300-3 4.400" stroke="var(--accent, #16231d)" stroke-width="2" fill="none" stroke-linecap="round"/><circle cx="12" cy="17.800" r="1.200" fill="var(--accent, #16231d)"/>',
  'sound-on': '<path d="M3 9h4l5-4v14l-5-4H3z"/><path d="M15 8c2 2 2 6 0 8M18 5c3.600 3.500 3.600 10.500 0 14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>',
  'sound-off': '<path d="M3 9h4l5-4v14l-5-4H3z"/><path d="M16 9l6 6M22 9l-6 6" stroke="currentColor" stroke-width="2.200" fill="none" stroke-linecap="round"/>',
  back: '<path d="M14 4l-8 8 8 8 2-2-6-6 6-6z"/>',
  move: '<path d="M12 2l4 4h-3v5h5V8l4 4-4 4v-3h-5v5h3l-4 4-4-4h3v-5H6v3l-4-4 4-4v3h5V6H8z"/>',
  pulse: '<circle cx="12" cy="12" r="3"/><path d="M12 3a9 9 0 0 1 9 9M12 21a9 9 0 0 1-9-9M5.600 5.600a9 9 0 0 1 12.800 0M18.400 18.400a9 9 0 0 1-12.800 0" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>',
  close: '<path d="M5 5l14 14M19 5L5 19" stroke="currentColor" stroke-width="2.600" fill="none" stroke-linecap="round"/>',
  // Defensas
  thorn: '<path d="M12 21c-.5-5 0-9 1-13" stroke="var(--accent, #16231d)" stroke-width="2.200" fill="none" stroke-linecap="round"/><path d="M13 3l4 5-4 5-4-5z"/><path d="M12.500 15l-4-2.500M12.800 18l4-2.500" stroke="var(--accent, #16231d)" stroke-width="1.800" fill="none" stroke-linecap="round"/>',
  frost: '<g><ellipse cx="12" cy="6" rx="2.400" ry="4.200"/><ellipse cx="12" cy="18" rx="2.400" ry="4.200"/><ellipse cx="6" cy="9" rx="2.400" ry="4.200" transform="rotate(60 6 9)"/><ellipse cx="18" cy="15" rx="2.400" ry="4.200" transform="rotate(60 18 15)"/><ellipse cx="6" cy="15" rx="2.400" ry="4.200" transform="rotate(-60 6 15)"/><ellipse cx="18" cy="9" rx="2.400" ry="4.200" transform="rotate(-60 18 9)"/><circle cx="12" cy="12" r="2.600" fill="var(--accent, #16231d)"/></g>',
  spore: '<path d="M3 12a9 8 0 0 1 18 0z"/><path d="M9.500 12h5v7a2.500 2 0 0 1-5 0z" fill="var(--accent, #16231d)"/><circle cx="8" cy="9" r="1.400" fill="var(--accent, #16231d)"/><circle cx="14" cy="7.500" r="1.100" fill="var(--accent, #16231d)"/><circle cx="16.500" cy="10.200" r="1" fill="var(--accent, #16231d)"/>',
  // Adorno: ramita que separa secciones
  sprig: '<path d="M2 12h20" stroke="currentColor" stroke-width="1.400" fill="none"/><path d="M12 12c-1-3-1-5 0-8 1 3 1 5 0 8zM12 12c-3-1-5-1-8 1 3 1 5 1 8-1zM12 12c3-1 5-1 8 1-3 1-5 1-8-1z"/>',
};

export const ICON_NAMES = Object.freeze(Object.keys(ICONS));

export function icon(name, { size = 24, className = 'icon' } = {}) {
  const body = ICONS[name];
  if (!body) return '';
  const px = Math.max(8, Math.min(96, Math.round(Number(size) || 24)));
  return `<svg class="${className}" width="${px}" height="${px}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">${body}</svg>`;
}
