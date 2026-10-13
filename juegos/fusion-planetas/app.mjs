// Fusión de Planetas: pantallas, entrada y servicios.
import {
  GameLoop, SceneManager, createCanvas, Pointer, SaveStore, Sfx, Particles, FloatingTexts, Shake, Tweens, Ease, UI,
  Analytics, StorageSink, Events, AdsService, MockAdsProvider, IapService, MockIapProvider, dailySeed,
  Button, fillRoundRect, text,
} from './kit/index.js';
import { GAME, WORLD, TIERS, SKINS, IAP_CATALOG, GEM_COSTS, TEXT } from './content.mjs';
import { MergeGame, createSave, validateSave, MIGRATIONS } from './engine.mjs';
import { SpaceRenderer, drawPlanet, drawSplashScene } from './renderer.mjs';

// ---------- infraestructura ----------
const root = document.getElementById('game');
const surface = createCanvas({ parent: root, width: GAME.width, height: GAME.height, background: '#090a1f' });
const ui = new UI({ surface, parent: root });
const sfx = new Sfx();
const particles = new Particles({ max: 1200 });
const floats = new FloatingTexts();
const shake = new Shake();
const tweens = new Tweens();
const analytics = new Analytics({ app: GAME.id, version: GAME.version, sink: new StorageSink({ key: `${GAME.id}.analytics` }) });

const store = new SaveStore({ key: `${GAME.id}.save`, version: GAME.saveVersion, defaults: createSave, migrations: MIGRATIONS, validate: validateSave });
const loaded = store.load();
const save = loaded.data;
if (loaded.recovered) ui.toast('El guardado anterior estaba dañado; se empezó de nuevo.');
sfx.setEnabled(save.settings.sound !== false);
const persist = () => { save.lastSeen = Date.now(); store.save(save); };
window.addEventListener('pagehide', () => { persist(); store.flush(); });

const ads = new AdsService({ provider: new MockAdsProvider({ ui, rewardedSeconds: 5, interstitialSeconds: 3 }), analytics, caps: { interstitialGraceSec: 180, interstitialMinIntervalSec: 150, interstitialMinActions: 2 } });
ads.setNoAds(!!save.noAds);
const iap = new IapService({
  provider: new MockIapProvider({ ui }), catalog: IAP_CATALOG, analytics, entitlements: save.entitlements,
  onGrant: (p) => {
    if (p.grant.noAds) { save.noAds = true; ads.setNoAds(true); }
    if (p.grant.gems) save.gems += p.grant.gems;
    if (p.grant.skins) for (const s of p.grant.skins) if (!save.unlockedSkins.includes(s)) save.unlockedSkins.push(s);
    save.entitlements = iap.snapshot();
    persist();
  },
});

analytics.track(Events.SESSION_START, { fresh: loaded.fresh, best: save.best });

let clock = 0;
const renderer = new SpaceRenderer();
renderer.setSkin(save.skin);
const scenes = new SceneManager({ ctx: surface.ctx, width: GAME.width, height: GAME.height });
const skinColors = () => (SKINS.find((s) => s.id === save.skin) || SKINS[0]).colors;

// ---------- splash ----------
scenes.register('splash', {
  enter() { this.t = 0; this.logo = { s: 0.3, a: 0 }; tweens.to(this.logo, { s: 1, a: 1 }, 0.9, Ease.outBack, { delay: 0.2 }); },
  update(dt) { this.t += dt; if (this.t > 3) scenes.switch('menu'); },
  render(ctx) {
    drawSplashScene(ctx, this.t, SKINS.find((s) => s.id === save.skin));
    ctx.save(); ctx.globalAlpha = this.logo.a; ctx.translate(240, 560); ctx.scale(this.logo.s, this.logo.s);
    text(ctx, 'FUSIÓN DE', 0, -30, { size: 30, weight: '800', align: 'center', color: 'rgba(255,255,255,0.85)', shadow: 'rgba(0,0,0,0.5)' });
    text(ctx, 'PLANETAS', 0, 20, { size: 58, weight: '900', align: 'center', color: '#ffd166', shadow: 'rgba(0,0,0,0.6)' });
    ctx.restore();
    if (this.t > 1) text(ctx, TEXT.tapToStart, 240, 720, { size: 18, align: 'center', color: `rgba(255,255,255,${0.5 + Math.sin(this.t * 4) * 0.4})` });
  },
  pointer(e) { if (e.type === 'tap' && this.t > 0.5) scenes.switch('menu'); },
});

