// Meteor Dodge - fly your ship with your hand, weave through the meteor storm, grab the stars.
import { Particles, FloatText } from '../core/fx.js';
import { rand, clamp, dist, smooth } from '../core/util.js';
import { bgGrad } from './_kit.js';

export default class MeteorDodge {
  static meta = {
    id: 'dodge', name: 'Meteor Dodge', tagline: 'Fly through a meteor storm. Grab stars, avoid rocks, survive as long as you can.', control: '🖐 Move your hand',
    hint: 'Your ship follows your palm. Stars = +50. Hits cost a life, then you get a short shield.', needs: { hands: true, face: false },
    colors: ['#ff8a4f', '#ff4f7b'], cursor: 'none', pip: true, bloom: 0.3,
    icon: `<svg viewBox="0 0 100 100"><circle cx="64" cy="34" r="20" fill="#ff8a4f"/><circle cx="58" cy="28" r="5" fill="#c4562a"/><circle cx="72" cy="40" r="4" fill="#c4562a"/><path d="M50 52L28 86" stroke="#ff8a4f" stroke-width="7" stroke-linecap="round" opacity=".6"/><path d="M22 90l8-24 10 8z" fill="#00e0ff"/></svg>`,
  };
  constructor(app) {
    this.app = app; this.fx = new Particles(400); this.ft = new FloatText(); this.t = 0; this.score = 0; this.lives = 3; this.stars = 0; this.inv = 1.2;
    this.sc = clamp(app.H / 900, 0.7, 1.4); this.x = app.W / 2; this.y = app.H * 0.75; this.tilt = 0; this.rocks = []; this.pick = []; this.spawnT = 0.8; this.starT = 2;
    app.hud.lives = 3; app.hud.maxLives = 3; this.bg = Array.from({ length: 60 }, () => ({ x: Math.random(), y: Math.random(), z: Math.random() * 0.8 + 0.2 }));
  }
  update(dt, input) {
    const app = this.app, { W, H } = app; this.t += dt; this.inv = Math.max(0, this.inv - dt);
    const h = input.primary;
    if (h) { const tx = h.palm ? h.palm.x : h.x, ty = h.palm ? h.palm.y : h.y; const ox = this.x; this.x = smooth(this.x, clamp(tx, 30, W - 30), 22, dt); this.y = smooth(this.y, clamp(ty, H * 0.2, H - 40), 22, dt); this.tilt = smooth(this.tilt, clamp((this.x - ox) / dt / 900, -1, 1), 10, dt); }
    const prog = clamp(this.t / 60, 0, 1);
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = rand(0.28, 0.6) * (1 - prog * 0.55);
      const r = rand(20, 56) * this.sc, aim = Math.random() < 0.35;
      const x = aim ? clamp(this.x + rand(-80, 80), r, W - r) : rand(r, W - r);
      this.rocks.push({ x, y: -r, r, vx: rand(-60, 60) * (0.4 + prog), vy: rand(260, 420) * this.sc * (1 + prog * 0.9), rot: 0, vr: rand(-2, 2), seed: rand(0, 6) });
    }
    this.starT -= dt; if (this.starT <= 0) { this.starT = rand(2.2, 4); this.pick.push({ x: rand(60, W - 60), y: -30, vy: 220 * this.sc, p: rand(0, 6) }); }
    for (const r of this.rocks) {
      r.x += r.vx * dt; r.y += r.vy * dt; r.rot += r.vr * dt;
      if (!r.dead && this.inv <= 0 && dist(r.x, r.y, this.x, this.y) < r.r * 0.85 + 20 * this.sc) { r.dead = 1; this.hit(r); }
      if (r.y > H + r.r) r.dead = 1;
    }
    for (const s of this.pick) {
      s.y += s.vy * dt;
      if (dist(s.x, s.y, this.x, this.y) < 44 * this.sc) { s.dead = 1; this.stars++; this.score += 50; app.snd.bonus(); app.punch(0.01); this.fx.burst(s.x, s.y, 18, { color: ['#ffd36b', '#fff'], min: 80, max: 340, gravity: 100 }); this.ft.add(s.x, s.y - 30, '+50', '#ffd36b', 36); }
      if (s.y > H + 40) s.dead = 1;
    }
    this.rocks = this.rocks.filter((r) => !r.dead); this.pick = this.pick.filter((s) => !s.dead);
    this.score += dt * 10; this.fx.update(dt); this.ft.update(dt);
    if (Math.random() < 0.6) this.fx.burst(this.x + rand(-6, 6), this.y + 26 * this.sc, 1, { color: ['#00e0ff', '#7fefff'], angle: Math.PI / 2, spread: 0.3, min: 120, max: 260, gravity: 0, ttlMin: 0.2, ttlMax: 0.4, rMin: 2, rMax: 4 });
    app.hud.score = this.score | 0; app.hud.lives = this.lives; app.hud.label = `${Math.floor(this.t)}s survived`;
  }
  hit(r) {
    const app = this.app; this.lives--; this.inv = 1.8; app.snd.bomb(); app.shake = 22; app.flash('255,90,60', 0.35);
    this.fx.burst(r.x, r.y, 36, { color: ['#ff8a4f', '#ffd36b', '#fff'], min: 120, max: 520, gravity: 100 });
    if (this.lives <= 0) { this.fx.burst(this.x, this.y, 50, { color: ['#00e0ff', '#fff'], max: 600 }); app.finish(this.score | 0, { title: 'Ship destroyed', extra: `${Math.floor(this.t)}s survived · ${this.stars} stars`, delay: 800 }); }
  }
  draw(ctx) {
    const { W, H } = this.app; bgGrad(ctx, this.app, '#120a26', '#220a1a', 0.2);
    ctx.fillStyle = '#fff';
    for (const s of this.bg) { const y = ((s.y + this.t * 0.25 * s.z) % 1) * H; ctx.globalAlpha = 0.3 + s.z * 0.5; ctx.fillRect(s.x * W, y, 2, 2 + s.z * 10); }
    ctx.globalAlpha = 1;
    for (const s of this.pick) {
      ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(this.t * 2 + s.p); ctx.fillStyle = '#ffd36b'; ctx.beginPath();
      for (let i = 0; i < 10; i++) { const a = i / 10 * 6.283, r = (i % 2 ? 11 : 24) * this.sc; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); ctx.fill(); ctx.restore();
    }
    for (const r of this.rocks) {
      ctx.save(); ctx.translate(r.x, r.y); ctx.rotate(r.rot); ctx.fillStyle = '#8a5a44'; ctx.beginPath();
      for (let i = 0; i < 9; i++) { const a = i / 9 * 6.283, k = 0.82 + 0.18 * Math.sin(r.seed + i * 2.3); ctx.lineTo(Math.cos(a) * r.r * k, Math.sin(a) * r.r * k); } ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#ffb38a'; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.arc(-r.r * 0.25, -r.r * 0.1, r.r * 0.22, 0, 7); ctx.arc(r.r * 0.3, r.r * 0.25, r.r * 0.15, 0, 7); ctx.fill(); ctx.restore();
    }
    // ship
    if (this.lives > 0) {
      ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.tilt * 0.35); const s = this.sc;
      if (this.inv > 0 && ((this.t * 14) | 0) % 2) ctx.globalAlpha = 0.4;
      ctx.fillStyle = '#00e0ff'; ctx.beginPath(); ctx.moveTo(0, -30 * s); ctx.lineTo(22 * s, 24 * s); ctx.lineTo(0, 14 * s); ctx.lineTo(-22 * s, 24 * s); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(0, -2 * s, 6 * s, 11 * s, 0, 0, 7); ctx.fill();
      if (this.inv > 0) { ctx.globalAlpha = 0.5; ctx.strokeStyle = '#7fefff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, 44 * s, 0, 7); ctx.stroke(); }
      ctx.restore();
    }
    this.fx.draw(ctx); this.ft.draw(ctx);
  }
}
