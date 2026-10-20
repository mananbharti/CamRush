import { Tracker } from './tracker.js';
import { Input } from './input.js';
import { Sound } from './audio.js';
import { clamp, roundRect, easeOutCubic, raw } from './util.js';
import { MP } from './mp.js';

const DWELL = 1.0;
const FACTS = [
  ['A few minutes of a casual game can calm you about as much as a guided meditation.', 'In a study of 80 undergraduates, a short session of a casual game and a body-scan meditation both lowered stress scores, heart rate and blood pressure, with similar reductions.', 'Stress-Reducing Effects of Playing a Casual Video Game among Undergraduate Students, PMC7952082'],
  ['Games like these are being studied for anxiety, depression and stress.', 'A systematic review of casual video games looked at effects on anxiety, depression, stress and low mood.', 'Systematic review: Effects of Casual Videogames on Anxiety, Depression, Stress and Low Mood, PubMed 32053021'],
  ['Moving your body while you play is part of the point.', 'Active video games ("exergames") are being tested as a way to cut anxiety and lift mood, and exercise in general is linked to lower anxiety and depression symptoms.', 'Meta-analyses: doi.org/10.1111/sms.13654 and BJSM vol. 60(8) umbrella review'],
  ['Play together, not scrolling alone.', 'CamRush rooms take up to 12 people on one Wi-Fi. Same games, live scoreboard, tournaments. No account and no download.', 'CamRush multiplayer']
];