// ---------- menú ----------
scenes.register('menu', {
  enter() {
    const today = dailySeed().key;
    this.buttons = [
      new Button({ x: 100, y: 430, w: 280, h: 64, label: TEXT.classic, color: '#5e60ce', size: 24, onTap: () => { sfx.tap(); scenes.switch('game', { mode: 'classic' }); } }),
      new Button({ x: 100, y: 508, w: 280, h: 64, label: `${TEXT.daily} · ${save.dailyBest[today] ? `mejor ${save.dailyBest[today]}` : 'nuevo'}`, color: '#ff6b6b', size: 20, onTap: () => { sfx.tap(); scenes.switch('game', { mode: 'daily' }); } }),
      new Button({ x: 100, y: 586, w: 134, h: 56, label: TEXT.shop, color: 'rgba(255,255,255,0.15)', size: 18, onTap: () => { sfx.tap(); openSkins(); } }),
      new Button({ x: 246, y: 586, w: 134, h: 56, label: save.settings.sound ? '🔊 Sonido' : '🔇 Sonido', color: 'rgba(255,255,255,0.15)', size: 18, onTap: (e, b) => { save.settings.sound = !save.settings.sound; sfx.setEnabled(save.settings.sound); this.buttons[3].label = save.settings.sound ? '🔊 Sonido' : '🔇 Sonido'; sfx.tap(); persist(); } }),
    ];
    this.t = 0;
  },
  update(dt) { this.t += dt; renderer.update(dt, null); for (const b of this.buttons) b.update(dt); },
  render(ctx) {
    renderer.drawBackground(ctx);
    for (let i = 0; i < 5; i++) { const a = this.t * 0.5 + i * 1.25; drawPlanet(ctx, 9 - i, 240 + Math.cos(a) * 150, 250 + Math.sin(a) * 60, 22 + i * 6, SKINS.find((s) => s.id === save.skin), { t: this.t, seed: i }); }
    text(ctx, 'FUSIÓN DE PLANETAS', 240, 120, { size: 34, weight: '900', align: 'center', color: '#fff', shadow: 'rgba(0,0,0,0.5)' });
    text(ctx, `Récord: ${save.best}  ·  🪙 ${save.coins}  ·  💎 ${save.gems}`, 240, 360, { size: 16, align: 'center', color: 'rgba(255,255,255,0.85)' });
    text(ctx, 'Junta dos iguales para crear el siguiente. ¡Llega al Sol!', 240, 392, { size: 13, align: 'center', color: 'rgba(255,255,255,0.65)' });
    for (const b of this.buttons) b.render(ctx);
  },
  pointer(e) { if (ui.busy) return; for (const b of this.buttons) if (b.handle(e)) return; },
});

