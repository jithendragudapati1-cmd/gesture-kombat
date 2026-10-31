// Preferences and local profile/stats, persisted in this browser only.

const DEFAULT_PREFS = {
  name: 'Player',
  volume: 70,
  musicVolume: 50,
  sfxVolume: 85,
  announcer: true,
  particles: true,
  shake: true,
  damageNumbers: true,
  difficulty: 'Medium',
  roundTime: 60,
  rounds: 3,
  mirror: true,
  sensitivity: 'Medium',
  showSkeleton: true,
  modelQuality: 'lite',
  favorite: 'fire',
  models3d: true,
  blood: true,
};

const DEFAULT_STATS = { matches: 0, wins: 0, losses: 0, bestCombo: 0, kos: 0, perfects: 0, byFighter: {} };

function load(key, defaults) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return v && typeof v === 'object' ? { ...defaults, ...v } : { ...defaults };
  } catch { return { ...defaults }; }
}

function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

export const prefs = load('gk-prefs', DEFAULT_PREFS);
export const stats = load('gk-stats', DEFAULT_STATS);

export function savePrefs() { save('gk-prefs', prefs); }
export function saveStats() { save('gk-stats', stats); }
export function resetStats() {
  Object.assign(stats, structuredClone(DEFAULT_STATS));
  saveStats();
}

export function recordMatch({ fighter, won, bestCombo, kos, perfect }) {
  stats.matches++;
  won ? stats.wins++ : stats.losses++;
  stats.bestCombo = Math.max(stats.bestCombo, bestCombo);
  stats.kos += kos;
  if (perfect) stats.perfects++;
  const f = (stats.byFighter[fighter] ||= { played: 0, wins: 0 });
  f.played++; if (won) f.wins++;
  saveStats();
}
