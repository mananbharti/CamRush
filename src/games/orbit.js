import { ExpansionGame } from './_expansion.js';
const TAU = Math.PI * 2;
export default class OrbitDash extends ExpansionGame {
  static meta = { id: 'orbit', name: 'Orbit Dash', tagline: 'Switch rings to pass the gates. One pinch, perfect timing.', control: '👌 Pinch to switch', hint: 'Pinch, click or Space switches rings. Match the open lane at each gate.', needs: { hands: true, face: false }, colors: ['#b28aff', '#39edda'], cursor: 'dot', pip: false, bloom: 0.12, icon: '<svg viewBox="0 0 100 100"><g fill="none" stroke="#b28aff" stroke-width="5"><circle cx="50" cy="50" r="36"/><circle cx="50" cy="50" r="23"/></g><circle cx="86" cy="50" r="8" fill="#39edda"/></svg>' };
  constructor(app) { super(app); this.angle = -Math.PI / 2; this.lane = 0; this.travel = 0; this.next = 1.9; this.gates = []; this.lives = 3; this.passed = 0; app.hud.lives = 3; }
  update(dt, input) {
    if (this.over) return; this.tick(dt); if (this.action(input).press) { this.lane = 1 - this.lane; this.app.snd.click(); }
    const speed = 0.85 + Math.min(this.passed * 0.025, 0.65); this.travel += dt * speed; this.angle = -Math.PI / 2 + this.travel;
    while (this.next < this.travel + 3.2) { this.gates.push({ at: this.next, open: Math.random() < 0.5 ? 0 : 1 }); this.next += 1.6; }
    for (const g of this.gates) if (!g.done && this.travel >= g.at) { g.done = true; if (g.open === this.lane) { this.score += 100; this.passed++; this.app.snd.point(); this.message('GATE CLEAR +100'); } else { this.lives--; this.app.snd.hit(); this.message('Wrong ring!'); if (!this.lives) this.end('Orbit complete', `${this.passed} gates cleared`); } }
    this.gates = this.gates.filter(g => g.at > this.travel - 0.4); this.app.hud.lives = this.lives; this.hud(`${this.passed} gates cleared`);
  }
  draw(ctx) {
    this.backdrop(ctx, '#100c2e', '#071d29');
    for (const r of [0.27, 0.41]) { ctx.beginPath(); ctx.arc(0.5, 0.5, r, 0, TAU); ctx.strokeStyle = '#514b82'; ctx.lineWidth = 0.008; ctx.stroke(); }
    for (const g of this.gates) { const a = -Math.PI / 2 + g.at; const r = g.open === 0 ? 0.41 : 0.27; ctx.strokeStyle = g.done ? '#656c88' : '#ff617f'; ctx.lineWidth = 0.045; ctx.beginPath(); ctx.arc(0.5, 0.5, r, a - 0.12, a + 0.12); ctx.stroke(); const openR = g.open === 0 ? 0.27 : 0.41; ctx.fillStyle = '#36dfbf'; ctx.beginPath(); ctx.arc(0.5 + Math.cos(a) * openR, 0.5 + Math.sin(a) * openR, 0.012, 0, TAU); ctx.fill(); }
    const r = this.lane ? 0.41 : 0.27; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0.5 + Math.cos(this.angle) * r, 0.5 + Math.sin(this.angle) * r, 0.024, 0, TAU); ctx.fill(); this.text(ctx, 'ORBIT', 0.5, 0.47, 0.052, '#b9a3ff'); this.text(ctx, this.lane ? 'OUTER RING' : 'INNER RING', 0.5, 0.54, 0.025); this.footer(ctx, 'Pinch / click / Space to switch rings');
  }
}
