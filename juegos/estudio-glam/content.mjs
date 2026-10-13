// Datos de Estudio Glam: personajes, herramientas, paletas, pegatinas, retos y catálogo.
export const GAME = {
  id: 'estudio-glam',
  title: 'Estudio Glam',
  version: '0.1.0',
  saveVersion: 1,
  width: 480,
  height: 800,
  childDirected: true, // público infantil: puerta parental en compras, anuncios sin personalizar
};

// Geometría de la cara en coordenadas lógicas. El render dibuja a partir de esto y
// el motor estima coberturas con las áreas de las máscaras.
export const FACE = {
  center: { x: 240, y: 300 },
  head: { rx: 118, ry: 150 },
  eyes: { left: { x: 196, y: 288 }, right: { x: 284, y: 288 }, rx: 30, ry: 15 },
  eyelids: { rx: 40, ry: 24, dy: -12 },
  cheeks: { left: { x: 170, y: 350 }, right: { x: 310, y: 350 }, rx: 36, ry: 22 },
  lips: { x: 240, y: 398, upper: { rx: 32, ry: 10, dy: -4 }, lower: { rx: 30, ry: 15, dy: 6 } },
  brows: { y: 256, half: 34 },
  nose: { x: 240, y1: 318, y2: 352 },
  lashline: { ry: 7 },
};

// Áreas aproximadas de cada máscara (px²) para estimar cobertura sin leer píxeles.
const ell = (rx, ry) => Math.PI * rx * ry;
export const MASK_AREAS = {
  skin: ell(FACE.head.rx, FACE.head.ry) - 2 * ell(FACE.eyes.rx, FACE.eyes.ry) - ell(FACE.lips.lower.rx, FACE.lips.lower.ry + FACE.lips.upper.ry),
  cheeks: 2 * ell(FACE.cheeks.rx, FACE.cheeks.ry),
  eyelids: 2 * (ell(FACE.eyelids.rx, FACE.eyelids.ry) - ell(FACE.eyes.rx, FACE.eyes.ry) / 2),
  lashline: 2 * (2 * FACE.eyes.rx * FACE.lashline.ry * 2),
  eyes: 2 * ell(FACE.eyes.rx + 10, FACE.eyes.ry + 10),
  lips: ell(FACE.lips.upper.rx, FACE.lips.upper.ry) + ell(FACE.lips.lower.rx, FACE.lips.lower.ry),
};

export const CHARACTERS = [
  { id: 'luna', name: 'Luna', skin: '#f3cfa8', hair: '#4a2c17', eyes: '#5a3a1a', lips: '#d08a8f', style: 'long', cost: 0 },
  { id: 'nia', name: 'Nía', skin: '#c68642', hair: '#1f1410', eyes: '#2f1b0e', lips: '#b96a6e', style: 'curly', cost: 0 },
  { id: 'sofi', name: 'Sofi', skin: '#fde3cf', hair: '#e0a85a', eyes: '#3b7dd8', lips: '#e09aa3', style: 'bob', cost: 0 },
  { id: 'amara', name: 'Amara', skin: '#8d5524', hair: '#2b1b12', eyes: '#3a2a1a', lips: '#a85a63', style: 'braids', cost: 250 },
  { id: 'kiara', name: 'Kiara', skin: '#e8b98a', hair: '#6a3fb8', eyes: '#2a9d8f', lips: '#d27d93', style: 'ponytail', cost: 250 },
];

