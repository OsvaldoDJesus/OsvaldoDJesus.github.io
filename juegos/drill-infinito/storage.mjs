import { newStore, validateStore } from './engine.mjs';
export const SAVE_KEY = 'drill-infinito-v3';
export const LEGACY_SAVE_KEY = 'drill-infinito-v2';
export const MAX_SAVE_BYTES = 100_000;

export function parseSave(text) {
  if (typeof text !== 'string' || text.length > MAX_SAVE_BYTES) throw new TypeError('El respaldo es demasiado grande.');
  return validateStore(JSON.parse(text));
}

export function load(storage) {
  try {
    const current = storage.getItem(SAVE_KEY);
    const raw = current ?? storage.getItem(LEGACY_SAVE_KEY);
    if (raw === null) return { store: newStore(), warning: null, corrupt: false };
    return { store: parseSave(raw), warning: null, corrupt: false, migrated: current === null };
  } catch {
    // Keep the original key intact until the player explicitly starts a new save.
    return { store: newStore(), warning: 'No pudimos leer tu progreso. Descarga el original o importa un respaldo en Ajustes. Tu guardado original se conserva.', corrupt: true };
  }
}

export function save(storage, store) {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(store));
    return { ok: true };
  } catch {
    return { ok: false, warning: 'El navegador no pudo guardar. Tu partida sigue abierta; descarga un respaldo desde Ajustes antes de cerrar.' };
  }
}
