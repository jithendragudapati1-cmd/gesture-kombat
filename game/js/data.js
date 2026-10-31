// Static game data: fighters, moves, difficulty profiles.

export const FIGHTERS = [
  {
    id: 'fire', name: 'Fire', role: 'Balanced', color: '#ff682c', glow: '#ff3d0b', accent2: '#ffd36b',
    hp: 100, speed: 340, power: 1.0, defense: 1.0, frameMul: 1.0, jump: 1.0,
    stats: { Power: 4, Speed: 3, Defense: 3 },
    special: { name: 'Inferno Orb', desc: 'A blazing fireball that travels the length of the arena.' },
    blurb: 'Relentless pressure. Every strike leaves the air burning.',
  },
  {
    id: 'lightning', name: 'Lightning', role: 'Fast', color: '#37bfff', glow: '#0a8dff', accent2: '#e2f6ff',
    hp: 90, speed: 420, power: 0.9, defense: 0.95, frameMul: 0.82, jump: 1.05,
    stats: { Power: 3, Speed: 5, Defense: 2 },
    special: { name: 'Storm Lance', desc: 'An instant bolt across the arena that briefly stuns.' },
    blurb: 'Strikes before you see them. Fragile if caught.',
  },
  {
    id: 'earth', name: 'Earth', role: 'Defensive', color: '#a5dc66', glow: '#5ea22b', accent2: '#e8d29a',
    hp: 120, speed: 270, power: 1.15, defense: 1.2, frameMul: 1.15, jump: 0.9,
    stats: { Power: 5, Speed: 2, Defense: 5 },
    special: { name: 'Stone Eruption', desc: 'Rock spikes burst from the ground under your rival. Jump to evade.' },
    blurb: 'Slow as a mountain, and just as hard to move.',
  },
  {
    id: 'wind', name: 'Wind', role: 'Agile', color: '#e7f7ff', glow: '#9fd9ff', accent2: '#ffffff',
    hp: 95, speed: 390, power: 0.95, defense: 0.95, frameMul: 0.92, jump: 1.3,
    stats: { Power: 3, Speed: 4, Defense: 3 },
    special: { name: 'Cyclone', desc: 'A spinning tornado that hurls your rival across the arena.' },
    blurb: 'Never where you aim. Always where it hurts.',
  },
];

// Frame data in ms (scaled by fighter.frameMul). Damage scaled by power.
export const MOVES = {
  punch: { startup: 80, active: 90, recovery: 150, range: 300, dmg: 6, knock: 140, stun: 260, hitstop: 70, shake: 5, height: 0.36 },
  kick: { startup: 150, active: 110, recovery: 230, range: 350, dmg: 10, knock: 300, stun: 330, hitstop: 95, shake: 9, height: 0.6 },
  double: { startup: 110, active: 110, recovery: 230, range: 300, dmg: 11, knock: 280, stun: 340, hitstop: 100, shake: 9, height: 0.36 },
  special: { startup: 260, active: 120, recovery: 340, cost: 50 },
};

export const DIFFICULTY = {
  Easy: { reaction: 650, aggression: 0.35, block: 0.12, special: 0.15, combo: 0.1, desc: 'Learn the basics' },
  Medium: { reaction: 420, aggression: 0.55, block: 0.32, special: 0.35, combo: 0.35, desc: 'A real challenge' },
  Hard: { reaction: 260, aggression: 0.72, block: 0.52, special: 0.55, combo: 0.6, desc: 'For true warriors' },
  Expert: { reaction: 160, aggression: 0.85, block: 0.72, special: 0.7, combo: 0.85, desc: 'Only the strongest' },
};

