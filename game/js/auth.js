// Accounts: Google sign-in, username + email/password, welcome email, password reset by emailed code.
// Backed by Supabase Auth. Without config (or when opened as a local file) the game runs in guest mode.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const SDK = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
const GUEST_KEY = 'gk-guest';
export const USERNAME_RE = /^[A-Za-z0-9_]{3,16}$/;

const listeners = new Set();
let client = null, loading = null;

export const auth = {
  user: null,
  recovering: false, // arrived from a password-reset link
  profile: null,
  /** Online accounts are possible: project configured and served over http(s). */
  get available() { return !this.unreachable && !!(SUPABASE_URL && SUPABASE_ANON_KEY) && /^https?:$/.test(location.protocol); },
  unreachable: false,
  get reason() {
    if (this.unreachable) return 'Can’t reach the account server right now. Check your internet connection and reload. You can play as a guest meanwhile.';
    if (!/^https?:$/.test(location.protocol)) return 'Accounts work on the online version of the game. This downloaded copy plays in guest mode.';
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return 'Online accounts are not connected yet. Add your Supabase keys in js/config.js.';
    return '';
  },
  get name() { return this.profile?.username || this.user?.user_metadata?.username || this.user?.user_metadata?.full_name || this.user?.email?.split('@')[0] || 'Player'; },
  get guest() { try { return sessionStorage.getItem(GUEST_KEY) === '1' || localStorage.getItem(GUEST_KEY) === '1'; } catch { return false; } },
  setGuest(on) { try { on ? localStorage.setItem(GUEST_KEY, '1') : (localStorage.removeItem(GUEST_KEY), sessionStorage.removeItem(GUEST_KEY)); } catch { /* storage off */ } },
  on(fn) { listeners.add(fn); return () => listeners.delete(fn); },

  /** Load the SDK and restore any session (also completes a Google redirect). */
  async init() {
    if (!this.available) return null;
    loading ||= (async () => {
      const { createClient } = await import(SDK);
      client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' }, realtime: { params: { eventsPerSecond: 40 } } });
      client.auth.onAuthStateChange((ev, session) => { if (ev === 'PASSWORD_RECOVERY') this.recovering = true; setUser(session?.user || null).then(() => { if (ev === 'PASSWORD_RECOVERY') emit('recovery'); }); });
      const { data } = await client.auth.getSession();
      await setUser(data.session?.user || null);
      if (/[?&](code|error_description)=/.test(location.search) || /access_token|error_description/.test(location.hash)) history.replaceState(null, '', location.pathname);
      return client;
    })().catch((e) => { loading = null; this.unreachable = true; throw e; });
    return loading;
  },

  async signIn(email, password) {
    const c = await need();
    const { error } = await c.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw friendly(error);
  },

  /** Creates the account; Supabase emails the "welcome / confirm your email" message. Returns true if already signed in (confirmation off). */
  async signUp(username, email, password) {
    const c = await need();
    if (!(await this.usernameAvailable(username))) throw new Error('That username is taken. Try another one.');
    const { data, error } = await c.auth.signUp({ email: email.trim(), password, options: { data: { username }, emailRedirectTo: here() } });
    if (error) throw friendly(error);
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) throw new Error('An account with this email already exists. Sign in or reset your password.');
    return !!data.session;
  },

  async resendConfirmation(email) {
    const c = await need();
    const { error } = await c.auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: here() } });
    if (error) throw friendly(error);
  },

  async google() {
    const c = await need();
    const { error } = await c.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: here(), queryParams: { prompt: 'select_account' } } });
    if (error) throw friendly(error);
  },

  /** Step 1 of reset: email a 6-digit code. */
  async sendResetCode(email) {
    const c = await need();
    const { error } = await c.auth.resetPasswordForEmail(email.trim(), { redirectTo: here() });
    if (error) throw friendly(error);
  },
  /** Step 2: verify the code (signs the player in for this one change). */
  async verifyResetCode(email, code) {
    const c = await need();
    const { error } = await c.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'recovery' });
    if (error) throw new Error(/expired|invalid/i.test(error.message) ? 'That code is wrong or has expired. Check the newest email or send a new code.' : error.message);
  },
  /** Step 3: set the new password. */
  async setPassword(password) {
    const c = await need();
    const { error } = await c.auth.updateUser({ password });
    if (error) throw friendly(error);
    this.recovering = false;
  },

  async signOut() { if (client) await client.auth.signOut(); this.setGuest(false); },

  async usernameAvailable(name) {
    const c = await need();
    const { data, error } = await c.rpc('username_available', { name });
    if (error) return true; // let the database's unique rule be the final judge
    return !!data;
  },

  async setUsername(name) {
    const c = await need();
    if (!USERNAME_RE.test(name)) throw new Error('Usernames are 3–16 letters, numbers or _.');
    const { error } = await c.from('profiles').update({ username: name }).eq('id', this.user.id);
    if (error) throw new Error(/duplicate|unique/i.test(error.message) ? 'That username is taken.' : error.message);
    this.profile = { ...this.profile, username: name }; emit('change');
  },

  /** Cloud copy of match stats, so they follow the player across devices. */
  async pullStats() {
    if (!client || !this.user) return null;
    const { data } = await client.from('profiles').select('stats').eq('id', this.user.id).maybeSingle();
    return data?.stats || null;
  },
  async pushStats(stats) {
    if (!client || !this.user) return;
    await client.from('profiles').update({ stats }).eq('id', this.user.id);
  },
};

function emit(type) { for (const fn of listeners) { try { fn(type); } catch (e) { console.warn(e); } } }
async function setUser(user) {
  const changed = (auth.user?.id || null) !== (user?.id || null);
  auth.user = user;
  if (user && client && (changed || !auth.profile)) {
    const { data } = await client.from('profiles').select('username').eq('id', user.id).maybeSingle();
    auth.profile = data || null;
  }
  if (!user) auth.profile = null;
  if (changed) emit(user ? 'signin' : 'signout');
}
async function need() {
  if (!auth.available) throw new Error(auth.reason);
  return auth.init();
}
const here = () => location.origin + location.pathname;
function friendly(e) {
  const m = e?.message || String(e);
  if (/invalid login credentials/i.test(m)) return new Error('Wrong email or password.');
  if (/email not confirmed/i.test(m)) return Object.assign(new Error('Confirm your email first. We sent you a link when you signed up.'), { unconfirmed: true });
  if (/rate limit|too many/i.test(m)) return new Error('Too many attempts. Wait a minute and try again.');
  if (/password.*(at least|short|weak)/i.test(m)) return new Error('Choose a stronger password (at least 8 characters).');
  if (/provider is not enabled/i.test(m)) return new Error('Google sign-in is not switched on in Supabase yet.');
  return new Error(m);
}