// Paletas: cada entrada puede estar bloqueada por monedas (y entra en un pack de pago).
const sw = (id, color, cost = 0, pack = null) => ({ id, color, cost, pack });
export const PALETTES = {
  skins: [sw('s1', '#fde3cf'), sw('s2', '#f3cfa8'), sw('s3', '#e8b98a'), sw('s4', '#c68642'), sw('s5', '#8d5524'), sw('s6', '#5c3a1e')],
  blush: [sw('b1', '#ff9eb5'), sw('b2', '#ff7f9c'), sw('b3', '#f4a261'), sw('b4', '#e76f8a'), sw('b5', '#c77dff', 60, 'galaxia'), sw('b6', '#ff5d8f', 60, 'neon')],
  shadow: [sw('e1', '#f4c2c2'), sw('e2', '#cdb4db'), sw('e3', '#a2d2ff'), sw('e4', '#b5e48c'), sw('e5', '#ffd166'), sw('e6', '#8d6e63'), sw('e7', '#7b2cbf', 80, 'galaxia'), sw('e8', '#3a0ca3', 80, 'galaxia'), sw('e9', '#06d6a0', 80, 'neon'), sw('e10', '#ff006e', 80, 'neon'), sw('e11', '#f72585', 80, 'neon'), sw('e12', '#4cc9f0', 80, 'galaxia')],
  liner: [sw('l1', '#1a1a1a'), sw('l2', '#3a2a6a'), sw('l3', '#1b4965'), sw('l4', '#ffffff', 40, 'neon')],
  lips: [sw('p1', '#e63946'), sw('p2', '#ff5d8f'), sw('p3', '#ff8fab'), sw('p4', '#c9184a'), sw('p5', '#f4978e'), sw('p6', '#9d4edd'), sw('p7', '#ff7b00'), sw('p8', '#8338ec', 80, 'galaxia'), sw('p9', '#06d6a0', 80, 'neon'), sw('p10', '#1d3557', 80, 'galaxia'), sw('p11', '#ffd166', 80, 'neon'), sw('p12', '#f1faee', 80, 'neon')],
  gloss: [sw('g1', 'rgba(255,255,255,0.9)'), sw('g2', 'rgba(255,220,240,0.9)'), sw('g3', 'rgba(255,240,180,0.9)', 50, 'galaxia')],
  glitter: [sw('q1', '#ffd166'), sw('q2', '#ffffff'), sw('q3', '#ff8fab'), sw('q4', '#4cc9f0', 60, 'galaxia')],
  hair: [sw('h1', '#4a2c17'), sw('h2', '#1f1410'), sw('h3', '#e0a85a'), sw('h4', '#b5651d'), sw('h5', '#d62828'), sw('h6', '#f4f1de'), sw('h7', '#6a3fb8', 100, 'galaxia'), sw('h8', '#ff5d8f', 100, 'neon'), sw('h9', '#06d6a0', 100, 'neon'), sw('h10', '#4cc9f0', 100, 'galaxia')],
};

export const STICKERS = [
  { id: 'estrella', name: 'Estrella', color: '#ffd166', cost: 0 },
  { id: 'corazon', name: 'Corazón', color: '#ff5d8f', cost: 0 },
  { id: 'flor', name: 'Flor', color: '#ff8fab', cost: 0 },
  { id: 'luna', name: 'Luna', color: '#f1faee', cost: 0 },
  { id: 'diamante', name: 'Diamante', color: '#4cc9f0', cost: 50, pack: 'galaxia' },
  { id: 'mariposa', name: 'Mariposa', color: '#c77dff', cost: 50, pack: 'galaxia' },
  { id: 'lazo', name: 'Lazo', color: '#ff5d8f', cost: 50, pack: 'neon' },
  { id: 'corona', name: 'Corona', color: '#ffd166', cost: 80, pack: 'neon' },
];

export const ACCESSORIES = [
  { id: 'aretes', name: 'Aretes', cost: 0 },
  { id: 'tiara', name: 'Tiara', cost: 0 },
  { id: 'gafas', name: 'Gafas', cost: 60, pack: 'neon' },
  { id: 'flor-pelo', name: 'Flor en el pelo', cost: 40, pack: 'galaxia' },
  { id: 'diadema', name: 'Diadema', cost: 40, pack: 'galaxia' },
];

