// CamRush repeatable perf baseline.
// Drives the built app in headless Chrome with a synthetic camera, starts one game,
// and samples the app's own perf counters (P overlay / camrush.perf()) for N seconds.
//
// Honest scope: this measures pipeline throughput on the machine that runs it.
// Headless Chrome renders with SwiftShader (software GL) and a fake camera, so the
// numbers are a FLOOR for rendering, not a prediction for any real laptop. Tracking
// accuracy is not measured here (the fake camera shows no hands).
//
// Usage:
//   node tests/perf.mjs [--url http://localhost:4190] [--game target] [--secs 12] [--flags "noworker=1"]
// Needs puppeteer once, kept out of package.json so deploys stay fast:
//   npm i --no-save puppeteer && npx puppeteer browsers install chrome
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const url = opt('url', 'http://localhost:4190').replace(/\/$/, '');
const game = opt('game', 'target');
const secs = +opt('secs', '12');
const flags = opt('flags', '');

let puppeteer;
try { puppeteer = (await import('puppeteer')).default; }
catch { console.error('puppeteer not installed. Run: npm i --no-save puppeteer && npx puppeteer browsers install chrome'); process.exit(2); }

const browser = await puppeteer.launch({
  headless: true,
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required', '--no-sandbox', '--enable-unsafe-swiftshader', '--window-size=1280,800'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
page.on('pageerror', (e) => console.error('[pageerror]', e.message));

const q = '?perf=1' + (flags ? '&' + flags.replace(/^[?&]+/, '') : '');
const forceQ = /(?:^|[?&])qm=(low|high)/.exec(flags);
if (forceQ) await page.evaluateOnNewDocument((qv) => localStorage.setItem('camrush.qm', qv), forceQ[1]);
await page.goto(url + '/' + q, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForSelector('#btn-start', { visible: true, timeout: 15000 });
await page.click('#btn-start');
await page.waitForFunction(() => window.camrush && (window.camrush.state === 'menu' || !document.getElementById('btn-skip').hidden), { timeout: 120000 });
await page.evaluate(() => { const b = document.getElementById('btn-skip'); if (b && !b.hidden) b.click(); });
await page.waitForFunction(() => window.camrush && window.camrush.state === 'menu', { timeout: 30000 });
const ok = await page.evaluate((g) => { const d = window.camrush.games.find((x) => x.meta.id === g); if (d) window.camrush.startGame(g); return window.camrush.games.map((x) => x.meta.id); }, game);
if (!ok.includes(game)) { console.error('unknown game "' + game + '". Available: ' + ok.join(', ')); await browser.close(); process.exit(2); }
await page.waitForFunction(() => window.camrush && window.camrush.state === 'play', { timeout: 90000 });

const t0 = Date.now();
const samples = [];
while (Date.now() - t0 < secs * 1000) {
  samples.push(await page.evaluate(() => window.camrush.perf()));
  await new Promise((r) => setTimeout(r, 500));
}
await browser.close();

const nums = (f) => samples.map(f).filter((v) => typeof v === 'number' && !Number.isNaN(v));
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const pctl = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length * p)] : null; };
const last = samples[samples.length - 1] || {};
const out = {
  url: url + '/' + q, game, secs, samples: samples.length,
  renderFps: { median: med(nums((s) => s.fps)), p10: pctl(nums((s) => s.fps), 0.1), min: Math.min(...nums((s) => s.fps)) },
  inf: last.inf ? {
    fpsMedian: med(nums((s) => s.inf && s.inf.fps)), msMedian: med(nums((s) => s.inf && s.inf.ms)),
    latMsMedian: med(nums((s) => s.inf && s.inf.latMs)), mode: last.inf.mode, skip: last.inf.skip, lowSpec: last.inf.lowSpec,
  } : null,
  quality: last.quality, dpr: last.dpr, cam: last.cam,
  note: 'headless Chrome, SwiftShader software GL, synthetic camera: rendering floor, not a real-laptop prediction',
};
console.log(JSON.stringify(out, null, 2));
