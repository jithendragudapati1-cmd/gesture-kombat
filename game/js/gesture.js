// Webcam body tracking (MediaPipe Pose Landmarker) -> fighting-game inputs.
//
// GestureDetector is pure logic (landmarks in, events out) so it can be tested
// without a camera. Tracker owns the camera, the model and the preview view.

import { LandmarkSmoother } from './skel.js';

const MP_VERSION = '0.10.14';
const MP_BUNDLE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/vision_bundle.mjs`;
const MP_WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`;
const MODELS = {
  lite: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
  full: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
};

// Landmark indices
export const L = { nose: 0, lSh: 11, rSh: 12, lEl: 13, rEl: 14, lWr: 15, rWr: 16, lHip: 23, rHip: 24, lKn: 25, rKn: 26, lAn: 27, rAn: 28 };
export const BONES = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28]];

const SENS = { Low: 1.3, Medium: 1, High: 0.78 };
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: ((a.z || 0) + (b.z || 0)) / 2 });

export class GestureDetector {
  constructor(sensitivity = 'Medium') {
    this.setSensitivity(sensitivity);
    this.reset();
  }
  setSensitivity(s) { this.k = SENS[s] || 1; }
  reset() {
    this.hist = []; // [{t, p}]  p = processed points
    this.base = null; // {y, x, knee: [l, r]}
    this.calibrated = false;
    this.stillSince = null;
    this.cool = {};
    this.held = { block: false, crouch: false, left: false, right: false, forward: false, run: false };
    this.steps = []; this.stepArmed = [true, true];
    this.togetherSince = null; this.specialArmed = true;
    this.kneeArmed = [true, true];
    this.last = null;
  }

