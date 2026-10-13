// Persistencia local con almacenamiento inyectable: perfil (cuarentena si está dañado), ajustes y punto de control.
// Nada aquí lanza: si el almacenamiento falla o no existe, el juego sigue con valores por defecto.
import { PROFILE_KEY, normalizeProfile } from './profile.mjs';

export const KEYS = Object.freeze({
  profile: PROFILE_KEY,
  corrupt: `${PROFILE_KEY}.corrupt`,
  settings: 'lumen.settings.v1',
  run: 'lumen.run.v1',
});
const MAX_RAW = 200_000;

// Ajustes del jugador: booleanos estrictos; cualquier otra cosa vuelve al valor por defecto.
export const DEFAULT_SETTINGS = Object.freeze({ sound: false, reduceFx: false, largeText: false, tutorialDone: false });
export function cleanSettings(value) {
  // Solo cuentan las propiedades propias: una heredada (p. ej. por contaminación de prototipos) no se interpreta.
  const own = key => (value && typeof value === 'object' && Object.hasOwn(value, key) ? value[key] : undefined);
  const flag = key => (typeof own(key) === 'boolean' ? own(key) : DEFAULT_SETTINGS[key]);
  return { sound: flag('sound'), reduceFx: flag('reduceFx'), largeText: flag('largeText'), tutorialDone: flag('tutorialDone') };
}

export function createStore(storage) {
  const read = key => { try { return storage?.getItem(key) ?? null; } catch { return null; } };
  const write = (key, value) => { try { storage.setItem(key, value); return true; } catch { return false; } };
  const remove = key => { try { storage.removeItem(key); return true; } catch { return false; } };

  function parseObject(raw) {
    if (raw === null) return { empty: true };
    if (raw.length > MAX_RAW) return { corrupt: true };
    try {
      const value = JSON.parse(raw);
      if (value === null) return { empty: true };
      return value && typeof value === 'object' && !Array.isArray(value) ? { value } : { corrupt: true };
    } catch { return { corrupt: true }; }
  }

  return {
    // `recovered` avisa de un guardado ilegible: se conserva una copia aparte antes de empezar de cero.
    loadProfile() {
      const raw = read(KEYS.profile);
      const parsed = parseObject(raw);
      if (parsed.corrupt) {
        write(KEYS.corrupt, raw.slice(0, MAX_RAW));
        return { profile: normalizeProfile(null), recovered: true };
      }
      return { profile: normalizeProfile(parsed.value), recovered: false };
    },
    saveProfile(profile) { return write(KEYS.profile, JSON.stringify(normalizeProfile(profile))); },

    loadSettings() { return cleanSettings(parseObject(read(KEYS.settings)).value); },
    saveSettings(settings) { return write(KEYS.settings, JSON.stringify(cleanSettings(settings))); },

    // El motor valida el contenido del punto de control; aquí solo se entrega un objeto o nada.
    loadRun() {
      const parsed = parseObject(read(KEYS.run));
      if (parsed.corrupt) remove(KEYS.run);
      return parsed.value ?? null;
    },
    saveRun(snapshot) { return snapshot ? write(KEYS.run, JSON.stringify(snapshot)) : false; },
    clearRun() { return remove(KEYS.run); },
  };
}

// Si localStorage no existe o su acceso lanza (modo privado, datos bloqueados), se usa memoria durante la sesión.
export function resolveStorage(candidate = () => globalThis.localStorage) {
  try {
    const storage = candidate();
    if (storage) { storage.getItem(KEYS.profile); return storage; }
  } catch { /* se usa la copia en memoria */ }
  const memory = new Map();
  return {
    getItem: key => (memory.has(key) ? memory.get(key) : null),
    setItem: (key, value) => { memory.set(key, String(value)); },
    removeItem: key => { memory.delete(key); },
  };
}
