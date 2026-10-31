// Front-end VFX: ambient embers/smoke/lightning over every screen, cursor sparks,
// click bursts, and full-screen transitions (gate slam, fire slash). Battle has its own canvases.
import { glowSprite } from './fx.js';
import { prefs } from './store.js';
import { sfx, audioReady } from './audio.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const rand = (a, b) => a + Math.random() * (b - a);
export const motionOK = () => !reduced.matches;

class Ambient {
  constructor() {
    this.c = document.createElement('canvas');
    this.c.id = 'ambient';
    this.c.setAttribute('aria-hidden', 'true');
    document.body.append(this.c);
    this.g = this.c.getContext('2d');
    this.p = []; // particles
    this.smoke = Array.from({ length: 7 }, () => this.newSmoke(true));
    this.bolts = [];
    this.flash = 0;
    this.nextBolt = performance.now() + rand(3000, 7000);
    this.mode = 'menu';
    this.last = performance.now();
    this.mouse = { x: -1, y: -1, t: 0 };
    this.resize = this.resize.bind(this);
    addEventListener('resize', this.resize); this.resize();
    addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      const now = performance.now();
      const dx = e.clientX - this.mouse.x, dy = e.clientY - this.mouse.y;
      this.mouse = { x: e.clientX, y: e.clientY, t: now };
      if (this.mode === 'battle' || !this.on()) return;
      const sp = Math.min(6, Math.hypot(dx, dy) / 8);
      for (let i = 0; i < sp; i++) this.add({ x: e.clientX, y: e.clientY, vx: rand(-60, 60) - dx * 2, vy: rand(-80, 20) - dy * 2, life: 0, max: rand(0.25, 0.55), size: rand(4, 10), color: Math.random() < 0.7 ? '#ff6a2a' : '#ffd36b', grav: -60 });
    }, { passive: true });
    this.tick = this.tick.bind(this);
    requestAnimationFrame(this.tick);
  }
  on() { return motionOK() && prefs.particles !== false; }
  resize() {
    const dpr = 1; // soft glows: full-res adds cost, not detail
    this.dpr = dpr; this.w = innerWidth; this.h = innerHeight;
    this.c.width = Math.round(this.w * dpr); this.c.height = Math.round(this.h * dpr);
  }
  newSmoke(init) {
    return { x: rand(-0.2, 1.1), y: init ? rand(0.55, 1.05) : 1.15, r: rand(0.18, 0.4), vx: rand(-0.008, 0.012), vy: rand(-0.012, -0.004), a: rand(0.05, 0.11), life: 0 };
  }
  add(p) { if (this.p.length < (this.lowQ ? 160 : 420)) this.p.push(p); }
  setMode(m) { this.mode = m; this.c.classList.toggle('dim', m === 'battle'); }

  burst(x, y, color = '#ff6a2a', n = 26, power = 1) {
    if (!this.on()) return;
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), s = rand(120, 620) * power;
      this.add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, life: 0, max: rand(0.3, 0.75), size: rand(5, 14) * power, color: Math.random() < 0.3 ? '#ffffff' : color, grav: 500, drag: 2.2, spark: Math.random() < 0.5 });
    }
    this.rings = this.rings || [];
    this.rings.push({ x, y, r: 6, life: 0, max: 0.45, color, w: 6 * power });
  }

  bolt(x0, y0, x1, y1, color = '#9fdcff') {
    const pts = [[x0, y0]];
    const n = 12;
    for (let i = 1; i < n; i++) pts.push([x0 + (x1 - x0) * (i / n) + rand(-40, 40), y0 + (y1 - y0) * (i / n) + rand(-14, 14)]);
    pts.push([x1, y1]);
    this.bolts.push({ pts, life: 0, max: 0.22, color });
  }

  menuStage() { return document.querySelector('.menu-stage')?.getBoundingClientRect() || null; }

  tick(now) {
    requestAnimationFrame(this.tick);
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    this.slowAvg = (this.slowAvg ?? 0.016) * 0.97 + dt * 0.03;
    if (!this.lowQ && now > 8000 && this.slowAvg > 0.028) { this.lowQ = true; this.resize(); }
    const g = this.g, { w, h } = this;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    if (!this.on() || document.hidden) return;
    const battle = this.mode === 'battle';

    if (!battle) {
      // drifting smoke along the bottom
      for (const s of this.smoke) {
        s.x += s.vx * dt; s.y += s.vy * dt; s.life += dt;
        if (s.y < 0.35 || s.x > 1.3 || s.x < -0.4) Object.assign(s, this.newSmoke(false));
        const R = s.r * Math.max(w, h);
        g.globalAlpha = s.a * Math.min(1, s.life / 2);
        g.drawImage(glowSprite('#2a2422'), s.x * w - R, s.y * h - R, R * 2, R * 2);
      }
      // rising embers
      if (Math.random() < dt * 55) this.add({ x: rand(0, w), y: h + 10, vx: rand(-20, 20), vy: rand(-140, -60), life: 0, max: rand(3, 7), size: rand(3, 8), color: Math.random() < 0.85 ? '#ff5a1a' : '#ffb347', sway: rand(0.5, 2), grav: 0, ember: true });
      // element life on the menu art: fire around the left fighter, sparks around the right
      const st = this.mode === 'menu' ? this.menuStage() : null;
      if (st) {
        // element surge: fire and lightning race from the fighters' fists into the logo
        if (now > (this.nextSurge ||= now + 2500)) {
          this.nextSurge = now + rand(4500, 7500);
          const lx = st.left + st.width * 0.29, rx = st.left + st.width * 0.71, fy = st.top + st.height * 0.58;
          const tx = st.left + st.width * 0.5, ty = st.top + st.height * 0.27;
          for (let i = 0; i < 40; i++) {
            const k = i / 40;
            this.add({ x: lx, y: fy, vx: (tx - lx) * rand(1.4, 2.2), vy: (ty - fy) * rand(1.4, 2.2) + rand(-80, 80), life: -k * 0.35, max: 0.55, size: rand(8, 18), color: Math.random() < 0.5 ? '#ff4a12' : '#ffb347', grav: 0, drag: 0.6 });
          }
          setTimeout(() => this.bolt(rx, fy, tx, ty, '#7fd6ff'), 180);
          setTimeout(() => this.bolt(rx + 30, fy - 40, tx, ty, '#d6f1ff'), 260);
          setTimeout(() => { this.rings = this.rings || []; this.rings.push({ x: tx, y: ty, r: 20, life: 0, max: 0.6, color: '#ffd36b', w: 6 }); this.flash = 0.45; }, 380);
        }
        if (Math.random() < dt * 22) this.add({ x: st.left + st.width * rand(0.04, 0.3), y: st.top + st.height * rand(0.45, 0.9), vx: rand(-15, 15), vy: rand(-120, -50), life: 0, max: rand(0.6, 1.3), size: rand(8, 18), color: Math.random() < 0.5 ? '#ff4a12' : '#ffae3a', grav: -40 });
        if (Math.random() < dt * 5) {
          const cx = st.left + st.width * rand(0.72, 0.95), cy = st.top + st.height * rand(0.38, 0.85);
          this.bolt(cx, cy, cx + rand(-90, 90), cy + rand(-70, 70), Math.random() < 0.6 ? '#4cc3ff' : '#c9eeff');
        }
      }
      // distant lightning flash
      if (now > this.nextBolt && (this.mode === 'menu' || this.mode === 'title' || this.mode === 'screen')) {
        this.nextBolt = now + rand(4000, 9000);
        this.flash = 1;
        const x = rand(w * 0.15, w * 0.85);
        this.bolt(x, -10, x + rand(-160, 160), h * rand(0.25, 0.45), '#d6f1ff');
        if (Math.random() < 0.6) { const x2 = x + rand(-300, 300); this.bolt(x2, -10, x2 + rand(-120, 120), h * rand(0.15, 0.35), '#bfe4ff'); }
      }
    } else if (Math.random() < dt * 8) {
      this.add({ x: rand(0, w), y: h + 10, vx: rand(-20, 20), vy: rand(-120, -50), life: 0, max: rand(3, 6), size: rand(3, 6), color: '#ff5a1a', sway: rand(0.5, 2), grav: 0, ember: true });
    }

    g.globalCompositeOperation = 'lighter';
    for (const p of this.p) {
      p.life += dt;
      if (p.life < 0) continue;
      if (p.drag) { const d = Math.max(0, 1 - p.drag * dt); p.vx *= d; p.vy *= d; }
      p.vy += (p.grav || 0) * dt;
      p.x += (p.vx + (p.sway ? Math.sin(p.life * p.sway * 2) * 30 : 0)) * dt;
      p.y += p.vy * dt;
      const k = 1 - p.life / p.max;
      if (p.spark) {
        g.globalAlpha = k; g.strokeStyle = p.color; g.lineWidth = 2;
        g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); g.stroke();
      } else {
        g.globalAlpha = (p.ember ? Math.min(1, p.life * 2) * k * (0.6 + 0.4 * Math.sin(p.life * 12)) : k);
        const s = p.size * (p.ember ? 1 : 0.5 + k * 0.5);
        g.drawImage(glowSprite(p.color), p.x - s, p.y - s, s * 2, s * 2);
      }
    }
    this.p = this.p.filter((p) => p.life < p.max && p.y > -40);
    if (this.rings) {
      for (const r of this.rings) { r.life += dt; r.r += 900 * dt; const k = 1 - r.life / r.max; g.globalAlpha = k; g.strokeStyle = r.color; g.lineWidth = r.w * k + 1; g.beginPath(); g.arc(r.x, r.y, r.r, 0, Math.PI * 2); g.stroke(); }
      this.rings = this.rings.filter((r) => r.life < r.max);
    }
    for (const b of this.bolts) {
      b.life += dt;
      const k = 1 - b.life / b.max;
      for (const [lw, col, a] of [[10, b.color, 0.25], [4, b.color, 0.7], [1.5, '#ffffff', 1]]) {
        g.globalAlpha = a * k * (Math.random() < 0.2 ? 0.3 : 1); g.strokeStyle = col; g.lineWidth = lw; g.lineJoin = 'round';
        g.beginPath(); b.pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
      }
    }
    this.bolts = this.bolts.filter((b) => b.life < b.max);
    if (this.flash > 0) {
      g.globalAlpha = this.flash * 0.3; g.fillStyle = '#bfe4ff'; g.fillRect(0, 0, w, h);
      this.flash = Math.max(0, this.flash - dt * 5);
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  }
}

