// Megalodón: Evolución — pantallas, controles, HUD, panel de mejoras y servicios.
import {
  GameLoop, SceneManager, createCanvas, Pointer, SaveStore, Sfx, Tweens, Ease, UI,
  Analytics, StorageSink, Events, AdsService, MockAdsProvider, IapService, MockIapProvider, formatDuration,
  Button, ScrollList, Tabs, fillRoundRect, text, progressBar, Big,
} from './kit/index.js';
import { GAME, STAGES, WORLDS, UPGRADES, GEM_SHOP, IAP_CATALOG, QUALITY, TEXT, BALANCE, PREDATORS } from './content.mjs';
import { Ocean, createSave, validateSave, MIGRATIONS, xpNeed } from './engine.mjs';
import { Renderer } from './renderer.mjs';
import { drawFish, STAGE_SPECS, prebake } from './art/bake.mjs';
import { baker, noiseFields } from './art/texture.mjs';

const W = GAME.width, H = GAME.height;
const fmt = (n) => Big.from(Math.max(0, n)).format();
const DEPTH_M = [0.025, 0.012, 0.09, 1.4, 0.08];

// ---------- infraestructura ----------
const root = document.getElementById('game');
const store = new SaveStore({ key: `${GAME.id}.save`, version: GAME.saveVersion, defaults: createSave, migrations: MIGRATIONS, validate: validateSave });
const loaded = store.load();
const save = loaded.data;
const surface = createCanvas({ parent: root, width: W, height: H, background: '#03111f', maxDpr: (QUALITY[save.settings.quality] || QUALITY.auto).dpr });
const ui = new UI({ surface, parent: root });
const sfx = new Sfx();
sfx.setEnabled(save.settings.sound !== false);
const analytics = new Analytics({ app: GAME.id, version: GAME.version, sink: new StorageSink({ key: `${GAME.id}.analytics` }) });
if (loaded.recovered) ui.toast('El guardado anterior estaba dañado; se guardó una copia y se empezó de nuevo.');

noiseFields();
const ocean = new Ocean(save, { seed: (Date.now() & 0xffffff) >>> 0 });
const renderer = new Renderer(surface);
renderer.setQuality(save.settings.quality || 'auto');
prebake(STAGE_SPECS, 96);

const persist = () => { save.lastSeen = Date.now(); store.save(save); };
window.addEventListener('pagehide', () => { persist(); store.flush(); });
setInterval(persist, 10_000);

const ads = new AdsService({ provider: new MockAdsProvider({ ui, rewardedSeconds: 5, interstitialSeconds: 3 }), analytics, caps: { interstitialGraceSec: 300, interstitialMinIntervalSec: 240, interstitialMinActions: 1 } });
ads.setNoAds(!!save.noAds);
const iap = new IapService({
  provider: new MockIapProvider({ ui }), catalog: IAP_CATALOG, analytics, entitlements: save.entitlements,
  onGrant: (p) => {
    if (p.grant.noAds) { save.noAds = true; ads.setNoAds(true); }
    if (p.grant.gems) save.gems += p.grant.gems;
    if (p.grant.golden) save.golden = true;
    save.entitlements = iap.snapshot();
    persist();
  },
});
analytics.track(Events.SESSION_START, { fresh: loaded.fresh, stage: save.stage, world: save.world });

const tweens = new Tweens();
const scenes = new SceneManager({ ctx: surface.ctx, width: W, height: H });
let clock = 0;

