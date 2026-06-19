// T2 Centipede — a mobile chained crawler. A head plus 5 trailing body
// segments that follow the leader. Killing the head destroys the whole thing;
// body segments have no HP but still nick the player on contact.

import { Enemy } from './Enemy.js';
import { COLORS, rgba } from '../../utils/renderer.js';
import { distance, angle as angleTo, lerp } from '../../utils/math.js';

const DETECT = 180;
const PATROL_SPEED = 60;
const CHASE_SPEED = 110;
const ATTACK_RANGE = 30;
const WINDUP = 0.5;
const LUNGE = 50;
const LUNGE_TIME = 0.3;
const COOLDOWN = 2.0;
const SEG_RADII = [6, 5.4, 4.6, 3.8, 3];

export class Centipede extends Enemy {
  constructor(x, y) {
    super(x, y, { tier: 2, hp: 80, radius: 10, killScore: 20 });
    this._buildSegments();
    this._lungeTraveled = 0;
  }

  _buildSegments() {
    this.segments = [];
    let px = this.x;
    let py = this.y;
    for (let i = 0; i < SEG_RADII.length; i++) {
      py += 12 + SEG_RADII[i];
      this.segments.push({ x: this.x, y: py, r: SEG_RADII[i], facing: -Math.PI / 2 });
    }
  }

  respawn() {
    super.respawn();
    this._buildSegments();
    this._lungeTraveled = 0;
  }

  _updateSegments() {
    let prev = { x: this.x, y: this.y };
    for (const seg of this.segments) {
      const dx = seg.x - prev.x;
      const dy = seg.y - prev.y;
      const d = Math.hypot(dx, dy) || 0.0001;
      const gap = 12 + seg.r;
      const tx = prev.x + (dx / d) * gap;
      const ty = prev.y + (dy / d) * gap;
      seg.x = lerp(seg.x, tx, 0.4);
      seg.y = lerp(seg.y, ty, 0.4);
      seg.facing = Math.atan2(prev.y - seg.y, prev.x - seg.x);
      prev = seg;
    }
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
        this.moveToward(bee.x, bee.y, CHASE_SPEED * slow, dt, env, 0.16);
        if (dist <= ATTACK_RANGE) s.set('WINDUP', this);
        else if (dist > DETECT * 1.5) s.set('PATROL', this);
        break;

      case 'WINDUP':
        this.faceToward(bee.x, bee.y, 0.1);
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
        if (!this._didHit && distance(this, bee) <= this.radius + bee.radius + 4) {
          bee.takeDamage(this.damage); // T2 = 25 (head)
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

    // Trailing chain + body-contact nicks (T1, gated by the bee's own i-frame).
    this._updateSegments();
    for (const seg of this.segments) {
      if (distance(bee, seg) <= seg.r + bee.radius) {
        bee.takeDamage(15); // T1; bee.takeDamage applies its 0.8s i-frame
        break;
      }
    }
  }

  draw(ctx, t) {
    ctx.save();
    if (this.dead) ctx.globalAlpha = Math.max(0, 1 - this.deathTimer / 0.6);

    // Connecting line down the chain.
    ctx.strokeStyle = rgba('#5A3A14', 0.8);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    for (const seg of this.segments) ctx.lineTo(seg.x, seg.y);
    ctx.stroke();

    // Body segments (tail → head so the head draws on top).
    for (let i = this.segments.length - 1; i >= 0; i--) {
      const seg = this.segments[i];
      ctx.save();
      ctx.translate(seg.x, seg.y);
      ctx.rotate(seg.facing);
      ctx.beginPath();
      ctx.ellipse(0, 0, seg.r + 2, seg.r, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#7A5020';
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = COLORS.ink;
      ctx.stroke();
      // little legs
      ctx.strokeStyle = rgba(COLORS.ink, 0.6);
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, side * (seg.r + 3));
        ctx.stroke();
      }
      ctx.restore();
    }

    // Head.
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.facing);
    const body = this.telegraphColor('#7A5020', COLORS.crimson, COLORS.crimson);
    ctx.beginPath();
    ctx.ellipse(0, 0, 7, 5, 0, 0, Math.PI * 2);
    ctx.fillStyle = body;
    ctx.fill();
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = COLORS.ink;
    ctx.stroke();
    // mandibles
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = 1.2;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(6, side * 2);
      ctx.lineTo(11, side * 4);
      ctx.stroke();
    }
    if (this.fsm.is('WINDUP')) {
      ctx.globalAlpha = 0.4 + 0.3 * Math.sin(t * 18);
      ctx.strokeStyle = COLORS.crimson;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    ctx.restore();
  }
}
