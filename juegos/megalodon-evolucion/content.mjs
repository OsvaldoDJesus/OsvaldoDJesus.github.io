// Datos y balance de Megalodón: Evolución. Cambiar números aquí no exige tocar el motor.
// Las fórmulas de escala (HP, mordida, XP, ingresos) están en BALANCE; las presas y depredadores
// se describen por "etapa de referencia" para que el balance se mantenga al reordenar mundos.
// Ritmo validado con la simulación de tests/ritmo.test.mjs (docs/megalodon-evolucion-diseno.md).

export const GAME = {
  id: 'megalodon-evolucion',
  title: 'Megalodón: Evolución',
  version: '0.1.0',
  saveVersion: 1,
  width: 960,   // lienzo apaisado 16:9; la nitidez 4K sale del DPR, no de esta resolución lógica
  height: 540,
};

export const BALANCE = {
  xpBase: 40, xpGrowth: 6.2,            // XP para evolucionar: 40 · 6,2^etapa (crece más que la comida: cada etapa pide más piezas)
  preyGrowth: 4.0,                      // XP base de la comida: k · 4^etapa mínima
  hpBase: 40, hpGrowth: 2.2,
  biteBase: 12, biteGrowth: 2.3,
  incomeGrowth: 3.6,                    // ingresos pasivos por etapa
  costStageGrowth: 4.0,                 // el coste de las mejoras sube con la etapa (como la era en Granja Infinita)
  chainWindow: 1.3, chainStep: 0.08, chainMax: 12,
  lungeDuration: 0.32, lungeCooldown: 1.6, lungeSpeedMult: 2.6,
  invulnAfterHit: 0.8, regenDelay: 4, regenRate: 0.03,
  deathCoinLoss: 0.12, respawnInvuln: 3,
  offlineHours: 4, offlineEfficiency: 0.6,
  megaGrowthCap: 1.35,                  // el Megalodón sigue creciendo con la XP sobrante hasta ×1,35
  medalMult: 1.25,                      // cada "Diente" de ascensión multiplica ingresos
  respawnPredSeconds: 90,
  exitWidth: 160,
  xpCapFactor: 1.25,                    // XP máxima acumulable por etapa (evita cascadas de evolución)
  blStart: 5.0, blEnd: 1.8,             // longitudes de cuerpo por segundo (velocidad base)
  onScreen: [80, 330],                  // tamaño en pantalla del pez (px lógicos): da el zoom de cámara
};

// Etapas de evolución. `world` = mundo mínimo en el que se puede evolucionar a ella.
export const STAGES = [
  { id: 'alevin', name: 'Alevín', world: 0, len: 26, blurb: 'Diminuto y hambriento.' },
  { id: 'damisela', name: 'Pez Damisela', world: 0, len: 38, blurb: 'Rápido y atrevido.' },
  { id: 'angel', name: 'Pez Ángel', world: 0, len: 56, blurb: 'Rey del arrecife.' },
  { id: 'perca', name: 'Perca', world: 1, len: 80, blurb: 'Una espina para cada enemigo.' },
  { id: 'pirana', name: 'Piraña', world: 1, len: 108, blurb: 'Dientes de navaja.' },
  { id: 'lucio', name: 'Lucio', world: 1, len: 150, blurb: 'Emboscador del lago.' },
  { id: 'atun', name: 'Atún', world: 2, len: 205, blurb: 'Un torpedo de músculo.' },
  { id: 'barracuda', name: 'Barracuda', world: 2, len: 280, blurb: 'Colmillos y velocidad.' },
  { id: 'martillo', name: 'Tiburón Martillo', world: 2, len: 360, blurb: 'Siente a sus presas desde lejos.' },
  { id: 'tigre', name: 'Tiburón Tigre', world: 3, len: 440, blurb: 'Come de todo.' },
  { id: 'blanco', name: 'Tiburón Blanco', world: 3, len: 540, blurb: 'El depredador perfecto… por ahora.' },
  { id: 'megalodon', name: 'Megalodón', world: 4, len: 700, blurb: 'El mayor tiburón que existió.' },
];

