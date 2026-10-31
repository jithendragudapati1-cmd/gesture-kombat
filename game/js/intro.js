// Cinematic loading intro: fire and lightning streams pour into the elemental sigil while it forges,
// then the title detonates in and the player taps to enter. Fully code-drawn (canvas).
import { glowSprite } from './fx.js';

const rand = (a, b) => a + Math.random() * (b - a);
let smokeImg = null;
function smokeSprite() { // soft dark cloud, no bright core
  if (smokeImg) return smokeImg;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(30,22,20,0.9)'); grd.addColorStop(0.5, 'rgba(24,16,14,0.45)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  return (smokeImg = c);
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (x) => 1 - Math.pow(1 - clamp(x, 0, 1), 3);
const back = (x) => { x = clamp(x, 0, 1); const c = 1.9; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
const FONT = '"Barlow Condensed", Impact, "Arial Narrow", sans-serif';
const ELEMENTS = ['#ff5a1a', '#37bfff', '#a5dc66', '#e7f7ff'];
const MSGS = ['IGNITING THE ARENA', 'FORGING FIGHTERS', 'AWAKENING ELEMENTS', 'SYNCING BODY TRACKER', 'READY FOR KOMBAT'];
const TIPS = [
  'Throw both fists at once for a DOUBLE PUNCH',
  'March in place to walk · jog in place to run',
  'Palms together at your chest unleashes your SPECIAL',
  'Raise both fists to your face to BLOCK',
  'Earth’s eruption glows green before it strikes — jump!',
  'Hit a stunned rival again to chain a COMBO',
];

export class Intro {
  constructor({ touch = false } = {}) {
    this.touch = touch;
    this.el = document.createElement('section');
    this.el.className = 'intro';
    this.el.innerHTML = `<canvas aria-hidden="true"></canvas>
      <p class="sr-only" aria-live="polite">Loading Gesture Kombat</p>
      <button type="button" class="intro-enter" aria-label="Enter the arena" disabled></button>`;
    document.body.append(this.el);
    this.c = this.el.querySelector('canvas');
    this.g = this.c.getContext('2d');
    this.btn = this.el.querySelector('.intro-enter');
    this.live = this.el.querySelector('.sr-only');
    this.target = 0; this.shown = 0;
    this.t = 0; this.phase = 'load'; this.pt = 0;
    this.parts = []; this.bolts = []; this.rings = [];
    this.flash = 0; this.shake = 0; this.white = 0;
    this.tip = Math.floor(Math.random() * TIPS.length);
    this.smoke = Array.from({ length: 4 }, () => ({ x: Math.random(), y: rand(0.4, 1), r: rand(0.22, 0.35), v: rand(-0.01, 0.015) }));
    this.started = performance.now();
    this.last = this.started;
    this.resize = this.resize.bind(this);
    addEventListener('resize', this.resize); this.resize();
    this.fontReady = document.fonts?.load(`italic 900 80px ${FONT}`).catch(() => {});
    this.frame = this.frame.bind(this);
    this.raf = requestAnimationFrame(this.frame);
  }

  resize() {
    const dpr = Math.min(this.lowQ ? 0.75 : 1, devicePixelRatio || 1);
    this.dpr = dpr; this.w = innerWidth; this.h = innerHeight;
    this.c.width = Math.round(this.w * dpr); this.c.height = Math.round(this.h * dpr);
  }

  /** Resolves once loading is visually complete (≥ minimum showtime). */
  async loaded(minMs = 3200) {
    while (performance.now() - this.started < minMs || this.shown < 0.995) await new Promise((r) => setTimeout(r, 50));
    await Promise.race([this.fontReady, new Promise((r) => setTimeout(r, 800))]);
  }

  /** Give the cinematic the fighter artwork (bakes a glow version of each). */
  setImages(images) {
    this.art = {};
    for (const [id, col] of [['fire', '#ff4a12'], ['lightning', '#2ab9ff'], ['earth', '#7fd23a'], ['wind', '#cfeeff']]) {
      const im = images[id]; if (!im) continue;
      const pad = 70, c = document.createElement('canvas');
      c.width = im.naturalWidth + pad * 2; c.height = im.naturalHeight + pad * 2;
      const g = c.getContext('2d');
      g.shadowColor = col; g.shadowBlur = 55;
      g.drawImage(im, pad, pad); g.drawImage(im, pad, pad);
      g.shadowBlur = 0; g.drawImage(im, pad, pad);
      this.art[id] = { c, pad, w: im.naturalWidth, h: im.naturalHeight, col };
    }
  }

  /** Loaded: wait for the click that unlocks sound and starts the cinematic. */
  gate(auto = false) {
    this.setPhase('gate');
    this.live.textContent = 'Loaded. Click or press any key to start.';
    return this.once(auto, 250);
  }

  /** Plays the opening cinematic; resolves after the title has been shown (any key skips the hold). */
  cinematic(onTitle) {
    this.onTitle = onTitle;
    this.setPhase('cine');
    this.cineFx = {};
    this.parts = this.parts.filter((p) => p.k === 'ember');
    return new Promise((resolve) => {
      const wait = () => {
        if (this.phase === 'await' && this.pt > 1.9) return resolve();
        requestAnimationFrame(wait);
      };
      this.skipTitle = () => { if (this.phase === 'await' || this.phase === 'burst') resolve(); };
      addEventListener('keydown', this.skipTitle, true);
      this.btn.addEventListener('click', this.skipTitle);
      wait();
    }).finally(() => { removeEventListener('keydown', this.skipTitle, true); this.btn.removeEventListener('click', this.skipTitle); });
  }

  once(auto, delay) {
    return new Promise((resolve) => {
      const go = (e) => {
        if (e?.type === 'keydown' && ['Tab', 'Shift', 'Alt', 'Meta', 'Control'].includes(e.key)) return;
        e?.preventDefault?.();
        removeEventListener('keydown', go, true);
        this.btn.removeEventListener('click', go);
        resolve();
      };
      setTimeout(() => {
        this.btn.disabled = false; this.btn.focus({ preventScroll: true });
        addEventListener('keydown', go, true);
        this.btn.addEventListener('click', go);
        if (auto) go();
      }, delay);
    });
  }

  /** White-out blast before the menu is shown. */
  blast() {
    this.setPhase('exit');
    this.shake = 26;
    for (let i = 0; i < 3; i++) this.rings.push({ r: this.R * (0.6 + i * 0.25), life: -i * 0.06, max: 0.7, w: 14 - i * 3, color: i % 2 ? '#9fdcff' : '#ffd36b' });
    this.explode(220, 1.6);
    return new Promise((r) => setTimeout(r, 430));
  }

  /** Fade the white flash away to reveal the menu underneath, then remove. */
  reveal() {
    this.setPhase('reveal');
    this.el.classList.add('revealing');
    setTimeout(() => this.destroy(), 900);
  }

  destroy() { cancelAnimationFrame(this.raf); removeEventListener('resize', this.resize); this.el.remove(); }

  setPhase(p) { this.phase = p; this.pt = 0; }

  /** Offscreen cache for static full-screen layers, rebuilt only when the size changes. */
  cached(key, w, h, paint) {
    this._cache ||= {};
    const sw = Math.max(1, Math.round(w / 2)), sh = Math.max(1, Math.round(h / 2)), id = `${sw}x${sh}`;
    const e = this._cache[key];
    if (e && e.id === id) return e.c;
    const c = document.createElement('canvas'); c.width = sw; c.height = sh;
    const g = c.getContext('2d'); paint(g, sw, sh);
    this._cache[key] = { id, c };
    return c;
  }

  burst() {
    this.flash = 1; this.shake = 20;
    for (let i = 0; i < 4; i++) this.rings.push({ r: this.R * 0.4, life: -i * 0.08, max: 0.9, w: 16 - i * 3, color: ELEMENTS[i] });
    this.explode(260, 1.3);
  }

  explode(n, power) {
    const { cx, cy } = this;
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), s = rand(200, 1100) * power;
      const col = i % 2 ? (Math.random() < 0.6 ? '#ff5a1a' : '#ffd36b') : (Math.random() < 0.6 ? '#37bfff' : '#e2f6ff');
      this.parts.push({ k: Math.random() < 0.5 ? 'spark' : 'glow', x: cx, y: cy, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0, max: rand(0.4, 1.2), size: rand(3, 14), color: col, drag: 2.2, grav: 200 });
    }
  }

  // ---------------------------------------------------------------- simulation
  frame(now) {
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    this.t += dt; this.pt += dt;
    this.slowAvg = (this.slowAvg ?? 0.016) * 0.95 + dt * 0.05;
    if (!this.lowQ && this.t > 1 && this.slowAvg > 0.026) { this.lowQ = true; this.resize(); }
    if (this.phase === 'burst' && this.pt > 0.9) this.setPhase('await');
    if (this.phase === 'cine') this.cineStep(dt);
    if (this.phase === 'cine' && this.pt >= 4.5) { this.setPhase('burst'); this.burst(); this.onTitle?.(); }
    this.shown += (Math.min(1, this.target) - this.shown) * Math.min(1, dt * 3.2);
    const minP = Math.min(1, (now - this.started) / 3200); // never faster than the cinematic
    this.disp = Math.min(this.shown, minP);
    this.flash = Math.max(0, this.flash - dt * 2.2);
    this.shake = Math.max(0, this.shake - dt * 40);
    if (this.phase === 'exit') this.white = Math.min(1, this.white + dt * 3);
    if (this.phase === 'reveal') this.white = Math.max(0, this.white - dt * 1.6);
    if (this.t % 3.2 < dt) this.tip = (this.tip + 1) % TIPS.length;
    this.spawn(dt);
    this.step(dt);
    this.draw();
  }

  spawn(dt) {
    const { w, h, cx, cy, R } = this;
    const loading = this.phase === 'load' || this.phase === 'gate';
    const rate = (this.phase === 'cine' ? 0 : this.phase === 'gate' ? 18 : loading ? 50 + this.disp * 60 : 14) * (this.lowQ ? 0.45 : 1);
    for (let side = 0; side < 2; side++) {
      let n = rate * dt; while (n > 0) {
        if (Math.random() < n) {
          const fire = side === 0;
          this.parts.push({ k: 'stream', fire, x: fire ? rand(-40, w * 0.08) : rand(w * 0.92, w + 40), y: cy + rand(-h * 0.42, h * 0.42),
            vx: fire ? rand(200, 420) : rand(-420, -200), vy: rand(-60, 60), life: 0, max: 4, size: rand(4, 11),
            tx: this.cx + rand(-0.45, 0.45) * (this.tw || R * 4), ty: this.cy + rand(-0.5, 0.6) * (this.fs || R),
            color: fire ? (Math.random() < 0.55 ? '#ff4a12' : '#ffb347') : (Math.random() < 0.55 ? '#2ab9ff' : '#cfefff'), swirl: rand(0.6, 1.4) * (fire ? 1 : -1) });
        }
        n -= 1;
      }
    }
    // lightning arcs from the right edge into the sigil
    if (this.phase !== 'cine' && Math.random() < dt * (loading ? 2.2 : 1.4)) this.bolt(w + 10, cy + rand(-h * 0.3, h * 0.3), cx + rand(0, 0.45) * (this.tw || R * 4), cy + rand(-0.4, 0.4) * (this.fs || R), '#8fe0ff');
    // fire tongues curling up from the bottom left
    if (Math.random() < dt * 30) this.parts.push({ k: 'glow', x: rand(0, w * 0.35), y: h + 10, vx: rand(-20, 40), vy: rand(-260, -120), life: 0, max: rand(0.8, 1.6), size: rand(10, 26), color: Math.random() < 0.5 ? '#ff4a12' : '#ff9a2a', drag: 0.3, grav: -30 });
    // rising embers everywhere
    if (Math.random() < dt * 22) this.parts.push({ k: 'ember', x: rand(0, w), y: h + 10, vx: rand(-20, 20), vy: rand(-140, -50), life: 0, max: rand(3, 6), size: rand(2, 5), color: Math.random() < 0.8 ? '#ff6a2a' : '#ffd36b', sway: rand(1, 3) });
    // await phase: orbiting energy around the sigil
    if (this.phase === 'await' && Math.random() < dt * 40) {
      const a = rand(0, Math.PI * 2);
      this.parts.push({ k: 'orbit', a, rr: R * rand(1.05, 1.5), spd: rand(1.2, 2.6) * (Math.random() < 0.5 ? 1 : -1), life: 0, max: rand(0.8, 1.6), size: rand(3, 8), color: ELEMENTS[Math.floor(Math.random() * 4)] });
    }
  }

  bolt(x0, y0, x1, y1, color) {
    const pts = [[x0, y0]], n = 14;
    for (let i = 1; i < n; i++) pts.push([x0 + (x1 - x0) * (i / n) + rand(-30, 30), y0 + (y1 - y0) * (i / n) + rand(-26, 26)]);
    pts.push([x1, y1]);
    this.bolts.push({ pts, life: 0, max: 0.16, color });
  }

  step(dt) {
    const { cx, cy, R } = this;
    for (const p of this.parts) {
      p.life += dt;
      if (p.k === 'stream') {
        const dx = (p.tx ?? cx) - p.x, dy = (p.ty ?? cy) - p.y, d = Math.hypot(dx, dy) || 1;
        const pull = 900 + 600 * this.disp;
        p.vx += ((dx / d) * pull - (dy / d) * pull * 0.55 * p.swirl) * dt;
        p.vy += ((dy / d) * pull + (dx / d) * pull * 0.55 * p.swirl) * dt;
        const sp = Math.hypot(p.vx, p.vy), max = 900;
        if (sp > max) { p.vx *= max / sp; p.vy *= max / sp; }
        p.px = p.x; p.py = p.y;
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (d < R * 0.25) { p.life = p.max; if (Math.random() < 0.25) this.parts.push({ k: 'glow', x: p.x, y: p.y, vx: 0, vy: 0, life: 0, max: 0.25, size: 26, color: p.color }); }
      } else if (p.k === 'orbit') {
        p.a += p.spd * dt;
        p.x = cx + Math.cos(p.a) * p.rr; p.y = cy + Math.sin(p.a) * p.rr * 0.92;
      } else {
        if (p.drag) { const k = Math.max(0, 1 - p.drag * dt); p.vx *= k; p.vy *= k; }
        p.vy += (p.grav || 0) * dt;
        p.x += (p.vx + (p.sway ? Math.sin(p.life * p.sway) * 25 : 0)) * dt; p.y += p.vy * dt;
      }
    }
    this.parts = this.parts.filter((p) => p.life < p.max && p.y > -60);
    const cap = this.lowQ ? 380 : 800;
    if (this.parts.length > cap) this.parts.splice(0, this.parts.length - cap);
    for (const b of this.bolts) b.life += dt;
    this.bolts = this.bolts.filter((b) => b.life < b.max);
    for (const r of this.rings) r.life += dt;
    this.rings = this.rings.filter((r) => r.life < r.max);
  }

  // ---------------------------------------------------------------- cinematic
  cineStep(dt) {
    const T = this.pt, f = this.cineFx, { w, h } = this;
    const at = (key, time, fn) => { if (T >= time && !f[key]) { f[key] = 1; fn(); } };
    const burstAt = (x, y, cols, n, power) => {
      for (let i = 0; i < n; i++) {
        const a = rand(0, Math.PI * 2), sp = rand(200, 1000) * power;
        this.parts.push({ k: Math.random() < 0.5 ? 'spark' : 'glow', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: rand(0.3, 0.9), size: rand(3, 12), color: cols[i % cols.length], drag: 2.5, grav: 300 });
      }
    };
    const shot = (key, time, x, cols) => at(key, time, () => { this.flash = 1; this.shake = 18; burstAt(x, h * 0.55, cols, 80, 1.1); this.rings.push({ r: 40, life: 0, max: 0.6, w: 10, color: cols[0], cx: x, cy: h * 0.55 }); });
    // (bursts kept tight so slower machines stay smooth)
    shot('fire', 0.9, w * 0.36, ['#ff4a12', '#ffb347', '#ffd36b']);
    shot('lightning', 1.7, w * 0.64, ['#2ab9ff', '#cfefff', '#ffffff']);
    shot('earth', 2.5, w * 0.5, ['#7fd23a', '#c6f27a', '#8a7a5a']);
    shot('wind', 2.9, w * 0.5, ['#e7f7ff', '#9fd9ff', '#ffffff']);
    at('clash', 4.2, () => {
      this.flash = 1.4; this.shake = 34;
      this.cx = w / 2;
      for (let i = 0; i < 5; i++) this.rings.push({ r: 30, life: -i * 0.05, max: 0.9, w: 18 - i * 3, color: i % 2 ? '#37bfff' : '#ff6a2a' });
      burstAt(w / 2, this.cy, ['#ff5a1a', '#ffd36b', '#37bfff', '#e2f6ff', '#ffffff'], 220, 1.7);
      this.cracks = Array.from({ length: 14 }, (_, i) => {
        let a = (i / 14) * Math.PI * 2 + rand(0, 0.4), x = w / 2, y = this.cy; const pts = [[x, y]];
        for (let k = 0; k < 7; k++) { a += rand(-0.5, 0.5); const l = rand(30, 110); x += Math.cos(a) * l; y += Math.sin(a) * l; pts.push([x, y]); }
        return pts;
      });
    });
    // element weather per shot
    if (T > 0.9 && T < 1.7 && Math.random() < dt * 60) this.parts.push({ k: 'glow', x: rand(0, w * 0.6), y: h + 10, vx: rand(-30, 60), vy: rand(-420, -200), life: 0, max: rand(0.6, 1.2), size: rand(10, 28), color: Math.random() < 0.5 ? '#ff4a12' : '#ffb347', drag: 0.4 });
    if (T > 1.7 && T < 2.5 && Math.random() < dt * 9) this.bolt(rand(w * 0.4, w), -10, rand(w * 0.45, w), rand(h * 0.3, h * 0.9), Math.random() < 0.5 ? '#8fe0ff' : '#ffffff');
    if (T > 2.5 && T < 2.9 && Math.random() < dt * 50) this.parts.push({ k: 'rock', x: rand(w * 0.2, w * 0.8), y: h * 0.9, vx: rand(-300, 300), vy: rand(-900, -400), life: 0, max: 1, size: rand(5, 14), color: '#6f6047', grav: 1800 });
    if (T > 2.9 && T < 3.3 && Math.random() < dt * 70) this.parts.push({ k: 'spark', x: -20, y: rand(0, h), vx: rand(1400, 2200), vy: rand(-80, 80), life: 0, max: 0.6, size: 2, color: '#e7f7ff' });
  }

  drawCine(g) {
    const T = this.pt, { w, h, t } = this;
    const A = this.art || {};
    const fighter = (id, x, scale, flip, alpha = 1, ghosts = 0, gdx = 0) => {
      const a = A[id]; if (!a) return;
      const hh = h * 1.02 * scale, k = hh / a.h, ww = a.w * k, pad = a.pad * k;
      const y = h * 1.04 - hh;
      g.save();
      if (ghosts) { g.globalCompositeOperation = 'lighter'; for (let i = ghosts; i > 0; i--) { g.globalAlpha = 0.18 * alpha; draw(x - gdx * i); } g.globalCompositeOperation = 'source-over'; }
      g.globalAlpha = alpha; draw(x);
      g.restore();
      function draw(cx) {
        g.save(); g.translate(cx, 0); if (flip) g.scale(-1, 1);
        g.drawImage(a.c, -ww / 2 - pad, y - pad, ww + pad * 2, hh + pad * 2);
        g.restore();
      }
    };
    const wash = (x, col, a = 0.8) => { const gr = g.createRadialGradient(x, h * 0.55, 0, x, h * 0.55, Math.max(w, h) * 0.75); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.globalAlpha = a; g.fillStyle = gr; g.fillRect(0, 0, w, h); g.globalAlpha = 1; };
    const lines = (cx, cy, col, n, a) => {
      g.save(); g.globalCompositeOperation = 'lighter'; g.strokeStyle = col;
      for (let i = 0; i < n; i++) { const an = rand(0, Math.PI * 2), r0 = rand(80, 260), r1 = r0 + rand(300, 1100); g.globalAlpha = a * rand(0.3, 1); g.lineWidth = rand(1, 4); g.beginPath(); g.moveTo(cx + Math.cos(an) * r0, cy + Math.sin(an) * r0); g.lineTo(cx + Math.cos(an) * r1, cy + Math.sin(an) * r1); g.stroke(); }
      g.restore();
    };
    const stamp = (text, sub, x, t0, cols, align = 'center') => {
      const u = T - t0; if (u < 0.04) return;
      const k = clamp((u - 0.04) / 0.16, 0, 1), sc = 1 + (1 - back(k)) * 2.4;
      const fs = Math.min(h * 0.22, w * 0.16);
      g.save(); g.translate(x, h * 0.5); g.transform(1, 0, -0.18, 1, 0, 0); g.scale(sc, sc);
      g.globalAlpha = Math.min(1, k * 3);
      g.font = `italic 900 ${fs}px ${FONT}`; g.textAlign = align; g.textBaseline = 'middle';
      if (k < 1) { g.globalCompositeOperation = 'lighter'; g.fillStyle = 'rgba(255,0,60,.55)'; g.fillText(text, -10 * (1 - k), 0); g.fillStyle = 'rgba(0,200,255,.55)'; g.fillText(text, 10 * (1 - k), 0); g.globalCompositeOperation = 'source-over'; }
      g.lineWidth = fs * 0.07; g.strokeStyle = '#0a0202'; g.lineJoin = 'round'; g.strokeText(text, 0, 0);
      const gr = g.createLinearGradient(0, -fs * 0.5, 0, fs * 0.5); gr.addColorStop(0, cols[0]); gr.addColorStop(1, cols[1]);
      g.shadowColor = cols[1]; g.shadowBlur = 40; g.fillStyle = gr; g.fillText(text, 0, 0); g.shadowBlur = 0;
      g.font = `700 ${Math.max(13, fs * 0.13)}px Rajdhani, "Segoe UI", sans-serif`; if ('letterSpacing' in g) g.letterSpacing = `${Math.max(4, fs * 0.05)}px`;
      g.fillStyle = '#ffffff'; g.globalAlpha = clamp((u - 0.2) * 4, 0, 1); g.fillText(sub, 0, fs * 0.62);
      if ('letterSpacing' in g) g.letterSpacing = '0px';
      g.restore();
    };
    const enter = (t0, from, to) => { const u = clamp((T - t0) / 0.16, 0, 1); return from + (to - from) * ease(u) + (T - t0) * (to > from ? 18 : -18); };

    if (T < 0.9) { // darkness + heartbeat
      const beat = Math.max(0, Math.sin((T - 0.05) * Math.PI / 0.25)) * (T < 0.35 || (T > 0.55 && T < 0.85) ? 1 : 0);
      wash(w / 2, `rgba(120,14,6,${0.25 + beat * 0.35})`, 1);
      const msg = T < 0.45 ? 'FOUR ELEMENTS.' : 'ONE ARENA.';
      g.save(); g.globalAlpha = Math.random() < 0.12 ? 0.3 : 0.95; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `italic 800 ${Math.min(64, w * 0.08)}px ${FONT}`; if ('letterSpacing' in g) g.letterSpacing = '10px';
      g.fillStyle = '#e9e2dc'; g.shadowColor = '#ff2a0a'; g.shadowBlur = 30; g.fillText(msg, w / 2, h * 0.5);
      if ('letterSpacing' in g) g.letterSpacing = '0px'; g.restore();
    } else if (T < 1.7) { // FIRE
      wash(w * 0.36, 'rgba(200,50,10,0.9)'); lines(w * 0.36, h * 0.55, '#ff6a2a', 30, 0.35);
      fighter('fire', enter(0.9, -w * 0.3, w * 0.36), 1, false, 1, T < 1.1 ? 4 : 0, 60);
      stamp('FIRE', 'BALANCED · INFERNO ORB', w * 0.72, 0.9, ['#ffd36b', '#ff3a14']);
    } else if (T < 2.5) { // LIGHTNING
      wash(w * 0.64, 'rgba(20,110,220,0.9)'); lines(w * 0.64, h * 0.55, '#7fd6ff', 30, 0.35);
      fighter('lightning', enter(1.7, w * 1.3, w * 0.64), 1, true, 1, T < 1.9 ? 4 : 0, -60);
      stamp('LIGHTNING', 'FAST · STORM LANCE', w * 0.3, 1.7, ['#e2f6ff', '#1f9bff']);
    } else if (T < 2.9) { // EARTH (smash cut)
      wash(w / 2, 'rgba(70,140,30,0.85)'); lines(w / 2, h * 0.55, '#a5dc66', 24, 0.3);
      fighter('earth', w * 0.3, 1.05 + (T - 2.5) * 0.15, false);
      stamp('EARTH', 'DEFENSIVE · STONE ERUPTION', w * 0.7, 2.5, ['#e8f7c8', '#5ea22b']);
    } else if (T < 3.3) { // WIND
      wash(w / 2, 'rgba(160,200,230,0.7)'); lines(w / 2, h * 0.55, '#ffffff', 24, 0.3);
      fighter('wind', w * 0.7, 1.05 + (T - 2.9) * 0.15, true);
      stamp('WIND', 'AGILE · CYCLONE', w * 0.3, 2.9, ['#ffffff', '#9fd9ff']);
    } else if (T < 4.2) { // CLASH: split screen charge
      const u = (T - 3.3) / 0.9, e = u * u;
      g.save(); g.beginPath(); g.moveTo(0, 0); g.lineTo(w * 0.55, 0); g.lineTo(w * 0.45, h); g.lineTo(0, h); g.closePath(); g.clip();
      wash(w * 0.2, 'rgba(200,50,10,0.95)', 1); g.restore();
      g.save(); g.beginPath(); g.moveTo(w * 0.55, 0); g.lineTo(w, 0); g.lineTo(w, h); g.lineTo(w * 0.45, h); g.closePath(); g.clip();
      wash(w * 0.8, 'rgba(20,110,220,0.95)', 1); g.restore();
      lines(w / 2, this.cy, '#ffffff', 40 + Math.floor(u * 40), 0.25 + u * 0.4);
      const sc = 0.9 + e * 0.35;
      fighter('fire', -w * 0.15 + (w * 0.4) * e + w * 0.1, sc, false, 1, 3, 40 + u * 80);
      fighter('lightning', w * 1.15 - (w * 0.4) * e - w * 0.1, sc, true, 1, 3, -40 - u * 80);
      // energy gathering at the centre
      g.save(); g.globalCompositeOperation = 'lighter'; const r = 40 + u * 220; g.globalAlpha = 0.4 + u * 0.6;
      g.drawImage(glowSprite('#ffd36b'), w / 2 - r, this.cy - r, r * 2, r * 2); g.restore();
      // split seam
      g.save(); g.globalCompositeOperation = 'lighter'; g.strokeStyle = '#fff3e0'; g.lineWidth = 3 + u * 6; g.shadowColor = '#ffb347'; g.shadowBlur = 30;
      g.beginPath(); g.moveTo(w * 0.55, -10); g.lineTo(w * 0.45, h + 10); g.stroke(); g.restore();
    } else { // aftermath of the clash: glass cracks over white
      wash(w / 2, 'rgba(255,220,180,0.6)', 1);
    }
    if (this.cracks && T >= 4.2) {
      g.save(); g.globalAlpha = clamp(1 - (T - 4.2) / 0.9, 0, 1); g.strokeStyle = '#ffffff'; g.lineWidth = 2.5; g.shadowColor = '#9fdcff'; g.shadowBlur = 14;
      for (const c of this.cracks) { g.beginPath(); c.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); }
      g.restore();
    }
    // letterbox bars for a cinematic frame
    const bar = h * 0.07 * clamp(T * 4, 0, 1) * clamp((4.5 - T) * 4, 0, 1);
    g.fillStyle = '#000'; g.fillRect(0, 0, w, bar); g.fillRect(0, h - bar, w, bar);
  }

  // ---------------------------------------------------------------- rendering
  draw() {
    const g = this.g, { w, h, dpr } = this;
    this.cx = w / 2; this.cy = h * (w < h ? 0.4 : 0.43); this.R = Math.max(70, Math.min(w, h) * 0.17);
    const { cx, cy, R } = this;
    const sx = (Math.random() - 0.5) * this.shake, sy = (Math.random() - 0.5) * this.shake;
    g.setTransform(dpr, 0, 0, dpr, sx * dpr, sy * dpr);
    const titled = ['burst', 'await', 'exit', 'reveal'].includes(this.phase);
    const cine = this.phase === 'cine';
    const tb = this.phase === 'burst' ? this.pt : titled ? 9 : 0;

    // background
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 2.2);
    let grd;
    g.drawImage(this.cached('bg', w, h, (c, cw, ch) => {
      c.fillStyle = '#030406'; c.fillRect(0, 0, cw, ch);
      for (const [x, r, stops] of [[cw / 2, Math.max(cw, ch) * 0.75, [[0, 'rgba(70,16,6,0.85)'], [0.45, 'rgba(25,6,4,0.6)'], [1, 'rgba(0,0,0,0)']]], [cw * 0.95, cw * 0.55, [[0, 'rgba(10,60,110,0.55)'], [1, 'rgba(0,0,0,0)']]], [cw * 0.05, cw * 0.55, [[0, 'rgba(120,28,6,0.6)'], [1, 'rgba(0,0,0,0)']]]]) {
        const gr = c.createRadialGradient(x, ch * 0.43, 0, x, ch * 0.43, r); for (const [o, col] of stops) gr.addColorStop(o, col);
        c.fillStyle = gr; c.fillRect(0, 0, cw, ch);
      }
    }), -40, -40, w + 80, h + 80);

    // smoke
    for (const s of this.smoke) {
      s.x += s.v / 60; if (s.x > 1.3) s.x = -0.3; if (s.x < -0.3) s.x = 1.3;
      const r = s.r * Math.max(w, h);
      g.globalAlpha = 0.6; g.drawImage(smokeSprite(), s.x * w - r, s.y * h - r, r * 2, r * 2);
    }
    g.globalAlpha = 1;

    // receding temple floor grid
    const hy = h * 0.66;
    g.save(); g.beginPath(); g.rect(0, hy, w, h - hy); g.clip();
    const fg = g.createLinearGradient(0, hy, 0, h); fg.addColorStop(0, 'rgba(255,80,30,0)'); fg.addColorStop(1, 'rgba(255,90,30,0.45)');
    g.strokeStyle = fg; g.lineWidth = 1.2;
    for (let i = -14; i <= 14; i++) { g.beginPath(); g.moveTo(cx + i * 18, hy); g.lineTo(cx + i * w * 0.16, h + 40); g.stroke(); }
    const off = (this.t * 0.55) % 1;
    for (let i = 0; i < 14; i++) { const z = (i + off) / 14, y = hy + (h - hy) * z * z; g.globalAlpha = z; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    g.restore(); g.globalAlpha = 1;

    // god rays
    g.save(); g.globalCompositeOperation = 'lighter';
    const rayBoost = titled ? 1 : 0.35 + this.disp * 0.5;
    const L = Math.max(w, h) * 1.2, rot = this.t * 0.12;
    const rays = this.cached('rays', 512, 512, (c) => {
      const N = 18, gr = c.createRadialGradient(256, 256, 20, 256, 256, 256);
      gr.addColorStop(0, 'rgba(255,120,50,0.16)'); gr.addColorStop(1, 'rgba(255,120,50,0)');
      c.fillStyle = gr;
      for (let i = 0; i < N; i++) { const a = (i / N) * Math.PI * 2, wd = 0.04 + 0.03 * ((i * 7) % 3) / 2; c.beginPath(); c.moveTo(256, 256); c.arc(256, 256, 256, a - wd, a + wd); c.closePath(); c.fill(); }
    });
    g.translate(cx, cy); g.rotate(rot); g.globalAlpha = Math.min(1, rayBoost * (0.85 + 0.15 * pulse));
    g.drawImage(rays, -L, -L, L * 2, L * 2);
    g.setTransform(dpr, 0, 0, dpr, sx * dpr, sy * dpr); g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.5 + 0.3 * pulse + 0.5 * this.flash;
    const gr = R * (2.6 + this.disp * 0.8);
    g.drawImage(glowSprite('#ff3a12'), cx - gr * 1.6, cy - gr * 0.8, gr * 3.2, gr * 1.6);
    g.restore();

    // particles (behind sigil): streams, embers, glows
    g.save(); g.globalCompositeOperation = 'lighter';
    for (const p of this.parts) {
      const k = 1 - p.life / p.max;
      if (p.k === 'stream') {
        g.globalAlpha = 0.9; g.strokeStyle = p.color; g.lineWidth = p.size * 0.5; g.lineCap = 'round';
        if (p.px != null) { g.beginPath(); g.moveTo(p.px - (p.x - p.px) * 2, p.py - (p.y - p.py) * 2); g.lineTo(p.x, p.y); g.stroke(); }
        g.drawImage(glowSprite(p.color), p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
      } else if (p.k === 'spark') {
        g.globalAlpha = k; g.strokeStyle = p.color; g.lineWidth = 2.5;
        g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035); g.stroke();
      } else {
        const s = p.size * (p.k === 'ember' ? 1 : 0.5 + 0.5 * k);
        g.globalAlpha = p.k === 'ember' ? Math.min(1, p.life * 2) * k * (0.6 + 0.4 * Math.sin(p.life * 11)) : k;
        g.drawImage(glowSprite(p.color), p.x - s, p.y - s, s * 2, s * 2);
      }
    }
    for (const b of this.bolts) {
      const k = 1 - b.life / b.max;
      for (const [lw, col, a] of [[14, b.color, 0.25], [5, b.color, 0.75], [2, '#ffffff', 1]]) {
        g.globalAlpha = a * k; g.strokeStyle = col; g.lineWidth = lw; g.lineJoin = 'round';
        g.beginPath(); b.pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
      }
    }
    g.restore();

    if (cine) this.drawCine(g); else if (!titled) this.drawForge(g);

    // shockwave rings
    g.save(); g.globalCompositeOperation = 'lighter';
    for (const r of this.rings) {
      if (r.life < 0) continue;
      const k = r.life / r.max, rr = r.r + Math.max(w, h) * 0.9 * ease(k);
      g.globalAlpha = 1 - k; g.strokeStyle = r.color; g.lineWidth = r.w * (1 - k) + 1;
      g.beginPath(); g.ellipse(r.cx ?? cx, r.cy ?? cy, rr, rr * 0.88, 0, 0, Math.PI * 2); g.stroke();
    }
    g.restore();

    if (titled) this.drawTitle(g, tb);
    this.drawHud(g, titled);

    // flashes
    if (this.flash > 0) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = this.flash * 0.75; g.fillStyle = '#ffe6c8'; g.fillRect(-40, -40, w + 80, h + 80); g.globalCompositeOperation = 'source-over'; }
    // vignette
    g.globalAlpha = 1;
    g.drawImage(this.cached('vig', w, h, (c, cw, ch) => {
      const gr = c.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.35, cw / 2, ch / 2, Math.max(cw, ch) * 0.8);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.75)'); c.fillStyle = gr; c.fillRect(0, 0, cw, ch);
    }), -40, -40, w + 80, h + 80);
    if (this.white > 0) { g.globalAlpha = this.white; g.fillStyle = '#fff4e6'; g.fillRect(-40, -40, w + 80, h + 80); }
    g.globalAlpha = 1;
  }

  /** Loading art: the title lettering fills with molten fire as the game loads. */
  drawForge(g) {
    const { w, cx, cy, t } = this;
    const p = this.phase === 'gate' ? 1 : this.disp;
    const fs = Math.min(w * 0.13, 150);
    g.save(); g.font = `italic 900 ${fs}px ${FONT}`;
    const tw = Math.max(g.measureText('GESTURE').width, g.measureText('KOMBAT').width) * 1.12;
    g.restore();
    this.fs = fs; this.tw = tw;
    const lines = [['GESTURE', cy - fs * 0.32], ['KOMBAT', cy + fs * 0.62]];
    const x0 = cx - tw / 2 - fs * 0.3, y0 = cy - fs * 1.15, bw = tw + fs * 0.6, bh = fs * 2.05;
    const words = (c, ox, oy) => {
      c.font = `italic 900 ${fs}px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'alphabetic';
      for (const [word, by] of lines) { c.save(); c.translate(cx - ox, by - oy); c.transform(1, 0, -0.18, 1, 0, 0); c.fillText(word, 0, 0); c.restore(); }
    };
    // heat haze behind the letters
    g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.25 + 0.35 * p + 0.1 * Math.sin(t * 3);
    g.drawImage(glowSprite('#ff3a12'), cx - tw * 0.75, cy - fs * 1.4, tw * 1.5, fs * 2.6); g.restore();
    // cold forged metal (empty letters)
    g.save(); g.fillStyle = '#1a0b08'; g.strokeStyle = 'rgba(255,120,60,0.45)'; g.lineWidth = 2; g.lineJoin = 'round';
    g.font = `italic 900 ${fs}px ${FONT}`; g.textAlign = 'center';
    for (const [word, by] of lines) { g.save(); g.translate(cx, by); g.transform(1, 0, -0.18, 1, 0, 0); g.fillText(word, 0, 0); g.strokeText(word, 0, 0); g.restore(); }
    g.restore();
    // molten fill clipped to the letters
    const L = this.forgeLayer ||= document.createElement('canvas');
    const lw = Math.ceil(bw), lh = Math.ceil(bh);
    if (L.width !== lw || L.height !== lh) { L.width = lw; L.height = lh; }
    const c = L.getContext('2d');
    c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1; c.clearRect(0, 0, lw, lh);
    c.fillStyle = '#fff'; words(c, x0, y0);
    const front = lw * p;
    const grd = c.createLinearGradient(0, 0, Math.max(1, front), 0);
    grd.addColorStop(0, '#6a0c03'); grd.addColorStop(0.55, '#ff3a10'); grd.addColorStop(0.88, '#ffad3a'); grd.addColorStop(1, '#fff1c4');
    c.globalCompositeOperation = 'source-in'; c.fillStyle = grd;
    c.beginPath(); c.moveTo(0, 0);
    for (let y = 0; y <= lh; y += 6) c.lineTo(front + Math.sin(y * 0.06 + t * 7) * 10 + Math.sin(y * 0.021 - t * 3) * 14, y);
    c.lineTo(0, lh); c.closePath(); c.fill();
    c.globalCompositeOperation = 'source-atop';
    for (let i = 0; i < 5; i++) { // flowing hot streaks inside the metal
      const y = ((t * (40 + i * 13) + i * 97) % (lh + 60)) - 30;
      c.globalAlpha = 0.3; c.fillStyle = '#ffe08a'; c.fillRect(0, y, front, 3 + (i % 3) * 2);
    }
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    g.save(); g.drawImage(L, x0, y0);
    g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.35 + 0.15 * Math.sin(t * 6); g.drawImage(L, x0, y0);
    g.restore();
    // sparks off the pouring front
    if (this.phase === 'load' && p < 0.995 && Math.random() < 0.8) {
      const fx = x0 + front, fy = y0 + rand(0.15, 0.9) * lh;
      this.parts.push({ k: 'spark', x: fx, y: fy, vx: rand(-80, 320), vy: rand(-420, -80), life: 0, max: rand(0.3, 0.7), size: 2, color: Math.random() < 0.5 ? '#ffd36b' : '#ff6a2a', grav: 1100, drag: 0.8 });
    }
    // lightning crackling across the letters
    if (Math.random() < 0.035 + 0.04 * p) { const bx = x0 + rand(0.1, 0.9) * lw; this.bolt(bx, y0 + lh * 0.05, bx + rand(-120, 120), y0 + lh * 0.95, '#9fdcff'); }
    // gate: the finished title breathes with power
    if (this.phase === 'gate') {
      g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.18 + 0.12 * Math.sin(t * 4);
      g.drawImage(glowSprite('#ffb347'), cx - tw * 0.6, cy - fs * 1.1, tw * 1.2, fs * 2.1); g.restore();
    }
  }

  drawSigil(g, titled) {
    const { cx, cy, R, t } = this;
    const p = titled || this.phase === 'gate' ? 1 : this.disp;
    const zoom = this.phase === 'exit' ? 1 + ease(this.pt / 0.4) * 1.5 : 1;
    const dim = titled ? 0.55 : 1;
    g.save(); g.translate(cx, cy); g.scale(zoom, zoom);
    // progress ring
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 3;
    g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.stroke();
    g.save(); g.shadowColor = '#ff6a2a'; g.shadowBlur = 22;
    g.strokeStyle = '#ffb347'; g.lineWidth = 4;
    g.beginPath(); g.arc(0, 0, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p); g.stroke();
    // runner
    const ra = -Math.PI / 2 + Math.PI * 2 * p;
    g.restore();
    if (!titled) { g.save(); g.globalCompositeOperation = 'lighter'; g.drawImage(glowSprite('#ffd36b'), Math.cos(ra) * R - 26, Math.sin(ra) * R - 26, 52, 52); g.restore(); }
    // tick ring
    g.save(); g.rotate(t * 0.18); g.strokeStyle = `rgba(255,150,80,${0.5 * dim + 0.2})`;
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2, l = i % 6 === 0 ? 0.12 : 0.05;
      g.lineWidth = i % 6 === 0 ? 2.5 : 1.2;
      g.beginPath(); g.moveTo(Math.cos(a) * R * 1.12, Math.sin(a) * R * 1.12); g.lineTo(Math.cos(a) * R * (1.12 + l), Math.sin(a) * R * (1.12 + l)); g.stroke();
    }
    g.restore();
    // dashed counter ring
    g.save(); g.rotate(-t * 0.4); g.setLineDash([R * 0.1, R * 0.06]); g.strokeStyle = `rgba(255,120,60,${0.55 * dim})`; g.lineWidth = 2;
    g.beginPath(); g.arc(0, 0, R * 0.88, 0, Math.PI * 2); g.stroke(); g.restore();
    // star
    const s = back(p * 1.15);
    const star = (ro, ri, n, rot) => { g.beginPath(); for (let i = 0; i < n * 2; i++) { const r = i % 2 ? ri : ro, a = rot + (Math.PI * i) / n - Math.PI / 2; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); };
    g.save(); g.rotate((1 - Math.min(1, s)) * -1.4 + Math.sin(t * 0.6) * 0.03);
    g.shadowColor = '#ff4a1a'; g.shadowBlur = 18 + 14 * Math.sin(t * 3);
    const sg = g.createRadialGradient(0, 0, 0, 0, 0, R);
    sg.addColorStop(0, '#4a1a0b'); sg.addColorStop(1, '#140604');
    g.fillStyle = sg; g.strokeStyle = '#ff7a3a'; g.lineWidth = 2.5;
    if (s > 0.01) {
      star(R * 0.62 * s, R * 0.16 * s, 4, Math.PI / 4); g.fill(); g.stroke();
      star(R * 0.8 * s, R * 0.2 * s, 4, 0); g.fill(); g.stroke();
      g.beginPath(); g.arc(0, 0, R * 0.16 * s, 0, Math.PI * 2); g.fillStyle = '#0a0302'; g.fill(); g.stroke();
      g.beginPath(); g.arc(0, 0, R * 0.07 * s, 0, Math.PI * 2); g.fillStyle = '#ffb347'; g.fill();
    }
    g.restore();
    // four element orbs
    g.save(); g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) {
      const lit = clamp((p - i * 0.25) / 0.12, 0, 1);
      const a = -Math.PI / 4 + (i * Math.PI) / 2 + t * 0.05;
      const x = Math.cos(a) * R, y = Math.sin(a) * R;
      const sz = 8 + 22 * lit + 4 * Math.sin(t * 5 + i);
      g.globalAlpha = 0.25 + 0.75 * lit;
      g.drawImage(glowSprite(ELEMENTS[i]), x - sz, y - sz, sz * 2, sz * 2);
      if (lit > 0.5) { g.globalAlpha = 0.9; g.drawImage(glowSprite('#ffffff'), x - 5, y - 5, 10, 10); }
    }
    g.restore();
    g.restore();
  }

  drawTitle(g, tb) {
    const { w, cx, cy } = this;
    const fs = Math.min(w * 0.13, 150);
    const lines = [['GESTURE', cy - fs * 0.32, ['#ffffff', '#c9cfd6', '#7d858f'], '#000', 0], ['KOMBAT', cy + fs * 0.62, ['#ff8a4a', '#ff3a14', '#9a1206'], '#ff2a0a', 7]];
    g.save();
    g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.font = `italic 900 ${fs}px ${FONT}`;
    for (const [word, y, cols, glow, delay] of lines) {
      const total = g.measureText(word).width * 1.02;
      let x = cx - total / 2;
      for (let i = 0; i < word.length; i++) {
        const ch = word[i], cw = g.measureText(ch).width * 1.02;
        const k = clamp((tb - (delay + i) * 0.045) / 0.3, 0, 1);
        if (k <= 0) { x += cw; continue; }
        const sc = 1 + (1 - back(k)) * 2.2, a = Math.min(1, k * 2.5);
        g.save();
        g.translate(x + cw / 2, y - fs * 0.35);
        g.transform(1, 0, -0.18, 1, 0, 0);
        g.scale(sc, sc);
        g.globalAlpha = a;
        const lg = g.createLinearGradient(0, -fs * 0.55, 0, fs * 0.35);
        lg.addColorStop(0, cols[0]); lg.addColorStop(0.55, cols[1]); lg.addColorStop(1, cols[2]);
        if (k < 1) { // chromatic split while slamming in
          g.globalCompositeOperation = 'lighter';
          g.fillStyle = 'rgba(255,0,60,0.6)'; g.fillText(ch, -8 * (1 - k), fs * 0.35);
          g.fillStyle = 'rgba(0,200,255,0.6)'; g.fillText(ch, 8 * (1 - k), fs * 0.35);
          g.globalCompositeOperation = 'source-over';
        }
        g.lineJoin = 'round'; g.lineWidth = fs * 0.06; g.strokeStyle = '#120404';
        g.strokeText(ch, 0, fs * 0.35);
        if (glow !== '#000') { g.shadowColor = glow; g.shadowBlur = 30 + 12 * Math.sin(this.t * 4); }
        g.fillStyle = lg; g.fillText(ch, 0, fs * 0.35);
        g.restore();
        x += cw;
      }
    }
    // tagline types in
    const tag = 'YOUR BODY. YOUR POWER.';
    const n = Math.floor(clamp((tb - 0.65) / 0.6, 0, 1) * tag.length);
    if (n > 0) {
      g.font = `600 ${Math.max(12, fs * 0.13)}px Rajdhani, "Segoe UI", sans-serif`;
      if ('letterSpacing' in g) g.letterSpacing = `${Math.max(3, fs * 0.05)}px`;
      g.fillStyle = '#e9ecef'; g.globalAlpha = 0.9;
      g.fillText(tag.slice(0, n), cx, cy + fs * 1.0);
      if ('letterSpacing' in g) g.letterSpacing = '0px';
    }
    // sweeping shine across the title
    const sweep = ((this.t * 0.45) % 1.6) - 0.3;
    g.globalCompositeOperation = 'source-atop';
    g.restore();
    if (sweep > 0 && sweep < 1) {
      g.save(); g.globalCompositeOperation = 'lighter';
      const sxp = cx - fs * 2.6 + sweep * fs * 5.2;
      const sh = g.createLinearGradient(sxp - fs * 0.4, 0, sxp + fs * 0.4, 0);
      sh.addColorStop(0, 'rgba(255,220,180,0)'); sh.addColorStop(0.5, 'rgba(255,230,200,0.14)'); sh.addColorStop(1, 'rgba(255,220,180,0)');
      g.fillStyle = sh; g.fillRect(sxp - fs * 0.4, cy - fs * 1.1, fs * 0.8, fs * 2);
      g.restore();
    }
  }

  drawHud(g, titled) {
    const { w, h, cx, cy, R, t } = this;
    const by = Math.min(h - 70, cy + R * 1.75 + 40);
    const bw = Math.min(640, w * 0.78), bh = 14, bx = cx - bw / 2, sk = 10;
    const fade = this.phase === 'load' ? 1 : this.phase === 'gate' ? Math.max(0, 1 - this.pt * 4) : 0;
    if (fade > 0) {
      g.save(); g.globalAlpha = fade;
      const para = (x0, x1) => { g.beginPath(); g.moveTo(x0 + sk, by); g.lineTo(x1 + sk, by); g.lineTo(x1, by + bh); g.lineTo(x0, by + bh); g.closePath(); };
      para(bx, bx + bw); g.fillStyle = 'rgba(10,6,6,0.85)'; g.fill();
      g.strokeStyle = 'rgba(255,120,60,0.55)'; g.lineWidth = 1.5; g.stroke();
      const fw = bw * this.disp;
      if (fw > 2) {
        g.save(); para(bx, bx + bw); g.clip();
        const fgd = g.createLinearGradient(bx, 0, bx + bw, 0);
        fgd.addColorStop(0, '#b3140a'); fgd.addColorStop(0.6, '#ff5a1a'); fgd.addColorStop(1, '#ffd36b');
        g.fillStyle = fgd; g.fillRect(bx, by, fw + sk, bh);
        // moving shine
        const shx = bx + ((t * 260) % (bw + 200)) - 100;
        const shg = g.createLinearGradient(shx - 60, 0, shx + 60, 0);
        shg.addColorStop(0, 'rgba(255,255,255,0)'); shg.addColorStop(0.5, 'rgba(255,255,255,0.45)'); shg.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = shg; g.fillRect(Math.max(bx, shx - 60), by, Math.min(120, fw + sk), bh);
        // segment cuts
        g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 2;
        for (let i = 1; i < 28; i++) { const x = bx + (bw / 28) * i; g.beginPath(); g.moveTo(x + sk, by); g.lineTo(x, by + bh); g.stroke(); }
        g.restore();
        // glowing head + sparks
        g.save(); g.globalCompositeOperation = 'lighter';
        g.drawImage(glowSprite('#ffd36b'), bx + fw - 40, by - 33, 80, 80);
        g.restore();
        if (!titled && Math.random() < 0.6) this.parts.push({ k: 'spark', x: bx + fw + 6, y: by + bh / 2, vx: rand(-60, 260), vy: rand(-320, -60), life: 0, max: rand(0.25, 0.6), size: 2, color: Math.random() < 0.5 ? '#ffd36b' : '#ff6a2a', grav: 900, drag: 1 });
      }
      // percent + status
      const pct = Math.floor(this.disp * 100);
      g.textBaseline = 'alphabetic';
      g.font = `italic 900 ${Math.min(56, w * 0.09)}px ${FONT}`; g.textAlign = 'right';
      g.fillStyle = '#fff3e0'; g.shadowColor = '#ff4a1a'; g.shadowBlur = 18;
      g.fillText(`${pct}%`, bx + bw + sk, by - 12);
      g.shadowBlur = 0;
      g.font = `700 ${Math.max(11, Math.min(14, w * 0.028))}px Rajdhani, "Segoe UI", sans-serif`;
      if ('letterSpacing' in g) g.letterSpacing = '4px';
      g.textAlign = 'left'; g.fillStyle = '#ffb567';
      const msg = MSGS[Math.min(MSGS.length - 1, Math.floor(this.disp * MSGS.length))];
      const blink = Math.sin(t * 10) > -0.6 ? 1 : 0.4;
      g.globalAlpha = fade * blink;
      g.fillText(msg + (pct < 100 ? '.'.repeat(1 + (Math.floor(t * 3) % 3)) : ''), bx, by - 14);
      g.globalAlpha = fade * 0.75;
      if ('letterSpacing' in g) g.letterSpacing = '1px';
      g.textAlign = 'center'; g.fillStyle = '#b9c1cb';
      g.font = `600 ${Math.max(12, Math.min(15, w * 0.03))}px Rajdhani, "Segoe UI", sans-serif`;
      g.fillText('TIP · ' + TIPS[this.tip], cx, by + bh + 32);
      if ('letterSpacing' in g) g.letterSpacing = '0px';
      g.restore();
    }
    if (this.phase === 'gate') {
      const a = Math.min(1, this.pt * 2) * (0.82 + 0.18 * Math.sin(t * 5));
      g.save(); g.globalAlpha = a;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `italic 800 ${Math.max(18, Math.min(30, w * 0.045))}px ${FONT}`;
      if ('letterSpacing' in g) g.letterSpacing = '6px';
      g.shadowColor = '#ff4a1a'; g.shadowBlur = 24; g.fillStyle = '#fff3e0';
      const label = this.touch ? 'TAP TO IGNITE' : 'CLICK TO IGNITE';
      g.fillText(label, cx, by + 4);
      const half = g.measureText(label).width / 2 + 34, off = (Math.sin(t * 6) + 1) * 6;
      g.fillStyle = '#ff6a2a';
      for (const s of [-1, 1]) {
        for (let k = 0; k < 3; k++) {
          const x = cx + s * (half + k * 14 + off);
          g.globalAlpha = a * (1 - k * 0.3);
          g.beginPath(); g.moveTo(x, by - 9); g.lineTo(x - s * 9, by + 4); g.lineTo(x, by + 17); g.lineTo(x + s * 4, by + 17); g.lineTo(x - s * 5, by + 4); g.lineTo(x + s * 4, by - 9); g.closePath(); g.fill();
        }
      }
      if ('letterSpacing' in g) g.letterSpacing = '0px';
      g.restore();
    }
  }
}
