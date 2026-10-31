// 3D fighter layer: skinned models drawn over the 2D arena, animated by the move library
// or (for a webcam player) by their own body via MediaPipe world landmarks.
import { Renderer3D, mat4, hexToRgb } from './r3d.js';
import { movePose, blendPose, poseFromLandmarks, restPose } from './skel.js';
import { glowSprite } from './fx.js';

const FH3 = 505; // on-screen fighter height in arena units

export class Fighter3DLayer {
  constructor(canvas, game) {
    this.r = new Renderer3D(canvas); // throws if WebGL2 is unavailable
    this.canvas = canvas;
    this.game = game;
    this.list = [];
  }

  /** motion: optional () => {lm, t} for a webcam-driven fighter. */
  attach(f, motion) {
    const v = { ready: false, motion, yaw: f.facing * 1.0, ghosts: [], ghostT: 0, trail: [], lead: 'R', lastAttack: 0, pose: null };
    f.v3 = v;
    this.list.push(f);
    this.r.model(f.def.id).then((m) => {
      v.model = m; v.sk = m.newSkeleton(); v.pose = movePose('idle', 0, 0);
      v.scale = FH3 / m.meta.height; v.rim = hexToRgb(f.def.color);
      v.ready = true;
    }).catch((e) => console.warn('3D model failed, using 2D art', e));
  }

  isReady(f) { return !!f.v3?.ready; }

  targetPose(f, v, t) {
    let state = f.state, k = 0;
    const a = f.attack;
    if (a) {
      if (a.id !== v.lastAttack) { v.lastAttack = a.id; if (a.kind === 'punch') v.lead = v.lead === 'R' ? 'L' : 'R'; }
      const act = a.su + a.ac;
      if (a.kind === 'special') k = a.t < a.su ? 0.45 * (a.t / a.su) : 0.45 + 0.55 * Math.min(1, (a.t - a.su) / (a.ac + a.re));
      else k = a.t < act ? 0.5 * (a.t / act) : 0.5 + 0.5 * Math.min(1, (a.t - act) / a.re);
      state = a.kind;
    } else if (state === 'hit') k = f.stunT / f.stunMax;
    if (state === 'jump' && f.grounded) state = 'idle';
    const proc = movePose(state, k, t, { lead: a?.kind === 'kick' ? 'R' : v.lead, walk: f.walkPhase });
    if (v.motion && !['hit', 'ko'].includes(f.state)) {
      const m = v.motion();
      if (m && performance.now() - m.t < 700) return { pose: poseFromLandmarks(m.lm, true, proc), webcam: true };
    }
    return { pose: proc, webcam: false };
  }

  update(dt) {
    const t = this.game.time;
    for (const f of this.list) {
      const v = f.v3;
      if (!v.ready) continue;
      const { pose, webcam } = this.targetPose(f, v, t);
      const rate = webcam ? 60 : f.attack ? 26 : 14;
      v.pose = v.pose ? blendPose(v.pose, pose, 1 - Math.exp(-dt * rate)) : pose;
      v.sk.update(v.pose);
      const yawT = f.facing * (webcam ? 0.45 : 1.0);
      v.yaw += (yawT - v.yaw) * Math.min(1, dt * 10);
      v.M = this.modelMatrix(f, v);
      // afterimages
      v.ghostT -= dt;
      const fast = f.attack?.phase === 'active' || Math.abs(f.vx) > 520 || f.state === 'hit';
      if (fast && v.ghostT <= 0 && this.game.fx.enabled) { v.ghostT = 0.04; v.ghosts.push({ bones: v.sk.mats.slice(), M: v.M, life: 0 }); }
      for (const g of v.ghosts) g.life += dt;
      v.ghosts = v.ghosts.filter((g) => g.life < 0.22);
      // strike trail from the real fist / foot
      if (f.attack && f.attack.kind !== 'special' && f.attack.phase !== 'startup') {
        const limb = (f.attack.kind === 'kick' ? 'foot' : 'hand') + (f.attack.kind === 'kick' ? 'R' : v.lead);
        v.trail.push({ ...this.point(f, v.sk.tip(limb)), life: 0 });
      }
      for (const p of v.trail) p.life += dt;
      v.trail = v.trail.filter((p) => p.life < 0.16).slice(-10);
    }
  }

