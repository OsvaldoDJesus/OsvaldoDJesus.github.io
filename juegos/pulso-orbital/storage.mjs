import { cleanProfile } from './engine.mjs';

// Persistencia local con almacenamiento inyectable (localStorage en el juego, un doble en las pruebas).
// Nada aquí lanza: si el almacenamiento falla o no existe, el juego sigue con valores por defecto.
export const KEYS = Object.freeze({
  profile: 'pulso-orbital-beta01',
  corrupt: 'pulso-orbital-beta01.corrupt',
  settings: 'pulso-orbital-settings',
  run: 'pulso-orbital-run',
});
const MAX_RAW_BYTES = 200_000;

// Ajustes del jugador. Cada valor debe ser un booleano estricto; cualquier otra cosa vuelve al valor por defecto,
// de modo que los guardados de versiones anteriores (solo `sound`) siguen siendo válidos.
export const DEFAULT_SETTINGS = Object.freeze({ sound: false, haptics: true, reduceFx: false, tutorialDone: false });

export function cleanSettings(value) {
  // Solo cuentan las propiedades propias: una heredada (p. ej. por contaminación de prototipos) no se interpreta.
  const own = (key) => (value && typeof value === 'object' && Object.hasOwn(value, key) ? value[key] : undefined);
  const flag = (key) => (typeof own(key) === 'boolean' ? own(key) : DEFAULT_SETTINGS[key]);
  return { sound: flag('sound'), haptics: flag('haptics'), reduceFx: flag('reduceFx'), tutorialDone: flag('tutorialDone') };
}

export function createStore(storage) {
  const read = key => { try { return storage?.getItem(key) ?? null; } catch { return null; } };
  const write = (key, value) => { try { storage.setItem(key, value); return true; } catch { return false; } };
  const remove = key => { try { storage.removeItem(key); return true; } catch { return false; } };

  function parseObject(raw) {
    if (raw === null) return { empty: true };
    if (raw.length > MAX_RAW_BYTES) return { corrupt: true };
    try {
      const value = JSON.parse(raw);
      if (value === null) return { empty: true };
      return value && typeof value === 'object' && !Array.isArray(value) ? { value } : { corrupt: true };
    } catch { return { corrupt: true }; }
  }

  return {
    // `recovered` avisa de que había un guardado ilegible: se conserva una copia aparte antes de sobrescribirlo.
    loadProfile() {
      const raw = read(KEYS.profile);
      const parsed = parseObject(raw);
      if (parsed.corrupt) {
        write(KEYS.corrupt, raw.slice(0, MAX_RAW_BYTES));
        return { profile: cleanProfile(), recovered: true };
      }
      return { profile: cleanProfile(parsed.value), recovered: false };
    },
    saveProfile(profile) { return write(KEYS.profile, JSON.stringify(cleanProfile(profile))); },

    loadSettings() { return cleanSettings(parseObject(read(KEYS.settings)).value); },
    saveSettings(settings) { return write(KEYS.settings, JSON.stringify(cleanSettings(settings))); },

    // El motor valida el contenido; aquí solo se entrega un objeto o nada.
    loadRun() {
      const parsed = parseObject(read(KEYS.run));
      if (parsed.corrupt) remove(KEYS.run);
      return parsed.value ?? null;
    },
    saveRun(snapshot) { return snapshot ? write(KEYS.run, JSON.stringify(snapshot)) : false; },
    clearRun() { return remove(KEYS.run); },
  };
}

// Almacenamiento seguro: si localStorage no existe o su acceso lanza, usa memoria durante la sesión.
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
