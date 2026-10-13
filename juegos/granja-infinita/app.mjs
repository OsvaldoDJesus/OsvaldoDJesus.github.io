// Granja Infinita: pantallas, entrada y servicios. Conecta motor, render y kit.
import {
  GameLoop, SceneManager, createCanvas, Pointer, hit, SaveStore, Sfx, Particles, FloatingTexts, Shake, Tweens, Ease, UI,
  Analytics, StorageSink, Events, AdsService, MockAdsProvider, IapService, MockIapProvider, formatDuration,
  Button, ScrollList, Tabs, fillRoundRect, text, progressBar, Big,
} from './kit/index.js';
import { GAME, BALANCE, IAP_CATALOG, UPGRADES, GEM_SHOP, EVENTS, TEXT, gridSize } from './content.mjs';
import { Farm, createSave, validateSave, MIGRATIONS, getEra } from './engine.mjs';
import { FarmRenderer, LAYOUT, drawCrop, drawIcon, drawCoin, drawGem, drawSplashField } from './renderer.mjs';

// ---------- infraestructura ----------
const root = document.getElementById('game');
const surface = createCanvas({ parent: root, width: GAME.width, height: GAME.height, background: '#2f6b2a' });
const ui = new UI({ surface, parent: root });
const sfx = new Sfx();
const particles = new Particles({ max: 900 });
const floats = new FloatingTexts();
const shake = new Shake();
const tweens = new Tweens();
const analytics = new Analytics({ app: GAME.id, version: GAME.version, sink: new StorageSink({ key: `${GAME.id}.analytics` }) });

const store = new SaveStore({ key: `${GAME.id}.save`, version: GAME.saveVersion, defaults: createSave, migrations: MIGRATIONS, validate: validateSave });
const loaded = store.load();
const farm = new Farm(loaded.data);
if (loaded.recovered) ui.toast('El guardado anterior estaba dañado; se guardó una copia y se empezó de nuevo.');
sfx.setEnabled(farm.s.settings.sound !== false);

const persist = () => { farm.s.lastSeen = Date.now(); store.save(farm.toSave()); };
window.addEventListener('pagehide', () => { persist(); store.flush(); });
setInterval(persist, 10_000);

const ads = new AdsService({ provider: new MockAdsProvider({ ui, rewardedSeconds: 5, interstitialSeconds: 3 }), analytics, caps: { interstitialGraceSec: 240, interstitialMinIntervalSec: 180, interstitialMinActions: 1 } });
ads.setNoAds(!!farm.s.noAds);
const iap = new IapService({
  provider: new MockIapProvider({ ui }), catalog: IAP_CATALOG, analytics, entitlements: farm.s.entitlements,
  onGrant: (p) => {
    if (p.grant.noAds) { farm.s.noAds = true; ads.setNoAds(true); }
    if (p.grant.gems) farm.s.gems += p.grant.gems;
    if (p.grant.golden) farm.s.golden = true;
    farm.s.entitlements = iap.snapshot();
    persist();
  },
});

analytics.track(Events.SESSION_START, { fresh: loaded.fresh, era: farm.s.era, prestiges: farm.s.stats.prestiges });

let clock = 0;
const renderer = new FarmRenderer();
const scenes = new SceneManager({ ctx: surface.ctx, width: GAME.width, height: GAME.height });

// ---------- utilidades de interfaz ----------
function burst(x, y, colors, count = 14, shape = 'circle') {
  particles.emit({ x, y, count, colors, shape, speed: 160, life: 0.7, gravity: 260, size: 5 });
}
function confetti() {
  for (let i = 0; i < 6; i++) {
    particles.emit({ x: 40 + i * 80, y: 120, count: 30, colors: ['#ffd166', '#ef476f', '#06d6a0', '#118ab2', '#fff'], shape: i % 2 ? 'square' : 'star', speed: 260, spread: Math.PI, angle: -Math.PI / 2, life: 1.8, gravity: 320, size: 7 });
  }
}
function coinsLabel(b) { return `🪙 ${Big.from(b).format()}`; }

