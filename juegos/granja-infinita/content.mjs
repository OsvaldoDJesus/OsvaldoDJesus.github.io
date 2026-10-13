// Datos y balance de Granja Infinita. Las curvas se explican en docs/diseno.md.
// Cambiar números aquí no exige tocar el motor.

export const GAME = {
  id: 'granja-infinita',
  title: 'Granja Infinita',
  version: '0.1.0',
  saveVersion: 1,
  width: 480,
  height: 800,
};

// Escala entre eras: cada era multiplica el valor de sus cultivos por CROP_SCALE
// y además aplica un multiplicador global ERA_MULT acumulativo. El coste de la
// siguiente era crece ERA_COST_SCALE veces: con ingresos ×~20 por era, el tiempo
// por era se mantiene (≈8–12 min base) y las mejoras/prestigio lo acortan.
export const BALANCE = {
  CROP_SCALE: 8,
  ERA_MULT: 2,
  ERA_COST_BASE: 2000,
  ERA_COST_SCALE: 22,
  UPGRADE_ERA_SCALE: 16,     // las mejoras cuestan ×16 por era, como los cultivos: siguen importando en cada era
  GRID_MIN: 3,
  GRID_MAX: 7,
  OFFLINE_HOURS_BASE: 4,
  OFFLINE_EFFICIENCY: 0.6,
  PRESTIGE_MIN_ERA: 2,
  MEDAL_MULT: 1.08,          // multiplicador por medalla (acumulativo)
  MILESTONES: [0.25, 0.5, 0.75], // fracciones del coste de era que dan una gema
  GEMS_PER_ERA: 5,
  EVENT_FIRST_DELAY: 60,     // s de sesión antes del primer evento
  EVENT_INTERVAL: [70, 130], // s entre eventos
  WEATHER: {
    soleado: { dur: [90, 150], grow: 1.0, value: 1.0, w: 5 },
    lluvia: { dur: [45, 75], grow: 1.6, value: 1.0, w: 3 },
    sequia: { dur: [40, 70], grow: 0.55, value: 1.0, w: 2 },
    niebla: { dur: [40, 60], grow: 0.85, value: 1.25, w: 1 },
  },
};

// Plantillas de cultivos por era: tiempo en segundos y valor relativo.
// El valor absoluto = rel × CROP_SCALE^era. Coste de desbloqueo = unlock × 16^era.
const TEMPLATE = [
  { slot: 0, time: 5, rel: 1, unlock: 0 },
  { slot: 1, time: 12, rel: 3.5, unlock: 25 },
  { slot: 2, time: 30, rel: 12, unlock: 150 },
  { slot: 3, time: 75, rel: 40, unlock: 900 },
];

