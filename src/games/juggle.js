// Sky Juggle - keep the balloons in the air with your palms. Do not let any touch the floor.
import { Particles, FloatText } from '../core/fx.js';
import { rand, clamp, dist } from '../core/util.js';
import { bgGrad } from './_kit.js';

const COLS = ['#ff4f7b', '#00e0ff', '#ffd36b', '#7dff6a', '#b18cff'];
export default class SkyJuggle {
  static meta = {
    id: 'juggle', name: 'Sky Juggle', tagline: 'Bat the balloons back up with your hands. Three misses and it is over.', control: '🖐 Both hands',
    hint: 'Hit balloons with your palms. A faster swing sends them higher. New balloons join as you score.', needs: { hands: true, face: false },
    colors: ['#00e0ff', '#b18cff'], cursor: 'none', pip: true, bloom: 0.3,
    icon: `<svg viewBox="0 0 100 100"><ellipse cx="38" cy="38" rx="18" ry="22" fill="#ff4f7b"/><ellipse cx="66" cy="46" rx="16" ry="20" fill="#00e0ff"/><path d="M38 60q-4 14 4 24M66 66q4 12-2 20" stroke="#fff" stroke-width="3" fill="none"/><ellipse cx="32" cy="30" rx="5" ry="8" fill="#fff" opacity=".5"/></svg>`,
  };
  constructor(app) {
    this.app = app; this.fx = new Particles(300); this.ft = new FloatText(); this.t = 0; this.score = 0; this.hits = 0; this.combo = 0; this.best = 0;
    this.sc = clamp(app.H / 900, 0.7, 1.4); this.balls = []; this.pal = []; this.prev = {}; this.lives = 3; this.max = 1; this.newT = 0;
    this.gravity = 700 * this.sc; this.handR = 66 * this.sc;
    app.hud.lives = 3; app.hud.maxLives = 3;
    this.add();
  }
  add() {
    const { W, H } = this.app; const i = this.balls.length;
    this.balls.push({ x: rand(W * 0.3, W * 0.7), y: H * 0.18, vx: rand(-60, 60), vy: 0, r: 46 * this.sc, col: COLS[(i + this.hits) % COLS.length], cd: 0, sq: 0, ph: rand(0, 6) });
  }
  update(dt, input) {
    const app = this.app, { W, H } = app; this.t += dt;
    // hands -> palms with own velocity
    this.pal = [];
    input.hands.forEach((h, i) => {
      const x = h.palm ? h.palm.x : h.x, y = h.palm ? h.palm.y : h.y, p = this.prev[i];
      const vx = p ? (x - p.x) / dt : 0, vy = p ? (y - p.y) / dt : 0; this.prev[i] = { x, y };
      this.pal.push({ x, y, vx: clamp(vx, -3000, 3000), vy: clamp(vy, -3000, 3000) });
    });
    for (const k in this.prev) if (!input.hands[k]) delete this.prev[k];
    for (const b of this.balls) {
      b.cd = Math.max(0, b.cd - dt); b.sq = Math.max(0, b.sq - dt * 5);
      b.vy += this.gravity * dt * 0.6; b.vx *= 1 - 0.15 * dt; b.vy = Math.min(b.vy, 900 * this.sc);
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx) * 0.8; } else if (b.x > W - b.r) { b.x = W - b.r; b.vx = -Math.abs(b.vx) * 0.8; }
      if (b.y < b.r) { b.y = b.r; b.vy = Math.abs(b.vy) * 0.4; }
      if (b.cd <= 0) for (const p of this.pal) {
        const d = dist(p.x, p.y, b.x, b.y);
        if (d < b.r + this.handR) {
          const nx = (b.x - p.x) / (d || 1), ny = (b.y - p.y) / (d || 1), sp = Math.hypot(p.vx, p.vy);
          const power = 620 * this.sc + Math.min(900, sp * 0.45);
          b.vx = nx * power * 0.6 + p.vx * 0.25; b.vy = Math.min(-380 * this.sc, ny * power + p.vy * 0.3);
          b.cd = 0.18; b.sq = 1; this.hit(b); break;
        }
      }
      if (b.y > H + b.r) { b.dead = 1; this.miss(b); }
    }
    this.balls = this.balls.filter((b) => !b.dead);
    if (!this.balls.length && this.lives > 0) this.add();
    const want = 1 + Math.min(3, Math.floor(this.score / 400));
    this.newT -= dt; if (this.balls.length < want && this.newT <= 0) { this.add(); this.newT = 1.2; }
    this.fx.update(dt); this.ft.update(dt);
    app.hud.score = this.score; app.hud.lives = this.lives; app.hud.label = this.combo >= 3 ? `${this.combo} in a row` : '';
  }
  hit(b) {
    const app = this.app; this.hits++; this.combo++; this.best = Math.max(this.best, this.combo);
    const pts = 10 * (1 + Math.min(this.combo, 20) * 0.1) | 0; this.score += pts;
    app.snd.bounce(); app.punch(0.008);
    this.fx.burst(b.x, b.y + b.r * 0.6, 10, { color: [b.col, '#fff'], min: 80, max: 300, gravity: 300 });
    this.ft.add(b.x, b.y - b.r - 14, `+${pts}`, '#fff', 28);
    if (this.combo > 0 && this.combo % 10 === 0) { app.snd.bonus(); this.ft.add(app.W / 2, app.H * 0.25, `${this.combo} STREAK!`, '#7fefff', 52); }
  }
  miss(b) {
    const app = this.app; this.lives--; this.combo = 0; app.snd.hit(); app.shake = 16; app.flash('255,60,90', 0.3);
    this.fx.burst(b.x, app.H - 10, 30, { color: [b.col, '#fff'], min: 100, max: 460, gravity: 600 });
    if (this.lives <= 0) app.finish(this.score, { title: 'Balloons down', extra: `${this.hits} hits · best streak ${this.best}`, delay: 700 });
  }
  draw(ctx) {
    const { W, H } = this.app; bgGrad(ctx, this.app, '#0a2a52', '#10204a', 0.25);
    ctx.fillStyle = 'rgba(255,255,255,.07)';
    for (let i = 0; i < 5; i++) { const x = ((i * 0.27 + this.t * 0.012) % 1.2 - 0.1) * W, y = H * (0.15 + i * 0.16); ctx.beginPath(); ctx.ellipse(x, y, 120, 26, 0, 0, 7); ctx.fill(); }
    ctx.fillStyle = 'rgba(255,79,123,.18)'; ctx.fillRect(0, H - 8, W, 8);
    for (const b of this.balls) {
      const sx = 1 + b.sq * 0.14, sy = 1 - b.sq * 0.14;
      ctx.save(); ctx.translate(b.x, b.y);
      ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, b.r * 1.15); ctx.quadraticCurveTo(Math.sin(this.t * 4 + b.ph) * 12, b.r * 1.9, 0, b.r * 2.6); ctx.stroke();
      ctx.scale(sx, sy); ctx.fillStyle = b.col; ctx.beginPath(); ctx.ellipse(0, 0, b.r * 0.9, b.r * 1.1, 0, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-6, b.r * 1.08); ctx.lineTo(6, b.r * 1.08); ctx.lineTo(0, b.r * 1.3); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.beginPath(); ctx.ellipse(-b.r * 0.35, -b.r * 0.4, b.r * 0.18, b.r * 0.3, 0.5, 0, 7); ctx.fill();
      ctx.restore();
    }
    this.pal.forEach((p, i) => {
      const col = ['#00e0ff', '#ff4fa3'][i % 2]; ctx.fillStyle = col + '40'; ctx.beginPath(); ctx.arc(p.x, p.y, this.handR, 0, 7); ctx.fill();
      ctx.lineWidth = 5; ctx.strokeStyle = col; ctx.stroke(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, 7); ctx.fill();
    });
    this.fx.draw(ctx); this.ft.draw(ctx);
  }
}
