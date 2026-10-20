// CamRush inference worker. Runs the MediaPipe hand + face landmarkers off the main
// thread so a slow CPU/GPU can't stall the render loop. The main thread sends one
// downscaled ImageBitmap per camera frame (transferred, not copied); results come
// back as plain landmark data. Anything that fails here makes the app fall back to
// main-thread inference, so this file should never leave the tracker half-ready.
import { FilesetResolver, HandLandmarker, FaceLandmarker } from '@mediapipe/tasks-vision';

let fileset = null, hand = null, face = null;

async function load(base, onProgress) {
  fileset = await FilesetResolver.forVisionTasks(`${base}mediapipe/wasm`);
  onProgress(0.3);
  const mk = async (Cls, path, extra) => {
    let lastErr;
    for (const delegate of ['GPU', 'CPU']) {
      try {
        return await Cls.createFromOptions(fileset, { baseOptions: { modelAssetPath: `${base}models/${path}`, delegate }, runningMode: 'VIDEO', ...extra });
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('model load failed ' + path);
  };
  hand = await mk(HandLandmarker, 'hand_landmarker.task', { numHands: 2, minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5 });
  onProgress(0.7);
  face = await mk(FaceLandmarker, 'face_landmarker.task', { numFaces: 1, outputFaceBlendshapes: true, minFaceDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
  onProgress(1);
}

self.onmessage = async (e) => {
  const m = e.data;
  if (m.t === 'load') {
    try {
      await load(m.base, (p) => self.postMessage({ t: 'progress', p }));
      self.postMessage({ t: 'ready' });
    } catch (err) {
      self.postMessage({ t: 'error', message: String((err && err.message) || err) });
    }
    return;
  }
  if (m.t === 'frame') {
    const t0 = performance.now();
    let hr = null, fr = null;
    try {
      if (m.hands && hand) hr = hand.detectForVideo(m.bmp, m.ts);
      if (m.face && face) fr = face.detectForVideo(m.bmp, m.ts + 0.01);
    } catch (err) { /* drop this frame; the next one carries on */ }
    try { m.bmp.close(); } catch (err) {}
    // Only the fields the tracker actually consumes are posted back (structured clone).
    self.postMessage({
      t: 'result', id: m.id, ms: performance.now() - t0,
      hands: hr ? { landmarks: hr.landmarks, handedness: hr.handedness } : null,
      face: fr ? { faceLandmarks: fr.faceLandmarks, faceBlendshapes: fr.faceBlendshapes } : null,
    });
  }
};
