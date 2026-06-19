// T3 Venus Fly Trap — a Greenhouse upgrade of the Carnivorous Plant. A wide,
// player-tracking maw with a larger snap radius and faster snap. Its mouth
// slowly pivots toward the player even in cooldown. Snap deals 50% of the
// player's current max HP. Weak crafts (Bee/Butterfly/Dragonfly/Spider) only
// chip it; it takes a Locust or Wasp (or Hornet) to actually fell it.

import { Enemy } from './Enemy.js';
import { COLORS, rgba } from '../../utils/renderer.js';
import { distance, angle as angleTo, angleDiff, normalizeAngle, clamp } from '../../utils/math.js';

const SNAP_RADIUS = 120;
const SNAP_TIME = 0.08;
const COOLDOWN = 2.5;
const PIVOT_RATE = 0.26; // rad/s (~15°/s)

export class VenusFlyTrap extends Enemy {
  constructor(x, y) {
    super(x, y, { tier: 3, hp: 200, radius: 28, killScore: 25 });
    this.facing = -Math.PI / 2;
    this._openness = 1;
    this.immuneToMoth = true;
  }

  respawn() {
    super.respawn();
    this.facing = -Math.PI / 2;
    this._openness = 1;
  }

  // Only Locust/Wasp/Hornet (uncapped) can fell it; lighter crafts chip it.
  takeDamage(amount, opts = {}) {
    if (this.dead) return;
    const src = opts.source;
    if (src === 'bee') {
      this.hp = Math.max(1, this.hp - Math.min(amount, 10));
      return;
    }
    if (src === 'butterfly' || src === 'dragonfly' || src === 'spider_craft') {
      this.hp = Math.max(1, this.hp - Math.min(amount, 15));
      return;
    }
    super.takeDamage(amount, opts);
  }

  _track(bee, dt) {
    const target = angleTo(this, bee);
    const diff = angleDiff(target, this.facing);
    const step = PIVOT_RATE * dt;
    this.facing = normalizeAngle(this.facing + clamp(diff, -step, step));
  }

  behave(dt, env, slow) {
    const bee = env.bee;
    const dist = distance(this, bee);
    const s = this.fsm;

    // The mouth always slowly tracks the player.
    this._track(bee, dt);

    switch (s.state) {
      case 'IDLE':
      case 'PATROL':
        this._openness = Math.min(1, this._openness + dt * 3);
        if (dist <= SNAP_RADIUS) {
          this._didHit = false;
          s.set('ATTACKING', this);
        }
        break;

      case 'ATTACKING':
        this._openness = Math.max(0, this._openness - dt / SNAP_TIME);
        if (!this._didHit) {
          bee.takeDamage(Math.floor(bee.maxHp * 0.5));
          this._didHit = true;
        }
        if (s.elapsed(SNAP_TIME)) s.set('COOLDOWN', this);
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
    if (this.dead) ctx.globalAlpha = Math.max(0, 1 - this.deathTimer / 0.6);
    ctx.translate(this.x, this.y);
    ctx.rotate(this.facing + Math.PI / 2);

    // stem
    ctx.strokeStyle = '#3A4A1A';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(0, 30);
    ctx.lineTo(0, 8);
    ctx.stroke();

    const open = this._openness;
    const spread = 0.2 + open * 0.7; // lobe opening angle

    // Two large lobes (mirror image), each with tooth-spikes along the rim.
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.rotate(side * spread);
      ctx.beginPath();
      ctx.moveTo(0, 6);
      ctx.quadraticCurveTo(side * 26, -6, side * 16, -30);
      ctx.quadraticCurveTo(side * 4, -20, 0, 6);
      ctx.closePath();
      ctx.fillStyle = '#5A1A1A';
      ctx.fill();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = COLORS.ink;
      ctx.stroke();

      // inner pale surface
      ctx.beginPath();
      ctx.moveTo(0, 4);
      ctx.quadraticCurveTo(side * 18, -6, side * 12, -24);
      ctx.quadraticCurveTo(side * 4, -16, 0, 4);
      ctx.closePath();
      ctx.fillStyle = rgba('#F5E8E8', 0.85);
      ctx.fill();

      // tooth-spikes along the outer lobe edge
      ctx.strokeStyle = COLORS.parchment;
      ctx.lineWidth = 1.4;
      for (let i = 1; i <= 5; i++) {
        const u = i / 6;
        const ex = side * (16 * u + 4 * (1 - u));
        const ey = -30 * u - 6 * (1 - u);
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex + side * 4, ey - 2);
        ctx.stroke();
      }
      ctx.restore();
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