// ---------- escena: splash ----------
scenes.register('splash', {
  enter() { this.t = 0; this.logo = { s: 0.4, a: 0, y: 40 }; tweens.to(this.logo, { s: 1, a: 1, y: 0 }, 0.9, Ease.outBack, { delay: 0.3 }); },
  update(dt) { this.t += dt; if (this.t > 3.2) this.go(); },
  go() { scenes.switch('game', {}, { duration: 0.5, color: '#fff' }); },
  render(ctx) {
    drawSplashField(ctx, this.t);
    ctx.save();
    ctx.globalAlpha = this.logo.a;
    ctx.translate(240, 330 + this.logo.y);
    ctx.scale(this.logo.s, this.logo.s);
    text(ctx, 'GRANJA', 0, -28, { size: 64, weight: '900', align: 'center', color: '#fff', shadow: 'rgba(60,40,10,0.6)' });
    text(ctx, 'INFINITA', 0, 36, { size: 54, weight: '900', align: 'center', color: '#ffe66d', shadow: 'rgba(60,40,10,0.6)' });
    ctx.restore();
    if (this.t > 1.2) text(ctx, TEXT.tapToStart, 240, 720, { size: 20, align: 'center', color: `rgba(255,255,255,${0.6 + Math.sin(this.t * 4) * 0.4})`, shadow: 'rgba(0,0,0,0.4)' });
  },
  pointer(e) { if (e.type === 'tap' && this.t > 0.6) this.go(); },
});

