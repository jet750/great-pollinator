// T1 Moth Swarm — a loose cluster of 3 moths that move as a group.
// Each moth is killed individually (one per hit); the swarm dies when all 3
// are gone. Each living moth runs its own staggered attack cycle on contact.

import { Enemy } from './Enemy.js';
import { COLORS, rgba } from '../../utils/renderer.js';
import { distance } from '../../utils/math.js';

const DETECT = 160;
const PATROL_SPEED = 40;
const CHASE_SPEED = 110;
const CONTACT = 28;
const MOTH_DMG_COOLDOWN = 1.5;

export class MothSwarm extends Enemy {
  constructor(x, y) {
    // hp 90 = 30 per moth; killScore 15 = 5 per moth (awarded once on full kill).
    super(x, y, { tier: 1, hp: 90, radius: 14, killScore: 15 });
    this._buildMoths();
  }

  _buildMoths() {
    this._moths = [];
    for (let i = 0; i < 3; i++) {
      this._moths.push({
        ox: (Math.random() - 0.5) * 32,
        oy: (Math.random() - 0.5) * 32,
        phase: Math.random() * Math.PI * 2,
        atkTimer: i * 0.4, // stagger so they don't all strike at once
        alive: true,
      });
    }
  }

  respawn() {
    super.respawn();
    this.hp = this.maxHp;
    this._buildMoths();
  }

  /** Each hit kills one moth (not a shared HP pool). */
  takeDamage() {
    if (this.dead) return;
    const m = this._moths.find((x) => x.alive);
    if (m) {
      m.alive = false;
      this.hp = Math.max(0, this.hp - 30);
    }
    if (this._moths.every((x) => !x.alive)) {
      this.hp = 0;
      this.dead = true;
      this.fsm.set('DEAD', this);
    }
  }

  behave(dt, env, slow) {
    const bee = env.bee;
    const dist = distance(this, bee);

    if (dist < DETECT) {
      this.moveToward(bee.x, bee.y, CHASE_SPEED * slow, dt, env, 0.16);
    } else {
      this.wander(PATROL_SPEED * slow, dt, env);
    }

    // Each living moth strikes on its own staggered cycle when in contact range.
    if (dist <= CONTACT + this.radius) {
      for (const m of this._moths) {
        if (!m.alive) continue;
        m.atkTimer -= dt;
        if (m.atkTimer <= 0) {
          bee.takeDamage(this.damage); // T1 = 15
          m.atkTimer = MOTH_DMG_COOLDOWN;
        }
      }
    }
  }

  draw(ctx, t) {
    ctx.save();
    if (this.dead) ctx.globalAlpha = Math.max(0, 1 - this.deathTimer / 0.6);
    for (const m of this._moths) {
      if (!m.alive) continue;
      const fx = this.x + m.ox + Math.sin(t * 4 + m.phase) * 3;
      const fy = this.y + m.oy + Math.cos(t * 5 + m.phase) * 3;
      const flap = Math.sin(t * 14 + m.phase) * 0.4;
      ctx.save();
      ctx.translate(fx, fy);
      // two wing ellipses (~8×5)
      ctx.fillStyle = 'rgba(184,168,138,0.9)';
      ctx.strokeStyle = rgba(COLORS.ink, 0.7);
      ctx.lineWidth = 1;
      for (const side of [-1, 1]) {
        ctx.save();
        ctx.rotate(side * (0.5 + flap));
        ctx.beginPath();
        ctx.ellipse(side * 4, 0, 4, 2.6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
      // tiny body
      ctx.beginPath();
      ctx.ellipse(0, 0, 1.6, 3.2, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#7A6B50';
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }
}