// exitStage = etapa necesaria para pasar al siguiente mundo; `bossId` debe caer para avanzar.
export const WORLDS = [
  { id: 'arrecife', name: 'Arrecife de Coral', tagline: 'Aguas tibias y cristalinas', size: { w: 3200, h: 1500 }, floor: 0.9, relief: 70, seed: 1.3, minStage: 0, exitStage: 2, bossId: null, current: { x: 10, y: 0 } },
  { id: 'lago', name: 'Lago de los Cocodrilos', tagline: 'Agua turbia y mandíbulas', size: { w: 3600, h: 1100 }, floor: 0.9, relief: 60, seed: 2.7, minStage: 2, exitStage: 5, bossId: 'rey-cocodrilo', current: { x: -6, y: 0 } },
  { id: 'oceano', name: 'Océano Abierto', tagline: 'Azul infinito', size: { w: 7000, h: 3000 }, floor: 0.92, relief: 140, seed: 4.1, minStage: 5, exitStage: 8, bossId: 'orca-matriarca', current: { x: 18, y: 0 } },
  { id: 'fosa', name: 'Fosa Abisal', tagline: 'Donde la luz no llega', size: { w: 5200, h: 4200 }, floor: 0.93, relief: 200, seed: 5.9, minStage: 8, exitStage: 10, bossId: 'calamar-colosal', current: { x: 0, y: -4 } },
  { id: 'mioceno', name: 'Mar Prehistórico', tagline: 'Hace 15 millones de años', size: { w: 8000, h: 3400 }, floor: 0.92, relief: 180, seed: 7.7, minStage: 10, exitStage: 11, bossId: 'livyatan', current: { x: 12, y: 2 } },
];

