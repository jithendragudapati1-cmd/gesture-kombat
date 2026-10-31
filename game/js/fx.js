// Particle + effect system drawn on the battle canvas (logical coordinates).

const glowCache = new Map();

/** Soft radial glow sprite for a colour, cached. */
export function glowSprite(color) {
  if (glowCache.has(color)) return glowCache.get(color);
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, '#ffffff');
  grd.addColorStop(0.18, color);
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  glowCache.set(color, c);
  return c;
}

const rand = (a, b) => a + Math.random() * (b - a);

export class FX {
  constructor() {
    this.parts = [];
    this.texts = [];
    this.rings = [];
    this.beams = [];
    this.flash = null; // {color, t, max}
    this.lines = [];
    this.decals = []; this.flares = []; this.pools = [];
    this.ground = 822;
    this.gore = true;
    this.enabled = true;
    this.max = 900;
  }

  clear() { this.decals.length = 0; this.flares.length = 0; this.pools.length = 0; this.lines.length = 0; this.parts.length = 0; this.texts.length = 0; this.rings.length = 0; this.beams.length = 0; this.flash = null; }

  add(p) {
    if (!this.enabled && p.type !== 'rock') return;
    if (this.parts.length >= this.max) this.parts.shift();
    this.parts.push({ life: 0, max: 0.6, size: 6, vx: 0, vy: 0, grav: 0, drag: 0, rot: 0, vr: 0, alpha: 1, ...p });
  }

  /** Impact burst at (x,y) in world coords. */
  burst(x, y, color, count = 18, power = 1, dir = 0) {
    for (let i = 0; i < count; i++) {
      const a = dir ? (dir > 0 ? 0 : Math.PI) + rand(-1.1, 1.1) : rand(0, Math.PI * 2);
      const s = rand(250, 900) * power;
      this.add({ type: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 80, max: rand(0.18, 0.4), size: rand(2, 4), color, drag: 4 });
    }
    for (let i = 0; i < count / 3; i++) {
      this.add({ type: 'glow', x: x + rand(-14, 14), y: y + rand(-14, 14), vx: rand(-120, 120), vy: rand(-160, 40), max: rand(0.25, 0.5), size: rand(30, 70) * power, color, drag: 3 });
    }
    this.rings.push({ x, y, r: 10, max: 0.32 * power, life: 0, color, w: 10 * power, grow: 520 * power });
    if (power >= 1) {
      this.rings.push({ x, y, r: 4, max: 0.5 * power, life: 0, color: '#ffffff', w: 4 * power, grow: 900 * power });
      this.flare(x, y, color, 180 * power);
    }
  }

  blockSpark(x, y, color) {
    for (let i = 0; i < 10; i++) {
      const a = rand(-Math.PI, Math.PI);
      this.add({ type: 'spark', x, y, vx: Math.cos(a) * rand(200, 500), vy: Math.sin(a) * rand(200, 500), max: 0.22, size: 2, color: '#ffffff', drag: 6 });
    }
    this.rings.push({ x, y, r: 30, max: 0.2, life: 0, color, w: 5, grow: 260 });
  }

  text(x, y, str, color, size = 44) {
    if (!this.enabled && size < 60) return;
    this.texts.push({ x, y, str, color, size, life: 0, max: 0.9, vy: -140 });
  }

  beam(x1, y1, x2, y2, color, max = 0.22, width = 10) {
    // Pre-compute a jagged path; re-jitter each frame for crackle.
    this.beams.push({ x1, y1, x2, y2, color, life: 0, max, width });
  }

  screenFlash(color, max = 0.25) { this.flash = { color, t: 0, max }; }

  /** Four-point lens star at an impact. */
  flare(x, y, color = '#ffffff', size = 200) { this.flares.push({ x, y, color, size, life: 0, max: 0.22, rot: rand(-0.3, 0.3) }); }

  /** Light spilling onto the arena floor below an event. */
  pool(x, color, size = 260, max = 0.5) { this.pools.push({ x, color, size, life: 0, max }); }

