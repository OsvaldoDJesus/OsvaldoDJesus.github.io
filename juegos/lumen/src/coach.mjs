// Tutorial contextual y no bloqueante de la primera expedición. Cada cartel acompaña la acción siguiente:
//   seleccionar parcela → plantar una defensa → comenzar la oleada → mover a Lyra (unos segundos)
//   → tras la primera oleada, gastar la luz.
// Más un aviso de una sola vez cuando un invasor llega a la semilla. Máquina de estados pura: el exterior le
// envía eventos y dibuja el cartel que devuelve.
export const COACH_MESSAGES = Object.freeze({
  select: { text: 'Toca una parcela del mapa para elegir dónde defender.', ttl: 0 },
  build: { text: 'Elige una defensa para plantarla en la parcela.', ttl: 0 },
  wave: { text: 'Cuando estés listo, comienza la oleada.', ttl: 0 },
  hero: { text: 'Toca el suelo para mover a Lyra. Su pulso daña a los invasores cercanos.', ttl: 9 },
  spend: { text: 'Gasta tu luz: mejora tus defensas o planta más.', ttl: 18 },
  leak: { text: 'Si un invasor llega a la semilla, pierde vida.', ttl: 6 },
});

export function createCoach({ done = false } = {}) {
  let finished = Boolean(done);
  let current = null; // { key, remaining }
  let leakSeen = false;
  const show = key => { current = { key, remaining: COACH_MESSAGES[key].ttl }; };
  const view = () => (current && !finished ? { key: current.key, ...COACH_MESSAGES[current.key] } : null);

  return {
    get done() { return finished; },

    // Eventos: 'start', 'selected', 'built', 'wave-start', 'wave-clear', 'spent', 'leak'.
    dispatch(event) {
      if (finished) return null;
      const key = current?.key;
      if (event === 'start') { leakSeen = false; show('select'); }
      else if (event === 'selected' && key === 'select') show('build');
      else if (event === 'built' && (key === 'select' || key === 'build')) show('wave');
      else if (event === 'wave-start' && (key === 'wave' || key === 'build' || key === 'select')) show('hero');
      else if (event === 'wave-clear') show('spend');
      else if (event === 'spent' && key === 'spend') { finished = true; current = null; }
      else if (event === 'leak' && !leakSeen && key !== 'spend') { leakSeen = true; show('leak'); }
      return view();
    },

    // Avanza el reloj: los carteles con duración desaparecen solos. El de «gastar» cierra el tutorial al caducar.
    tick(dt) {
      if (finished || !current || !Number.isFinite(dt) || dt <= 0 || COACH_MESSAGES[current.key].ttl <= 0) return view();
      current.remaining -= dt;
      if (current.remaining <= 0) {
        if (current.key === 'spend') finished = true;
        current = null;
      }
      return view();
    },

    current: view,
    // «Ver el tutorial otra vez».
    restart() { finished = false; current = null; leakSeen = false; },
  };
}
