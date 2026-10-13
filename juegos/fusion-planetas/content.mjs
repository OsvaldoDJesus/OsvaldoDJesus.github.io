// Datos y balance de Fusión de Planetas.
export const GAME = {
  id: 'fusion-planetas',
  title: 'Fusión de Planetas',
  version: '0.1.0',
  saveVersion: 1,
  width: 480,
  height: 800,
};

// Recipiente y físicas (coordenadas lógicas).
export const WORLD = {
  left: 40,
  right: 440,
  floor: 740,
  top: 180,          // borde superior del recipiente (visual)
  dangerY: 215,      // línea de peligro: cuerpos quietos por encima → cuenta atrás
  dropY: 130,        // altura desde la que se suelta
  gravity: 1500,
  restitution: 0.12,
  friction: 0.985,
  substeps: 4,
  dropCooldown: 0.45,
  dangerSeconds: 1.6,
  mergeMinAge: 0.08, // s: evita fusiones en el mismo frame del spawn
  comboWindow: 1.3,
  maxCombo: 5,
  maxBodies: 90,
  supernovaRadius: 220,
};

// Niveles (tiers). radius en px lógicos; points = número triangular.
export const TIERS = [
  { name: 'Luna', radius: 18 },
  { name: 'Mercurio', radius: 25 },
  { name: 'Marte', radius: 33 },
  { name: 'Venus', radius: 41 },
  { name: 'Tierra', radius: 50 },
  { name: 'Neptuno', radius: 60 },
  { name: 'Urano', radius: 71 },
  { name: 'Saturno', radius: 84 },
  { name: 'Júpiter', radius: 98 },
  { name: 'Sol', radius: 114 },
].map((t, i) => ({ ...t, points: ((i + 1) * (i + 2)) / 2 }));

export const SUPERNOVA_POINTS = 300;

// Pesos de aparición por nivel (solo los cinco primeros pueden caer).
export const SPAWN_WEIGHTS = [34, 30, 18, 11, 7];

// Skins: paleta y nombres alternativos. Los nombres del tema por defecto son los de TIERS.
export const SKINS = [
  { id: 'planetas', name: 'Planetas', cost: 0, colors: ['#d9d9d9', '#b5a089', '#e2654b', '#e9c46a', '#4a90e2', '#3f51b5', '#7fd1e0', '#e8c48a', '#d9a066', '#ffb703'], bg: ['#090a1f', '#1b1140'] },
  { id: 'frutas', name: 'Frutas', cost: 400, names: ['Cereza', 'Fresa', 'Uva', 'Mandarina', 'Naranja', 'Manzana', 'Pera', 'Melocotón', 'Piña', 'Sandía'], colors: ['#d7263d', '#ff4d6d', '#8338ec', '#ff9f1c', '#ff7b00', '#e63946', '#a7c957', '#ffb4a2', '#f4d35e', '#2a9d8f'], bg: ['#1b2a1b', '#2d4a2d'] },
  { id: 'dulces', name: 'Dulces', cost: 400, names: ['Caramelo', 'Gominola', 'Bombón', 'Galleta', 'Donut', 'Cupcake', 'Helado', 'Tarta', 'Piñata', 'Pastelón'], colors: ['#ffafcc', '#ff8fab', '#cdb4db', '#ffc8dd', '#bde0fe', '#a2d2ff', '#fde2e4', '#fad2e1', '#e2ece9', '#bee1e6'], bg: ['#2b1b2f', '#4a2b50'] },
  { id: 'gemas', name: 'Gemas', cost: 800, names: ['Cuarzo', 'Ámbar', 'Topacio', 'Jade', 'Zafiro', 'Amatista', 'Rubí', 'Esmeralda', 'Ópalo', 'Diamante'], colors: ['#f1faee', '#ffb703', '#fb8500', '#52b788', '#4361ee', '#9d4edd', '#e63946', '#2a9d8f', '#f7d6e0', '#caf0f8'], bg: ['#0b0f1a', '#1f2a44'] },
];

export const IAP_CATALOG = [
  { sku: 'no_ads', title: 'Sin anuncios', desc: 'Elimina los anuncios entre partidas. Los anuncios con recompensa siguen disponibles si los quieres.', priceLabel: '2,99 USD', type: 'nonconsumable', grant: { noAds: true } },
  { sku: 'skins_pack', title: 'Pack de temas', desc: 'Desbloquea Frutas, Dulces y Gemas de una vez.', priceLabel: '1,99 USD', type: 'nonconsumable', grant: { skins: ['frutas', 'dulces', 'gemas'] } },
  { sku: 'gems_50', title: '50 gemas', desc: 'Para deshacer o continuar sin anuncios.', priceLabel: '0,99 USD', type: 'consumable', grant: { gems: 50 } },
];

export const GEM_COSTS = { undo: 3, continue: 8 };

export const TEXT = {
  classic: 'Clásico',
  daily: 'Reto diario',
  shop: 'Temas',
  tapToStart: 'Toca para empezar',
  gameOver: '¡Se desbordó!',
};
