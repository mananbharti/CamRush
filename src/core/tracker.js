import { FilesetResolver, HandLandmarker, FaceLandmarker } from '@mediapipe/tasks-vision';
import { OneEuro, dist } from './util.js';

const BASE = import.meta.env.BASE_URL;

export class Tracker {
  constructor() {
    this.video = document.createElement('video');
    this.video.playsInline = true; this.video.muted = true; this.video.autoplay = true;
    this.hand = null; this.face = null;
    this.ready = false; this.camOk = false;
    this.lastVT = -1; this.lastHands = null; this.lastFace = null;
    this.filters = []; // per hand slot
    this.faceF = { x: new OneEuro(1.2, 0.01), y: new OneEuro(1.2, 0.01), j: new OneEuro(3, 0.2) };
    this.pinchState = [false, false, false, false];
    this.prev = [];
    this.fps = 0; this._fc = 0; this._ft = performance.now();
    this.infMs = 0; this.frameN = 0; this.skipEvery = 1;
  }

  async startCamera() {
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30, max: 30 }, facingMode: 'user' }, audio: false });
    } catch (e) {
      if (e && (e.name === 'NotAllowedError' || e.name === 'NotFoundError')) throw e;
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    }
    this.video.srcObject = stream;
    await new Promise((res) => { this.video.onloadedmetadata = res; });
    await this.video.play();
    this.camOk = true;
  }

  async loadModels(onProgress = () => {}) {
    const fileset = await FilesetResolver.forVisionTasks(`${BASE}mediapipe/wasm`);
    onProgress(0.3);
    const mk = async (Cls, path, extra) => {
      for (const delegate of ['GPU', 'CPU']) {
        try {
          return await Cls.createFromOptions(fileset, { baseOptions: { modelAssetPath: `${BASE}models/${path}`, delegate }, runningMode: 'VIDEO', ...extra });
        } catch (e) { console.warn(Cls.name, delegate, 'failed', e); }
      }
      throw new Error('model load failed ' + path);
    };
    this.hand = await mk(HandLandmarker, 'hand_landmarker.task', { numHands: 2, minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5 });
    onProgress(0.7);
    this.face = await mk(FaceLandmarker, 'face_landmarker.task', { numFaces: 1, outputFaceBlendshapes: true, minFaceDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
    onProgress(1);
    this.ready = true;
  }

  // map normalized video coords -> screen px (mirrored, cover fit)
  mapper(W, H) {
    const vw = this.video.videoWidth || 1280, vh = this.video.videoHeight || 720;
    const s = Math.max(W / vw, H / vh);
    const ox = (W - vw * s) / 2, oy = (H - vh * s) / 2;
    return { vw, vh, s, ox, oy, map: (nx, ny) => ({ x: (1 - nx) * vw * s + ox, y: ny * vh * s + oy }) };
  }

  update(now, W, H, needs) {
    const v = this.video;
    let hands = null, face = null;
    if (this.ready && this.camOk && v.readyState >= 2 && v.currentTime !== this.lastVT) {
      this.lastVT = v.currentTime;
      this.frameN++;
      // Slow laptop? When inference is heavy, only run it on every 2nd/3rd camera frame so the game keeps rendering smoothly.
      if (this.frameN % this.skipEvery === 0) {
        const t0 = performance.now();
        try {
          if (needs.hands) this.lastHands = this.hand.detectForVideo(v, now);
          if (needs.face) this.lastFace = this.face.detectForVideo(v, now + 0.01);
        } catch (e) { /* skip frame */ }
        this.infMs = this.infMs * 0.9 + (performance.now() - t0) * 0.1;
        this.skipEvery = this.infMs > 40 ? 3 : this.infMs > 20 ? 2 : 1;
        this._fc++;
      }
    }
    if (now - this._ft > 1000) { this.fps = this._fc * 1000 / (now - this._ft); this._fc = 0; this._ft = now; }
    const m = this.mapper(W, H);
    this.m = m;
    hands = this.buildHands(needs.hands ? this.lastHands : null, m, now);
    face = this.buildFace(needs.face ? this.lastFace : null, m, now);
    return { hands, face };
  }

  buildHands(res, m, now) {
    if (!res || !res.landmarks || !res.landmarks.length) { this.prev = []; this.filters.forEach((f) => f && f.forEach((o) => o.reset())); return []; }
    const out = [];
    const used = new Set();
    res.landmarks.forEach((lm, i) => {
      const px = lm.map((p) => ({ nx: p.x, ny: p.y, ...m.map(p.x, p.y) }));
      const wrist = lm[0], mid = lm[9];
      const size = Math.hypot((wrist.x - mid.x) * m.vw, (wrist.y - mid.y) * m.vh) || 1;
      const palmN = [0, 5, 9, 13, 17].reduce((a, k) => ({ x: a.x + lm[k].x / 5, y: a.y + lm[k].y / 5 }), { x: 0, y: 0 });
      const palmRaw = m.map(palmN.x, palmN.y);
      // slot matching for stable filtering
      let slot = -1, best = 1e9;
      for (let s = 0; s < 2; s++) {
        if (used.has(s)) continue;
        const pv = this.prev[s];
        const d = pv ? dist(pv.x, pv.y, palmRaw.x, palmRaw.y) : 1e8;
        if (d < best) { best = d; slot = s; }
      }
      if (slot < 0) slot = i % 2;
      used.add(slot);
      if (!this.filters[slot]) this.filters[slot] = ['ix', 'iy', 'px', 'py', 'tx', 'ty'].map((_, k) => new OneEuro(k < 2 ? 2.2 : 1.4, 0.02));
      const F = this.filters[slot];
      const fx = (k, v) => F[k].filter(v, now);
      const ix = fx(0, px[8].x), iy = fx(1, px[8].y);
      const palm = { x: fx(2, palmRaw.x), y: fx(3, palmRaw.y) };
      const thumbTip = px[4], indexTip = px[8];
      const pinchDist = Math.hypot((lm[4].x - lm[8].x) * m.vw, (lm[4].y - lm[8].y) * m.vh) / size;
      const was = this.pinchState[slot];
      const pinch = was ? pinchDist < 0.55 : pinchDist < 0.38;
      this.pinchState[slot] = pinch;
      const d2 = (a, b) => Math.hypot((lm[a].x - lm[0].x) * m.vw, (lm[a].y - lm[0].y) * m.vh) ;
      const ext = [[8, 6], [12, 10], [16, 14], [20, 18]].map(([t, p]) => d2(t) > d2(p) * 1.12);
      const fingers = ext.filter(Boolean).length;
      let gesture = 'other';
      if (pinch && !ext[1] && !ext[2]) gesture = 'pinch';
      else if (fingers === 0) gesture = 'fist';
      else if (fingers >= 4) gesture = 'open';
      else if (ext[0] && ext[1] && !ext[2] && !ext[3]) gesture = 'peace';
      else if (ext[0] && !ext[1] && !ext[2] && !ext[3]) gesture = 'point';
      const pv = this.prev[slot];
      const dtp = pv ? Math.max(1e-3, (now - pv.t) / 1000) : 1;
      const vx = pv ? (ix - pv.x) / dtp : 0, vy = pv ? (iy - pv.y) / dtp : 0;
      const lead = Math.min(0.035, dtp * 1.2), px2 = ix + vx * lead, py2 = iy + vy * lead;
      const h = { slot, x: px2, y: py2, palm, tips: [px[4], px[8], px[12], px[16], px[20]], pinch, pinchDist, fingers, ext, gesture,
        vx, vy, speed: Math.hypot(vx, vy), size: size * m.s, lm: px, label: res.handedness?.[i]?.[0]?.categoryName, px: pv ? pv.x : ix, py: pv ? pv.y : iy };
      this.prev[slot] = { x: ix, y: iy, t: now };
      out.push(h);
    });
    for (let s = 0; s < 2; s++) if (!used.has(s)) { this.prev[s] = null; this.filters[s]?.forEach((o) => o.reset()); this.pinchState[s] = false; }
    return out.sort((a, b) => a.slot - b.slot);
  }

  buildFace(res, m, now) {
    if (!res || !res.faceLandmarks || !res.faceLandmarks.length) { this.faceF.x.reset(); this.faceF.y.reset(); return null; }
    const lm = res.faceLandmarks[0];
    const nose = m.map(lm[1].x, lm[1].y);
    const bs = {};
    (res.faceBlendshapes?.[0]?.categories || []).forEach((c) => { bs[c.categoryName] = c.score; });
    const L = lm[234], R = lm[454];
    const width = Math.hypot((L.x - R.x) * m.vw, (L.y - R.y) * m.vh) * m.s;
    const f = { x: this.faceF.x.filter(nose.x, now), y: this.faceF.y.filter(nose.y, now), mouthOpen: this.faceF.j.filter(bs.jawOpen ?? 0, now),
      smile: ((bs.mouthSmileLeft ?? 0) + (bs.mouthSmileRight ?? 0)) / 2, blinkL: bs.eyeBlinkLeft ?? 0, blinkR: bs.eyeBlinkRight ?? 0, width, lm: lm.map((p) => ({ ...m.map(p.x, p.y) })), bs };
    return f;
  }

  drawVideo(ctx, W, H, alpha = 1) {
    const v = this.video;
    if (!this.camOk || v.readyState < 2) return false;
    const m = this.m || this.mapper(W, H);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(W - m.ox, m.oy); ctx.scale(-1, 1);
    ctx.drawImage(v, 0, 0, m.vw * m.s, m.vh * m.s);
    ctx.restore();
    return true;
  }
}