// ---------- escena: juego ----------
const game = {
  enter() {
    this.hover = -1;
    this.dragVisited = new Set();
    this.lastRate = Big.ZERO;
    this.tabs = new Tabs({ ...LAYOUT.tabs, tabs: TEXT.tabs, active: 0, color: '#4f9a3f', onChange: () => { sfx.tap(); this.refreshList(); } });
    this.list = new ScrollList({ ...LAYOUT.list, itemHeight: 58, gap: 6, renderItem: (ctx, item, i, r, pressed) => this.renderItem(ctx, item, r, pressed), onTap: (item) => this.tapItem(item) });
    this.menuBtn = new Button({ x: 430, y: 16, w: 34, h: 30, label: '⋯', color: 'rgba(255,255,255,0.18)', size: 18, radius: 8, onTap: () => this.openMenu() });
    this.bannerBtn = new Button({ x: 330, y: 500, w: 120, h: 36, label: '', color: '#ffd166', fg: '#3a2a00', size: 15, radius: 10, onTap: () => this.bannerAction() });
    this.refreshList();
    this.handleOffline();
    this.cinematic = null;
  },

  // ---- offline ----
  async handleOffline() {
    const last = farm.s.lastSeen;
    if (!last) return;
    const elapsed = (Date.now() - last) / 1000;
    const res = farm.applyOffline(elapsed);
    if (res.mode === 'none') return;
    persist();
    analytics.track(Events.OFFLINE, { mode: res.mode, seconds: res.seconds });
    const lines = {
      auto: `Tus jornaleros trabajaron ${formatDuration(res.seconds)} y ganaron ${res.earned.format()} monedas.`,
      harvested: `Tus jornaleros cosecharon lo que había plantado: ${res.earned.format()} monedas.`,
      ripened: `Pasaron ${formatDuration(res.seconds)}: tus cultivos están listos para cosechar.`,
    };
    const canDouble = res.earned.gt(0);
    const choice = await ui.modal({
      title: TEXT.welcomeBack,
      body: lines[res.mode] + (res.capped ? ` (tope de ${farm.offlineHours()} h; el Silo lo amplía)` : ''),
      buttons: canDouble ? [{ label: 'Gracias', value: 'ok', secondary: true }, { label: 'Ver anuncio: ×2', value: 'double' }] : [{ label: '¡A trabajar!', value: 'ok' }],
    });
    if (choice === 'double') {
      const r = await ads.showRewarded('offline_double');
      if (r.rewarded) { farm.earn(res.earned); sfx.coin(); ui.toast(`+${res.earned.format()} monedas extra`); persist(); }
    }
  },

  // ---- listas del panel ----
  refreshList() {
    const tab = this.tabs.active;
    if (tab === 0) this.list.setItems(farm.crops().map((c) => ({ kind: 'crop', crop: c })));
    else if (tab === 1) this.list.setItems(UPGRADES.map((u) => ({ kind: 'upgrade', up: u })));
    else if (tab === 2) this.list.setItems([{ kind: 'era' }, { kind: 'prestige' }]);
    else this.list.setItems([
      ...GEM_SHOP.map((g) => ({ kind: 'gem', item: g })),
      { kind: 'ad_boost' },
      { kind: 'shop' },
      { kind: 'sound' },
      { kind: 'backup' },
      { kind: 'stats' },
    ]);
  },

  renderItem(ctx, item, r, pressed) {
    fillRoundRect(ctx, r.x, r.y, r.w, r.h, 12, pressed ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.22)');
    const cx = r.x + 30, cy = r.y + r.h / 2;
    const btn = { x: r.x + r.w - 118, y: r.y + 10, w: 108, h: r.h - 20 };
    const drawBtn = (label, color, fg = '#fff', enabled = true) => {
      ctx.save(); if (!enabled) ctx.globalAlpha = 0.5;
      fillRoundRect(ctx, btn.x, btn.y, btn.w, btn.h, 10, color);
      text(ctx, label, btn.x + btn.w / 2, btn.y + btn.h / 2, { size: 13, align: 'center', weight: '800', color: fg, maxWidth: btn.w - 8 });
      ctx.restore();
    };
    switch (item.kind) {
      case 'crop': {
        const c = item.crop;
        const unlocked = farm.isUnlocked(c.id);
        drawCrop(ctx, c, 1, cx, cy + 12, 44, clock);
        text(ctx, c.name, r.x + 62, cy - 12, { size: 15, weight: '800', color: '#fff', shadow: 'rgba(0,0,0,0.35)' });
        text(ctx, `${Math.round(farm.cropTime(c))} s · ${farm.cropValue(c).format()} 🪙`, r.x + 62, cy + 10, { size: 12, color: 'rgba(255,255,255,0.9)' });
        if (!unlocked) drawBtn(`Abrir ${farm.unlockCost(c.id).format()}`, farm.s.coins.gte(farm.unlockCost(c.id)) ? '#ffd166' : '#6b6b6b', '#3a2a00');
        else if (farm.s.selectedCrop === c.id) drawBtn('✓ Elegido', '#2d6a4f');
        else drawBtn('Sembrar', '#4f9a3f');
        break;
      }
      case 'upgrade': {
        const u = item.up;
        const lvl = farm.level(u.id);
        const cost = farm.upgradeCost(u.id);
        drawIcon(ctx, u.icon, cx, cy, 26, '#fff');
        text(ctx, `${u.name} · nv ${lvl}${u.max < 999 ? `/${u.max}` : ''}`, r.x + 62, cy - 12, { size: 15, weight: '800', color: '#fff', shadow: 'rgba(0,0,0,0.35)' });
        text(ctx, u.desc, r.x + 62, cy + 10, { size: 11, color: 'rgba(255,255,255,0.9)', maxWidth: r.w - 190 });
        if (!cost) drawBtn('Máximo', '#2d6a4f');
        else drawBtn(cost.format(), farm.s.coins.gte(cost) ? '#ffd166' : '#6b6b6b', '#3a2a00');
        break;
      }
      case 'era': {
        const next = getEra(farm.s.era + 1);
        text(ctx, `Siguiente: ${next.name}`, r.x + 14, cy - 12, { size: 15, weight: '800', color: '#fff', shadow: 'rgba(0,0,0,0.35)' });
        const plots = gridSize(farm.s.era + 1) ** 2 - farm.s.plots.length;
        text(ctx, `×${BALANCE.ERA_MULT} ingresos${plots > 0 ? ` · +${plots} parcelas` : ''} · ${next.crops[0].name} gratis`, r.x + 14, cy + 10, { size: 11, color: 'rgba(255,255,255,0.9)', maxWidth: r.w - 140 });
        drawBtn(farm.canUnlockEra() ? '¡Fundar!' : farm.eraCost().format(), farm.canUnlockEra() ? '#ffd166' : '#6b6b6b', '#3a2a00');
        break;
      }
      case 'prestige': {
        const gain = farm.prestigeGain();
        text(ctx, `Herencia · ${farm.s.medals} medallas`, r.x + 14, cy - 12, { size: 15, weight: '800', color: '#fff', shadow: 'rgba(0,0,0,0.35)' });
        text(ctx, farm.canPrestige() ? `Reinicia la granja y gana +${gain} medallas (×${BALANCE.MEDAL_MULT} cada una, para siempre)` : `Disponible desde la era ${BALANCE.PRESTIGE_MIN_ERA + 1}`, r.x + 14, cy + 10, { size: 11, color: 'rgba(255,255,255,0.9)', maxWidth: r.w - 140 });
        drawBtn(farm.canPrestige() ? `+${gain} 🏅` : 'Bloqueado', farm.canPrestige() && gain > 0 ? '#c77dff' : '#6b6b6b');
        break;
      }
      case 'gem': {
        drawGem(ctx, cx, cy, 13);
        text(ctx, item.item.name, r.x + 62, cy - 12, { size: 15, weight: '800', color: '#fff', shadow: 'rgba(0,0,0,0.35)' });
        text(ctx, item.item.desc, r.x + 62, cy + 10, { size: 11, color: 'rgba(255,255,255,0.9)', maxWidth: r.w - 190 });
        drawBtn(`${item.item.gems} 💎`, farm.s.gems >= item.item.gems ? '#48cae4' : '#6b6b6b', '#062a33');
        break;
      }
      case 'ad_boost': {
        const active = farm.s.boosts.adDoubleUntil > Date.now();
        drawIcon(ctx, 'play', cx, cy, 24, '#fff');
        text(ctx, 'Doble ingresos (3 min)', r.x + 62, cy - 12, { size: 15, weight: '800', color: '#fff', shadow: 'rgba(0,0,0,0.35)' });
        text(ctx, active ? `Activo ${formatDuration((farm.s.boosts.adDoubleUntil - Date.now()) / 1000)} más` : 'Ve un anuncio corto y duplica lo que ganas', r.x + 62, cy + 10, { size: 11, color: 'rgba(255,255,255,0.9)', maxWidth: r.w - 190 });
        drawBtn(active ? 'Ampliar' : 'Ver anuncio', '#ef476f');
        break;
      }
      case 'shop': drawIcon(ctx, 'market', cx, cy, 26, '#fff'); text(ctx, 'Tienda', r.x + 62, cy - 12, { size: 15, weight: '800', color: '#fff', shadow: 'rgba(0,0,0,0.35)' }); text(ctx, farm.s.noAds ? 'Sin anuncios activo' : 'Gemas, sin anuncios y Granja dorada', r.x + 62, cy + 10, { size: 11, color: 'rgba(255,255,255,0.9)' }); drawBtn('Abrir', '#118ab2'); break;
      case 'sound': text(ctx, 'Sonido', r.x + 14, cy, { size: 15, weight: '800', color: '#fff', shadow: 'rgba(0,0,0,0.35)' }); drawBtn(farm.s.settings.sound ? 'Activado' : 'Silencio', farm.s.settings.sound ? '#2d6a4f' : '#6b6b6b'); break;
      case 'backup': text(ctx, 'Copia de seguridad', r.x + 14, cy - 12, { size: 15, weight: '800', color: '#fff', shadow: 'rgba(0,0,0,0.35)' }); text(ctx, 'Exportar o importar tu partida como texto', r.x + 14, cy + 10, { size: 11, color: 'rgba(255,255,255,0.9)' }); drawBtn('Gestionar', '#6c757d'); break;
      case 'stats': text(ctx, `${farm.s.stats.harvests} cosechas · ${farm.s.achievements.length} logros`, r.x + 14, cy - 12, { size: 15, weight: '800', color: '#fff', shadow: 'rgba(0,0,0,0.35)' }); text(ctx, `Total ganado: ${farm.s.lifetimeEarned.format()} · ${Math.floor(farm.s.stats.playSeconds / 60)} min jugados`, r.x + 14, cy + 10, { size: 11, color: 'rgba(255,255,255,0.9)' }); break;
      default: break;
    }
  },

  async tapItem(item) {
    switch (item.kind) {
      case 'crop': {
        const c = item.crop;
        if (!farm.isUnlocked(c.id)) {
          if (farm.unlockCrop(c.id)) { sfx.success(); ui.toast(`${c.name} desbloqueado y elegido`); analytics.track(Events.UNLOCK, { crop: c.id }); }
          else { sfx.error(); ui.toast(`Necesitas ${farm.unlockCost(c.id).format()} monedas`); }
        } else { farm.s.selectedCrop = c.id; sfx.tap(); }
        break;
      }
      case 'upgrade': {
        if (farm.buyUpgrade(item.up.id)) { sfx.coin(); burst(LAYOUT.list.x + LAYOUT.list.w - 60, LAYOUT.list.y + 40, ['#ffd166', '#fff']); analytics.track('upgrade', { id: item.up.id, level: farm.level(item.up.id) }); }
        else { sfx.error(); const cost = farm.upgradeCost(item.up.id); if (cost) ui.toast(`Te faltan ${cost.sub(farm.s.coins).format()} monedas`); }
        break;
      }
      case 'era': await this.tryUnlockEra(); break;
      case 'prestige': await this.tryPrestige(); break;
      case 'gem': {
        if (farm.spendGems(item.item.id)) { sfx.success(); ui.toast(item.item.name + ' ✓'); analytics.track('gem_spend', { id: item.item.id }); }
        else { sfx.error(); ui.toast('No tienes gemas suficientes'); }
        break;
      }
      case 'ad_boost': {
        const r = await ads.showRewarded('double_income');
        if (r.rewarded) { farm.grantAdDouble(); sfx.coin(); ui.toast('¡Ingresos ×2 durante 3 minutos!'); }
        break;
      }
      case 'shop': await openShop(); break;
      case 'sound': farm.s.settings.sound = !farm.s.settings.sound; sfx.setEnabled(farm.s.settings.sound); sfx.tap(); break;
      case 'backup': await openBackup(); break;
      default: break;
    }
    persist();
  },

  async tryUnlockEra() {
    if (!farm.canUnlockEra()) { sfx.error(); ui.toast(`Te faltan ${farm.eraCost().sub(farm.s.coins).format()} monedas para la siguiente era`); return; }
    const def = farm.unlockEra();
    persist();
    analytics.track(Events.ERA, { era: farm.s.era });
    sfx.fanfare();
    shake.hit(8, 0.5);
    confetti();
    this.cinematic = { t: 0, def, title: `Era ${farm.s.era + 1}`, lines: [`×2 ingresos permanentes`, `Granja de ${Math.sqrt(farm.s.plots.length)}×${Math.sqrt(farm.s.plots.length)}`, `Nuevo cultivo gratis: ${def.crops[0].name}`, `+${5} gemas`] };
    this.refreshList();
    await ads.maybeInterstitial('era_unlock');
  },

  async tryPrestige() {
    if (!farm.canPrestige()) { sfx.error(); ui.toast('La Herencia se desbloquea en la era 3'); return; }
    const gain = farm.prestigeGain();
    if (gain <= 0) { ui.toast('Aún no ganarías medallas: sigue acumulando'); return; }
    const ok = await ui.confirm('Dejar la granja en herencia', `Empezarás desde cero con +${gain} medallas (cada una multiplica tus ingresos ×1,08 para siempre). Conservas gemas, logros y compras.`, { ok: 'Heredar', cancel: 'Todavía no' });
    if (!ok) return;
    farm.prestige();
    persist();
    analytics.track(Events.PRESTIGE, { medals: farm.s.medals });
    sfx.fanfare(); confetti(); shake.hit(10, 0.6);
    this.cinematic = { t: 0, title: 'Nueva generación', lines: [`${farm.s.medals} medallas`, `Ingresos ×${Math.pow(1.08, farm.s.medals).toFixed(2)}`, 'La granja vuelve a empezar'] };
    this.refreshList();
  },

  // ---- eventos ----
  bannerAction() {
    const ev = farm.s.event;
    if (!ev) return;
    if (ev.type === 'cofre') {
      const r = farm.openChest();
      if (r) { sfx.coin(); confetti(); ui.toast(`Cofre: +${r.gems} gemas y ${r.coins.format()} monedas`); persist(); }
    } else if (ev.type === 'comerciante') {
      ads.showRewarded('merchant_double').then((r) => { if (r.rewarded) { farm.grantAdDouble(); sfx.coin(); ui.toast('¡Trato hecho! Ingresos ×2 durante 3 min'); } farm.dismissEvent(); persist(); });
    } else farm.dismissEvent();
  },

  openMenu() {
    this.tabs.active = 3; this.refreshList(); sfx.tap();
  },

  // ---- bucle ----
  update(dt) {
    const out = farm.tick(dt);
    for (const ev of out) {
      if (ev.type === 'autoharvest') { floats.add(240, LAYOUT.farm.y + 20, `+${ev.total.format()}`, { color: '#ffe66d', size: 18 }); if (ev.count > 3) sfx.harvest(); }
      else if (ev.type === 'weather') { ui.toast(`Clima: ${ev.weather.type}`); }
      else if (ev.type === 'event') { sfx.success(); ui.toast(EVENTS[ev.event.type].name); analytics.track('event', { type: ev.event.type }); }
      else if (ev.type === 'milestone') { sfx.coin(); floats.add(400, 40, '+1 💎', { color: '#9bf6ff' }); }
      else if (ev.type === 'achievement') { sfx.success(); ui.toast(`Logro: ${ev.achievement.name} (+${ev.achievement.gems} 💎)`); }
      else if (ev.type === 'plaga_penalty') { sfx.error(); ui.toast('La plaga dañó la cosecha: −30% durante 30 s'); }
    }
    renderer.update(dt, farm);
    this.list.update(dt);
    this.menuBtn.update(dt);
    this.bannerBtn.update(dt);
    if (this.cinematic) { this.cinematic.t += dt; if (this.cinematic.t > 4) this.cinematic = null; }
    this.lastRate = farm.estimateRate();
    if (farm.s.event) {
      const ev = farm.s.event;
      this.bannerBtn.visible = ev.type === 'cofre' || ev.type === 'comerciante';
      this.bannerBtn.label = ev.type === 'cofre' ? 'Abrir' : 'Ver anuncio';
    } else this.bannerBtn.visible = false;
  },

  render(ctx) {
    ctx.save();
    ctx.translate(shake.x, shake.y);
    renderer.drawBackground(ctx);
    renderer.drawFarm(ctx, farm, { hoverIndex: this.hover });
    renderer.drawWeatherOverlay(ctx);
    // Panel inferior.
    fillRoundRect(ctx, 0, LAYOUT.panel.y, GAME.width, LAYOUT.panel.h + 20, 24, 'rgba(25,45,25,0.78)');
    this.tabs.render(ctx);
    this.list.render(ctx);
    renderer.drawHud(ctx, farm, { rate: this.lastRate });
    this.menuBtn.render(ctx);
    // Banner de evento.
    const ev = farm.s.event;
    if (ev) {
      const def = EVENTS[ev.type];
      fillRoundRect(ctx, 20, 490, 440, 56, 14, ev.type === 'plaga' ? 'rgba(160,30,30,0.85)' : 'rgba(30,60,30,0.85)');
      text(ctx, def.name, 34, 508, { size: 15, weight: '800', color: '#fff' });
      const sub = ev.type === 'plaga' ? (ev.penalty ? '¡Daño activo! −30%' : `Quedan ${ev.left} bichos · ${Math.ceil(ev.dur - ev.t)} s`) : `${def.desc} (${Math.ceil(ev.dur - ev.t)} s)`;
      text(ctx, sub, 34, 530, { size: 12, color: 'rgba(255,255,255,0.9)', maxWidth: this.bannerBtn.visible ? 290 : 410 });
      this.bannerBtn.render(ctx);
    }
    ctx.restore();
    // Cinemática de era.
    if (this.cinematic) {
      const c = this.cinematic;
      const k = Math.min(1, c.t / 0.5) * (c.t > 3.3 ? Math.max(0, 1 - (c.t - 3.3) / 0.7) : 1);
      ctx.save();
      ctx.globalAlpha = k * 0.85;
      ctx.fillStyle = '#0b1a0b';
      ctx.fillRect(0, 0, GAME.width, GAME.height);
      ctx.globalAlpha = k;
      const pop = Ease.outBack(Math.min(1, c.t / 0.6));
      ctx.translate(240, 330); ctx.scale(pop, pop);
      text(ctx, c.title, 0, -70, { size: 26, align: 'center', weight: '700', color: '#ffe66d' });
      text(ctx, c.def ? c.def.name : '¡Herencia!', 0, -20, { size: 44, align: 'center', weight: '900', color: '#fff', shadow: 'rgba(0,0,0,0.5)' });
      c.lines.forEach((l, i) => text(ctx, l, 0, 40 + i * 30, { size: 18, align: 'center', color: 'rgba(255,255,255,0.95)' }));
      ctx.restore();
    }
  },

  pointer(e) {
    if (ui.busy) return;
    if (this.cinematic) { if (e.type === 'tap') this.cinematic = null; return; }
    if (this.menuBtn.handle(e)) return;
    if (this.bannerBtn.visible && this.bannerBtn.handle(e)) return;
    if (this.tabs.handle(e)) return;
    if (this.list.handle(e)) return;
    if (e.type === 'hover') { this.hover = renderer.plotAt(farm, e.x, e.y); return; }
    const idx = renderer.plotAt(farm, e.x, e.y);
    if (e.type === 'down') { this.dragVisited.clear(); if (idx >= 0) this.actOnPlot(idx, e); }
    else if (e.type === 'drag' && idx >= 0 && !this.dragVisited.has(idx)) this.actOnPlot(idx, e, true);
    else if (e.type === 'up' || e.type === 'cancel') this.dragVisited.clear();
  },

  actOnPlot(idx, e, swiping = false) {
    this.dragVisited.add(idx);
    const r = renderer.tileRect(farm, idx);
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    const res = farm.tapPlot(idx);
    switch (res.kind) {
      case 'harvest': {
        sfx.harvest();
        burst(cx, cy, [res.crop?.color || '#ffe66d', '#ffe66d', '#fff'], 12, 'circle');
        floats.add(cx, cy - 20, `+${res.value.format()}`, { color: '#ffe66d', size: 16 });
        if (farm.s.stats.harvests === 1) analytics.track(Events.FIRST_ACTION, { kind: 'harvest' });
        break;
      }
      case 'plant': sfx.plant(); burst(cx, cy + 10, ['#7a4e2d', '#5cb85c'], 6, 'square'); break;
      case 'bug': sfx.pop(0.7); shake.hit(3, 0.15); burst(cx, cy, ['#d62828', '#2b2b2b'], 10); floats.add(cx, cy - 20, `+${res.bonus.format()}`, { color: '#ffd166' }); if (res.cleared) { sfx.success(); ui.toast('¡Plaga eliminada!'); } break;
      case 'growing': if (!swiping) floats.add(cx, cy - 20, `${Math.ceil(res.left)} s`, { color: '#fff', size: 14 }); break;
      case 'locked': if (!swiping) { sfx.error(); ui.toast('Elige un cultivo desbloqueado en la pestaña Cultivos'); } break;
      default: break;
    }
  },
};
scenes.register('game', game);

