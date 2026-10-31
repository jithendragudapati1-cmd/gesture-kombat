// Skeleton math, retargeting and the procedural move library for the 3D fighters.
//
// Character-local frame: +X = character's left, +Y = up, +Z = forward (toward the opponent / camera).
// A Pose is { q: {hips, chest, head}: quaternions, d: {boneName: direction vec3} } — the same
// representation is produced by the webcam (MediaPipe world landmarks) and by the move library,
// so the CPU, keyboard players and webcam players all animate through one path.

// ---------------------------------------------------------------- vec / quat
export const v3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  scale: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
};

export const quat = {
  id: () => [0, 0, 0, 1],
  mul(a, b) {
    const [ax, ay, az, aw] = a, [bx, by, bz, bw] = b;
    return [aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx, aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz];
  },
  conj: (q) => [-q[0], -q[1], -q[2], q[3]],
  rot(q, v) {
    const [x, y, z, w] = q;
    const ix = w * v[0] + y * v[2] - z * v[1], iy = w * v[1] + z * v[0] - x * v[2], iz = w * v[2] + x * v[1] - y * v[0], iw = -x * v[0] - y * v[1] - z * v[2];
    return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x];
  },
  axis(ax, ang) { const s = Math.sin(ang / 2); return [ax[0] * s, ax[1] * s, ax[2] * s, Math.cos(ang / 2)]; },
  fromTo(a, b) {
    const d = v3.dot(a, b);
    if (d < -0.99999) { let ax = v3.cross([1, 0, 0], a); if (v3.len(ax) < 1e-6) ax = v3.cross([0, 1, 0], a); return quat.axis(v3.norm(ax), Math.PI); }
    const c = v3.cross(a, b);
    return quat.norm([c[0], c[1], c[2], 1 + d]);
  },
  norm(q) { const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1; return [q[0] / l, q[1] / l, q[2] / l, q[3] / l]; },
  nlerp(a, b, t) {
    const s = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3] < 0 ? -1 : 1;
    return quat.norm([a[0] + (s * b[0] - a[0]) * t, a[1] + (s * b[1] - a[1]) * t, a[2] + (s * b[2] - a[2]) * t, a[3] + (s * b[3] - a[3]) * t]);
  },
  /** Rotation whose X/Y axes map to the given (orthonormalised) directions. */
  fromBasis(xAxis, yAxis) {
    const X = v3.norm(xAxis);
    let Y = v3.sub(yAxis, v3.scale(X, v3.dot(yAxis, X))); Y = v3.norm(Y);
    const Z = v3.cross(X, Y);
    const m00 = X[0], m10 = X[1], m20 = X[2], m01 = Y[0], m11 = Y[1], m21 = Y[2], m02 = Z[0], m12 = Z[1], m22 = Z[2];
    const tr = m00 + m11 + m22;
    let q;
    if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; q = [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, 0.25 * s]; }
    else if (m00 > m11 && m00 > m22) { const s = Math.sqrt(1 + m00 - m11 - m22) * 2; q = [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s]; }
    else if (m11 > m22) { const s = Math.sqrt(1 + m11 - m00 - m22) * 2; q = [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s]; }
    else { const s = Math.sqrt(1 + m22 - m00 - m11) * 2; q = [(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s]; }
    return quat.norm(q);
  },
  euler(pitch = 0, yaw = 0, roll = 0) { // pitch + = lean forward, yaw + = turn toward own left, roll + = tilt to own left
    return quat.mul(quat.axis([0, 1, 0], yaw), quat.mul(quat.axis([1, 0, 0], pitch), quat.axis([0, 0, 1], -roll)));
  },
};

