// T2 Patroller — circles a guarded uncommon-pollen cluster, charges on detection.

import { Enemy } from './Enemy.js';
import { COLORS, rgba } from '../../utils/renderer.js';
import { distance, angle as angleTo } from '../../utils/math.js';

const DETECT = 200;
const PATROL_SPEED = 90;
const CHASE_SPEED = 140;
const ATTACK_RANGE = 34;
const WINDUP = 0.6;
const CHARGE = 60; // px
const CHARGE_TIME = 0.22;
const COOLDOWN = 2.0;
const ORBIT_RADIUS = 120; // circles within the 200px guard zone

export class Patroller extends Enemy {
  constructor(x, y, guardPos) {
    super(x, y, { tier: 2, hp: 60, radius: 11 });
    this.guard = guardPos || { x, y };
    this._orbitAngle = Math.random() * Math.PI * 2;
    this._chargeTraveled = 0;
  }

  respawn() {
    super.respawn();
    this._chargeTraveled = 0;
    this._orbitAngle = Math.random() * Math.PI * 2;
  }

  behave(dt, env, slow) {
    const bee = env.bee;
    const dist = distance(this, bee);
    const s = this.fsm;

    switch (s.state) {
      case 'IDLE':
      case 'PATROL': {
        // Orbit the guarded cluster.
        this._orbitAngle += dt * 0.6 * slow;
        const tx = this.guard.x + Math.cos(this._orbitAngle) * ORBIT_RADIUS;
        const ty = this.guard.y + Math.sin(this._orbitAngle) * ORBIT_RADIUS;
        this.moveToward(tx, ty, PATROL_SPEED * slow, dt, env, 0.15);
        if (dist < DETECT) s.set('ALERTED', this);
        break;
      }

      case 'ALERTED':
        this.moveToward(bee.x, bee.y, CHASE_SPEED * slow, dt, env, 0.16);
        if (dist <= ATTACK_RANGE) {
          s.set('WINDUP', this);
        } else if (distance(this, this.guard) > DETECT * 1.6) {
          // Drifted too far from its post — return.
          s.set('PATROL', this);
        }
        break;

      case 'WINDUP':
        this.faceToward(bee.x, bee.y, 0.08);
        if (s.elapsed(WINDUP * (slow < 1 ? 1 / slow : 1))) {
          this._chargeTraveled = 0;
          this._didHit = false;
          this._chargeDir = angleTo(this, bee);
          this.facing = this._chargeDir;
          s.set('ATTACKING', this);
        }
        break;

      case 'ATTACKING': {
        const chargeSpeed = (CHARGE / CHARGE_TIME) * slow;
        this.moveAlongFacing(chargeSpeed, dt, env);
        this._chargeTraveled += chargeSpeed * dt;
        if (!this._didHit && distance(this, bee) <= this.radius + bee.radius + 4) {
          bee.takeDamage(this.damage);
          this._didHit = true;
        }
        if (this._chargeTraveled >= CHARGE) s.set('COOLDOWN', this);
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
    if (this.dead) ctx.globalAlpha = Math.max(0, 1 - this.deathTimer / 0.6);
    ctx.rotate(this.facing);

    const body = this.telegraphColor('#3D5A2A', '#D4A83F', COLORS.ember);

    // small wing shapes
    ctx.fillStyle = rgba('#FFFFFF', 0.25);
    ctx.strokeStyle = rgba(COLORS.ink, 0.6);
    ctx.lineWidth = 1;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(-2, side * 7, 7, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // elongated body (22×14)
    ctx.beginPath();
    ctx.ellipse(0, 0, 11, 7, 0, 0, Math.PI * 2);
    ctx.fillStyle = body;
    ctx.fill();
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = COLORS.ink;
    ctx.stroke();

    // head
    ctx.beginPath();
    ctx.arc(9, 0, 3, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.ink;
    ctx.fill();

    if (this.fsm.is('WINDUP')) {
      ctx.globalAlpha = 0.4 + 0.3 * Math.sin(t * 16);
      ctx.strokeStyle = COLORS.gold;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(0, 0, 15, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}