// ---------- tienda y copias ----------
async function openShop() {
  const content = document.createElement('div');
  for (const p of IAP_CATALOG) {
    const owned = iap.owns(p.sku) && p.type === 'nonconsumable';
    const b = document.createElement('button');
    b.className = 'kit-btn' + (owned ? ' secondary' : '');
    b.style.cssText = 'margin:6px 0;width:100%;text-align:left;font-size:.95rem';
    b.innerHTML = owned ? `<b>${p.title}</b> ✓` : `<b>${p.title}</b> — ${p.priceLabel}<br><span style="font-weight:400;opacity:.85;font-size:.85rem">${p.desc}</span>`;
    b.disabled = owned;
    b.onclick = async () => { const r = await iap.purchase(p.sku); if (r.ok) { sfx.coin(); ui.toast('¡Gracias por apoyar la granja!'); b.disabled = p.type === 'nonconsumable'; if (b.disabled) b.textContent = `${p.title} ✓`; } };
    content.appendChild(b);
  }
  const note = document.createElement('p');
  note.style.cssText = 'font-size:.8rem;opacity:.7;margin-top:10px';
  note.textContent = 'Versión web: las compras son simuladas y no se cobra nada.';
  content.appendChild(note);
  await ui.modal({ title: 'Tienda', content, buttons: [{ label: 'Restaurar compras', value: 'restore', secondary: true }, { label: 'Cerrar', value: null }] })
    .then(async (v) => { if (v === 'restore') { const r = await iap.restore(); ui.toast(r.length ? `Restaurado: ${r.join(', ')}` : 'Nada que restaurar'); } });
}

