// Efectos de presentación: esquirlas, anillos de impacto, números flotantes, sacudida, destello y pausa de impacto.
// No contiene reglas del juego ni toca el lienzo; el renderizador solo lee `state`. Todo está acotado en cantidad
// para proteger el rendimiento en móviles, y los efectos de movimiento se atenúan con «efectos reducidos».
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export const FX_LIMITS = Object.freeze({ particles: 140, rings: 14, popups: 10 });
export const REDUCED_PARTICLE_FACTOR = 0.25;

export function createFx({ limits = FX_LIMITS, random = Math.random } = {}) {
  const state = { particles: [], rings: [], popups: [], shake: 0, flash: 0, hitStop: 0, muzzle: 0, reduced: false };

  const api = {
    state,
    setReduced(value) { state.reduced = Boolean(value); },

    // Esquirlas angulares (segmentos cortos) que salen en abanico.
    shards(x, y, colors, count, force = 1) {
      const wanted = state.reduced ? Math.min(3, Math.ceil(count * REDUCED_PARTICLE_FACTOR)) : Math.floor(count);
      for (let i = 0; i < wanted && state.particles.length < limits.particles; i++) {
        const angle = (i / Math.max(1, wanted)) * Math.PI * 2 + random() * 0.6;
        const speed = (70 + random() * 150) * force;
        const life = 0.22 + random() * 0.26;
        state.particles.push({
          x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life, max: life,
          len: 4 + random() * 7, width: 2 + random() * 1.6, color: colors[i % colors.length],
        });
      }
    },

    ring(x, y, size = 1, color = 'ivory') {
      if (state.rings.length >= limits.rings) state.rings.shift();
      state.rings.push({ x, y, size, color, life: 0.2, max: 0.2 });
    },

    popup(x, y, text, color = 'ivory') {
      if (state.popups.length >= limits.popups) state.popups.shift();
      state.popups.push({ x: clamp(x, 24, 456), y, text: String(text).slice(0, 8), color, life: 0.75, max: 0.75 });
    },

    // `shake` en píxeles lógicos, `flash` de 0 a 1, `hitStop` y `muzzle` en segundos.
    kick({ shake = 0, flash = 0, hitStop = 0, muzzle = 0 } = {}) {
      state.muzzle = Math.max(state.muzzle, muzzle);
      if (state.reduced) return;
      state.shake = Math.max(state.shake, clamp(shake, 0, 12));
      state.flash = Math.max(state.flash, clamp(flash, 0, 1));
      state.hitStop = Math.max(state.hitStop, clamp(hitStop, 0, 0.12));
    },

    update(dt) {
      const step = clamp(Number.isFinite(dt) ? dt : 0, 0, 0.1);
      state.shake = Math.max(0, state.shake - step * 40);
      state.flash = Math.max(0, state.flash - step * 3.2);
      state.muzzle = Math.max(0, state.muzzle - step);
      for (let i = state.particles.length - 1; i >= 0; i--) {
        const p = state.particles[i];
        p.x += p.vx * step; p.y += p.vy * step; p.vx *= 0.94; p.vy *= 0.94; p.life -= step;
        if (p.life <= 0) state.particles.splice(i, 1);
      }
      for (let i = state.rings.length - 1; i >= 0; i--) {
        state.rings[i].life -= step;
        if (state.rings[i].life <= 0) state.rings.splice(i, 1);
      }
      for (let i = state.popups.length - 1; i >= 0; i--) {
        const p = state.popups[i];
        p.y -= 34 * step; p.life -= step;
        if (p.life <= 0) state.popups.splice(i, 1);
      }
    },

    // La pausa de impacto solo se consume si se está jugando; devuelve cuánto tiempo de simulación queda congelado.
    consumeHitStop(dt) {
      if (state.hitStop <= 0) return 0;
      state.hitStop = Math.max(0, state.hitStop - clamp(dt, 0, 0.1));
      return state.hitStop;
    },

    clear() {
      state.particles.length = 0; state.rings.length = 0; state.popups.length = 0;
      state.shake = 0; state.flash = 0; state.hitStop = 0; state.muzzle = 0;
    },
  };
  return api;
}
