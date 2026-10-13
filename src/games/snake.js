// Snake Surge - steer the snake with your fingertip, eat glowing orbs, never touch your own tail.
import { Particles, FloatText } from '../core/fx.js';
import { rand, clamp, dist } from '../core/util.js';
import { bgGrad, grid } from './_kit.js';

export default class SnakeSurge {
  static meta = {
    id: 'snake', name: 'Snake Surge', tagline: 'Steer the snake with your finger. Eat orbs, grow long, never bite your tail.', control: '☝ Point to steer',
    hint: 'Point where you want the snake to go. Screen edges wrap around. Gold orbs = +5 growth.', needs: { hands: true, face: false },
    colors: ['#7dff6a', '#00e0a0'], cursor: 'dot', pip: true, bloom: 0.3,
    icon: `<svg viewBox="0 0 100 100"><path d="M18 76c0-18 14-14 24-14s18-4 18-18-12-14-22-14" fill="none" stroke="#7dff6a" stroke-width="12" stroke-linecap="round"/><circle cx="70" cy="30" r="9" fill="#7dff6a"/><circle cx="73" cy="27" r="3" fill="#06070f"/><circle cx="82" cy="72" r="8" fill="#ff4f7b"/></svg>`,
  };
  constructor(app) {
    this.app = app; this.fx = new Particles(400); this.ft = new FloatText();
    this.t = 0; this.score = 0; this.eaten = 0; this.sc = clamp(app.H / 900, 0.7, 1.4);
    this.r = 17 * this.sc; this.gap = 11 * this.sc; this.speed = 270 * this.sc;
    this.ang = 0; this.segs = []; this.len = 10; this.orbs = []; this.dead = false;
    this.head = { x: app.W / 2, y: app.H / 2 };
    for (let i = 0; i < this.len; i++) this.segs.push({ x: this.head.x - i * this.gap, y: this.head.y });
    this.tx = app.W / 2 + 200; this.ty = app.H / 2;
    this.addOrb(); this.addOrb();
  }
  addOrb(gold = Math.random() < 0.12) {
    const { W, H } = this.app, m = 70;
    for (let k = 0; k < 20; k++) {
      const x = rand(m, W - m), y = rand(m + 60, H - m);
      if (dist(x, y, this.head.x, this.head.y) > 140) { this.orbs.push({ x, y, gold, p: rand(0, 6) }); return; }
    }
    this.orbs.push({ x: W / 2, y: H / 2, gold, p: 0 });
  }
  update(dt, input) {
    const app = this.app, { W, H } = app; this.t += dt;
    const h = input.primary;
    if (h) { this.tx = h.mouse ? h.x : h.tips[1].x; this.ty = h.mouse ? h.y : h.tips[1].y; }
    // turn toward target with limited turn rate
    const want = Math.atan2(this.ty - this.head.y, this.tx - this.head.x);
    let d = want - this.ang; d = Math.atan2(Math.sin(d), Math.cos(d));
    const maxTurn = 4.6 * dt; this.ang += clamp(d, -maxTurn, maxTurn);
    const sp = this.speed * (1 + Math.min(0.5, this.eaten * 0.012));
    this.head.x += Math.cos(this.ang) * sp * dt; this.head.y += Math.sin(this.ang) * sp * dt;
    if (this.head.x < -10) this.head.x = W + 10; else if (this.head.x > W + 10) this.head.x = -10;
    if (this.head.y < -10) this.head.y = H + 10; else if (this.head.y > H + 10) this.head.y = -10;
    // follow-the-leader body
    let px = this.head.x, py = this.head.y;
    for (let i = 0; i < this.len; i++) {
      const s = this.segs[i] || (this.segs[i] = { x: px, y: py });
      const dx = s.x - px, dy = s.y - py, dd = Math.hypot(dx, dy) || 1;
      if (dd > this.gap && dd < W * 0.5) { s.x = px + dx / dd * this.gap; s.y = py + dy / dd * this.gap; }
      else if (dd >= W * 0.5) { s.x = px; s.y = py; } // wrapped across the screen
      px = s.x; py = s.y;
    }
    // eat
    for (const o of this.orbs) {
      if (dist(o.x, o.y, this.head.x, this.head.y) < this.r + 16 * this.sc) {
        o.dead = 1; const g = o.gold ? 5 : 1; this.len += g; this.eaten += g;
        const pts = o.gold ? 50 : 10; this.score += pts; app.snd.pop();
        if (o.gold) { app.snd.bonus(); app.punch(0.02); }
        this.fx.burst(o.x, o.y, o.gold ? 24 : 12, { color: o.gold ? ['#ffd36b', '#fff'] : ['#7dff6a', '#fff'], min: 80, max: 320 });
        this.ft.add(o.x, o.y - 24, `+${pts}`, o.gold ? '#ffd36b' : '#fff', o.gold ? 40 : 30);
        this.addOrb();
      }
    }
    this.orbs = this.orbs.filter((o) => !o.dead);
    if (this.orbs.length < 2 + Math.min(2, this.eaten / 15 | 0)) this.addOrb();
    // bite own tail
    const skip = 9;
    for (let i = skip; i < this.len && !this.dead; i++) {
      const s = this.segs[i]; if (!s) continue;
      if (dist(s.x, s.y, this.head.x, this.head.y) < this.r * 1.05) {
        this.dead = true; app.snd.bomb(); app.shake = 22; app.flash('255,60,90', 0.4);
        this.fx.burst(this.head.x, this.head.y, 50, { color: ['#7dff6a', '#fff', '#ff5e62'], glow: false, max: 520 });
        app.finish(this.score, { title: 'Snake down!', extra: `Length ${this.len} · ${Math.floor(this.eaten)} orbs eaten`, delay: 800 });
      }
    }
    this.fx.update(dt); this.ft.update(dt);
    app.hud.score = this.score; app.hud.label = `Length ${this.len}`;
  }
  draw(ctx) {
    const { W, H } = this.app; bgGrad(ctx, this.app, '#07210f', '#04121f', 0.2); grid(ctx, W, H, this.t, 'rgba(125,255,106,.07)');
    for (const o of this.orbs) {
      const pul = 1 + Math.sin(this.t * 6 + o.p) * 0.14, r = (o.gold ? 20 : 15) * this.sc * pul;
      ctx.fillStyle = o.gold ? 'rgba(255,211,107,.25)' : 'rgba(255,79,123,.25)'; ctx.beginPath(); ctx.arc(o.x, o.y, r * 1.8, 0, 7); ctx.fill();
      ctx.fillStyle = o.gold ? '#ffd36b' : '#ff4f7b'; ctx.beginPath(); ctx.arc(o.x, o.y, r, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.beginPath(); ctx.arc(o.x - r * 0.3, o.y - r * 0.3, r * 0.3, 0, 7); ctx.fill();
    }
    const n = this.len;
    for (let i = n - 1; i >= 0; i--) {
      const s = this.segs[i]; if (!s) continue; const k = i / n, rr = this.r * (1 - k * 0.45);
      ctx.fillStyle = `hsl(${140 - k * 40},85%,${58 - k * 18}%)`; ctx.beginPath(); ctx.arc(s.x, s.y, rr, 0, 7); ctx.fill();
    }
    const hx = this.head.x, hy = this.head.y, a = this.ang, r = this.r * 1.12;
    ctx.fillStyle = '#b6ff9c'; ctx.beginPath(); ctx.arc(hx, hy, r, 0, 7); ctx.fill();
    for (const sd of [-1, 1]) {
      const ex = hx + Math.cos(a) * r * 0.35 - Math.sin(a) * sd * r * 0.5, ey = hy + Math.sin(a) * r * 0.35 + Math.cos(a) * sd * r * 0.5;
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex, ey, r * 0.3, 0, 7); ctx.fill();
      ctx.fillStyle = '#06070f'; ctx.beginPath(); ctx.arc(ex + Math.cos(a) * 2, ey + Math.sin(a) * 2, r * 0.15, 0, 7); ctx.fill();
    }
    this.fx.draw(ctx); this.ft.draw(ctx);
  }
}
