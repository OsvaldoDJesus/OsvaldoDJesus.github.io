// Campos de ruido enlosables precalculados (fBm de valor y celular de Worley) y utilidades de
// muestreo. Se generan una vez (~100 ms) y alimentan pieles, arena, roca, neblina y cáusticas.
export const TS = 256; // lado de las teselas de ruido

export function hash2(x, y, s = 0) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const wrap = (a, p) => ((a % p) + p) % p;

function vnoise(x, y, period, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const x0 = wrap(xi, period), x1 = wrap(xi + 1, period), y0 = wrap(yi, period), y1 = wrap(yi + 1, period);
  const a = hash2(x0, y0, s), b = hash2(x1, y0, s), c = hash2(x0, y1, s), d = hash2(x1, y1, s);
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

let fields = null;
// fbm: nubes suaves 0..1 · cell: F1 de Worley (0 en el centro de la celda) · edge: F2-F1 (0 en los bordes).
export function noiseFields() {
  if (fields) return fields;
  const n = TS * TS;
  const fbm = new Float32Array(n), fine = new Float32Array(n), cell = new Float32Array(n), edge = new Float32Array(n);
  const oct = [[4, 0.5], [8, 0.25], [16, 0.13], [32, 0.07], [64, 0.05]];
  const octFine = [[32, 0.5], [64, 0.3], [128, 0.2]];
  const C = 16; // celdas por lado en Worley
  const pts = new Float32Array(C * C * 2);
  for (let j = 0; j < C; j++) for (let i = 0; i < C; i++) { pts[(j * C + i) * 2] = hash2(i, j, 91); pts[(j * C + i) * 2 + 1] = hash2(i, j, 92); }
  for (let y = 0; y < TS; y++) {
    for (let x = 0; x < TS; x++) {
      let s = 0;
      for (const [p, a] of oct) s += a * vnoise((x / TS) * p, (y / TS) * p, p, p);
      let f = 0;
      for (const [p, a] of octFine) f += a * vnoise((x / TS) * p, (y / TS) * p, p, p + 7);
      const cx = (x / TS) * C, cy = (y / TS) * C;
      const ci = Math.floor(cx), cj = Math.floor(cy);
      let f1 = 9, f2 = 9;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ii = ci + di, jj = cj + dj, k = (wrap(jj, C) * C + wrap(ii, C)) * 2;
        const dx = ii + pts[k] - cx, dy = jj + pts[k + 1] - cy, d = Math.sqrt(dx * dx + dy * dy);
        if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
      }
      const i = y * TS + x;
      fbm[i] = s / 1.0; fine[i] = f; cell[i] = Math.min(1, f1); edge[i] = Math.min(1, f2 - f1);
    }
  }
  fields = { fbm, fine, cell, edge };
  return fields;
}

// Muestreo bilineal enlosable (u, v en texeles, cualquier real).
export function sample(arr, u, v) {
  const x = Math.floor(u), y = Math.floor(v), fx = u - x, fy = v - y;
  const x0 = x & 255, y0 = y & 255, x1 = (x + 1) & 255, y1 = (y + 1) & 255;
  const a = arr[y0 * TS + x0], b = arr[y0 * TS + x1], c = arr[y1 * TS + x0], d = arr[y1 * TS + x1];
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

export function canvas2(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
  return c;
}

// Horneado por fragmentos: ejecuta generadores con un presupuesto de milisegundos por fotograma
// para que texturas grandes (4K) no congelen el juego.
export class Baker {
  constructor() { this.queue = []; }
  add(gen, onDone) { this.queue.push({ gen, onDone }); }
  get busy() { return this.queue.length > 0; }
  run(budgetMs = 6) {
    const t0 = performance.now();
    while (this.queue.length && performance.now() - t0 < budgetMs) {
      const job = this.queue[0];
      const r = job.gen.next();
      if (r.done) { this.queue.shift(); if (job.onDone) job.onDone(r.value); }
    }
  }
  // Termina todo ya (pantalla de carga, pruebas, capturas).
  flush() { while (this.queue.length) this.run(1e9); }
}
export const baker = new Baker();
