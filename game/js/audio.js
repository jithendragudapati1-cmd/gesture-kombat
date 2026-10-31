// Gesture Kombat sound engine — every sound and music cue is synthesised live with Web Audio
// (no audio files). Mixer: sfx + music buses → reverb send → master compressor/limiter.
import { prefs } from './store.js';

let ctx = null, master, comp, sfxBus, musicBus, verb, verbSend, drive;
const buffers = {};
const R = (a, b) => a + Math.random() * (b - a);

function vol(k) { const v = prefs[k] ?? 60; return Math.max(0, Math.min(1, v / 100)); }

function ac() {
  if (!ctx) {
    try { ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' }); } catch { return null; }
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 8; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.18;
    master = ctx.createGain();
    master.connect(comp).connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.connect(master);
    musicBus = ctx.createGain(); musicBus.connect(master);
    verb = ctx.createConvolver(); verb.buffer = impulse(2.8, 2.6);
    verbSend = ctx.createGain(); verbSend.gain.value = 0.5;
    verbSend.connect(verb).connect(master);
    drive = ctx.createWaveShaper(); drive.curve = distCurve(18); drive.oversample = '2x';
    drive.connect(sfxBus);
    applyVolumes();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

export const audioReady = () => !!ctx && ctx.state === 'running';

let PAN = 0;
/** Position the next sounds left/right (-1..1). */
export function setPan(p) { PAN = Math.max(-1, Math.min(1, p || 0)); }
function routed(node, out) {
  if (!PAN || out === musicBus || !ctx.createStereoPanner) return node.connect(out);
  const p = ctx.createStereoPanner(); p.pan.value = PAN;
  return node.connect(p).connect(out);
}

export function applyVolumes() {
  if (!ctx) return;
  const t = ctx.currentTime;
  master.gain.setTargetAtTime(vol('volume') * 1.1, t, 0.05);
  sfxBus.gain.setTargetAtTime(vol('sfxVolume'), t, 0.05);
  musicBus.gain.setTargetAtTime(vol('musicVolume') * 0.55, t, 0.05);
}

function impulse(sec, decay) {
  const n = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay);
  }
  return b;
}
function distCurve(k) {
  const n = 2048, c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i / n) * 2 - 1; c[i] = ((1 + k) * x) / (1 + k * Math.abs(x)); }
  return c;
}
function noiseBuf(type = 'white') {
  if (buffers[type]) return buffers[type];
  const n = ctx.sampleRate * 2, b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    if (type === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
  }
  return (buffers[type] = b);
}

// ---------------------------------------------------------------- voices
/** Oscillator with pitch sweep and AD envelope. */
function osc({ type = 'sine', f0 = 200, f1 = f0, dur = 0.2, gain = 1, delay = 0, attack = 0.002, out = sfxBus, send = 0, curve = 'exp', detune = 0 }) {
  const c = ac(); if (!c) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.detune.value = detune;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) curve === 'exp' ? o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur) : o.frequency.linearRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); routed(g, out);
  if (send) { const s = c.createGain(); s.gain.value = send; g.connect(s).connect(verbSend); }
  o.start(t); o.stop(t + dur + 0.05);
  return o;
}

/** Filtered noise burst. */
function nz({ type = 'white', filter = 'bandpass', f0 = 1000, f1 = f0, q = 1, dur = 0.2, gain = 1, delay = 0, attack = 0.002, out = sfxBus, send = 0, rate = 1 }) {
  const c = ac(); if (!c) return;
  const t = c.currentTime + delay;
  const s = c.createBufferSource(); s.buffer = noiseBuf(type); s.playbackRate.value = rate;
  const f = c.createBiquadFilter(); f.type = filter; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g); routed(g, out);
  if (send) { const sg = c.createGain(); sg.gain.value = send; g.connect(sg).connect(verbSend); }
  s.start(t, Math.random() * 1.2); s.stop(t + dur + 0.05);
}

/** Inharmonic bell / gong / metal partials. */
function metal({ base = 220, ratios = [1, 2.76, 5.4, 8.93, 13.34], dur = 1.2, gain = 0.6, delay = 0, send = 0.6, out = sfxBus }) {
  ratios.forEach((r, i) => osc({ type: 'sine', f0: base * r * R(0.995, 1.005), dur: dur / (1 + i * 0.35), gain: gain / (1 + i * 0.8), delay, attack: 0.002, out, send }));
}

