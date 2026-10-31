// Live 3D preview: the selected fighter mirrors the player's body on the camera screens.
import { Renderer3D, mat4, hexToRgb } from './r3d.js';
import { movePose, blendPose, poseFromLandmarks } from './skel.js';

export class MirrorPreview {
  constructor(container, fighter, tracker) {
    this.fighter = fighter; this.tracker = tracker;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'mirror-canvas';
    this.label = document.createElement('div');
    this.label.className = 'mirror-label';
    this.label.textContent = `${fighter.name} · waiting for you`;
    container.replaceChildren(this.canvas, this.label);
    this.r = new Renderer3D(this.canvas);
    this.pose = movePose('idle', 0, 0);
    this.t0 = performance.now();
    this.last = this.t0;
    this.r.model(fighter.id).then((m) => { this.m = m; this.sk = m.newSkeleton(); this.rim = hexToRgb(fighter.color); }).catch(() => { this.label.textContent = '3D model unavailable'; });
    this.tick = this.tick.bind(this);
    this.raf = requestAnimationFrame(this.tick);
  }

  tick(now) {
    if (!this.canvas.isConnected) return this.destroy();
    this.raf = requestAnimationFrame(this.tick);
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    if (!this.m) return;
    const t = (now - this.t0) / 1000;
    const idle = movePose('idle', 0, t);
    const mo = this.tracker.motion();
    const live = mo && now - mo.t < 700;
    const target = live ? poseFromLandmarks(mo.lm, true, idle) : idle;
    this.pose = blendPose(this.pose, target, 1 - Math.exp(-dt * (live ? 45 : 10)));
    this.sk.update(this.pose);
    // Follow the player around the room: step sideways = slide, step in/out = come closer/further.
    const pos = live && this.tracker.detector?.calibrated ? this.tracker.detector.pos : null;
    const tx = 0; // always stays centred in the box
    const td = pos && isFinite(pos.depth) ? Math.max(0.9, Math.min(1.1, 1 + (pos.depth - 1) * 0.5)) : 1;
    const k = 1 - Math.exp(-dt * 14);
    this.px = (this.px ?? 0) + (tx - (this.px ?? 0)) * k;
    this.pd = (this.pd ?? 1) + (td - (this.pd ?? 1)) * k;
    this.label.textContent = live ? `${this.fighter.name} · mirroring you` : `${this.fighter.name} · ${this.tracker.status === 'ready' ? 'step into view' : 'enable the camera'}`;
    this.label.classList.toggle('live', !!live);

    const dpr = Math.min(1.5, devicePixelRatio || 1);
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr)), h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    this.r.resize(w, h);
    const H = 1.15, W = H * (w / h);
    this.r.begin(mat4.ortho(-W / 2, W / 2, -0.06, H - 0.06, -5, 5));
    const s = 1.08 * this.pd;
    const M = mat4.mul(mat4.translate(this.px, 0, 0), mat4.mul(mat4.rotY(live ? 0 : Math.sin(t * 0.4) * 0.12), mat4.scale(s, s, s)));
    this.r.draw({ model: this.m, bones: this.sk.mats, modelMatrix: M, rim: this.rim });
  }

  destroy() { cancelAnimationFrame(this.raf); }
}
