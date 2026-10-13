// Audio sintetizado y vibración, en un único servicio. No hay archivos de sonido: cada efecto es una receta de
// osciladores y ruido percusivo, de timbre seco de máquina recreativa. Nada aquí lanza: si el dispositivo no
// admite audio o vibración, el juego sigue en silencio. Se prueba en Node con un contexto de audio falso.
const SFX = {
  shot: { priority: 0, voices: [{ type: 'square', f0: 520, f1: 260, dur: 0.04, gain: 0.011 }] },
  hit: { priority: 0, voices: [{ type: 'triangle', f0: 300, f1: 170, dur: 0.045, gain: 0.02 }] },
  destroy: { priority: 1, voices: [{ type: 'noise', dur: 0.09, gain: 0.05, filter: ['bandpass', 1100] }, { type: 'square', f0: 170, f1: 60, dur: 0.12, gain: 0.04 }] },
  bossDestroy: { priority: 2, haptic: 'medium', voices: [{ type: 'noise', dur: 0.3, gain: 0.08, filter: ['lowpass', 900] }, { type: 'sawtooth', f0: 130, f1: 38, dur: 0.38, gain: 0.07 }] },
  breach: { priority: 2, haptic: 'heavy', voices: [{ type: 'sawtooth', f0: 200, f1: 70, dur: 0.28, gain: 0.07 }, { type: 'square', f0: 110, f1: 80, dur: 0.18, gain: 0.05, delay: 0.05 }] },
  waveClear: { priority: 2, haptic: 'success', voices: [392, 523, 659].map((f0, i) => ({ type: 'square', f0, f1: f0, dur: 0.09, gain: 0.04, delay: i * 0.09 })) },
  upgrade: { priority: 1, haptic: 'light', voices: [{ type: 'square', f0: 880, f1: 1320, dur: 0.06, gain: 0.04 }, { type: 'square', f0: 660, f1: 660, dur: 0.05, gain: 0.035, delay: 0.06 }] },
  boss: { priority: 2, voices: [{ type: 'sawtooth', f0: 110, f1: 80, dur: 0.45, gain: 0.06 }, { type: 'sawtooth', f0: 165, f1: 120, dur: 0.45, gain: 0.04 }] },
  combo: { priority: 1, haptic: 'light', voices: [{ type: 'triangle', f0: 520, f1: 900, dur: 0.11, gain: 0.05 }] },
  comboBreak: { priority: 1, voices: [{ type: 'noise', dur: 0.08, gain: 0.03, filter: ['bandpass', 600] }, { type: 'triangle', f0: 300, f1: 150, dur: 0.12, gain: 0.035 }] },
  ui: { priority: 1, voices: [{ type: 'square', f0: 700, f1: 700, dur: 0.03, gain: 0.02 }] },
  start: { priority: 2, voices: [{ type: 'square', f0: 392, f1: 523, dur: 0.1, gain: 0.04 }, { type: 'square', f0: 523, f1: 784, dur: 0.12, gain: 0.04, delay: 0.1 }] },
  defeat: { priority: 2, haptic: 'warning', voices: [{ type: 'sawtooth', f0: 220, f1: 60, dur: 0.6, gain: 0.06 }] },
  retreat: { priority: 2, voices: [{ type: 'triangle', f0: 440, f1: 660, dur: 0.2, gain: 0.04 }] },
};

export const SFX_NAMES = Object.freeze(Object.keys(SFX));
export const MAX_VOICES = 10;
const MASTER = 0.6;
const VIBRATION_MS = { light: 12, medium: 25, heavy: 45, success: 30, warning: 60 };

export function createAudio({
  createContext = () => new (globalThis.AudioContext || globalThis.webkitAudioContext)(),
  getHaptics = () => globalThis.Capacitor?.Plugins?.Haptics,
  vibrate = ms => globalThis.navigator?.vibrate?.(ms),
} = {}) {
  let context = null;
  let noise = null;
  let master = null;
  let soundOn = false;
  let hapticsOn = true;
  let active = 0;
  let dropped = 0;

  function ensureContext() {
    if (context) return context;
    try {
      context = createContext();
      master = context.createGain();
      master.gain.value = MASTER;
      master.connect(context.destination);
    } catch { context = null; soundOn = false; }
    return context;
  }

  function noiseBuffer() {
    if (noise) return noise;
    const length = Math.floor(context.sampleRate * 0.5);
    noise = context.createBuffer(1, length, context.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return noise;
  }

  function voice(spec, start) {
    const t0 = start + (spec.delay ?? 0);
    const gain = context.createGain();
    gain.gain.setValueAtTime(spec.gain, t0);
    gain.gain.exponentialRampToValueAtTime(0.0008, t0 + spec.dur);
    let source;
    if (spec.type === 'noise') {
      source = context.createBufferSource();
      source.buffer = noiseBuffer();
      if (spec.filter) {
        const filter = context.createBiquadFilter();
        filter.type = spec.filter[0];
        filter.frequency.value = spec.filter[1];
        source.connect(filter).connect(gain);
      } else source.connect(gain);
    } else {
      source = context.createOscillator();
      source.type = spec.type;
      source.frequency.setValueAtTime(spec.f0, t0);
      source.frequency.exponentialRampToValueAtTime(Math.max(20, spec.f1), t0 + spec.dur);
      source.connect(gain);
    }
    gain.connect(master);
    active++;
    source.onended = () => { active = Math.max(0, active - 1); };
    source.start(t0);
    source.stop(t0 + spec.dur + 0.02);
  }

  const api = {
    setSound(value) { soundOn = Boolean(value); },
    setHaptics(value) { hapticsOn = Boolean(value); },
    get soundOn() { return soundOn; },

    // Debe llamarse desde un gesto del jugador (toque o tecla): los navegadores no dejan sonar antes.
    unlock() {
      if (!soundOn || !ensureContext()) return;
      try { if (context.state === 'suspended') context.resume(); } catch { /* sin audio */ }
    },

    hapticsAvailable() { return Boolean(getHaptics()?.impact || getHaptics()?.vibrate || typeof globalThis.navigator?.vibrate === 'function'); },

    haptic(kind) {
      if (!hapticsOn || !(kind in VIBRATION_MS)) return false;
      try {
        const plugin = getHaptics();
        if (plugin?.impact && ['light', 'medium', 'heavy'].includes(kind)) { plugin.impact({ style: kind.toUpperCase() }); return true; }
        if (plugin?.notification && ['success', 'warning'].includes(kind)) { plugin.notification({ type: kind.toUpperCase() }); return true; }
        return Boolean(vibrate(VIBRATION_MS[kind]));
      } catch { return false; }
    },

    play(name, { pitch = 1 } = {}) {
      const recipe = SFX[name];
      if (!recipe) return false;
      if (recipe.haptic) api.haptic(recipe.haptic);
      if (!soundOn || !ensureContext()) return false;
      // Con muchas voces simultáneas se descartan primero los sonidos de baja prioridad (disparos, impactos).
      if (active >= MAX_VOICES || (recipe.priority === 0 && active >= MAX_VOICES - 4)) { dropped++; return false; }
      try {
        const start = context.currentTime;
        for (const spec of recipe.voices) {
          const scaled = spec.type === 'noise' ? spec : { ...spec, f0: spec.f0 * pitch, f1: spec.f1 * pitch };
          voice(scaled, start);
        }
        return true;
      } catch { return false; }
    },

    stats() { return { active, dropped, contextCreated: Boolean(context) }; },
  };
  return api;
}
