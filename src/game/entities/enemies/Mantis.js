// T2 Mantis — a camouflaged ambusher. Sits at low opacity until the player
// strays within 100px, then snaps to full opacity and lunges with a fast
// windup. Easy to miss; punishing if you blunder into its strike range.

import { Enemy } from './Enemy.js';
import { COLORS, rgba } from '../../utils/renderer.js';
import { distance, angle as angleTo } from '../../utils/math.js';

const AMBUSH_RANGE = 100;
const PATROL_SPEED = 30;
const WINDUP = 0.3;
const LUNGE = 180; // px
const LUNGE_TIME = 0.2;
const ATTACK_RANGE = 40;
const COOLDOWN = 2.5;

export class Mantis extends Enemy {
  constructor(x, y) {
    super(x, y, { tier: 2, hp: 55, radius: 13, killScore: 10 });
    this.alpha = 0.3;
    this._lungeTraveled = 0;
  }

  respawn() {
    super.respawn();
    this.alpha = 0.3;
    this._lungeTraveled = 0;
  }

  behave(dt, env, slow) {
    const bee = env.bee;
    const dist = distance(this, bee);
    const s = this.fsm;

    switch (s.state) {
      case 'IDLE':
      case 'PATROL':
        this.alpha = dist < AMBUSH_RANGE ? 1 : 0.3; // camouflaged when far
        this.wander(PATROL_SPEED * slow, dt, env);
        if (dist <= AMBUSH_RANGE) s.set('ALERTED', this);
        break;

      case 'ALERTED':
        this.alpha = 1;
        this.faceToward(bee.x, bee.y, 0.3);
        s.set('WINDUP', this);
        break;

      case 'WINDUP':
        this.alpha = 1;
        this.faceToward(bee.x, bee.y, 0.15);
        if (s.elapsed(WINDUP * (slow < 1 ? 1 / slow : 1))) {
          this._lungeTraveled = 0;
          this._didHit = false;
          this.facing = angleTo(this, bee);
          s.set('ATTACKING', this);
        }
        break;

      case 'ATTACKING': {
        const lungeSpeed = (LUNGE / LUNGE_TIME) * slow;
        this.moveAlongFacing(lungeSpeed, dt, env);
        this._lungeTraveled += lungeSpeed * dt;
        if (!this._didHit && distance(this, bee) <= ATTACK_RANGE) {
          bee.takeDamage(this.damage); // T2 = 25
          this._didHit = true;
        }
        if (this._lungeTraveled >= LUNGE) s.set('COOLDOWN', this);
        break;
      }

      case 'COOLDOWN':
        this.alpha = 1;
        if (s.elapsed(COOLDOWN * (slow < 1 ? 1 / slow : 1))) {
          s.set('PATROL', this);
        }
        break;

      default:
        break;
    }
  }

  draw(ctx, t) {
    ctx.save();
    let a = this.alpha;
    if (this.dead) a *= Math.max(0, 1 - this.deathTimer / 0.6);
    ctx.globalAlpha = a;
    ctx.translate(this.x, this.y);
    ctx.rotate(this.facing + Math.PI / 2);

    const body = this.telegraphColor('#5A7A3A', '#C8D44F', COLORS.ember);

    // 4 thin legs per side
    ctx.strokeStyle = rgba(COLORS.ink, 0.7);
    ctx.lineWidth = 1;
    for (const side of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const ly = -6 + i * 5;
        ctx.beginPath();
        ctx.moveTo(side * 3, ly);
        ctx.lineTo(side * 12, ly + 4);
        ctx.stroke();
      }
    }

    // folded raptorial forearms (two arcs near the head)
    ctx.strokeStyle = body;
    ctx.lineWidth = 2.4;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(side * 5, -11, 6, -Math.PI / 2, Math.PI / 2, side < 0);
      ctx.stroke();
    }

    // thin angular body (~10×22)
    ctx.beginPath();
    ctx.moveTo(0, -13);
    ctx.quadraticCurveTo(5, -4, 4, 6);
    ctx.quadraticCurveTo(2, 12, 0, 13);
    ctx.quadraticCurveTo(-2, 12, -4, 6);
    ctx.quadraticCurveTo(-5, -4, 0, -13);
    ctx.closePath();
    ctx.fillStyle = body;
    ctx.fill();
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = COLORS.ink;
    ctx.stroke();

    // head + eyes
    ctx.beginPath();
    ctx.ellipse(0, -14, 4, 3, 0, 0, Math.PI * 2);
    ctx.fillStyle = body;
    ctx.fill();
    ctx.stroke();
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(side * 2.2, -15, 1.2, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.ink;
      ctx.fill();
    }

    if (this.fsm.is('WINDUP')) {
      ctx.globalAlpha = a * (0.4 + 0.3 * Math.sin(t * 22));
      ctx.strokeStyle = '#C8D44F';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, 16, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}
