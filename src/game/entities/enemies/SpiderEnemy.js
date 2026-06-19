// T2 Spider (enemy) — a near-stationary anchor that fires web projectiles.
// Web shots create lingering slow zones on impact; main.js aggregates each
// spider's `webImpacts` into the world's speedFactor queries (see main's
// setEnemyWebZones wiring). A spider standing on a web moves at double speed.

import { Enemy } from './Enemy.js';
import { COLORS, rgba } from '../../utils/renderer.js';
import { distance, angle as angleTo } from '../../utils/math.js';

const DETECT = 220;
const WINDUP = 0.5;
const COOLDOWN = 2.2;
const PATROL_SPEED = 40;
const CHASE_SPEED = 80;
const WEB_SPEED_BONUS = 160; // patrol/chase speed while standing on a web

const PROJ_SPEED = 200;
const PROJ_RANGE = 300;
const PROJ_RADIUS = 12;
const IMPACT_RADIUS = 60;
const IMPACT_LIFETIME = 15;

export class SpiderEnemy extends Enemy {
  constructor(x, y) {
    super(x, y, { tier: 2, hp: 50, radius: 13, killScore: 10 });
    this.webImpacts = []; // { x, y, radius, timer } — read by main for slow zones
    this._projectiles = [];
  }

  respawn() {
    super.respawn();
    this.webImpacts = [];
    this._projectiles = [];
  }

  _onWeb(env) {
    return !!(env.meadow && env.meadow.speedFactorAt(this.x, this.y) < 1);
  }

  behave(dt, env, slow) {
    const bee = env.bee;
    const dist = distance(this, bee);
    const s = this.fsm;
    const onWeb = this._onWeb(env);
    const patrol = (onWeb ? WEB_SPEED_BONUS : PATROL_SPEED) * slow;
    const chase = (onWeb ? WEB_SPEED_BONUS : CHASE_SPEED) * slow;

    switch (s.state) {
      case 'IDLE':
      case 'PATROL':
        this.wander(patrol, dt, env);
        if (dist < DETECT) s.set('WINDUP', this);
        break;

      case 'ALERTED':
        this.moveToward(bee.x, bee.y, chase, dt, env, 0.12);
        if (dist < DETECT) s.set('WINDUP', this);
        else s.set('PATROL', this);
        break;

      case 'WINDUP':
        this.faceToward(bee.x, bee.y, 0.08);
        if (s.elapsed(WINDUP * (slow < 1 ? 1 / slow : 1))) {
          this._fireWebs(bee);
          s.set('COOLDOWN', this);
        }
        break;

      case 'COOLDOWN':
        if (s.elapsed(COOLDOWN * (slow < 1 ? 1 / slow : 1))) {
          s.set(dist < DETECT ? 'ALERTED' : 'PATROL', this);
        }
        break;

      default:
        break;
    }

    this._updateProjectiles(dt, bee);
    // Expire impact slow zones.
    if (this.webImpacts.length) {
      for (const w of this.webImpacts) w.timer -= dt;
      this.webImpacts = this.webImpacts.filter((w) => w.timer > 0);
    }
  }

  // Fire 3 web projectiles in a 90° forward arc (30° apart).
  _fireWebs(bee) {
    const base = angleTo(this, bee);
    for (const da of [-Math.PI / 6, 0, Math.PI / 6]) {
      const a = base + da;
      this._projectiles.push({
        x: this.x + Math.cos(a) * (this.radius + 4),
        y: this.y + Math.sin(a) * (this.radius + 4),
        vx: Math.cos(a) * PROJ_SPEED,
        vy: Math.sin(a) * PROJ_SPEED,
        dist: 0,
        active: true,
      });
    }
  }

  _updateProjectiles(dt, bee) {
    if (!this._projectiles.length) return;
    for (const p of this._projectiles) {
      if (!p.active) continue;
      const step = Math.hypot(p.vx, p.vy) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.dist += step;
      const hitBee = distance(p, bee) <= PROJ_RADIUS + bee.radius;
      if (hitBee || p.dist >= PROJ_RANGE) {
        // Lay a slow zone at the impact point.
        this.webImpacts.push({ x: p.x, y: p.y, radius: IMPACT_RADIUS, timer: IMPACT_LIFETIME });
        p.active = false;
      }
    }
    this._projectiles = this._projectiles.filter((p) => p.active);
  }

  draw(ctx, t) {
    ctx.save();
    if (this.dead) ctx.globalAlpha = Math.max(0, 1 - this.deathTimer / 0.6);

    // Active slow-zone impacts (faint silk circles).
    for (const w of this.webImpacts) {
      ctx.save();
      ctx.globalAlpha *= 0.3;
      ctx.strokeStyle = '#9A8A7A';
      ctx.lineWidth = 1;
      ctx.translate(w.x, w.y);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * w.radius, Math.sin(a) * w.radius);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(0, 0, w.radius * 0.6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // In-flight web projectiles.
    for (const p of this._projectiles) {
      ctx.save();
      ctx.globalAlpha *= 0.7;
      ctx.fillStyle = 'rgba(220,220,210,0.7)';
      ctx.strokeStyle = rgba(COLORS.ink, 0.5);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Body + legs.
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.facing);
    const body = this.telegraphColor('#1A1A1A', COLORS.crimson, COLORS.crimson);
    ctx.strokeStyle = rgba(COLORS.ink, 0.85);
    ctx.lineWidth = 1.3;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * 16, Math.sin(a) * 16);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.ellipse(0, 0, 8, 6, 0, 0, Math.PI * 2);
    ctx.fillStyle = body;
    ctx.fill();
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = COLORS.ink;
    ctx.stroke();

    if (this.fsm.is('WINDUP')) {
      ctx.globalAlpha = 0.4 + 0.3 * Math.sin(t * 18);
      ctx.strokeStyle = COLORS.crimson;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, 16, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    ctx.restore();
  }
}