// ---------- juego ----------
const game = {
  enter({ mode = 'classic' } = {}) {
    this.mode = mode;
    this.dayKey = dailySeed().key;
    const seed = mode === 'daily' ? dailySeed().seed : (Date.now() ^ (Math.random() * 1e9)) >>> 0;
    this.g = new MergeGame({ seed, mode });
    this.ending = false;
    this.aiming = false;
    save.games++;
    persist();
    analytics.track(Events.LEVEL_START, { mode, games: save.games });
    this.undoBtn = new Button({ x: 16, y: 64, w: 92, h: 36, label: 'Deshacer', color: 'rgba(255,255,255,0.15)', size: 14, radius: 10, onTap: () => this.tryUndo() });
    this.pauseBtn = new Button({ x: 396, y: 94, w: 56, h: 32, label: 'II', color: 'rgba(255,255,255,0.15)', size: 16, radius: 10, onTap: () => this.pause() });
  },

  get best() { return this.mode === 'daily' ? (save.dailyBest[this.dayKey] || 0) : save.best; },

  async tryUndo() {
    if (!this.g.snapshotData || this.g.over) { ui.toast('Nada que deshacer'); return; }
    if (save.gems >= GEM_COSTS.undo) {
      const ok = await ui.confirm('Deshacer', `¿Gastar ${GEM_COSTS.undo} gemas para deshacer la última caída?`, { ok: 'Deshacer' });
      if (!ok) return;
      save.gems -= GEM_COSTS.undo;
    } else {
      const r = await ads.showRewarded('undo');
      if (!r.rewarded) return;
    }
    this.g.undo(); sfx.whoosh(); analytics.track('undo', { mode: this.mode }); persist();
  },

  async pause() {
    const v = await ui.modal({ title: 'Pausa', buttons: [{ label: 'Menú', value: 'menu', secondary: true }, { label: save.settings.sound ? 'Silenciar' : 'Sonido', value: 'sound', secondary: true }, { label: 'Seguir', value: null }] });
    if (v === 'menu') scenes.switch('menu');
    else if (v === 'sound') { save.settings.sound = !save.settings.sound; sfx.setEnabled(save.settings.sound); persist(); }
  },

  async finish() {
    const g = this.g;
    const isBest = g.score > this.best;
    if (this.mode === 'daily') save.dailyBest[this.dayKey] = Math.max(save.dailyBest[this.dayKey] || 0, g.score);
    else save.best = Math.max(save.best, g.score);
    const coins = Math.floor(g.score / 20);
    save.coins += coins;
    save.stats.merges += g.merges;
    save.stats.bestTier = Math.max(save.stats.bestTier, g.largestTier);
    persist();
    analytics.track(Events.LEVEL_FAIL, { score: g.score, best: isBest, tier: g.largestTier, mode: this.mode });
    sfx.thud(); shake.hit(10, 0.5);
    if (isBest) sfx.fanfare();
    await ads.maybeInterstitial('game_over');
    const buttons = [{ label: 'Menú', value: 'menu', secondary: true }, { label: 'Otra vez', value: 'retry' }];
    if (!g.continued) buttons.unshift({ label: save.gems >= GEM_COSTS.continue ? `Continuar (${GEM_COSTS.continue} 💎)` : 'Continuar (anuncio)', value: 'continue' });
    const v = await ui.modal({
      title: TEXT.gameOver,
      body: `${g.score} puntos${isBest ? ' · ¡Nuevo récord!' : ` · Récord ${this.best}`}\nMayor: ${TIERS[g.largestTier].name} · +${coins} monedas`,
      buttons,
    });
    if (v === 'continue') {
      let ok = false;
      if (save.gems >= GEM_COSTS.continue) { save.gems -= GEM_COSTS.continue; ok = true; }
      else ok = (await ads.showRewarded('continue')).rewarded;
      if (ok) {
        const removed = g.continueAfterOver();
        for (const b of removed) particles.emit({ x: b.x, y: b.y, count: 10, colors: [skinColors()[b.tier], '#fff'], speed: 200, life: 0.8 });
        sfx.whoosh(); this.ending = false; persist();
        return;
      }
    }
    if (v === 'retry') { analytics.track(Events.RETRY, { mode: this.mode }); scenes.switch('game', { mode: this.mode }, { duration: 0.3 }); return; }
    if (v === 'menu' || v === null) scenes.switch('menu');
    else scenes.switch('game', { mode: this.mode }, { duration: 0.3 });
  },

  update(dt) {
    const out = this.g.update(dt);
    for (const ev of out) {
      if (ev.type === 'merge') {
        sfx.merge(ev.tier);
        const col = skinColors()[ev.tier];
        particles.emit({ x: ev.x, y: ev.y, count: 10 + ev.tier * 3, colors: [col, '#fff', '#ffd166'], speed: 120 + ev.tier * 25, life: 0.6 + ev.tier * 0.05, gravity: 150, size: 4 + ev.tier * 0.5, shape: ev.tier > 5 ? 'star' : 'circle' });
        floats.add(ev.x, ev.y - TIERS[ev.tier].radius - 10, `+${ev.points}`, { color: ev.combo > 1 ? '#ffd166' : '#fff', size: 18 + ev.tier * 2 });
        if (ev.tier >= 6) shake.hit(2 + ev.tier, 0.25);
        if (ev.tier > save.stats.bestTier) { save.stats.bestTier = ev.tier; ui.toast(`¡Nuevo: ${TIERS[ev.tier].name}!`); }
      } else if (ev.type === 'supernova') {
        sfx.fanfare(); shake.hit(18, 0.8);
        particles.emit({ x: ev.x, y: ev.y, count: 160, colors: ['#ffb703', '#fff', '#ff6b6b', '#ffd166'], speed: 500, life: 1.4, gravity: 100, size: 8, shape: 'star' });
        floats.add(ev.x, ev.y, `¡SUPERNOVA! +${ev.points}`, { color: '#ffd166', size: 30, life: 1.6 });
        save.stats.supernovas++;
      } else if (ev.type === 'land') {
        if (ev.speed > 400) sfx.thud(); else sfx.tap();
        particles.emit({ x: ev.x, y: ev.y, count: 5, colors: ['rgba(255,255,255,0.6)'], speed: 60, spread: Math.PI, angle: -Math.PI / 2, life: 0.3, gravity: 0, size: 3 });
      } else if (ev.type === 'gameover' && !this.ending) {
        this.ending = true;
        this.finish();
      }
    }
    renderer.update(dt, this.g);
    this.undoBtn.update(dt); this.pauseBtn.update(dt);
    this.undoBtn.disabled = !this.g.snapshotData || this.g.over;
  },

  render(ctx) {
    ctx.save();
    ctx.translate(shake.x, shake.y);
    renderer.drawBackground(ctx);
    renderer.drawBucket(ctx);
    renderer.drawBodies(ctx, this.g);
    renderer.drawGhost(ctx, this.g);
    renderer.drawChain(ctx, this.g);
    renderer.drawHud(ctx, this.g, { best: this.best, modeLabel: this.mode === 'daily' ? `Reto ${this.dayKey}` : 'Clásico', coins: save.coins });
    this.undoBtn.render(ctx);
    this.pauseBtn.render(ctx);
    ctx.restore();
  },

  pointer(e) {
    if (ui.busy || this.g.over) return;
    if (this.undoBtn.handle(e) || this.pauseBtn.handle(e)) return;
    if (e.type === 'hover') { if (e.y > WORLD.top - 60) this.g.setAim(e.x); return; }
    if (e.type === 'down') { if (e.y < 110) return; this.aiming = true; this.g.setAim(e.x); return; }
    if (!this.aiming) return;
    if (e.type === 'move' || e.type === 'drag') { this.g.setAim(e.x); return; }
    if (e.type === 'up') {
      this.aiming = false;
      if (this.g.drop(e.x)) { sfx.pop(0.8); analytics.count(Events.FIRST_ACTION) === 0 && analytics.track(Events.FIRST_ACTION, { kind: 'drop' }); }
    }
    if (e.type === 'cancel') this.aiming = false;
  },
};
scenes.register('game', game);