// k multiplica el XP base de su etapa (4^minStage). Monedas = 70% de la XP.
// behavior: drift | wander | bob | floor. school = tamaño de cardumen. perView = cuántos por pantalla.
export const PREY = [
  // ----- Arrecife -----
  { id: 'plancton', name: 'Plancton', art: 'plancton', world: 0, minStage: 0, k: 1.0, r: 2.2, speed: 5, behavior: 'drift', perView: 9.8, y: [0.05, 0.88] },
  { id: 'camaron', name: 'Camarón', art: 'camaron', world: 0, minStage: 1, k: 1.0, r: 4.5, speed: 26, behavior: 'wander', flee: true, perView: 3.5, y: [0.3, 0.88] },
  { id: 'pececillo', name: 'Pececillo', art: 'pez', variant: 'reef', world: 0, minStage: 2, k: 0.85, r: 8, speed: 55, behavior: 'wander', flee: true, school: [4, 7], perView: 0.84, y: [0.15, 0.8] },
  { id: 'cangrejo', name: 'Cangrejo', art: 'cangrejo', variant: 'mar', world: 0, minStage: 2, k: 1.3, r: 10, speed: 14, behavior: 'floor', perView: 1.4, y: [0.9, 0.9] },
  { id: 'medusa-pequena', name: 'Medusa', art: 'medusa', variant: 'rosa', world: 0, minStage: 2, k: 1.5, r: 12, speed: 10, behavior: 'bob', perView: 1.4, y: [0.1, 0.7] },
  // ----- Lago -----
  { id: 'renacuajo', name: 'Renacuajo', art: 'pez', variant: 'tadpole', world: 1, minStage: 2, k: 0.7, r: 6, speed: 40, behavior: 'wander', flee: true, perView: 3.36, y: [0.05, 0.6] },
  { id: 'rana', name: 'Rana', art: 'rana', world: 1, minStage: 3, k: 1.0, r: 14, speed: 36, behavior: 'wander', flee: true, perView: 1.44, y: [0.04, 0.4] },
  { id: 'cangrejo-rio', name: 'Cangrejo de río', art: 'cangrejo', variant: 'rio', world: 1, minStage: 3, k: 0.8, r: 12, speed: 14, behavior: 'floor', perView: 0.96, y: [0.9, 0.9] },
  { id: 'carpita', name: 'Carpita', art: 'pez', variant: 'carp', world: 1, minStage: 4, k: 1.0, r: 20, speed: 70, behavior: 'wander', flee: true, school: [3, 5], perView: 0.38, y: [0.1, 0.8] },
  { id: 'carpa', name: 'Carpa', art: 'pez', variant: 'carp', world: 1, minStage: 5, k: 1.2, r: 32, speed: 60, behavior: 'wander', flee: true, perView: 0.48, y: [0.15, 0.8] },
  // ----- Océano -----
  { id: 'sardina', name: 'Sardina', art: 'pez', variant: 'sardine', world: 2, minStage: 5, k: 0.5, r: 9, speed: 120, behavior: 'wander', flee: true, school: [14, 22], perView: 0.18, y: [0.08, 0.8] },
  { id: 'macarela', name: 'Macarela', art: 'pez', variant: 'mackerel', world: 2, minStage: 6, k: 1.0, r: 22, speed: 130, behavior: 'wander', flee: true, school: [4, 7], perView: 0.16, y: [0.08, 0.8] },
  { id: 'calamar', name: 'Calamar', art: 'calamar', variant: 'mar', world: 2, minStage: 7, k: 1.1, r: 34, speed: 90, behavior: 'wander', flee: true, perView: 0.18, y: [0.1, 0.85] },
  { id: 'medusa-luna', name: 'Medusa luna', art: 'medusa', variant: 'luna', world: 2, minStage: 7, k: 1.4, r: 48, speed: 12, behavior: 'bob', perView: 0.26, y: [0.05, 0.8] },
  { id: 'raya', name: 'Mantarraya', art: 'raya', world: 2, minStage: 8, k: 1.3, r: 80, speed: 70, behavior: 'wander', perView: 0.13, y: [0.1, 0.85] },
  // ----- Fosa -----
  { id: 'krill', name: 'Krill brillante', art: 'camaron', variant: 'glow', world: 3, minStage: 8, k: 0.5, r: 6, speed: 40, behavior: 'wander', flee: true, school: [18, 28], perView: 0.18, glow: true, y: [0.05, 0.9] },
  { id: 'pez-linterna', name: 'Pez linterna', art: 'pez', variant: 'lantern', world: 3, minStage: 9, k: 0.9, r: 28, speed: 80, behavior: 'wander', flee: true, school: [5, 9], perView: 0.18, glow: true, y: [0.05, 0.9] },
  { id: 'medusa-abisal', name: 'Medusa abisal', art: 'medusa', variant: 'abisal', world: 3, minStage: 9, k: 1.3, r: 60, speed: 12, behavior: 'bob', perView: 0.22, glow: true, y: [0.05, 0.9] },
  { id: 'calamar-luminoso', name: 'Calamar luminoso', art: 'calamar', variant: 'glow', world: 3, minStage: 10, k: 1.1, r: 90, speed: 100, behavior: 'wander', flee: true, perView: 0.13, glow: true, y: [0.05, 0.9] },
  { id: 'pez-viperino', name: 'Pez víbora', art: 'pez', variant: 'viper', world: 3, minStage: 10, k: 1.3, r: 75, speed: 90, behavior: 'wander', flee: true, perView: 0.11, glow: true, y: [0.05, 0.9] },
  // ----- Mar prehistórico -----
  { id: 'ammonite', name: 'Ammonite', art: 'ammonite', world: 4, minStage: 10, k: 1.0, r: 70, speed: 18, behavior: 'wander', perView: 0.41, y: [0.08, 0.85] },
  { id: 'pez-prehistorico', name: 'Pez acorazado', art: 'pez', variant: 'prehistoric', world: 4, minStage: 10, k: 1.1, r: 50, speed: 100, behavior: 'wander', flee: true, school: [4, 6], perView: 0.19, y: [0.08, 0.85] },
  { id: 'tortuga', name: 'Tortuga gigante', art: 'tortuga', world: 4, minStage: 11, k: 0.8, r: 140, speed: 60, behavior: 'wander', perView: 0.14, y: [0.08, 0.85] },
  { id: 'ballena-cria', name: 'Ballena cría', art: 'ballena', world: 4, minStage: 11, k: 2.0, r: 260, speed: 90, behavior: 'wander', perView: 0.07, y: [0.08, 0.8] },
];

