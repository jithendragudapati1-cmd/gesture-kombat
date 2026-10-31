// Input abstraction. Keyboard, touch, gestures and the AI all drive a Controller.

export class Controller {
  constructor() {
    this.held = new Map(); // name -> Set(source)
    this.queue = []; // [{a, t}]
    this.lastSource = 'keyboard';
  }
  setHeld(source, name, on) {
    let s = this.held.get(name);
    if (!s) this.held.set(name, (s = new Set()));
    on ? s.add(source) : s.delete(source);
  }
  isHeld(name) { const s = this.held.get(name); return !!s && s.size > 0; }
  press(a, source = 'keyboard') {
    this.lastSource = source;
    this.queue.push({ a, t: performance.now() });
    if (this.queue.length > 4) this.queue.shift();
  }
  /** Next buffered action (within 220ms), or null. */
  take() {
    const now = performance.now();
    while (this.queue.length && now - this.queue[0].t > 220) this.queue.shift();
    return this.queue.shift()?.a || null;
  }
  dir() { return (this.isHeld('right') ? 1 : 0) - (this.isHeld('left') ? 1 : 0); }
  clear(source) {
    if (source) for (const s of this.held.values()) s.delete(source);
    else { this.held.clear(); this.queue.length = 0; }
  }
}

export const P1_KEYS = {
  KeyA: ['hold', 'left'], KeyD: ['hold', 'right'], KeyS: ['hold', 'crouch'], KeyL: ['hold', 'block'],
  KeyW: ['press', 'jump'], Space: ['press', 'jump'], KeyJ: ['press', 'punch'], KeyK: ['press', 'kick'], KeyF: ['press', 'special'], KeyU: ['press', 'double'], ShiftLeft: ['hold', 'run'],
};
export const P2_KEYS = {
  ArrowLeft: ['hold', 'left'], ArrowRight: ['hold', 'right'], ArrowDown: ['hold', 'crouch'], Digit3: ['hold', 'block'], Numpad3: ['hold', 'block'],
  ArrowUp: ['press', 'jump'], Digit1: ['press', 'punch'], Numpad1: ['press', 'punch'], Digit2: ['press', 'kick'], Numpad2: ['press', 'kick'], Digit4: ['press', 'special'], Numpad4: ['press', 'special'], Digit5: ['press', 'double'], Numpad5: ['press', 'double'],
};

/** Attach keyboard to controllers. Returns detach fn. */
export function bindKeyboard(p1, p2 /* nullable */) {
  const map = (code) => (P1_KEYS[code] ? [p1, P1_KEYS[code]] : p2 && P2_KEYS[code] ? [p2, P2_KEYS[code]] : null);
  const down = (e) => {
    if (e.target.closest?.('input,select,textarea')) return;
    const m = map(e.code); if (!m) return;
    e.preventDefault();
    const [c, [kind, name]] = m;
    if (kind === 'hold') c.setHeld('kb', name, true);
    else if (!e.repeat) c.press(name, 'keyboard');
  };
  const up = (e) => {
    const m = map(e.code); if (!m) return;
    const [c, [kind, name]] = m;
    if (kind === 'hold') c.setHeld('kb', name, false);
  };
  const blur = () => { p1.clear('kb'); p2?.clear('kb'); };
  addEventListener('keydown', down);
  addEventListener('keyup', up);
  addEventListener('blur', blur);
  return () => { removeEventListener('keydown', down); removeEventListener('keyup', up); removeEventListener('blur', blur); };
}

/** On-screen touch pad (for phones/tablets). Returns element. */
export function touchPad(ctrl) {
  const el = document.createElement('div');
  el.className = 'touchpad';
  el.innerHTML = `
    <div class="tp-dpad">
      <button data-h="left" aria-label="Move left">◀</button>
      <button data-p="jump" aria-label="Jump">▲</button>
      <button data-h="crouch" aria-label="Crouch">▼</button>
      <button data-h="right" aria-label="Move right">▶</button>
    </div>
    <div class="tp-actions">
      <button data-p="punch">Punch</button>
      <button data-p="double">2× Punch</button>
      <button data-p="kick">Kick</button>
      <button data-h="block">Block</button>
      <button data-p="special" class="tp-special">Special</button>
    </div>`;
  const on = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    e.preventDefault();
    b.classList.add('on');
    if (b.dataset.h) ctrl.setHeld('touch', b.dataset.h, true);
    else ctrl.press(b.dataset.p, 'touch');
  };
  const off = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    b.classList.remove('on');
    if (b.dataset.h) ctrl.setHeld('touch', b.dataset.h, false);
  };
  el.addEventListener('pointerdown', on);
  el.addEventListener('pointerup', off);
  el.addEventListener('pointercancel', off);
  el.addEventListener('pointerleave', off, true);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  return el;
}
