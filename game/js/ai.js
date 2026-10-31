// CPU opponent. Reads the game state and drives a Controller like a human would.
import { MOVES } from './data.js';

export class AI {
  constructor(me, opp, game, profile) {
    this.me = me; this.opp = opp; this.game = game; this.p = profile;
    this.ctrl = me.ctrl;
    this.think = 0;
    this.holdUntil = 0;
    this.plan = null; // 'approach' | 'retreat' | 'hold' | 'block' | 'crouch'
    this.planUntil = 0;
    this.reactedTo = null;
  }

  release() {
    for (const n of ['left', 'right', 'block', 'crouch']) this.ctrl.setHeld('ai', n, false);
  }

  update(dt, now) {
    const { me, opp, p } = this;
    if (!this.game.fighting || me.state === 'ko') { this.release(); return; }

    const dist = Math.abs(opp.x - me.x);
    const toward = Math.sign(opp.x - me.x) || 1;

    // --- Reactions (defence) happen with a delay that depends on difficulty.
    const oppAttack = opp.attack && opp.attack.phase === 'startup' ? opp.attack : null;
    const threat = this.incomingThreat();
    const key = oppAttack ? oppAttack.id : threat ? threat.id : null;
    if (key && key !== this.reactedTo) {
      this.reactedTo = key;
      const reactAt = now + p.reaction * (0.6 + Math.random() * 0.8);
      const roll = Math.random();
      this.pendingReaction = { at: reactAt, roll, kind: oppAttack ? oppAttack.kind : threat.kind };
    }
    if (this.pendingReaction && now >= this.pendingReaction.at) {
      const { roll, kind } = this.pendingReaction;
      this.pendingReaction = null;
      if (roll < p.block) {
        if (kind === 'punch' && Math.random() < 0.5) this.setPlan('crouch', 380, now);
        else if ((kind === 'eruption' || kind === 'projectile' || kind === 'kick') && Math.random() < 0.45) this.ctrl.press('jump', 'ai');
        else this.setPlan('block', 420, now);
      }
    }

    // --- Offence / movement decisions at a cadence.
    this.think -= dt * 1000;
    if (this.think <= 0 && now >= this.planUntil) {
      this.think = p.reaction * (0.5 + Math.random() * 0.6);
      const inRange = dist < MOVES.punch.range + 20;
      const kickRange = dist < MOVES.kick.range + 10;
      const oppStunned = opp.state === 'hit';

      if (oppStunned && kickRange && Math.random() < p.combo) {
        this.ctrl.press(Math.random() < 0.6 ? 'punch' : 'kick', 'ai');
      } else if (me.energy >= MOVES.special.cost && Math.random() < p.special * 0.5 && dist > MOVES.kick.range) {
        this.ctrl.press('special', 'ai');
      } else if (kickRange && Math.random() < p.aggression) {
        const r = Math.random();
        this.ctrl.press(inRange && r < 0.45 ? 'punch' : inRange && r < 0.65 ? 'double' : 'kick', 'ai');
        if (Math.random() < p.combo * 0.6) setTimeout(() => this.ctrl.press('punch', 'ai'), 180 + Math.random() * 120);
      } else if (dist > MOVES.kick.range - 20) {
        this.setPlan(Math.random() < 0.15 + (1 - p.aggression) * 0.3 ? 'hold' : 'approach', 300 + Math.random() * 400, now);
      } else if (Math.random() < 0.25 * (1 - p.aggression)) {
        this.setPlan('retreat', 250 + Math.random() * 250, now);
      } else if (Math.random() < 0.15) {
        this.ctrl.press('jump', 'ai');
      }
    }

    // --- Apply plan as held inputs.
    const active = now < this.planUntil ? this.plan : dist > MOVES.kick.range - 20 ? 'approach' : 'hold';
    this.ctrl.setHeld('ai', 'left', (active === 'approach' && toward < 0) || (active === 'retreat' && toward > 0));
    this.ctrl.setHeld('ai', 'right', (active === 'approach' && toward > 0) || (active === 'retreat' && toward < 0));
    this.ctrl.setHeld('ai', 'block', active === 'block');
    this.ctrl.setHeld('ai', 'crouch', active === 'crouch');
  }

  setPlan(plan, ms, now) { this.plan = plan; this.planUntil = now + ms; }

  incomingThreat() {
    const g = this.game;
    for (const pr of g.projectiles) {
      if (pr.owner === this.me) continue;
      const d = (this.me.x - pr.x) * Math.sign(pr.vx);
      if (d > 0 && d < 700) return { id: pr.id, kind: 'projectile' };
    }
    for (const e of g.eruptions) if (e.owner !== this.me) return { id: e.id, kind: 'eruption' };
    return null;
  }
}