// ---------------------------------------------------------------- SFX library
export const sfx = {
  unlock() { const c = ac(); if (c) (c.state === 'running' ? Promise.resolve() : c.resume()).then(() => music.resume()).catch(() => {}); },

  // UI
  hover() { osc({ type: 'triangle', f0: 1400, f1: 900, dur: 0.05, gain: 0.08 }); nz({ filter: 'highpass', f0: 6000, dur: 0.03, gain: 0.05 }); },
  ui() { osc({ type: 'square', f0: 220, f1: 110, dur: 0.07, gain: 0.08 }); nz({ filter: 'bandpass', f0: 2500, q: 3, dur: 0.06, gain: 0.15 }); },
  select() {
    metal({ base: 330, dur: 0.6, gain: 0.25, send: 0.35 });
    nz({ filter: 'bandpass', f0: 600, f1: 3000, q: 1, dur: 0.25, gain: 0.25 });
    osc({ type: 'sine', f0: 90, f1: 45, dur: 0.25, gain: 0.5 });
  },
  back() { nz({ filter: 'bandpass', f0: 2600, f1: 500, q: 1.2, dur: 0.22, gain: 0.25 }); osc({ type: 'sine', f0: 140, f1: 60, dur: 0.15, gain: 0.3 }); },
  slash() {
    nz({ filter: 'bandpass', f0: 500, f1: 5200, q: 2, dur: 0.32, gain: 0.55, attack: 0.04, send: 0.2 });
    nz({ filter: 'highpass', f0: 4000, dur: 0.2, gain: 0.2, delay: 0.12 });
    osc({ type: 'sawtooth', f0: 900, f1: 180, dur: 0.3, gain: 0.05 });
  },
  gate() { // heavy steel doors slam
    nz({ filter: 'bandpass', f0: 300, f1: 1800, q: 0.8, dur: 0.25, gain: 0.35, attack: 0.15 });
    const d = 0.24;
    osc({ type: 'sine', f0: 80, f1: 28, dur: 0.9, gain: 1.3, delay: d, send: 0.4 });
    nz({ type: 'brown', filter: 'lowpass', f0: 900, f1: 120, dur: 0.8, gain: 1.1, delay: d, out: drive, send: 0.5 });
    metal({ base: 98, ratios: [1, 1.47, 2.31, 3.17, 4.62, 6.03], dur: 1.6, gain: 0.45, delay: d, send: 0.8 });
    nz({ filter: 'highpass', f0: 3000, dur: 0.12, gain: 0.5, delay: d });
  },
  vsSlam() { this.gong(0.9); osc({ type: 'sine', f0: 70, f1: 24, dur: 1.4, gain: 1.4, send: 0.5 }); nz({ type: 'brown', filter: 'lowpass', f0: 1200, f1: 80, dur: 1.2, gain: 1.2, out: drive, send: 0.6 }); nz({ filter: 'highpass', f0: 2500, f1: 8000, dur: 0.6, gain: 0.35 }); },
  gong(g = 1, delay = 0) {
    metal({ base: 82, ratios: [1, 1.52, 2.03, 2.71, 3.33, 4.17, 5.43], dur: 4.5, gain: 0.55 * g, delay, send: 1 });
    nz({ type: 'brown', filter: 'lowpass', f0: 400, dur: 0.5, gain: 0.5 * g, delay, send: 0.6 });
  },
  taiko(g = 1, delay = 0, pitch = 1) {
    osc({ type: 'sine', f0: 150 * pitch, f1: 52 * pitch, dur: 0.5, gain: 1.1 * g, delay, send: 0.3 });
    nz({ filter: 'lowpass', f0: 1800, f1: 300, dur: 0.12, gain: 0.5 * g, delay });
  },

  // Combat
  whoosh(heavy = false) {
    nz({ filter: 'bandpass', f0: heavy ? 350 : 700, f1: heavy ? 2200 : 3800, q: heavy ? 1.4 : 2.2, dur: heavy ? 0.28 : 0.17, gain: heavy ? 0.55 : 0.4, attack: heavy ? 0.06 : 0.03 });
    if (heavy) nz({ type: 'brown', filter: 'lowpass', f0: 500, dur: 0.25, gain: 0.25, attack: 0.05 });
  },
  hit(heavy = false) { // bone-crunch impact: transient + body + crunch + sub
    const p = R(0.88, 1.12);
    nz({ filter: 'highpass', f0: 2500, dur: 0.03, gain: heavy ? 0.9 : 0.7 }); // crack
    osc({ type: 'sine', f0: (heavy ? 140 : 190) * p, f1: (heavy ? 38 : 55) * p, dur: heavy ? 0.32 : 0.18, gain: heavy ? 1.6 : 1.2 }); // body
    nz({ type: 'white', filter: 'bandpass', f0: (heavy ? 650 : 1000) * p, q: 1.6, dur: heavy ? 0.16 : 0.09, gain: heavy ? 1 : 0.8, out: drive }); // crunch
    nz({ type: 'brown', filter: 'lowpass', f0: 900, f1: 200, dur: heavy ? 0.35 : 0.2, gain: heavy ? 0.8 : 0.5, out: drive, send: heavy ? 0.35 : 0.15 });
    if (heavy) { osc({ type: 'sine', f0: 60, f1: 30, dur: 0.6, gain: 1.2, send: 0.3 }); nz({ filter: 'bandpass', f0: 3200, q: 4, dur: 0.12, gain: 0.3, delay: 0.02 }); }
  },
  block() { // steel guard clang
    metal({ base: R(380, 460), ratios: [1, 2.42, 3.9, 5.6], dur: 0.45, gain: 0.35, send: 0.4 });
    nz({ filter: 'highpass', f0: 3500, dur: 0.05, gain: 0.6 });
    osc({ type: 'sine', f0: 120, f1: 60, dur: 0.12, gain: 0.5 });
  },
  jump() { nz({ filter: 'bandpass', f0: 500, f1: 2400, q: 1.5, dur: 0.18, gain: 0.3 }); },
  land() { osc({ type: 'sine', f0: 100, f1: 40, dur: 0.16, gain: 0.7 }); nz({ type: 'brown', filter: 'lowpass', f0: 600, dur: 0.15, gain: 0.4 }); },
  charge() {
    osc({ type: 'sawtooth', f0: 70, f1: 420, dur: 0.32, gain: 0.18, attack: 0.05 });
    nz({ filter: 'bandpass', f0: 300, f1: 4000, q: 3, dur: 0.32, gain: 0.35, attack: 0.25 });
  },
  special(el) {
    if (el === 'fire') { // roar + crackle
      nz({ type: 'brown', filter: 'lowpass', f0: 250, f1: 2600, dur: 0.9, gain: 1.4, attack: 0.05, out: drive, send: 0.4 });
      nz({ filter: 'bandpass', f0: 1200, f1: 400, q: 0.7, dur: 0.8, gain: 0.5 });
      for (let i = 0; i < 9; i++) nz({ filter: 'highpass', f0: 3000, dur: 0.02, gain: R(0.2, 0.5), delay: R(0, 0.7) });
      osc({ type: 'sine', f0: 90, f1: 40, dur: 0.7, gain: 0.9 });
    } else if (el === 'lightning') { this.thunder(1); osc({ type: 'sawtooth', f0: 2400, f1: 60, dur: 0.35, gain: 0.3, out: drive }); }
    else if (el === 'earth') { // rumble then rock burst
      nz({ type: 'brown', filter: 'lowpass', f0: 160, dur: 0.7, gain: 1.5, attack: 0.3, send: 0.3 });
      osc({ type: 'sine', f0: 45, f1: 30, dur: 1.1, gain: 1, attack: 0.3 });
      const d = 0.6;
      osc({ type: 'sine', f0: 110, f1: 30, dur: 0.8, gain: 1.6, delay: d, send: 0.5 });
      nz({ type: 'brown', filter: 'lowpass', f0: 2000, f1: 200, dur: 0.9, gain: 1.4, delay: d, out: drive, send: 0.6 });
      for (let i = 0; i < 10; i++) nz({ filter: 'bandpass', f0: R(800, 2500), q: 3, dur: 0.06, gain: R(0.3, 0.6), delay: d + R(0, 0.5) });
    } else { // wind howl
      nz({ filter: 'bandpass', f0: 400, f1: 2400, q: 8, dur: 1.1, gain: 1.4, attack: 0.15, send: 0.5 });
      nz({ filter: 'bandpass', f0: 900, f1: 300, q: 6, dur: 1.0, gain: 0.8, delay: 0.1 });
      osc({ type: 'sine', f0: 900, f1: 1600, dur: 0.9, gain: 0.08, attack: 0.2 });
    }
  },
  thunder(g = 1, delay = 0) {
    nz({ filter: 'highpass', f0: 1500, dur: 0.08, gain: 1.3 * g, delay }); // crack
    nz({ type: 'white', filter: 'bandpass', f0: 3000, f1: 600, q: 0.6, dur: 0.3, gain: 0.8 * g, delay, out: drive });
    nz({ type: 'brown', filter: 'lowpass', f0: 600, f1: 70, dur: 2.2, gain: 1.4 * g, delay: delay + 0.05, attack: 0.08, send: 0.7 }); // rumble
  },
  explode(g = 1) {
    osc({ type: 'sine', f0: 90, f1: 22, dur: 1.2, gain: 1.6 * g, send: 0.5 });
    nz({ type: 'brown', filter: 'lowpass', f0: 3000, f1: 100, dur: 1.1, gain: 1.4 * g, out: drive, send: 0.6 });
    nz({ filter: 'highpass', f0: 2000, f1: 6000, dur: 0.4, gain: 0.4 * g });
  },
  ko() {
    this.explode(1.3);
    this.gong(1.1, 0.05);
    osc({ type: 'sine', f0: 140, f1: 18, dur: 2.6, gain: 1.4, send: 0.6, attack: 0.01 });
    nz({ filter: 'bandpass', f0: 4000, f1: 200, q: 0.8, dur: 2.0, gain: 0.5, send: 0.8 });
  },
  round() { this.gong(0.9); this.taiko(0.9, 0.0); this.taiko(0.7, 0.32, 0.9); },
  fight() {
    this.taiko(1.2); this.taiko(1, 0.12, 1.1);
    nz({ filter: 'highpass', f0: 3000, f1: 9000, dur: 0.9, gain: 0.45, send: 0.6 }); // cymbal crash
    nz({ type: 'brown', filter: 'lowpass', f0: 2000, f1: 120, dur: 0.8, gain: 1, out: drive, send: 0.5 });
    osc({ type: 'sawtooth', f0: 110, f1: 55, dur: 0.6, gain: 0.25, out: drive });
  },
  combo(n) { metal({ base: 520 + n * 40, ratios: [1, 2, 3.01], dur: 0.5, gain: 0.25, send: 0.4 }); },
  step(run = false) {
    osc({ type: 'sine', f0: run ? 110 : 90, f1: 40, dur: 0.09, gain: run ? 0.5 : 0.32 });
    nz({ type: 'brown', filter: 'lowpass', f0: 700, dur: 0.08, gain: run ? 0.35 : 0.22 });
    nz({ filter: 'highpass', f0: 4500, dur: 0.03, gain: 0.05 });
  },
  ready() { metal({ base: 880, ratios: [1, 2, 3.01, 4.2], dur: 0.9, gain: 0.18, send: 0.7 }); osc({ type: 'triangle', f0: 440, f1: 880, dur: 0.25, gain: 0.12, attack: 0.05 }); },
  riser(dur = 0.6, delay = 0) {
    nz({ filter: 'bandpass', f0: 300, f1: 7000, q: 1.2, dur: dur + 0.04, gain: 0.55, attack: dur * 0.95, delay, send: 0.3 });
    osc({ type: 'sawtooth', f0: 80, f1: 640, dur: dur + 0.04, gain: 0.12, attack: dur * 0.95, delay, out: drive });
  },
  introEnter() {
    this.explode(1.2);
    this.gong(1.2, 0.02);
    [0, 0.14, 0.28, 0.5].forEach((d, i) => this.taiko(1.1 - i * 0.12, d, 1 + i * 0.08));
    nz({ filter: 'highpass', f0: 3000, f1: 10000, dur: 1.6, gain: 0.45, send: 0.8 }); // crash
    metal({ base: 147, ratios: [1, 1.5, 2, 3, 4.01], dur: 4, gain: 0.3, delay: 0.3, send: 1 });
    osc({ type: 'sawtooth', f0: 73.4, dur: 2.5, gain: 0.12, attack: 0.3, delay: 0.3, out: drive, send: 0.6 });
  },
  heartbeat() { osc({ type: 'sine', f0: 70, f1: 40, dur: 0.18, gain: 0.9 }); osc({ type: 'sine', f0: 62, f1: 36, dur: 0.2, gain: 0.7, delay: 0.22 }); },
  tick() { osc({ type: 'square', f0: 1200, f1: 1200, dur: 0.04, gain: 0.08 }); metal({ base: 1500, ratios: [1, 2.7], dur: 0.2, gain: 0.08, send: 0.2 }); },
  gesture() { osc({ type: 'triangle', f0: 660, f1: 990, dur: 0.08, gain: 0.15 }); },
  pick(el) {
    this.select();
    if (el === 'fire') nz({ type: 'brown', filter: 'lowpass', f0: 300, f1: 2200, dur: 0.5, gain: 0.8, out: drive });
    else if (el === 'lightning') { nz({ filter: 'highpass', f0: 2000, dur: 0.06, gain: 0.7 }); nz({ type: 'brown', filter: 'lowpass', f0: 500, f1: 80, dur: 0.8, gain: 0.7 }); }
    else if (el === 'earth') { osc({ type: 'sine', f0: 80, f1: 30, dur: 0.6, gain: 1 }); nz({ type: 'brown', filter: 'lowpass', f0: 1200, f1: 150, dur: 0.5, gain: 0.8, out: drive }); }
    else nz({ filter: 'bandpass', f0: 500, f1: 2600, q: 7, dur: 0.6, gain: 0.8 });
  },
  victory() { this.gong(1); [0, 0.2, 0.4].forEach((d, i) => this.taiko(1, d, 1 + i * 0.12)); metal({ base: 294, ratios: [1, 1.5, 2, 3], dur: 2.5, gain: 0.3, delay: 0.6, send: 0.9 }); },
  defeat() { this.gong(0.8); osc({ type: 'sawtooth', f0: 147, f1: 73, dur: 2.2, gain: 0.15, send: 0.8, attack: 0.2 }); },
};

