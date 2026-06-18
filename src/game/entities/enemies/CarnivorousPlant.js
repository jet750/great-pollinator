// T3 Carnivorous Plant — stationary pitcher plant. Instant snap, no windup.
// Snap deals 50% of the player's CURRENT max HP (a special-case flat value).
// Bee dash does only 10 damage (cannot be killed by the Bee alone).
// The Locust is the only craft that can kill it: full 80 damage, 2 hits
// (160 HP). Moths cannot damage it at all (immuneToMoth).

import { Enemy } from './Enemy.js';
import { COLORS, rgba } from '../../utils/renderer.js';
import { distance } from '../../utils/math.js';

const SNAP_RADIUS = 80;
const COOLDOWN = 2.5; // retraction
const DASH_DAMAGE_CAP = 10;

export class CarnivorousPlant extends Enemy {
  constructor(x, y) {
    super(x, y, { tier: 3, hp: 160, radius: 25 });
    this.facing = -Math.PI / 2; // mouth opens upward, never rotates
    this._openness = 1; // 1 open, 0 snapped shut
    this.immuneToMoth = true; // Moth consume ignores static plant enemies
  }

  respawn() {
    super.respawn();
    this.facing = -Math.PI / 2;
    this._openness = 1;
  }

  // Bee can only chip 10 off — never lethal.
  dashDamage() {
    return DASH_DAMAGE_CAP;
  }

  // The Bee can chip away but never kill this (Locust required — Phase 2).
  // Non-dash damage (Phase 2 units) can still finish it.
  takeDamage(amount, opts = {}) {
    if (opts.fromDash) {
      this.hp = Math.max(1, this.hp - amount);
      return;
    }
    super.takeDamage(amount, opts);
  }

  behave(dt, env, slow) {
    const bee = env.bee;
    const dist = distance(this, bee);
    const s = this.fsm;

    switch (s.state) {
      case 'IDLE':
      case 'PATROL':
        this._openness = Math.min(1, this._openness + dt * 3);
        if (dist <= SNAP_RADIUS) {
          // No windup — immediate snap.
          this._didHit = false;
          s.set('ATTACKING', this);
        }
        break;

      case 'ATTACKING':
        this._openness = Math.max(0, this._openness - dt * 12);
        if (!this._didHit) {
          bee.takeDamage(Math.floor(bee.maxHp * 0.5)); // special case: 50% of current max HP
          this._didHit = true;
        }
        if (s.elapsed(0.2)) s.set('COOLDOWN', this);
        break;

      case 'COOLDOWN':
        this._openness = Math.min(1, this._openness + dt * (1 / COOLDOWN));
        if (s.elapsed(COOLDOWN * (slow < 1 ? 1 / slow : 1))) {
          s.set('IDLE', this);
        }
        break;

      default:
        break;
    }
  }

  draw(ctx, t) {
    ctx.save();
    ctx.translate(this.x, this.y);
    if (this.dead) ctx.globalAlpha = Math.max(0, 1 - this.deathTimer / 0.6);

    // stem
    ctx.strokeStyle = '#4A2D1F';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(0, 28);
    ctx.lineTo(0, 6);
    ctx.stroke();

    // pitcher body (~40×50)
    const open = this._openness;
    ctx.beginPath();
    ctx.moveTo(-18, 8);
    ctx.quadraticCurveTo(-22, -18, 0, -24);
    ctx.quadraticCurveTo(22, -18, 18, 8);
    ctx.quadraticCurveTo(0, 18, -18, 8);
    ctx.closePath();
    ctx.fillStyle = '#4A2D1F';
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = COLORS.ink;
    ctx.stroke();

    // open maw (scales with openness)
    ctx.beginPath();
    ctx.ellipse(0, -22, 16, 6 * open + 1, 0, 0, Math.PI * 2);
    ctx.fillStyle = rgba(COLORS.crimson, 0.85);
    ctx.fill();
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // jagged teeth around rim
    ctx.strokeStyle = COLORS.parchment;
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const rx = Math.cos(a) * 16;
      const ry = -22 + Math.sin(a) * (6 * open + 1);
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx * 0.7, ry - 4 * open);
      ctx.stroke();
    }

    // snap-zone hint while idle
    if (this.fsm.isAny('IDLE', 'PATROL')) {
      ctx.globalAlpha = 0.08 + 0.04 * Math.sin(t * 2);
      ctx.strokeStyle = COLORS.crimson;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, -8, SNAP_RADIUS, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}