  /**
   * @param {Array<{x,y,z,visibility}>} lm 33 landmarks, normalized image coords
   * @param {number} t timestamp ms
   * @param {number} aspect video width / height
   * @returns {{events:string[], held:object, visible:boolean, calibrated:boolean, info:string}}
   */
  process(lm, t, aspect = 16 / 9) {
    const out = { events: [], held: this.held, visible: false, calibrated: this.calibrated, info: '' };
    if (!lm || lm.length < 29) { this.releaseHeld(); out.info = 'No body detected'; return out; }
    const vis = (i) => (lm[i].visibility ?? 1) > 0.5 && lm[i].x > -0.02 && lm[i].x < 1.02 && lm[i].y > -0.02 && lm[i].y < 0.99;
    // Mirror horizontally (player sees themselves like a mirror) and make units isotropic.
    const P = (i) => ({ x: (1 - lm[i].x) * aspect, y: lm[i].y, z: (lm[i].z || 0) * aspect, v: vis(i) });
    const p = {};
    for (const [k, i] of Object.entries(L)) p[k] = P(i);

    if (!(p.lSh.v && p.rSh.v)) { this.releaseHeld(); out.info = 'Step back so your shoulders are visible'; return out; }
    out.visible = true;
    const S = Math.max(0.02, dist(p.lSh, p.rSh)); // shoulder width = unit
    const sh = mid(p.lSh, p.rSh);
    const hipsVisible = p.lHip.v && p.rHip.v;
    const hip = hipsVisible ? mid(p.lHip, p.rHip) : { x: sh.x, y: sh.y + 1.35 * S, z: sh.z };
    const frame = { t, S, sh, hip, p };

    this.hist.push(frame);
    while (this.hist.length && t - this.hist[0].t > 400) this.hist.shift();
    const prev = this.ago(t, 110);

    // ---- Calibration (auto, once the player stands still in a neutral pose)
    const armsDown = p.lWr.y > sh.y + 0.3 * S && p.rWr.y > sh.y + 0.3 * S;
    const still = prev && Math.abs(sh.y - prev.sh.y) / S < 0.06 && Math.abs(sh.x - prev.sh.x) / S < 0.06;
    if (!this.calibrated) {
      if (armsDown && still) {
        this.stillSince ??= t;
        if (t - this.stillSince > 900) this.calibrate(frame);
      } else this.stillSince = null;
      out.info = armsDown ? 'Hold still to calibrate…' : 'Lower your arms and stand still to calibrate';
      out.calibrated = this.calibrated;
      if (!this.calibrated) return out;
    }
    out.calibrated = true;
    const k = this.k;
    const b = this.base;

    // Slow baseline drift correction while neutral (player moving nearer/further)
    const neutral = !this.held.crouch && !this.held.block && armsDown && still;
    if (neutral) { b.y += (sh.y - b.y) * 0.02; b.S += (S - b.S) * 0.02; }

    // ---- Movement: lean / step left-right relative to calibrated centre
    const dx = (sh.x * 0.5 + hip.x * 0.5 - b.x) / S;
    const on = 0.5 * k, off = 0.3 * k;
    this.held.right = this.held.right ? dx > off : dx > on;
    this.held.left = this.held.left ? dx < -off : dx < -on;
    // ---- Step toward / away from the camera = walk forward / back (body looks bigger / smaller)
    // Body size vs. the calibrated spot: torso length (shoulders→hips) barely changes when you turn,
    // so it's the main signal; shoulder width is the fallback when hips are out of view.
    const torso = hipsVisible ? Math.hypot(sh.x - hip.x, sh.y - hip.y) : 0;
    const raw = torso && b.T0 ? (torso / b.T0) * 0.7 + (S / b.S0) * 0.3 : S / (b.S0 || b.S);
    this.depthS = this.depthS ? this.depthS + (raw - this.depthS) * 0.35 : raw;
    const depth = this.depthS;
    this.held.near = this.held.near ? depth > 1.04 : depth > 1.08;
    this.held.back = this.held.back ? depth < 0.96 : depth < 0.92;
    this.pos = { x: dx, depth };

    // ---- Crouch (held) / Jump (event) from shoulder height vs baseline
    const dy = (sh.y - b.y) / S; // + = lower than baseline
    this.held.crouch = this.held.crouch ? dy > 0.42 * k : dy > 0.62 * k;
    if (prev) {
      const vy = ((prev.sh.y - sh.y) / S) / ((t - prev.t) / 1000); // + = moving up
      if (vy > 2.4 / k && dy < -0.22 * k && this.ready('jump', t, 650)) this.fire(out, 'jump', t);
    }

    // ---- Block (held): both fists up in front of the face
    const wristsUp = p.lWr.y < sh.y + 0.05 * S && p.rWr.y < sh.y + 0.05 * S;
    const wristsClose = dist(p.lWr, p.rWr) < 1.0 * S;
    const nearFace = Math.abs((p.lWr.x + p.rWr.x) / 2 - p.nose.x) < 0.8 * S;
    this.held.block = p.lWr.v && p.rWr.v && wristsUp && wristsClose && nearFace;

    // ---- Special: palms together at chest height, held briefly
    const handsDist = dist(p.lWr, p.rWr) / S;
    const chest = (p.lWr.y + p.rWr.y) / 2;
    const atChest = chest > sh.y + 0.05 * S && chest < hip.y + 0.1 * S;
    if (p.lWr.v && p.rWr.v && handsDist < 0.5 && atChest && !this.held.block) {
      this.togetherSince ??= t;
      if (this.specialArmed && t - this.togetherSince > 160 * k && this.ready('special', t, 900)) {
        this.fire(out, 'special', t); this.specialArmed = false;
      }
    } else {
      this.togetherSince = null;
      if (handsDist > 0.9) this.specialArmed = true;
    }

    // ---- Punch: a fast wrist moving away from its shoulder (sideways or toward camera)
    if (prev && !this.held.block && this.togetherSince === null) {
      const dt = (t - prev.t) / 1000;
      const cand = [], soft = [];
      for (const [w, s] of [['lWr', 'lSh'], ['rWr', 'rSh']]) {
        if (!p[w].v) continue;
        const ext = this.ext(p[w], p[s], S), extPrev = this.ext(prev.p[w], prev.p[s], prev.S);
        const speed = Math.hypot(p[w].x - prev.p[w].x, p[w].y - prev.p[w].y, 0.5 * (p[w].z - prev.p[w].z)) / S / dt;
        const extending = (ext - extPrev) / dt;
        const height = p[w].y > p.nose.y - 0.6 * S && p[w].y < hip.y - 0.1 * S;
        const down = (p[w].y - prev.p[w].y) / S / dt; // + = moving down (arms dropping back to rest)
        if (height && speed > 5.2 * k && extending > 2.2 * k && ext > 0.95 && down < speed * 0.45) cand.push(w);
        else if (height && speed > 3.2 * k && extending > 1.2 * k && down < speed * 0.5) soft.push(w);
      }
      // both fists thrown together (and not palms joined for a special) = double punch
      if (cand.length && cand.length + soft.length === 2 && handsDist > 0.55) {
        if (this.ready('double', t, 450) && this.ready('punch', t, 200)) { this.fire(out, 'double', t); this.cool.punch = t; }
      } else if (cand.length === 1) {
        if (this.ready('punch', t, 300) && this.ready('double', t, 250)) this.fire(out, 'punch', t);
      }
    }

    // ---- Kick: a knee lifted toward hip height (or a foot raised high)
    for (const [i, kn, an] of [[0, 'lKn', 'lAn'], [1, 'rKn', 'rAn']]) {
      if (!p[kn].v || !hipsVisible) continue;
      const rel = (p[kn].y - hip.y) / S; // standing ~1.1-1.5
      const baseRel = b.knee[i] ?? 1.3;
      const footUp = p[an].v && b.ankle[i] != null && (b.ankle[i] - (p[an].y - hip.y) / S) > 0.9 * k;
      const thr = this.held.forward ? Math.min(1 - 0.42 * k, 0.5) : 1 - 0.42 * k; // while marching, a kick needs a real knee lift
      const lifted = rel < baseRel * thr || (footUp && !this.held.forward);
      if (lifted && this.kneeArmed[i]) {
        this.kneeArmed[i] = false;
        if (this.ready('kick', t, 450)) this.fire(out, 'kick', t);
      } else if (!lifted && rel > baseRel * 0.8) this.kneeArmed[i] = true;
      // marching / jogging in place: smaller alternating knee lifts
      const step = rel < baseRel * 0.88;
      if (step && this.stepArmed[i]) { this.stepArmed[i] = false; this.steps.push({ t, i }); }
      else if (rel > baseRel * 0.95) this.stepArmed[i] = true;
    }
    this.steps = this.steps.filter((st) => t - st.t < 1500);
    let alt = 0;
    for (let j = 1; j < this.steps.length; j++) if (this.steps[j].i !== this.steps[j - 1].i) alt++;
    const last = this.steps.length ? t - this.steps[this.steps.length - 1].t : 1e9;
    const rate = alt / 1.5; // alternating steps per second
    const marching = alt >= 2 && last < 700;
    this.held.run = marching && rate >= 2.4;
    this.held.forward = marching || (this.held.near && !this.held.back);

    out.info = this.describe();
    return out;
  }