async function openBackup() {
  const area = document.createElement('textarea');
  area.className = 'kit-input';
  area.style.cssText = 'height:120px;font-size:.7rem;text-align:left';
  area.value = store.exportJSON(farm.toSave());
  const v = await ui.modal({ title: 'Copia de seguridad', body: 'Copia este texto para guardarlo, o pega uno guardado e importa.', content: area, buttons: [{ label: 'Cerrar', value: null, secondary: true }, { label: 'Importar', value: 'import' }] });
  if (v === 'import') {
    const r = store.importJSON(area.value);
    if (!r.ok) { ui.toast(`No se pudo importar (${r.error})`); return; }
    const ok = await ui.confirm('Importar partida', 'Se reemplazará la partida actual por la del texto. ¿Continuar?');
    if (!ok) return;
    Object.assign(farm, new Farm(r.data));
    persist();
    scenes.get('game').refreshList();
    ui.toast('Partida importada');
  }
}

// ---------- arranque ----------
new Pointer(surface, (e) => scenes.pointer(e));

// En desarrollo (localhost) el bucle no se pausa en segundo plano, para poder automatizar pruebas;
// en producción sí, para ahorrar batería.
const isDev = ['localhost', '127.0.0.1'].includes(location.hostname);
const loop = new GameLoop({
  pauseWhenHidden: !isDev,
  update(dt) { clock += dt; tweens.update(dt); particles.update(dt); floats.update(dt); shake.update(dt); scenes.update(dt); },
  render(alpha) { scenes.render(alpha); particles.render(surface.ctx); floats.render(surface.ctx); },
});
scenes.switch('splash', {}, { duration: 0 });
loop.start();

// El service worker solo se registra fuera de localhost: en desarrollo serviría archivos viejos desde caché.
if ('serviceWorker' in navigator && location.protocol !== 'file:' && !isDev) navigator.serviceWorker.register('./sw.js').catch(() => {});

// Exposición mínima para depuración manual en consola (no para el jugador).
window.__granja = { farm, persist, Big, loop, scenes };
