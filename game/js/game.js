// Battle engine: rounds, physics, hit detection, specials, rendering.
import { MOVES } from './data.js';
import { FX, glowSprite } from './fx.js';
import { sfx, announce, music, setPan } from './audio.js';
import { prefs } from './store.js';
import { AI } from './ai.js';
import { Fighter3DLayer } from './fighter3d.js';
import { ambient } from './vfx-ui.js';

const W = 1800, H = 900, GROUND = 822, FH = 540, GRAV = 2700;
const STAGE_L = 150, STAGE_R = W - 150, MIN_GAP = 215;
let uid = 1;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (t) => 1 - (1 - t) * (1 - t);

// ---------- Art preparation ----------
export const art = {};
let arenaImg = null;

function silhouette(img, color) {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
  return c;
}

export function prepareArt(fighters, images, arena) {
  arenaImg = arena;
  for (const f of fighters) {
    if (art[f.id]) continue;
    const img = images[f.id];
    art[f.id] = { img, white: silhouette(img, '#ffffff'), tint: silhouette(img, f.color), ar: img.naturalWidth / img.naturalHeight };
  }
}

// ---------- Fighter ----------
class Fighter {
  constructor(def, side, ctrl, label) {
    this.def = def; this.side = side; this.ctrl = ctrl; this.label = label;
    this.maxHp = def.hp;
    this.pips = 0;
    this.stats = { hits: 0, bestCombo: 0, damage: 0, specials: 0, blocks: 0 };
    this.reset();
  }
  reset() {
    this.hp = this.maxHp; this.trail = 1;
    this.energy = 20;
    this.x = this.side === 1 ? W / 2 - 330 : W / 2 + 330;
    this.y = 0; this.vx = 0; this.vy = 0;
    this.facing = this.side === 1 ? 1 : -1;
    this.state = 'idle'; this.t = 0; this.attack = null; this.stunT = 0; this.stunMax = 1;
    this.flash = 0; this.combo = 0; this.comboShow = 0; this.ghosts = []; this.ghostT = 0;
    this.walkPhase = 0; this.koT = 0; this.noEnergyT = 0;
  }
  get grounded() { return this.y <= 0.5; }
  get pct() { return this.hp / this.maxHp; }
}

// ---------- Game ----------
export class Game {
  /**
   * @param {HTMLElement} root
   * @param {{p1Def, p2Def, p1Ctrl, p2Ctrl, aiProfile, p1Name, p2Name, onEnd}} opts
   */
  constructor(root, opts) {
    this.opts = opts;
    this.net = opts.net || null; // 'host' | 'guest' for online matches
    this.root = root;
    this.fx = new FX();
    this.fx.enabled = prefs.particles;
    this.fx.ground = GROUND;
    this.fx.gore = prefs.blood !== false;
    this.beatT = 0;
    this.p1 = new Fighter(opts.p1Def, 1, opts.p1Ctrl, opts.p1Name);
    this.p2 = new Fighter(opts.p2Def, 2, opts.p2Ctrl, opts.p2Name);
    this.ai = opts.aiProfile ? new AI(this.p2, this.p1, this, opts.aiProfile) : null;
    this.roundTime = opts.roundTime || prefs.roundTime;
    this.need = Math.ceil((opts.rounds || prefs.rounds) / 2);
    this.round = 0;
    this.projectiles = []; this.eruptions = []; this.spikes = [];
    this.hitstop = 0; this.shake = 0; this.timeScale = 1;
    this.paused = false; this.time = 0;
    this.cam = W / 2;
    this.roundLog = [];
    this.GROUND = GROUND;
    this.buildDom();
    if (prefs.models3d !== false) {
      try {
        this.v3 = new Fighter3DLayer(this.glCanvas, this);
        this.v3.attach(this.p1, opts.p1Motion || null);
        this.v3.attach(this.p2, opts.p2Motion || null);
      } catch (e) { console.warn('3D unavailable, using 2D fighters:', e.message); this.v3 = null; }
    }
    this.resize = this.resize.bind(this);
    this.ro = new ResizeObserver(this.resize); this.ro.observe(this.canvas);
    this.resize();
    this.last = performance.now();
    this.frame = this.frame.bind(this);
    this.raf = requestAnimationFrame(this.frame);
    this.startRound();
  }

