// Efectos de presentación de Lumen: motas de luz que ascienden, anillos suaves, números flotantes de luz, y un
// destello y una sacudida breves cuando la semilla recibe daño. Sin reglas del juego; todo acotado en cantidad.
// Con «efectos reducidos» (ajuste o preferencia del sistema) no hay sacudida ni destello y casi no hay motas.
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export const FX_LIMITS = Object.freeze({ motes: 90, rings: 10, popups: 8 });
export const REDUCED_FACTOR = 0.25;

export function createFx({ limits = FX_LIMITS, random = Math.random } = {}) {
  const state = { motes: [], rings: [], popups: [], shake: 0, flash: 0, reduced: false };

  return {
    state,
    setReduced(value) { state.reduced = Boolean(value); },

    // Motas que se elevan despacio y se apagan; `colors` son claves de la paleta del lienzo.
    motes(x, y, colors, count, spread = 1) {
      const wanted = state.reduced ? Math.min(2, Math.ceil(count * REDUCED_FACTOR)) : Math.floor(count);
      for (let i = 0; i < wanted && state.motes.length < limits.motes; i++) {
        const angle = random() * Math.PI * 2;
        const speed = (10 + random() * 34) * spread;
        const life = 0.5 + random() * 0.5;
        state.motes.push({
          x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed * 0.6 - 18, life, max: life,
          size: 1.6 + random() * 2.2, color: colors[i % colors.length],
        });
      }
    },

    ring(x, y, size = 1, color = 'lantern') {
      if (state.rings.length >= limits.rings) state.rings.shift();
      state.rings.push({ x, y, size, color, life: 0.45, max: 0.45 });
    },

    popup(x, y, text, color = 'lantern') {
      if (state.popups.length >= limits.popups) state.popups.shift();
      state.popups.push({ x, y, text: String(text).slice(0, 10), color, life: 0.9, max: 0.9 });
    },

    // `shake` en píxeles lógicos (máx. 10) y `flash` de 0 a 1; con efectos reducidos no hacen nada.
    hurt({ shake = 0, flash = 0 } = {}) {
      if (state.reduced) return;
      state.shake = Math.max(state.shake, clamp(shake, 0, 10));
      state.flash = Math.max(state.flash, clamp(flash, 0, 1));
    },

    update(dt) {
      const step = clamp(Number.isFinite(dt) ? dt : 0, 0, 0.1);
      state.shake = Math.max(0, state.shake - step * 30);
      state.flash = Math.max(0, state.flash - step * 2.4);
      for (let i = state.motes.length - 1; i >= 0; i--) {
        const m = state.motes[i];
        m.x += m.vx * step; m.y += m.vy * step; m.vx *= 0.96; m.vy *= 0.96; m.life -= step;
        if (m.life <= 0) state.motes.splice(i, 1);
      }
      for (let i = state.rings.length - 1; i >= 0; i--) {
        state.rings[i].life -= step;
        if (state.rings[i].life <= 0) state.rings.splice(i, 1);
      }
      for (let i = state.popups.length - 1; i >= 0; i--) {
        const p = state.popups[i];
        p.y -= 22 * step; p.life -= step;
        if (p.life <= 0) state.popups.splice(i, 1);
      }
    },

    clear() { state.motes.length = 0; state.rings.length = 0; state.popups.length = 0; state.shake = 0; state.flash = 0; },
  };
}
