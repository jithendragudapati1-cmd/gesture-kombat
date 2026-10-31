// Move Academy demo: a 3D fighter loops the selected move so players can copy it.
import { Renderer3D, mat4, hexToRgb } from './r3d.js';
import { movePose, blendPose } from './skel.js';
import { glowSprite } from './fx.js';

export class AcademyDemo {
  constructor(container, fighter) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'academy-canvas';
    this.fx = document.createElement('canvas');
    this.fx.className = 'academy-canvas';
    this.cue = document.createElement('div');
    this.cue.className = 'academy-cue';
    container.replaceChildren(this.canvas, this.fx, this.cue);
    this.r = new Renderer3D(this.canvas);
    this.move = 'special';
    this.t0 = performance.now(); this.last = this.t0;
    this.setFighter(fighter);
    this.tick = this.tick.bind(this);
    this.raf = requestAnimationFrame(this.tick);
  }

  setFighter(f) {
    this.fighter = f; this.m = null;
    this.r.model(f.id).then((m) => { if (this.fighter !== f) return; this.m = m; this.sk = m.newSkeleton(); this.rim = hexToRgb(f.color); this.pose = movePose('idle', 0, 0); }).catch(() => { this.cue.textContent = '3D model unavailable'; });
  }

  setMove(id) { this.move = id; this.t0 = performance.now(); }

  /** Pose + caption for the current point in the demo loop. */
  sample(t) {
    const P = 2.2, ph = (t % P) / P;
    switch (this.move) {
      case 'special': {
        if (ph < 0.25) return { pose: movePose('idle', 0, t), cue: 'Guard up…' };
        if (ph < 0.55) return { pose: movePose('special', 0.45 * ((ph - 0.25) / 0.3), t), cue: 'PALMS TOGETHER at your chest', charge: (ph - 0.25) / 0.3 };
        if (ph < 0.85) return { pose: movePose('special', 0.45 + 0.55 * ((ph - 0.55) / 0.3), t), cue: 'Release! Special unleashed', fire: (ph - 0.55) / 0.3 };
        return { pose: movePose('idle', 0, t), cue: 'Spread hands to re-arm' };
      }
      case 'punch': case 'double': case 'kick': {
        const k = ph < 0.5 ? ph / 0.5 : 0;
        return { pose: k > 0 ? movePose(this.move, k, t, { lead: Math.floor(t / P) % 2 ? 'L' : 'R' }) : movePose('idle', 0, t), cue: k > 0 ? { punch: 'SNAP one fist out', double: 'BOTH fists forward', kick: 'KNEE UP fast' }[this.move] : 'Back to guard' };
      }
      case 'block': return ph < 0.65 ? { pose: movePose('block', 0, t), cue: 'Fists up at your face, hold' } : { pose: movePose('idle', 0, t), cue: 'Drop hands to release' };
      case 'crouch': return ph < 0.6 ? { pose: movePose('crouch', 0, t), cue: 'Squat down and stay low' } : { pose: movePose('idle', 0, t), cue: 'Stand back up' };
      case 'jump': { const air = ph > 0.2 && ph < 0.6; return { pose: movePose(air ? 'jump' : 'idle', 0, t), cue: air ? 'HOP!' : 'Stand tall, then hop', lift: air ? Math.sin(((ph - 0.2) / 0.4) * Math.PI) * 0.18 : 0 }; }
      case 'walk': return { pose: movePose('walk', 0, t, { walk: t * 7 }), cue: 'March in place' };
      case 'run': return { pose: movePose('walk', 0, t, { walk: t * 14 }), cue: 'Jog in place, fast' };
      default: return { pose: movePose('idle', 0, t), cue: '' };
    }
  }

  tick(now) {
    if (!this.canvas.isConnected) return cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.tick);
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    if (!this.m) return;
    const t = (now - this.t0) / 1000;
    const s = this.sample(t);
    this.pose = blendPose(this.pose, s.pose, 1 - Math.exp(-dt * 16));
    this.sk.update(this.pose);
    if (this.cue.textContent !== s.cue) { this.cue.textContent = s.cue; this.cue.classList.remove('pop'); void this.cue.offsetWidth; this.cue.classList.add('pop'); }
    const dpr = Math.min(1.5, devicePixelRatio || 1);
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr)), h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    this.r.resize(w, h);
    const H = 1.25, W = H * (w / h);
    this.r.begin(mat4.ortho(-W / 2, W / 2, -0.08, H - 0.08, -5, 5));
    const yaw = 0.55 + Math.sin(t * 0.5) * 0.08;
    const M = mat4.mul(mat4.translate(-W * 0.08, s.lift || 0, 0), mat4.mul(mat4.rotY(yaw), mat4.scale(1.1, 1.1, 1.1)));
    const glow = s.charge != null ? 1 + s.charge * 1.5 : s.fire != null ? 2.5 * (1 - s.fire) + 1 : 1;
    this.r.draw({ model: this.m, bones: this.sk.mats, modelMatrix: M, rim: this.rim.map((c) => c * glow) });
    // element FX overlay for the special
    const g = this.fx.getContext('2d');
    if (this.fx.width !== w || this.fx.height !== h) { this.fx.width = w; this.fx.height = h; }
    g.clearRect(0, 0, w, h);
    if (s.charge != null || s.fire != null) {
      g.save(); g.globalCompositeOperation = 'lighter';
      const hx = w * 0.5, hy = h * 0.45;
      if (s.charge != null) { const r = (20 + s.charge * 70) * dpr; g.globalAlpha = 0.9; g.drawImage(glowSprite(this.fighter.color), hx - r, hy - r, r * 2, r * 2); }
      if (s.fire != null) {
        const x = hx + s.fire * w * 0.55, r = 60 * dpr * (1 - s.fire * 0.3);
        g.globalAlpha = 1 - s.fire * 0.6;
        g.drawImage(glowSprite(this.fighter.color), x - r * 1.6, hy - r * 1.6, r * 3.2, r * 3.2);
        g.drawImage(glowSprite('#ffffff'), x - r * 0.5, hy - r * 0.5, r, r);
        for (let i = 0; i < 6; i++) { g.globalAlpha = 0.4 * (1 - i / 6); g.drawImage(glowSprite(this.fighter.color), x - i * 30 * dpr - r, hy - r, r * 2, r * 2); }
      }
      g.restore();
    }
  }
}