const HANDMADE = [
  { era: 0, name: 'Granjero', crops: [
    { id: 'zanahoria', name: 'Zanahoria', color: '#ff8c42', leaf: '#5cb85c', shape: 'root' },
    { id: 'trigo', name: 'Trigo', color: '#f4d35e', leaf: '#c9b458', shape: 'stalk' },
    { id: 'maiz', name: 'Maíz', color: '#ffe066', leaf: '#4caf50', shape: 'cob' },
    { id: 'calabaza', name: 'Calabaza', color: '#ff7f11', leaf: '#3e8e41', shape: 'round' },
  ] },
  { era: 1, name: 'Cooperativa', crops: [
    { id: 'tomate', name: 'Tomate', color: '#e63946', leaf: '#4caf50', shape: 'round' },
    { id: 'fresa', name: 'Fresa', color: '#ff2e63', leaf: '#3e8e41', shape: 'berry' },
    { id: 'uva', name: 'Uva', color: '#7b2cbf', leaf: '#4caf50', shape: 'berry' },
    { id: 'sandia', name: 'Sandía', color: '#2a9d8f', leaf: '#3e8e41', shape: 'round' },
  ] },
  { era: 2, name: 'Mecanización', crops: [
    { id: 'soja', name: 'Soja', color: '#a7c957', leaf: '#6a994e', shape: 'stalk' },
    { id: 'cafe', name: 'Café', color: '#6f4e37', leaf: '#386641', shape: 'berry' },
    { id: 'cacao', name: 'Cacao', color: '#8d5524', leaf: '#4caf50', shape: 'cob' },
    { id: 'girasol', name: 'Girasol', color: '#ffbe0b', leaf: '#4caf50', shape: 'flower' },
  ] },
  { era: 3, name: 'Industria', crops: [
    { id: 'algodon', name: 'Algodón', color: '#f8f9fa', leaf: '#6a994e', shape: 'berry' },
    { id: 'cana', name: 'Caña', color: '#b5e48c', leaf: '#52b788', shape: 'stalk' },
    { id: 'arroz', name: 'Arroz', color: '#e9edc9', leaf: '#a3b18a', shape: 'stalk' },
    { id: 'palma', name: 'Palma', color: '#e76f51', leaf: '#2d6a4f', shape: 'cob' },
  ] },
  { era: 4, name: 'Agroindustria', crops: [
    { id: 'quinoa', name: 'Quinoa', color: '#f2cc8f', leaf: '#81b29a', shape: 'stalk' },
    { id: 'aguacate', name: 'Aguacate', color: '#588157', leaf: '#3a5a40', shape: 'round' },
    { id: 'pistacho', name: 'Pistacho', color: '#b7e4c7', leaf: '#40916c', shape: 'berry' },
    { id: 'azafran', name: 'Azafrán', color: '#9d4edd', leaf: '#5a189a', shape: 'flower' },
  ] },
  { era: 5, name: 'Biotecnología', crops: [
    { id: 'trigo-dorado', name: 'Trigo dorado', color: '#ffd60a', leaf: '#ffc300', shape: 'stalk' },
    { id: 'fruta-cristal', name: 'Fruta cristal', color: '#90e0ef', leaf: '#48cae4', shape: 'round' },
    { id: 'flor-neon', name: 'Flor neón', color: '#ff006e', leaf: '#8338ec', shape: 'flower' },
    { id: 'hongo-lumen', name: 'Hongo lumen', color: '#caffbf', leaf: '#9bf6ff', shape: 'round' },
  ] },
  { era: 6, name: 'Granja Orbital', crops: [
    { id: 'alga-espacial', name: 'Alga espacial', color: '#06d6a0', leaf: '#118ab2', shape: 'stalk' },
    { id: 'cactus-lunar', name: 'Cactus lunar', color: '#adb5bd', leaf: '#6c757d', shape: 'cob' },
    { id: 'fruta-estelar', name: 'Fruta estelar', color: '#ffd166', leaf: '#ef476f', shape: 'berry' },
    { id: 'loto-cuantico', name: 'Loto cuántico', color: '#c77dff', leaf: '#7b2cbf', shape: 'flower' },
  ] },
];

const PROC_ADJ = ['Cuántica', 'Estelar', 'Galáctica', 'Dimensional', 'Cósmica', 'Mítica', 'Eterna', 'Fractal', 'Celeste', 'Infinita'];
const PROC_CROP = ['Raíz', 'Grano', 'Fruta', 'Flor'];
const PROC_SHAPES = ['root', 'stalk', 'berry', 'flower'];

function roman(n) {
  const map = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  for (const [v, s] of map) while (n >= v) { out += s; n -= v; }
  return out;
}

function hsl(h, s, l) { return `hsl(${((h % 360) + 360) % 360} ${s}% ${l}%)`; }

// Devuelve la definición de una era (nombre y cultivos con valores absolutos).
// Las eras más allá de las escritas a mano se generan de forma determinista.
export function eraDef(era) {
  const hand = HANDMADE[era];
  let name, cropsMeta;
  if (hand) { name = hand.name; cropsMeta = hand.crops; }
  else {
    const k = era - HANDMADE.length;
    name = `Era ${PROC_ADJ[k % PROC_ADJ.length]} ${roman(Math.floor(k / PROC_ADJ.length) + 1)}`;
    cropsMeta = PROC_CROP.map((base, i) => ({
      id: `proc-${era}-${i}`,
      name: `${base} ${PROC_ADJ[(k + i) % PROC_ADJ.length].toLowerCase()}`,
      color: hsl(era * 47 + i * 90, 70, 60),
      leaf: hsl(era * 47 + i * 90 + 120, 50, 45),
      shape: PROC_SHAPES[i],
    }));
  }
  const scale = Math.pow(BALANCE.CROP_SCALE, era);
  const unlockScale = Math.pow(16, era);
  const crops = cropsMeta.map((c, i) => ({
    ...c,
    era,
    time: TEMPLATE[i].time,
    value: TEMPLATE[i].rel * scale,          // número normal; el motor lo convierte a Big
    unlock: TEMPLATE[i].unlock * unlockScale,
  }));
  return { era, name, crops };
}

