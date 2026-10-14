import { rrand as rand, raw } from './util.js';
export class Particles {
  constructor(max = 900) { this.p = []; this.max = max; }
  burst(x, y, n, o = {}) {
    for (let i = 0; i < n; i++) {
      if (this.p.length >= this.max) this.p.shift();
      const a = o.angle !== undefined ? o.angle + rand(-(o.spread ?? Math.PI), o.spread ?? Math.PI) : rand(0, Math.PI * 2);
      const s = rand(o.min ?? 80, o.max ?? 420);
      this.p.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0, ttl: rand(o.ttlMin ?? 0.4, o.ttlMax ?? 0.9),
        r: rand(o.rMin ?? 2, o.rMax ?? 6), color: Array.isArray(o.color) ? o.color[(raw() * o.color.length) | 0] : (o.color ?? '#fff'),
        g: o.gravity ?? 600, drag: o.drag ?? 0.2, glow: o.glow ?? false, shape: o.shape ?? 'circle' });
    }
  }
  update(dt) {
    for (const q of this.p) { q.life += dt; q.vy += q.g * dt; q.vx *= 1 - q.drag * dt; q.vy *= 1 - q.drag * dt; q.x += q.vx * dt; q.y += q.vy * dt; }
    this.p = this.p.filter((q) => q.life < q.ttl);
  }
  draw(ctx) {
    for (const q of this.p) {
      const t = 1 - q.life / q.ttl;
      ctx.globalAlpha = Math.max(0, t);
      ctx.fillStyle = q.color;
      if (q.glow) { ctx.shadowColor = q.color; ctx.shadowBlur = 12; }
      ctx.beginPath();
      if (q.shape === 'square') ctx.rect(q.x - q.r, q.y - q.r, q.r * 2 * t + 1, q.r * 2 * t + 1);
      else ctx.arc(q.x, q.y, q.r * (0.4 + 0.6 * t), 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;
  }
}

export class FloatText {
  constructor() { this.t = []; }
  add(x, y, text, color = '#fff', size = 34) { this.t.push({ x, y, text, color, size, life: 0, ttl: 1 }); }
  update(dt) { for (const f of this.t) { f.life += dt; f.y -= 60 * dt; } this.t = this.t.filter((f) => f.life < f.ttl); }
  draw(ctx) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const f of this.t) {
      const k = f.life / f.ttl;
      const pop = k < 0.15 ? 0.6 + (k / 0.15) * 0.6 : 1.2 - Math.min(0.2, (k - 0.15));
      ctx.globalAlpha = 1 - Math.max(0, (k - 0.6) / 0.4);
      ctx.font = `800 ${f.size * pop}px "Space Grotesk", Inter, sans-serif`;
      ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }
}
