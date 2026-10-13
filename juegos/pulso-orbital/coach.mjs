// Tutorial corto y no bloqueante: carteles que acompañan la primera partida sin detener el juego.
//   aim  → «Arrastra para apuntar» (hasta que el jugador apunta)
//   goal → «El cañón dispara solo…» (unos segundos)
// y, una sola vez cada uno, el primer aviso de brecha y de combo. El tutorial termina al superar la primera
// oleada. Es una máquina de estados pura: el exterior le envía eventos y dibuja el cartel que devuelve.
export const COACH_MESSAGES = Object.freeze({
  aim: { text: 'Arrastra para apuntar', icon: 'aim', ttl: 0 },
  goal: { text: 'El cañón dispara solo. No dejes pasar a los enemigos', icon: 'warning', ttl: 5 },
  breach: { text: 'Cada brecha te cuesta una celda del núcleo', icon: 'warning', ttl: 4 },
  combo: { text: 'Bajas seguidas multiplican tus puntos', icon: 'damage', ttl: 4 },
});

export function createCoach({ done = false } = {}) {
  let finished = Boolean(done);
  let current = null; // { key, remaining }
  const seen = new Set();

  const show = key => { current = { key, remaining: COACH_MESSAGES[key].ttl }; seen.add(key); };
  const view = () => (current && !finished ? { key: current.key, ...COACH_MESSAGES[current.key] } : null);

  return {
    get done() { return finished; },

    // Eventos: 'start', 'aimed', 'breach', 'combo', 'wave-clear'.
    dispatch(event) {
      if (finished) return null;
      if (event === 'start') { seen.clear(); show('aim'); }
      else if (event === 'aimed' && current?.key === 'aim') show('goal');
      else if ((event === 'breach' || event === 'combo') && !seen.has(event) && current?.key !== 'aim') show(event);
      else if (event === 'wave-clear') { finished = true; current = null; }
      return view();
    },

    // Avanza el reloj del cartel: los que tienen duración desaparecen solos.
    tick(dt) {
      if (finished || !current || current.remaining <= 0 || !Number.isFinite(dt) || dt <= 0) return view();
      current.remaining -= dt;
      if (current.remaining <= 0) current = null;
      return view();
    },

    current: view,

    // «Ver el tutorial otra vez»: vuelve a empezar desde el cartel de apuntar.
    restart() { finished = false; seen.clear(); current = null; },
  };
}
