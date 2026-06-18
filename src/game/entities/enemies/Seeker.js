// T1 Seeker — small chaser. Patrols slowly, chases on detection, lunges in melee.

import { Enemy } from './Enemy.js';
import { COLORS, rgba } from '../../utils/renderer.js';
import { distance } from '../../utils/math.js';

const DETECT = 150;
const PATROL_SPEED = 40;
const CHASE_SPEED = 120;
const ATTACK_RANGE = 30;
const WINDUP = 0.4;
const LUNGE = 40; // px lunge distance
const LUNGE_TIME = 0.18;
const COOLDOWN = 1.5;

export class Seeker extends Enemy {
  constructor(x, y) {
    super(x, y, { tier: 1, hp: 30, radius: 9 });
    this._lungeTraveled = 0;
  }

  respawn() {
    super.respawn();
    this._lungeTraveled = 0;
  }

  behave(dt, env, slow) {
    const bee = env.bee;
    const dist = distance(this, bee);
    const s = this.fsm;

    switch (s.state) {
      case 'IDLE':
      case 'PATROL':
        this.wander(PATROL_SPEED * slow, dt, env);
        if (dist < DETECT) s.set('ALERTED', this);
        break;

      case 'ALERTED':
        this.moveToward(bee.x, bee.y, CHASE_SPEED * slow, dt, env, 0.18);
        if (dist <= ATTACK_RANGE) {
          s.set('WINDUP', this);
        } else if (dist > DETECT * 1.5) {
          s.set('PATROL', this);
        }
        break;

      case 'WINDUP':
        this.faceToward(bee.x, bee.y, 0.1);
        if (s.elapsed(WINDUP * (slow < 1 ? 1 / slow : 1))) {
          this._lungeTraveled = 0;
          this._didHit = false;
          s.set('ATTACKING', this);
        }
        break;

      case 'ATTACKING': {
        const lungeSpeed = (LUNGE / LUNGE_TIME) * slow;
        this.moveAlongFacing(lungeSpeed, dt, env);
        this._lungeTraveled += lungeSpeed * dt;
        if (!this._didHit && distance(this, bee) <= this.radius + bee.radius + 4) {
          bee.takeDamage(this.damage);
          this._didHit = true;
        }
        if (this._lungeTraveled >= LUNGE) s.set('COOLDOWN', this);
        break;
      }

      case 'COOLDOWN':
        if (s.elapsed(COOLDOWN * (slow < 1 ? 1 / slow : 1))) {
          s.set(dist < DETECT ? 'ALERTED' : 'PATROL', this);
        }
        break;

      default:
        break;
    }
  }

  draw(ctx, t) {
    ctx.save();
    ctx.translate(this.x, this.y);
    if (this.dead) {
      ctx.globalAlpha = Math.max(0, 1 - this.deathTimer / 0.6);
    }
    ctx.rotate(this.facing);

    const body = this.telegraphColor('#3D2B1F', COLORS.crimson, COLORS.crimson);

    // antennae
    ctx.strokeStyle = rgba(COLORS.ink, 0.8);
    ctx.lineWidth = 1;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(7, side * 2);
      ctx.lineTo(12, side * 5);
      ctx.stroke();
    }

    // body oval (18×12)
    ctx.beginPath();
    ctx.ellipse(0, 0, 9, 6, 0, 0, Math.PI * 2);
    ctx.fillStyle = body;
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = COLORS.ink;
    ctx.stroke();

    // windup pulse ring
    if (this.fsm.is('WINDUP')) {
      ctx.globalAlpha = 0.4 + 0.3 * Math.sin(t * 18);
      ctx.strokeStyle = COLORS.crimson;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}