export function eraCost(era) {
  // Coste para pasar de `era` a `era + 1`.
  return BALANCE.ERA_COST_BASE * Math.pow(BALANCE.ERA_COST_SCALE, era);
}

export function gridSize(era) {
  return Math.min(BALANCE.GRID_MAX, BALANCE.GRID_MIN + era);
}

// Mejoras: coste geométrico base × r^nivel, con tope de nivel.
export const UPGRADES = [
  { id: 'herramientas', name: 'Herramientas', desc: '+15% valor de cosecha', base: 50, r: 1.6, max: 60, icon: 'tool' },
  { id: 'riego', name: 'Riego', desc: '−4% tiempo de cultivo y protege de la sequía', base: 80, r: 1.8, max: 25, icon: 'water' },
  { id: 'abono', name: 'Abono', desc: '+10% valor de cosecha', base: 200, r: 1.9, max: 40, icon: 'leaf' },
  { id: 'jornaleros', name: 'Jornaleros', desc: 'Cosechan solos; más nivel, más rápido', base: 500, r: 2.2, max: 12, icon: 'worker' },
  { id: 'sembradora', name: 'Sembradora', desc: 'Replanta sola el cultivo elegido', base: 2500, r: 1, max: 1, icon: 'seed' },
  { id: 'mercado', name: 'Mercado', desc: '+25% precio de venta', base: 1500, r: 2.5, max: 30, icon: 'market' },
  { id: 'silo', name: 'Silo', desc: '+1 h de ganancias sin conexión', base: 3000, r: 3, max: 8, icon: 'silo' },
];

export const GEM_SHOP = [
  { id: 'cosecha_ya', name: 'Cosecha instantánea', desc: 'Madura todos los cultivos ahora', gems: 3 },
  { id: 'turbo', name: 'Turbo ×2 (10 min)', desc: 'Duplica ingresos durante 10 minutos', gems: 10 },
];

export const IAP_CATALOG = [
  { sku: 'no_ads', title: 'Sin anuncios', desc: 'Elimina los anuncios entre eras. Los anuncios con recompensa siguen disponibles si los quieres.', priceLabel: '2,99 USD', type: 'nonconsumable', grant: { noAds: true } },
  { sku: 'gems_80', title: '80 gemas', desc: 'Para cosechas instantáneas y turbos.', priceLabel: '0,99 USD', type: 'consumable', grant: { gems: 80 } },
  { sku: 'gems_500', title: '500 gemas', desc: 'El paquete grande.', priceLabel: '4,99 USD', type: 'consumable', grant: { gems: 500 } },
  { sku: 'granja_dorada', title: 'Granja dorada', desc: 'Ingresos ×2 permanentes y 100 gemas.', priceLabel: '9,99 USD', type: 'nonconsumable', grant: { golden: true, gems: 100 } },
];

export const EVENTS = {
  feria: { name: 'Feria del pueblo', desc: '¡Todo se vende ×3 durante 45 s!', dur: 45, w: 3 },
  plaga: { name: '¡Plaga!', desc: 'Toca los bichos antes de que dañen la cosecha.', dur: 30, w: 3, bugs: 6 },
  comerciante: { name: 'Comerciante', desc: 'Te ofrece ×2 ingresos durante 3 min si ves un anuncio.', dur: 20, w: 2 },
  cofre: { name: 'Cofre perdido', desc: 'Tócalo para abrirlo.', dur: 25, w: 2 },
};

export const ACHIEVEMENTS = [
  { id: 'primera', name: 'Primera cosecha', test: (s) => s.stats.harvests >= 1, gems: 1 },
  { id: 'cien', name: '100 cosechas', test: (s) => s.stats.harvests >= 100, gems: 2 },
  { id: 'mil', name: '1.000 cosechas', test: (s) => s.stats.harvests >= 1000, gems: 5 },
  { id: 'era1', name: 'Cooperativa fundada', test: (s) => s.era >= 1, gems: 2 },
  { id: 'era3', name: 'Industrial', test: (s) => s.era >= 3, gems: 5 },
  { id: 'herencia', name: 'Primera herencia', test: (s) => s.stats.prestiges >= 1, gems: 10 },
  { id: 'bichos', name: 'Exterminador', test: (s) => s.stats.bugs >= 30, gems: 3 },
];

export const TEXT = {
  tapToStart: 'Toca para empezar',
  tabs: ['Cultivos', 'Mejoras', 'Era', 'Más'],
  welcomeBack: 'Bienvenido de vuelta',
};
