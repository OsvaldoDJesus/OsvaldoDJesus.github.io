// Audio sintetizado de Lumen: notas suaves de cámara (seno y triángulo), sin archivos de sonido. Un único servicio,
// con tope de voces simultáneas. Nada lanza: si el dispositivo no admite audio, el juego sigue en silencio.
const note = (f0, f1, dur, gain, delay = 0, type = 'sine') => ({ type, f0, f1, dur, gain, delay });

const SFX = {
  ui: { priority: 1, voices: [note(620, 620, 0.05, 0.025)] },
  build: { priority: 1, voices: [note(440, 659, 0.16, 0.05, 0, 'triangle'), note(880, 880, 0.12, 0.025, 0.06)] },
  upgrade: { priority: 1, voices: [note(523, 523, 0.14, 0.045), note(659, 659, 0.14, 0.045, 0.09), note(784, 784, 0.2, 0.045, 0.18)] },
  sell: { priority: 1, voices: [note(494, 494, 0.12, 0.04), note(330, 330, 0.18, 0.04, 0.09)] },
  waveStart: { priority: 2, voices: [note(196, 220, 0.5, 0.05, 0, 'triangle'), note(294, 330, 0.5, 0.025, 0.04, 'triangle')] },
  waveClear: { priority: 2, voices: [523, 659, 784, 1046].map((f, i) => note(f, f, 0.26, 0.045, i * 0.1)) },
  kill: { priority: 0, voices: [note(880, 660, 0.06, 0.014)] },
  leak: { priority: 2, voices: [note(110, 55, 0.4, 0.085, 0, 'triangle'), note(165, 82, 0.3, 0.04, 0.04)] },
  pulse: { priority: 2, voices: [note(220, 880, 0.5, 0.05), note(330, 1320, 0.5, 0.02, 0.05)] },
  boss: { priority: 2, voices: [note(82, 73, 0.9, 0.07, 0, 'triangle'), note(123, 110, 0.9, 0.03, 0.05, 'triangle')] },
  win: { priority: 2, voices: [523, 659, 784, 1046, 1318].map((f, i) => note(f, f, 0.34, 0.045, i * 0.12)) },
  lose: { priority: 2, voices: [392, 330, 262].map((f, i) => note(f, f * 0.96, 0.4, 0.05, i * 0.18, 'triangle')) },
};

export const SFX_NAMES = Object.freeze(Object.keys(SFX));
export const MAX_VOICES = 10;
const MASTER = 0.65;

export function createAudio({ createContext = () => new (globalThis.AudioContext || globalThis.webkitAudioContext)() } = {}) {
  let context = null;
  let master = null;
  let soundOn = false;
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

  function voice(spec, start) {
    const t0 = start + spec.delay;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(spec.gain, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0008, t0 + spec.dur);
    const oscillator = context.createOscillator();
    oscillator.type = spec.type;
    oscillator.frequency.setValueAtTime(spec.f0, t0);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, spec.f1), t0 + spec.dur);
    oscillator.connect(gain);
    gain.connect(master);
    active++;
    oscillator.onended = () => { active = Math.max(0, active - 1); };
    oscillator.start(t0);
    oscillator.stop(t0 + spec.dur + 0.02);
  }

  return {
    setSound(value) { soundOn = Boolean(value); },
    get soundOn() { return soundOn; },

    // Debe llamarse desde un gesto del jugador (toque o tecla): los navegadores no dejan sonar antes.
    unlock() {
      if (!soundOn || !ensureContext()) return;
      try { if (context.state === 'suspended') context.resume(); } catch { /* sin audio */ }
    },

    play(name, { pitch = 1 } = {}) {
      const recipe = SFX[name];
      if (!recipe || !soundOn || !ensureContext()) return false;
      // Con muchas voces se descartan primero los sonidos de baja prioridad (las bajas).
      if (active >= MAX_VOICES || (recipe.priority === 0 && active >= MAX_VOICES - 4)) { dropped++; return false; }
      try {
        const start = context.currentTime;
        for (const spec of recipe.voices) voice({ ...spec, f0: spec.f0 * pitch, f1: spec.f1 * pitch }, start);
        return true;
      } catch { return false; }
    },

    stats() { return { active, dropped, contextCreated: Boolean(context) }; },
  };
}