export const MOVE_LIST = [
  { move: 'Punch', keys: ['J'], p2: ['1'], gesture: 'Throw a fast jab with either hand', note: 'Fast, short reach. Whiffs over crouching rivals.' },
  { move: 'Double punch', keys: ['U'], p2: ['5'], gesture: 'Throw both fists forward at the same time', note: 'Heavier, slower. Whiffs over crouching rivals.' },
  { move: 'Kick', keys: ['K'], p2: ['2'], gesture: 'Lift a knee high, quickly', note: 'Slower, longer reach, big knockback.' },
  { move: 'Block', keys: ['L'], p2: ['3'], gesture: 'Raise both fists in front of your face', note: 'Hold to cut damage by 80%.' },
  { move: 'Special', keys: ['F'], p2: ['4'], gesture: 'Bring both palms together at chest height', note: 'Costs half your energy bar.' },
  { move: 'Jump', keys: ['W', 'Space'], p2: ['↑'], gesture: 'Hop, or rise up on your toes sharply', note: 'Evades kicks, projectiles and eruptions.' },
  { move: 'Crouch', keys: ['S'], p2: ['↓'], gesture: 'Squat down', note: 'Ducks under punches.' },
  { move: 'Move', keys: ['A', 'D'], p2: ['←', '→'], gesture: 'Lean or step left / right', note: 'Close the gap or retreat.' },
  { move: 'Walk forward', keys: ['D / A'], p2: ['→ / ←'], gesture: 'Step toward camera / march', note: 'Advance toward your rival.' },
  { move: 'Walk back', keys: ['A / D'], p2: ['← / →'], gesture: 'Step away from camera', note: 'Retreat (a little slower).' },
  { move: 'Run', keys: ['Shift + move'], p2: [], gesture: 'Jog in place fast', note: 'Close the distance quickly.' },
  { move: 'Dance / pose', keys: [], p2: [], gesture: 'Anything — your 3D fighter copies your whole body', note: 'Taunt your rival between rounds.' },
  { move: 'Pause', keys: ['Esc'], p2: [], gesture: '—', note: 'Pause the fight.' },
];

export const fighterById = (id) => FIGHTERS.find((f) => f.id === id) || FIGHTERS[0];

// Move Academy: what the human does in front of the camera for each move.
export const ACADEMY = [
  { id: 'special', name: 'Elemental Special', key: 'F', demo: 'special', tag: 'Most powerful',
    steps: [
      'Build energy first: land hits, block attacks or take hits. Watch the thin bar under your health.',
      'When the bar passes the half-way mark it glows and reads SPECIAL READY.',
      'Face the camera, elbows bent, hands relaxed in front of your stomach.',
      'Bring both palms together in front of your chest, like a prayer, and hold for a split second.',
      'Your fighter charges up, then unleashes their element. Spread your hands apart again to re-arm it.',
    ] },
  { id: 'punch', name: 'Punch', key: 'J', demo: 'punch', tag: 'Fast',
    steps: ['Stand in guard with both fists up near your chin.', 'Snap one fist straight out, fast. Toward the camera or to the side both work.', 'Pull it back to guard. Speed matters more than distance.', 'Alternate hands for quick combos.'] },
  { id: 'double', name: 'Double Punch', key: 'U', demo: 'double', tag: 'Heavy',
    steps: ['Start in guard with both fists up.', 'Throw BOTH fists forward at the same moment, keeping your hands apart (not touching).', 'Bring them back to guard. It hits harder but is slower than a punch.'] },
  { id: 'kick', name: 'Kick', key: 'K', demo: 'kick', tag: 'Long reach',
    steps: ['Step back so the camera sees you from head to knees.', 'Lift one knee quickly up toward hip height.', 'Put it back down to re-arm. Each knee lift is one kick.'] },
  { id: 'block', name: 'Block', key: 'L (hold)', demo: 'block', tag: 'Cuts damage 80%',
    steps: ['Raise both fists in front of your face, forearms close together.', 'Hold the pose for as long as you want to block.', 'Drop your hands to stop blocking.'] },
  { id: 'jump', name: 'Jump', key: 'W / Space', demo: 'jump', tag: 'Dodges kicks & specials',
    steps: ['Stand tall with your arms down.', 'Hop, or rise up sharply onto your toes.', 'Great for dodging Earth’s eruption and incoming fireballs.'] },
  { id: 'crouch', name: 'Crouch', key: 'S (hold)', demo: 'crouch', tag: 'Ducks punches',
    steps: ['Bend your knees and squat down.', 'Stay low to keep ducking. Punches fly over you.', 'Stand back up to recover.'] },
  { id: 'walk', name: 'Walk forward', key: 'D / A', demo: 'walk', tag: 'Advance',
    steps: ['Take a step TOWARD your camera, or march in place lifting each knee a little.', 'Your fighter walks toward the opponent.', 'Step back to your start spot (or stop marching) to stop.'] },
  { id: 'back', name: 'Walk back', key: 'A / D', demo: 'walk', tag: 'Retreat',
    steps: ['Take a step AWAY from your camera.', 'Your fighter backs away from the opponent.', 'Return to your start spot to stop.'] },
  { id: 'run', name: 'Run', key: 'Shift + D', demo: 'run', tag: 'Close the gap',
    steps: ['Jog in place quickly with alternating knees.', 'The faster you jog, the more your fighter sprints.'] },
  { id: 'lean', name: 'Move left / right', key: 'A / D', demo: 'walk', tag: 'Spacing',
    steps: ['Lean or take a step to your left or right.', 'Your fighter moves the same way. Return to centre to stop.'] },
];
