// Shared base for every enemy.
//
// Combat contract (all enemies):
//   - No damage on passive collision.
//   - Damage only through a telegraphed cycle: WINDUP → ATTACKING → COOLDOWN.
//   - Always faces its direction of movement / its target.
//
// Tier damage is a FLAT HP value applied to the player:
//   T1 = 15, T2 = 25, T3 = 35.
// The Bee applies damage-reduction and weather multipliers on receipt.
// (The Carnivorous Plant is a special case — see CarnivorousPlant.js.)
//
// Subclasses implement behave(dt, env); the base handles fsm bookkeeping,
// death, world clamping, safe-pad avoidance, and respawn().

import { StateMachine } from '../../engine/StateMachine.js';
import {
  clamp,
  angle as angleTo,
  angleDiff,
  normalizeAngle,
  distance,
  randomBetween,
} from '../../utils/math.js';

export const TIER_DAMAGE = { 1: 15, 2: 25, 3: 35 };

export class Enemy {
  constructor(x, y, opts = {}) {
    this.x = x;
    this.y = y;
    this.spawnX = x;
    this.spawnY = y;
    this.facing = randomBetween(-Math.PI, Math.PI);
    this.tier = opts.tier || 1;
    this.maxHp = opts.hp || 30;
    this.hp = this.maxHp;
    this.radius = opts.radius || 10;
    this.damage = opts.damage != null ? opts.damage : TIER_DAMAGE[this.tier];
    this.dead = false;
    this.deathTimer = 0; // fades out after dying
    this._didHit = false; // one damage application per attack cycle
    this.killedAtReturn = null; // hive-return index when killed (respawn bookkeeping)

    this.fsm = new StateMachine('IDLE', {
      IDLE: {},
      PATROL: {},
      ALERTED: {},
      WINDUP: {},
      ATTACKING: {},
      COOLDOWN: {},
      DEAD: {},
    });

    // wander state
    this._wanderHeading = this.facing;
    this._wanderTimer = 0;
  }

  /** Damage that a Bee dash deals to this enemy. Plants override to cap it. */
  dashDamage(amount /* , isRear */) {
    return amount;
  }

  takeDamage(amount /* , opts */) {
    if (this.dead) return;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      this.fsm.set('DEAD', this);
    }
  }

  /** True once the death fade is complete. */
  get expired() {
    return this.dead && this.deathTimer > 0.6;
  }

  /**
   * Restore this enemy to its original spawn state. Called by main when an
   * enemy has been dead for RESPAWN_AFTER_RETURNS hive returns. Subclasses
   * override to also reset their per-instance animation/attack fields.
   */
  respawn() {
    this.x = this.spawnX;
    this.y = this.spawnY;
    this.hp = this.maxHp;
    this.dead = false;
    this.deathTimer = 0;
    this.killedAtReturn = null;
    this._didHit = false;
    this.fsm.set('IDLE', this, true);
  }

  // ---- shared movement helpers ----
  faceToward(tx, ty, lerp = 0.2) {
    const target = angleTo(this, { x: tx, y: ty });
    this.facing = normalizeAngle(this.facing + angleDiff(target, this.facing) * lerp);
  }

  moveToward(tx, ty, speed, dt, env, faceLerp = 0.2) {
    this.faceToward(tx, ty, faceLerp);
    this._step(Math.cos(this.facing) * speed, Math.sin(this.facing) * speed, dt, env);
  }

  moveAlongFacing(speed, dt, env) {
    this._step(Math.cos(this.facing) * speed, Math.sin(this.facing) * speed, dt, env);
  }

  wander(speed, dt, env) {
    this._wanderTimer -= dt;
    if (this._wanderTimer <= 0) {
      this._wanderHeading = randomBetween(-Math.PI, Math.PI);
      this._wanderTimer = randomBetween(1.2, 2.8);
    }
    this.facing = normalizeAngle(
      this.facing + angleDiff(this._wanderHeading, this.facing) * 0.05,
    );
    this._step(Math.cos(this.facing) * speed, Math.sin(this.facing) * speed, dt, env);
  }

  _step(dx, dy, dt, env) {
    const size = env.meadow ? env.meadow.WORLD_SIZE : 3200;
    let nx = clamp(this.x + dx * dt, this.radius, size - this.radius);
    let ny = clamp(this.y + dy * dt, this.radius, size - this.radius);
    // Enemies never enter safe pads.
    if (env.meadow && env.meadow.pointInSafePad(nx, ny, this.radius)) {
      nx = this.x;
      ny = this.y;
    }
    this.x = nx;
    this.y = ny;
  }

  distanceToBee(bee) {
    return distance(this, bee);
  }

  // ---- frame update ----
  update(dt, env) {
    this.fsm.update(dt);
    if (this.dead) {
      this.deathTimer += dt;
      return;
    }
    const slow = env.speedFactor != null ? env.speedFactor : 1;
    this.behave(dt, env, slow);
  }

  // Subclasses override.
  behave(/* dt, env, slow */) {}

  // ---- shared rendering helpers ----
  /** Tint applied during telegraphed states; subclasses use it for the body fill. */
  telegraphColor(base, windupColor, attackColor) {
    if (this.fsm.is('WINDUP')) return windupColor;
    if (this.fsm.is('ATTACKING')) return attackColor;
    return base;
  }

  draw(/* ctx, t */) {}
}
