// Motor de Estudio Glam: estado del look (trazos vectoriales, pegatinas, pelo, extras),
// estimación de cobertura por capa, puntuación de retos y economía. Sin DOM ni Canvas.
import { GAME, FACE, MASK_AREAS, TOOLS, PALETTES, STICKERS, ACCESSORIES, CHARACTERS, LOOKS } from './content.mjs';

export function createSave() {
  return {
    coins: 0,
    unlocked: [],            // ids de swatches, pegatinas, extras y personajes comprados
    completed: {},           // lookId -> estrellas
    gallery: [],             // [{ thumb, date, look }]
    character: 'luna',
    noAds: false,
    unlockAll: false,
    entitlements: {},
    settings: { sound: true },
    stats: { strokes: 0, looks: 0, cleans: 0, photos: 0 },
    current: null,           // look en curso serializado
    lastSeen: 0,
  };
}

export function validateSave(s) {
  return !!(s && typeof s === 'object' && typeof s.coins === 'number' && Array.isArray(s.unlocked) && s.completed && Array.isArray(s.gallery));
}

export const MIGRATIONS = {};

const MAX_STROKES = 400;
const MAX_POINTS = 6000;
const STAMP_SPACING = 0.35; // fracción del tamaño del pincel entre sellos

export function hexToHue(color) {
  if (!color || !color.startsWith('#')) return null;
  const n = parseInt(color.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max === min) return null; // gris: sin tono
  const d = max - min;
  let h;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return ((h * 60) + 360) % 360;
}

// ¿El tono h cae en el rango [a, b] (b puede superar 360 para envolver)?
export function hueIn(h, range) {
  if (h == null || !range) return false;
  const [a, b] = range;
  if (h >= a && h <= b) return true;
  return b > 360 && h + 360 >= a && h + 360 <= b;
}

export function toolById(id) { return TOOLS.find((t) => t.id === id); }
export function swatch(paletteId, swId) { return (PALETTES[paletteId] || []).find((s) => s.id === swId); }

// Zona de la cara que contiene el punto (para feedback y para limitar pegatinas).
export function pointInHead(x, y) {
  const dx = (x - FACE.center.x) / FACE.head.rx, dy = (y - FACE.center.y) / FACE.head.ry;
  return dx * dx + dy * dy <= 1.15;
}

export class Studio {
  constructor(save = createSave()) {
    this.save = save;
    this.sessionUnlocks = new Set(); // desbloqueos temporales por anuncio
    this.tool = 'labial';
    this.color = 'p2';
    this.sticker = 'estrella';
    this.look = this.freshLook(save.character);
    if (save.current) this.loadLook(save.current);
    this.activeStroke = null;
    this.events = [];
  }

  freshLook(characterId = this.save.character) {
    const ch = CHARACTERS.find((c) => c.id === characterId) || CHARACTERS[0];
    return { character: ch.id, hair: ch.hair, accessories: [], stickers: [], strokes: [], lashes: 0, points: 0 };
  }

  get character() { return CHARACTERS.find((c) => c.id === this.look.character) || CHARACTERS[0]; }
  get currentTool() { return toolById(this.tool); }

  // ----- desbloqueos -----
  isUnlocked(item) {
    if (!item) return false;
    if (!item.cost) return true;
    return this.save.unlockAll || this.save.unlocked.includes(item.id) || this.sessionUnlocks.has(item.id);
  }
  unlock(item) {
    if (this.isUnlocked(item)) return true;
    if (this.save.coins < item.cost) return false;
    this.save.coins -= item.cost;
    this.save.unlocked.push(item.id);
    return true;
  }
  unlockForSession(item) { this.sessionUnlocks.add(item.id); }
  unlockEverything() { this.save.unlockAll = true; }

  // ----- selección -----
  setTool(id) {
    const t = toolById(id);
    if (!t) return false;
    this.tool = id;
    if (t.palette && PALETTES[t.palette]) {
      const cur = swatch(t.palette, this.color);
      if (!cur || !this.isUnlocked(cur)) this.color = PALETTES[t.palette][0].id;
    }
    return true;
  }
  setColor(id) {
    const t = this.currentTool;
    if (t.kind === 'hair') { const s = swatch('hair', id); if (!s || !this.isUnlocked(s)) return false; this.look.hair = s.color; return true; }
    if (t.kind === 'sticker') { const s = STICKERS.find((x) => x.id === id); if (!s || !this.isUnlocked(s)) return false; this.sticker = id; return true; }
    if (t.kind === 'accessory') { const a = ACCESSORIES.find((x) => x.id === id); if (!a || !this.isUnlocked(a)) return false; this.toggleAccessory(id); return true; }
    if (!t.palette) return false;
    const s = swatch(t.palette, id);
    if (!s || !this.isUnlocked(s)) return false;
    this.color = id;
    return true;
  }
  toggleAccessory(id) {
    const i = this.look.accessories.indexOf(id);
    if (i >= 0) this.look.accessories.splice(i, 1); else this.look.accessories.push(id);
  }
  setCharacter(id) {
    const ch = CHARACTERS.find((c) => c.id === id);
    if (!ch || !this.isUnlocked(ch)) return false;
    this.save.character = id;
    this.look = this.freshLook(id);
    return true;
  }

