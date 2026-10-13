const FAMILIES = ['copper','iron','silver','gold','diamond','obsidian','magma','emerald','astral','abyss','dimensional','infinity'];
const CACHE = 'drill-infinito-0.3.0-r2';
const ASSETS = ['./engine-v2.mjs', './content.mjs', './rigs-atlas.png', './biomes-atlas.png', './asset-index.json', './', './index.html', './styles.css', './app.mjs', './engine.mjs', './storage.mjs', './renderer.mjs', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png', './splash-pixelart.png', './drill-sprite.png', ...FAMILIES.flatMap(id=>Array.from({length:25},(_,i)=>'./assets/evolutions/'+id+'-'+String(i+1).padStart(2,'0')+'.png'))];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => (key.startsWith('drill-infinito-') || key.startsWith('conceptos-drill-')) && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(caches.match(event.request, { ignoreSearch: true }).then(cached => cached || fetch(event.request)));
});