// Depredadores: se definen por la etapa a la que se enfrentan (refStage). hp = hpHits · mordida(refStage),
// daño = dmgFrac · HP(refStage), XP = xpK · 4^refStage.
export const PREDATORS = [
  { id: 'morena', name: 'Morena', art: 'morena', world: 0, len: 95, refStage: 1, hpHits: 3, dmgFrac: 0.22, speed: 150, detect: 150, attackRange: 60, windup: 0.5, cooldown: 1.5, xpK: 4, count: 3, y: [0.8, 0.9] },
  { id: 'cocodrilo', name: 'Cocodrilo', art: 'cocodrilo', world: 1, len: 330, refStage: 3, hpHits: 7, dmgFrac: 0.2, speed: 230, detect: 520, attackRange: 130, windup: 0.6, cooldown: 1.1, xpK: 2.5, count: 3, y: [0.02, 0.38], maxDepth: 0.55 },
  { id: 'rey-cocodrilo', name: 'Rey Cocodrilo', art: 'cocodrilo', variant: 'rey', boss: true, world: 1, len: 620, refStage: 5, hpHits: 24, dmgFrac: 0.15, speed: 290, detect: 820, attackRange: 220, windup: 0.5, cooldown: 0.9, xpK: 6, count: 1, y: [0.02, 0.3], maxDepth: 0.6 },
  { id: 'orca', name: 'Orca', art: 'orca', world: 2, len: 520, refStage: 7, hpHits: 10, dmgFrac: 0.25, speed: 520, detect: 900, attackRange: 230, windup: 0.5, cooldown: 1.0, xpK: 2.5, count: 2, y: [0.05, 0.6] },
  { id: 'orca-matriarca', name: 'Orca Matriarca', art: 'orca', variant: 'matriarca', boss: true, world: 2, len: 820, refStage: 8, hpHits: 28, dmgFrac: 0.15, speed: 560, detect: 1200, attackRange: 330, windup: 0.45, cooldown: 0.85, xpK: 6, count: 1, y: [0.05, 0.5] },
  { id: 'pejesapo', name: 'Pejesapo abisal', art: 'pejesapo', world: 3, len: 190, refStage: 9, hpHits: 7, dmgFrac: 0.26, speed: 300, detect: 520, attackRange: 120, windup: 0.5, cooldown: 1.3, xpK: 2.5, count: 3, y: [0.45, 0.88] },
  { id: 'calamar-colosal', name: 'Calamar Colosal', art: 'calamar-colosal', boss: true, world: 3, len: 1150, refStage: 10, hpHits: 32, dmgFrac: 0.14, speed: 420, detect: 1300, attackRange: 420, windup: 0.6, cooldown: 0.9, xpK: 6, count: 1, y: [0.45, 0.8] },
  { id: 'dunkleosteus', name: 'Dunkleosteus', art: 'dunkleosteus', world: 4, len: 640, refStage: 11, hpHits: 10, dmgFrac: 0.26, speed: 600, detect: 1000, attackRange: 260, windup: 0.5, cooldown: 1.2, xpK: 2.5, count: 2, y: [0.1, 0.8] },
  { id: 'livyatan', name: 'Livyatan', art: 'livyatan', boss: true, world: 4, len: 1500, refStage: 11, hpHits: 38, dmgFrac: 0.13, speed: 640, detect: 1600, attackRange: 520, windup: 0.5, cooldown: 0.85, xpK: 8, count: 1, y: [0.15, 0.7] },
];