  ext(w, s, S) { return Math.hypot(w.x - s.x, w.y - s.y, 0.5 * ((w.z || 0) - (s.z || 0))) / S; }

  calibrate(f) {
    const { p, S, sh, hip } = f;
    this.base = {
      x: sh.x * 0.5 + hip.x * 0.5, y: sh.y, S, S0: S, T0: p.lHip.v && p.rHip.v ? Math.hypot(sh.x - hip.x, sh.y - hip.y) : 0,
      knee: [p.lKn.v ? (p.lKn.y - hip.y) / S : null, p.rKn.v ? (p.rKn.y - hip.y) / S : null],
      ankle: [p.lAn.v ? (p.lAn.y - hip.y) / S : null, p.rAn.v ? (p.rAn.y - hip.y) / S : null],
    };
    this.calibrated = true;
  }

  recalibrate() { this.calibrated = false; this.base = null; this.stillSince = null; this.depthS = 0; this.releaseHeld(); }

  ago(t, ms) {
    for (let i = this.hist.length - 1; i >= 0; i--) if (t - this.hist[i].t >= ms) return this.hist[i];
    return this.hist.length > 1 ? this.hist[0] : null;
  }
  ready(name, t, ms) { return !(this.cool[name] > t - ms); }
  fire(out, name, t) { this.cool[name] = t; out.events.push(name); }
  releaseHeld() { for (const k of Object.keys(this.held)) this.held[k] = false; this.togetherSince = null; this.steps = []; }
  describe() {
    const h = this.held;
    return h.block ? 'Blocking' : h.crouch ? 'Crouching' : h.run ? 'Running' : h.forward ? 'Walking' : h.left ? 'Moving left' : h.right ? 'Moving right' : 'Ready';
  }
}