export const ambient = new Ambient();

// ---------------------------------------------------------------- transitions
const layer = document.createElement('canvas');
layer.id = 'xfx';
layer.setAttribute('aria-hidden', 'true');
document.body.append(layer);
const lg = layer.getContext('2d');
let busy = null;

function shakeApp(px = 14, ms = 320) {
  if (!motionOK()) return;
  document.getElementById('app')?.animate(
    Array.from({ length: 8 }, (_, i) => ({ transform: i === 7 ? 'none' : `translate(${rand(-px, px) * (1 - i / 8)}px, ${rand(-px, px) * (1 - i / 8)}px)` })),
    { duration: ms, easing: 'linear' });
}
export { shakeApp };

/**
 * Run a full-screen transition; `swap` is called at the moment the screen is covered.
 * kind: 'gate' (metal doors slam with a fire seam) | 'slash' (diagonal fire blade wipe)
 */
export function transition(kind, swap, color = '#ff4a1a') {
  if (!motionOK()) { swap(); return Promise.resolve(); }
  if (busy) { busy.swap = swap; return busy.p; } // last request wins
  const state = { swap };
  if (audioReady()) kind === 'gate' ? sfx.gate() : sfx.slash();
  state.p = new Promise((resolve) => {
    const dpr = 1;
    const w = innerWidth, h = innerHeight;
    layer.width = Math.round(w * dpr); layer.height = Math.round(h * dpr);
    layer.style.display = 'block';
    const close = kind === 'gate' ? 0.26 : 0.2, hold = kind === 'gate' ? 0.32 : 0.04, open = kind === 'gate' ? 0.34 : 0.26;
    const total = close + hold + open;
    const sparks = [];
    let swapped = false, t0 = performance.now();
    const ease = (x) => x * x * (3 - 2 * x);
    const frame = (now) => {
      const t = (now - t0) / 1000;
      lg.setTransform(dpr, 0, 0, dpr, 0, 0);
      lg.clearRect(0, 0, w, h);
      if (!swapped && t >= close) {
        swapped = true;
        try { state.swap(); } catch (e) { console.error(e); }
        if (kind === 'gate') {
          shakeApp(16, 360);
          for (let i = 0; i < 90; i++) { const y = rand(0, h); sparks.push({ x: w / 2 + (y - h / 2) * 0.18, y, vx: rand(-900, 900), vy: rand(-500, 300), life: 0, max: rand(0.25, 0.6) }); }
        }
      }
      if (kind === 'gate') {
        const k = t < close ? ease(t / close) : t < close + hold ? 1 : 1 - ease((t - close - hold) / open);
        const slant = h * 0.18;
        for (const side of [-1, 1]) {
          const edge = w / 2 + side * (1 - k) * (w / 2 + slant + 40);
          lg.save();
          lg.beginPath();
          if (side < 0) { lg.moveTo(-10, -10); lg.lineTo(edge - slant / 2, -10); lg.lineTo(edge + slant / 2, h + 10); lg.lineTo(-10, h + 10); }
          else { lg.moveTo(w + 10, -10); lg.lineTo(edge - slant / 2, -10); lg.lineTo(edge + slant / 2, h + 10); lg.lineTo(w + 10, h + 10); }
          lg.closePath();
          const grd = lg.createLinearGradient(side < 0 ? 0 : w, 0, edge, 0);
          grd.addColorStop(0, '#07090c'); grd.addColorStop(0.8, '#141a20'); grd.addColorStop(1, '#2a1610');
          lg.fillStyle = grd; lg.fill();
          // rivets / plate lines
          lg.clip();
          lg.strokeStyle = 'rgba(255,255,255,0.05)'; lg.lineWidth = 2;
          for (let y = 60; y < h; y += 120) { lg.beginPath(); lg.moveTo(0, y); lg.lineTo(w, y + slant * 0.1); lg.stroke(); }
          lg.restore();
          // glowing edge
          lg.save(); lg.globalCompositeOperation = 'lighter';
          for (const [lw, col, a] of [[26, color, 0.35 * k], [8, '#ffb347', 0.8 * k], [2, '#fff', k]]) {
            lg.globalAlpha = a; lg.strokeStyle = col; lg.lineWidth = lw;
            lg.beginPath(); lg.moveTo(edge - slant / 2, -10); lg.lineTo(edge + slant / 2, h + 10); lg.stroke();
          }
          lg.restore();
        }
        // stamped elemental sigil on the closed gates
        if (k > 0.85) {
          const a = (k - 0.85) / 0.15, R0 = Math.min(w, h) * 0.16;
          lg.save(); lg.translate(w / 2, h / 2); lg.globalAlpha = a;
          lg.globalCompositeOperation = 'lighter';
          lg.drawImage(glowSprite(color), -R0 * 2, -R0 * 2, R0 * 4, R0 * 4);
          lg.globalCompositeOperation = 'source-over';
          lg.strokeStyle = '#ffb347'; lg.lineWidth = 4; lg.shadowColor = color; lg.shadowBlur = 24;
          lg.beginPath(); lg.arc(0, 0, R0, 0, Math.PI * 2); lg.stroke();
          lg.beginPath(); lg.arc(0, 0, R0 * 0.82, 0, Math.PI * 2); lg.lineWidth = 2; lg.stroke();
          const star = (ro, ri, n, rot) => { lg.beginPath(); for (let i = 0; i < n * 2; i++) { const r = i % 2 ? ri : ro, an = rot + (Math.PI * i) / n - Math.PI / 2; lg.lineTo(Math.cos(an) * r, Math.sin(an) * r); } lg.closePath(); };
          lg.fillStyle = '#2a120a'; star(R0 * 0.62, R0 * 0.16, 4, Math.PI / 4); lg.fill(); lg.stroke();
          lg.fillStyle = '#3a160b'; star(R0 * 0.78, R0 * 0.2, 4, 0); lg.fill(); lg.stroke();
          lg.beginPath(); lg.arc(0, 0, R0 * 0.15, 0, Math.PI * 2); lg.fillStyle = '#ffb347'; lg.fill();
          lg.restore();
        }
        // centre emblem flash on impact
        if (swapped && t < close + hold + 0.12) {
          const f = 1 - (t - close) / (hold + 0.12);
          lg.save(); lg.globalCompositeOperation = 'lighter'; lg.globalAlpha = f;
          lg.drawImage(glowSprite(color), w / 2 - 260, h / 2 - 260, 520, 520);
          lg.globalAlpha = f * 0.5; lg.fillStyle = '#fff'; lg.fillRect(0, 0, w, h);
          lg.restore();
        }
      } else {
        // fire slash: a blade of flame sweeps diagonally; dark wake covers the screen then clears
        const k = t < close ? ease(t / close) : t < close + hold ? 1 : 1 + ease((t - close - hold) / open);
        const x = -w * 0.4 + k * w * 1.1;
        lg.save();
        lg.fillStyle = '#05070a';
        lg.beginPath();
        if (k <= 1) { lg.moveTo(-10, -10); lg.lineTo(x + h * 0.35, -10); lg.lineTo(x - h * 0.35, h + 10); lg.lineTo(-10, h + 10); }
        else { const x2 = (k - 1) * w * 1.6 - w * 0.2; lg.moveTo(x2 + h * 0.35, -10); lg.lineTo(w + 10, -10); lg.lineTo(w + 10, h + 10); lg.lineTo(x2 - h * 0.35, h + 10); }
        lg.closePath(); lg.fill();
        lg.globalCompositeOperation = 'lighter';
        const bx = k <= 1 ? x : (k - 1) * w * 1.6 - w * 0.2;
        for (const [lw, col, a] of [[60, color, 0.3], [18, '#ff8a2a', 0.7], [5, '#fff3d0', 1]]) {
          lg.globalAlpha = a; lg.strokeStyle = col; lg.lineWidth = lw;
          lg.beginPath(); lg.moveTo(bx + h * 0.35, -10); lg.lineTo(bx - h * 0.35, h + 10); lg.stroke();
        }
        if (Math.random() < 0.9) for (let i = 0; i < 4; i++) { const y = rand(0, h); sparks.push({ x: bx + (h / 2 - y) * 0.7, y, vx: rand(200, 900), vy: rand(-300, 300), life: 0, max: rand(0.2, 0.4) }); }
        lg.restore();
      }
      // sparks
      lg.save(); lg.globalCompositeOperation = 'lighter';
      for (const s of sparks) {
        s.life += 1 / 60; s.vy += 900 / 60; s.x += s.vx / 60; s.y += s.vy / 60;
        const kk = 1 - s.life / s.max; if (kk <= 0) continue;
        lg.globalAlpha = kk; lg.strokeStyle = Math.random() < 0.3 ? '#fff' : '#ffb347'; lg.lineWidth = 2;
        lg.beginPath(); lg.moveTo(s.x, s.y); lg.lineTo(s.x - s.vx * 0.025, s.y - s.vy * 0.025); lg.stroke();
      }
      lg.restore();
      if (t < total + 0.1) requestAnimationFrame(frame);
      else { lg.clearRect(0, 0, w, h); layer.style.display = 'none'; busy = null; resolve(); }
    };
    requestAnimationFrame(frame);
  });
  busy = state;
  return state.p;
}

