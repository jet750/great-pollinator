// T3 Frog — stationary ambusher with a long tongue.
// Windup swells the body; the tongue strikes the position captured at windup
// start (it does NOT track), giving a clear dodge window. Long cooldown invites
// the player to dash in for rear hits.

import { Enemy } from './Enemy.js';
import { COLORS, rgba, mixHex } from '../../utils/renderer.js';
import { distance, angle as angleTo } from '../../utils/math.js';

const TONGUE_RANGE = 200;
const WINDUP = 1.2;
const STRIKE_TIME = 0.12; // tongue extension
const COOLDOWN = 3.5;
const HIT_TOLERANCE = 26; // px around the captured target

export class Frog extends Enemy {
  constructor(x, y) {
    super(x, y, { tier: 3, hp: 90, radius: 18 });
    this.facing = -Math.PI / 2;
    this._swell = 1; // body scale during windup
    this._tongue = 0; // 0..1 extension
    this._target = null; // captured strike point
  }

  respawn() {
    super.respawn();
    this.facing = -Math.PI / 2;
    this._swell = 1;
    this._tongue = 0;
    this._target = null;
  }

  behave(dt, env, slow) {
    const bee = env.bee;
    const dist = distance(this, bee);
    const s = this.fsm;

    switch (s.state) {
      case 'IDLE':
      case 'PATROL':
        this._swell = Math.max(1, this._swell - dt * 2);
        this._tongue = Math.max(0, this._tongue - dt * 4);
        // face the bee even at rest so the strike aims true
        if (dist < TONGUE_RANGE * 1.4) this.faceToward(bee.x, bee.y, 0.05);
        if (dist <= TONGUE_RANGE) s.set('WINDUP', this);
        break;

      case 'WINDUP': {
        const dur = WINDUP * (slow < 1 ? 1 / slow : 1);
        const p = Math.min(1, s.time / dur);
        this._swell = 1 + 0.3 * p; // 1.0 → 1.3
        this.faceToward(bee.x, bee.y, 0.04);
        if (s.elapsed(dur)) {
          // Capture the strike point now — it will not track afterward.
          this._target = { x: bee.x, y: bee.y };
          this.facing = angleTo(this, this._target);
          this._didHit = false;
          this._tongue = 0;
          s.set('ATTACKING', this);
        }
        break;
      }

      case 'ATTACKING': {
        this._swell = Math.max(1, this._swell - dt * 3);
        this._tongue = Math.min(1, this._tongue + dt / STRIKE_TIME);
        if (!this._didHit && this._tongue >= 1) {
          this._didHit = true;
          // Hit only if the bee is still near the captured point.
          if (this._target && distance(bee, this._target) <= HIT_TOLERANCE) {
            bee.takeDamage(this.damage);
          }
          s.set('COOLDOWN', this);
        }
        break;
      }

      case 'COOLDOWN':
        this._tongue = Math.max(0, this._tongue - dt * 4);
        if (s.elapsed(COOLDOWN * (slow < 1 ? 1 / slow : 1))) {
          s.set('IDLE', this);
        }
        break;

      default:
        break;
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    if (this.dead) ctx.globalAlpha = Math.max(0, 1 - this.deathTimer / 0.6);

    // Tongue (drawn before body so the body overlaps its root).
    if (this._tongue > 0 && this._target) {
      const tx = this._target.x - this.x;
      const ty = this._target.y - this.y;
      ctx.save();
      ctx.strokeStyle = rgba(COLORS.crimson, 0.9);
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(tx * this._tongue, ty * this._tongue);
      ctx.stroke();
      // tip
      ctx.beginPath();
      ctx.arc(tx * this._tongue, ty * this._tongue, 4, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.crimson;
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    ctx.scale(this._swell, this._swell);
    const windup = this.fsm.is('WINDUP');
    const body = windup
      ? mixHex('#4A6B3A', '#C8D44F', Math.min(1, this.fsm.time / WINDUP))
      : '#4A6B3A';

    // squat rounded-rectangle body (~36×28)
    ctx.beginPath();
    ctx.moveTo(-16, -8);
    ctx.quadraticCurveTo(-20, 14, 0, 14);
    ctx.quadraticCurveTo(20, 14, 16, -8);
    ctx.quadraticCurveTo(0, -16, -16, -8);
    ctx.closePath();
    ctx.fillStyle = body;
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = COLORS.ink;
    ctx.stroke();

    // bulging eyes
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(side * 8, -10, 5, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.parchment;
      ctx.fill();
      ctx.strokeStyle = COLORS.ink;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(side * 8, -10, 2, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.ink;
      ctx.fill();
    }
    ctx.restore();
    ctx.restore();
  }
}