// ---------------------------------------------------------------------------

export class Tracker {
  constructor() {
    this.status = 'off'; // off | camera | loading | ready | error
    this.error = '';
    this.detector = new GestureDetector();
    this.listeners = new Set();
    this.controller = null;
    this.landmarks = null;
    this.mirror = true;
    this.showSkeleton = true;
    this.lastGesture = null;
    this.smoother = new LandmarkSmoother(0.7);
    this.world = null; this.worldT = 0;

    this.view = document.createElement('div');
    this.view.className = 'cam-view';
    // The <video> never leaves the document: browsers pause a video that is detached
    // (e.g. while the VS screen is shown), which froze tracking mid-fight. Screens show a canvas copy.
    this.video = document.createElement('video');
    this.video.autoplay = true; this.video.muted = true; this.video.playsInline = true;
    this.video.setAttribute('aria-hidden', 'true');
    this.video.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0.01;pointer-events:none;z-index:-1';
    document.body.append(this.video);
    this.video.addEventListener('pause', () => this.resumeVideo());
    this.overlay = document.createElement('canvas');
    this.label = document.createElement('div');
    this.label.className = 'cam-label';
    this.view.append(this.overlay, this.label);
    this.lastFrameT = 0;
  }

  resumeVideo() {
    if (!this.stream) return;
    if (!this.video.isConnected) document.body.append(this.video);
    if (this.video.paused) this.video.play().catch(() => {});
  }

