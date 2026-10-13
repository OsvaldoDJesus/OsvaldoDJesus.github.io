// Estudio Glam: pantallas, entrada y servicios. Público infantil: puerta parental en compras,
// anuncios marcados como dirigidos a menores, sin enlaces externos ni datos personales.
import {
  GameLoop, SceneManager, createCanvas, Pointer, SaveStore, Sfx, Particles, FloatingTexts, Tweens, Ease, UI,
  Analytics, StorageSink, Events, AdsService, MockAdsProvider, IapService, MockIapProvider, createParentalGate,
  Button, ScrollList, fillRoundRect, text, offscreen,
} from './kit/index.js';
import { GAME, TOOLS, PALETTES, STICKERS, ACCESSORIES, CHARACTERS, LOOKS, PACKS, IAP_CATALOG, TEXT } from './content.mjs';
import { Studio, createSave, validateSave, MIGRATIONS, toolById, swatch } from './engine.mjs';
import { FaceRenderer, LAYOUT, drawSticker, drawToolIcon, drawLock, FACE_W, FACE_H } from './renderer.mjs';

// ---------- infraestructura ----------
const root = document.getElementById('game');
const surface = createCanvas({ parent: root, width: GAME.width, height: GAME.height, background: '#ffd6e8' });
const ui = new UI({ surface, parent: root });
const sfx = new Sfx();
const particles = new Particles({ max: 900 });
const floats = new FloatingTexts();
const tweens = new Tweens();
const analytics = new Analytics({ app: GAME.id, version: GAME.version, sink: new StorageSink({ key: `${GAME.id}.analytics` }) });

const store = new SaveStore({ key: `${GAME.id}.save`, version: GAME.saveVersion, defaults: createSave, migrations: MIGRATIONS, validate: validateSave });
const loaded = store.load();
const studio = new Studio(loaded.data);
const save = studio.save;
sfx.setEnabled(save.settings.sound !== false);
const persist = () => { save.current = studio.serializeLook(); save.lastSeen = Date.now(); store.save(save); };
window.addEventListener('pagehide', () => { persist(); store.flush(); });
setInterval(persist, 15_000);

const parentalGate = createParentalGate(ui);
const ads = new AdsService({ provider: new MockAdsProvider({ ui, rewardedSeconds: 5, interstitialSeconds: 3 }), analytics, childDirected: GAME.childDirected, caps: { interstitialGraceSec: 300, interstitialMinIntervalSec: 240, interstitialMinActions: 2 } });
ads.setNoAds(!!save.noAds);
const iap = new IapService({
  provider: new MockIapProvider({ ui }), catalog: IAP_CATALOG, analytics, entitlements: save.entitlements, parentalGate,
  onGrant: (p) => {
    if (p.grant.noAds) { save.noAds = true; ads.setNoAds(true); }
    if (p.grant.coins) save.coins += p.grant.coins;
    if (p.grant.unlockAll) studio.unlockEverything();
    save.entitlements = iap.snapshot();
    persist();
  },
});
analytics.track(Events.SESSION_START, { fresh: loaded.fresh, coins: save.coins });

let clock = 0;
const face = new FaceRenderer();
face.paint.rebuild(studio.look.strokes, toolById);
const scenes = new SceneManager({ ctx: surface.ctx, width: GAME.width, height: GAME.height });

const praise = () => TEXT.praise[Math.floor(Math.random() * TEXT.praise.length)];
function sparkle(x, y, colors = ['#fff', '#ffd166', '#ff8fab'], count = 10) {
  particles.emit({ x, y, count, colors, shape: 'star', speed: 90, life: 0.6, gravity: 40, size: 5 });
}

