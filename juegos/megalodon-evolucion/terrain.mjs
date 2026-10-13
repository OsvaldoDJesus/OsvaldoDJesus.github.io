// Terreno compartido por el motor (colisiones) y el render (suelo). Determinista.
import { WORLDS } from './content.mjs';

// Altura (y hacia abajo) del fondo en la columna x de un mundo.
export function floorAt(worldIndex, x) {
  const w = WORLDS[worldIndex];
  const base = w.size.h * w.floor;
  const s = w.seed;
  const n = Math.sin(x * 0.0021 + s) * 0.6 + Math.sin(x * 0.0067 + s * 2.1) * 0.3 + Math.sin(x * 0.017 + s * 0.3) * 0.1;
  return base + w.relief * n;
}