  /** Copy the current camera frame into the on-screen canvas. */
  paintFrame() {
    const c = this.overlay, v = this.video;
    const w = v.videoWidth || 640, h = v.videoHeight || 480;
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const g = c.getContext('2d');
    if (v.readyState >= 2) g.drawImage(v, 0, 0, w, h); else g.clearRect(0, 0, w, h);
    return g;
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(ev) { for (const fn of this.listeners) fn(ev); }
  setStatus(s, error = '') { this.status = s; this.error = error; this.emit({ type: 'status', status: s, error }); }

  configure({ mirror, sensitivity, showSkeleton }) {
    if (mirror != null) this.mirror = mirror;
    if (sensitivity) this.detector.setSensitivity(sensitivity);
    if (showSkeleton != null) this.showSkeleton = showSkeleton;
    this.view.classList.toggle('mirrored', this.mirror);
  }

  get active() { return this.status === 'ready'; }

  async start(quality = 'lite') {
    if (this.status === 'ready' || this.status === 'loading' || this.status === 'camera') return;
    if (!navigator.mediaDevices?.getUserMedia) return this.setStatus('error', 'This browser does not support camera access.');
    this.setStatus('camera');
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }, audio: false });
    } catch (e) {
      const embedded = window.top !== window.self;
      const safariFile = location.protocol === 'file:' && /Safari/.test(navigator.userAgent) && !/Chrome|Chromium|Edg/.test(navigator.userAgent);
      if (safariFile) return this.setStatus('error', 'Safari blocks the camera for files opened from your computer. Right-click Gesture Kombat.html → Open With → Google Chrome (or Microsoft Edge).');
      const msg = embedded || e.name === 'NotAllowedError' ? (embedded
          ? 'This hosted page isn’t allowed to use your camera. Gestures work when you run Gesture Kombat from your own computer or a regular web host. Keyboard and touch controls work here.'
          : 'Camera permission was blocked. Allow camera access for this site in your browser settings, then retry.')
        : e.name === 'NotFoundError' ? 'No camera found. Connect a webcam and retry.'
        : 'Camera unavailable: ' + (e.message || e.name);
      return this.setStatus('error', msg);
    }
    this.video.srcObject = this.stream;
    try { await this.video.play(); } catch { /* autoplay will resume */ }
    this.setStatus('loading');
    const preview = () => { if (this.status === 'loading') { this.paintFrame(); requestAnimationFrame(preview); } };
    preview();
    // Prefer a background worker so tracking never competes with the fight's rendering.
    let engine = null;
    if (this.worker && this.quality === quality) engine = 'worker';
    else if (this.landmarker && this.quality === quality) engine = 'main';
    if (!engine && typeof Worker !== 'undefined' && typeof createImageBitmap === 'function') engine = (await this.startWorker(quality)) ? 'worker' : null;
    if (!engine) {
      try {
        const { PoseLandmarker, FilesetResolver } = await import(/* @vite-ignore */ MP_BUNDLE);
        const files = await FilesetResolver.forVisionTasks(MP_WASM);
        const make = (delegate) => PoseLandmarker.createFromOptions(files, {
          baseOptions: { modelAssetPath: MODELS[quality] || MODELS.lite, delegate },
          runningMode: 'VIDEO', numPoses: 1,
          minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5,
        });
        try { this.landmarker = await make('GPU'); } catch { this.landmarker = await make('CPU'); }
        this.quality = quality; engine = 'main';
      } catch (e) {
        console.warn('Pose model failed to load', e);
        this.stopCamera();
        return this.setStatus('error', 'Could not load the body-tracking model (network blocked or offline). Keyboard and touch controls still work.');
      }
    }
    if (!this.stream) return; // stopped while loading
    this.engine = engine;
    this.detector.reset();
    this.setStatus('ready');
    this.loop();
  }

  /** Spin up the pose model inside a Web Worker. Resolves true when ready, false to fall back. */
  startWorker(quality) {
    const src = `
      self.exports = {}; self.module = { exports: self.exports };
      let lm = null;
      self.onmessage = async (e) => {
        const d = e.data;
        if (d.type === 'init') {
          try {
            importScripts(d.bundle);
            const api = (self.module && self.module.exports && self.module.exports.PoseLandmarker) ? self.module.exports : self.exports;
            const files = await api.FilesetResolver.forVisionTasks(d.wasm);
            const make = (delegate) => api.PoseLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: d.model, delegate }, runningMode: 'VIDEO', numPoses: 1, minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5 });
            try { lm = await make('GPU'); } catch (err) { lm = await make('CPU'); }
            postMessage({ type: 'ready' });
          } catch (err) { postMessage({ type: 'error', message: String(err && err.message || err) }); }
        } else if (d.type === 'frame') {
          const t0 = performance.now(); let res = null;
          try { res = lm.detectForVideo(d.bitmap, d.ts); } catch (err) { postMessage({ type: 'frameError', message: String(err) }); }
          try { d.bitmap.close(); } catch (err) {}
          const pick = (a) => a ? a.map((p) => ({ x: p.x, y: p.y, z: p.z, visibility: p.visibility })) : null;
          postMessage({ type: 'result', ts: d.ts, lm: pick(res && res.landmarks && res.landmarks[0]), wl: pick(res && res.worldLandmarks && res.worldLandmarks[0]), ms: performance.now() - t0 });
        }
      };`;
    return new Promise((resolve) => {
      let w;
      try { w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' }))); } catch { return resolve(false); }
      const fail = (why) => { console.warn('Tracking worker unavailable, using main thread:', why); try { w.terminate(); } catch { /* ignore */ } resolve(false); };
      const timer = setTimeout(() => fail('timeout'), 25000);
      w.onerror = (e) => { clearTimeout(timer); fail(e.message || 'error'); };
      w.onmessage = (e) => {
        if (e.data.type === 'ready') { clearTimeout(timer); this.worker = w; this.quality = quality; w.onmessage = (ev) => this.onWorker(ev.data); w.onerror = () => this.workerFailed('crashed'); resolve(true); }
        else if (e.data.type === 'error') { clearTimeout(timer); fail(e.data.message); }
      };
      w.postMessage({ type: 'init', bundle: MP_BUNDLE.replace('.mjs', '.cjs'), wasm: MP_WASM, model: MODELS[quality] || MODELS.lite });
    });
  }

  onWorker(d) {
    if (d.type === 'result') { this.busy = false; this.workerErrors = 0; this.handle(d.lm, d.wl, performance.now(), d.ms); }
    else if (d.type === 'frameError') { this.busy = false; if (++this.workerErrors > 5) this.workerFailed(d.message); }
  }

  /** Worker broke mid-session: drop to the main-thread engine without bothering the player. */
  async workerFailed(why) {
    console.warn('Tracking worker failed:', why);
    try { this.worker?.terminate(); } catch { /* ignore */ }
    this.worker = null; this.busy = false;
    if (this.status !== 'ready') return;
    try {
      const { PoseLandmarker, FilesetResolver } = await import(/* @vite-ignore */ MP_BUNDLE);
      const files = await FilesetResolver.forVisionTasks(MP_WASM);
      this.landmarker = await PoseLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: MODELS[this.quality] || MODELS.lite, delegate: 'GPU' }, runningMode: 'VIDEO', numPoses: 1 });
      this.engine = 'main';
    } catch (e) { this.setStatus('error', 'Body tracking stopped unexpectedly. Retry the camera.'); }
  }

  loop() {
    cancelAnimationFrame(this.raf);
    const v = this.video;
    let lastTime = -1;
    this.stats = { fps: 0, ms: 0, frames: 0, t0: performance.now(), parts: '' };
    this.busy = false; this.workerErrors = 0;
    // Poll every display frame: a new camera frame is sent for tracking as soon as the previous one is done.
    const tick = () => {
      if (this.status !== 'ready') return;
      this.raf = requestAnimationFrame(tick);
      if (v.readyState < 2 || v.currentTime === lastTime || this.busy) return;
      lastTime = v.currentTime;
      const now = performance.now();
      if (this.engine === 'worker' && this.worker) {
        this.busy = true; this.sentT = now;
        createImageBitmap(v).then((bitmap) => {
          if (!this.worker) { bitmap.close(); this.busy = false; return; }
          this.worker.postMessage({ type: 'frame', bitmap, ts: now }, [bitmap]);
        }).catch(() => { this.busy = false; });
        return;
      }
      if (!this.landmarker) return;
      let res;
      try { res = this.landmarker.detectForVideo(v, now); } catch (e) { console.warn(e); return; }
      this.handle(res?.landmarks?.[0] || null, res?.worldLandmarks?.[0] || null, now, performance.now() - now);
    };
    this.raf = requestAnimationFrame(tick);
    clearInterval(this.watch);
    this.watch = setInterval(() => {
      if (this.status !== 'ready') return clearInterval(this.watch);
      this.resumeVideo();
      if (this.busy && performance.now() - this.sentT > 1500) this.busy = false; // lost frame: keep going
      if (performance.now() - this.lastFrameT > 600) this.controller?.clear('gesture'); // never leave crouch/block/walk stuck
    }, 300);
  }

  /** Shared result path for both engines. */
  handle(lm, wl, now, ms) {
    const v = this.video;
    this.lastFrameT = now;
    const st = this.stats;
    st.ms = st.ms * 0.85 + ms * 0.15;
    st.frames++;
    if (now - st.t0 > 1000) { st.fps = Math.round((st.frames * 1000) / (now - st.t0)); st.frames = 0; st.t0 = now; }
    this.landmarks = lm;
    if (wl && lm) {
      // World points can report visibility 0; use the image point's confidence + whether it is in frame
      const w2 = new Array(wl.length);
      for (let i = 0; i < wl.length; i++) {
        const p = lm[i], inFrame = p.x > -0.02 && p.x < 1.02 && p.y > -0.02 && p.y < 0.99;
        w2[i] = { x: wl[i].x, y: wl[i].y, z: wl[i].z, visibility: inFrame ? (p.visibility ?? 1) : 0 };
      }
      this.world = this.smoother.push(w2); this.worldT = now;
    }
    const aspect = v.videoWidth && v.videoHeight ? v.videoWidth / v.videoHeight : 4 / 3;
    const r = this.detector.process(lm, now, aspect);
    if (lm) {
      const seen = (ids) => ids.every((i) => (lm[i].visibility ?? 1) > 0.5 && lm[i].x > -0.02 && lm[i].x < 1.02 && lm[i].y > -0.02 && lm[i].y < 0.99);
      const arms = seen([13, 15]) || seen([14, 16]), legs = seen([25, 26]);
      st.parts = [seen([0]) && 'head', arms && 'arms', seen([23, 24]) && 'hips', legs && 'legs'].filter(Boolean).join(' · ');
      st.upperOnly = !legs;
      if (r.calibrated && r.visible && !legs && r.info === 'Ready') r.info = 'Upper body only: arms & head copy you. Step back for kicks/walking';
    } else st.parts = '';
    st.engine = this.engine;
    r.stats = st;
    this.apply(r);
    this.draw(lm, r);
    this.emit({ type: 'frame', result: r });
  }

  apply(r) {
    for (const e of r.events) {
      this.lastGesture = { name: e, t: performance.now() };
      this.controller?.press(e, 'gesture');
      this.emit({ type: 'gesture', name: e });
    }
    if (this.controller) for (const [k, v] of Object.entries(r.held)) this.controller.setHeld('gesture', k, v);
  }

  /** Latest smoothed 3D body pose, for driving a 3D fighter. */
  motion() { return this.world ? { lm: this.world, t: this.worldT } : null; }

  attach(ctrl) {
    if (this.controller && this.controller !== ctrl) this.controller.clear('gesture');
    this.controller = ctrl;
  }
  detach() { this.controller?.clear('gesture'); this.controller = null; }

  draw(lm, r) {
    const g = this.paintFrame();
    const w = this.overlay.width, h = this.overlay.height;
    const recent = this.lastGesture && performance.now() - this.lastGesture.t < 700;
    this.label.textContent = recent ? this.lastGesture.name.toUpperCase() + '!' : r.info;
    this.label.dataset.stats = this.stats?.fps ? `${this.stats.fps} fps · ${Math.round(this.stats.ms)} ms${this.stats.parts ? ' · ' + this.stats.parts : ''}` : '';
    this.label.classList.toggle('hit', !!recent);
    if (!lm || !this.showSkeleton) return;
    g.lineCap = 'round';
    g.lineWidth = Math.max(3, w / 140);
    g.strokeStyle = r.calibrated ? 'rgba(255,120,60,0.95)' : 'rgba(255,255,255,0.7)';
    for (const [a, b] of BONES) {
      if ((lm[a].visibility ?? 1) < 0.5 || (lm[b].visibility ?? 1) < 0.5 || lm[a].y > 0.99 || lm[b].y > 0.99) continue;
      g.beginPath(); g.moveTo(lm[a].x * w, lm[a].y * h); g.lineTo(lm[b].x * w, lm[b].y * h); g.stroke();
    }
    g.fillStyle = '#ffd3a8';
    for (const i of [0, 15, 16, 25, 26, 27, 28]) {
      if ((lm[i].visibility ?? 1) < 0.5) continue;
      g.beginPath(); g.arc(lm[i].x * w, lm[i].y * h, w / 90, 0, Math.PI * 2); g.fill();
    }
  }

  stopCamera() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.srcObject = null;
  }

  stop() {
    cancelAnimationFrame(this.raf);
    clearInterval(this.watch);
    this.stopCamera();
    this.detach();
    this.landmarks = null;
    if (this.status !== 'error') this.setStatus('off');
  }
}

export const tracker = new Tracker();