// ---------- temas (skins) ----------
async function openSkins() {
  const content = document.createElement('div');
  for (const s of SKINS) {
    const owned = save.unlockedSkins.includes(s.id);
    const b = document.createElement('button');
    b.className = 'kit-btn' + (save.skin === s.id ? '' : ' secondary');
    b.style.cssText = 'margin:5px 0;width:100%;display:flex;justify-content:space-between;align-items:center';
    const sw = s.colors.slice(0, 6).map((c) => `<i style="display:inline-block;width:14px;height:14px;border-radius:50%;background:${c};margin-left:2px"></i>`).join('');
    b.innerHTML = `<span>${s.name}${owned ? (save.skin === s.id ? ' ✓' : '') : ` · 🪙 ${s.cost}`}</span><span>${sw}</span>`;
    b.onclick = async () => {
      if (!owned) {
        if (save.coins < s.cost) { ui.toast(`Te faltan ${s.cost - save.coins} monedas`); return; }
        const ok = await ui.confirm(`Desbloquear ${s.name}`, `¿Gastar ${s.cost} monedas?`, { ok: 'Desbloquear' });
        if (!ok) return;
        save.coins -= s.cost; save.unlockedSkins.push(s.id); sfx.success(); analytics.track(Events.UNLOCK, { skin: s.id });
      }
      save.skin = s.id; renderer.setSkin(s.id); persist(); sfx.tap();
      back.remove(); ui.openModals--; openSkins();
    };
    content.appendChild(b);
  }
  const iapRow = document.createElement('div');
  iapRow.style.cssText = 'margin-top:10px;border-top:1px solid rgba(255,255,255,.15);padding-top:8px';
  for (const p of IAP_CATALOG) {
    const owned = iap.owns(p.sku) && p.type === 'nonconsumable';
    const b = document.createElement('button');
    b.className = 'kit-btn secondary';
    b.style.cssText = 'margin:4px 0;width:100%;font-size:.9rem';
    b.textContent = owned ? `${p.title} ✓` : `${p.title} — ${p.priceLabel}`;
    b.disabled = owned;
    b.onclick = async () => { const r = await iap.purchase(p.sku); if (r.ok) { sfx.coin(); ui.toast('¡Gracias!'); back.remove(); ui.openModals--; openSkins(); } };
    iapRow.appendChild(b);
  }
  content.appendChild(iapRow);
  const note = document.createElement('p'); note.style.cssText = 'font-size:.75rem;opacity:.7;margin:8px 0 0'; note.textContent = `🪙 ${save.coins} · 💎 ${save.gems} · Versión web: compras simuladas.`;
  content.appendChild(note);
  // Modal manual para poder cerrarlo y reabrirlo tras cambios.
  const back = document.createElement('div'); back.className = 'kit-modal-back';
  const box = document.createElement('div'); box.className = 'kit-modal';
  const h = document.createElement('h2'); h.textContent = TEXT.shop;
  const close = document.createElement('button'); close.className = 'kit-btn'; close.textContent = 'Cerrar'; close.style.marginTop = '10px';
  close.onclick = () => { back.remove(); ui.openModals--; };
  box.append(h, content, close); back.appendChild(box); ui.root.appendChild(back); ui.openModals++;
}

// ---------- arranque ----------
new Pointer(surface, (e) => scenes.pointer(e));
const isDev = ['localhost', '127.0.0.1'].includes(location.hostname);
const loop = new GameLoop({
  pauseWhenHidden: !isDev,
  update(dt) { clock += dt; tweens.update(dt); particles.update(dt); floats.update(dt); shake.update(dt); scenes.update(dt); },
  render(alpha) { scenes.render(alpha); particles.render(surface.ctx); floats.render(surface.ctx); },
});
scenes.switch('splash', {}, { duration: 0 });
loop.start();
if ('serviceWorker' in navigator && location.protocol !== 'file:' && !isDev) navigator.serviceWorker.register('./sw.js').catch(() => {});
window.__fusion = { save, persist, loop, scenes, game };
