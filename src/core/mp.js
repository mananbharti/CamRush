// LAN multiplayer: rooms of up to 12 laptops, same-seed score races, and tournaments over several games.
// One laptop runs `npm start` (serves the game + relays messages). Others join with its IP. Single-player never needs this.
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const mulberry = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const realRandom = Math.random.bind(Math);

export class MP {
  constructor(app) {
    this.app = app; this.ws = null; this.me = null; this.players = []; this.code = ''; this.ips = []; this.port = 4173;
    this.view = 'closed'; this.err = ''; this.mode = 'race'; this.gameIdx = 0; this.rounds = 7;
    this.cur = null; this.live = {}; this.fin = {}; this.totals = {}; this.res = null; this.tour = null; this.nextT = 0; this.sendT = 0; this.seeded = false;
    this.name = localStorage.getItem('camrush.name') || 'Player' + (100 + Math.floor(realRandom() * 900));
    $('btn-mp').onclick = () => { app.snd.click(); this.open(); };
    $('mp').addEventListener('click', (e) => { const b = e.target.closest('[data-a]'); if (b) { app.snd.click(); this.act(b.dataset.a, b.dataset.v); } });
    setInterval(() => this.tick(), 100);
  }
  // ----- state helpers -----
  isHost() { return !!this.players.find((p) => p.id === this.me && p.host); }
  pl(id) { return this.players.find((p) => p.id === id); }
  inMatch() { return !!(this.cur && this.view === 'playing'); }
  seedOn(seed) { Math.random = mulberry(seed >>> 0); this.seeded = true; }
  seedOff() { if (this.seeded) { Math.random = realRandom; this.seeded = false; } }
  afterCreate() { /* hook after game construction */ }
  // ----- network -----
  connect(host, then) {
    this.err = ''; this.render();
    let url; try { const h = host.includes(':') ? host : host + ':' + (location.port || 4173); url = 'ws://' + h; } catch { return; }
    let ws; try { ws = new WebSocket(url); } catch { this.err = 'Could not connect.'; return this.render(); }
    this.ws = ws; let opened = false;
    const to = setTimeout(() => { if (!opened) { this.err = 'Timed out reaching ' + host + '. Same Wi-Fi? Is CamRush running there?'; this.close(); this.render(); } }, 5000);
    ws.onopen = () => { opened = true; clearTimeout(to); then(); };
    ws.onmessage = (e) => { try { this.onMsg(JSON.parse(e.data)); } catch (er) { console.error(er); } };
    ws.onerror = () => { if (!opened) { this.err = 'Could not reach ' + host + '. Check the IP and that CamRush is running there (npm start).'; } };
    ws.onclose = () => { clearTimeout(to); if (this.ws === ws) { this.ws = null; if (this.view !== 'closed' && this.view !== 'home' && this.view !== 'connecting' && this.view !== 'join') { this.err = this.err || 'Disconnected from the match.'; this.leaveAll(); } this.render(); } };
  }
  close() { const w = this.ws; this.ws = null; try { w && w.close(); } catch { /* ignore */ } }
  send(o) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }
  bcast(d) { this.send({ t: 'msg', d }); }
  onMsg(m) {
    if (m.t === 'hello') { this.me = m.id; if (m.ips) { this.ips = m.ips; this.port = m.port || this.port; } }
    else if (m.t === 'room') { this.code = m.code; this.players = m.players; if (this.view === 'host' || this.view === 'join' || this.view === 'connecting') this.view = 'lobby'; this.checkDone(); this.render(); }
    else if (m.t === 'error') { this.err = m.msg; this.close(); this.view = 'join'; this.render(); }
    else if (m.t === 'closed') { this.err = 'The host closed the match.'; this.leaveAll(); this.render(); }
    else if (m.t === 'msg') this.onData(m.from, m.d);
  }
  onData(from, d) {
    if (d.k === 'sc') this.live[from] = d.s;
    else if (d.k === 'start') this.startRound(d);
    else if (d.k === 'fin') { this.fin[from] = d.s; this.live[from] = d.s; this.checkDone(); if (this.view === 'result') this.render(); }
    else if (d.k === 'res') { this.res = d; this.totals = d.totals; this.view = 'result'; this.nextT = d.last || this.mode !== 'tour' ? 0 : 9; this.render(); }
    else if (d.k === 'cfg') { this.mode = d.mode; this.rounds = d.rounds; this.render(); }
  }
  // ----- actions -----
  open() { this.view = this.ws ? 'lobby' : 'home'; this.err = ''; this.app.state === 'menu' && this.show(true); this.render(); }
  show(on) { this.app.setOverlay('mp', on); }
  leaveAll() { this.close(); this.seedOff(); this.cur = null; this.players = []; this.view = 'home'; this.live = {}; this.fin = {}; this.res = null; if (this.app.state !== 'menu' && this.app.state !== 'splash') { this.app._toMenuQuiet?.(); } this.show(true); this.app.state = 'menu'; this.app.game = null; this.app.setOverlay('over', false); this.app.setOverlay('menu', false); }
  act(a, v) {
    const app = this.app;
    if (a === 'home') { this.view = 'home'; this.err = ''; }
    else if (a === 'back') { this.show(false); this.view = this.ws ? 'lobby' : 'closed'; }
    else if (a === 'host') { this.view = 'connecting'; this.render(); this.connect(location.hostname + ':' + (location.port || 4173), () => this.send({ t: 'create', name: this.name })); return; }
    else if (a === 'joinv') { this.view = 'join'; this.err = ''; }
    else if (a === 'connect') { const ip = ($('mp-ip').value || '').trim(); this.name = ($('mp-name').value || this.name).trim().slice(0, 16) || this.name; localStorage.setItem('camrush.name', this.name); localStorage.setItem('camrush.ip', ip); if (!ip) { this.err = 'Enter the host IP shown on the host laptop.'; return this.render(); } this.view = 'connecting'; this.render(); this.connect(ip, () => this.send({ t: 'join', name: this.name })); return; }
    else if (a === 'leave') { this.close(); this.players = []; this.view = 'home'; }
    else if (a === 'mode') { this.mode = v; this.bcast({ k: 'cfg', mode: v, rounds: this.rounds }); }
    else if (a === 'rounds') { this.rounds = Math.max(3, Math.min(10, this.rounds + +v)); this.bcast({ k: 'cfg', mode: this.mode, rounds: this.rounds }); }
    else if (a === 'game') { const n = app.games.length; this.gameIdx = (this.gameIdx + +v + n) % n; }
    else if (a === 'start') return this.hostStart();
    else if (a === 'next') return this.hostNext();
    else if (a === 'force') return this.finalize(true);
    else if (a === 'lobby') { this.cur = null; this.view = 'lobby'; this.seedOff(); app.state = 'menu'; app.game = null; }
    else if (a === 'menu') { this.show(false); this.app.toMenu(); return; }
    this.render();
  }
  hostStart() {
    if (!this.isHost() || this.players.length < 2) { this.err = 'Need at least 2 players in the room.'; return this.render(); }
    const games = this.app.games.map((g) => g.meta.id);
    if (this.mode === 'tour') { const pool = [...games].sort(() => realRandom() - 0.5).slice(0, Math.min(this.rounds, games.length)); this.tour = { list: pool, i: 0 }; this.totals = {}; this.go(pool[0], 0, pool.length); }
    else { this.tour = null; this.totals = {}; this.go(games[this.gameIdx], 0, 1); }
  }
  hostNext() {
    if (!this.isHost()) return;
    if (this.tour && this.tour.i + 1 < this.tour.list.length) { this.tour.i++; this.go(this.tour.list[this.tour.i], this.tour.i, this.tour.list.length); }
    else this.go(this.cur.game, this.cur.round + 1, 1); // race: rematch
  }
  go(game, round, rounds) { const d = { k: 'start', game, seed: Math.floor(realRandom() * 2 ** 31), round, rounds, mode: this.mode }; this.bcast(d); this.startRound(d); }
  startRound(d) {
    this.cur = d; this.mode = d.mode; this.live = {}; this.fin = {}; this.res = null; this.view = 'playing'; this.show(false);
    this.seedOn(d.seed); this.app._startGame(d.game);
  }
  forfeit() { const s = Math.floor(this.app.hud.score || 0); this.app.state = 'over'; this.localFinish(s, {}); }
  localFinish(score) {
    if (this.fin[this.me] != null) return;
    this.seedOff(); this.fin[this.me] = score; this.live[this.me] = score; this.bcast({ k: 'fin', s: score });
    this.view = 'result'; this.res = null; this.show(true); this.render(); this.checkDone();
  }
  checkDone() {
    if (!this.isHost() || !this.cur || this.view === 'closed' || (this.res && this.res.round === this.cur.round)) return;
    if (this.players.length && this.players.every((p) => this.fin[p.id] != null)) this.finalize(false);
  }
  finalize(force) {
    if (!this.isHost() || !this.cur) return;
    const rows = this.players.map((p) => ({ id: p.id, s: this.fin[p.id] ?? Math.floor(this.live[p.id] || 0) })).sort((a, b) => b.s - a.s);
    const n = rows.length; let last = null;
    rows.forEach((r, i) => { if (last && last.s === r.s) { r.pts = last.pts; r.rank = last.rank; } else { r.pts = n - 1 - i; r.rank = i + 1; } last = r; });
    rows.forEach((r) => { this.totals[r.id] = (this.totals[r.id] || 0) + r.pts; this.totalScore = this.totalScore || {}; });
    const isLast = !this.tour || this.tour.i + 1 >= this.tour.list.length;
    const d = { k: 'res', round: this.cur.round, rows, totals: { ...this.totals }, last: !!(this.tour ? isLast : false), game: this.cur.game, forced: !!force };
    this.bcast(d); this.onData(this.me, d);
  }
  tick() {
    const dt = 0.1;
    if (this.view === 'playing' && this.app.state === 'play') { this.sendT += dt; if (this.sendT >= 0.2) { this.sendT = 0; const s = Math.floor(this.app.hud.score || 0); this.live[this.me] = s; this.bcast({ k: 'sc', s }); } }
    if (this.view === 'result' && this.res && this.nextT > 0) { this.nextT -= dt; if (this.nextT <= 0 && this.isHost()) { this.nextT = 0; if (!this.res.last) this.hostNext(); } else this.updateTimer(); }
  }
  updateTimer() { const e = $('mp-timer'); if (e) e.textContent = Math.ceil(this.nextT); }
  // ----- in-game scoreboard -----
  drawLive(ctx, W, H) {
    if (!this.cur || this.view !== 'playing' && !(this.view === 'result' && this.app.state === 'over')) return;
    if (this.view !== 'playing') return;
    const rows = this.players.map((p) => ({ p, s: Math.floor(p.id === this.me ? this.app.hud.score || 0 : this.live[p.id] || 0), f: this.fin[p.id] != null })).sort((a, b) => b.s - a.s);
    const u = Math.min(1, Math.max(0.7, H / 800)), rh = 28 * u, w = 190 * u; let y = 84 * u; const x = W - w - 14;
    ctx.save(); ctx.font = `700 ${14 * u}px "Space Grotesk",sans-serif`; ctx.textBaseline = 'middle';
    const shown = rows.slice(0, 8);
    ctx.fillStyle = 'rgba(8,10,28,.55)'; ctx.beginPath(); ctx.roundRect(x - 8, y - 8, w + 16, shown.length * rh + 16, 14 * u); ctx.fill();
    shown.forEach((r, i) => {
      const yy = y + i * rh + rh / 2; if (r.p.id === this.me) { ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.beginPath(); ctx.roundRect(x - 4, yy - rh / 2 + 1, w + 8, rh - 2, 8 * u); ctx.fill(); }
      ctx.fillStyle = r.p.color; ctx.shadowColor = r.p.color; ctx.shadowBlur = 8; ctx.beginPath(); ctx.arc(x + 8 * u, yy, 6 * u, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
      ctx.fillStyle = r.f ? '#8d93b5' : '#fff'; ctx.textAlign = 'left'; ctx.fillText(`${i + 1}. ${r.p.name}`.slice(0, 14), x + 20 * u, yy);
      ctx.textAlign = 'right'; ctx.fillText(String(r.s), x + w, yy);
    });
    if (this.mode === 'tour' && this.cur.rounds > 1) { ctx.textAlign = 'center'; ctx.fillStyle = '#9aa0c3'; ctx.fillText(`Game ${this.cur.round + 1} of ${this.cur.rounds}`, x + w / 2, y + shown.length * rh + 22 * u); }
    ctx.restore();
  }
  // ----- UI -----
  render() {
    const card = $('mp-card'); if (!card || this.view === 'closed' || this.view === 'playing') return;
    const players = () => `<div class="mp-pl">${this.players.map((p) => `<div class="mp-p"><i style="background:${p.color};color:${p.color}"></i>${esc(p.name)}${p.id === this.me ? ' (you)' : ''}<small>${p.host ? 'host' : ''}</small></div>`).join('')}</div>`;
    const err = `<div class="mp-err">${esc(this.err || '')}</div>`;
    let h = '';
    if (this.view === 'home') {
      h = `<h2>Multiplayer</h2><p class="sub">Play with friends on the same Wi-Fi. Up to 12 players, races and tournaments.</p>
      <div class="row"><button class="btn primary big dwell" data-a="host">Host a match</button><button class="btn big dwell" data-a="joinv">Join a match</button><button class="btn ghost big dwell" data-a="back">Back</button></div>${err}
      <p class="sub">Host: this laptop runs CamRush and shows its IP. Others open CamRush on their own laptop and enter that IP.</p>`;
    } else if (this.view === 'connecting') {
      h = `<h2>Connecting...</h2>${err}<div class="row"><button class="btn ghost dwell" data-a="home">Cancel</button></div>`;
    } else if (this.view === 'join') {
      h = `<h2>Join a match</h2><p class="sub">Enter the IP address shown on the host laptop.</p>
      <div class="row"><input id="mp-name" maxlength="16" placeholder="Your name" value="${esc(this.name)}"/><input id="mp-ip" placeholder="Host IP e.g. 192.168.1.20" value="${esc(localStorage.getItem('camrush.ip') || '')}"/></div>${err}
      <div class="row"><button class="btn primary big dwell" data-a="connect">Join</button><button class="btn ghost big dwell" data-a="home">Back</button></div>`;
    } else if (this.view === 'lobby') {
      const host = this.isHost(), g = this.app.games[this.gameIdx % this.app.games.length].meta;
      h = `<h2>${host ? 'You are hosting' : 'In the lobby'}</h2>`;
      if (host) h += `<p class="sub">Tell everyone to open CamRush, press Multiplayer &gt; Join and enter:</p><div class="mp-ip">${this.ips.length ? this.ips.map(esc).join(' &nbsp;or&nbsp; ') : 'this laptop\'s Wi-Fi IP'}</div>`;
      h += `<p class="sub">${this.players.length} player${this.players.length === 1 ? '' : 's'} in the room. Everyone has a colour.</p>${players()}`;
      if (host) {
        h += `<div class="row"><button class="btn tab dwell ${this.mode === 'race' ? 'on' : ''}" data-a="mode" data-v="race">Single race</button><button class="btn tab dwell ${this.mode === 'tour' ? 'on' : ''}" data-a="mode" data-v="tour">Tournament</button></div>`;
        h += this.mode === 'race' ? `<div class="row"><button class="btn dwell" data-a="game" data-v="-1">&lsaquo;</button><b style="font:700 22px 'Space Grotesk'">${esc(g.name)}</b><button class="btn dwell" data-a="game" data-v="1">&rsaquo;</button></div>`
          : `<div class="row"><button class="btn dwell" data-a="rounds" data-v="-1">-</button><b style="font:700 22px 'Space Grotesk'">${Math.min(this.rounds, this.app.games.length)} random games</b><button class="btn dwell" data-a="rounds" data-v="1">+</button></div>`;
        h += `${err}<div class="row"><button class="btn primary big dwell" data-a="start">Start</button><button class="btn ghost big dwell" data-a="back">Hide</button><button class="btn ghost big dwell" data-a="leave">Close room</button></div>`;
      } else h += `<p class="sub">Waiting for the host to start. Mode: ${this.mode === 'tour' ? 'Tournament' : 'Single race'}.</p>${err}<div class="row"><button class="btn ghost big dwell" data-a="leave">Leave</button></div>`;
    } else if (this.view === 'result') {
      const gname = (this.app.games.find((x) => x.meta.id === this.cur?.game) || { meta: { name: '' } }).meta.name;
      const rows = this.res ? this.res.rows : this.players.map((p) => ({ id: p.id, s: this.fin[p.id] ?? Math.floor(this.live[p.id] || 0), wait: this.fin[p.id] == null })).sort((a, b) => b.s - a.s);
      const body = rows.map((r, i) => { const p = this.pl(r.id) || { name: '?', color: '#888' }; return `<tr><td>${this.res ? r.rank : i + 1}</td><td><i style="display:inline-block;width:14px;height:14px;border-radius:50%;background:${p.color};box-shadow:0 0 10px ${p.color};margin-right:8px"></i>${esc(p.name)}${r.id === this.me ? ' (you)' : ''}</td><td class="n">${r.s}${r.wait ? ' ...' : ''}</td>${this.res ? `<td class="n">+${r.pts}</td><td class="n">${this.totals[r.id] || 0}</td>` : ''}</tr>`; }).join('');
      const fin = this.res && this.res.last, tour = this.mode === 'tour';
      let title = !this.res ? 'Waiting for others...' : fin ? 'Tournament complete' : tour ? `Game ${this.res.round + 1} of ${this.cur.rounds} done` : 'Race complete';
      if (fin) { const top = [...this.players].sort((a, b) => (this.totals[b.id] || 0) - (this.totals[a.id] || 0))[0]; title = '🏆 ' + (top ? top.name : '') + ' wins!'; }
      h = `<h2>${esc(title)}</h2><p class="sub">${esc(gname)}${this.res ? (tour ? ' - points: rank-based, top player gets most' : '') : ''}</p><table><tr><td></td><td></td><td class="n">Score</td>${this.res ? '<td class="n">Pts</td><td class="n">Total</td>' : ''}</tr>${body}</table>`;
      if (this.res && tour && !fin) h += `<p class="sub">Next game in <b id="mp-timer">${Math.ceil(this.nextT)}</b>s${this.isHost() ? '' : ' (host controls)'}</p>`;
      h += `<div class="row">`;
      if (!this.res && this.isHost()) h += `<button class="btn big dwell" data-a="force">Finish now</button>`;
      if (this.res && this.isHost()) { if (fin || !tour) h += `<button class="btn primary big dwell" data-a="${fin ? 'lobby' : 'next'}">${fin ? 'Back to lobby' : 'Rematch'}</button>`; if (!fin && !tour) h += `<button class="btn big dwell" data-a="lobby">Lobby</button>`; else if (!fin) h += `<button class="btn primary big dwell" data-a="next">Next now</button>`; }
      else if (this.res && !this.isHost()) h += `<button class="btn big dwell" data-a="lobby">To lobby</button>`;
      h += `<button class="btn ghost big dwell" data-a="menu">Menu</button></div>`;
    }
    card.innerHTML = h; this.app._elsT = -1e9;
  }
                                                                                               }
