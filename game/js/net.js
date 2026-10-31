// Online versus over Supabase Realtime: one player creates a room code, a friend joins it.
// The host (Player 1) is the referee for health, rounds and the clock; each side owns its own
// fighter's movement, so your own fighter always reacts instantly on your screen.
import { auth } from './auth.js';

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const listeners = new Set();
const round3 = (v) => Math.round(v * 1000) / 1000;

export const net = {
  room: null, role: null, code: '', channel: null,
  me: null, peer: null, // {name, fighter, ready}
  get side() { return this.role === 'host' ? 1 : 2; },
  get active() { return !!this.channel; },
  on(fn) { listeners.add(fn); return () => listeners.delete(fn); },

  async create(me) {
    let code = '';
    for (let i = 0; i < 5; i++) code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    await this.open(code, 'host', me);
    return code;
  },

  async join(code, me) {
    code = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length !== 5) throw new Error('Room codes have 5 letters/numbers.');
    await this.open(code, 'guest', me);
    // Wait for the host to show up in the room.
    const host = await new Promise((res) => {
      const t0 = Date.now();
      const iv = setInterval(() => {
        const p = this.presence();
        if (p.host || Date.now() - t0 > 6000) { clearInterval(iv); res(p); }
      }, 200);
    });
    if (!host.host) { await this.leave(); throw new Error('No room with that code. Check the code with your friend.'); }
    if (host.guests > 1) { await this.leave(); throw new Error('That room is already full.'); }
  },

  async open(code, role, me) {
    await this.leave();
    const c = await auth.init();
    if (!c) throw new Error(auth.reason || 'Online play needs the online version of the game.');
    this.code = code; this.role = role; this.me = { ...me }; this.peer = null;
    const ch = c.channel(`gk-room-${code}`, { config: { broadcast: { self: false, ack: false }, presence: { key: `${role}-${Math.random().toString(36).slice(2, 8)}` } } });
    this.channel = ch;
    ch.on('broadcast', { event: 'm' }, ({ payload }) => emit(payload));
    ch.on('presence', { event: 'sync' }, () => {
      const p = this.presence();
      const before = this.peer;
      this.peer = p.peer;
      if (!before && this.peer) emit({ t: 'peer-join' });
      else if (before && !this.peer) emit({ t: 'peer-leave' });
      else emit({ t: 'peer-update' });
    });
    await new Promise((res, rej) => {
      const to = setTimeout(() => rej(new Error('Couldn’t connect to the game server. Check your internet and try again.')), 10000);
      ch.subscribe((status) => {
        if (status === 'SUBSCRIBED') { clearTimeout(to); res(); }
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { clearTimeout(to); rej(new Error('Couldn’t connect to the game server. Try again.')); }
      });
    });
    await ch.track({ role, ...this.me });
  },

  presence() {
    const st = this.channel?.presenceState() || {};
    const all = Object.values(st).flat();
    const others = all.filter((p) => p.role !== this.role);
    return { host: all.some((p) => p.role === 'host'), guests: all.filter((p) => p.role === 'guest').length, peer: others[0] || null };
  },

  async update(me) { this.me = { ...this.me, ...me }; await this.channel?.track({ role: this.role, ...this.me }); },

  send(msg) { this.channel?.send({ type: 'broadcast', event: 'm', payload: msg }); },

  async leave() {
    const ch = this.channel; this.channel = null; this.peer = null; this.role = null;
    if (ch) { try { this.send.call({ channel: ch }, { t: 'bye' }); await ch.untrack(); await ch.unsubscribe(); } catch { /* already gone */ } }
  },
};

function emit(msg) { for (const fn of listeners) { try { fn(msg); } catch (e) { console.warn(e); } } }

/**
 * Wires a running Game to the room: relays this player's inputs and body pose, applies the friend's.
 * Returns a stop() function.
 */
export function linkGame(game, { local, remote, tracker }) {
  const mySide = net.side;
  const mine = mySide === 1 ? game.p1 : game.p2;
  const theirs = mySide === 1 ? game.p2 : game.p1;
  const KEYS = ['left', 'right', 'crouch', 'block', 'forward', 'back', 'run'];

  // Outgoing: button presses go out the moment they happen.
  const press = local.press.bind(local);
  local.press = (a, src) => { press(a, src); net.send({ t: 'p', a }); };
  let lastHeld = '';
  remote.lastPose = null;

  // Incoming
  const off = net.on((m) => {
    if (m.t === 'p') remote.press(m.a, 'net');
    else if (m.t === 'h') { const on = new Set(m.k); for (const k of KEYS) remote.setHeld('net', k, on.has(k)); }
    else if (m.t === 's') {
      if (m.lm) remote.lastPose = { lm: m.lm.map(([x, y, z]) => ({ x, y, z, visibility: 1 })), t: performance.now() };
      game.netApply(m, theirs);
    }
  });

  // Held keys (walk/crouch/block) on change, plus a 12 Hz state/pose packet.
  const heldTimer = setInterval(() => {
    const now = KEYS.filter((k) => local.isHeld(k)).join(',');
    if (now !== lastHeld) { lastHeld = now; net.send({ t: 'h', k: now ? now.split(',') : [] }); }
  }, 33);
  const stateTimer = setInterval(() => {
    const m = { t: 's', x: Math.round(mine.x), y: Math.round(mine.y), vx: Math.round(mine.vx), vy: Math.round(mine.vy) };
    const mo = tracker?.active ? tracker.motion() : null;
    if (mo && performance.now() - mo.t < 500) m.lm = mo.lm.map((p) => [round3(p.x), round3(p.y), round3(p.z)]);
    if (net.role === 'host') Object.assign(m, game.netSnapshot());
    net.send(m);
  }, 83);

  return () => { clearInterval(heldTimer); clearInterval(stateTimer); off(); local.press = press; };
}