// ---------------------------------------------------------------- Music (procedural, original compositions)
// "Ember Lobby" — epic hybrid anthem (menus) and "Arena Pulse" — driving electronic battle track.
// Melodic layers go through a side-chained bus that ducks on each kick for that pumping lobby feel.
const ROOT = 146.83; // D3
const nf = (semi) => ROOT * Math.pow(2, semi / 12);
// i – VI – III – VII in D minor (Dm, Bb, F, C) as semitone offsets from D
const CHORDS = [[0, 3, 7], [-4, 0, 3], [3, 7, 10], [-2, 2, 5]];
const BASS = [0, -4, 3, -2];
let pump = null, padBus = null;

function ensureMusicBuses() {
  if (padBus || !ctx) return;
  pump = ctx.createGain(); pump.gain.value = 1;
  padBus = ctx.createGain(); padBus.gain.value = 1;
  padBus.connect(pump).connect(musicBus);
}
function duck(delay, depth = 0.4, rel = 0.22) {
  const t = ctx.currentTime + delay;
  pump.gain.cancelScheduledValues(t);
  pump.gain.setValueAtTime(depth, t);
  pump.gain.linearRampToValueAtTime(1, t + rel);
}
/** Detuned saw stack through an enveloped low-pass: brass stabs, leads, plucks, bass. */
function synth({ f, dur = 0.3, gain = 0.2, delay = 0, cut0 = 3000, cut1 = 400, q = 2, type = 'sawtooth', detunes = [-9, 0, 9], attack = 0.005, out, send = 0, glide = 0 }) {
  const c = ctx, t = c.currentTime + delay;
  const flt = c.createBiquadFilter(); flt.type = 'lowpass'; flt.Q.value = q;
  flt.frequency.setValueAtTime(cut0, t); flt.frequency.exponentialRampToValueAtTime(Math.max(60, cut1), t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  flt.connect(g).connect(out || padBus);
  if (send) { const sg = c.createGain(); sg.gain.value = send; g.connect(sg).connect(verbSend); }
  for (const d of detunes) {
    const o = c.createOscillator(); o.type = type; o.detune.value = d;
    o.frequency.setValueAtTime(glide ? f * glide : f, t);
    if (glide) o.frequency.exponentialRampToValueAtTime(f, t + 0.08);
    o.connect(flt); o.start(t); o.stop(t + dur + 0.05);
  }
}
const kick = (d, g = 1, out) => { osc({ type: 'sine', f0: 160, f1: 42, dur: 0.38, gain: 1.15 * g, delay: d, out }); nz({ filter: 'highpass', f0: 3000, dur: 0.012, gain: 0.25 * g, delay: d, out }); };
const clap = (d, g = 1, out, send = 0.35) => { for (const x of [0, 0.012, 0.024]) nz({ filter: 'bandpass', f0: 1400, q: 0.9, dur: 0.14, gain: 0.45 * g, delay: d + x, out, send }); };
const hat = (d, open = false, g = 1, out) => nz({ filter: 'highpass', f0: 8500, dur: open ? 0.16 : 0.035, gain: (open ? 0.13 : 0.08) * g, delay: d, out });
const sub = (f, d, dur, g = 1) => synth({ f, dur, gain: 0.5 * g, delay: d, type: 'sine', detunes: [0], cut0: 400, cut1: 200, q: 0.5, out: musicBus, glide: 1.5 });

export const music = {
  track: null, step: 0, next: 0, timer: null, intensity: 0,
  play(name) {
    if (this.track === name) return;
    this.stop();
    this.track = name;
    if (!name) return;
    const c = ac(); if (!c || c.state !== 'running') return; // starts on resume() after a user gesture
    this.begin();
  },
  resume() { if (this.track && !this.timer && ctx && ctx.state === 'running') this.begin(); },
  begin() {
    ensureMusicBuses();
    this.step = 0; this.next = ctx.currentTime + 0.08;
    // whoosh-in so the track never starts cold
    nz({ filter: 'bandpass', f0: 400, f1: 4000, q: 1, dur: 0.5, gain: 0.25, attack: 0.45, out: musicBus });
    this.timer = setInterval(() => this.schedule(), 60); this.schedule();
  },
  stop() { clearInterval(this.timer); this.timer = null; this.track = null; },
  schedule() {
    if (!ctx) return;
    const bpm = this.track === 'battle' ? 150 : 118;
    const spb = 60 / bpm / 4; // 16th notes
    // Schedule well ahead so busy frames (loading, effects) never starve the music.
    if (this.next < ctx.currentTime - 0.05) { const skip = Math.ceil((ctx.currentTime - this.next) / spb); this.next += skip * spb; this.step += skip; }
    while (this.next < ctx.currentTime + 0.5) {
      const d = Math.max(0, this.next - ctx.currentTime);
      this.track === 'battle' ? this.battleStep(this.step, d, spb) : this.menuStep(this.step, d, spb);
      this.step++; this.next += spb;
    }
  },

  // "Ember Lobby": 118 BPM, 8-bar cycle. Bars 1-4 groove, 5-8 full with arps; riser into the loop.
  menuStep(s, d, spb) {
    const i = s % 16, bar = Math.floor(s / 16) % 8, ch = CHORDS[bar % 4], full = bar >= 4;
    const out = musicBus;
    // drums: half-time hip-hop kick + epic snare with tail, trap hats
    if (i === 0 || i === 10 || (full && i === 7)) { kick(d, 1, out); duck(d); }
    if (i === 8) { clap(d, 1, out, 0.6); nz({ type: 'brown', filter: 'lowpass', f0: 900, dur: 0.25, gain: 0.35, delay: d, out, send: 0.6 }); }
    if (i % 2 === 0 || (full && i % 4 === 3)) hat(d, false, 1, out);
    if (bar === 3 && i >= 12) hat(d + spb / 2, false, 0.8, out); // hat roll
    if (i === 0 && bar % 2 === 0) this.taikoHit(d, 0.9);
    if (i === 0 && bar === 0) nz({ filter: 'highpass', f0: 3000, f1: 9000, dur: 1.4, gain: 0.3, delay: d, out, send: 0.7 }); // crash
    // sub bass on the chord root
    if (i === 0) sub(nf(BASS[bar % 4] - 12), d, spb * 9.5);
    if (i === 10) sub(nf(BASS[bar % 4] - 12), d, spb * 5, 0.8);
    // brass-like chord stabs: the hook rhythm
    const stab = { 0: 0.6, 3: 0.22, 6: 0.22, 10: 0.3, 14: 0.18 }[i];
    if (stab) for (const n of ch) synth({ f: nf(n), dur: stab * (full ? 1 : 0.85), gain: 0.07, delay: d, cut0: 2600, cut1: 500, q: 3, send: 0.35 });
    // pluck arpeggio in the full half
    if (full) {
      const n = ch[[0, 1, 2, 1][i % 4]] + 12 + (i >= 8 ? 12 : 0);
      synth({ f: nf(n), dur: 0.16, gain: 0.05, delay: d, cut0: 5000, cut1: 700, q: 6, type: 'square', detunes: [0, 7], send: 0.4 });
    }
    // high pad
    if (i === 0) synth({ f: nf(ch[2] + 12), dur: spb * 16, gain: 0.03, attack: 0.6, delay: d, cut0: 1800, cut1: 900, type: 'triangle', detunes: [-12, 12], send: 0.8 });
    // riser into the top of the cycle
    if (bar === 7 && i === 8) sfx.riser(spb * 8 * 0.98, d);
  },

  // "Arena Pulse": 150 BPM four-on-the-floor, rolling 16th bass, lead hook every other phrase, fills.
  battleStep(s, d, spb) {
    const i = s % 16, bar = Math.floor(s / 16) % 8, ch = CHORDS[bar % 4], out = musicBus, hot = this.intensity;
    if (i % 4 === 0) { kick(d, 1, out); duck(d, 0.35, 0.18); }
    if (i === 4 || i === 12) clap(d, 1, out, 0.3);
    if (i % 4 === 2) hat(d, true, 1, out); else hat(d, false, 0.8 + hot * 0.4, out);
    if (bar === 7 && i >= 12) clap(d + spb / 2, 0.6, out, 0.2); // snare fill
    if (i === 0 && bar === 0) nz({ filter: 'highpass', f0: 3000, f1: 9000, dur: 1.2, gain: 0.3, delay: d, out, send: 0.6 });
    if (i === 0 && bar % 4 === 0) this.taikoHit(d, 0.8);
    // rolling bass (off the kick)
    if (i % 4 !== 0) synth({ f: nf(BASS[bar % 4] - 12 + (i % 4 === 3 ? 12 : 0)), dur: spb * 0.9, gain: 0.16, delay: d, cut0: 1200 + hot * 1500, cut1: 180, q: 6, detunes: [-6, 6] });
    // lead hook (original): plays in bars 4-7, always when the fight is intense
    if (bar >= 4 || hot > 0.6) {
      const hook = [12, null, 15, 12, null, 10, 12, null, 7, null, 10, 12, null, 15, 14, 12];
      const n = hook[i];
      if (n != null) synth({ f: nf(n + (bar % 4 === 1 ? -4 : bar % 4 === 2 ? 3 : bar % 4 === 3 ? -2 : 0)), dur: spb * 1.6, gain: 0.06, delay: d, cut0: 4200, cut1: 1200, q: 4, detunes: [-14, 0, 14], send: 0.35 });
    }
    if (i === 0) for (const n of ch) synth({ f: nf(n + 12), dur: spb * 15, gain: 0.025, attack: 0.3, delay: d, cut0: 1600, cut1: 900, detunes: [-10, 10], send: 0.6 });
    if (bar === 7 && i === 0) sfx.riser(spb * 16 * 0.98, d);
  },
  taikoHit(d, g) { osc({ type: 'sine', f0: 150, f1: 50, dur: 0.6, gain: 1.1 * g, delay: d, out: musicBus, send: 0.5 }); nz({ filter: 'lowpass', f0: 1600, f1: 300, dur: 0.14, gain: 0.5 * g, delay: d, out: musicBus }); },
  setIntensity(x) { this.intensity = x; },
};

/** Scripted score for the opening cinematic (times in seconds from the start). */
export function introScore() {
  const c = ac(); if (!c) return;
  ensureMusicBuses();
  const T = (t, fn) => fn(t);
  // heartbeat in darkness
  T(0.05, (t) => { osc({ type: 'sine', f0: 70, f1: 38, dur: 0.22, gain: 1.1, delay: t }); osc({ type: 'sine', f0: 62, f1: 34, dur: 0.24, gain: 0.9, delay: t + 0.24 }); });
  T(0.55, (t) => { osc({ type: 'sine', f0: 70, f1: 38, dur: 0.22, gain: 1.2, delay: t }); osc({ type: 'sine', f0: 62, f1: 34, dur: 0.24, gain: 1, delay: t + 0.24 }); });
  // drone swells under everything
  synth({ f: nf(-12), dur: 4.6, gain: 0.12, attack: 1.2, delay: 0, cut0: 300, cut1: 1400, q: 3, detunes: [-8, 0, 8], out: musicBus, send: 0.5 });
  // fighter stamps
  const stamp = (t, el) => {
    osc({ type: 'sine', f0: 120, f1: 30, dur: 0.9, gain: 1.4, delay: t, send: 0.4 });
    nz({ type: 'brown', filter: 'lowpass', f0: 2200, f1: 120, dur: 0.7, gain: 1.1, delay: t, out: drive, send: 0.5 });
    metal({ base: 98, ratios: [1, 1.47, 2.31, 3.17], dur: 1.4, gain: 0.3, delay: t, send: 0.8 });
    if (el === 'fire') nz({ type: 'brown', filter: 'lowpass', f0: 300, f1: 2400, dur: 0.6, gain: 0.9, delay: t, attack: 0.04, out: drive });
    if (el === 'lightning') { nz({ filter: 'highpass', f0: 1800, dur: 0.07, gain: 0.9, delay: t }); osc({ type: 'sawtooth', f0: 2200, f1: 70, dur: 0.3, gain: 0.25, delay: t, out: drive }); }
    if (el === 'earth') for (let k = 0; k < 6; k++) nz({ filter: 'bandpass', f0: R(800, 2400), q: 3, dur: 0.06, gain: 0.5, delay: t + R(0, 0.3) });
    if (el === 'wind') nz({ filter: 'bandpass', f0: 500, f1: 2600, q: 7, dur: 0.6, gain: 0.9, delay: t, attack: 0.05 });
  };
  stamp(0.9, 'fire'); stamp(1.7, 'lightning'); stamp(2.5, 'earth'); stamp(2.9, 'wind');
  // charge: riser + accelerating drums into the clash
  sfx.riser(0.9, 3.3);
  [3.3, 3.55, 3.75, 3.9, 4.0, 4.08, 4.14].forEach((t, k) => kick(t, 0.6 + k * 0.06, musicBus));
  // clash
  T(4.2, (t) => {
    osc({ type: 'sine', f0: 100, f1: 20, dur: 1.6, gain: 1.8, delay: t, send: 0.6 });
    nz({ type: 'brown', filter: 'lowpass', f0: 4000, f1: 90, dur: 1.4, gain: 1.6, delay: t, out: drive, send: 0.7 });
    nz({ filter: 'highpass', f0: 2500, f1: 9000, dur: 1.6, gain: 0.5, delay: t, send: 0.9 });
    metal({ base: 82, ratios: [1, 1.52, 2.03, 2.71, 3.33, 4.17], dur: 5, gain: 0.5, delay: t, send: 1 });
  });
  // title drop: chord hit + taiko
  T(4.55, (t) => { for (const n of [0, 3, 7, 12]) synth({ f: nf(n), dur: 1.6, gain: 0.08, delay: t, cut0: 3200, cut1: 600, q: 2, send: 0.6 }); kick(t, 1.2, musicBus); });
  [4.55, 4.85, 5.0].forEach((t, k) => music.taikoHit(t, 1 - k * 0.15));
}

// ---------------------------------------------------------------- Announcer (speech synthesis)
let voice = null;
function pickVoice() {
  const vs = speechSynthesis.getVoices();
  voice = vs.find((v) => /en/i.test(v.lang) && /male|daniel|fred|alex|google uk english male|david|george/i.test(v.name)) || vs.find((v) => /en/i.test(v.lang)) || null;
}
if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }

export function announce(text) {
  if (!prefs.announcer || !prefs.volume || !('speechSynthesis' in window)) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if (voice) u.voice = voice;
    u.rate = 0.78; u.pitch = 0.1; u.volume = Math.min(1, prefs.volume / 60);
    speechSynthesis.speak(u);
  } catch { /* speech not available */ }
}