// Mejoras: coste = base · r^nivel · costStageGrowth^etapa.
export const UPGRADES = [
  { id: 'digestion', name: 'Digestión', desc: '+20% XP y monedas por comida', base: 6, r: 1.55, max: 80, icon: 'stomach' },
  { id: 'aletas', name: 'Aletas', desc: '+6% velocidad de nado', base: 10, r: 1.5, max: 40, icon: 'fin' },
  { id: 'mandibula', name: 'Mandíbula', desc: '+12% daño de mordida y +4% alcance', base: 15, r: 1.6, max: 60, icon: 'jaw' },
  { id: 'olfato', name: 'Olfato', desc: 'Atrae la comida desde más lejos', base: 12, r: 1.55, max: 30, icon: 'nose' },
  { id: 'branquias', name: 'Branquias', desc: '+10% vida máxima y regeneración', base: 25, r: 1.6, max: 50, icon: 'gill' },
  { id: 'escamas', name: 'Escamas', desc: '−3% daño recibido (máx. 60%)', base: 40, r: 1.7, max: 20, icon: 'scale' },
  { id: 'frenesi', name: 'Frenesí', desc: 'Combos más largos y más generosos', base: 30, r: 1.7, max: 25, icon: 'flame' },
  { id: 'impulso', name: 'Impulso', desc: 'Mordisco más frecuente', base: 35, r: 1.65, max: 20, icon: 'bolt' },
  { id: 'cardumen', name: 'Cardumen aliado', desc: 'Gana monedas solo, incluso sin conexión', base: 100, r: 1.9, max: 60, icon: 'school' },
];

export const GEM_SHOP = [
  { id: 'banquete', name: 'Banquete', desc: 'Añade el 25% de la XP de la etapa', gems: 15 },
  { id: 'turbo', name: 'Turbo ×2 (10 min)', desc: 'Duplica XP y monedas', gems: 10 },
  { id: 'curar', name: 'Curación total', desc: 'Restaura toda tu vida', gems: 3 },
];

export const IAP_CATALOG = [
  { sku: 'no_ads', title: 'Sin anuncios', desc: 'Elimina los anuncios entre combates. Los anuncios con recompensa siguen disponibles si los quieres.', priceLabel: '2,99 USD', type: 'nonconsumable', grant: { noAds: true } },
  { sku: 'perlas_80', title: '80 perlas', desc: 'Para banquetes, turbos y curaciones.', priceLabel: '0,99 USD', type: 'consumable', grant: { gems: 80 } },
  { sku: 'perlas_500', title: '500 perlas', desc: 'El paquete grande.', priceLabel: '4,99 USD', type: 'consumable', grant: { gems: 500 } },
  { sku: 'megalodon_dorado', title: 'Megalodón dorado', desc: 'XP y monedas ×2 permanentes, piel dorada y 100 perlas.', priceLabel: '9,99 USD', type: 'nonconsumable', grant: { golden: true, gems: 100 } },
];

// Calidad gráfica: dpr = densidad máxima del lienzo; tex = escala de las texturas horneadas.
export const QUALITY = {
  auto: { label: 'Automática', dpr: 2, effects: 2, tex: 1 },
  low: { label: 'Baja', dpr: 1, effects: 0, tex: 0.5 },
  high: { label: 'Alta', dpr: 2, effects: 1, tex: 1 },
  ultra: { label: '4K Ultra', dpr: 3, effects: 2, tex: 2 },
};

export const TEXT = {
  tapToStart: 'Toca para sumergirte',
  tabs: ['Mejoras', 'Evolución', 'Más'],
  welcomeBack: 'Bienvenido de vuelta',
};