// ---------- splash ----------
scenes.register('splash', {
  enter() { this.t = 0; this.logo = { s: 0.3, a: 0 }; tweens.to(this.logo, { s: 1, a: 1 }, 0.9, Ease.outBack, { delay: 0.2 }); },
  update(dt) { this.t += dt; face.update(dt, { happy: 1 }); if (this.t > 3) scenes.switch('studio', {}, { duration: 0.5, color: '#fff' }); },
  render(ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, GAME.height); g.addColorStop(0, '#ff8fab'); g.addColorStop(1, '#c77dff');
    ctx.fillStyle = g; ctx.fillRect(0, 0, GAME.width, GAME.height);
    ctx.save(); ctx.translate(0, 120); ctx.beginPath(); ctx.roundRect(60, 0, 360, 380, 40); ctx.clip(); ctx.translate(-60, -60); ctx.scale(1, 1);
    face.draw(ctx, studio.look, studio.character, { showPaint: true });
    ctx.restore();
    for (let i = 0; i < 14; i++) { ctx.fillStyle = `rgba(255,255,255,${0.4 + 0.5 * Math.abs(Math.sin(this.t * 2 + i))})`; const a = this.t + i; drawStarAt(ctx, 240 + Math.cos(a * 0.7 + i) * 200, 300 + Math.sin(a * 0.9 + i * 2) * 250, 5 + (i % 3) * 3); }
    ctx.save(); ctx.globalAlpha = this.logo.a; ctx.translate(240, 580); ctx.scale(this.logo.s, this.logo.s);
    text(ctx, 'ESTUDIO', 0, -30, { size: 40, weight: '900', align: 'center', color: '#fff', shadow: 'rgba(120,0,60,0.5)' });
    text(ctx, 'GLAM', 0, 30, { size: 72, weight: '900', align: 'center', color: '#ffe66d', shadow: 'rgba(120,0,60,0.6)' });
    ctx.restore();
    if (this.t > 1) text(ctx, TEXT.tapToStart, 240, 730, { size: 18, align: 'center', color: `rgba(255,255,255,${0.5 + Math.sin(this.t * 4) * 0.4})` });
  },
  pointer(e) { if (e.type === 'tap' && this.t > 0.5) scenes.switch('studio', {}, { duration: 0.5, color: '#fff' }); },
});

function drawStarAt(ctx, x, y, s) { ctx.beginPath(); for (let i = 0; i < 8; i++) { const r = i % 2 ? s * 0.4 : s; const a = (i * Math.PI) / 4; ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } ctx.closePath(); ctx.fill(); }