  // ----- pintura -----
  // Devuelve una lista de sellos [{x, y}] que el render debe pintar, o null si no se pinta.
  beginStroke(x, y) {
    const t = this.currentTool;
    if (!t || t.kind === 'sticker' || t.kind === 'hair' || t.kind === 'accessory' || t.kind === 'clean') return null;
    if (!pointInHead(x, y) && t.kind !== 'erase') return null;
    const color = t.palette ? swatch(t.palette, this.color)?.color : null;
    const stroke = { tool: t.id, color, size: t.brush.size, pts: [[Math.round(x), Math.round(y)]] };
    this.activeStroke = stroke;
    this.look.strokes.push(stroke);
    if (this.look.strokes.length > MAX_STROKES) this.look.strokes.shift();
    this.look.points++;
    this.save.stats.strokes++;
    this.events.push({ type: 'stroke', tool: t.id });
    if (t.kind === 'erase') this.eraseStickersAt(x, y, t.brush.size);
    if (t.kind === 'lashes') this.look.lashes = Math.min(1, this.look.lashes + 0.08);
    return [{ x, y }];
  }

  // Interpola sellos entre el último punto y (x, y) separados por STAMP_SPACING·size.
  addPoint(x, y) {
    const s = this.activeStroke;
    if (!s) return null;
    const [lx, ly] = s.pts[s.pts.length - 1];
    const dist = Math.hypot(x - lx, y - ly);
    const t = toolById(s.tool);
    // Las pestañas crecen con la distancia recorrida sobre el ojo, aunque el gesto sea lento.
    if (t.kind === 'lashes') this.look.lashes = Math.min(1, this.look.lashes + dist / 120);
    const spacing = Math.max(2, s.size * STAMP_SPACING);
    if (dist < spacing) return [];
    const n = Math.min(40, Math.floor(dist / spacing));
    const stamps = [];
    for (let i = 1; i <= n; i++) {
      const k = i / n;
      const px = lx + (x - lx) * k, py = ly + (y - ly) * k;
      stamps.push({ x: px, y: py });
    }
    s.pts.push([Math.round(x), Math.round(y)]);
    this.look.points += n;
    if (this.look.points > MAX_POINTS) this.compact();
    if (t.kind === 'erase') this.eraseStickersAt(x, y, s.size);
    return stamps;
  }

  endStroke() {
    const s = this.activeStroke;
    this.activeStroke = null;
    return s;
  }

  compact() {
    // Si hay demasiados puntos, elimina los trazos más antiguos (no visibles de forma apreciable
    // bajo capas posteriores). El render reconstruye las capas desde los trazos.
    while (this.look.points > MAX_POINTS * 0.8 && this.look.strokes.length > 1) {
      const old = this.look.strokes.shift();
      this.look.points -= old.pts.length;
    }
    this.events.push({ type: 'compacted' });
  }

  placeSticker(x, y) {
    if (!pointInHead(x, y) && !(y < FACE.center.y - FACE.head.ry + 60)) return null;
    const def = STICKERS.find((s) => s.id === this.sticker);
    if (!def || !this.isUnlocked(def)) return null;
    const sticker = { id: def.id, x: Math.round(x), y: Math.round(y), size: 22 + (this.look.stickers.length % 3) * 4, rot: ((this.look.stickers.length * 37) % 60) - 30 };
    this.look.stickers.push(sticker);
    if (this.look.stickers.length > 40) this.look.stickers.shift();
    this.events.push({ type: 'sticker', id: def.id, x, y });
    return sticker;
  }

  eraseStickersAt(x, y, radius) {
    const before = this.look.stickers.length;
    this.look.stickers = this.look.stickers.filter((s) => Math.hypot(s.x - x, s.y - y) > radius * 0.6 + s.size * 0.5);
    return before - this.look.stickers.length;
  }

  // Deshace la última acción (trazo o pegatina), la que sea más reciente.
  undo() {
    const lastStroke = this.look.strokes[this.look.strokes.length - 1];
    const lastSticker = this.look.stickers[this.look.stickers.length - 1];
    if (!lastStroke && !lastSticker) return false;
    // No hay marca de tiempo: prioriza pegatina si existe y el último trazo no es más nuevo (heurística simple).
    if (lastSticker && (!lastStroke || this._stickerNewer)) { this.look.stickers.pop(); this._stickerNewer = false; return true; }
    if (lastStroke) { this.look.strokes.pop(); this.look.points -= lastStroke.pts.length; if (toolById(lastStroke.tool).kind === 'lashes') this.look.lashes = Math.max(0, this.look.lashes - 0.3); return true; }
    return false;
  }