  modelMatrix(f, v) {
    const G = this.game.GROUND;
    let M = mat4.translate(f.x, -(G - f.y), 0);
    M = mat4.mul(M, mat4.rotY(v.yaw));
    if (f.state === 'ko') {
      const k = Math.min(1, f.koT * 2.2);
      M = mat4.mul(M, mat4.rotX(-1.45 * (1 - (1 - k) * (1 - k))));
    }
    return mat4.mul(M, mat4.scale(v.scale, v.scale, v.scale));
  }

  /** model-space point -> arena 2D coords */
  point(f, p) {
    const w = mat4.apply(f.v3.M || this.modelMatrix(f, f.v3), p);
    return { x: w[0], y: -w[1] };
  }

  handPoint(f) {
    const v = f.v3;
    if (!v?.ready || !v.M) return null;
    const a = this.point(f, v.sk.tip('handL')), b = this.point(f, v.sk.tip('handR'));
    // the hand nearer the opponent
    return (a.x - b.x) * f.facing > 0 ? a : b;
  }

  render(view) {
    const { camLeft, viewW, viewH, offY, sx, sy } = view;
    this.r.resize(view.cw, view.ch);
    const l = camLeft - sx, top = offY + sy;
    const vp = mat4.ortho(l, l + viewW, top - viewH, top, -3000, 3000);
    this.r.begin(vp);
    for (const f of this.list) {
      const v = f.v3;
      if (!v.ready || !v.M) continue;
      for (const g of v.ghosts) this.r.draw({ model: v.model, bones: g.bones, modelMatrix: g.M, rim: v.rim, ghost: true, alpha: 0.32 * (1 - g.life / 0.22) });
    }
    for (const f of this.list) {
      const v = f.v3;
      if (!v.ready || !v.M) continue;
      const charge = f.attack?.kind === 'special' && f.attack.phase === 'startup';
      const rim = f.state === 'win' || charge ? v.rim.map((c) => c * (1.6 + 0.6 * Math.sin(this.game.time * 12))) : v.rim;
      const alpha = f.state === 'ko' && f.koT > 1.2 ? Math.max(0.6, 1 - (f.koT - 1.2) * 0.4) : 1;
      this.r.draw({ model: v.model, bones: v.sk.mats, modelMatrix: v.M, rim, flash: f.flash * 0.85, alpha });
    }
  }

  /** 2D overlays tied to the 3D bodies (drawn on the FX canvas in arena coords). */
  drawOverlays(g) {
    for (const f of this.list) {
      const v = f.v3;
      if (!v.ready || !v.M) continue;
      const col = f.def.color;
      g.save();
      g.globalCompositeOperation = 'lighter';
      if (v.trail.length > 1) {
        for (const [lw, c, al] of [[30, col, 0.3], [12, col, 0.75], [4, '#ffffff', 1]]) {
          g.strokeStyle = c; g.lineWidth = lw; g.lineCap = 'round'; g.lineJoin = 'round'; g.globalAlpha = al;
          g.beginPath(); v.trail.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.stroke();
        }
        const e = v.trail[v.trail.length - 1];
        g.globalAlpha = 0.8; g.drawImage(glowSprite(col), e.x - 50, e.y - 50, 100, 100);
      }
      if (f.state === 'block') {
        const c = this.point(f, v.sk.P[v.sk.byName.chest.i]);
        const x = c.x + f.facing * 95;
        g.globalAlpha = 0.55 + 0.15 * Math.sin(this.game.time * 14);
        g.strokeStyle = col; g.lineWidth = 6;
        g.beginPath(); g.ellipse(x, c.y - 30, 48, 180, 0, 0, Math.PI * 2); g.stroke();
        g.globalAlpha = 0.3; g.drawImage(glowSprite(col), x - 80, c.y - 230, 160, 400);
      }
      if (f.attack?.kind === 'special' && f.attack.phase === 'startup') {
        const a = this.point(f, v.sk.tip('handL')), b = this.point(f, v.sk.tip('handR'));
        const k = f.attack.t / f.attack.su, r = 30 + 70 * k;
        g.globalAlpha = 0.9; g.drawImage(glowSprite(col), (a.x + b.x) / 2 - r, (a.y + b.y) / 2 - r, r * 2, r * 2);
      }
      g.restore();
    }
  }
}

export { restPose };