// ---------- estudio ----------
const studioScene = {
  enter() {
    this.pointerPos = null;
    this.happy = 0;
    this.brushTimer = 0;
    this.challenge = null; // look activo o null (modo libre)
    this.cleaning = 0;
    this.tools = new ScrollList({ ...LAYOUT.tools, horizontal: true, itemHeight: 76, gap: 6, padding: 6, renderItem: (ctx, item, i, r, pressed) => this.renderTool(ctx, item, r, pressed), onTap: (item) => this.pickTool(item) });
    this.tools.setItems(TOOLS);
    this.palette = new ScrollList({ ...LAYOUT.palette, horizontal: true, itemHeight: 54, gap: 6, padding: 6, renderItem: (ctx, item, i, r, pressed) => this.renderSwatch(ctx, item, r, pressed), onTap: (item) => this.pickSwatch(item) });
    this.refreshPalette();
    const by = LAYOUT.bottom.y + 8;
    this.buttons = [
      new Button({ x: 10, y: by, w: 108, h: 54, label: 'Personaje', color: '#c77dff', size: 15, onTap: () => openCharacters() }),
      new Button({ x: 124, y: by, w: 116, h: 54, label: TEXT.looks, color: '#ff5d8f', size: 15, onTap: () => this.toggleChallenge() }),
      new Button({ x: 246, y: by, w: 108, h: 54, label: TEXT.gallery, color: '#4cc9f0', fg: '#083344', size: 15, onTap: () => openGallery() }),
      new Button({ x: 360, y: by, w: 110, h: 54, label: 'Tienda', color: '#ffd166', fg: '#5a3a00', size: 15, onTap: () => openShop() }),
    ];
    this.topButtons = [
      new Button({ x: 376, y: 10, w: 44, h: 40, label: '↶', color: 'rgba(0,0,0,0.3)', size: 22, radius: 12, onTap: () => this.undo() }),
      new Button({ x: 426, y: 10, w: 44, h: 40, label: '📷', color: 'rgba(0,0,0,0.3)', size: 20, radius: 12, onTap: () => this.takePhoto() }),
    ];
    this.doneBtn = new Button({ x: 330, y: 496, w: 136, h: 52, label: TEXT.done, color: '#ff5d8f', size: 20, onTap: () => this.finishChallenge() });
    this.doneBtn.visible = false;
    this.soundBtn = new Button({ x: 10, y: 56, w: 44, h: 36, label: save.settings.sound ? '🔊' : '🔇', color: 'rgba(0,0,0,0.25)', size: 18, radius: 12, onTap: () => { save.settings.sound = !save.settings.sound; sfx.setEnabled(save.settings.sound); this.soundBtn.label = save.settings.sound ? '🔊' : '🔇'; persist(); } });
  },

  // ----- herramientas y paletas -----
  refreshPalette() {
    const t = studio.currentTool;
    if (t.palette === 'stickers') this.palette.setItems(STICKERS.map((s) => ({ kind: 'sticker', item: s })));
    else if (t.palette === 'accessories') this.palette.setItems(ACCESSORIES.map((a) => ({ kind: 'accessory', item: a })));
    else if (t.palette && PALETTES[t.palette]) this.palette.setItems(PALETTES[t.palette].map((s) => ({ kind: 'swatch', item: s })));
    else this.palette.setItems([]);
    this.palette.offset = 0;
  },
  renderTool(ctx, tool, r, pressed) {
    const active = studio.tool === tool.id;
    fillRoundRect(ctx, r.x, r.y, r.w, r.h, 14, active ? '#ff5d8f' : pressed ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.7)');
    drawToolIcon(ctx, tool.icon, r.x + r.w / 2, r.y + r.h / 2 - 8, 30, active ? '#fff' : '#7a2a52');
    text(ctx, tool.name, r.x + r.w / 2, r.y + r.h - 12, { size: 11, align: 'center', weight: '800', color: active ? '#fff' : '#7a2a52' });
  },
  renderSwatch(ctx, entry, r, pressed) {
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    const it = entry.item;
    const unlocked = studio.isUnlocked(it);
    fillRoundRect(ctx, r.x, r.y, r.w, r.h, 12, pressed ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.55)');
    if (entry.kind === 'swatch') {
      ctx.fillStyle = it.color; ctx.beginPath(); ctx.arc(cx, cy, 19, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 2; ctx.stroke();
      const selected = studio.currentTool.kind === 'hair' ? studio.look.hair === it.color : studio.color === it.id;
      if (selected) { ctx.strokeStyle = '#ff5d8f'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(cx, cy, 23, 0, Math.PI * 2); ctx.stroke(); }
    } else if (entry.kind === 'sticker') {
      drawSticker(ctx, it.id, cx, cy, 30, 0, it.color);
      if (studio.sticker === it.id) { ctx.strokeStyle = '#ff5d8f'; ctx.lineWidth = 3; fillRoundRect(ctx, r.x + 2, r.y + 2, r.w - 4, r.h - 4, 10, 'rgba(255,93,143,0.15)'); }
    } else {
      const on = studio.look.accessories.includes(it.id);
      fillRoundRect(ctx, r.x + 4, r.y + 4, r.w - 8, r.h - 8, 10, on ? '#ff5d8f' : 'rgba(255,255,255,0.4)');
      text(ctx, it.name, cx, cy, { size: 10, align: 'center', weight: '800', color: on ? '#fff' : '#7a2a52', maxWidth: r.w - 8 });
    }
    if (!unlocked) { drawLock(ctx, cx + 14, cy - 14, 10); text(ctx, `${it.cost}`, cx, r.y + r.h - 7, { size: 10, align: 'center', weight: '800', color: '#7a2a52' }); }
  },
  pickTool(tool) {
    studio.setTool(tool.id);
    sfx.tap();
    this.refreshPalette();
    if (tool.kind === 'clean') this.cleanAll();
  },
  async pickSwatch(entry) {
    const it = entry.item;
    if (!studio.isUnlocked(it)) { await this.offerUnlock(it); return; }
    if (studio.setColor(it.id)) { sfx.tap(); if (studio.currentTool.kind === 'hair' || studio.currentTool.kind === 'accessory') sparkle(240, 160, ['#fff', it.color || '#ffd166'], 16); }
  },
  async offerUnlock(it) {
    const pack = it.pack ? PACKS[it.pack] : null;
    const buttons = [{ label: 'Ahora no', value: null, secondary: true }];
    if (save.coins >= it.cost) buttons.push({ label: `Desbloquear (${it.cost} 🪙)`, value: 'coins' });
    buttons.push({ label: 'Ver anuncio y usar hoy', value: 'ad' });
    const v = await ui.modal({ title: '¡Bloqueado!', body: `${pack ? `${pack.name}: ` : ''}cuesta ${it.cost} monedas. Tienes ${save.coins}. Gana monedas completando retos.`, buttons });
    if (v === 'coins') { studio.unlock(it); sfx.success(); sparkle(240, 690, undefined, 20); analytics.track(Events.UNLOCK, { id: it.id, how: 'coins' }); persist(); }
    else if (v === 'ad') { const r = await ads.showRewarded('unlock_today'); if (r.rewarded) { studio.unlockForSession(it); sfx.success(); ui.toast('¡Desbloqueado por hoy!'); analytics.track(Events.UNLOCK, { id: it.id, how: 'ad' }); } }
  },

  // ----- acciones -----
  undo() {
    if (studio.undo()) { face.paint.rebuild(studio.look.strokes, toolById); sfx.whoosh(); } else sfx.error();
  },
  cleanAll() {
    if (this.cleaning > 0) return;
    this.cleaning = 1.2;
    sfx.splash();
    for (let i = 0; i < 6; i++) particles.emit({ x: 60 + i * 72, y: 80, count: 30, colors: ['#a2d2ff', '#bde0fe', '#fff'], speed: 220, spread: Math.PI * 0.8, angle: Math.PI / 2, life: 1, gravity: 500, size: 6 });
    tweens.delay(0.5, () => { studio.clearAll(); face.paint.clear(); this.happy = 0.6; persist(); });
    analytics.track('clean', {});
  },
  toggleChallenge() {
    if (this.challenge) { this.challenge = null; this.doneBtn.visible = false; this.buttons[1].label = TEXT.looks; ui.toast('Modo libre'); }
    else { this.challenge = studio.nextLook(); this.doneBtn.visible = true; this.buttons[1].label = TEXT.free; sfx.success(); ui.toast(`Reto: ${this.challenge.name}`); analytics.track(Events.LEVEL_START, { look: this.challenge.id }); }
    sfx.tap();
  },
  async finishChallenge() {
    const look = this.challenge;
    if (!look) return;
    const r = studio.completeLook(look);
    persist();
    analytics.track(Events.LEVEL_COMPLETE, { look: look.id, stars: r.stars, score: Math.round(r.score * 100) });
    if (r.stars >= 2) { sfx.fanfare(); for (let i = 0; i < 5; i++) sparkle(80 + i * 80, 120 + (i % 2) * 60, ['#ffd166', '#ff5d8f', '#fff', '#c77dff'], 24); } else if (r.stars === 1) sfx.success(); else sfx.error();
    this.happy = 1;
    await ads.maybeInterstitial('look_done');
    const stars = '★'.repeat(r.stars) + '☆'.repeat(3 - r.stars);
    const missing = r.details.filter((d) => d.k < 0.6).map((d) => d.req.layer ? toolById(TOOLS.find((t) => t.layer === d.req.layer)?.id)?.name : d.req.lashes ? 'pestañas' : d.req.accessory ? ACCESSORIES.find((a) => a.id === d.req.accessory)?.name : 'pegatinas').filter(Boolean);
    const v = await ui.modal({
      title: r.stars >= 2 ? praise() : 'Casi…',
      body: `${stars}\n${look.name}: +${r.paid} monedas${missing.length ? `\nFalta: ${missing.join(', ')}` : ''}`,
      buttons: [{ label: 'Guardar foto', value: 'photo', secondary: true }, ...(r.paid > 0 ? [{ label: 'Ver anuncio: ×2 monedas', value: 'double' }] : []), { label: 'Siguiente', value: 'next' }],
    });
    if (v === 'photo') await this.takePhoto(look.id);
    if (v === 'double') { const ad = await ads.showRewarded('double_coins'); if (ad.rewarded) { save.coins += r.paid; sfx.coin(); ui.toast(`+${r.paid} monedas extra`); persist(); } }
    this.challenge = studio.nextLook();
    ui.toast(`Siguiente reto: ${this.challenge.name}`);
  },
  async takePhoto(lookId = null) {
    const big = offscreen(FACE_W * 2, FACE_H * 2);
    big.ctx.scale(2, 2);
    face.draw(big.ctx, studio.look, studio.character);
    const thumb = offscreen(120, 140);
    thumb.ctx.drawImage(big.canvas, 0, 0, FACE_W * 2, FACE_H * 2, 0, 0, 120, 140);
    studio.addToGallery(thumb.canvas.toDataURL('image/jpeg', 0.7), lookId);
    persist();
    sfx.sparkle();
    particles.emit({ x: 240, y: 280, count: 40, colors: ['#fff'], speed: 300, life: 0.4, gravity: 0, size: 6 });
    analytics.track(Events.SHARE, { kind: 'photo' });
    // Flash blanco.
    this.flash = 1;
    try {
      const a = document.createElement('a');
      a.href = big.canvas.toDataURL('image/png');
      a.download = `estudio-glam-${Date.now()}.png`;
      a.click();
    } catch { /* algunas WebViews no permiten descargas; la galería interna conserva la foto */ }
    ui.toast('¡Foto guardada en la galería!');
  },

  // ----- bucle -----
  update(dt) {
    this.happy = Math.max(0, this.happy - dt * 0.15);
    face.update(dt, { pointer: this.pointerPos, happy: Math.min(1, this.happy) });
    this.tools.update(dt); this.palette.update(dt);
    for (const b of [...this.buttons, ...this.topButtons, this.doneBtn, this.soundBtn]) b.update(dt);
    if (this.cleaning > 0) this.cleaning -= dt;
    if (this.flash > 0) this.flash -= dt * 3;
    this.brushTimer -= dt;
  },
  render(ctx) {
    face.draw(ctx, studio.look, studio.character);
    // Agua cayendo durante la limpieza.
    if (this.cleaning > 0) { ctx.fillStyle = `rgba(160,210,255,${Math.min(0.5, this.cleaning * 0.5)})`; ctx.fillRect(0, 0, FACE_W, FACE_H); }
    // HUD superior.
    fillRoundRect(ctx, 10, 10, 120, 40, 14, 'rgba(0,0,0,0.3)');
    text(ctx, `🪙 ${save.coins}`, 70, 30, { size: 18, weight: '800', align: 'center', color: '#ffe66d', shadow: 'rgba(0,0,0,0.3)' });
    for (const b of this.topButtons) b.render(ctx);
    this.soundBtn.render(ctx);
    if (this.challenge) {
      fillRoundRect(ctx, 140, 10, 226, 44, 14, 'rgba(255,93,143,0.85)');
      text(ctx, `Reto: ${this.challenge.name}`, 253, 23, { size: 14, weight: '800', align: 'center', color: '#fff', maxWidth: 210 });
      text(ctx, this.challenge.desc, 253, 42, { size: 10, align: 'center', color: 'rgba(255,255,255,0.95)', maxWidth: 214 });
      this.doneBtn.render(ctx);
    }
    // Panel inferior.
    const g = ctx.createLinearGradient(0, 556, 0, 800); g.addColorStop(0, '#ffb3d1'); g.addColorStop(1, '#f6a5ff');
    ctx.fillStyle = g; fillRoundRect(ctx, 0, 556, 480, 260, 26, g);
    this.tools.render(ctx);
    if (this.palette.items.length) this.palette.render(ctx);
    else text(ctx, studio.currentTool.kind === 'erase' ? 'Frota para quitar el maquillaje' : studio.currentTool.kind === 'lashes' ? 'Pinta sobre los ojos para alargar las pestañas' : 'Toca la cara', 240, 691, { size: 14, align: 'center', weight: '700', color: '#7a2a52' });
    for (const b of this.buttons) b.render(ctx);
    if (this.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${this.flash})`; ctx.fillRect(0, 0, 480, 800); }
  },

  pointer(e) {
    if (ui.busy) return;
    if (e.type === 'hover' || e.type === 'move' || e.type === 'drag' || e.type === 'down') this.pointerPos = { x: e.x, y: e.y };
    for (const b of [...this.topButtons, this.soundBtn, this.doneBtn, ...this.buttons]) if (b.handle(e)) return;
    if (this.tools.handle(e)) return;
    if (this.palette.handle(e)) return;
    if (e.y >= LAYOUT.face.h) return;
    const tool = studio.currentTool;
    if (tool.kind === 'sticker') {
      if (e.type === 'tap') { const s = studio.placeSticker(e.x, e.y); if (s) { sfx.pop(1.2); sparkle(e.x, e.y, ['#fff', STICKERS.find((d) => d.id === s.id)?.color || '#ffd166']); this.happy += 0.3; persist(); } }
      return;
    }
    if (tool.kind === 'hair' || tool.kind === 'accessory' || tool.kind === 'clean') { if (e.type === 'tap') ui.toast('Elige abajo'); return; }
    if (e.type === 'down') {
      const stamps = studio.beginStroke(e.x, e.y);
      if (stamps) { this.paintStamps(tool, stamps); this.happy += 0.1; }
    } else if ((e.type === 'move' || e.type === 'drag') && studio.activeStroke) {
      const stamps = studio.addPoint(e.x, e.y);
      if (stamps && stamps.length) { this.paintStamps(tool, stamps); this.happy += 0.02 * stamps.length; if (this.brushTimer <= 0) { sfx.brush(); this.brushTimer = 0.12; } }
    } else if (e.type === 'up' || e.type === 'cancel') {
      if (studio.activeStroke) { studio.endStroke(); persist(); }
    }
  },
  paintStamps(tool, stamps) {
    const color = tool.palette ? swatch(tool.palette, studio.color)?.color : null;
    for (const s of stamps) {
      if (tool.kind === 'lashes') continue; // las pestañas son un parámetro, no pintura
      face.paint.stamp(tool, color, s.x, s.y, tool.brush.size, { erase: tool.kind === 'erase' });
      if (tool.brush?.sparkle) sparkle(s.x, s.y, [color, '#fff'], 2);
    }
    if (tool.kind === 'erase' && stamps.length) particles.emit({ x: stamps[0].x, y: stamps[0].y, count: 2, colors: ['#fff'], speed: 40, life: 0.4, gravity: 0, size: 4 });
  },
};
scenes.register('studio', studioScene);

// ---------- modales ----------
function manualModal(title, content, onClose) {
  const back = document.createElement('div'); back.className = 'kit-modal-back';
  const box = document.createElement('div'); box.className = 'kit-modal';
  const h = document.createElement('h2'); h.textContent = title;
  const close = document.createElement('button'); close.className = 'kit-btn'; close.textContent = 'Cerrar'; close.style.marginTop = '10px';
  close.onclick = () => { back.remove(); ui.openModals--; onClose?.(); };
  box.append(h, content, close); back.appendChild(box); ui.root.appendChild(back); ui.openModals++;
  return () => { back.remove(); ui.openModals--; };
}

function openCharacters() {
  const content = document.createElement('div');
  content.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px';
  let closeFn;
  for (const c of CHARACTERS) {
    const unlocked = studio.isUnlocked(c);
    const b = document.createElement('button');
    b.className = 'kit-btn' + (studio.look.character === c.id ? '' : ' secondary');
    b.style.cssText = `padding:10px;display:flex;flex-direction:column;align-items:center;gap:6px;border-top:6px solid ${c.hair}`;
    b.innerHTML = `<i style="width:36px;height:36px;border-radius:50%;background:${c.skin};display:block;border:3px solid ${c.hair}"></i><span>${c.name}${unlocked ? '' : ` 🔒 ${c.cost}`}</span>`;
    b.onclick = async () => {
      if (!unlocked) { closeFn(); await studioScene.offerUnlock(c); return; }
      const ok = studio.look.strokes.length === 0 || await ui.confirm('Cambiar de personaje', 'Se limpiará el maquillaje actual. ¿Seguir?', { ok: 'Cambiar' });
      if (!ok) return;
      studio.setCharacter(c.id); face.paint.clear(); persist(); sfx.success(); closeFn();
    };
    content.appendChild(b);
  }
  closeFn = manualModal('Personaje', content);
}

function openGallery() {
  const content = document.createElement('div');
  if (!save.gallery.length) { content.textContent = 'Aún no hay fotos. Pulsa 📷 para guardar tu look.'; content.style.opacity = '.85'; }
  else {
    content.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:6px';
    for (const g of save.gallery) {
      const img = document.createElement('img'); img.src = g.thumb; img.alt = g.look || 'look'; img.style.cssText = 'width:100%;border-radius:10px;display:block;background:#fff';
      content.appendChild(img);
    }
  }
  manualModal(TEXT.gallery, content);
}

async function openShop() {
  const content = document.createElement('div');
  for (const p of IAP_CATALOG) {
    const owned = iap.owns(p.sku) && p.type === 'nonconsumable';
    const b = document.createElement('button');
    b.className = 'kit-btn' + (owned ? ' secondary' : '');
    b.style.cssText = 'margin:5px 0;width:100%;text-align:left;font-size:.95rem';
    b.innerHTML = owned ? `<b>${p.title}</b> ✓` : `<b>${p.title}</b> — ${p.priceLabel}<br><span style="font-weight:400;opacity:.85;font-size:.85rem">${p.desc}</span>`;
    b.disabled = owned;
    b.onclick = async () => { closeFn(); const r = await iap.purchase(p.sku); if (r.ok) { sfx.fanfare(); sparkle(240, 400, undefined, 40); ui.toast('¡Gracias!'); } else if (r.reason === 'parental_gate') ui.toast('Pide ayuda a un adulto para comprar'); };
    content.appendChild(b);
  }
  const note = document.createElement('p'); note.style.cssText = 'font-size:.75rem;opacity:.7;margin:8px 0 0';
  note.textContent = 'Las compras piden la ayuda de un adulto. Versión web: compras simuladas, no se cobra nada.';
  content.appendChild(note);
  const closeFn = manualModal('Tienda', content);
}

// ---------- arranque ----------
new Pointer(surface, (e) => scenes.pointer(e));
const isDev = ['localhost', '127.0.0.1'].includes(location.hostname);
const loop = new GameLoop({
  pauseWhenHidden: !isDev,
  update(dt) { clock += dt; tweens.update(dt); particles.update(dt); floats.update(dt); scenes.update(dt); },
  render(alpha) { scenes.render(alpha); particles.render(surface.ctx); floats.render(surface.ctx); },
});
scenes.switch('splash', {}, { duration: 0 });
loop.start();
if ('serviceWorker' in navigator && location.protocol !== 'file:' && !isDev) navigator.serviceWorker.register('./sw.js').catch(() => {});
window.__glam = { studio, save, persist, loop, scenes, face, studioScene };