  clearAll() {
    const had = this.look.strokes.length + this.look.stickers.length;
    this.look.strokes = []; this.look.stickers = []; this.look.points = 0; this.look.lashes = 0;
    this.activeStroke = null;
    this.save.stats.cleans++;
    this.events.push({ type: 'clean' });
    return had;
  }

  // ----- cobertura y puntuación -----
  // Cobertura estimada por capa (0..1) y tonos usados ponderados por área pintada.
  coverage() {
    const cov = {};
    const hues = {};
    for (const s of this.look.strokes) {
      const t = toolById(s.tool);
      if (!t) continue;
      if (t.kind === 'erase') {
        // El algodón reduce todas las capas en proporción al área barrida.
        const area = s.pts.length * Math.PI * (s.size / 2) ** 2 * 0.5;
        for (const k of Object.keys(cov)) cov[k] = Math.max(0, cov[k] - area / MASK_AREAS.skin);
        continue;
      }
      if (!t.layer) continue;
      const stamps = Math.max(1, s.pts.length) * (1 / STAMP_SPACING);
      const area = stamps * Math.PI * (s.size / 2) ** 2 * (t.brush.alpha >= 1 ? 0.35 : Math.min(1, t.brush.alpha * 6));
      const maskArea = MASK_AREAS[t.mask] || MASK_AREAS.skin;
      cov[t.layer] = Math.min(1, (cov[t.layer] || 0) + area / maskArea);
      const h = hexToHue(s.color);
      if (h != null) { hues[t.layer] = hues[t.layer] || []; hues[t.layer].push({ h, w: area }); }
    }
    return { cov, hues };
  }

  // Puntúa un reto: devuelve { score 0..1, stars 0..3, details }.
  scoreLook(lookDef) {
    const { cov, hues } = this.coverage();
    const details = [];
    let total = 0;
    for (const req of lookDef.requires) {
      let k = 0;
      if (req.layer) {
        const c = cov[req.layer] || 0;
        k = Math.min(1, c / req.min);
        if (req.hue) {
          const list = hues[req.layer] || [];
          const totalW = list.reduce((a, b) => a + b.w, 0) || 1;
          const matchW = list.filter((e) => hueIn(e.h, req.hue)).reduce((a, b) => a + b.w, 0);
          k *= 0.25 + 0.75 * (matchW / totalW);
        }
      } else if (req.lashes != null) k = Math.min(1, this.look.lashes / req.lashes);
      else if (req.accessory) k = this.look.accessories.includes(req.accessory) ? 1 : 0;
      else if (req.stickers) k = Math.min(1, this.look.stickers.length / req.stickers);
      details.push({ req, k });
      total += k;
    }
    const score = total / lookDef.requires.length;
    const stars = score >= 0.9 ? 3 : score >= 0.6 ? 2 : score >= 0.3 ? 1 : 0;
    return { score, stars, details };
  }

  completeLook(lookDef) {
    const r = this.scoreLook(lookDef);
    const prev = this.save.completed[lookDef.id] || 0;
    const reward = r.stars > 0 ? lookDef.reward[r.stars - 1] : 0;
    // Solo paga la mejora respecto a estrellas anteriores, más una propina fija por repetir.
    const paid = r.stars > prev ? reward - (prev > 0 ? lookDef.reward[prev - 1] : 0) : Math.round(reward * 0.2);
    this.save.coins += paid;
    this.save.completed[lookDef.id] = Math.max(prev, r.stars);
    this.save.stats.looks++;
    return { ...r, paid, improved: r.stars > prev };
  }

  nextLook() {
    return LOOKS.find((l) => !(this.save.completed[l.id] >= 3)) || LOOKS[0];
  }

  // ----- persistencia del look -----
  serializeLook() {
    return { ...this.look, strokes: this.look.strokes.map((s) => ({ ...s, pts: s.pts.slice(-200) })) };
  }
  loadLook(data) {
    if (!data || !Array.isArray(data.strokes)) return false;
    this.look = { ...this.freshLook(data.character), ...data, strokes: data.strokes.filter((s) => toolById(s.tool)), stickers: data.stickers || [], accessories: data.accessories || [] };
    this.look.points = this.look.strokes.reduce((a, s) => a + s.pts.length, 0);
    return true;
  }
  addToGallery(thumb, lookId = null) {
    this.save.gallery.unshift({ thumb, date: new Date().toISOString().slice(0, 10), look: lookId });
    if (this.save.gallery.length > 9) this.save.gallery.pop();
    this.save.stats.photos++;
  }
}

export { GAME, FACE, TOOLS, PALETTES, STICKERS, ACCESSORIES, CHARACTERS, LOOKS };