  /** Kombat-style droplets that splash and stain the floor. */
  blood(x, y, dir = 1, n = 10) {
    if (!this.gore) return;
    for (let i = 0; i < n; i++) {
      const a = (dir > 0 ? 0 : Math.PI) + rand(-0.9, 0.5) * (dir > 0 ? 1 : -1);
      const sp = rand(250, 850);
      this.add({ type: 'blood', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - rand(150, 450), grav: 2200, max: 2, size: rand(3, 9), color: Math.random() < 0.7 ? '#8a0b0b' : '#c41414', drag: 0.4 });
    }
    for (let i = 0; i < n / 3; i++) this.add({ type: 'mist', x, y, vx: dir * rand(60, 260), vy: rand(-120, 40), max: rand(0.3, 0.6), size: rand(20, 45), color: '#7a0a0a', drag: 3 });
  }

  /** Soft smoke / dust clouds. */
  smoke(x, y, n = 6, color = '#4a4440', spread = 80, power = 1) {
    if (!this.enabled) return;
    for (let i = 0; i < n; i++) this.add({ type: 'smoke', x: x + rand(-spread, spread), y: y + rand(-20, 10), vx: rand(-120, 120) * power, vy: rand(-140, -30) * power, max: rand(0.7, 1.4), size: rand(40, 90) * power, color, drag: 2.2, alpha: rand(0.35, 0.6) });
  }

  /** Radial anime-style speed lines bursting out of an impact point. */
  speedLines(x, y, color, n = 28, len = 900) {
    if (!this.enabled) return;
    const rays = Array.from({ length: n }, () => ({ a: Math.random() * Math.PI * 2, r0: rand(60, 160), l: rand(len * 0.4, len), w: rand(2, 7) }));
    this.lines.push({ x, y, color, rays, life: 0, max: 0.2 });
  }

  /** Ambient element aura around a fighter. */
  aura(el, x, y, h, intensity = 1) {
    if (!this.enabled) return;
    const r = Math.random();
    if (r > 0.55 * intensity) return;
    const px = x + rand(-110, 110), py = y - rand(20, h * 0.9);
    switch (el.id) {
      case 'fire':
        this.add({ type: 'glow', x: px, y: py, vx: rand(-20, 20), vy: rand(-160, -60), max: rand(0.5, 1), size: rand(10, 26), color: Math.random() < 0.5 ? '#ff5a1a' : '#ffb347', drag: 0.6 });
        break;
      case 'lightning':
        if (Math.random() < 0.25) this.add({ type: 'arc', x: px, y: py, max: 0.09, size: rand(30, 70), color: '#7fd8ff' });
        else this.add({ type: 'glow', x: px, y: py, vx: rand(-40, 40), vy: rand(-40, 40), max: 0.25, size: rand(6, 14), color: '#37bfff' });
        break;
      case 'earth':
        if (Math.random() < 0.3) this.add({ type: 'rock', x: px, y: y - rand(0, 30), vx: rand(-30, 30), vy: rand(-220, -90), grav: 600, max: rand(0.6, 1), size: rand(4, 9), color: '#6f7a3a', vr: rand(-6, 6) });
        else this.add({ type: 'glow', x: px, y: py, vx: 0, vy: rand(-60, -20), max: 0.6, size: rand(8, 18), color: '#8fd14f' });
        break;
      case 'wind':
        this.add({ type: 'streak', x: px - 60, y: py, vx: rand(220, 420) * (Math.random() < 0.5 ? 1 : -1), vy: rand(-30, 10), max: rand(0.3, 0.6), size: rand(30, 70), color: '#e7f7ff', alpha: 0.5 });
        break;
    }
  }

