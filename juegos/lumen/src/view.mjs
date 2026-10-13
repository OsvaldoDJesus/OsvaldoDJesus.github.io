// Geometría de la vista: cómo se coloca el mapa (1000 × 600 unidades) dentro del lienzo y cómo se traduce un toque
// en un punto del mundo. En pantallas altas el mapa se gira 90° para aprovechar el espacio: los enemigos bajan de
// arriba abajo, como en cualquier defensa para móvil. Todo es puro (sin DOM) para poder probarlo.
export const WORLD = Object.freeze({ width: 1000, height: 600 });

// Un mapa girado solo compensa si gana bastante escala; con poca diferencia se mantiene apaisado.
export const ROTATION_GAIN = 1.15;

export function computeView(boxWidth, boxHeight, world = WORLD) {
  const w = Math.max(1, Number.isFinite(boxWidth) ? boxWidth : 1);
  const h = Math.max(1, Number.isFinite(boxHeight) ? boxHeight : 1);
  const landscape = Math.min(w / world.width, h / world.height);
  const portrait = Math.min(w / world.height, h / world.width);
  const rotated = portrait > landscape * ROTATION_GAIN;
  const scale = rotated ? portrait : landscape;
  const shownW = (rotated ? world.height : world.width) * scale;
  const shownH = (rotated ? world.width : world.height) * scale;
  return { rotated, scale, ox: (w - shownW) / 2, oy: (h - shownH) / 2, width: w, height: h, world };
}

// Mundo → pantalla (en píxeles CSS). Girado: la izquierda del mapa pasa arriba y su borde superior, a la derecha.
export function toScreen(view, x, y) {
  if (!view.rotated) return { x: view.ox + x * view.scale, y: view.oy + y * view.scale };
  return { x: view.ox + (view.world.height - y) * view.scale, y: view.oy + x * view.scale };
}

// Pantalla → mundo: la inversa exacta de `toScreen`.
export function toWorld(view, px, py) {
  const u = (px - view.ox) / view.scale;
  const v = (py - view.oy) / view.scale;
  return view.rotated ? { x: v, y: view.world.height - u } : { x: u, y: v };
}

export function insideWorld(point, world = WORLD) {
  return point.x >= 0 && point.x <= world.width && point.y >= 0 && point.y <= world.height;
}

// Los elementos pequeños se dibujan algo mayores cuando la escala es baja, para que sigan siendo legibles y tocables.
export function spriteScale(view, comfortable = 0.6, maxBoost = 1.5) {
  return view.scale * Math.min(maxBoost, Math.max(1, comfortable / view.scale));
}

// Parcela tocada: la más cercana dentro de un radio que nunca baja de `minRadiusPx` en pantalla, para que tocar con
// el dedo sea cómodo aunque el mapa esté pequeño.
export function padAt(view, px, py, pads, { baseRadius = 36, minRadiusPx = 26 } = {}) {
  const point = toWorld(view, px, py);
  const reach = Math.max(baseRadius, minRadiusPx / view.scale);
  let best = -1;
  let bestDistance = Infinity;
  pads.forEach(([x, y], index) => {
    const distance = Math.hypot(x - point.x, y - point.y);
    if (distance <= reach && distance < bestDistance) { best = index; bestDistance = distance; }
  });
  return best;
}