// ---------------------------------------------------------------- small helpers
export function countUp(root = document) {
  for (const el of root.querySelectorAll('[data-count]')) {
    const target = Number(el.dataset.count), suffix = el.dataset.suffix || '';
    if (!motionOK() || !Number.isFinite(target)) { el.textContent = (el.dataset.prefix || '') + target + suffix; continue; }
    const t0 = performance.now(), dur = 900 + Math.random() * 300, delay = Number(el.dataset.delay || 0);
    const step = (now) => {
      const k = Math.min(1, Math.max(0, (now - t0 - delay) / dur));
      el.textContent = (el.dataset.prefix || '') + Math.round(target * (1 - Math.pow(1 - k, 3))) + suffix;
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
}

/** Split text into per-letter spans for staggered slam animations. */
export function letters(text, cls = 'ltr') {
  return [...text].map((ch, i) => `<span class="${cls}" style="--i:${i}">${ch === ' ' ? '&nbsp;' : ch}</span>`).join('');
}

/** 3D tilt that follows the pointer (fighter cards, mode cards). */
export function tilt(selector) {
  if (!motionOK() || matchMedia('(pointer: coarse)').matches) return;
  for (const el of document.querySelectorAll(selector)) {
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      el.style.setProperty('--rx', `${(-y * 12).toFixed(2)}deg`);
      el.style.setProperty('--ry', `${(x * 14).toFixed(2)}deg`);
      el.style.setProperty('--mx', `${((x + 0.5) * 100).toFixed(1)}%`);
      el.style.setProperty('--my', `${((y + 0.5) * 100).toFixed(1)}%`);
    });
    el.addEventListener('pointerleave', () => { el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg'); });
  }
}