// Herramientas: layer = capa de pintura; mask = zona permitida; brush = pincel.
export const TOOLS = [
  { id: 'base', name: 'Base', icon: 'drop', layer: 'base', mask: 'skin', brush: { size: 40, alpha: 0.08, soft: true }, palette: 'skins' },
  { id: 'rubor', name: 'Rubor', icon: 'brush', layer: 'blush', mask: 'cheeks', brush: { size: 30, alpha: 0.09, soft: true }, palette: 'blush' },
  { id: 'sombra', name: 'Sombra', icon: 'eye', layer: 'shadow', mask: 'eyelids', brush: { size: 16, alpha: 0.22, soft: true }, palette: 'shadow' },
  { id: 'delineador', name: 'Delineador', icon: 'pen', layer: 'liner', mask: 'lashline', brush: { size: 4, alpha: 0.9, soft: false }, palette: 'liner' },
  { id: 'pestanas', name: 'Pestañas', icon: 'lash', kind: 'lashes', mask: 'eyes', brush: { size: 24, alpha: 0.2 } },
  { id: 'labial', name: 'Labial', icon: 'lips', layer: 'lips', mask: 'lips', brush: { size: 12, alpha: 0.25, soft: true }, palette: 'lips' },
  { id: 'brillo', name: 'Brillo', icon: 'shine', layer: 'gloss', mask: 'lips', brush: { size: 9, alpha: 0.18, soft: true }, palette: 'gloss' },
  { id: 'purpurina', name: 'Purpurina', icon: 'sparkle', layer: 'glitter', mask: 'skin', brush: { size: 26, alpha: 1, sparkle: true }, palette: 'glitter' },
  { id: 'pegatinas', name: 'Pegatinas', icon: 'star', kind: 'sticker', palette: 'stickers' },
  { id: 'pelo', name: 'Pelo', icon: 'hair', kind: 'hair', palette: 'hair' },
  { id: 'accesorios', name: 'Extras', icon: 'crown', kind: 'accessory', palette: 'accessories' },
  { id: 'algodon', name: 'Algodón', icon: 'cotton', kind: 'erase', brush: { size: 34 } },
  { id: 'agua', name: 'Agua', icon: 'water', kind: 'clean' },
];

// Retos de look: requisitos por capa con rango de tono (hue, grados) y cobertura mínima.
export const LOOKS = [
  { id: 'rosa', name: 'Fiesta rosa', desc: 'Labios rosa, rubor y algo de brillo', reward: [30, 60, 100], requires: [
    { layer: 'lips', hue: [310, 360], min: 0.5 }, { layer: 'blush', min: 0.3 }, { layer: 'gloss', min: 0.2 },
  ] },
  { id: 'galaxia', name: 'Noche galáctica', desc: 'Sombra morada o azul, delineador y purpurina', reward: [40, 80, 120], requires: [
    { layer: 'shadow', hue: [200, 300], min: 0.4 }, { layer: 'liner', min: 0.4 }, { layer: 'glitter', min: 0.15 },
  ] },
  { id: 'natural', name: 'Natural de día', desc: 'Base, un toque de rubor y labios suaves', reward: [30, 60, 100], requires: [
    { layer: 'base', min: 0.4 }, { layer: 'blush', min: 0.2 }, { layer: 'lips', hue: [340, 380], min: 0.3 },
  ] },
  { id: 'princesa', name: 'Princesa', desc: 'Labios rojos, pestañas largas, tiara y pegatinas', reward: [50, 90, 140], requires: [
    { layer: 'lips', hue: [340, 375], min: 0.5 }, { lashes: 0.6 }, { accessory: 'tiara' }, { stickers: 3 },
  ] },
  { id: 'arcoiris', name: 'Arcoíris', desc: 'Sombra verde o amarilla, labios naranja y muchas pegatinas', reward: [50, 90, 140], requires: [
    { layer: 'shadow', hue: [50, 160], min: 0.4 }, { layer: 'lips', hue: [15, 45], min: 0.4 }, { stickers: 5 },
  ] },
];

export const PACKS = {
  galaxia: { name: 'Pack Galaxia', desc: 'Morados, azules, diamantes y mariposas.' },
  neon: { name: 'Pack Neón', desc: 'Colores vivos, lazos y corona.' },
};

export const IAP_CATALOG = [
  { sku: 'pack_princesa', title: 'Pack Princesa', desc: 'Desbloquea todas las paletas, pegatinas, extras y personajes.', priceLabel: '3,99 USD', type: 'nonconsumable', grant: { unlockAll: true } },
  { sku: 'no_ads', title: 'Sin anuncios', desc: 'Sin anuncios entre looks.', priceLabel: '2,99 USD', type: 'nonconsumable', grant: { noAds: true } },
  { sku: 'coins_500', title: '500 monedas', desc: 'Para desbloquear colores y pegatinas.', priceLabel: '0,99 USD', type: 'consumable', grant: { coins: 500 } },
];

export const TEXT = {
  tapToStart: 'Toca para empezar',
  free: 'Modo libre',
  looks: 'Retos',
  gallery: 'Galería',
  done: '¡Listo!',
  praise: ['¡Preciosa!', '¡Qué bonito!', '¡Brilla!', '¡Me encanta!', '¡Divina!'],
};
