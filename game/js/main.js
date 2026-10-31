// Gesture Kombat — app shell: loading, menus, screens, battle wrapper.
import { FIGHTERS, DIFFICULTY, MOVE_LIST, ACADEMY, fighterById } from './data.js';
import { AcademyDemo } from './academy.js';
import { prefs, stats, savePrefs, saveStats, resetStats, recordMatch } from './store.js';
import { sfx, music, applyVolumes, audioReady, announce, introScore } from './audio.js';
import { Controller, bindKeyboard, touchPad } from './input.js';
import { Game, prepareArt } from './game.js';
import { tracker } from './gesture.js';
import { MirrorPreview } from './mirror.js';
import { Intro } from './intro.js';
import { loadModelData } from './r3d.js';
import { asset } from './assets.js';
import { auth, USERNAME_RE } from './auth.js';
import { net, linkGame } from './net.js';
import { ambient, transition, countUp, letters, tilt, shakeApp, motionOK } from './vfx-ui.js';

const app = document.getElementById('app');
const modal = document.getElementById('modal');
const modalBody = document.getElementById('modalBody');
const toastEl = document.getElementById('toast');

const ASSET = {
  arena: asset('assets/arena.webp'), menu: asset('assets/menu.webp'),
  ...Object.fromEntries(FIGHTERS.map((f) => [f.id, asset(`assets/fighter-${f.id}.webp`)])),
  ...Object.fromEntries(FIGHTERS.map((f) => ['card-' + f.id, asset(`assets/card-${f.id}.webp`)])),
};
const images = {};

const state = {
  screen: 'loading',
  mode: 'single', // single | local | training
  difficulty: prefs.difficulty in DIFFICULTY ? prefs.difficulty : 'Medium',
  p1: prefs.favorite, p2: 'lightning',
  picking: 1,
  controls: 'keyboard', // keyboard | gesture
  settingsTab: 'General', settingsReturn: 'menu',
  howTab: 'Academy', academyMove: 'special', academyFighter: 'fire',
  lastResult: null,
  online: { view: 'start', err: '', busy: false, controls: 'keyboard', mine: null },
  authView: 'signin', authEmail: '', authMsg: '', authErr: '', resendAt: 0,
};
let game = null, detachKeys = null, ctrls = null, netUnlink = null;

const isTouch = matchMedia('(pointer: coarse)').matches;
const GESTURE_ITEMS = [['punch', 'Punch'], ['double', 'Double punch'], ['kick', 'Kick'], ['block', 'Block'], ['special', 'Special'], ['jump', 'Jump'], ['crouch', 'Crouch'], ['forward', 'Walk forward'], ['back', 'Walk back'], ['run', 'Run'], ['left', 'Lean left'], ['right', 'Lean right']];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const btn = (label, action, cls = '', extra = '') => `<button type="button" data-action="${action}" class="${cls}" ${extra}>${label}</button>`;

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => toastEl.classList.remove('show'), 2800);
}

// ---------------------------------------------------------------- Loading
async function boot() {
  document.body.dataset.screen = 'loading';
  const intro = new Intro({ touch: isTouch });
  const sp = document.getElementById('splash');
  if (sp) requestAnimationFrame(() => { sp.classList.add('off'); setTimeout(() => sp.remove(), 400); });
  const entries = Object.entries(ASSET);
  let done = 0;
  await Promise.all(entries.map(([k, src]) => new Promise((res) => {
    const im = new Image();
    im.onload = () => { images[k] = im; intro.target = ++done / entries.length; res(); };
    im.onerror = () => { intro.target = ++done / entries.length; res(); };
    im.src = src;
  })));
  prepareArt(FIGHTERS, images, images.arena);
  intro.setImages(images);
  const oauthReturn = /[?&]code=/.test(location.search) || /access_token/.test(location.hash);
  const authReady = auth.available ? Promise.race([auth.init().catch((e) => console.warn('auth', e)), new Promise((r) => setTimeout(r, 6000))]) : Promise.resolve();
  const skip = new URLSearchParams(location.search).has('skipintro') || oauthReturn;
  await intro.loaded(skip ? 0 : 1600);
  await intro.gate(skip);
  sfx.unlock();
  if (!skip) {
    introScore();
    await intro.cinematic(() => announce('Gesture Kombat'));
  }
  sfx.slash();
  await intro.blast();
  await authReady;
  if (auth.recovering) setAuth('newpass');
  show(auth.recovering ? 'login' : !auth.available || auth.user || auth.guest || new URLSearchParams(location.search).has('skipintro') ? 'menu' : 'login');
  intro.reveal();
  // Fetch the 3D fighters in the background; battles use the 2D art until they arrive.
  if (prefs.models3d !== false) for (const f of FIGHTERS) loadModelData(f.id).catch(() => {});
}

// ---------------------------------------------------------------- Router
const GATE = new Set(['vs', 'battle', 'result']);
function show(screen, opts = {}) {
  const from = state.screen;
  if (from === 'loading' || from === screen || opts.instant) return renderScreen(screen, opts);
  const kind = GATE.has(screen) || from === 'battle' || from === 'result' ? 'gate' : 'slash';
  const color = screen === 'vs' || screen === 'battle' ? fighterById(state.p1).color : '#ff4a1a';
  transition(kind, () => renderScreen(screen, opts), color);
}

