// Tiny WebGL2 renderer for skinned fighters (no external libraries).
import { Skeleton } from './skel.js';
import { asset } from './assets.js';

const cache = new Map(); // id -> Promise<{meta, buf, img}>

/** Raw .bin where available; hosts that only serve text get a base64 copy (.b64.txt). */
async function fetchGeometry(base) {
  try {
    const r = await fetch(`${base}.bin`);
    if (r.ok) return await r.arrayBuffer();
  } catch { /* fall through */ }
  const r = await fetch(`${base}.b64.txt`);
  if (!r.ok) throw new Error('model geometry ' + r.status);
  const bin = atob((await r.text()).trim());
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u.buffer;
}

/** Fetch + decode a fighter model once (shared by every renderer/context). */
export function loadModelData(id, onProgress) {
  if (cache.has(id)) return cache.get(id);
  const base = `assets/models/${id}`;
  const p = (async () => {
    const [meta, buf, img] = await Promise.all([
      fetch(`${base}.json`).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }),
      fetchGeometry(base),
      new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = asset(`${base}.webp`); }),
    ]);
    onProgress?.();
    return { meta, buf, img };
  })();
  cache.set(id, p);
  p.catch(() => cache.delete(id));
  return p;
}

const VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNor;
layout(location=2) in vec2 aUV;
layout(location=3) in uvec4 aJ;
layout(location=4) in vec4 aW;
uniform mat4 uBones[24];
uniform mat4 uModel;
uniform mat4 uVP;
out vec3 vN; out vec2 vUV; out vec3 vW;
void main(){
  mat4 S = uBones[aJ.x]*aW.x + uBones[aJ.y]*aW.y + uBones[aJ.z]*aW.z + uBones[aJ.w]*aW.w;
  vec4 w = uModel * S * vec4(aPos,1.0);
  vW = w.xyz;
  vN = normalize(mat3(uModel) * mat3(S) * aNor);
  vUV = aUV;
  gl_Position = uVP * w;
}`;

const FS = `#version 300 es
precision highp float;
in vec3 vN; in vec2 vUV; in vec3 vW;
uniform sampler2D uTex;
uniform vec3 uRim; uniform float uFlash; uniform float uAlpha; uniform float uGhost; uniform vec3 uKey;
out vec4 o;
void main(){
  vec3 n = normalize(vN);
  if(!gl_FrontFacing) n = -n;
  vec3 base = texture(uTex, vUV).rgb;
  base = pow(base, vec3(2.2));
  float key = max(dot(n, normalize(uKey)), 0.0);
  float fill = max(dot(n, normalize(vec3(-0.6,0.2,0.6))), 0.0);
  float rim = pow(1.0 - abs(n.z), 2.2);
  vec3 c = base * (0.32 + 0.9*key + 0.25*fill) + uRim * rim * 0.9;
  c = pow(c, vec3(1.0/2.2));
  c = mix(c, vec3(1.0), uFlash);
  if (uGhost > 0.5) { o = vec4(uRim * (0.35 + rim), uAlpha); return; }
  o = vec4(c, uAlpha);
}`;

export class Renderer3D {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { alpha: true, antialias: true, premultipliedAlpha: false });
    if (!gl) throw new Error('WebGL2 unavailable');
    this.gl = gl;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    this.prog = p;
    this.u = {};
    for (const n of ['uBones', 'uModel', 'uVP', 'uTex', 'uRim', 'uFlash', 'uAlpha', 'uGhost', 'uKey']) this.u[n] = gl.getUniformLocation(p, n);
    this.models = new Map();
  }

  /** Upload a model to this context. Returns {skeleton factory, draw info}. */
  async model(id) {
    if (this.models.has(id)) return this.models.get(id);
    const { meta, buf, img } = await loadModelData(id);
    const gl = this.gl, n = meta.vertexCount;
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    let off = 0;
    const attr = (loc, size, type, bytes, normalized, integer) => {
      const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, new Uint8Array(buf, off, n * bytes), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc);
      if (integer) gl.vertexAttribIPointer(loc, size, type, 0, 0);
      else gl.vertexAttribPointer(loc, size, type, normalized, 0, 0);
      off += n * bytes;
    };
    attr(0, 3, gl.FLOAT, 12, false);
    attr(1, 4, gl.BYTE, 4, true);
    attr(2, 2, gl.UNSIGNED_SHORT, 4, true);
    attr(3, 4, gl.UNSIGNED_BYTE, 4, false, true);
    attr(4, 4, gl.UNSIGNED_BYTE, 4, true);
    const u32 = meta.indexType === 'u32';
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint8Array(buf, off, meta.indexCount * (u32 ? 4 : 2)), gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const m = { id, meta, vao, tex, count: meta.indexCount, itype: u32 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, newSkeleton: () => new Skeleton(meta) };
    this.models.set(id, m);
    return m;
  }

  resize(w, h) { if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; } }

  begin(vp) {
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.prog);
    gl.uniformMatrix4fv(this.u.uVP, false, vp);
    gl.uniform3f(this.u.uKey, 0.45, 0.75, 0.6);
    gl.uniform1i(this.u.uTex, 0);
  }

  /** item: {model, bones: Float32Array, modelMatrix, rim:[r,g,b], flash, alpha, ghost} */
  draw(it) {
    const gl = this.gl, m = it.model;
    gl.uniformMatrix4fv(this.u.uBones, false, it.bones);
    gl.uniformMatrix4fv(this.u.uModel, false, it.modelMatrix);
    gl.uniform3fv(this.u.uRim, it.rim || [0, 0, 0]);
    gl.uniform1f(this.u.uFlash, it.flash || 0);
    gl.uniform1f(this.u.uAlpha, it.alpha ?? 1);
    gl.uniform1f(this.u.uGhost, it.ghost ? 1 : 0);
    if (it.ghost) { gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE); gl.depthMask(false); }
    else { gl.enable(gl.DEPTH_TEST); gl.depthMask(true); if ((it.alpha ?? 1) < 1) { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); } else gl.disable(gl.BLEND); }
    gl.disable(gl.CULL_FACE);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, m.tex);
    gl.bindVertexArray(m.vao);
    gl.drawElements(gl.TRIANGLES, m.count, m.itype, 0);
    gl.bindVertexArray(null);
  }
}

// ---------------------------------------------------------------- mat4 helpers (column-major)
export const mat4 = {
  mul(a, b) {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
    return o;
  },
  translate: (x, y, z) => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]),
  scale: (x, y, z) => new Float32Array([x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1]),
  rotY(a) { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]); },
  rotX(a) { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]); },
  rotZ(a) { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); },
  /** Orthographic projection: x∈[l,r], y∈[b,t], z∈[n,f] (camera looks down -Z). */
  ortho(l, r, b, t, n, f) {
    return new Float32Array([2 / (r - l), 0, 0, 0, 0, 2 / (t - b), 0, 0, 0, 0, -2 / (f - n), 0, -(r + l) / (r - l), -(t + b) / (t - b), -(f + n) / (f - n), 1]);
  },
  apply(m, p) { return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]]; },
};

export function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; }