export class App {
  constructor(games) {
    this.games = games;
    this.canvas = document.getElementById('stage');
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    this.cur = document.getElementById('cursor');
    this.cctx = this.cur.getContext('2d');
    this.input = new Input(this.canvas);
    this.tracker = new Tracker();
    this.snd = new Sound();
    this.state = 'splash';
    this.game = null; this.gameDef = null;
    this.hud = { score: 0, lives: null, maxLives: 3, time: null, label: '' };
    this.cd = 0; this.t = 0; this.dwell = { el: null, t: 0 };
    this.orbs = Array.from({ length: 7 }, (_, i) => ({ x: Math.random(), y: Math.random(), r: 0.18 + Math.random() * 0.2, s: 0.02 + Math.random() * 0.03, h: [255, 190, 300, 170][i % 4], p: Math.random() * 6 }));
    this.noHandT = 0; this.shake = 0; this.zoom = 0; this.freezeT = 0; this.flashA = 0; this.flashC = '255,255,255';
    localStorage.removeItem('camrush.q'); /* old key could hold an auto-saved LQ */ this.quality = localStorage.getItem('camrush.qm') || 'high'; this.userQ = !!localStorage.getItem('camrush.qm'); this.slowT = 0; this.ema = 16; this._vig = null;
    this.bloomC = document.createElement('canvas'); this.bloomX = this.bloomC.getContext('2d');
    this.stars = Array.from({ length: 90 }, () => ({ x: Math.random(), y: Math.random(), z: Math.random() * 0.8 + 0.2, p: Math.random() * 6 }));
    this.perfOn = new URLSearchParams(location.search).has('perf'); // P toggles the perf overlay
    this.rfps = 0; this._rf = 0; this._rft = performance.now();
    this.wipe = document.getElementById('wipe');
    this.canvas.addEventListener('pointerdown', (e) => { const u = this.hudU || 1; if ((this.state === 'play' || this.state === 'countdown') && e.clientX < 170 * u && e.clientY < 74 * u) { this.snd.click(); this.toMenu(); } });
    if (matchMedia('(pointer:coarse)').matches) { const b = document.getElementById('btn-mouse'); if (b) b.textContent = 'No camera? Play with touch'; }
    window.addEventListener('pointerdown', () => this.snd.ensure(), { passive: true });
    this.applyQuality(); this.tracker.setLowSpec(this.quality !== 'high'); this.resize(); addEventListener('resize', () => this.resize());
    this.page = 0; this.per = 6; this._els = []; this._elsT = -1e9; this.lockEl = null;
    addEventListener('wheel', (e) => { if (this.state === 'menu') this.setPage(this.page + (e.deltaY > 0 ? 1 : -1)); }, { passive: true });
    this.mp = new MP(this);
    this.buildMenu();
    this.bindUI();
    this.last = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, this.quality === 'high' ? 1.25 : 1);
    this.W = innerWidth; this.H = innerHeight; this.dpr = dpr;
    for (const c of [this.canvas, this.cur]) { c.width = this.W * dpr; c.height = this.H * dpr; }
    this.bloomC.width = Math.max(2, this.W >> 2); this.bloomC.height = Math.max(2, this.H >> 2);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0); this.cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._vig = null; this._elsT = -1e9;
  }

  // Low quality = no glow blur, no bloom, no menu blur, 1x pixel density. Big win on integrated GPUs.
  applyQuality() {
    const low = this.quality !== 'high';
    document.body.classList.toggle('lq', low);
    for (const c of [this.ctx, this.cctx]) {
      if (low) Object.defineProperty(c, 'shadowBlur', { configurable: true, get() { return 0; }, set() {} });
      else delete c.shadowBlur;
    }
    const b = document.getElementById('btn-q'); if (b) b.textContent = low ? 'LQ' : 'HQ';
  }
  setQuality(q, manual) {
    this.quality = q; if (manual) { this.userQ = true; localStorage.setItem('camrush.qm', q); }
    this.applyQuality(); this.tracker.setLowSpec(q !== 'high'); this.resize();
  }
  watchPerf(dtMs) {
    // auto-drop to low quality when the frame time stays above ~25 ms (under 40 fps) for a few seconds
    this.ema = this.ema * 0.95 + Math.min(dtMs, 100) * 0.05;
    if (this.userQ || this.quality !== 'high' || this.state === 'splash') { this.slowT = 0; return; }
    this.slowT = this.ema > 25 ? this.slowT + dtMs / 1000 : Math.max(0, this.slowT - dtMs / 2000);
    if (this.slowT > 3) { this.setQuality('low', false); }
  }

  punch(v = 0.03) { this.zoom = Math.max(this.zoom, v); }
  hitstop(ms = 60) { this.freezeT = Math.max(this.freezeT, ms / 1000); }
  flash(c = '255,255,255', a = 0.35) { this.flashC = c; this.flashA = Math.max(this.flashA, a); }
  toggleQuality() { this.setQuality(this.quality === 'high' ? 'low' : 'high', true); }
  transition(fn) { const w = this.wipe; if (!w) return fn(); w.classList.add('on'); setTimeout(() => { fn(); setTimeout(() => w.classList.remove('on'), 60); }, 220); }

  best(id) { return +(localStorage.getItem('camrush.best.' + id) || 0); }

  buildMenu() {
    const grid = document.getElementById('grid'); grid.innerHTML = '';
    const pages = Math.ceil(this.games.length / this.per); this.page = clamp(this.page, 0, pages - 1);
    this.games.slice(this.page * this.per, (this.page + 1) * this.per).forEach((g) => {
      const m = g.meta, el = document.createElement('div');
      el.className = 'card'; el.dataset.id = m.id; el.style.setProperty('--i', grid.children.length);
      el.style.setProperty('--g1', m.colors[0]); el.style.setProperty('--g2', m.colors[1]);
      el.innerHTML = `<span class="no">${String(this.page * this.per + grid.children.length + 1).padStart(2, '0')}</span><div class="ico">${m.icon}</div><h3>${m.name}</h3><p>${m.tagline}</p>
        <div class="meta"><span class="pill">${m.control.replace(/^[^\p{L}\p{N}]+/u, '')}</span><span class="pill best" data-best="${m.id}"></span></div><div class="ring"></div>`;
      el.addEventListener('click', () => this.startGame(m.id));
      grid.appendChild(el);
    });
    const dots = document.getElementById('pg-dots');
    dots.innerHTML = Array.from({ length: pages }, (_, i) => `<i class="${i === this.page ? 'on' : ''}"></i>`).join('');
    document.getElementById('pg-label').textContent = `Page ${this.page + 1} of ${pages}`;
    document.getElementById('pg-prev').disabled = this.page === 0; document.getElementById('pg-next').disabled = this.page >= pages - 1;
    this._elsT = -1e9;
    this.refreshBest();
  }
  setPage(n) {
    const pages = Math.ceil(this.games.length / this.per), np = clamp(n, 0, pages - 1);
    if (np === this.page) return; this.page = np; this.snd.click(); this.buildMenu();
  }
  refreshBest() { document.querySelectorAll('[data-best]').forEach((e) => { const b = this.best(e.dataset.best); e.textContent = b ? '★ ' + b : 'Not played'; }); }

  bindUI() {
    const $ = (id) => document.getElementById(id);
    $('btn-start').onclick = () => this.boot(true);
    $('btn-mouse').onclick = () => this.boot(false);
    $('btn-again').onclick = () => { this.snd.click(); this.startGame(this.gameDef.meta.id); };
    $('btn-menu').onclick = () => { this.snd.click(); this.toMenu(); };
    $('btn-mute').onclick = () => { this.snd.ensure(); this.snd.setMuted(!this.snd.muted); $('btn-mute').textContent = this.snd.muted ? 'Muted' : 'Sound on'; };
    $('btn-full').onclick = () => this.toggleFull();
    $('btn-q').onclick = () => this.toggleQuality(); $('btn-q').textContent = this.quality === 'high' ? 'HQ' : 'LQ';
    $('btn-mute').textContent = this.snd.muted ? 'Muted' : 'Sound on';
    $('pg-prev').onclick = () => this.setPage(this.page - 1); $('pg-next').onclick = () => this.setPage(this.page + 1);
    addEventListener('keydown', (e) => {
      if (this.state === 'menu' && e.code === 'ArrowRight') this.setPage(this.page + 1);
      if (this.state === 'menu' && e.code === 'ArrowLeft') this.setPage(this.page - 1);
      if (e.code === 'Escape' && (this.state === 'play' || this.state === 'countdown' || this.state === 'over')) this.toMenu();
      if (e.code === 'KeyF') this.toggleFull();
      if (e.code === 'KeyQ') this.toggleQuality();
      if (e.code === 'KeyM') $('btn-mute').click();
      if (e.code === 'KeyP') this.perfOn = !this.perfOn;
    });
  }
  toggleFull() { if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {}); else document.exitFullscreen?.(); }

  async boot(useCam) {
    const $ = (id) => document.getElementById(id);
    this.snd.ensure(); this.snd.click();
    $('splash-actions').hidden = true; $('loadbox').hidden = false; $('errbox').hidden = true; document.querySelector('.why').hidden = true; document.querySelector('.kicker').hidden = true;
    const setP = (p, t) => { $('loadfill').style.width = p * 100 + '%'; if (t) $('loadtext').textContent = t; };
    const fx = $('facts'); fx.innerHTML = FACTS.map((f) => `<div class="f"><b>${f[0]}</b><span>${f[1]}</span><em>Source: ${f[2]}</em></div>`).join('');
    let fi = 0, skip = false; const show = () => { [...fx.children].forEach((e, i) => e.classList.toggle('on', i === fi)); }; show();
    const ft = setInterval(() => { fi = (fi + 1) % FACTS.length; show(); }, 4200);
    let bi = 0; const bt = setInterval(() => { $('breath-t').textContent = bi++ % 2 ? 'Breathe out' : 'Breathe in'; }, 4000);
    const done = () => { clearInterval(ft); clearInterval(bt); };
    const minShow = new Promise((r) => { setTimeout(r, 6500); $('btn-skip').hidden = false; $('btn-skip').onclick = () => { skip = true; r(); }; });
    if (!useCam) { this.input.mode = 'mouse'; setP(1, 'Ready'); await minShow; done(); return this.enterMenu(); }
    try {
      setP(0.08, 'Starting camera...');
      await this.tracker.startCamera();
      setP(0.25, 'Loading hand + face tracking...');
      await this.tracker.loadModels((p) => setP(0.25 + p * 0.7));
      setP(1, 'Ready');
      await minShow; done();
      setTimeout(() => this.enterMenu(), 250);
    } catch (e) {
      console.error(e); done(); document.querySelector('.why').hidden = false; document.querySelector('.kicker').hidden = false;
      $('splash-actions').hidden = false; $('loadbox').hidden = true;
      const err = $('errbox'); err.hidden = false;
      err.textContent = (e && e.name === 'NotAllowedError') ? 'Camera permission was blocked. Allow the camera in the address bar, then try again - or play with the mouse.'
        : (e && e.name === 'NotFoundError') ? 'No camera found. You can still play with the mouse.' : 'Could not start tracking: ' + (e?.message || e) + '. You can still play with the mouse.';
    }
  }
  enterMenu() { this.setOverlay('splash', false); this.state = 'menu'; this._toMenu(); }
  setOverlay(id, on) { document.getElementById(id).classList.toggle('show', on); }
  toMenu() { if (this.mp.inMatch()) return this.mp.forfeit(); if (this.state === 'splash') return this._toMenu(); this.transition(() => this._toMenu()); }
  _toMenu() {
    this.state = 'menu'; this.game = null; this.snd.setMode('menu');
    this.setOverlay('over', false); this.setOverlay('menu', true); this.buildMenu();
  }

  startGame(id) { this.transition(() => this._startGame(id)); }
  _startGame(id) {
    this.snd.setMode('play');
    const def = this.games.find((g) => g.meta.id === id); if (!def) return;
    this.snd.ensure();
    this.gameDef = def;
    this.hud = { score: 0, lives: null, maxLives: 3, time: null, label: '' };
    this.shake = 0;
    this.game = new def(this);
    this.mp.afterCreate();
    this.setOverlay('menu', false); this.setOverlay('over', false);
    this.state = 'countdown'; this.cd = 3.4; this._lastTick = 4;
  }

  finish(score, opts = {}) {
    if (this.state === 'over') return;
    this.state = 'over';
    if (this.mp.inMatch()) return this.mp.localFinish(Math.floor(score), opts);
    const id = this.gameDef.meta.id, prev = this.best(id);
    const isNew = score > prev;
    if (isNew) localStorage.setItem('camrush.best.' + id, String(Math.floor(score)));
    const $ = (i) => document.getElementById(i);
    $('over-title').textContent = opts.title || 'Game over';
    $('over-score').textContent = Math.floor(score);
    $('over-best').textContent = isNew ? (prev ? '★ New best!' : '★ First score!') : 'Best: ' + prev;
    $('over-best').classList.toggle('new', isNew);
    $('over-extra').textContent = opts.extra || '';
    isNew ? this.snd.win() : this.snd.lose();
    setTimeout(() => this.state === 'over' && this.setOverlay('over', true), opts.delay ?? 700);
  }

  needs() {
    if ((this.state === 'play' || this.state === 'countdown') && this.game) return this.gameDef.meta.needs;
    return { hands: true, face: false };
  }

  loop(now) {
    const rawMs = now - this.last; const dt = Math.min(0.05, rawMs / 1000); this.last = now; this.t += dt; this.watchPerf(rawMs);
    this._rf++; if (now - this._rft > 1000) { this.rfps = this._rf * 1000 / (now - this._rft); this._rf = 0; this._rft = now; }
    const { W, H, ctx } = this;
    if (this.tracker.ready) {
      const r = this.tracker.update(now, W, H, this.needs());
      let face = r.face;
      if (!face && this.input.mode === 'mouse' && this.state !== 'menu') { const m = this.input.mouse; face = { fake: true, x: m.x, y: m.y, mouthOpen: m.down ? 1 : 0, smile: 0, width: 220, blinkL: 0, blinkR: 0 }; }
      this.input.apply(r.hands, face, now);
    } else {
      const m = this.input.mouse;
      this.input.apply([], this.input.mode === 'mouse' ? { fake: true, x: m.x, y: m.y, mouthOpen: m.down ? 1 : 0, smile: 0, width: 220, blinkL: 0, blinkR: 0 } : null, now);
    }
    this.update(dt, now);
    this.draw(dt);
    this.input.endFrame();
    requestAnimationFrame((t) => this.loop(t));
  }

  update(dt, now) {
    const inp = this.input;
    if (this.freezeT > 0) { this.freezeT -= dt; this.updateDwell(dt); return; }
    if (this.state === 'countdown') {
      this.cd -= dt;
      const n = Math.ceil(this.cd - 0.4);
      if (n !== this._lastTick && n >= 0) { this._lastTick = n; n > 0 ? this.snd.tick() : this.snd.go(); }
      this.game.idle?.(dt, inp);
      if (this.cd <= 0) { this.state = 'play'; this.game.start?.(); }
    } else if (this.state === 'play') {
      this.game.update(dt, inp);
    }
    // hand-lost hint
    const needHands = (this.state === 'play' || this.state === 'countdown') && this.gameDef.meta.needs.hands;
    const needFace = (this.state === 'play' || this.state === 'countdown') && this.gameDef.meta.needs.face;
    this.noHandT = (needHands && !inp.hands.length) || (needFace && !inp.face) ? this.noHandT + dt : 0;
    this.updateDwell(dt);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 30);
  }

  updateDwell(dt) {
    const h = this.input.hands[0];
    if (performance.now() - this._elsT > 350) {
      this._els = [...document.querySelectorAll('.overlay.show .dwell:not(:disabled), #menu.show .card')].map((el) => ({ el, r: el.getBoundingClientRect() }));
      this._elsT = performance.now();
    }
    const els = this._els;
    let hit = null;
    const inGame = this.state === 'play' || this.state === 'countdown';
    if (this.state === 'play' || this.state === 'countdown') {
      // back button (canvas-drawn)
      if (h && h.x > 14 && h.x < 170 * (this.hudU || 1) && h.y > 14 && h.y < 74 * (this.hudU || 1) && !h.mouse) hit = 'back';
    } else if (h && els.length && !h.mouse) {
      for (const { el, r } of els) { if (h.x >= r.left && h.x <= r.right && h.y >= r.top && h.y <= r.bottom) { hit = el; break; } }
      if (hit !== this.lockEl) this.lockEl = null; else hit = null; // after a click, leave the button before it can fire again
    }
    if (hit !== this.dwell.el) {
      if (this.dwell.el && this.dwell.el !== 'back') { this.dwell.el.style.setProperty('--p', 0); this.dwell.el.classList.remove('hot'); }
      this.dwell = { el: hit, t: 0 };
      if (hit && hit !== 'back') { hit.classList.add('hot'); this.snd.hover(); }
    }
    if (hit) {
      this.dwell.t += dt;
      const p = clamp(this.dwell.t / (hit === 'back' ? 1.3 : DWELL), 0, 1);
      if (hit !== 'back') hit.style.setProperty('--p', p);
      this.backP = hit === 'back' ? p : 0;
      const pinchNow = h.pinch && !this._wasPinch && hit !== 'back';
      if (p >= 1 || pinchNow) {
        const el = hit; this.dwell = { el: null, t: 0 }; this.backP = 0; this.lockEl = el;
        if (el === 'back') { this.snd.click(); this.toMenu(); }
        else { el.style.setProperty('--p', 0); el.classList.remove('hot'); this.snd.select(); el.click(); }
      }
    } else this.backP = 0;
    this._wasPinch = h ? h.pinch : false;
  }

  // ---------- drawing ----------
  drawBackdrop(dt) {
    const { ctx, W, H } = this;
    ctx.fillStyle = '#06070f'; ctx.fillRect(0, 0, W, H);
    this.tracker.drawVideo(ctx, W, H, 0.5);
    ctx.fillStyle = 'rgba(6,7,15,.55)'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fff';
    for (const st of this.stars) { const y = ((st.y + this.t * 0.01 * st.z) % 1) * H; ctx.globalAlpha = 0.25 + 0.5 * st.z * (0.6 + 0.4 * Math.sin(this.t * 2 + st.p)); ctx.beginPath(); ctx.arc(st.x * W, y, st.z * 1.8, 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'lighter';
    for (const o of (this.quality === 'high' ? this.orbs : [])) {
      const x = (o.x + Math.sin(this.t * o.s + o.p) * 0.12) * W, y = (o.y + Math.cos(this.t * o.s * 1.3 + o.p) * 0.12) * H, r = o.r * Math.max(W, H);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `hsla(${o.h},90%,60%,.16)`); g.addColorStop(1, 'transparent');
      ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  draw(dt) {
    const { ctx, W, H } = this;
    const inGame = (this.state === 'play' || this.state === 'countdown') && this.game;
    if (inGame) {
      ctx.save();
      if (this.zoom > 0.001) { const z = 1 + this.zoom; ctx.translate(W / 2, H / 2); ctx.scale(z, z); ctx.translate(-W / 2, -H / 2); this.zoom *= Math.exp(-9 * dt); }
      if (this.shake > 0) ctx.translate((raw() - 0.5) * this.shake, (raw() - 0.5) * this.shake);
      this.game.draw(ctx);
      ctx.restore();
      this.postFx(ctx, this.gameDef.meta.bloom ?? 0.5);
      if (this.flashA > 0.01) { ctx.fillStyle = `rgba(${this.flashC},${this.flashA})`; ctx.fillRect(0, 0, W, H); this.flashA *= Math.exp(-7 * dt); }
      this.drawHud(); this.mp.drawLive(ctx, W, H);
      if (this.gameDef.meta.pip !== false) this.drawPip();
      if (this.state === 'countdown') this.drawCountdown();
      this.drawNoHand();
    } else if (this.state === 'over' && this.game) {
      this.game.draw(ctx); ctx.fillStyle = 'rgba(6,7,15,.5)'; ctx.fillRect(0, 0, W, H);
    } else this.drawBackdrop(dt);
    this.drawCursor();
    if (this.perfOn) this.drawPerf();
    const st = document.getElementById('stat');
    if (st && this.state === 'menu' && (this._st = (this._st || 0) + 1) % 30 === 0) { const t = this.tracker; st.textContent = t.ready ? `${Math.round(t.fps)} fps · ${t.infMs.toFixed(0)} ms · ${t.workerMode ? 'worker' : 'main'} inf` : 'mouse mode'; }
  }

  postFx(ctx, k) {
    const { W, H } = this;
    if (this.quality === 'high' && k > 0) {
      const b = this.bloomX, bw = this.bloomC.width, bh = this.bloomC.height;
      b.globalCompositeOperation = 'copy'; b.filter = 'brightness(0.85) contrast(1.9) saturate(1.3) blur(5px)';
      b.drawImage(this.canvas, 0, 0, bw, bh); b.filter = 'none';
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = k; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(this.bloomC, 0, 0, W, H); ctx.restore();
    }
    if (!this._vig) {
      const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
      const vg = x.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,10,.42)'); x.fillStyle = vg; x.fillRect(0, 0, W, H); this._vig = c;
    }
    ctx.drawImage(this._vig, 0, 0, W, H);
  }

  drawHud() {
    const { ctx } = this, h = this.hud;
    const u = clamp(this.W / 760, 0.62, 1), W = this.W / u; this.hudU = u;
    ctx.save(); ctx.scale(u, u);
    // back pill