function renderScreen(screen, opts = {}) {
  if (state.screen === 'battle' && screen !== 'battle') endBattle();
  if (screen === 'menu' || screen === 'title') { tracker.stop(); if (net.active) net.leave(); }
  state.screen = screen;
  document.body.dataset.screen = screen;
  if (modal.open) modal.close();
  music.play(screen === 'battle' ? 'battle' : 'menu');
  ambient.setMode(screen === 'battle' ? 'battle' : screen === 'menu' || screen === 'title' ? 'menu' : 'screen');
  app.classList.add('intro');
  clearTimeout(renderScreen.t);
  renderScreen.t = setTimeout(() => app.classList.remove('intro'), 2200);
  const r = screens[screen];
  r(opts);
  if (screen !== 'battle') {
    if (motionOK()) app.animate([{ opacity: 0, transform: 'scale(1.03)', filter: 'brightness(1.8) blur(2px)' }, { opacity: 1, transform: 'none', filter: 'none' }], { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)' });
    const first = app.querySelector('[autofocus], .primary, button');
    if (first && !isTouch) first.focus({ preventScroll: true });
  }
}

const header = (back = 'menu', label = 'GESTURE KOMBAT') =>
  `<header class="topbar">${btn('← Back', back, 'ghost back')}<span class="eyebrow">${label}</span></header>`;

const layout = (title, sub, body, back = 'menu', label) =>
  `<section class="screen">${header(back, label)}<h1>${title}</h1><p class="sub">${sub}</p>${body}</section>`;

const modeLabel = () => ({ single: 'SINGLE PLAYER', local: 'LOCAL VERSUS', training: 'TRAINING', online: 'ONLINE VERSUS' })[state.mode];

const screens = {
  menu() {
    const items = [['Play', 'play'], ['Character select', 'characters'], ['Settings', 'settings'], ['How to play', 'how'], ['Camera tracking', 'cameraTest'], ['Account settings', 'account'], ['Exit', 'exit']];
    app.innerHTML = `
      <div class="art-stage menu-stage" style="background-image:url(${ASSET.menu})">
        <nav class="locked-menu" aria-label="Main menu">
          ${items.map(([l, a], i) => btn(`<span class="lbl">${l}</span> <b aria-hidden="true">›</b>`, a, (i === 0 ? 'primary ' : '') + 'mi', `style="--i:${i}"`)).join('')}
        </nav>
        <i class="logo-rays" aria-hidden="true"></i><i class="logo-glow" aria-hidden="true"></i><i class="logo-shine" aria-hidden="true"></i>
        ${[[5, 26], [23.5, 14], [38, 12], [62, 12], [74.5, 14], [95, 26]].map(([x, y], i) => `<i class="torch" style="left:${x}%;top:${y}%;--d:${(i * 0.37) % 1.3}s" aria-hidden="true"></i>`).join('')}
        <i class="aura fire" aria-hidden="true"></i><i class="aura storm" aria-hidden="true"></i>
      </div>
      <div class="acct-chip">${auth.user
        ? `<span class="acct-name"><i aria-hidden="true">⚔</i>${esc(auth.name)}</span>${btn('Sign out', 'signOut', 'ghost')}`
        : `<span class="acct-name guest">Guest</span>${btn('Sign in', 'loginScreen', 'ghost')}`}</div>
      <footer class="locked-footer">${btn('Privacy', 'privacy', 'link')}${btn('Help', 'help', 'link')}<span class="ver">v8.4</span></footer>`;
  },

  online() {
    const o = state.online;
    const mine = (o.mine ||= state.p1);
    const myName = esc(auth.user ? auth.name : prefs.name);
    const chips = `<div class="ac-chips on-chips">${FIGHTERS.map((f) => `<button type="button" data-action="onlineFighter" data-id="${f.id}" class="${f.id === mine ? 'active' : ''}" style="--c:${f.color}">${f.name}</button>`).join('')}</div>`;
    const err = o.err ? `<p class="auth-msg err" role="alert">${esc(o.err)}</p>` : '';
    let body;
    if (!net.active) {
      body = `<div class="online-grid">
        <div class="on-card"><h3>Create a room</h3><p class="fine">Get a code and send it to your friend.</p>
          ${btn(o.busy === 'create' ? 'Creating…' : 'Create room', 'onlineCreate', 'primary wide', o.busy ? 'disabled' : '')}</div>
        <form class="on-card" data-form="joinRoom" novalidate><h3>Join a room</h3><p class="fine">Type the code your friend sent you.</p>
          <input name="code" class="code-input room-code-input" maxlength="5" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABCDE" aria-label="Room code" required>
          <button type="submit" class="primary wide" ${o.busy ? 'disabled' : ''}>${o.busy === 'join' ? 'Joining…' : 'Join room'}</button></form>
      </div>
      <div class="on-me"><span>You: <b>${myName}</b> · Fighter</span>${chips}</div>
      <p class="fine" style="text-align:center;margin-top:16px">Both on one computer? ${btn('Play on this device instead', 'localVersus', 'link')}</p>
      ${!auth.available ? `<p class="auth-msg warn">${esc(auth.reason)}</p>` : ''}`;
    } else {
      const peer = net.peer;
      const pf = peer ? fighterById(peer.fighter) : null;
      const camReady = tracker.status === 'ready';
      body = `<div class="room-code"><span>ROOM CODE</span><b>${esc(net.code)}</b>${btn('Copy', 'onlineCopy', 'ghost')}</div>
        <div class="on-players">
          <div class="on-player me" style="--c:${fighterById(mine).color}"><img src="${ASSET[mine]}" alt=""><div><small>${net.role === 'host' ? 'PLAYER 1 · YOU' : 'PLAYER 2 · YOU'}</small><b>${myName}</b><i>${fighterById(mine).name}</i></div></div>
          <div class="on-vs">VS</div>
          ${peer ? `<div class="on-player" style="--c:${pf.color}"><img src="${ASSET[pf.id]}" alt=""><div><small>${net.role === 'host' ? 'PLAYER 2' : 'PLAYER 1'}</small><b>${esc(peer.name || 'Friend')}</b><i>${pf.name}</i></div></div>`
                 : `<div class="on-player waiting"><div class="on-spinner" aria-hidden="true"></div><div><small>WAITING…</small><b>Send the code to your friend</b><i>They choose Online Versus → Join room</i></div></div>`}
        </div>
        <div class="on-me"><span>Your fighter</span>${chips}</div>
        <div class="on-controls">
          <span>Fight with</span>
          <div class="tabs">${[['keyboard', isTouch ? 'Touch' : 'Keyboard'], ['gesture', 'Camera (your body)']].map(([v, l]) => `<button type="button" data-action="onlineControls" data-v="${v}" class="${o.controls === v ? 'active' : ''}">${l}</button>`).join('')}</div>
          ${o.controls === 'gesture' ? `<div class="cam-mini"><div class="cam-slot" id="camSlot"><div class="cam-placeholder">Camera is off</div></div><div><div id="camStatus" class="cam-status"></div>${btn(camReady ? 'Recalibrate' : 'Enable camera', camReady ? 'recalibrate' : 'enableCamera', '', 'id="camBtn"')}<ul class="gesture-check" id="gestureCheck" hidden></ul></div></div>` : ''}
        </div>
        <div class="modal-actions center">
          ${net.role === 'host' ? btn(peer ? 'Start fight' : 'Waiting for friend…', 'onlineStart', 'primary', peer ? '' : 'disabled') : `<span class="fine">${peer ? 'Waiting for the host to start the fight…' : 'Connecting…'}</span>`}
          ${btn('Leave room', 'onlineLeave', 'ghost')}
        </div>`;
    }
    app.innerHTML = layout('Online Versus', 'YOU VS YOUR FRIEND · EACH ON THEIR OWN DEVICE', `<div class="panel online-panel">${err}${body}</div>`, net.active ? 'onlineLeave' : 'play', 'ONLINE VERSUS');
    if (net.active && o.controls === 'gesture') mountCamera('camSlot');
  },

  login() {
    const v = state.authView;
    const msg = state.authErr ? `<p class="auth-msg err" role="alert">${esc(state.authErr)}</p>` : state.authMsg ? `<p class="auth-msg ok" role="status">${esc(state.authMsg)}</p>` : '';
    const off = !auth.available;
    const pw = (name, label, ac) => `<label class="field"><span>${label}</span><span class="pw"><input type="password" name="${name}" minlength="8" required autocomplete="${ac}" ${off ? 'disabled' : ''}><button type="button" class="ghost eye" data-action="togglePw" aria-label="Show password">Show</button></span></label>`;
    const field = (name, label, type, ac, extra = '') => `<label class="field"><span>${label}</span><input type="${type}" name="${name}" autocomplete="${ac}" required ${extra} ${off ? 'disabled' : ''}></label>`;
    const google = `<button type="button" class="google" data-action="google" ${off ? 'disabled' : ''}><svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>Continue with Google</button>`;
    let body = '';
    if (v === 'signin' || v === 'signup') {
      body = `<div class="tabs auth-tabs" role="tablist">
          <button type="button" role="tab" aria-selected="${v === 'signin'}" class="${v === 'signin' ? 'active' : ''}" data-action="authView" data-view="signin">Sign in</button>
          <button type="button" role="tab" aria-selected="${v === 'signup'}" class="${v === 'signup' ? 'active' : ''}" data-action="authView" data-view="signup">Create account</button></div>
        ${google}<div class="or"><span>or</span></div>
        ${v === 'signin'
          ? `<form data-form="signin" novalidate>${field('email', 'Email', 'email', 'email', `value="${esc(state.authEmail)}"`)}${pw('password', 'Password', 'current-password')}
              <button type="button" class="link forgot" data-action="authView" data-view="forgot">Forgot password?</button>
              <button type="submit" class="primary wide" ${off ? 'disabled' : ''}>Sign in</button></form>`
          : `<form data-form="signup" novalidate>${field('username', 'Username', 'text', 'username', 'maxlength="16" pattern="[A-Za-z0-9_]{3,16}" data-check="username"')}<small class="hint" id="unameHint">3–16 letters, numbers or _</small>
              ${field('email', 'Email', 'email', 'email', `value="${esc(state.authEmail)}"`)}${pw('password', 'Password', 'new-password')}${pw('password2', 'Confirm password', 'new-password')}
              <button type="submit" class="primary wide" ${off ? 'disabled' : ''}>Create account</button>
              <p class="fine">We’ll email you a welcome message with a link to confirm your address.</p></form>`}`;
    } else if (v === 'checkEmail') {
      body = `<div class="auth-icon" aria-hidden="true">✉</div><h3>Check your inbox</h3>
        <p class="fine">We sent a welcome email to <b>${esc(state.authEmail)}</b>. Click the button in it to confirm your account, then come back and sign in.</p>
        <button type="button" class="primary wide" data-action="authView" data-view="signin">Back to sign in</button>
        <button type="button" class="link" data-action="resendConfirm">Didn’t get it? Resend email</button>`;
    } else if (v === 'forgot') {
      body = `<h3>Forgot password</h3><p class="fine">Enter your account email. We’ll send you a reset code.</p>
        <form data-form="forgot" novalidate>${field('email', 'Email', 'email', 'email', `value="${esc(state.authEmail)}"`)}<button type="submit" class="primary wide" ${off ? 'disabled' : ''}>Send code</button></form>
        <button type="button" class="link" data-action="authView" data-view="signin">← Back to sign in</button>`;
    } else if (v === 'code') {
      const wait = Math.max(0, Math.ceil((state.resendAt - Date.now()) / 1000));
      body = `<h3>Enter your code</h3><p class="fine">We emailed <b>${esc(state.authEmail)}</b>. Type the code from the email here, or just click the reset link in it.</p>
        <form data-form="code" novalidate><label class="field"><span>Verification code</span><input name="code" class="code-input" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6,10}" maxlength="10" required placeholder="••••••"></label>
          <button type="submit" class="primary wide">Verify code</button></form>
        <button type="button" class="link" data-action="resendCode" ${wait ? 'disabled' : ''} id="resendBtn">${wait ? `Resend code in ${wait}s` : 'Resend code'}</button>
        <button type="button" class="link" data-action="authView" data-view="forgot">Use a different email</button>`;
    } else if (v === 'newpass') {
      body = `<h3>Set a new password</h3><p class="fine">You’re verified. Enter your new password twice.</p>
        <form data-form="newpass" novalidate>${pw('password', 'New password', 'new-password')}${pw('password2', 'Confirm new password', 'new-password')}<button type="submit" class="primary wide">Save password</button></form>`;
    }
    app.innerHTML = `
      <section class="screen auth-screen">
        <div class="panel auth-panel">
          <div class="auth-brand"><b>GESTURE</b><b>KOMBAT</b><small>Your body. Your power.</small></div>
          ${off ? `<p class="auth-msg warn">${esc(auth.reason)}</p>` : ''}${msg}
          ${body}
          ${['signin', 'signup'].includes(v) ? `<div class="guest-row">${btn('Play as guest', 'guest', 'ghost')}</div>` : ''}
        </div>
      </section>`;
    if (v === 'code') { clearInterval(screens.login.t); if (Date.now() < state.resendAt) screens.login.t = setInterval(() => { const b = document.getElementById('resendBtn'); if (!b) return clearInterval(screens.login.t); const w = Math.ceil((state.resendAt - Date.now()) / 1000); if (w <= 0) { b.disabled = false; b.textContent = 'Resend code'; clearInterval(screens.login.t); } else b.textContent = `Resend code in ${w}s`; }, 1000); }
  },

  title() {
    app.innerHTML = `<div class="art-stage menu-stage" style="background-image:url(${ASSET.menu})"><i class="logo-glow" aria-hidden="true"></i><div class="title-cta">${btn('Enter the arena', 'menu', 'primary big')}</div></div>`;
  },

  modes() {
    const cards = [
      ['Single Player', 'Fight the CPU across best-of rounds', 'single', 'fire'],
      ['Versus a Friend', 'Room code: you and your friend, each on your own device', 'online', 'lightning'],
      ['Training', 'Practice moves & gestures on a dummy', 'training', 'earth'],
      ['Same-Device Versus', 'Two players on one keyboard', 'local', 'wind'],
    ];
    app.innerHTML = layout('Choose your battle', 'FIGHT YOUR WAY', `<div class="mode-cards">${cards.map(([n, d, a, img], i) => `
      <button type="button" data-action="mode" data-mode="${a}" class="tilt" style="--i:${i}">
        <img src="${ASSET['card-' + img]}" alt="">
        <strong>${n}</strong><small>${d}</small><i class="shine" aria-hidden="true"></i>
      </button>`).join('')}</div>`);
    tilt('.mode-cards .tilt');
  },

  difficulty() {
    app.innerHTML = layout('Select difficulty', 'TEST YOUR LIMITS', `<div class="panel difficulty">${Object.entries(DIFFICULTY).map(([n, d]) =>
      btn(`<span>${n}</span><i class="skulls">${'◆'.repeat(Object.keys(DIFFICULTY).indexOf(n) + 1)}</i><small>${d.desc}</small>`, 'difficulty', (n === state.difficulty ? 'primary ' : '') + 'mi', `data-level="${n}" style="--i:${Object.keys(DIFFICULTY).indexOf(n)}"`)).join('')}</div>`, 'play');
  },

  characters() {
    const picking = state.picking;
    const sel = picking === 1 ? state.p1 : state.p2;
    const f = fighterById(sel);
    const who = state.mode === 'local' ? (picking === 1 ? 'PLAYER 1' : 'PLAYER 2') : 'YOUR FIGHTER';
    const star = (n) => '★'.repeat(n) + '<span class="dim">' + '★'.repeat(5 - n) + '</span>';
    app.innerHTML = `
      <section class="screen">
        ${header(picking === 2 ? 'backPick' : state.mode === 'single' ? 'difficultyScreen' : 'play', `${modeLabel()} / FIGHTER SELECTION`)}
        <h1>Choose your fighter</h1>
        <p class="sub">${who} · MASTER YOUR ELEMENT</p>
        <div class="cards" role="radiogroup" aria-label="Fighters">${FIGHTERS.map((x, i) => `
          <button type="button" role="radio" style="--i:${i};--accent:${x.color}" class="fighter-card tilt ${x.id === sel ? 'selected' : ''} ${state.mode === 'local' && picking === 2 && x.id === state.p1 ? 'taken' : ''}"
            data-action="pick" data-id="${x.id}" aria-checked="${x.id === sel}">
            <img src="${ASSET['card-' + x.id]}" alt="">
            <i class="card-aura" aria-hidden="true"></i><i class="shine" aria-hidden="true"></i>
            <span class="card-info"><strong>${x.name}</strong><small>${x.role}</small></span>
          </button>`).join('')}</div>
        <div class="select-footer" style="--accent:${f.color}">
          <div class="fighter-detail">
            <div class="stat-row">${Object.entries(f.stats).map(([k, v]) => `<span>${k} <i>${star(v)}</i></span>`).join('')}</div>
            <p><b>${f.special.name}</b> — ${f.special.desc}</p>
          </div>
          ${btn(state.mode === 'local' && picking === 1 ? 'Confirm · P2 picks →' : 'Confirm →', 'confirmPick', 'primary')}
        </div>
      </section>`;
    tilt('.fighter-card');
  },

  controls() {
    const st = tracker.status;
    app.innerHTML = layout('How will you fight?', state.mode === 'local' ? 'PLAYER 1 MAY USE THE CAMERA · PLAYER 2 USES THE KEYBOARD' : 'USE YOUR BODY — OR YOUR KEYBOARD',
      `<div class="panel camera-panel">
        <div class="cam-pair"><div class="cam-slot" id="camSlot"><div class="cam-placeholder">Camera is off</div></div><div class="mirror-slot" id="mirrorSlot"></div></div>
        <div class="cam-side">
          <div id="camStatus" class="cam-status"></div>
          <ul class="gesture-check" id="gestureCheck">${GESTURE_ITEMS.map(([g, l]) => `<li data-g="${g}">${l}</li>`).join('')}</ul>
          <div class="modal-actions">
            ${btn(st === 'ready' ? 'Recalibrate' : 'Enable camera', st === 'ready' ? 'recalibrate' : 'enableCamera', '', 'id="camBtn"')}
            ${btn('Fight with gestures', 'fightGesture', 'primary', `id="fightGesture" ${st === 'ready' ? '' : 'disabled'}`)}
            ${btn(isTouch ? 'Use touch controls' : 'Use keyboard', 'fightKeyboard', st === 'ready' ? '' : 'primary')}
          </div>
          <p class="fine">Video is processed on this device and never uploaded. Stand 2–3 m back so your body from head to knees is in view.</p>
        </div>
      </div>`, 'characters', `${modeLabel()} / CONTROLS`);
    mountCamera('camSlot');
  },

  cameraTest() {
    app.innerHTML = layout('Camera tracking', 'TEST YOUR GESTURES', `
      <div class="panel camera-panel">
        <div class="cam-pair"><div class="cam-slot" id="camSlot"><div class="cam-placeholder">Camera is off</div></div><div class="mirror-slot" id="mirrorSlot"></div></div>
        <div class="cam-side">
          <div id="camStatus" class="cam-status"></div>
          <ul class="gesture-check" id="gestureCheck">${GESTURE_ITEMS.map(([g, l]) => `<li data-g="${g}">${l}</li>`).join('')}</ul>
          <div class="modal-actions">
            ${btn(tracker.status === 'ready' ? 'Recalibrate' : 'Enable camera', tracker.status === 'ready' ? 'recalibrate' : 'enableCamera', 'primary', 'id="camBtn"')}
            ${btn('Stop camera', 'stopCamera')}
            ${btn('Gesture guide', 'howGestures')}
          </div>
          <p class="fine">Video is processed on this device and never uploaded.</p>
        </div>
      </div>`);
    mountCamera('camSlot');
  },

  vs() {
    const a = fighterById(state.p1), b = fighterById(state.p2);
    const n1 = state.mode === 'online' ? (net.role === 'host' ? net.me?.name : net.peer?.name) || 'Player 1' : prefs.name;
    const n2 = state.mode === 'online' ? (net.role === 'guest' ? net.me?.name : net.peer?.name) || 'Player 2' : state.mode === 'local' ? 'PLAYER 2' : state.mode === 'training' ? 'TRAINING DUMMY' : `CPU · ${state.difficulty.toUpperCase()}`;
    const crack = Array.from({ length: 14 }, (_, i) => `${50 + (Math.random() - 0.5) * (i ? 9 : 0)},${(i / 13) * 100}`).join(' ');
    app.innerHTML = `
      <section class="vs-screen" style="--a:${a.color};--b:${b.color}">
        <div class="vs-bg left"></div><div class="vs-bg right"></div>
        <div class="vs-lines left"></div><div class="vs-lines right"></div>
        <svg class="vs-crack" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline points="${crack}"/><polyline class="core" points="${crack}"/></svg>
        <div class="vs-side left" style="--c:${a.color}"><img src="${ASSET[a.id]}" alt=""><div><strong>${letters(a.name)}</strong><small>${esc(n1)}</small></div></div>
        <div class="vs-mark"><span>VS</span><i class="ring"></i><i class="ring r2"></i></div>
        <div class="vs-side right" style="--c:${b.color}"><img src="${ASSET[b.id]}" alt=""><div><strong>${letters(b.name)}</strong><small>${esc(n2)}</small></div></div>
      </section>`;
    sfx.select(); sfx.riser(0.5);
    setTimeout(() => {
      if (state.screen !== 'vs') return;
      shakeApp(26, 520); sfx.vsSlam();
      ambient.burst(innerWidth / 2, innerHeight / 2, a.color, 40, 1.4);
      ambient.burst(innerWidth / 2, innerHeight / 2, b.color, 40, 1.4);
    }, 520);
    clearTimeout(screens.vs.t);
    screens.vs.t = setTimeout(() => state.screen === 'vs' && show('battle'), 2600);
  },

  battle() { startBattle(); },

  result() {
    const r = state.lastResult;
    const local = state.mode === 'local';
    const won = r.winner === (state.mode === 'online' ? net.side : 1);
    const title = r.winner === 0 ? 'DRAW' : local ? `PLAYER ${r.winner} WINS` : won ? 'VICTORY' : 'DEFEAT';
    const sub = r.winner === 0 ? 'EVENLY MATCHED' : local ? fighterById(r.winner === 1 ? state.p1 : state.p2).name.toUpperCase() + ' PREVAILS' : won ? (r.perfect ? 'FLAWLESS' : 'YOU WIN') : 'TRAIN. RETURN. CONQUER.';
    const s = state.mode === 'online' && net.side === 2 ? r.p2 : r.p1;
    const color = fighterById(r.winner === 2 ? state.p2 : state.p1).color;
    app.innerHTML = `
      <section class="screen result" style="--c:${color}">
        <p class="eyebrow">${modeLabel()} · ${fighterById(state.p1).name.toUpperCase()} VS ${fighterById(state.p2).name.toUpperCase()}</p>
        <h1 class="${won || local ? 'win' : 'lose'}" aria-label="${title}">${letters(title)}</h1>
        <h2>${sub}</h2>
        <div class="result-stats">
          <div style="--i:0"><b>${r.rounds.filter((x) => x.winner === (state.mode === 'online' ? net.side : 1)).length}–${r.rounds.filter((x) => x.winner === (state.mode === 'online' ? 3 - net.side : 2)).length}</b><span>Rounds</span></div>
          <div style="--i:1"><b data-count="${s.hits}" data-delay="700">0</b><span>Hits landed</span></div>
          <div style="--i:2"><b data-count="${s.bestCombo}" data-delay="800">0</b><span>Best combo</span></div>
          <div style="--i:3"><b data-count="${Math.round(s.damage)}" data-delay="900">0</b><span>Damage</span></div>
          <div style="--i:4"><b data-count="${s.specials}" data-delay="1000">0</b><span>Specials</span></div>
          <div style="--i:5"><b data-count="${s.blocks}" data-delay="1100">0</b><span>Blocks</span></div>
        </div>
        <div class="modal-actions center">${state.mode === 'online'
          ? (net.role === 'host' ? btn('Rematch', 'rematch', 'primary') : `<span class="fine">Waiting for ${esc(net.peer?.name || 'the host')} to start a rematch…</span>`) + btn('Back to room', 'onlineLobby') + btn('Leave room', 'onlineLeave')
          : btn('Rematch', 'rematch', 'primary') + btn('Character select', 'characters') + btn('Main menu', 'menu')}</div>
      </section>`;
    countUp(app);
    setTimeout(() => (won || local ? sfx.victory() : sfx.defeat()), 250);
    if (won || local) {
      for (let i = 0; i < 6; i++) setTimeout(() => {
        if (state.screen !== 'result') return;
        ambient.burst(innerWidth * (0.15 + Math.random() * 0.7), innerHeight * (0.12 + Math.random() * 0.3), i % 2 ? color : '#ffd36b', 34, 1.1);
        if (i === 0) shakeApp(10, 300);
      }, 350 + i * 330);
    }
  },

  settings() {
    const tabs = ['General', 'Gameplay', 'Controls', 'Camera', 'Audio', 'Account', 'About'];
    const t = state.settingsTab;
    const toggle = (key, label, hint = '') => `<label class="row"><span>${label}${hint ? `<small>${hint}</small>` : ''}</span><input type="checkbox" data-pref="${key}" ${prefs[key] ? 'checked' : ''}></label>`;
    const select = (key, label, opts, hint = '') => `<label class="row"><span>${label}${hint ? `<small>${hint}</small>` : ''}</span><select data-pref="${key}">${opts.map(([v, l]) => `<option value="${v}" ${String(prefs[key]) === String(v) ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`;
    let body = '';
    if (t === 'General') body = toggle('models3d', '3D fighters', 'Animated 3D models that copy your movement on camera. Off = 2D art.') + toggle('particles', 'Particles & afterimages', 'Turn off for older devices') + toggle('blood', 'Blood effects', 'Hit splatter and floor stains') + toggle('shake', 'Screen shake') + toggle('damageNumbers', 'Damage numbers');
    else if (t === 'Gameplay') body = select('difficulty', 'Default CPU difficulty', Object.keys(DIFFICULTY).map((d) => [d, d])) + select('roundTime', 'Round time', [[45, '45 s'], [60, '60 s'], [90, '90 s'], [99, '99 s']]) + select('rounds', 'Match length', [[1, 'Single round'], [3, 'Best of 3'], [5, 'Best of 5']]);
    else if (t === 'Controls') body = movesTable();
    else if (t === 'Camera') body = toggle('mirror', 'Mirror camera preview') + toggle('showSkeleton', 'Show tracking skeleton') + select('sensitivity', 'Gesture sensitivity', [['Low', 'Low · fewer false triggers'], ['Medium', 'Medium'], ['High', 'High · lighter movements']]) + select('modelQuality', 'Tracking model', [['lite', 'Lite · fastest'], ['full', 'Full · more accurate']]) + `<div class="row">${btn('Test camera & gestures', 'cameraTest')}</div>`;
    else if (t === 'Audio') body = `<label class="row"><span>Master volume</span><input type="range" min="0" max="100" data-pref="volume" value="${prefs.volume}"></label>`
      + `<label class="row"><span>Music<small>Ominous menu theme and battle drums</small></span><input type="range" min="0" max="100" data-pref="musicVolume" value="${prefs.musicVolume}"></label>`
      + `<label class="row"><span>Sound effects</span><input type="range" min="0" max="100" data-pref="sfxVolume" value="${prefs.sfxVolume}"></label>` + toggle('announcer', 'Announcer voice', 'Uses your browser’s speech voice') + `<div class="row">${btn('Test sound', 'testSound')}</div>`;
    else if (t === 'Account') {
      const wr = stats.matches ? Math.round((stats.wins / stats.matches) * 100) : 0;
      const fav = Object.entries(stats.byFighter).sort((a, b) => b[1].played - a[1].played)[0];
      body = (auth.user
        ? `<div class="row"><span>Signed in<small>${esc(auth.user.email || '')}</small></span>${btn('Sign out', 'signOut', 'danger')}</div>
           <form class="row" data-form="username"><span>Username<small>Your fighter name everywhere</small></span><span class="inline-form"><input name="username" maxlength="16" value="${esc(auth.name)}" autocomplete="username" pattern="[A-Za-z0-9_]{3,16}" required><button type="submit">Save</button></span></form>`
        : `<div class="row"><span>Playing as guest<small>${esc(auth.available ? 'Sign in to save your stats online and play on any device.' : auth.reason)}</small></span>${btn('Sign in / Create account', 'loginScreen', 'primary')}</div>
           <label class="row"><span>Fighter name<small>Shown on the HUD</small></span><input data-pref="name" maxlength="16" value="${esc(prefs.name)}" autocomplete="nickname"></label>`)
        + select('favorite', 'Default fighter', FIGHTERS.map((f) => [f.id, f.name]))
        + `<div class="profile-stats">
            <div><b>${stats.matches}</b><span>Matches</span></div><div><b>${stats.wins}</b><span>Wins</span></div><div><b>${wr}%</b><span>Win rate</span></div>
            <div><b>${stats.bestCombo}</b><span>Best combo</span></div><div><b>${stats.kos}</b><span>K.O.s</span></div><div><b>${stats.perfects}</b><span>Flawless</span></div>
          </div>
          <p class="fine">${fav ? `Most played: ${fighterById(fav[0]).name} (${fav[1].played})` : 'Play a match to start your record.'} · ${auth.user ? 'Stats are saved to your account.' : 'Stats are stored in this browser only.'}</p>
          <div class="row">${btn('Reset stats', 'resetStats', 'danger')}</div>`;
    } else body = `<p class="about"><b>GESTURE KOMBAT</b> · v2.0<br>Elemental combat in the Temple Arena. Fight with your keyboard, touch, or your whole body via on-device pose tracking (MediaPipe).</p><p class="fine">Pose tracking runs entirely in your browser. No video or images leave your device.</p>`;
    app.innerHTML = `
      <section class="screen">
        ${header('settingsBack', 'COMBAT SYSTEM / PREFERENCES')}
        <div class="panel settings">
          <h2>Settings</h2>
          <div class="tabs" role="tablist">${tabs.map((x) => `<button type="button" role="tab" aria-selected="${x === t}" data-action="settingsTab" data-tab="${x}" class="${x === t ? 'active' : ''}">${x}</button>`).join('')}</div>
          <div class="settings-body">${body}</div>
          <div class="save">${btn('Done', 'settingsBack', 'primary')}</div>
        </div>
      </section>`;
  },

  how() {
    const tabs = ['Academy', 'Basics', 'Moves', 'Gestures', 'Elements', 'Tips'];
    const t = state.howTab;
    let body = '';
    if (t === 'Academy') {
      const mv = ACADEMY.find((m) => m.id === state.academyMove) || ACADEMY[0];
      const fd = fighterById(state.academyFighter);
      body = `<div class="academy" style="--c:${fd.color}">
        <div class="ac-list" role="listbox" aria-label="Moves">${ACADEMY.map((m, i) => `<button type="button" role="option" aria-selected="${m.id === mv.id}" data-action="academyMove" data-move="${m.id}" class="${m.id === mv.id ? 'active' : ''}" style="--i:${i}"><span>${m.name}</span><small>${m.tag}</small></button>`).join('')}</div>
        <div class="ac-stage"><div class="ac-demo" id="acDemo"></div>
          <div class="ac-chips">${FIGHTERS.map((f) => `<button type="button" data-action="academyFighter" data-id="${f.id}" class="${f.id === fd.id ? 'active' : ''}" style="--c:${f.color}">${f.name}</button>`).join('')}</div></div>
        <div class="ac-info">
          <p class="eyebrow">${mv.tag}</p><h2>${mv.name}</h2>
          <ol class="ac-steps">${mv.steps.map((x, i) => `<li style="--i:${i}">${x}</li>`).join('')}</ol>
          ${mv.id === 'special' ? `<div class="ac-special"><b>${fd.name}: ${fd.special.name}</b><span>${fd.special.desc}</span></div>` : ''}
          <p class="ac-keys">Keyboard <kbd>${mv.key}</kbd> · Touch: on-screen buttons</p>
          <p class="fine">Before you start: stand 2–3 m back, face the camera and hold still with your arms down for a second to calibrate.</p>
          ${btn('Practise with the camera', 'cameraTest', 'primary')}
        </div></div>`;
    } else if (t === 'Basics') body = `<ol class="steps">
        <li><b>Win rounds.</b> Drain your rival’s health bar or lead when the timer hits zero. Win the majority of rounds to take the match.</li>
        <li><b>Mix your attacks.</b> Punches are fast and short. Kicks reach further and knock back harder.</li>
        <li><b>Defend.</b> Hold block to cut damage by 80%. Crouch under punches. Jump over kicks, projectiles and eruptions.</li>
        <li><b>Build energy.</b> Landing, taking and blocking hits fills the energy bar. At half a bar, unleash your elemental special.</li>
        <li><b>Chain combos.</b> Hit a rival while they are still reeling to build a combo.</li></ol>`;
    else if (t === 'Moves') body = movesTable();
    else if (t === 'Gestures') body = `<div class="moves">${MOVE_LIST.filter((m) => m.gesture !== '—').map((m) => `<div class="move"><strong>${m.move}</strong><span>${m.gesture}</span></div>`).join('')}</div>
        <p class="fine">Stand 2–3 m from the camera with good lighting, facing it. Hold still with arms down for a second to calibrate. Keyboard and touch keep working alongside gestures.</p>
        <div class="modal-actions">${btn('Test gestures now', 'cameraTest', 'primary')}</div>`;
    else if (t === 'Elements') body = `<div class="elements">${FIGHTERS.map((f) => `<div class="element" style="--c:${f.color}"><img src="${ASSET['card-' + f.id]}" alt=""><div><strong>${f.name} <small>${f.role}</small></strong><p>${f.blurb}</p><p><b>${f.special.name}:</b> ${f.special.desc}</p></div></div>`).join('')}</div>`;
    else body = `<ul class="steps"><li>Lightning’s Storm Lance is instant but can be jumped.</li><li>Earth telegraphs eruptions with a green glow under your feet — jump or move.</li><li>Projectiles cancel each other out when they collide.</li><li>Walking backward is slower than walking forward.</li><li>Training mode has a light sparring dummy that fights back gently.</li><li>Damage scales down the longer a combo runs.</li></ul>`;
    app.innerHTML = layout('How to play', 'LEARN THE WAY OF THE ELEMENTS', `
      <div class="panel how">
        <div class="tabs" role="tablist">${tabs.map((x) => `<button type="button" role="tab" aria-selected="${x === t}" data-action="howTab" data-tab="${x}" class="${x === t ? 'active' : ''}">${x}</button>`).join('')}</div>
        <div class="how-body">${body}</div>
      </div>`);
    if (t === 'Academy') {
      const slot = document.getElementById('acDemo');
      if (prefs.models3d !== false && slot) try { screens.how.demo = new AcademyDemo(slot, fighterById(state.academyFighter)); screens.how.demo.setMove((ACADEMY.find((m) => m.id === state.academyMove) || ACADEMY[0]).demo); } catch { slot.textContent = '3D demo needs WebGL2'; }
    }
  },
};

function movesTable() {
  return `<table class="movetable"><thead><tr><th>Move</th><th>Player 1</th><th>Player 2</th><th>Notes</th></tr></thead><tbody>${MOVE_LIST.map((m) =>
    `<tr><td>${m.move}</td><td>${m.keys.map((k) => `<kbd>${k}</kbd>`).join(' ')}</td><td>${m.p2.map((k) => `<kbd>${k}</kbd>`).join(' ') || '—'}</td><td>${m.note}</td></tr>`).join('')}</tbody></table>`;
}

// ---------------------------------------------------------------- Camera UI
let camUnsub = null;
function mountCamera(slotId) {
  camUnsub?.();
  tracker.configure({ mirror: prefs.mirror, sensitivity: prefs.sensitivity, showSkeleton: prefs.showSkeleton });
  const slot = document.getElementById(slotId);
  const statusEl = document.getElementById('camStatus');
  const check = document.getElementById('gestureCheck');
  const seen = new Set();
  const ms = document.getElementById('mirrorSlot');
  if (ms) {
    if (prefs.models3d === false) ms.remove();
    else try { new MirrorPreview(ms, fighterById(state.p1), tracker); } catch { ms.remove(); }
  }
  const paint = () => {
    const s = tracker.status;
    if (tracker.stream || s === 'ready' || s === 'loading') { slot.innerHTML = ''; slot.append(tracker.view); }
    const text = { off: 'Camera is off. Enable it to fight with your body.', camera: 'Waiting for camera permission…', loading: 'Loading body-tracking model… (first time can take a few seconds)', ready: 'Tracking active.', error: tracker.error }[s];
    statusEl.textContent = text;
    statusEl.className = 'cam-status ' + s;
    if (s === 'error' && window.top !== window.self) offerDownload(statusEl);
    const camBtn = document.getElementById('camBtn');
    if (camBtn) { camBtn.textContent = s === 'ready' ? 'Recalibrate' : s === 'error' ? 'Retry camera' : 'Enable camera'; camBtn.dataset.action = s === 'ready' ? 'recalibrate' : 'enableCamera'; camBtn.disabled = s === 'camera' || s === 'loading'; }
    const fg = document.getElementById('fightGesture');
    if (fg) fg.disabled = s !== 'ready';
  };
  paint();
  camUnsub = tracker.on((ev) => {
    if (!document.body.contains(statusEl)) { camUnsub?.(); camUnsub = null; return; }
    if (ev.type === 'status') paint();
    if (ev.type === 'frame') {
      const r = ev.result;
      statusEl.textContent = (!r.visible ? 'No body detected — step into view.' : !r.calibrated ? r.info : 'Tracking active · ' + r.info) + (r.stats?.fps ? `  [${r.stats.fps} fps · ${Math.round(r.stats.ms)} ms · sees: ${r.stats.parts || 'nothing'}]` : '');
      for (const k of ['crouch', 'left', 'right', 'block', 'forward', 'back', 'run']) if (r.held[k]) seen.add(k);
      for (const e of r.events) seen.add(e);
      check.querySelectorAll('li').forEach((li) => li.classList.toggle('done', seen.has(li.dataset.g)));
      check.querySelectorAll('li').forEach((li) => li.classList.toggle('now', !!r.held[li.dataset.g]));
    }
    if (ev.type === 'gesture') { sfx.gesture(); const li = check.querySelector(`[data-g="${ev.name}"]`); li?.classList.remove('flash'); void li?.offsetWidth; li?.classList.add('flash'); }
  });
}

async function offerDownload(statusEl) {
  // only ever one box per screen (status updates fire repeatedly and this is async)
  if (statusEl.dataset.dlOffered) return;
  statusEl.dataset.dlOffered = '1';
  const dl = await window.claude?.use?.('downloads').catch(() => null);
  if (!dl || !statusEl.isConnected || statusEl.parentElement.querySelector('.dl')) return;
  const box = document.createElement('div');
  box.className = 'dl';
  box.innerHTML = `<p><b>Play with your camera:</b> download the game as one file, then double-click <b>Gesture Kombat.html</b> to open it in Google Chrome or Microsoft Edge. No install, no Terminal.</p>${btn('Download game for camera play', 'downloadGame', 'primary')}`;
  statusEl.after(box);
  box.querySelector('button').onclick = async (e) => {
    e.stopPropagation();
    const b = e.currentTarget; b.disabled = true; b.textContent = 'Packing…';
    try {
      const { buildOffline } = await import('./pack.js');
      const blob = await buildOffline((p) => { b.textContent = `Packing… ${Math.round(p * 100)}%`; });
      b.textContent = 'Confirm the download…';
      await dl.save({ filename: 'Gesture Kombat.html', data: blob });
      b.textContent = 'Downloaded ✓';
    } catch (err) {
      b.disabled = false;
      b.textContent = err?.code === 'declined' ? 'Download game for camera play' : 'Download unavailable here';
      if (err?.code && !['declined', 'rate_limited'].includes(err.code)) b.disabled = true;
    }
  };
}

// ---------------------------------------------------------------- Battle
function startBattle() {
  const p1Def = fighterById(state.p1), p2Def = fighterById(state.p2);
  app.innerHTML = `<section class="battle"><div class="battle-root"></div>
    <button type="button" class="pause-btn" data-action="pause" aria-label="Pause">II</button>
    <div class="pip" hidden></div></section>`;
  const root = app.querySelector('.battle-root');
  const p1 = new Controller(), p2 = new Controller();
  ctrls = { p1, p2 };
  const online = state.mode === 'online' && net.active;
  const mine = online && net.side === 2 ? p2 : p1, theirs = mine === p1 ? p2 : p1;
  detachKeys = bindKeyboard(mine, state.mode === 'local' ? p2 : null);
  if (state.controls === 'gesture' && tracker.active) {
    tracker.attach(mine);
    const pip = app.querySelector('.pip');
    pip.hidden = false; pip.append(tracker.view);
  }
  if (isTouch) app.querySelector('.battle').append(touchPad(mine));
  const aiProfile = state.mode === 'single' ? DIFFICULTY[state.difficulty]
    : state.mode === 'training' ? { reaction: 900, aggression: 0.3, block: 0.15, special: 0.08, combo: 0 } : null;
  const training = state.mode === 'training';
  const myMotion = state.controls === 'gesture' && tracker.active ? () => tracker.motion() : null;
  const theirMotion = online ? () => theirs.lastPose : null;
  const rules = online ? state.online.rules || {} : {};
  const hostName = net.role === 'host' ? net.me?.name : net.peer?.name, guestName = net.role === 'guest' ? net.me?.name : net.peer?.name;
  game = new Game(root, {
    p1Def, p2Def, p1Ctrl: p1, p2Ctrl: p2, aiProfile: online ? null : aiProfile, net: online ? net.role : null,
    roundTime: online ? rules.roundTime || 60 : training ? 99 : prefs.roundTime, rounds: online ? rules.rounds || 3 : training ? 1 : prefs.rounds,
    p1Motion: online ? (net.side === 1 ? myMotion : theirMotion) : myMotion,
    p2Motion: online && net.side === 2 ? myMotion : online ? theirMotion : null,
    p1Name: online ? hostName || 'Player 1' : state.mode === 'local' ? 'P1 · ' + prefs.name : prefs.name,
    p2Name: online ? guestName || 'Player 2' : state.mode === 'local' ? 'Player 2' : state.mode === 'training' ? 'Dummy' : 'CPU',
    onEnd: (r) => {
      if (online) { recordMatch({ fighter: net.side === 1 ? state.p1 : state.p2, won: r.winner === net.side, bestCombo: (net.side === 1 ? r.p1 : r.p2).bestCombo, kos: r.rounds.filter((x) => x.winner === net.side && x.reason === 'ko').length, perfect: r.rounds.some((x) => x.winner === net.side && x.perfect) }); auth.pushStats(stats).catch(() => {}); }
      else if (state.mode !== 'training') { recordMatch({ fighter: state.p1, won: r.winner === 1, bestCombo: r.p1.bestCombo, kos: r.kos, perfect: r.perfect }); auth.pushStats(stats).catch(() => {}); }
      state.lastResult = r;
      show('result');
    },
  });
  if (online) netUnlink = linkGame(game, { local: mine, remote: theirs, tracker: state.controls === 'gesture' ? tracker : null });
  if (isTouch) document.documentElement.requestFullscreen?.().catch(() => {});
}

function endBattle() {
  netUnlink?.(); netUnlink = null;
  game?.destroy(); game = null;
  detachKeys?.(); detachKeys = null;
  tracker.detach();
  document.querySelector('.pause-overlay')?.remove();
}

function pause() {
  if (!game || game.paused || game.ended || document.querySelector('.pause-overlay')) return;
  const online = state.mode === 'online' && net.active;
  if (!online) game.setPaused(true);
  const el = document.createElement('div');
  el.className = 'pause-overlay';
  el.innerHTML = `<div class="pausebox" role="dialog" aria-label="Paused"><p class="eyebrow">COMBAT ON HOLD</p><h1>${online ? 'MENU' : 'PAUSED'}</h1>${online ? '<p class="fine">The fight keeps going for your friend.</p>' : ''}
    ${btn('Resume', 'resume', 'primary')}${online ? '' : btn('Restart match', 'restart')}${btn('Move list', 'movesModal')}
    <label class="row compact"><span>Volume</span><input type="range" min="0" max="100" data-pref="volume" value="${prefs.volume}"></label>
    ${online ? btn('Leave match', 'onlineLeave', 'danger') : btn('Quit to menu', 'quit', 'danger')}</div>`;
  app.append(el);
  el.querySelector('.primary').focus();
}
function resume() {
  document.querySelector('.pause-overlay')?.remove();
  game?.setPaused(false);
}

// ---------------------------------------------------------------- Modals
/** Show a message on the login panel without re-rendering (keeps what the player typed). */
function authNote(text, kind = 'err') {
  const panel = app.querySelector('.auth-panel'); if (!panel) return toast(text);
  panel.querySelectorAll('.auth-msg.err, .auth-msg.ok').forEach((n) => n.remove());
  const el = document.createElement('p'); el.className = `auth-msg ${kind}`; el.setAttribute('role', kind === 'err' ? 'alert' : 'status'); el.textContent = text;
  panel.querySelector('.auth-brand').after(el);
  if (motionOK()) el.animate([{ transform: 'translateX(-8px)' }, { transform: 'translateX(6px)' }, { transform: 'none' }], { duration: 260 });
  el.scrollIntoView({ block: 'nearest' });
}
function beginOnline(rules) {
  state.online.rules = rules;
  state.mode = 'online';
  state.p1 = rules.p1; state.p2 = rules.p2;
  state.controls = state.online.controls === 'gesture' && tracker.active ? 'gesture' : 'keyboard';
  show('vs');
}
net.on((m) => {
  if (m.t === 'start' && net.role === 'guest') beginOnline(m);
  else if (m.t === 'peer-join') { sfx.ready?.(); toast(`${net.peer?.name || 'Your friend'} joined the room!`); if (state.screen === 'online') screens.online(); }
  else if (m.t === 'peer-update') { if (state.screen === 'online') screens.online(); }
  else if (m.t === 'peer-leave') {
    if (!net.active) return;
    toast('Your friend left the room.');
    if (['vs', 'battle'].includes(state.screen)) { endBattle(); show('online'); }
    else if (state.screen === 'online') screens.online();
  }
});
function setAuth(view, msg = '', err = '') { state.authView = view; state.authMsg = msg; state.authErr = err; }

// ---------------------------------------------------------------- Account forms
const AUTH_FORMS = {
  async signin(f) {
    const email = f.email.value.trim(), pw = f.password.value;
    state.authEmail = email;
    if (!email || !pw) throw new Error('Enter your email and password.');
    try { await auth.signIn(email, pw); } catch (e) { if (e.unconfirmed) { setAuth('checkEmail', '', e.message); return screens.login(); } throw e; }
    toast(`Welcome back, ${auth.name}`); show('menu');
  },
  async signup(f) {
    const u = f.username.value.trim(), email = f.email.value.trim(), pw = f.password.value, pw2 = f.password2.value;
    state.authEmail = email;
    if (!USERNAME_RE.test(u)) throw new Error('Usernames are 3–16 letters, numbers or _.');
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Enter a valid email address.');
    if (pw.length < 8) throw new Error('Passwords need at least 8 characters.');
    if (pw !== pw2) throw new Error('The two passwords don’t match.');
    const signedIn = await auth.signUp(u, email, pw);
    if (signedIn) { toast(`Welcome, ${u}!`); show('menu'); } else { setAuth('checkEmail'); screens.login(); }
  },
  async forgot(f) {
    const email = f.email.value.trim(); state.authEmail = email;
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Enter a valid email address.');
    await auth.sendResetCode(email);
    state.resendAt = Date.now() + 60000; setAuth('code'); screens.login(); app.querySelector('.code-input')?.focus();
  },
  async code(f) {
    const code = f.code.value.replace(/\D/g, '');
    if (code.length < 6) throw new Error('Enter the code from the email.');
    await auth.verifyResetCode(state.authEmail, code);
    setAuth('newpass'); screens.login(); app.querySelector('input[name=password]')?.focus();
  },
  async newpass(f) {
    const pw = f.password.value, pw2 = f.password2.value;
    if (pw.length < 8) throw new Error('Passwords need at least 8 characters.');
    if (pw !== pw2) throw new Error('The two passwords don’t match.');
    await auth.setPassword(pw);
    setAuth('signin'); toast('Password changed. You’re signed in.'); show('menu');
  },
  async joinRoom(f) {
    const code = f.code.value.trim();
    state.online.busy = 'join'; state.online.err = '';
    try { await net.join(code, { name: (auth.user ? auth.name : prefs.name).slice(0, 16), fighter: state.online.mine || state.p1 }); sfx.select(); }
    catch (e) { state.online.err = e.message; }
    state.online.busy = false; if (state.screen === 'online') screens.online();
  },
  async username(f) {
    await auth.setUsername(f.username.value.trim());
    prefs.name = auth.name.slice(0, 16); savePrefs(); toast('Username saved');
  },
};
document.addEventListener('submit', async (e) => {
  const f = e.target.closest('form[data-form]'); if (!f) return;
  e.preventDefault();
  const sub = f.querySelector('[type=submit]'); if (sub?.disabled) return;
  if (sub) { sub.disabled = true; sub.dataset.label = sub.textContent; sub.textContent = 'Please wait…'; }
  sfx.ui();
  try { await AUTH_FORMS[f.dataset.form](f); }
  catch (err) {
    if (state.screen === 'login') authNote(err.message);
    else toast(err.message);
    sfx.back();
  } finally { if (sub?.isConnected) { sub.disabled = false; sub.textContent = sub.dataset.label; } }
});
let unameT = 0;
document.addEventListener('input', (e) => {
  if (e.target.dataset?.check !== 'username') return;
  const v = e.target.value.trim(), hint = document.getElementById('unameHint'); if (!hint) return;
  clearTimeout(unameT);
  if (!USERNAME_RE.test(v)) { hint.textContent = '3–16 letters, numbers or _'; hint.className = 'hint'; return; }
  hint.textContent = 'Checking…'; hint.className = 'hint';
  unameT = setTimeout(async () => { const ok = await auth.usernameAvailable(v).catch(() => true); if (e.target.value.trim() === v) { hint.textContent = ok ? '✓ Available' : '✗ Taken, try another'; hint.className = 'hint ' + (ok ? 'ok' : 'bad'); } }, 350);
});
auth.on(async (ev) => {
  if (ev === 'recovery') { setAuth('newpass'); if (state.screen !== 'loading') show('login'); return; }
  if (ev === 'signin') {
    auth.setGuest(false);
    prefs.name = auth.name.slice(0, 16); savePrefs();
    const cloud = await auth.pullStats().catch(() => null);
    if (cloud && (cloud.matches || 0) >= stats.matches) { Object.assign(stats, cloud); saveStats(); } else auth.pushStats(stats).catch(() => {});
    if (state.screen === 'login' && !auth.recovering && !['code', 'newpass'].includes(state.authView)) show('menu');
  }
  if (['signin', 'signout', 'change'].includes(ev) && state.screen === 'menu') screens.menu();
});

function openModal(html) {
  modalBody.innerHTML = html;
  if (!modal.open) modal.showModal();
}

// ---------------------------------------------------------------- Actions
const actions = {
  menu: () => show('menu'),
  play: () => show('modes'),
  mode: (b) => {
    const m = b.dataset.mode;
    if (m === 'online') { state.mode = 'online'; state.online.view = 'start'; state.online.err = ''; state.online.mine ||= state.p1; return show('online'); }
    state.mode = m;
    state.picking = 1;
    if (m === 'single') show('difficulty');
    else show('characters');
  },
  difficulty: (b) => { state.difficulty = b.dataset.level; show('characters'); },
  difficultyScreen: () => show('difficulty'),
  characters: () => { state.picking = 1; if (!['single', 'local', 'training'].includes(state.mode)) state.mode = 'single'; show('characters'); },
  pick: (b) => {
    const id = b.dataset.id;
    if (state.mode === 'local' && state.picking === 2 && id === state.p1) toast('Mirror match!');
    state.picking === 1 ? (state.p1 = id) : (state.p2 = id);
    sfx.pick(id);
    screens.characters();
    const card = app.querySelector(`[data-id="${id}"]`);
    card?.focus();
    if (card) {
      const r = card.getBoundingClientRect();
      ambient.burst(r.left + r.width / 2, r.top + r.height * 0.6, fighterById(id).color, 36, 1.1);
      card.classList.add('picked');
    }
  },
  backPick: () => { state.picking = 1; show('characters'); },
  confirmPick: () => {
    sfx.select();
    if (state.mode === 'local' && state.picking === 1) {
      state.picking = 2;
      if (state.p2 === state.p1) state.p2 = FIGHTERS.find((f) => f.id !== state.p1).id;
      return show('characters');
    }
    if (state.mode !== 'local') {
      const others = FIGHTERS.filter((f) => f.id !== state.p1);
      state.p2 = state.mode === 'training' ? 'earth' : others[Math.floor(Math.random() * others.length)].id;
      if (state.mode === 'training' && state.p1 === 'earth') state.p2 = 'fire';
    }
    show('controls');
  },
  enableCamera: () => { sfx.ui(); tracker.configure({ mirror: prefs.mirror, sensitivity: prefs.sensitivity, showSkeleton: prefs.showSkeleton }); tracker.start(prefs.modelQuality); },
  stopCamera: () => { tracker.stop(); show(state.screen); },
  recalibrate: () => { tracker.detector.recalibrate(); toast('Stand still with arms down to calibrate'); },
  fightGesture: () => { state.controls = 'gesture'; show('vs'); },
  fightKeyboard: () => { state.controls = 'keyboard'; tracker.stop(); show('vs'); },
  cameraTest: () => show('cameraTest'),
  rematch: () => { if (state.mode === 'online' && net.active) return actions.onlineStart(); show('vs'); },
  pause, resume,
  restart: () => { resume(); show('vs'); },
  quit: () => { resume(); show('menu'); },
  movesModal: () => openModal(`<h2>Move list</h2>${movesTable()}`),
  settings: () => { state.settingsReturn = state.screen; state.settingsTab = 'General'; show('settings'); },
  account: () => { state.settingsReturn = state.screen; state.settingsTab = 'Account'; show('settings'); },
  settingsTab: (b) => { state.settingsTab = b.dataset.tab; screens.settings(); app.querySelector(`[data-tab="${b.dataset.tab}"]`)?.focus(); },
  settingsBack: () => show(['menu', 'characters', 'modes', 'how', 'cameraTest'].includes(state.settingsReturn) ? state.settingsReturn : 'menu'),
  how: () => show('how'),
  howGestures: () => { state.howTab = 'Gestures'; show('how'); },
  academyMove: (b) => { state.academyMove = b.dataset.move; screens.how(); app.querySelector(`[data-move="${b.dataset.move}"]`)?.focus(); },
  academyFighter: (b) => { state.academyFighter = b.dataset.id; sfx.pick(b.dataset.id); screens.how(); app.querySelector(`.ac-chips [data-id="${b.dataset.id}"]`)?.focus(); },
  howTab: (b) => { state.howTab = b.dataset.tab; screens.how(); app.querySelector(`[data-tab="${b.dataset.tab}"]`)?.focus(); },
  testSound: () => { sfx.hit(true); setTimeout(() => sfx.special('lightning'), 300); setTimeout(() => sfx.gong(), 1200); },
  resetStats: () => openModal(`<h2>Reset stats?</h2><p>This clears your match record on this device.</p><div class="modal-actions">${btn('Reset', 'resetYes', 'danger')}${btn('Cancel', 'closeModal')}</div>`),
  resetYes: () => { resetStats(); modal.close(); screens.settings(); toast('Stats reset'); },
  closeModal: () => modal.close(),
  privacy: () => openModal(`<h2>Privacy</h2><p>Gesture Kombat runs entirely in your browser. When you enable the camera, video frames are analysed on your device by MediaPipe to find body landmarks. No video, images or landmarks are uploaded, recorded or stored.</p><p>Your name, settings and match stats are saved in this browser’s local storage only. Stopping the camera or leaving a fight turns the camera off.</p>`),
  help: () => openModal(`<h2>Help</h2><p><b>Keyboard:</b> A/D move · W or Space jump · S crouch · J punch · K kick · L block · F special · Esc pause.</p><p><b>Two players:</b> Player 2 uses the arrow keys and 1 / 2 / 3 / 4.</p><p><b>Gestures:</b> enable the camera on the controls screen, stand back so you are visible from head to knees, and hold still to calibrate. If tracking is jumpy, lower the sensitivity in Settings → Camera.</p><p><b>Camera won’t start?</b> Check your browser’s camera permission for this page and that no other app is using the webcam.</p>`),
  exit: () => openModal(`<h2>Exit game?</h2><p>You’ll return to the title screen.</p><div class="modal-actions">${btn('Yes, exit', 'exitYes', 'primary')}${btn('Cancel', 'closeModal')}</div>`),
  exitYes: () => show('title'),
  onlineCreate: async () => {
    state.online.busy = 'create'; state.online.err = ''; screens.online();
    try { await net.create({ name: (auth.user ? auth.name : prefs.name).slice(0, 16), fighter: state.online.mine || state.p1 }); sfx.select(); }
    catch (e) { state.online.err = e.message; }
    state.online.busy = false; if (state.screen === 'online') screens.online();
  },
  onlineFighter: (b) => { state.online.mine = b.dataset.id; sfx.pick(b.dataset.id); if (net.active) net.update({ fighter: state.online.mine }); screens.online(); app.querySelector(`.on-chips [data-id="${b.dataset.id}"]`)?.focus(); },
  onlineControls: (b) => { state.online.controls = b.dataset.v; screens.online(); },
  localVersus: () => { state.mode = 'local'; state.picking = 1; show('characters'); },
  onlineCopy: () => { navigator.clipboard?.writeText(net.code).then(() => toast('Code copied. Send it to your friend!'), () => toast(`Your code is ${net.code}`)); },
  onlineStart: () => {
    if (!net.peer) return toast('Your friend hasn’t joined yet.');
    const rules = { rounds: prefs.rounds, roundTime: prefs.roundTime, p1: state.online.mine || state.p1, p2: net.peer.fighter || 'lightning' };
    net.send({ t: 'start', ...rules });
    beginOnline(rules);
  },
  onlineLobby: () => { endBattle(); show('online'); },
  onlineLeave: async () => { endBattle(); await net.leave(); state.online.view = 'start'; show(state.mode === 'online' ? 'online' : 'menu'); },
  loginScreen: () => { setAuth('signin'); show('login'); },
  authView: (b) => { setAuth(b.dataset.view); screens.login(); app.querySelector('input:not([disabled])')?.focus(); },
  guest: () => { auth.setGuest(true); show('menu'); },
  signOut: async () => { await auth.signOut(); toast('Signed out'); show('menu'); },
  google: async () => { try { await auth.google(); } catch (e) { authNote(e.message); } },
  togglePw: (b) => { const i = b.parentElement.querySelector('input'); const on = i.type === 'password'; i.type = on ? 'text' : 'password'; b.textContent = on ? 'Hide' : 'Show'; b.setAttribute('aria-label', on ? 'Hide password' : 'Show password'); },
  resendConfirm: async () => { try { await auth.resendConfirmation(state.authEmail); setAuth('checkEmail', 'Sent again. Check your spam folder too.'); } catch (e) { setAuth('checkEmail', '', e.message); } screens.login(); },
  resendCode: async () => { try { await auth.sendResetCode(state.authEmail); state.resendAt = Date.now() + 60000; setAuth('code', 'New code sent.'); } catch (e) { setAuth('code', '', e.message); } screens.login(); },
};

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-action]');
  if (!b || b.disabled) return;
  sfx.unlock();
  if (b.tagName === 'BUTTON' && e.clientX) ambient.burst(e.clientX, e.clientY, '#ff6a2a', 12, 0.55);
  const a = b.dataset.action;
  if (actions[a]) {
    if (!['pick', 'pause'].includes(a) && b.tagName === 'BUTTON') (['menu', 'backPick', 'difficultyScreen', 'settingsBack', 'quit'].includes(a) || b.classList.contains('back') ? sfx.back() : sfx.ui());
    actions[a](b);
  }
});

let lastHover = null, lastHoverT = 0;
document.addEventListener('pointerover', (e) => {
  const b = e.target.closest?.('button, .fighter-card');
  if (!b || b === lastHover || b.disabled || e.pointerType !== 'mouse') return;
  lastHover = b;
  const now = performance.now();
  if (now - lastHoverT > 45 && audioReady()) { lastHoverT = now; sfx.hover(); }
});
document.addEventListener('pointerdown', () => sfx.unlock(), { capture: true });
document.addEventListener('keydown', () => sfx.unlock(), { capture: true });

document.addEventListener('change', (e) => onPref(e.target));
document.addEventListener('input', (e) => { if (e.target.type === 'range') onPref(e.target); });
function onPref(el) {
  const k = el.dataset?.pref; if (!k) return;
  let v = el.type === 'checkbox' ? el.checked : el.value;
  if (['volume', 'musicVolume', 'sfxVolume', 'roundTime', 'rounds'].includes(k)) v = Number(v);
  if (k === 'name') v = String(v).trim().slice(0, 16) || 'Player';
  prefs[k] = v;
  if (k === 'difficulty') state.difficulty = v;
  if (k === 'favorite') state.p1 = v;
  if (k === 'particles' && game) game.fx.enabled = v;
  if (k === 'blood' && game) game.fx.gore = v;
  if (['volume', 'musicVolume', 'sfxVolume'].includes(k)) applyVolumes();
  tracker.configure({ mirror: prefs.mirror, sensitivity: prefs.sensitivity, showSkeleton: prefs.showSkeleton });
  savePrefs();
}

modal.querySelector('.close').addEventListener('click', () => modal.close());
modal.addEventListener('click', (e) => { if (e.target === modal) modal.close(); });

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && state.screen === 'battle' && !modal.open) {
    e.preventDefault();
    document.querySelector('.pause-overlay') ? resume() : pause();
    return;
  }
  // Arrow-key navigation through vertical menus
  if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && state.screen !== 'battle' && !e.target.closest('input,select')) {
    const list = [...app.querySelectorAll('.locked-menu button, .difficulty button, .pausebox button')];
    if (!list.length) return;
    e.preventDefault();
    const i = list.indexOf(document.activeElement);
    const n = list[(i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length];
    n.focus();
  }
  if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && state.screen === 'characters') {
    const i = FIGHTERS.findIndex((f) => f.id === (state.picking === 1 ? state.p1 : state.p2));
    const n = FIGHTERS[(i + (e.key === 'ArrowRight' ? 1 : -1) + FIGHTERS.length) % FIGHTERS.length];
    actions.pick({ dataset: { id: n.id } });
  }
});

document.addEventListener('visibilitychange', () => { if (document.hidden && state.screen === 'battle') pause(); });

boot();

// Debug handle for automated tests
window.__gk = { state, get game() { return game; }, tracker, show };