  get fighting() { return this.phase === 'fight'; }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    clearTimeout(this.bannerTimer);
    this.ai?.release();
  }

  setPaused(on) { this.paused = on; if (!on) this.last = performance.now(); }

  // ---------- DOM ----------
  buildDom() {
    const side = (f) => `
      <div class="hud-side p${f.side}">
        <div class="hud-name"><span>${escape(f.label)}</span><small style="color:${f.def.color}">${f.def.name.toUpperCase()}</small></div>
        <div class="hpbar"><i class="trail"></i><i class="fill" style="--c:${f.def.color}"></i></div>
        <div class="enbar"><i style="--c:${f.def.color}"></i><span>SPECIAL READY</span></div>
        <div class="pips">${'<b></b>'.repeat(this.need)}</div>
      </div>`;
    this.root.innerHTML = `
      <canvas class="battle-canvas" aria-label="Battle arena"></canvas>
      <canvas class="battle-canvas battle-gl" aria-hidden="true"></canvas>
      <canvas class="battle-canvas battle-fx" aria-hidden="true"></canvas>
      <div class="hud">${side(this.p1)}<div class="hud-timer"><span>${this.roundTime}</span><small>ROUND 1</small></div>${side(this.p2)}</div>
      <div class="lowhp" aria-hidden="true"></div>
      <div class="combo-pop p1"></div><div class="combo-pop p2"></div>
      <div class="banner" aria-live="assertive"></div>`;
    const cvs = this.root.querySelectorAll('canvas');
    this.canvas = cvs[0]; this.glCanvas = cvs[1]; this.fxCanvas = cvs[2];
    this.g = this.canvas.getContext('2d');
    this.gf = this.fxCanvas.getContext('2d');
    const q = (s) => this.root.querySelector(s);
    this.dom = {
      timer: q('.hud-timer span'), roundLabel: q('.hud-timer small'), timerBox: q('.hud-timer'), banner: q('.banner'),
      1: { fill: q('.p1 .fill'), trail: q('.p1 .trail'), en: q('.p1 .enbar'), enFill: q('.p1 .enbar i'), pips: [...this.root.querySelectorAll('.hud-side.p1 .pips b')], combo: q('.combo-pop.p1') },
      2: { fill: q('.p2 .fill'), trail: q('.p2 .trail'), en: q('.p2 .enbar'), enFill: q('.p2 .enbar i'), pips: [...this.root.querySelectorAll('.hud-side.p2 .pips b')], combo: q('.combo-pop.p2') },
    };
    this.hudCache = {};
    this.dom.lowhp = q('.lowhp');
    if (!matchMedia('(pointer: coarse)').matches) this.root.classList.add('intro-zoom');
    setTimeout(() => this.root.classList.remove('intro-zoom'), 1900);
    // foreground atmosphere (embers + floor fog)
    this.atmos = Array.from({ length: 46 }, () => this.newEmber(true));
    this.fog = Array.from({ length: 5 }, (_, i) => ({ x: i * 450, y: GROUND - 20 - Math.random() * 60, r: 300 + Math.random() * 200, v: 12 + Math.random() * 20 }));
  }

  newEmber(init) {
    return { x: this.cam - 1200 + Math.random() * 2400, y: init ? Math.random() * 900 : 940, vy: -(40 + Math.random() * 90), sway: Math.random() * 6, s: 3 + Math.random() * 6, c: Math.random() < 0.85 ? '#ff5a1a' : '#ffb347', t: Math.random() * 10 };
  }

  /** Play a sound positioned left/right by where it happens in the arena. */
  snd(x, fn) {
    const half = (this.viewW || W) / 2;
    setPan(Math.max(-1, Math.min(1, (x - this.cam) / half)) * 0.75);
    try { fn(); } finally { setPan(0); }
  }

  /** Element-coloured light washing over the arena. */
  tint(color, ms = 500) {
    if (!prefs.particles) return;
    const d = document.createElement('div');
    d.className = 'tint'; d.style.setProperty('--c', color); d.style.animationDuration = ms + 'ms';
    this.root.append(d); setTimeout(() => d.remove(), ms + 50);
  }

  /** Big combo call-out stamped across the screen. */
  callout(text, color) {
    const d = document.createElement('div');
    d.className = 'callout'; d.style.setProperty('--c', color); d.textContent = text;
    this.root.append(d); setTimeout(() => d.remove(), 1200);
  }

  /** Sparks flying off a health bar when it takes damage. */
  hudSparks(side, color) {
    const bar = this.dom[side].fill.parentElement.getBoundingClientRect();
    const f = side === 1 ? this.p1 : this.p2;
    const x = side === 1 ? bar.left + bar.width * f.pct : bar.right - bar.width * f.pct;
    ambient.burst(x, bar.top + bar.height / 2, color, 14, 0.6);
  }

  /** Screen-crack overlay radiating from the knockout point. */
  crack(def) {
    if (!prefs.particles) return;
    const camLeft = this.cam - this.viewW / 2;
    const cx = ((def.x - camLeft) / this.viewW) * 100, cy = ((GROUND - FH * 0.55 + this.offY) / this.viewH) * 100;
    let paths = '';
    for (let i = 0; i < 11; i++) {
      let a = (i / 11) * Math.PI * 2 + Math.random() * 0.4, x = cx, y = cy, d = `M${x} ${y}`;
      for (let k = 0; k < 6; k++) { a += (Math.random() - 0.5) * 0.7; const l = 4 + Math.random() * 9; x += Math.cos(a) * l; y += Math.sin(a) * l * 1.6; d += ` L${x.toFixed(1)} ${y.toFixed(1)}`; }
      paths += `<path d="${d}"/>`;
    }
    const svg = document.createElement('div');
    svg.className = 'crack';
    svg.innerHTML = `<svg viewBox="0 0 100 100" preserveAspectRatio="none">${paths}</svg>`;
    this.root.append(svg); setTimeout(() => svg.remove(), 2400);
  }

  /** Briefly toggle a VFX class on the battle root. */
  fxClass(cls, ms) {
    const r = this.root;
    r.classList.remove(cls); void r.offsetWidth; r.classList.add(cls);
    clearTimeout(this['_t' + cls]);
    this['_t' + cls] = setTimeout(() => r.classList.remove(cls), ms);
  }

  resize() {
    const dpr = Math.min(this.lowQ ? 1 : 1.5, window.devicePixelRatio || 1);
    const r = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(1, Math.round(r.width * dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * dpr));
    this.fxCanvas.width = this.canvas.width; this.fxCanvas.height = this.canvas.height;
    // Fit height, but never show less than MIN_VIEW_W of arena width (portrait phones).
    this.scale = Math.min(this.canvas.height / H, this.canvas.width / 1150);
    this.viewW = this.canvas.width / this.scale;
    this.viewH = this.canvas.height / this.scale;
    this.offY = (this.viewH - H) * 0.5;
  }

  banner(text, sub = '', ms = 1100, cls = '') {
    const b = this.dom.banner;
    b.className = 'banner ' + cls;
    b.innerHTML = `<strong>${text}</strong>${sub ? `<small>${sub}</small>` : ''}`;
    void b.offsetWidth;
    b.classList.add('show');
    clearTimeout(this.bannerTimer);
    if (ms) this.bannerTimer = setTimeout(() => b.classList.remove('show'), ms);
  }

  // ---------- Round flow ----------
  startRound() {
    this.round++;
    this.p1.reset(); this.p2.reset();
    this.projectiles = []; this.eruptions = []; this.spikes = [];
    this.fx.clear();
    this.clock = this.roundTime;
    this.timeScale = 1;
    this.phase = 'intro'; this.phaseT = 0;
    this.dom.roundLabel.textContent = `ROUND ${this.round}`;
    const final = this.p1.pips === this.need - 1 && this.p2.pips === this.need - 1 && this.need > 1;
    this.banner(final ? 'FINAL ROUND' : `ROUND ${this.round}`, '', 1200);
    announce(final ? 'Final round' : `Round ${this.round}`);
    sfx.round();
    this.introFight = false;
    this.finishShown = false;
  }

  endRound(winner, reason) {
    if (this.phase === 'roundover' || this.phase === 'end') return;
    this.phase = 'roundover'; this.phaseT = 0;
    if (winner) winner.pips++;
    else { this.p1.pips++; this.p2.pips++; }
    this.roundLog.push({ winner: winner ? winner.side : 0, reason, perfect: winner && winner.hp === winner.maxHp });
    this.updatePips();
    const matchWinner = [this.p1, this.p2].find((f) => f.pips >= this.need);
    if (matchWinner || this.round >= 9) {
      this.matchWinner = this.p1.pips === this.p2.pips ? null : this.p1.pips > this.p2.pips ? this.p1 : this.p2;
      this.phase = 'end'; this.phaseT = 0;
    }
  }

  updatePips() {
    for (const f of [this.p1, this.p2]) this.dom[f.side].pips.forEach((p, i) => p.classList.toggle('won', i < f.pips));
  }

  // ---------- Main loop ----------
  frame(now) {
    this.raf = requestAnimationFrame(this.frame);
    let dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    // Adaptive quality: if frames run slow for ~2 s, drop resolution and particle budget instead of lagging.
    this.slowAvg = (this.slowAvg ?? 0.016) * 0.97 + dt * 0.03;
    if (!this.lowQ && !this.paused && this.time > 3 && this.slowAvg > 0.026) {
      this.lowQ = true; this.fx.max = 350; this.resize();
      if (this.atmos) this.atmos.length = 20;
      console.info('Gesture Kombat: reduced effects quality for smoother play');
    }
    if (!this.paused) this.update(dt, now);
    this.render();
  }

  update(dt, now) {
    this.time += dt;
    this.shake = Math.max(0, this.shake - dt * 40);
    if (this.hitstop > 0) { this.hitstop -= dt * 1000; this.fx.update(dt * 0.15); return; }

    // Phase timers run in real time
    this.phaseT += dt;
    if (this.phase === 'intro') {
      if (this.phaseT > 1.35 && !this.introFight) {
        this.introFight = true; this.banner('FIGHT!', '', 800, 'fight'); announce('Fight!'); sfx.fight();
        this.tint('#ffb347', 500);
        this.fx.smoke(this.p1.x, GROUND - 10, 8, '#3a3230', 120, 1.3); this.fx.smoke(this.p2.x, GROUND - 10, 8, '#3a3230', 120, 1.3);
        this.fx.burst(this.cam, GROUND - 420, '#ffb347', 60, 2.2);
        this.fx.speedLines(this.cam, GROUND - 420, '#ffd36b', 40, 1400);
        this.fx.screenFlash('#ffd36b', 0.3); this.kick(14); this.fxClass('impact', 140); sfx.hit(true);
      }
      if (this.phaseT > 1.9) { this.phase = 'fight'; this.phaseT = 0; }
    } else if (this.phase === 'fight') {
      const before = Math.ceil(this.clock);
      this.clock -= dt;
      const after = Math.ceil(this.clock);
      if (after !== before && after <= 10 && after > 0) sfx.tick();
      if (!this.finishShown) {
        for (const [f, o] of [[this.p1, this.p2], [this.p2, this.p1]]) {
          if (o.pct < 0.15 && o.pct > 0 && f.pips === this.need - 1) {
            this.finishShown = true;
            this.banner('FINISH IT!', '', 1300, 'finish'); announce('Finish it!');
            this.fx.screenFlash('#ff2a14', 0.4); this.kick(10);
          }
        }
      }
      if (this.clock <= 0 && this.net !== 'guest') {
        this.clock = 0;
        const d = this.p1.pct - this.p2.pct;
        const w = Math.abs(d) < 0.001 ? null : d > 0 ? this.p1 : this.p2;
        this.banner('TIME', w ? `${escape(w.label)} WINS THE ROUND` : 'DRAW', 1800);
        announce('Time');
        this.phase = 'timeup'; this.phaseT = 0; this.pendingWinner = w;
      }
    } else if (this.phase === 'ko') {
      this.timeScale = this.phaseT < 1.5 ? 0.22 : 1;
      if (this.phaseT > 2.4 && this.net !== 'guest') this.endRound(this.pendingWinner, 'ko');
    } else if (this.phase === 'timeup') {
      if (this.phaseT > 2 && this.net !== 'guest') this.endRound(this.pendingWinner, 'time');
    } else if (this.phase === 'roundover') {
      if (this.phaseT > 0.6 && this.net !== 'guest') this.startRound();
    } else if (this.phase === 'end') {
      if (this.phaseT < dt * 1.5) {
        const w = this.matchWinner;
        if (w) { w.state = 'win'; this.banner(`${escape(w.label)} WINS`, w.hp === w.maxHp ? 'FLAWLESS VICTORY' : '', 0, 'win'); announce(w.hp === w.maxHp ? `${w.def.name} wins. Flawless victory.` : `${w.def.name} wins`); }
        else this.banner('DRAW', '', 0);
      }
      if (this.phaseT > 3 && !this.ended) {
        this.ended = true;
        this.opts.onEnd?.({
          winner: this.matchWinner ? this.matchWinner.side : 0,
          p1: this.p1.stats, p2: this.p2.stats,
          rounds: this.roundLog,
          perfect: this.roundLog.some((r) => r.winner === 1 && r.perfect),
          kos: this.roundLog.filter((r) => r.winner === 1 && r.reason === 'ko').length,
        });
      }
    }

    const sdt = dt * this.timeScale;
    this.ai?.update(sdt, now);
    for (const [f, o] of [[this.p1, this.p2], [this.p2, this.p1]]) this.updateFighter(f, o, sdt);
    this.v3?.update(sdt);
    const charging = [this.p1, this.p2].some((f) => f.attack?.kind === 'special' && f.attack.phase === 'startup');
    if (charging !== this.root.classList.contains('charging')) this.root.classList.toggle('charging', charging);
    this.separate();
    this.updateSpecials(sdt);
    this.fx.update(sdt);
    this.updateCamera(dt);
    this.updateHud();
  }

  // ---------- Fighters ----------
  updateFighter(f, o, dt) {
    f.t += dt;
    f.flash = Math.max(0, f.flash - dt * 5);
    f.noEnergyT = Math.max(0, f.noEnergyT - dt);
    if (f.comboShow > 0) f.comboShow -= dt;
    if (this.fighting) f.energy = Math.min(100, f.energy + dt * 3.5);
    const canAct = this.fighting;

    if (f.state === 'ko') {
      f.koT += dt;
    } else if (f.state === 'hit') {
      f.stunT -= dt * 1000;
      if (f.stunT <= 0 && f.grounded) { f.state = 'idle'; o.combo = 0; }
    } else if (f.state === 'win') {
      // celebrate
    } else if (f.attack) {
      this.advanceAttack(f, o, dt);
    } else if (canAct) {
      this.handleInput(f, o, dt);
    } else if (f.grounded) {
      f.state = 'idle';
      f.ctrl.take();
    }

    // Physics
    if (!f.grounded || f.vy > 0) {
      f.vy -= GRAV * dt;
      f.y += f.vy * dt;
      if (f.y <= 0) {
        f.y = 0; f.vy = 0;
        if (f.state === 'jump') f.state = 'idle';
        this.snd(f.x, () => sfx.land());
        this.fx.smoke(f.x, GROUND - 6, 4, '#463e3a', 70, 0.8);
        for (let i = 0; i < 6; i++) this.fx.add({ type: 'glow', x: f.x + (Math.random() - 0.5) * 120, y: GROUND - 6, vx: (Math.random() - 0.5) * 200, vy: -30, max: 0.4, size: 22, color: '#665a52', alpha: 0.5, drag: 3 });
      }
    }
    f.x += f.vx * dt;
    const walking = f.state === 'walk' || (!f.grounded && !['hit', 'ko'].includes(f.state));
    if (!walking) f.vx *= Math.exp(-(f.state === 'ko' ? 3 : 9) * dt);
    if (f.x < STAGE_L || f.x > STAGE_R) { f.x = clamp(f.x, STAGE_L, STAGE_R); if (f.state === 'hit') f.vx *= -0.2; }

    if (f.grounded && !f.attack && !['hit', 'ko', 'win'].includes(f.state)) f.facing = Math.sign(o.x - f.x) || f.facing;

    // Afterimages
    f.ghostT -= dt;
    const fast = f.attack?.phase === 'active' || Math.abs(f.vx) > 520 || f.state === 'hit';
    if (fast && f.ghostT <= 0 && prefs.particles) { f.ghostT = 0.035; f.ghosts.push({ ...this.pose(f), x: f.x, y: f.y, facing: f.facing, life: 0 }); }
    for (const gh of f.ghosts) gh.life += dt;
    f.ghosts = f.ghosts.filter((gh) => gh.life < 0.22);

    if (f.state !== 'ko') this.fx.aura(f.def, f.x, GROUND - f.y, FH, f.state === 'win' ? 2 : f.energy >= MOVES.special.cost ? 0.9 : 0.5);
  }

  handleInput(f, o, dt) {
    const c = f.ctrl;
    const a = c.take();
    if (a === 'punch' || a === 'kick' || a === 'double') return this.startAttack(f, a);
    if (a === 'special') {
      if (f.energy >= MOVES.special.cost) return this.startSpecial(f, o);
      if (f.noEnergyT <= 0) { f.noEnergyT = 0.8; this.fx.text(f.x, GROUND - FH - 30, 'NEED ENERGY', '#9aa4ad', 30); }
    }
    let dir = c.dir();
    if (!dir && c.isHeld('forward')) dir = f.facing; // marching in place / stepping in = advance
    if (!dir && c.isHeld('back')) dir = -f.facing; // stepping away from the camera = retreat
    const run = c.isHeld('run') && dir === f.facing ? 1.75 : 1;
    if (a === 'jump' && f.grounded && f.state !== 'crouch') {
      f.vy = 1180 * f.def.jump; f.y = 1; f.state = 'jump';
      f.vx = dir * f.def.speed * 0.95;
      this.snd(f.x, () => sfx.jump());
      return;
    }
    if (!f.grounded) { f.vx += dir * 900 * dt; f.vx = clamp(f.vx, -f.def.speed, f.def.speed); return; }
    if (c.isHeld('block')) { f.state = 'block'; f.vx = 0; }
    else if (c.isHeld('crouch')) { f.state = 'crouch'; f.vx = 0; }
    else if (dir) {
      const back = dir !== f.facing;
      f.vx = dir * f.def.speed * (back ? 0.75 : 1) * run;
      f.state = 'walk';
      f.walkPhase += dt * (back ? 9 : 11) * run;
      const stepN = Math.floor(f.walkPhase / Math.PI);
      if (stepN !== f.lastStep) { f.lastStep = stepN; this.snd(f.x, () => sfx.step(run > 1)); }
      if (run > 1 && Math.random() < dt * 14) this.fx.smoke(f.x - f.facing * 40, GROUND - 6, 1, '#463e3a', 30, 0.6);
    } else { f.state = 'idle'; f.vx = 0; }
  }

  startAttack(f, kind) {
    const m = MOVES[kind], k = f.def.frameMul;
    f.attack = { id: uid++, kind, move: m, phase: 'startup', t: 0, su: m.startup * k, ac: m.active * k, re: m.recovery * k, hit: false };
    f.state = kind;
    if (f.grounded) f.vx = f.facing * (kind === 'punch' ? 160 : 90);
    this.snd(f.x, () => sfx.whoosh(kind !== 'punch'));
  }

  startSpecial(f, o) {
    const m = MOVES.special, k = f.def.frameMul;
    f.energy -= m.cost;
    f.stats.specials++;
    f.attack = { id: uid++, kind: 'special', move: m, phase: 'startup', t: 0, su: m.startup * k, ac: m.active * k, re: m.recovery * k, hit: true, targetX: clamp(o.x, STAGE_L, STAGE_R) };
    f.state = 'special';
    if (f.grounded) f.vx = 0;
    this.snd(f.x, () => sfx.charge());
    this.root.classList.add('charging');

    if (f.def.id === 'earth') this.eruptions.push({ id: uid++, owner: f, x: f.attack.targetX, t: 0, warn: 0.62, fired: false });
  }

  advanceAttack(f, o, dt) {
    const a = f.attack;
    a.t += dt * 1000;
    if (a.phase === 'startup') {
      if (a.kind === 'special') this.chargeFx(f, a.t / a.su);
      if (a.t >= a.su) { a.phase = 'active'; if (a.kind === 'special') this.fireSpecial(f, o); }
    }
    if (a.phase === 'active') {
      if (!a.hit) this.tryHit(f, o, a);
      if (a.t >= a.su + a.ac) a.phase = 'recovery';
    }
    if (a.t >= a.su + a.ac + a.re) { f.attack = null; f.state = f.grounded ? 'idle' : 'jump'; }
  }

  handPoint(f) { return this.v3?.handPoint(f) || { x: f.x + f.facing * FH * 0.3, y: GROUND - f.y - FH * 0.6 }; }

  chargeFx(f, p) {
    const h = this.handPoint(f);
    if (Math.random() < 0.7) {
      const ang = Math.random() * Math.PI * 2, r = 120 * (1 - p) + 30;
      this.fx.add({ type: 'glow', x: h.x + Math.cos(ang) * r, y: h.y + Math.sin(ang) * r, vx: -Math.cos(ang) * 300, vy: -Math.sin(ang) * 300, max: 0.2, size: 14, color: f.def.color, drag: 1 });
    }
  }

  tryHit(att, def, a) {
    const m = a.move;
    const dx = (def.x - att.x) * att.facing;
    if (dx < -30 || dx > m.range) return;
    if (def.state === 'ko') return;
    const attAir = att.y > 40, defAir = def.y > 70;
    if ((a.kind === 'punch' || a.kind === 'double') && def.state === 'crouch' && !attAir) return;
    if (a.kind === 'kick' && defAir && !attAir) return;
    a.hit = true;
    this.applyHit(att, def, {
      dmg: m.dmg * att.def.power, knock: m.knock, stun: m.stun, hitstop: m.hitstop, shake: m.shake,
      heavy: a.kind !== 'punch', hy: GROUND - def.y - FH * (a.kind === 'kick' ? 0.42 : 0.68),
    });
  }

  applyHit(att, def, h) {
    if (def.state === 'ko' || !(this.fighting)) return;
    const dirToAtt = Math.sign(att.x - def.x) || -att.facing;
    const blocking = def.state === 'block' && dirToAtt === def.facing && def.grounded;
    const hx = def.x + dirToAtt * 60;
    const hy = h.hy ?? GROUND - def.y - FH * 0.55;
    let dmg;
    if (blocking) {
      dmg = h.dmg * 0.2;
      def.vx = -dirToAtt * h.knock * 0.55;
      def.energy = Math.min(100, def.energy + 5);
      def.stats.blocks++;
      this.fx.blockSpark(hx, hy, def.def.color);
      this.fx.text(hx, hy - 40, 'BLOCK', '#cfe8ff', 34);
      this.snd(hx, () => sfx.block());
      this.fx.flare(hx, hy, '#cfe8ff', 140);
      this.hitstop = 50; this.kick(4);
    } else {
      att.combo = def.state === 'hit' ? att.combo + 1 : 1;
      const scale = Math.pow(0.9, Math.max(0, att.combo - 1));
      dmg = (h.dmg * scale) / def.def.defense;
      def.state = 'hit'; def.attack = null;
      def.stunT = def.stunMax = h.stun;
      def.vx = -dirToAtt * h.knock;
      if (h.launch || def.y > 30) { def.vy = h.launch || 420; def.y = Math.max(def.y, 1); }
      def.flash = 1;
      att.energy = Math.min(100, att.energy + 9);
      def.energy = Math.min(100, def.energy + 6);
      att.stats.hits++;
      att.stats.bestCombo = Math.max(att.stats.bestCombo, att.combo);
      this.fx.burst(hx, hy, att.def.color, h.heavy ? 30 : 18, h.heavy ? 1.35 : 1, -dirToAtt);
      this.fx.burst(hx, hy, '#ffffff', 6, 0.6, -dirToAtt);
      if (prefs.damageNumbers) this.fx.text(hx, hy - 50, String(Math.max(1, Math.round(dmg))), att.def.accent2 || '#fff', h.heavy ? 56 : 44);
      this.snd(hx, () => sfx.hit(h.heavy));
      this.fx.blood(hx, hy, -dirToAtt, h.heavy ? 22 : 11);
      this.fx.flare(hx, hy, att.def.color, h.heavy ? 300 : 190);
      this.fx.pool(def.x, att.def.color, h.heavy ? 340 : 220);
      this.hudSparks(def.side, att.def.color);
      this.hitstop = h.hitstop; this.kick(h.shake);
      this.fxClass('impact', 110);
      if (h.heavy) { this.fxClass('zoompunch', 190); this.fx.speedLines(hx, hy, att.def.color, h.hitstop >= 120 ? 36 : 22); }
      if (h.hitstop >= 120) this.fxClass('chroma', 170);
      const bar = this.dom[def.side].fill.parentElement; bar.classList.remove('hit'); void bar.offsetWidth; bar.classList.add('hit');
      if (att.combo >= 2) {
        att.comboShow = 1.2;
        const el = this.dom[att.side].combo;
        el.innerHTML = `<b>${att.combo}</b> HIT COMBO`;
        el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
        sfx.combo(att.combo);
        const call = { 3: 'BRUTAL!', 5: 'SAVAGE!', 7: 'UNSTOPPABLE!', 10: 'GODLIKE!' }[att.combo];
        if (call) { this.callout(call, att.def.color); announce(call.slice(0, -1).toLowerCase()); }
      }
    }
    att.stats.damage += dmg;
    def.hp = Math.max(0, def.hp - dmg);
    if (def.hp <= 0) { if (this.net === 'guest') def.hp = 1; else this.knockout(def, att); } // online: the host referees K.O.s
  }

  // ---------- Online ----------
  /** Host's referee data, sent to the guest ~12x a second. */
  netSnapshot() {
    const r1 = (v) => Math.round(v * 10) / 10;
    return {
      r: this.round, ph: this.phase, c: r1(this.clock),
      hp: [r1(this.p1.hp), r1(this.p2.hp)], en: [r1(this.p1.energy), r1(this.p2.energy)], pp: [this.p1.pips, this.p2.pips],
      st: [this.p1.state, this.p2.state],
      ko: this.phase === 'ko' && this.pendingWinner ? this.pendingWinner.side : 0,
      mw: this.phase === 'end' ? (this.matchWinner ? this.matchWinner.side : 0) : -1,
      log: this.phase === 'end' ? this.roundLog : undefined,
    };
  }

  /** Apply the friend's packet: their fighter's movement, and (on the guest) the host's referee data. */
  netApply(m, theirs) {
    if (typeof m.x === 'number' && theirs.state !== 'ko') {
      const dx = m.x - theirs.x, dy = m.y - theirs.y;
      if (Math.abs(dx) > 260) theirs.x = m.x; else theirs.x += dx * 0.5;
      if (Math.abs(dy) > 200) theirs.y = m.y; else theirs.y += dy * 0.5;
      theirs.vx = m.vx; if (m.y > 1) theirs.vy = m.vy;
    }
    if (this.net !== 'guest' || m.r === undefined) return;
    const F = [this.p1, this.p2];
    if (m.r > this.round) { this.round = m.r - 1; this.startRound(); }
    F.forEach((f, i) => {
      const before = f.hp;
      f.hp = m.hp[i]; f.energy = m.en[i];
      if (f.pips !== m.pp[i]) { f.pips = m.pp[i]; this.updatePips(); }
      if (m.st[i] === 'hit' && f.state !== 'hit' && f.state !== 'ko' && m.hp[i] < before - 0.5) { f.state = 'hit'; f.attack = null; f.stunT = f.stunMax = 260; f.flash = 1; }
    });
    if (this.phase === 'fight') this.clock = m.c;
    if (m.ph === 'ko' && m.ko && !['ko', 'roundover', 'end'].includes(this.phase)) {
      const winner = F[m.ko - 1], loser = F[2 - m.ko];
      loser.hp = 0; this.knockout(loser, winner);
    } else if (m.ph === 'timeup' && this.phase === 'fight') {
      this.clock = 0; this.banner('TIME', '', 1800); announce('Time'); this.phase = 'timeup'; this.phaseT = 0;
    } else if (m.ph === 'end' && this.phase !== 'end') {
      this.roundLog = m.log || this.roundLog;
      this.matchWinner = m.mw ? F[m.mw - 1] : null;
      this.phase = 'end'; this.phaseT = 0;
    } else if (m.ph === 'roundover' && !['roundover', 'end'].includes(this.phase)) {
      this.phase = 'roundover'; this.phaseT = 0;
    }
  }

  knockout(def, att) {
    def.state = 'ko'; def.koT = 0; def.attack = null;
    def.vx = (Math.sign(def.x - att.x) || 1) * 520; def.vy = 620; def.y = Math.max(1, def.y);
    att.attack = null; att.state = att.grounded ? 'idle' : 'jump';
    this.phase = 'ko'; this.phaseT = 0; this.pendingWinner = att;
    this.root.classList.remove('charging');
    {
      const camLeft = this.cam - this.viewW / 2;
      const ox = Math.max(10, Math.min(90, ((def.x - camLeft) / this.viewW) * 100));
      const oy = Math.max(20, Math.min(85, ((GROUND - FH * 0.5 + this.offY) / this.viewH) * 100));
      this.root.style.transformOrigin = `${ox}% ${oy}%`;
      this.root.classList.add('ko-zoom');
      clearTimeout(this._koz); this._koz = setTimeout(() => this.root.classList.remove('ko-zoom'), 1700);
    }
    this.fx.speedLines(def.x, GROUND - FH * 0.55, '#ffffff', 48, 1600);
    for (let i = 0; i < 3; i++) this.fx.beam(def.x + (Math.random() - 0.5) * 300, -this.offY - 50, def.x + (Math.random() - 0.5) * 120, GROUND - FH * 0.6, '#d6f1ff', 0.35, 8);
    this.hitstop = 160; this.kick(22);
    this.fx.screenFlash('#ffffff', 0.35);
    const perfect = att.hp === att.maxHp;
    this.banner('K.O.', perfect ? 'PERFECT' : '', 2200, 'ko');
    sfx.ko();
    this.tint('#ffffff', 300);
    this.fx.blood(def.x, GROUND - FH * 0.55, Math.sign(def.x - att.x) || 1, 40);
    this.fx.smoke(def.x, GROUND - 20, 12, '#3a3230', 160, 1.6);
    this.crack(def);
    announce(perfect ? 'Perfect' : 'K O');
    this.projectiles = []; this.eruptions = [];
  }

  kick(n) { if (prefs.shake) this.shake = Math.max(this.shake, n); }

  separate() {
    const a = this.p1, b = this.p2;
    if (a.state === 'ko' || b.state === 'ko') return;
    const dx = b.x - a.x;
    const vertical = Math.abs(a.y - b.y) > FH * 0.5;
    if (!vertical && Math.abs(dx) < MIN_GAP) {
      const push = (MIN_GAP - Math.abs(dx)) / 2, s = Math.sign(dx) || 1;
      a.x -= push * s; b.x += push * s;
      a.x = clamp(a.x, STAGE_L, STAGE_R); b.x = clamp(b.x, STAGE_L, STAGE_R);
    }
    // keep both on screen
    const maxGap = Math.min(STAGE_R - STAGE_L, this.viewW - 260);
    if (Math.abs(b.x - a.x) > maxGap) {
      const mid = (a.x + b.x) / 2, s = Math.sign(b.x - a.x);
      a.x = mid - (s * maxGap) / 2; b.x = mid + (s * maxGap) / 2;
    }
  }

  // ---------- Specials ----------
  fireSpecial(f, o) {
    const el = f.def.id, p = f.def.power, h = this.handPoint(f);
    this.root.classList.remove('charging');
    this.fx.speedLines(h.x, h.y, f.def.color, 30, 1100);
    this.snd(f.x, () => sfx.special(el));
    this.fx.screenFlash(f.def.color, 0.28);
    this.tint(f.def.color, 650);
    this.fx.pool(f.x, f.def.color, 420, 0.8);
    this.fx.flare(h.x, h.y, f.def.color, 380);
    this.kick(8);
    if (el === 'fire') {
      this.projectiles.push({ id: uid++, owner: f, kind: 'orb', x: h.x, y: FH * 0.6, vx: f.facing * 980, r: 50, dmg: 16 * p, knock: 420, stun: 460, color: f.def.color, life: 0 });
    } else if (el === 'wind') {
      this.projectiles.push({ id: uid++, owner: f, kind: 'tornado', x: f.x + f.facing * 140, y: 0, vx: f.facing * 640, r: 80, dmg: 12 * p, knock: 1150, launch: 650, stun: 620, color: f.def.color, life: 0 });
    } else if (el === 'lightning') {
      const dx = (o.x - f.x) * f.facing;
      const hits = dx > 0 && dx < 1050 && o.y < 160 && o.state !== 'ko';
      const endX = hits ? o.x : f.x + f.facing * 1050;
      const endY = hits ? GROUND - o.y - FH * 0.55 : h.y;
      this.fx.beam(h.x, h.y, endX, endY, '#5fd0ff', 0.3, 12);
      this.fx.beam(h.x, h.y, endX, endY, '#ffffff', 0.18, 4);
      for (let i = 0; i < 4; i++) {
        const t = 0.25 + Math.random() * 0.6, bx = h.x + (endX - h.x) * t, by = h.y + (endY - h.y) * t;
        this.fx.beam(bx, by, bx + (Math.random() - 0.3) * 260 * f.facing, by + (Math.random() - 0.5) * 300, '#8fe0ff', 0.22, 4);
      }
      this.fx.beam(endX, -this.offY - 40, endX + (Math.random() - 0.5) * 80, endY, '#d6f1ff', 0.25, 10);
      this.fx.screenFlash('#cfeeff', 0.35);
      if (hits) this.applyHit(f, o, { dmg: 13 * p, knock: 240, stun: 820, hitstop: 130, shake: 10, heavy: true, hy: endY });
    }
  }

  updateSpecials(dt) {
    const fighters = [this.p1, this.p2];
    for (const pr of this.projectiles) {
      pr.life += dt;
      pr.x += pr.vx * dt;
      if (pr.kind === 'orb') {
        this.fx.add({ type: 'glow', x: pr.x - Math.sign(pr.vx) * 20, y: GROUND - pr.y + (Math.random() - 0.5) * 30, vx: -pr.vx * 0.2, vy: -60 - Math.random() * 80, max: 0.4, size: 30 + Math.random() * 20, color: Math.random() < 0.5 ? '#ff5a1a' : '#ffb347', drag: 2 });
        if (Math.random() < 0.5) this.fx.add({ type: 'smoke', x: pr.x - Math.sign(pr.vx) * 50, y: GROUND - pr.y, vx: -pr.vx * 0.05, vy: -40, max: 0.9, size: 40, color: '#2e2522', drag: 1.5, alpha: 0.45 });
        if (Math.random() < 0.3) this.fx.pool(pr.x, '#ff5a1a', 200, 0.25);
      } else {
        if (Math.random() < 0.8) this.fx.add({ type: 'streak', x: pr.x - 80 + Math.random() * 60, y: GROUND - Math.random() * 300, vx: (Math.random() < 0.5 ? -1 : 1) * 400, vy: -40, max: 0.3, size: 60, color: '#e7f7ff', alpha: 0.6 });
        if (Math.random() < 0.35) this.fx.smoke(pr.x, GROUND - 10, 1, '#5a5652', 60, 0.8);
        if (Math.random() < 0.25) this.fx.add({ type: 'rock', x: pr.x + (Math.random() - 0.5) * 120, y: GROUND - Math.random() * 280, vx: (Math.random() - 0.5) * 500, vy: -200 - Math.random() * 300, grav: 900, max: 0.7, size: 4 + Math.random() * 5, color: '#6a6258', vr: 10 });
      }
      const o = fighters.find((f) => f !== pr.owner);
      const reachY = pr.kind === 'orb' ? 150 : 175;
      if (!pr.dead && Math.abs(o.x - pr.x) < pr.r + 60 && o.y < reachY && o.state !== 'ko') {
        pr.dead = true;
        if (pr.kind === 'orb') { this.fx.burst(pr.x, GROUND - pr.y, '#ff6a1a', 50, 1.8); this.fx.smoke(pr.x, GROUND - pr.y, 10, '#2e2522', 90, 1.4); this.snd(pr.x, () => sfx.explode(0.7)); }
        else { this.fx.smoke(o.x, GROUND - 40, 10, '#6a6660', 140, 1.3); }
        this.applyHit(pr.owner, o, { dmg: pr.dmg, knock: pr.knock, stun: pr.stun, hitstop: 120, shake: 12, heavy: true, launch: pr.launch, hy: GROUND - FH * 0.55 });
      }
      if (pr.x < -200 || pr.x > W + 200) pr.dead = true;
    }
    // projectile clashes
    for (const a of this.projectiles) for (const b of this.projectiles) {
      if (a !== b && a.owner !== b.owner && !a.dead && !b.dead && Math.abs(a.x - b.x) < a.r + b.r) {
        a.dead = b.dead = true;
        this.fx.burst((a.x + b.x) / 2, GROUND - FH * 0.5, '#ffffff', 30, 1.4);
        sfx.hit(true); this.kick(8);
      }
    }
    this.projectiles = this.projectiles.filter((p) => !p.dead);

    for (const e of this.eruptions) {
      e.t += dt;
      if (!e.fired) {
        if (Math.random() < 0.6) this.fx.add({ type: 'rock', x: e.x + (Math.random() - 0.5) * 180, y: GROUND, vx: (Math.random() - 0.5) * 60, vy: -150 - Math.random() * 150, grav: 900, max: 0.5, size: 4 + Math.random() * 4, color: '#7c6a4c', vr: 5 });
        if (e.t >= e.warn) {
          e.fired = true;
          this.spikes.push({ x: e.x, t: 0, max: 0.75, seed: Math.random() * 1000 });
          this.kick(14);
          for (let i = 0; i < 26; i++) this.fx.add({ type: 'rock', x: e.x + (Math.random() - 0.5) * 220, y: GROUND - 10, vx: (Math.random() - 0.5) * 500, vy: -500 - Math.random() * 700, grav: 1800, max: 1.1, size: 6 + Math.random() * 10, color: Math.random() < 0.5 ? '#6f6047' : '#8a7a5a', vr: (Math.random() - 0.5) * 12 });
          this.fx.burst(e.x, GROUND - 40, '#a5dc66', 30, 1.5);
          this.fx.smoke(e.x, GROUND - 20, 14, '#4f4636', 160, 1.5);
          this.fx.pool(e.x, '#a5dc66', 380, 0.7);
          this.fxClass('zoompunch', 190);
          const o = fighters.find((f) => f !== e.owner);
          if (Math.abs(o.x - e.x) < 130 && o.y < 70) this.applyHit(e.owner, o, { dmg: 20 * e.owner.def.power, knock: 160, stun: 700, hitstop: 140, shake: 14, heavy: true, launch: 820, hy: GROUND - FH * 0.35 });
        }
      }
    }
    this.eruptions = this.eruptions.filter((e) => !e.fired);
    for (const s of this.spikes) s.t += dt;
    this.spikes = this.spikes.filter((s) => s.t < s.max);
  }

  updateCamera(dt) {
    const mid = (this.p1.x + this.p2.x) / 2;
    const half = this.viewW / 2;
    const target = this.viewW >= W ? W / 2 : clamp(mid, half, W - half);
    this.cam += (target - this.cam) * Math.min(1, dt * 6);
  }

  updateHud() {
    const c = this.hudCache;
    for (const f of [this.p1, this.p2]) {
      const d = this.dom[f.side];
      const pct = f.pct;
      f.trail = f.trail > pct ? Math.max(pct, f.trail - 0.35 * (1 / 60)) : pct;
      const key = `${f.side}`;
      const vals = [pct.toFixed(3), f.trail.toFixed(3), Math.floor(f.energy), f.energy >= MOVES.special.cost];
      const s = vals.join('|');
      if (c[key] === s) continue;
      c[key] = s;
      d.fill.style.transform = `scaleX(${pct})`;
      d.trail.style.transform = `scaleX(${f.trail})`;
      d.enFill.style.transform = `scaleX(${f.energy / 100})`;
      d.en.classList.toggle('ready', vals[3]);
      if (vals[3] && this.fighting && !f.readyChimed) this.snd(f.x, () => sfx.ready());
      f.readyChimed = vals[3];
      d.fill.parentElement.classList.toggle('low', pct < 0.25);
    }
    const danger = (this.p1.pct < 0.25 && this.p1.pct > 0) || (!this.ai && this.p2.pct < 0.25 && this.p2.pct > 0);
    if (c.danger !== danger) { c.danger = danger; this.dom.lowhp.classList.toggle('on', danger && this.phase === 'fight'); }
    if (danger && this.phase === 'fight' && !this.paused) {
      this.beatT -= 1 / 60;
      if (this.beatT <= 0) { this.beatT = 0.95; sfx.heartbeat(); }
    }
    music.setIntensity(1 - Math.min(this.p1.pct, this.p2.pct));
    const sec = Math.ceil(this.clock);
    if (c.t !== sec) { c.t = sec; this.dom.timer.textContent = sec; this.dom.timerBox.classList.toggle('urgent', sec <= 10 && this.phase === 'fight'); }
  }

  // ---------- Rendering ----------
  pose(f) {
    let rot = 0, sx = 1, sy = 1, ox = 0, oy = 0;
    const T = this.time;
    switch (f.state) {
      case 'idle': sy = 1 + 0.014 * Math.sin(T * 3 + f.side); sx = 1 - 0.007 * Math.sin(T * 3 + f.side); break;
      case 'walk': oy = -Math.abs(Math.sin(f.walkPhase)) * 10; rot = 0.045 * Math.sign(f.vx) * f.facing; break;
      case 'crouch': sy = 0.74; sx = 1.07; break;
      case 'block': rot = -0.06; ox = -14; break;
      case 'jump': rot = -0.07 * Math.sign(f.vy); sy = f.vy > 300 ? 1.07 : 1; sx = 2 - sy; break;
      case 'hit': {
        const k = Math.max(0, f.stunT / f.stunMax);
        rot = -0.16 * k; ox = -18 * k;
        if (f.stunMax - f.stunT < 110) ox += (Math.random() - 0.5) * 10;
        break;
      }
      case 'ko': { const k = Math.min(1, f.koT * 2.2); rot = -1.4 * ease(k); oy = 0; sx = 1; break; }
      case 'win': sy = 1.03 + 0.02 * Math.sin(T * 4); break;
    }
    const a = f.attack;
    if (a) {
      const total = a.su + a.ac;
      let p;
      if (a.phase === 'startup') { p = a.t / a.su; rot = -0.05 * p; ox = -14 * p; }
      else if (a.phase === 'active') { p = (a.t - a.su) / a.ac; }
      else { p = 1 - (a.t - total) / a.re; }
      if (a.phase !== 'startup') {
        if (a.kind === 'punch') { rot = 0.1 * p; ox = 60 * p; sx = 1 + 0.05 * p; }
        else if (a.kind === 'kick') { rot = -0.14 * p; ox = 45 * p; sy = 1 + 0.03 * p; }
        else { rot = 0.06 * p; ox = 30 * p; sx = 1 + 0.08 * p; sy = 1 - 0.03 * p; }
      }
    }
    return { rot, sx, sy, ox, oy };
  }

  render() {
    const g = this.g, cw = this.canvas.width, ch = this.canvas.height, s = this.scale;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#05080c'; g.fillRect(0, 0, cw, ch);
    const camLeft = this.cam - this.viewW / 2;
    const sxk = (Math.random() - 0.5) * this.shake * 2, syk = (Math.random() - 0.5) * this.shake * 2;
    g.setTransform(s, 0, 0, s, (-camLeft + sxk) * s, (syk + this.offY) * s);

    this.drawBackground(g, camLeft);
    // eruption warnings
    for (const e of this.eruptions) {
      const k = e.t / e.warn;
      g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.4 + 0.5 * k;
      const r = 90 + 40 * Math.sin(e.t * 30);
      g.drawImage(glowSprite('#a5dc66'), e.x - r * 1.6, GROUND - r * 0.5, r * 3.2, r);
      g.restore();
    }
    for (const f of [this.p1, this.p2]) this.drawShadow(g, f);
    this.fx.drawBack(g);
    const order = this.p1.attack && !this.p2.attack ? [this.p2, this.p1] : [this.p1, this.p2];
    for (const f of order) if (!this.v3?.isReady(f)) this.drawFighter(g, f);

    // 3D fighters (WebGL layer)
    if (this.v3) this.v3.render({ camLeft, viewW: this.viewW, viewH: this.viewH, offY: this.offY, sx: sxk, sy: syk, cw, ch });

    // effects layer
    const gf = this.gf;
    gf.setTransform(1, 0, 0, 1, 0, 0);
    gf.clearRect(0, 0, cw, ch);
    gf.setTransform(s, 0, 0, s, (-camLeft + sxk) * s, (syk + this.offY) * s);
    for (const sp of this.spikes) this.drawSpikes(gf, sp);
    for (const pr of this.projectiles) this.drawProjectile(gf, pr);
    this.v3?.drawOverlays(gf);
    this.drawAtmos(gf);
    this.fx.drawFront(gf);

    gf.setTransform(1, 0, 0, 1, 0, 0);
    this.fx.drawScreen(gf, cw, ch);
    if (this.phase === 'ko' && this.phaseT < 1.2) {
      gf.fillStyle = 'rgba(0,0,0,0.25)'; gf.fillRect(0, 0, cw, ch);
    }
  }

  drawAtmos(g) {
    if (!prefs.particles) return;
    const dt = this.paused ? 0 : 1 / 60;
    g.save();
    // floor fog
    for (const f of this.fog) {
      f.x += f.v * dt; if (f.x > this.cam + 1300) f.x = this.cam - 1300 - f.r;
      g.globalAlpha = 0.16;
      g.drawImage(glowSprite('#3a3236'), f.x - f.r, f.y - f.r * 0.25, f.r * 2, f.r * 0.5);
    }
    g.globalCompositeOperation = 'lighter';
    for (const e of this.atmos) {
      e.t += dt; e.y += e.vy * dt; e.x += Math.sin(e.t * e.sway) * 18 * dt;
      if (e.y < -this.offY - 40) Object.assign(e, this.newEmber(false));
      g.globalAlpha = 0.55 + 0.45 * Math.sin(e.t * 9);
      g.drawImage(glowSprite(e.c), e.x - e.s, e.y - e.s, e.s * 2, e.s * 2);
    }
    g.restore();
  }

  drawBackground(g, camLeft) {
    const vw = this.viewW;
    if (!arenaImg) return;
    const ar = arenaImg.naturalWidth / arenaImg.naturalHeight;
    const bgH = Math.max(980, (vw * 1.12) / ar, (GROUND + this.offY + 20) / 0.86);
    const bgW = bgH * ar;
    const top = GROUND - 0.86 * bgH;
    if (this.offY > 0) { g.fillStyle = '#07090d'; g.fillRect(camLeft - 50, top + bgH - 4, vw + 100, this.viewH); }
    const x = camLeft + (vw - bgW) / 2 - (this.cam - W / 2) * 0.1;
    g.drawImage(arenaImg, x, top, bgW, bgH);
    // depth grade: darken top, focus centre
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, 'rgba(3,6,10,0.55)');
    grd.addColorStop(0.55, 'rgba(3,6,10,0.15)');
    grd.addColorStop(1, 'rgba(3,6,10,0.35)');
    g.fillStyle = grd;
    g.fillRect(camLeft - 50, -this.offY - 50, vw + 100, this.viewH + 100);
  }

  drawShadow(g, f) {
    const k = clamp(1 - f.y / 500, 0.3, 1);
    g.save();
    g.globalAlpha = 0.55 * k;
    g.fillStyle = '#000';
    g.beginPath(); g.ellipse(f.x, GROUND + 4, 150 * k, 22 * k, 0, 0, Math.PI * 2); g.fill();
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.25 * k;
    g.drawImage(glowSprite(f.def.color), f.x - 190 * k, GROUND - 26 * k, 380 * k, 52 * k);
    g.restore();
  }

  drawFighter(g, f) {
    const A = art[f.def.id];
    if (!A) return;
    const h = FH, w = h * A.ar;
    // afterimages
    for (const gh of f.ghosts) {
      g.save();
      g.globalAlpha = 0.28 * (1 - gh.life / 0.22);
      g.globalCompositeOperation = 'lighter';
      g.translate(gh.x, GROUND - gh.y + gh.oy); g.scale(gh.facing, 1); g.rotate(gh.rot); g.scale(gh.sx, gh.sy);
      g.drawImage(A.tint, -w / 2 + gh.ox, -h, w, h);
      g.restore();
    }
    const p = this.pose(f);
    g.save();
    g.translate(f.x, GROUND - f.y + p.oy);
    g.scale(f.facing, 1);
    if (f.state === 'ko' && f.koT > 1.2) g.globalAlpha = Math.max(0.55, 1 - (f.koT - 1.2) * 0.4);
    g.save();
    g.rotate(p.rot); g.scale(p.sx, p.sy);
    g.drawImage(A.img, -w / 2 + p.ox, -h, w, h);
    if (f.flash > 0) { g.globalAlpha = f.flash * 0.85; g.drawImage(A.white, -w / 2 + p.ox, -h, w, h); g.globalAlpha = 1; }
    if (f.state === 'win' || (f.attack?.kind === 'special' && f.attack.phase === 'startup')) {
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.25 + 0.15 * Math.sin(this.time * 10);
      g.drawImage(A.tint, -w / 2 + p.ox, -h, w, h);
    }
    g.restore();

    g.globalCompositeOperation = 'lighter';
    // block shield
    if (f.state === 'block') {
      g.globalAlpha = 0.55 + 0.15 * Math.sin(this.time * 14);
      g.strokeStyle = f.def.color; g.lineWidth = 6;
      g.beginPath(); g.ellipse(w * 0.3, -h * 0.55, 46, 190, 0, -Math.PI / 2, Math.PI / 2); g.stroke();
      g.globalAlpha = 0.35;
      g.drawImage(glowSprite(f.def.color), w * 0.3 - 80, -h * 0.55 - 200, 160, 400);
    }
    // strike trails
    const a = f.attack;
    if (a && a.phase === 'active' && a.kind !== 'special') {
      const p2 = (a.t - a.su) / a.ac;
      g.globalAlpha = 1 - p2 * 0.7;
      if (a.kind === 'punch') {
        const y = -h * 0.62, x0 = w * 0.2, x1 = x0 + a.move.range * 0.75 * ease(Math.min(1, p2 * 2));
        for (const [lw, col, al] of [[34, f.def.color, 0.35], [14, f.def.color, 0.8], [5, '#ffffff', 1]]) {
          g.globalAlpha = al * (1 - p2 * 0.6);
          g.strokeStyle = col; g.lineWidth = lw; g.lineCap = 'round';
          g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y - 6); g.stroke();
        }
        g.globalAlpha = 0.9 * (1 - p2);
        g.drawImage(glowSprite(f.def.color), x1 - 50, y - 56, 100, 100);
      } else {
        const cx = w * 0.05, cy = -h * 0.42, R = a.move.range * 0.72;
        const a0 = 1.9, a1 = 1.9 - 2.3 * ease(Math.min(1, p2 * 1.6));
        for (const [lw, col, al] of [[40, f.def.color, 0.3], [16, f.def.color, 0.75], [5, '#ffffff', 1]]) {
          g.globalAlpha = al * (1 - p2 * 0.6);
          g.strokeStyle = col; g.lineWidth = lw; g.lineCap = 'round';
          g.beginPath(); g.arc(cx, cy, R, a0, a1, true); g.stroke();
        }
      }
    }
    // special charge
    if (a && a.kind === 'special' && a.phase === 'startup') {
      const k = a.t / a.su, r = 30 + 70 * k;
      g.globalAlpha = 0.9;
      g.drawImage(glowSprite(f.def.color), w * 0.3 - r, -h * 0.6 - r, r * 2, r * 2);
    }
    g.restore();
  }

  drawProjectile(g, pr) {
    g.save();
    g.globalCompositeOperation = 'lighter';
    const y = GROUND - pr.y;
    if (pr.kind === 'orb') {
      const r = pr.r * (1 + 0.1 * Math.sin(pr.life * 40));
      g.drawImage(glowSprite('#ff3d0b'), pr.x - r * 2.6, y - r * 2.6, r * 5.2, r * 5.2);
      g.drawImage(glowSprite('#ffb347'), pr.x - r * 1.3, y - r * 1.3, r * 2.6, r * 2.6);
      g.drawImage(glowSprite('#fff4d6'), pr.x - r * 0.6, y - r * 0.6, r * 1.2, r * 1.2);
    } else {
      const hgt = 330;
      for (let i = 0; i < 14; i++) {
        const t = i / 13;
        const wR = 30 + 100 * t;
        const yy = y - t * hgt;
        const sway = Math.sin(pr.life * 9 + t * 5) * 20 * t;
        g.globalAlpha = 0.18 + 0.25 * (1 - t);
        g.strokeStyle = i % 3 ? '#e7f7ff' : '#9fd9ff';
        g.lineWidth = 4;
        g.beginPath();
        g.ellipse(pr.x + sway, yy, wR, 12 + 8 * t, 0, pr.life * 14 + i, pr.life * 14 + i + Math.PI * 1.3);
        g.stroke();
      }
      g.globalAlpha = 0.35;
      g.drawImage(glowSprite('#9fd9ff'), pr.x - 140, y - hgt - 20, 280, hgt + 60);
    }
    g.restore();
  }

  drawSpikes(g, sp) {
    const k = sp.t / sp.max;
    const rise = k < 0.15 ? ease(k / 0.15) : k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
    let seed = sp.seed;
    const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    g.save();
    for (let i = 0; i < 7; i++) {
      const off = (i - 3) * 38 + (rnd() - 0.5) * 20;
      const ht = (150 + rnd() * 160) * rise * (1 - Math.abs(i - 3) * 0.12);
      const wd = 30 + rnd() * 22;
      const x = sp.x + off;
      const grd = g.createLinearGradient(x, GROUND, x, GROUND - ht);
      grd.addColorStop(0, '#120f0b'); grd.addColorStop(0.55, '#3d3427'); grd.addColorStop(0.9, '#6b6a3a'); grd.addColorStop(1, '#c6f27a');
      g.fillStyle = grd; g.strokeStyle = '#0a0806'; g.lineWidth = 3;
      g.beginPath();
      g.moveTo(x - wd / 2, GROUND + 6);
      g.lineTo(x - wd * 0.15, GROUND - ht * 0.6);
      g.lineTo(x + (rnd() - 0.5) * 12, GROUND - ht);
      g.lineTo(x + wd * 0.2, GROUND - ht * 0.55);
      g.lineTo(x + wd / 2, GROUND + 6);
      g.closePath(); g.fill(); g.stroke();
      g.save(); g.globalCompositeOperation = 'lighter'; g.strokeStyle = 'rgba(165,220,102,0.55)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(x - wd * 0.15, GROUND - ht * 0.6); g.lineTo(x, GROUND - ht * 0.98); g.stroke(); g.restore();
    }
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.5 * rise;
    g.drawImage(glowSprite('#a5dc66'), sp.x - 200, GROUND - 200, 400, 240);
    g.restore();
  }
}

function escape(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
