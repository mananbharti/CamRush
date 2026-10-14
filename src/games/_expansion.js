import { bgGrad } from './_kit.js';
import { clamp, roundRect } from '../core/util.js';
// Shared small, allocation-light helpers. Positions use a centered square playfield.
export class ExpansionGame {
  constructor(app) { this.app = app; this.t = 0; this.score = 0; this.over = false; this.held = false; this.note = ''; this.noteT = 0; }
  area() { const { W, H } = this.app; const size = Math.min(W - 32, (H - 150) * 0.92, 620); return { x: (W - size) / 2, y: 122 + (H - 150 - size) / 2, s: size }; }
  pointer(input) { const h = input.primary; if (!h) return null; const a = this.area(); return { x: (h.x - a.x) / a.s, y: (h.y - a.y) / a.s }; }
  action(input) { const h = input.primary; const held = !!(h && (h.mouse ? h.pinch : h.pinch || h.gesture === 'pinch')); const press = held && !this.held; const release = !held && this.held; this.held = held; return { held, press: input.consume('Space') || press, release }; }
  tick(dt) { this.t += dt; this.noteT = Math.max(0, this.noteT - dt); }
  message(text) { this.note = text; this.noteT = 1.8; }
  end(title, extra = '') { if (this.over) return; this.over = true; this.app.finish(this.score, { title, extra }); }
  hud(label, time = null) { this.app.hud.score = this.score; this.app.hud.label = label; this.app.hud.time = time; }
  backdrop(ctx, c1, c2) { bgGrad(ctx, this.app, c1, c2, 0.12); const a = this.area(); ctx.save(); ctx.translate(a.x, a.y); ctx.scale(a.s, a.s); return a; }
  panel(ctx, x, y, w, h, color, radius = 0.03) { roundRect(ctx, x, y, w, h, radius); ctx.fillStyle = color; ctx.fill(); }
  text(ctx, text, x, y, size = 0.04, color = '#fff') { ctx.save(); ctx.scale(0.001, 0.001); ctx.fillStyle = color; ctx.font = `600 ${size * 1000}px "Space Grotesk",sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x * 1000, y * 1000); ctx.restore(); }
  footer(ctx, instruction) { const text = this.noteT ? this.note : instruction; const words = text.split(' '); const lines = ['']; for (const word of words) { const i = lines.length - 1; if ((lines[i] + ' ' + word).length > 37) lines.push(word); else lines[i] += (lines[i] ? ' ' : '') + word; } lines.forEach((line, i) => this.text(ctx, line, 0.5, 1.035 + i * 0.044, 0.037, this.noteT ? '#ffe08a' : '#c4cbe6')); ctx.restore(); }
}
export const bounded = (v) => clamp(v, 0, 1);