// ---------------------------------------------------------------- Skeleton
const DIR_BONES = ['upperArmL', 'foreArmL', 'handL', 'upperArmR', 'foreArmR', 'handR', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'];
export const POSE_BONES = DIR_BONES;

export class Skeleton {
  constructor(meta) {
    this.meta = meta;
    this.bones = meta.bones.map((b, i) => ({ ...b, i }));
    this.byName = Object.fromEntries(this.bones.map((b) => [b.name, b]));
    this.n = this.bones.length;
    this.children = this.bones.map(() => []);
    for (const b of this.bones) if (b.parent >= 0) this.children[b.parent].push(b.i);
    // rest direction of each direction-driven bone (head -> child head, or tip)
    this.restDir = {};
    const childOf = { upperArm: 'foreArm', foreArm: 'hand', thigh: 'shin', shin: 'foot' };
    for (const name of DIR_BONES) {
      const b = this.byName[name], kind = name.slice(0, -1), side = name.slice(-1);
      const end = childOf[kind] ? this.byName[childOf[kind] + side].head : meta.tips[name];
      this.restDir[name] = v3.norm(v3.sub(end, b.head));
    }
    this.restAnkle = Math.min(this.byName.footL.head[1], this.byName.footR.head[1]);
    this.Q = this.bones.map(() => quat.id());
    this.P = this.bones.map((b) => b.head.slice());
    this.mats = new Float32Array(16 * this.n);
    this.update(restPose());
  }

  /** Solve world rotations/positions for a pose; fills this.mats with skinning matrices. */
  update(pose, plant = true) {
    const { bones, Q, P, byName } = this;
    const q = pose.q;
    for (const b of bones) {
      const par = b.parent;
      const Qp = par >= 0 ? Q[par] : quat.id();
      let Qb;
      switch (b.name) {
        case 'hips': Qb = q.hips; break;
        case 'spine': Qb = quat.nlerp(q.hips, q.chest, 0.5); break;
        case 'chest': Qb = q.chest; break;
        case 'neck': Qb = quat.nlerp(q.chest, q.head, 0.4); break;
        case 'head': Qb = q.head; break;
        default:
          if (pose.d[b.name]) {
            const from = quat.rot(Qp, this.restDir[b.name]);
            Qb = quat.mul(quat.fromTo(from, v3.norm(pose.d[b.name])), Qp);
          } else Qb = Qp;
      }
      Q[b.i] = Qb;
      P[b.i] = par >= 0 ? v3.add(P[par], quat.rot(Qp, v3.sub(b.head, bones[par].head))) : b.head.slice();
    }
    // Keep the lowest ankle on the ground (crouch/kick look grounded).
    let dy = 0;
    if (plant) {
      const ankle = Math.min(P[byName.footL.i][1], P[byName.footR.i][1]);
      dy = this.restAnkle - ankle;
    }
    this.lift = dy;
    for (const b of bones) {
      const p = P[b.i]; p[1] += dy;
      // M = T(p) * R(Q) * T(-head)
      const [x, y, z, w] = Q[b.i];
      const xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
      const r = [1 - 2 * (yy + zz), 2 * (xy + wz), 2 * (xz - wy), 2 * (xy - wz), 1 - 2 * (xx + zz), 2 * (yz + wx), 2 * (xz + wy), 2 * (yz - wx), 1 - 2 * (xx + yy)];
      const h = b.head;
      const o = b.i * 16, m = this.mats;
      m[o] = r[0]; m[o + 1] = r[1]; m[o + 2] = r[2]; m[o + 3] = 0;
      m[o + 4] = r[3]; m[o + 5] = r[4]; m[o + 6] = r[5]; m[o + 7] = 0;
      m[o + 8] = r[6]; m[o + 9] = r[7]; m[o + 10] = r[8]; m[o + 11] = 0;
      m[o + 12] = p[0] - (r[0] * h[0] + r[3] * h[1] + r[6] * h[2]);
      m[o + 13] = p[1] - (r[1] * h[0] + r[4] * h[1] + r[7] * h[2]);
      m[o + 14] = p[2] - (r[2] * h[0] + r[5] * h[1] + r[8] * h[2]);
      m[o + 15] = 1;
    }
  }

  /** World-space (model units) position of a bone's end point (e.g. fist). */
  tip(name) {
    const b = this.byName[name];
    const tip = this.meta.tips[name];
    if (tip) return v3.add(this.P[b.i], quat.rot(this.Q[b.i], v3.sub(tip, b.head)));
    return this.P[b.i].slice();
  }
}

// ---------------------------------------------------------------- Poses
export function restPose() {
  return { q: { hips: quat.id(), chest: quat.id(), head: quat.id() }, d: {} };
}

export function blendPose(a, b, t) {
  const out = { q: {}, d: {} };
  for (const k of ['hips', 'chest', 'head']) out.q[k] = quat.nlerp(a.q[k], b.q[k], t);
  for (const k of DIR_BONES) {
    const da = a.d[k], db = b.d[k];
    out.d[k] = da && db ? v3.norm(v3.lerp(da, db, t)) : db || da;
  }
  return out;
}

const S = { L: 1, R: -1 };
const arm = (side, upper, fore, hand) => ({ [`upperArm${side}`]: mirror(upper, side), [`foreArm${side}`]: mirror(fore, side), [`hand${side}`]: mirror(hand, side) });
const leg = (side, thigh, shin, foot) => ({ [`thigh${side}`]: mirror(thigh, side), [`shin${side}`]: mirror(shin, side), [`foot${side}`]: mirror(foot, side) });
const mirror = (v, side) => [v[0] * S[side], v[1], v[2]];
const torso = (hipsP = 0, chestP = 0, chestY = 0, headP = 0, hipsY = 0, chestR = 0) => ({
  hips: quat.euler(hipsP, hipsY, 0), chest: quat.euler(chestP, chestY + hipsY, chestR), head: quat.euler(headP, (chestY + hipsY) * 0.5, 0),
});

// Building blocks (vectors given for the LEFT side; mirrored for right)
const GUARD_ARM = [[0.42, -0.72, 0.5], [-0.22, 0.72, 0.62], [-0.1, 0.25, 0.95]];
const STANCE_LEG = [[0.2, -0.96, 0.08], [0.1, -0.95, -0.22], [0.08, -0.5, 0.86]];

/** Procedural move library. state: fighter state, k: 0..1 progress, t: time (s), opts: {lead: 'L'|'R', walk} */
export function movePose(state, k, t, opts = {}) {
  const lead = opts.lead || 'R', back = lead === 'R' ? 'L' : 'R';
  const breathe = Math.sin(t * 3) * 0.03;
  let q = torso(0.05, 0.06 + breathe, 0, 0.04);
  let d = { ...arm('L', ...GUARD_ARM), ...arm('R', ...GUARD_ARM), ...leg('L', ...STANCE_LEG), ...leg('R', ...STANCE_LEG) };
  // gentle guard bob
  d[`foreArmL`] = v3.add(d.foreArmL, [0, breathe * 2, 0]);
  d[`foreArmR`] = v3.add(d.foreArmR, [0, -breathe * 2, 0]);

  const ext = Math.sin(Math.min(1, k) * Math.PI); // 0 -> 1 -> 0 over the move
  switch (state) {
    case 'walk': {
      const ph = opts.walk || 0, sL = Math.sin(ph), sR = Math.sin(ph + Math.PI);
      Object.assign(d, leg('L', [0.18, -0.95, 0.1 + 0.42 * sL], [0.08, -0.95, -0.2 - 0.35 * Math.max(0, -sL)], [0.06, -0.45, 0.88]));
      Object.assign(d, leg('R', [0.18, -0.95, 0.1 + 0.42 * sR], [0.08, -0.95, -0.2 - 0.35 * Math.max(0, -sR)], [0.06, -0.45, 0.88]));
      q = torso(0.1, 0.06, 0.08 * sL, 0.02);
      break;
    }
    case 'punch': {
      const s = S[lead];
      Object.assign(d, arm(lead, v3.lerp(GUARD_ARM[0], [0.08, 0.12, 1], ext), v3.lerp(GUARD_ARM[1], [-0.02, 0.06, 1], ext), v3.lerp(GUARD_ARM[2], [0, 0.05, 1], ext)));
      q = torso(0.1 * ext, 0.12 * ext, -0.55 * ext * s, 0.02, -0.12 * ext * s);
      break;
    }
    case 'double': {
      const ua = v3.lerp(GUARD_ARM[0], [0.16, 0.1, 1], ext), fa = v3.lerp(GUARD_ARM[1], [-0.08, 0.05, 1], ext), hd = v3.lerp(GUARD_ARM[2], [-0.05, 0.05, 1], ext);
      Object.assign(d, arm('L', ua, fa, hd), arm('R', ua, fa, hd));
      q = torso(0.12 * ext, 0.2 * ext, 0, 0.05);
      break;
    }
    case 'kick': {
      Object.assign(d, leg(lead, v3.lerp(STANCE_LEG[0], [0.12, 0.25, 1], ext), v3.lerp(STANCE_LEG[1], [0.06, 0.18, 1], ext), v3.lerp(STANCE_LEG[2], [0, 0.85, 0.5], ext)));
      Object.assign(d, leg(back, [0.16, -0.97, -0.12], [0.08, -0.95, -0.25], [0.1, -0.45, 0.85]));
      q = torso(-0.28 * ext, -0.1 * ext, 0.3 * ext * S[lead], -0.05);
      Object.assign(d, arm(back, [0.5, -0.55, -0.4 * ext], [0.2, 0.3, 0.9], [0, 0.2, 1]));
      break;
    }
    case 'block':
      Object.assign(d, arm('L', [0.38, -0.25, 0.9], [-0.28, 0.95, 0.12], [-0.1, 1, 0.05]), arm('R', [0.38, -0.25, 0.9], [-0.28, 0.95, 0.12], [-0.1, 1, 0.05]));
      q = torso(0.12, 0.16, 0, 0.22);
      break;
    case 'crouch':
      Object.assign(d, leg('L', [0.3, -0.42, 0.86], [0.08, -0.9, -0.45], [0.06, -0.4, 0.9]), leg('R', [0.3, -0.42, 0.86], [0.08, -0.9, -0.45], [0.06, -0.4, 0.9]));
      q = torso(0.3, 0.1, 0, -0.1);
      break;
    case 'jump':
      Object.assign(d, leg('L', [0.22, -0.3, 0.92], [0.1, -0.88, -0.5], [0.05, -0.5, 0.85]), leg('R', [0.18, -0.65, 0.6], [0.1, -0.9, -0.55], [0.05, -0.5, 0.85]));
      Object.assign(d, arm('L', [0.6, -0.2, 0.5], [0.0, 0.7, 0.6], [0, 0.4, 0.9]), arm('R', [0.6, -0.2, 0.5], [0.0, 0.7, 0.6], [0, 0.4, 0.9]));
      q = torso(0.15, 0.1, 0, 0);
      break;
    case 'special': {
      // k < 0.5 charge (hands pulled to chest), then thrust both palms forward
      const thrust = Math.max(0, Math.min(1, (k - 0.45) * 3));
      const ua = v3.lerp([0.35, -0.55, 0.4], [0.12, 0.02, 1], thrust);
      const fa = v3.lerp([-0.7, 0.35, 0.55], [-0.22, 0.05, 1], thrust);
      Object.assign(d, arm('L', ua, fa, [-0.35, 0.6, 0.7]), arm('R', ua, fa, [-0.35, 0.6, 0.7]));
      q = torso(0.08 + 0.12 * thrust, 0.05 + 0.1 * thrust, 0, 0.05);
      break;
    }
    case 'hit': {
      const a = Math.max(0, k);
      Object.assign(d, arm('L', [0.65, -0.55, -0.35], [0.5, -0.1, 0.6], [0.3, 0, 0.9]), arm('R', [0.65, -0.55, -0.35], [0.5, -0.1, 0.6], [0.3, 0, 0.9]));
      q = torso(-0.25 * a, -0.35 * a, 0.1 * a, -0.35 * a);
      break;
    }
    case 'ko':
      Object.assign(d, arm('L', [0.9, 0.15, -0.2], [0.9, 0.3, 0.1], [0.8, 0.3, 0.3]), arm('R', [0.9, 0.15, -0.2], [0.9, 0.3, 0.1], [0.8, 0.3, 0.3]));
      Object.assign(d, leg('L', [0.25, -0.9, 0.35], [0.1, -0.95, 0.1], [0.05, -0.2, 1]), leg('R', [0.25, -0.95, 0.1], [0.1, -0.95, 0.05], [0.05, -0.2, 1]));
      q = torso(-0.3, -0.25, 0, -0.5);
      break;
    case 'win': {
      const r = opts.winArm || 'R';
      Object.assign(d, arm(r, [0.55, 0.62, 0.3], [0.1, 1, 0.12], [0, 1, 0.1]));
      Object.assign(d, arm(r === 'R' ? 'L' : 'R', [0.35, -0.85, 0.2], [-0.3, 0.2, 0.9], [-0.2, 0.2, 1]));
      q = torso(-0.08, -0.12 + Math.sin(t * 4) * 0.03, 0.1 * S[r], -0.15);
      break;
    }
  }
  return { q, d };
}

// ---------------------------------------------------------------- Webcam -> pose
// MediaPipe world landmarks: metres, origin between hips, x → image right (person's left), y down, z away from camera.
const LM = { nose: 0, earL: 7, earR: 8, shL: 11, shR: 12, elL: 13, elR: 14, wrL: 15, wrR: 16, piL: 17, piR: 18, inL: 19, inR: 20, hipL: 23, hipR: 24, knL: 25, knR: 26, anL: 27, anR: 28, toeL: 31, toeR: 32 };

export class LandmarkSmoother {
  constructor(alpha = 0.55) { this.alpha = alpha; this.v = null; }
  push(lm) {
    if (!lm) return this.v;
    if (!this.v) { this.v = lm.map((p) => ({ x: p.x, y: p.y, z: p.z, visibility: p.visibility ?? 1 })); return this.v; }
    // Adaptive smoothing: big/fast moves pass through almost raw (no lag), small jitter is damped.
    for (let i = 0; i < lm.length; i++) {
      const s = this.v[i], p = lm[i];
      const d = Math.hypot(p.x - s.x, p.y - s.y, (p.z - s.z) * 0.5);
      const a = Math.min(0.95, this.alpha * 0.6 + d * 14);
      s.x += (p.x - s.x) * a; s.y += (p.y - s.y) * a; s.z += (p.z - s.z) * a; s.visibility = p.visibility ?? 1;
    }
    return this.v;
  }
}

/**
 * Convert world landmarks to a Pose. mirror=true makes the fighter move like a mirror image
 * (raise your right hand → the fighter's hand on the same side of the screen rises).
 * Body parts the camera can't see fall back to `fallback` (a procedural pose).
 */
export function poseFromLandmarks(lm, mirror, fallback) {
  // character-local positions: non-mirrored (x,-y,-z) with person-left = char-left; mirrored flips X and swaps sides
  const P = {}; const vis = {};
  for (const [k, i] of Object.entries(LM)) {
    let key = k;
    if (mirror) key = k.endsWith('L') ? k.slice(0, -1) + 'R' : k.endsWith('R') ? k.slice(0, -1) + 'L' : k;
    const p = lm[i];
    P[key] = mirror ? [-p.x, -p.y, -p.z] : [p.x, -p.y, -p.z];
    vis[key] = p.visibility ?? 1;
  }
  const out = { q: { ...fallback.q }, d: { ...fallback.d } };
  const ok = (...ks) => ks.every((k) => vis[k] > 0.5);
  const hipMid = v3.lerp(P.hipL, P.hipR, 0.5), shMid = v3.lerp(P.shL, P.shR, 0.5);
  const up = v3.sub(shMid, hipMid);
  if (ok('shL', 'shR')) {
    out.q.chest = quat.fromBasis(v3.sub(P.shL, P.shR), up);
    out.q.hips = ok('hipL', 'hipR') ? quat.fromBasis(v3.sub(P.hipL, P.hipR), up) : quat.nlerp(quat.id(), out.q.chest, 0.5);
  }
  if (ok('earL', 'earR', 'nose')) {
    const earMid = v3.lerp(P.earL, P.earR, 0.5);
    const fwd = v3.norm(v3.sub(P.nose, earMid));
    const x = v3.norm(v3.sub(P.earL, P.earR));
    // head basis: X = ear line, Y = cross(fwd, X) (up), relative to a neutral where the nose sits slightly below the ears
    const headUp = v3.cross(fwd, x);
    let hq = quat.mul(quat.fromBasis(x, headUp), quat.axis([1, 0, 0], -0.18));
    // keep the head within ~35° of the chest so tracking noise never snaps the neck
    const rel = quat.mul(quat.conj(out.q.chest), hq);
    const ang = 2 * Math.acos(Math.min(1, Math.abs(rel[3])));
    if (ang > 0.6) hq = quat.mul(out.q.chest, quat.nlerp(quat.id(), rel, 0.6 / ang));
    out.q.head = hq;
  }
  for (const s of ['L', 'R']) {
    if (ok('sh' + s, 'el' + s)) out.d['upperArm' + s] = v3.sub(P['el' + s], P['sh' + s]);
    if (ok('el' + s, 'wr' + s)) out.d['foreArm' + s] = v3.sub(P['wr' + s], P['el' + s]);
    if (ok('wr' + s, 'in' + s, 'pi' + s)) out.d['hand' + s] = v3.sub(v3.lerp(P['in' + s], P['pi' + s], 0.5), P['wr' + s]);
    if (ok('hip' + s, 'kn' + s)) out.d['thigh' + s] = v3.sub(P['kn' + s], P['hip' + s]);
    if (ok('kn' + s, 'an' + s)) out.d['shin' + s] = v3.sub(P['an' + s], P['kn' + s]);
    if (ok('an' + s, 'toe' + s)) out.d['foot' + s] = v3.sub(P['toe' + s], P['an' + s]);
  }
  return out;
}
