// Tower Stack - time your pinch (or click / Space) to drop the sliding block. Misaligned parts get cut off.
import { Particles, FloatText } from '../core/fx.js';
import { rand, clamp, lerp, smooth } from '../core/util.js';
import { bgGrad, glowText } from './_kit.js';

export default class TowerStack {
  static meta = {
    id: 'stack', name: 'Tower Stack', tagline: 'Pinch at the right moment to drop the block. Build the tallest tower you can.', control: '👌 Pinch to drop',
    hint: 'Pinch thumb + finger (or click / Space) to drop. Land it perfectly to keep the full width.', needs: { hands: true, face: false },
    colors: ['#ffb347', '#ff5e62'], cursor: 'dot', pip: true, bloom: 0.3,
    icon: `<svg viewBox="0 0 100 100"><rect x="26" y="68" width="48" height="16" rx="3" fill="#ff5e62"/><rect x="32" y="50" width="44" height="16" rx="3" fill="#ffb347"/><rect x="28" y="32" width="40" height="16" rx="3" fill="#ffd36b"/><path d="M12 24h14M12 24l5-5M12 24l5 5M88 24H74M88 24l-5-5M88 24l-5 5" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round"/></svg>`,
  };
  constructor(app) {
    this.app = app; this.fx = new Particles(300); this.ft = new FloatText(); this.t = 0; this.score = 0;
    this.sc = clamp(app.H / 900, 0.7, 1.4); this.bh = 46 * this.sc;
    this.baseW = Math.min(app.W * 0.34, 420 * this.sc); this.baseY = app.H * 0.86;
    this.stack = [{ x: app.W / 2 - this.baseW / 2, w: this.baseW, hue: 20 }];
    this.cam = 0; this.camT = 0; this.dir = 1; this.perfects = 0; this.combo = 0; this.was = false; this.over = false; this.debris = [];
    this.spawnMover(); this.banner = { text: '', t: 0 };
  }
  spawnMover() {
    const top = this.stack[this.stack.length - 1], n = this.stack.length;
    this.mv = { w: top.w, x: this.dir > 0 ? -top.w * 0.5 : this.app.W - top.w * 0.5, hue: (20 + n * 14) % 360, speed: (330 + Math.min(n, 30) * 20) * this.sc };
    this.dir = -this.dir;
  }
  levelY(i) { return this.baseY - i * this.bh + this.cam; }
  drop() {
    const app = this.app, top = this.stack[this.stack.length - 1], m = this.mv;
    const l = Math.max(top.x, m.x), r = Math.min(top.x + top.w, m.x + m.w), ov = r - l;
    if (ov <= 4 * this.sc) {
      this.over = true; this.debris.push({ x: m.x, w: m.w, y: this.levelY(this.stack.length), vy: 0, vx: 0, hue: m.hue, rot: 0 });
      app.snd.bomb(); app.shake = 18; app.flash('255,60,90', 0.3);
      app.finish(this.score, { title: 'Tower fell!', extra: `${this.stack.length - 1} floors · ${this.perfects} perfect drops`, delay: 900 }); return;
    }
    const perfect = Math.abs(m.x - top.x) < 7 * this.sc;
    let nx = m.x, nw = m.w;
    if (perfect) { nx = top.x; nw = top.w; this.combo++; this.perfects++; }
    else {
      this.combo = 0; nx = l; nw = ov;
      const cutX = m.x < top.x ? m.x : r, cutW = m.w - ov;
      this.debris.push({ x: cutX, w: cutW, y: this.levelY(this.stack.length), vy: 0, vx: (m.x < top.x ? -1 : 1) * 80, hue: m.hue, rot: 0 });
    }
    this.stack.push({ x: nx, w: nw, hue: m.hue });
    if (perfect && this.combo >= 3) nw = Math.min(this.baseW, nw + 10 * this.sc), this.stack[this.stack.length - 1].w = nw, this.stack[this.stack.length - 1].x = nx - 5 * this.sc;
    const pts = perfect ? 50 + this.combo * 10 : 10; this.score += pts;
    app.snd[perfect ? 'bonus' : 'brick'](this.stack.length);
    const y = this.levelY(this.stack.length - 1);
    this.fx.burst(nx + nw / 2, y, perfect ? 30 : 10, { color: perfect ? ['#fff', '#ffd36b'] : [`hsl(${m.hue},90%,65%)`], min: 80, max: 360, gravity: 500 });
    this.ft.add(nx + nw / 2, y - 40, perfect ? (this.combo > 1 ? `PERFECT x${this.combo}` : 'PERFECT!') : `+${pts}`, perfect ? '#ffd36b' : '#fff', perfect ? 42 : 30);
    if (perfect) app.punch(0.02);
    this.camT = Math.max(0, (this.stack.length - 6) * this.bh);
    this.spawnMover();
  }
  update(dt, input) {
    const app = this.app, { W } = app; this.t += dt;
    const h = input.primary; let fire = false;
    if (h) { const p = h.mouse ? h.pinch : h.gesture === 'pinch'; fire = p && !this.was; this.was = p; }
    if (input.consume('Space')) fire = true;
    this.cam = smooth(this.cam, this.camT, 5, dt);
    if (!this.over) {
      const m = this.mv; m.x += this.dir * -1 * m.speed * dt;
      // bounce on screen edges
      if (m.x < -m.w * 0.6) { this.dir = -1; m.x = -m.w * 0.6; } else if (m.x > W - m.w * 0.4) { this.dir = 1; m.x = W - m.w * 0.4; }
      if (fire) this.drop();
    }
    for (const d of this.debris) { d.vy += 1500 * dt; d.y += d.vy * dt; d.x += d.vx * dt; d.rot += d.vx * 0.002 * dt; }
    this.debris = this.debris.filter((d) => d.y < app.H + 200);
    this.fx.update(dt); this.ft.update(dt);
    app.hud.score = this.score; app.hud.label = `Floor ${this.stack.length - 1}`;
  }
  block(ctx, x, y, w, hue, glow) {
    ctx.fillStyle = `hsl(${hue},85%,${glow ? 68 : 58}%)`; ctx.fillRect(x, y, w, this.bh);
    ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.fillRect(x, y, w, 5 * this.sc);
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(x, y + this.bh - 5 * this.sc, w, 5 * this.sc);
  }
  draw(ctx) {
    const { W, H } = this.app; bgGrad(ctx, this.app, '#1b1030', '#2a1020', 0.2);
    ctx.fillStyle = 'rgba(255,255,255,.06)'; ctx.fillRect(0, this.baseY + this.bh + this.cam, W, H);
    for (let i = 0; i < this.stack.length; i++) { const y = this.levelY(i); if (y > H + 10 || y < -this.bh) continue; const b = this.stack[i]; this.block(ctx, b.x, y, b.w, b.hue); }
    if (!this.over) {
      const y = this.levelY(this.stack.length); this.block(ctx, this.mv.x, y, this.mv.w, this.mv.hue, true);
      const top = this.stack[this.stack.length - 1];
      ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.setLineDash([10, 10]); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(top.x, 0); ctx.lineTo(top.x, y); ctx.moveTo(top.x + top.w, 0); ctx.lineTo(top.x + top.w, y); ctx.stroke(); ctx.setLineDash([]);
    }
    for (const d of this.debris) { ctx.save(); ctx.translate(d.x + d.w / 2, d.y + this.bh / 2); ctx.rotate(d.rot); ctx.globalAlpha = 0.9; this.block(ctx, -d.w / 2, -this.bh / 2, d.w, d.hue); ctx.restore(); }
    this.fx.draw(ctx); this.ft.draw(ctx);
    if (this.stack.length <= 2) glowText(ctx, 'Pinch to drop', W / 2, H * 0.22, 46 * this.sc, '#ffd36b');
  }
}