  update(dt) {
    for (const p of this.parts) {
      p.life += dt;
      if (p.type === 'blood' && p.y >= this.ground && p.vy > 0) {
        p.life = p.max;
        if (this.decals.length > 60) this.decals.shift();
        this.decals.push({ x: p.x, r: p.size * rand(2.6, 4.2), life: 0, max: 6, color: Math.random() < 0.5 ? '#9a0e0e' : '#c01616' });
        continue;
      }
      p.vy += p.grav * dt;
      const d = Math.max(0, 1 - p.drag * dt);
      p.vx *= d; p.vy *= d;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
    this.parts = this.parts.filter((p) => p.life < p.max);
    for (const t of this.texts) { t.life += dt; t.y += t.vy * dt; t.vy *= 0.94; }
    this.texts = this.texts.filter((t) => t.life < t.max);
    for (const r of this.rings) { r.life += dt; r.r += r.grow * dt; }
    this.rings = this.rings.filter((r) => r.life < r.max);
    for (const b of this.beams) b.life += dt;
    this.beams = this.beams.filter((b) => b.life < b.max);
    if (this.flash) { this.flash.t += dt; if (this.flash.t > this.flash.max) this.flash = null; }
    for (const d of this.decals) d.life += dt;
    this.decals = this.decals.filter((d) => d.life < d.max);
    for (const f of this.flares) f.life += dt;
    this.flares = this.flares.filter((f) => f.life < f.max);
    for (const q of this.pools) q.life += dt;
    this.pools = this.pools.filter((q) => q.life < q.max);
    for (const l of this.lines) l.life += dt;
    this.lines = this.lines.filter((l) => l.life < l.max);
  }

  drawBack(g) {
    // floor stains
    for (const d of this.decals) {
      g.globalAlpha = 0.9 * Math.min(1, (d.max - d.life) / 1.5);
      g.fillStyle = d.color;
      g.beginPath(); g.ellipse(d.x, this.ground + 2, d.r, d.r * 0.28, 0, 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;
    // light pools on the floor
    if (this.pools.length) {
      g.save(); g.globalCompositeOperation = 'lighter';
      for (const q of this.pools) {
        const k = 1 - q.life / q.max;
        g.globalAlpha = 0.7 * k;
        g.drawImage(glowSprite(q.color), q.x - q.size, this.ground - q.size * 0.18, q.size * 2, q.size * 0.36);
      }
      g.restore();
    }
    // Rocks/smoke drawn with normal blending.
    for (const p of this.parts) {
      if (p.type !== 'rock') continue;
      const k = 1 - p.life / p.max;
      g.save();
      g.globalAlpha = Math.min(1, k * 2);
      g.translate(p.x, p.y); g.rotate(p.rot);
      g.fillStyle = p.color;
      g.beginPath();
      const s = p.size;
      g.moveTo(-s, -s * 0.6); g.lineTo(s * 0.4, -s); g.lineTo(s, s * 0.2); g.lineTo(-s * 0.2, s); g.closePath();
      g.fill();
      g.restore();
    }
  }

  drawFront(g) {
    // normal-blend layer: smoke, blood
    g.save();
    for (const p of this.parts) {
      const k = 1 - p.life / p.max;
      if (p.type === 'smoke') {
        const s = p.size * (1.6 - k * 0.6);
        g.globalAlpha = k * p.alpha;
        g.drawImage(glowSprite(p.color), p.x - s, p.y - s, s * 2, s * 2);
      } else if (p.type === 'blood') {
        g.globalAlpha = 1; g.fillStyle = p.color;
        g.beginPath(); g.ellipse(p.x, p.y, p.size, p.size * 0.7, Math.atan2(p.vy, p.vx), 0, Math.PI * 2); g.fill();
      } else if (p.type === 'mist') {
        g.globalAlpha = k * 0.5;
        g.drawImage(glowSprite(p.color), p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
      }
    }
    g.restore();
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (const f of this.flares) {
      const k = 1 - f.life / f.max, s = f.size * (0.6 + 0.8 * (1 - k));
      g.save(); g.translate(f.x, f.y); g.rotate(f.rot);
      for (const [w, col, a] of [[18, f.color, 0.5], [6, '#ffffff', 1]]) {
        g.globalAlpha = a * k; g.strokeStyle = col; g.lineWidth = w * k + 1; g.lineCap = 'round';
        g.beginPath(); g.moveTo(-s, 0); g.lineTo(s, 0); g.moveTo(0, -s * 0.6); g.lineTo(0, s * 0.6); g.stroke();
      }
      g.globalAlpha = k; g.drawImage(glowSprite('#ffffff'), -s * 0.3, -s * 0.3, s * 0.6, s * 0.6);
      g.restore();
    }
    for (const p of this.parts) {
      const k = 1 - p.life / p.max;
      if (p.type === 'glow') {
        const s = p.size * (0.6 + 0.4 * k);
        g.globalAlpha = k * p.alpha;
        g.drawImage(glowSprite(p.color), p.x - s, p.y - s, s * 2, s * 2);
      } else if (p.type === 'spark') {
        g.globalAlpha = k;
        g.strokeStyle = p.color; g.lineWidth = p.size;
        g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); g.stroke();
      } else if (p.type === 'streak') {
        g.globalAlpha = k * p.alpha;
        g.strokeStyle = p.color; g.lineWidth = 2;
        g.beginPath(); g.moveTo(p.x, p.y); g.quadraticCurveTo(p.x + p.size * 0.5, p.y - 8, p.x + p.size, p.y); g.stroke();
      } else if (p.type === 'arc') {
        g.globalAlpha = 0.9;
        g.strokeStyle = p.color; g.lineWidth = 2;
        g.beginPath();
        let x = p.x, y = p.y;
        g.moveTo(x, y);
        for (let i = 0; i < 4; i++) { x += rand(-p.size, p.size) * 0.5; y += rand(-p.size, p.size) * 0.5; g.lineTo(x, y); }
        g.stroke();
      }
    }
    for (const L of this.lines) {
      const k = 1 - L.life / L.max, grow = 1 + L.life * 6;
      for (const r of L.rays) {
        const c = Math.cos(r.a), s = Math.sin(r.a), a0 = r.r0 * grow, a1 = a0 + r.l * (0.4 + 0.6 * k);
        g.globalAlpha = k * 0.8; g.strokeStyle = Math.random() < 0.3 ? '#ffffff' : L.color; g.lineWidth = r.w * k + 0.5;
        g.beginPath(); g.moveTo(L.x + c * a0, L.y + s * a0); g.lineTo(L.x + c * a1, L.y + s * a1); g.stroke();
      }
    }
    for (const r of this.rings) {
      const k = 1 - r.life / r.max;
      g.globalAlpha = k;
      g.strokeStyle = r.color; g.lineWidth = r.w * k + 1;
      g.beginPath(); g.ellipse(r.x, r.y, r.r, r.r * 0.8, 0, 0, Math.PI * 2); g.stroke();
    }
    for (const b of this.beams) {
      const k = 1 - b.life / b.max;
      const segs = 14;
      for (const [w, col, a] of [[b.width * 2.6, b.color, 0.35], [b.width, b.color, 0.8], [b.width * 0.35, '#ffffff', 1]]) {
        g.globalAlpha = a * k;
        g.strokeStyle = col; g.lineWidth = w;
        g.lineJoin = 'round';
        g.beginPath(); g.moveTo(b.x1, b.y1);
        for (let i = 1; i < segs; i++) {
          const t = i / segs;
          g.lineTo(b.x1 + (b.x2 - b.x1) * t + rand(-8, 8), b.y1 + (b.y2 - b.y1) * t + rand(-26, 26));
        }
        g.lineTo(b.x2, b.y2); g.stroke();
      }
    }
    g.restore();

    // Damage numbers (normal blend for legibility)
    g.save();
    g.textAlign = 'center';
    g.lineJoin = 'round';
    for (const t of this.texts) {
      const k = 1 - t.life / t.max;
      const pop = t.life < 0.08 ? 0.7 + t.life * 5 : 1.1 - 0.1 * Math.min(1, t.life * 4);
      g.globalAlpha = Math.min(1, k * 2.2);
      g.font = `italic 900 ${Math.round(t.size * pop)}px "Barlow Condensed", Impact, sans-serif`;
      g.lineWidth = 7; g.strokeStyle = '#000000';
      g.strokeText(t.str, t.x, t.y);
      g.fillStyle = t.color;
      g.fillText(t.str, t.x, t.y);
    }
    g.restore();
  }

  drawScreen(g, w, h) {
    if (!this.flash) return;
    const k = 1 - this.flash.t / this.flash.max;
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.35 * k;
    g.fillStyle = this.flash.color;
    g.fillRect(0, 0, w, h);
    g.restore();
  }
}