// ---------- splash: el Megalodón pasa frente a la cámara ----------
scenes.register('splash', {
  enter() {
    this.t = 0;
    this.demo = new Ocean({ ...createSave(), world: 4, stage: 11 }, { seed: 9 });
    this.demo.p.x = 900; this.demo.p.y = 1500; this.demo.preds.length = 0;
    this.r = new Renderer(surface);
    this.r.setQuality(save.settings.quality || 'auto');
    this.r.enterWorld(4, this.demo);
    this.logo = { a: 0, s: 0.85 };
    tweens.to(this.logo, { a: 1, s: 1 }, 1.4, Ease.outCubic, { delay: 0.5 });
  },
  update(dt) {
    this.t += dt;
    const d = this.demo;
    d.setSteer(d.p.x + 900, 1500 + Math.sin(this.t * 0.4) * 200, true);
    const evs = d.tick(dt); this.r.onEvents(evs, d); this.r.update(dt, d);
    if (this.t > 1.5) baker.run(4);
  },
  render(ctx) {
    this.r.render(ctx, this.demo);
    const g = ctx.createLinearGradient(0, H * 0.55, 0, H);
    g.addColorStop(0, 'rgba(0,10,20,0)'); g.addColorStop(1, 'rgba(0,10,20,0.75)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.globalAlpha = this.logo.a; ctx.translate(W / 2, H * 0.36); ctx.scale(this.logo.s, this.logo.s);
    text(ctx, 'MEGALODÓN', 0, 0, { size: 86, weight: '900', align: 'center', color: '#f2f6f8', shadow: 'rgba(0,20,40,0.85)', font: 'Georgia, "Times New Roman", serif' });
    text(ctx, 'E V O L U C I Ó N', 0, 58, { size: 22, weight: '700', align: 'center', color: '#9fd8ff', shadow: 'rgba(0,20,40,0.8)' });
    ctx.restore();
    if (this.t > 1.8) text(ctx, TEXT.tapToStart, W / 2, H - 52, { size: 18, align: 'center', color: `rgba(230,245,255,${0.55 + Math.sin(this.t * 3) * 0.35})`, shadow: 'rgba(0,0,0,0.6)' });
  },
  pointer(e) { if ((e.type === 'tap' || e.type === 'up') && this.t > 0.8) startGame(); },
});

function startGame() {
  if (scenes.currentName === 'game') return;
  sfx.unlock();
  scenes.switch('game', {}, { duration: 0.8, color: '#000' });
}

// ---------- juego ----------
const game = {
  enter() {
    this.steerMode = 'none';
    this.aim = { x: W / 2, y: H / 2 };
    this.keys = new Set();
    this.drawer = false;
    this.card = null;           // presentación de mundo
    this.evoCard = null;        // tarjeta de evolución
    this.lastTap = 0;
    this.floatTexts = [];
    renderer.enterWorld(save.world, ocean);
    renderer.warmup(ocean);
    baker.flush();
    this.showWorldCard(save.world);
    this.buildUi();
    this.handleOffline();
  },

  buildUi() {
    this.lungeBtn = { x: W - 88, y: H - 88, r: 54 };
    this.upgBtn = new Button({ x: 16, y: H - 64, w: 128, h: 48, label: 'Mejoras', color: 'rgba(20,60,90,0.85)', size: 17, radius: 14, onTap: () => this.toggleDrawer() });
    this.evoBtn = new Button({ x: W / 2 - 120, y: H - 72, w: 240, h: 56, label: '¡EVOLUCIONAR!', color: '#e8a21a', fg: '#2a1600', size: 21, radius: 16, onTap: () => this.doEvolve() });
    this.pauseBtn = new Button({ x: W - 56, y: 12, w: 44, h: 40, label: 'II', color: 'rgba(10,30,50,0.7)', size: 16, radius: 12, onTap: () => this.pause() });
    const dx = W - 390;
    this.tabs = new Tabs({ x: dx + 12, y: 58, w: 366, h: 38, tabs: TEXT.tabs, active: 0, color: '#1f6fa8', onChange: () => { sfx.tap(); this.refreshList(); } });
    this.list = new ScrollList({ x: dx + 12, y: 104, w: 366, h: H - 116, itemHeight: 64, gap: 6, renderItem: (ctx, it, i, r, pressed) => this.renderItem(ctx, it, r, pressed), onTap: (it) => this.tapItem(it) });
    this.closeDrawerBtn = new Button({ x: W - 52, y: 12, w: 40, h: 38, label: '✕', color: 'rgba(255,255,255,0.12)', size: 16, radius: 10, onTap: () => this.toggleDrawer() });
    this.refreshList();
  },

  toggleDrawer() { this.drawer = !this.drawer; sfx.tap(); if (this.drawer) this.refreshList(); },

  showWorldCard(idx) {
    const w = WORLDS[idx];
    this.card = { t: 0, title: w.name, sub: w.tagline, idx };
  },

  async handleOffline() {
    if (!save.lastSeen) return;
    const res = ocean.applyOffline((Date.now() - save.lastSeen) / 1000);
    if (res.seconds <= 0) return;
    persist();
    analytics.track(Events.OFFLINE, { seconds: res.seconds });
    const v = await ui.modal({
      title: TEXT.welcomeBack,
      body: `Tu cardumen aliado trabajó ${formatDuration(res.seconds)} y reunió ${fmt(res.earned)} monedas${res.capped ? ` (tope de ${BALANCE.offlineHours} h)` : ''}.`,
      buttons: [{ label: 'Genial', value: 'ok', secondary: true }, { label: 'Ver anuncio: ×2', value: 'double' }],
    });
    if (v === 'double') { const r = await ads.showRewarded('offline_double'); if (r.rewarded) { save.coins += res.earned; sfx.coin(); ui.toast(`+${fmt(res.earned)} monedas`); persist(); } }
  },

  doEvolve() {
    if (!ocean.canEvolve()) { ui.toast(ocean.evolveBlock()); sfx.error(); return; }
    ocean.evolve();
    const st = STAGES[save.stage];
    this.evoCard = { t: 0, name: st.name, blurb: st.blurb };
    sfx.fanfare();
    analytics.track('evolve', { stage: save.stage });
    persist();
  },

  async pause() {
    const q = QUALITY[save.settings.quality || 'auto'];
    const v = await ui.modal({ title: 'Pausa', body: `Calidad: ${q.label} · Sonido: ${save.settings.sound ? 'sí' : 'no'}`, buttons: [{ label: 'Calidad', value: 'q', secondary: true }, { label: 'Sonido', value: 's', secondary: true }, { label: 'Seguir', value: null }] });
    if (v === 'q') this.cycleQuality();
    if (v === 's') { save.settings.sound = !save.settings.sound; sfx.setEnabled(save.settings.sound); persist(); }
  },
  cycleQuality() {
    const order = ['auto', 'high', 'ultra', 'low'];
    const next = order[(order.indexOf(save.settings.quality || 'auto') + 1) % order.length];
    save.settings.quality = next;
    renderer.setQuality(next);
    ui.toast(`Calidad: ${QUALITY[next].label}`);
    persist();
  },

  // ---------- panel ----------
  refreshList() {
    const tab = this.tabs.active;
    if (tab === 0) this.list.setItems(UPGRADES.map((u) => ({ kind: 'up', u })));
    else if (tab === 1) this.list.setItems([...STAGES.map((s, i) => ({ kind: 'stage', s, i })), { kind: 'ascend' }]);
    else this.list.setItems([...GEM_SHOP.map((g) => ({ kind: 'gem', g })), { kind: 'adboost' }, { kind: 'shop' }, { kind: 'quality' }, { kind: 'sound' }, { kind: 'stats' }]);
  },
  renderItem(ctx, it, r, pressed) {
    fillRoundRect(ctx, r.x, r.y, r.w, r.h, 12, pressed ? 'rgba(120,190,240,0.28)' : 'rgba(255,255,255,0.08)');
    const bx = r.x + r.w - 116, by = r.y + 12, bw = 104, bh = r.h - 24;
    const btn = (label, color, fg = '#fff', on = true) => { ctx.save(); if (!on) ctx.globalAlpha = 0.45; fillRoundRect(ctx, bx, by, bw, bh, 10, color); text(ctx, label, bx + bw / 2, by + bh / 2, { size: 13, align: 'center', weight: '800', color: fg, maxWidth: bw - 8 }); ctx.restore(); };
    const title = (s, y = -11) => text(ctx, s, r.x + 14, r.y + r.h / 2 + y, { size: 15, weight: '800', color: '#eaf6ff', maxWidth: r.w - 140 });
    const sub = (s, y = 11) => text(ctx, s, r.x + 14, r.y + r.h / 2 + y, { size: 11.5, color: 'rgba(200,225,240,0.85)', maxWidth: r.w - 140 });
    switch (it.kind) {
      case 'up': {
        const lvl = ocean.lvl(it.u.id), cost = ocean.upgradeCost(it.u.id);
        title(`${it.u.name} · nv ${lvl}/${it.u.max}`); sub(it.u.desc);
        if (cost == null) btn('Máximo', '#2b6a4a'); else btn(`🪙 ${fmt(cost)}`, save.coins >= cost ? '#e8a21a' : '#3a4a58', save.coins >= cost ? '#2a1600' : '#cfe0ec', save.coins >= cost);
        break;
      }
      case 'stage': {
        const i = it.i, cur = save.stage;
        drawFish(ctx, STAGE_SPECS[i], { x: r.x + 38, y: r.y + r.h / 2, ang: 0, len: 52, phase: clock * 3 + i, speedK: 0.4, t: clock, px: 52 * renderer.devScale(), golden: save.golden && i === cur });
        text(ctx, STAGES[i].name, r.x + 74, r.y + r.h / 2 - 10, { size: 15, weight: '800', color: i <= cur ? '#eaf6ff' : 'rgba(200,220,235,0.5)' });
        text(ctx, i < cur ? 'Superada' : i === cur ? `Actual · ${Math.floor(ocean.progress() * 100)}%` : `Se alcanza en ${WORLDS[STAGES[i].world].name}`, r.x + 74, r.y + r.h / 2 + 11, { size: 11.5, color: 'rgba(200,225,240,0.8)', maxWidth: r.w - 90 });
        break;
      }
      case 'ascend': {
        title(`Ascender · ${save.medals} dientes`); sub(`Renace como Alevín con ×${BALANCE.medalMult} permanente por diente`);
        btn(ocean.canAscend() ? '¡Ascender!' : 'Bloqueado', ocean.canAscend() ? '#a35bd6' : '#3a4a58', '#fff', ocean.canAscend());
        break;
      }
      case 'gem': title(it.g.name); sub(it.g.desc); btn(`💎 ${it.g.gems}`, save.gems >= it.g.gems ? '#2b8fbf' : '#3a4a58', '#fff', save.gems >= it.g.gems); break;
      case 'adboost': { const on = save.boosts.adUntil > Date.now(); title('XP y monedas ×2 (3 min)'); sub(on ? `Activo ${formatDuration((save.boosts.adUntil - Date.now()) / 1000)} más` : 'Mira un anuncio corto'); btn(on ? 'Ampliar' : 'Ver anuncio', '#c2405e'); break; }
      case 'shop': title('Tienda'); sub(save.noAds ? 'Sin anuncios activo' : 'Perlas, sin anuncios y Megalodón dorado'); btn('Abrir', '#1f6fa8'); break;
      case 'quality': title(`Calidad: ${QUALITY[save.settings.quality || 'auto'].label}`); sub('4K Ultra necesita un equipo potente'); btn('Cambiar', '#3a5a78'); break;
      case 'sound': title('Sonido'); btn(save.settings.sound ? 'Activado' : 'Silencio', save.settings.sound ? '#2b6a4a' : '#3a4a58'); break;
      case 'stats': title(`${save.stats.eaten} presas · ${save.stats.kills} derrotados`); sub(`${save.stats.evolutions} evoluciones · ${Math.floor(save.stats.playSeconds / 60)} min · ${save.stats.deaths} muertes`); break;
      default: break;
    }
  },
  async tapItem(it) {
    switch (it.kind) {
      case 'up': if (ocean.buyUpgrade(it.u.id)) { sfx.coin(); analytics.track('upgrade', { id: it.u.id, lvl: ocean.lvl(it.u.id) }); } else sfx.error(); break;
      case 'ascend': {
        if (!ocean.canAscend()) { ui.toast(save.bosses.livyatan ? 'Llena la barra del Megalodón para ascender' : 'Derrota a Livyatan en el Mar Prehistórico'); return; }
        const ok = await ui.confirm('Ascender', `Volverás a ser un Alevín en el Arrecife, pero con ×${BALANCE.medalMult} permanente por diente. Conservas perlas y compras.`, { ok: 'Ascender', cancel: 'Aún no' });
        if (ok) { ocean.ascend(); sfx.fanfare(); analytics.track(Events.PRESTIGE, { medals: save.medals }); this.drawer = false; persist(); }
        break;
      }
      case 'gem': if (ocean.spendGems(it.g.id)) { sfx.success(); ui.toast(`${it.g.name} ✓`); } else { sfx.error(); ui.toast('No tienes perlas suficientes'); } break;
      case 'adboost': { const r = await ads.showRewarded('boost'); if (r.rewarded) { ocean.grantAdBoost(3); sfx.coin(); ui.toast('¡XP y monedas ×2 durante 3 minutos!'); } break; }
      case 'shop': await openShop(); break;
      case 'quality': this.cycleQuality(); break;
      case 'sound': save.settings.sound = !save.settings.sound; sfx.setEnabled(save.settings.sound); sfx.tap(); break;
      default: break;
    }
    persist();
  },

  // ---------- entrada ----------
  toWorld(sx, sy) { const c = renderer.cam; return { x: c.x + (sx - W / 2) / c.zoom, y: c.y + (sy - H / 2) / c.zoom }; },
  pointer(e) {
    if (ui.busy) return;
    if (this.card && this.card.t < 1.2 && e.type === 'tap') { this.card.t = Math.max(this.card.t, 2.4); return; }
    if (this.evoCard && e.type === 'tap') { this.evoCard = null; return; }
    // Con el panel abierto, la ✕ ocupa el sitio de la pausa: el panel manda.
    if (this.drawer) {
      if (this.closeDrawerBtn.handle(e) || this.tabs.handle(e) || this.list.handle(e)) return;
      if (e.x > W - 390) return;
    } else if (this.pauseBtn.handle(e)) return;
    if (this.upgBtn.handle(e)) return;
    if (ocean.canEvolve() && this.evoBtn.handle(e)) return;
    const lb = this.lungeBtn;
    if (Math.hypot(e.x - lb.x, e.y - lb.y) < lb.r) { if (e.type === 'down') this.lunge(); return; }
    if (e.type === 'hover') { this.steerMode = 'mouse'; this.aim = { x: e.x, y: e.y }; return; }
    if (e.type === 'down') { if (this.steerMode !== 'mouse') this.steerMode = 'touch'; this.aim = { x: e.x, y: e.y }; this.pressed = true; }
    else if (e.type === 'move' || e.type === 'drag') this.aim = { x: e.x, y: e.y };
    else if (e.type === 'up' || e.type === 'cancel') this.pressed = false;
    // Toque corto = mordisco (con ratón, clic).
    if (e.type === 'tap') this.lunge();
  },
  key(e, down) {
    const k = e.key.toLowerCase();
    if (down && (k === ' ' || k === 'j')) { e.preventDefault(); this.lunge(); return; }
    if (down && k === 'e') { this.doEvolve(); return; }
    if (down && k === 'u') { this.toggleDrawer(); return; }
    if (down && k === 'escape') { if (this.drawer) this.drawer = false; else this.pause(); return; }
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) { if (down) this.keys.add(k); else this.keys.delete(k); this.steerMode = this.keys.size ? 'keys' : this.steerMode === 'keys' ? 'none' : this.steerMode; }
  },
  lunge() { if (ocean.lunge()) { sfx.whoosh(); } },

  // ---------- bucle ----------
  update(dt) {
    const p = ocean.p;
    // Dirección de nado.
    if (this.steerMode === 'keys') {
      let dx = 0, dy = 0;
      for (const k of this.keys) { if (k === 'a' || k === 'arrowleft') dx--; if (k === 'd' || k === 'arrowright') dx++; if (k === 'w' || k === 'arrowup') dy--; if (k === 's' || k === 'arrowdown') dy++; }
      const m = Math.hypot(dx, dy) || 1;
      ocean.setSteer(p.x + (dx / m) * p.len * 3, p.y + (dy / m) * p.len * 3, dx !== 0 || dy !== 0);
    } else {
      const wpos = this.toWorld(this.aim.x, this.aim.y);
      const active = !ui.busy && !this.evoCard && (this.steerMode === 'mouse' || (this.steerMode === 'touch' && this.pressed)) && !(this.drawer && this.aim.x > W - 390);
      ocean.setSteer(wpos.x, wpos.y, active);
    }
    const evs = ocean.tick(dt);
    renderer.onEvents(evs, ocean);
    for (const e of evs) this.onEvent(e);
    renderer.update(dt, ocean);
    this.list.update(dt);
    for (const b of [this.upgBtn, this.evoBtn, this.pauseBtn, this.closeDrawerBtn]) b.update(dt);
    if (this.card) { this.card.t += dt; if (this.card.t > 3.4) this.card = null; }
    if (this.evoCard) { this.evoCard.t += dt; if (this.evoCard.t > 3.2) this.evoCard = null; }
    this.floatTexts = this.floatTexts.filter((f) => (f.t += dt) < f.life);
  },
  onEvent(e) {
    switch (e.type) {
      case 'eat': {
        sfx.pop(Math.max(0.5, 1.6 - e.r / Math.max(4, ocean.p.len) * 2));
        if (e.chain >= 3 || e.r > ocean.p.len * 0.15) this.floatTexts.push({ x: e.x, y: e.y, s: `+${fmt(e.xp)}`, t: 0, life: 0.9, color: e.chain >= 5 ? '#ffd166' : '#d8f6ff' });
        if (ocean.s.stats.eaten === 1) analytics.track(Events.FIRST_ACTION, { kind: 'eat' });
        break;
      }
      case 'evolve_ready': sfx.success(); ui.toast(ocean.canEvolve() ? '¡Puedes evolucionar! (E)' : ocean.evolveBlock()); break;
      case 'hit_pred': sfx.thud(); break;
      case 'player_hit': sfx.error(); break;
      case 'kill': sfx.coin(); this.floatTexts.push({ x: e.x, y: e.y, s: `+${fmt(e.xp)} XP`, t: 0, life: 1.4, color: '#ffd166' }); if (e.boss) { sfx.fanfare(); ui.toast(`¡${e.pred.def.name} derrotado! El camino está libre`); analytics.track(Events.LEVEL_COMPLETE, { boss: e.pred.def.id }); } break;
      case 'death': this.onDeath(e); break;
      case 'exit_blocked': ui.toast(e.reason); break;
      case 'world': this.showWorldCard(e.index); renderer.warmup(ocean); baker.flush(); analytics.track(Events.ERA, { world: e.index }); ads.maybeInterstitial('world_travel'); persist(); break;
      case 'ascend': this.showWorldCard(0); ui.toast(`¡Ascendiste! ${e.medals} dientes de megalodón`); break;
      default: break;
    }
  },
  async onDeath(e) {
    sfx.thud();
    analytics.track(Events.LEVEL_FAIL, { stage: save.stage, world: save.world });
    if (e.loss < 1) { ui.toast('Te devoraron… reapareces en la zona segura'); return; }
    const v = await ui.modal({ title: 'Te devoraron', body: `Perdiste ${fmt(e.loss)} monedas. Puedes recuperarlas viendo un anuncio.`, buttons: [{ label: 'Seguir', value: null, secondary: true }, { label: 'Recuperar (anuncio)', value: 'ad' }] });
    if (v === 'ad') { const r = await ads.showRewarded('revive_coins'); if (r.rewarded) { save.coins += e.loss; sfx.coin(); ui.toast('Monedas recuperadas'); persist(); } }
  },

  // ---------- dibujo ----------
  render(ctx) {
    renderer.render(ctx, ocean, { golden: save.golden });
    this.drawFloatTexts(ctx);
    this.drawHud(ctx);
    if (this.drawer) this.drawDrawer(ctx);
    this.drawCards(ctx);
  },
  drawFloatTexts(ctx) {
    const c = renderer.cam;
    for (const f of this.floatTexts) {
      const k = f.t / f.life;
      const x = (f.x - c.x) * c.zoom + W / 2, y = (f.y - c.y) * c.zoom + H / 2 - k * 40;
      ctx.save(); ctx.globalAlpha = Math.min(1, (1 - k) * 2);
      text(ctx, f.s, x, y, { size: 16, weight: '800', align: 'center', color: f.color, shadow: 'rgba(0,0,0,0.6)' });
      ctx.restore();
    }
  },
  drawHud(ctx) {
    const s = save, p = ocean.p;
    // Panel superior izquierdo.
    fillRoundRect(ctx, 12, 10, 330, 86, 14, 'rgba(4,20,36,0.62)');
    text(ctx, STAGES[s.stage].name, 26, 30, { size: 18, weight: '800', color: '#f2f8fc', shadow: 'rgba(0,0,0,0.5)' });
    text(ctx, `🪙 ${fmt(s.coins)}   💎 ${s.gems}${s.medals ? `   🦷 ${s.medals}` : ''}`, 330, 30, { size: 14, weight: '700', align: 'right', color: '#ffe08a' });
    const ready = ocean.canEvolve(), prog = ocean.progress();
    const isMega = s.stage === STAGES.length - 1;
    progressBar(ctx, 26, 46, 304, 14, prog, { fg: ready ? '#e8a21a' : isMega ? '#a35bd6' : '#3cc0ff', bg: 'rgba(255,255,255,0.12)', label: ready ? '¡Evolución lista!' : prog >= 1 ? ocean.evolveBlock() : isMega ? `Hambre del Mioceno ${Math.floor(prog * 100)}%` : `Evolución ${Math.floor(prog * 100)}% → ${STAGES[s.stage + 1].name}` });
    const hpK = Math.max(0, p.hp / ocean.maxHp());
    progressBar(ctx, 26, 68, 304, 12, hpK, { fg: hpK > 0.5 ? '#4fd27a' : hpK > 0.25 ? '#e8c21a' : '#e84a4a', bg: 'rgba(255,255,255,0.12)', label: `Vida ${fmt(p.hp)} / ${fmt(ocean.maxHp())}` });
    // Mundo y profundidad.
    const w = WORLDS[s.world];
    text(ctx, w.name, W - 68, 24, { size: 14, weight: '800', align: 'right', color: '#e6f4ff', shadow: 'rgba(0,0,0,0.6)' });
    text(ctx, `Profundidad ${Math.round(p.y * DEPTH_M[s.world])} m`, W - 68, 44, { size: 12, align: 'right', color: 'rgba(200,230,250,0.85)', shadow: 'rgba(0,0,0,0.6)' });
    // Indicador de salida del mundo.
    const exitDir = p.x > w.size.w * 0.85 ? 1 : p.x < w.size.w * 0.15 && s.world > 0 ? -1 : 0;
    if (exitDir) {
      const go = ocean.canTravel(exitDir);
      const label = exitDir > 0 ? (go.ok ? `→ ${WORLDS[s.world + 1]?.name ?? ''}` : go.reason) : `← ${WORLDS[s.world - 1].name}`;
      if (label) text(ctx, label, exitDir > 0 ? W - 20 : 20, H / 2, { size: 14, weight: '800', align: exitDir > 0 ? 'right' : 'left', color: go.ok ? '#8fffc1' : '#ffb3a1', shadow: 'rgba(0,0,0,0.7)' });
    }
    // Combo.
    if (ocean.chain >= 2) text(ctx, `Frenesí ×${(1 + ocean.chainStep() * (ocean.chain - 1)).toFixed(2)}`, W / 2, 30, { size: 20, weight: '900', align: 'center', color: '#ffd166', shadow: 'rgba(0,0,0,0.6)' });
    // Barra de jefe.
    const boss = ocean.preds.find((e) => e.def.boss && Math.hypot(e.x - p.x, e.y - p.y) < e.def.detect * 1.3);
    if (boss) {
      // Estrecha para no tapar el panel de vida (termina en x=342).
      fillRoundRect(ctx, W / 2 - 126, 52, 252, 34, 10, 'rgba(30,4,8,0.7)');
      progressBar(ctx, W / 2 - 114, 68, 228, 10, boss.hp / boss.maxHp, { fg: '#e84a4a', bg: 'rgba(255,255,255,0.12)' });
      text(ctx, boss.def.name, W / 2, 60, { size: 12, weight: '800', align: 'center', color: '#ffd0d0' });
    }
    // Botones.
    this.upgBtn.render(ctx);
    if (!this.drawer) this.pauseBtn.render(ctx);
    if (ocean.canEvolve()) { this.evoBtn.color = Math.floor(clock * 3) % 2 ? '#e8a21a' : '#f5b83a'; this.evoBtn.render(ctx); }
    // Botón de mordisco con anillo de recarga.
    const lb = this.lungeBtn, cdK = p.lungeCd > 0 ? 1 - p.lungeCd / ocean.lungeCd() : 1;
    ctx.save();
    ctx.fillStyle = cdK >= 1 ? 'rgba(200,40,50,0.75)' : 'rgba(40,40,50,0.6)';
    ctx.beginPath(); ctx.arc(lb.x, lb.y, lb.r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(lb.x, lb.y, lb.r - 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * cdK); ctx.stroke();
    text(ctx, 'MORDER', lb.x, lb.y + 2, { size: 14, weight: '900', align: 'center', color: '#fff', shadow: 'rgba(0,0,0,0.5)' });
    ctx.restore();
  },
  drawDrawer(ctx) {
    const dx = W - 390;
    const g = ctx.createLinearGradient(dx, 0, W, 0);
    g.addColorStop(0, 'rgba(3,16,30,0.88)'); g.addColorStop(1, 'rgba(3,16,30,0.96)');
    ctx.fillStyle = g; ctx.fillRect(dx, 0, 390, H);
    text(ctx, TEXT.tabs[this.tabs.active], dx + 20, 32, { size: 20, weight: '900', color: '#eaf6ff' });
    text(ctx, `🪙 ${fmt(save.coins)}  💎 ${save.gems}`, W - 64, 32, { size: 13, weight: '700', align: 'right', color: '#ffe08a' });
    this.closeDrawerBtn.render(ctx);
    this.tabs.render(ctx);
    this.list.render(ctx);
  },
  drawCards(ctx) {
    if (this.card) {
      const c = this.card, a = Math.min(1, c.t / 0.5) * (c.t > 2.6 ? Math.max(0, 1 - (c.t - 2.6) / 0.8) : 1);
      ctx.save(); ctx.globalAlpha = a;
      const g = ctx.createLinearGradient(0, H * 0.3, 0, H * 0.62);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, 'rgba(0,10,20,0.6)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0, H * 0.3, W, H * 0.32);
      text(ctx, c.title.toUpperCase(), W / 2, H * 0.43, { size: 44, weight: '900', align: 'center', color: '#f2f8fc', shadow: 'rgba(0,0,0,0.7)', font: 'Georgia, "Times New Roman", serif' });
      text(ctx, c.sub, W / 2, H * 0.52, { size: 17, align: 'center', color: '#a8dcff', shadow: 'rgba(0,0,0,0.7)' });
      ctx.restore();
    }
    if (this.evoCard) {
      const c = this.evoCard, a = Math.min(1, c.t / 0.4) * (c.t > 2.4 ? Math.max(0, 1 - (c.t - 2.4) / 0.8) : 1);
      const pop = Ease.outBack(Math.min(1, c.t / 0.6));
      ctx.save(); ctx.globalAlpha = a; ctx.translate(W / 2, H * 0.24); ctx.scale(pop, pop);
      text(ctx, '¡EVOLUCIÓN!', 0, -26, { size: 20, weight: '800', align: 'center', color: '#ffd166', shadow: 'rgba(0,0,0,0.7)' });
      text(ctx, c.name, 0, 16, { size: 42, weight: '900', align: 'center', color: '#fff', shadow: 'rgba(0,0,0,0.75)', font: 'Georgia, "Times New Roman", serif' });
      text(ctx, c.blurb, 0, 50, { size: 15, align: 'center', color: '#cfeaff', shadow: 'rgba(0,0,0,0.7)' });
      ctx.restore();
    }
  },
};
scenes.register('game', game);

// ---------- tienda (DOM) ----------
async function openShop() {
  const content = document.createElement('div');
  for (const p of IAP_CATALOG) {
    const owned = iap.owns(p.sku) && p.type === 'nonconsumable';
    const b = document.createElement('button');
    b.className = 'kit-btn' + (owned ? ' secondary' : '');
    b.style.cssText = 'margin:6px 0;width:100%;text-align:left;font-size:.95rem';
    b.innerHTML = owned ? `<b>${p.title}</b> ✓` : `<b>${p.title}</b> — ${p.priceLabel}<br><span style="font-weight:400;opacity:.85;font-size:.85rem">${p.desc}</span>`;
    b.disabled = owned;
    b.onclick = async () => { const r = await iap.purchase(p.sku); if (r.ok) { sfx.coin(); ui.toast('¡Gracias!'); b.disabled = p.type === 'nonconsumable'; if (b.disabled) b.textContent = `${p.title} ✓`; } };
    content.appendChild(b);
  }
  const note = document.createElement('p');
  note.style.cssText = 'font-size:.78rem;opacity:.75;margin-top:10px';
  note.textContent = 'Versión web: las compras son simuladas y no se cobra nada.';
  content.appendChild(note);
  const v = await ui.modal({ title: 'Tienda', content, buttons: [{ label: 'Restaurar compras', value: 'restore', secondary: true }, { label: 'Cerrar', value: null }] });
  if (v === 'restore') { const r = await iap.restore(); ui.toast(r.length ? `Restaurado: ${r.join(', ')}` : 'Nada que restaurar'); }
}

// ---------- arranque ----------
new Pointer(surface, (e) => scenes.pointer(e));
window.addEventListener('keydown', (e) => { if (scenes.currentName === 'splash') { startGame(); return; } if (scenes.currentName === 'game') game.key(e, true); });
window.addEventListener('keyup', (e) => { if (scenes.currentName === 'game') game.key(e, false); });

const isDev = ['localhost', '127.0.0.1'].includes(location.hostname);
let lastFrame = performance.now();
const loop = new GameLoop({
  pauseWhenHidden: !isDev,
  update(dt) { clock += dt; tweens.update(dt); scenes.update(dt); },
  render() {
    const now = performance.now(); renderer.measure(Math.min(0.25, (now - lastFrame) / 1000)); lastFrame = now;
    scenes.render();
  },
});
scenes.switch('splash', {}, { duration: 0 });
loop.start();
if ('serviceWorker' in navigator && location.protocol !== 'file:' && !isDev) navigator.serviceWorker.register('./sw.js').catch(() => {});
window.__mega = { ocean, renderer, save, loop, scenes, game, persist, baker, xpNeed, PREDATORS };
