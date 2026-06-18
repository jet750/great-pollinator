// The Hornet craft — the offensive specialist. A ranged attacker.
//
// Shares the Bee/Moth/Locust craft interface so main.js treats it uniformly.
// Movement, health, landing and world-collision patterns are copied from the
// other crafts; the combat mechanic is unique: a Projectile Sting fired in the
// current facing direction. Projectiles fly straight, deal flat damage on the
// first enemy they touch, and expire on hit or after travelling PROJ_RANGE.
//
// Projectiles are updated/collided via updateProjectiles(dt, queryEnemies),
// called by main.js after the entity's own update() each PLAYING frame, and
// rendered as part of draw(ctx, t) (world transform already applied).

import { StateMachine } from '../engine/StateMachine.js';
import { COLORS, rgba } from '../utils/renderer.js';
import {
  clamp,
  angleDiff,
  normalizeAngle,
  distance,
  smoothLerp,
} from '../utils/math.js';

const BASE_SPEED = 200; // px/s — between the bee and the moth
const ACCEL_LERP = 0.15;
const FACE_LERP = 0.25;

const MAX_HP = 90;
const MAX_CARRY = 8; // pollen (count) — attack disabled above this
const HARD_CAP = 12; // overcapacity tolerance (8–12)

const DR_PER_LEVEL = 0.05;
const THORN_DAMAGE = 8;
const HIT_IFRAME = 0.8;

// Projectile Sting.
const PROJ_SPEED = 420; // px/s
const PROJ_DAMAGE = 45; // flat damage per hit
const PROJ_RANGE = 350; // px before a projectile expires
const PROJ_RADIUS = 5; // collision radius
const PROJ_COOLDOWN = 0.5; // seconds between shots
const TRAIL_LEN = 4; // ink-line trail points behind each projectile

export class Hornet {
  constructor(x, y, upgrades = {}) {
    this.craftType = 'hornet';
    this.x = x;
    this.y = y;
    this.radius = 12;
    this.vx = 0;
    this.vy = 0;
    this.facing = -Math.PI / 2;

    this.maxHp = MAX_HP;
    this.hp = this.maxHp;
    this.drLevel = upgrades.damageReduction || 0;
    this.healingItems = upgrades.healingItems || 0;

    this.carried = { common: 0, uncommon: 0, rare: 0 };
    this.carriedBonus = 0;
    this.collectedCount = 0;
    this.maxCarry = MAX_CARRY;

    this.collectionRadius = 60;
    this.damageImmune = false;
    this.weatherMultiplier = 1;
    this.comboMultiplier = 1;

    this.invincibleTimer = 0;
    this.thornHitCooldown = 0;
    this.attackCooldown = 0;
    this.wingPhase = 0;

    // Active projectiles: { x, y, vx, vy, distanceTraveled, active, trail[] }.
    this.projectiles = [];

    this.fsm = new StateMachine('FLYING', {
      FLYING: {}, INVINCIBLE: {}, LANDING: {}, LANDED: {}, DOCKED: {}, DEAD: {},
    });
  }

  // ---- getters / craft interface ----
  get carriedValue() {
    return this.carried.common * 1 + this.carried.uncommon * 3 + this.carried.rare * 5;
  }
  get carriedCount() {
    return this.carried.common + this.carried.uncommon + this.carried.rare;
  }
  get capacityUsed() {
    return this.carriedCount;
  }
  getCarriedTotal() {
    return this.carriedValue + this.carriedBonus;
  }
  get overCapacity() {
    return this.carriedCount > this.maxCarry;
  }
  get speed() {
    return Math.hypot(this.vx, this.vy);
  }

  isDead() {
    return this.fsm.is('DEAD');
  }

  canAttack() {
    return this.fsm.is('FLYING') && !this.overCapacity && this.attackCooldown <= 0;
  }

  applyUpgrades(upgrades) {
    this.drLevel = upgrades.damageReduction || 0;
    this.hp = Math.min(this.hp, this.maxHp);
  }

  // ---- pollen ----
  canCollect() {
    return this.carriedCount + 1 <= HARD_CAP;
  }

  addPollen(type) {
    if (this.carriedCount + 1 > HARD_CAP) return false;
    const value = type === 'rare' ? 5 : type === 'uncommon' ? 3 : 1;
    this.carried[type] += 1;
    this.collectedCount += 1;
    if (this.comboMultiplier > 1) {
      this.carriedBonus += Math.round(value * this.comboMultiplier) - value;
    }
    return true;
  }

  clearCarried() {
    this.carried = { common: 0, uncommon: 0, rare: 0 };
    this.carriedBonus = 0;
  }

  // ---- health ----
  takeDamage(amount, { ignoreIFrames = false, applyIFrame = true } = {}) {
    if (this.isDead()) return false;
    if (this.damageImmune) return false;
    if (!ignoreIFrames && this.invincibleTimer > 0) return false;
    const dr = Math.pow(1 - DR_PER_LEVEL, this.drLevel);
    this.hp = Math.max(0, this.hp - Math.round(amount * dr * this.weatherMultiplier));
    if (applyIFrame) this.invincibleTimer = Math.max(this.invincibleTimer, HIT_IFRAME);
    if (this.hp <= 0) this.fsm.set('DEAD', this);
    return this.isDead();
  }

  takeFlatDamage(amount) {
    if (this.isDead() || this.damageImmune) return;
    const dr = Math.pow(1 - DR_PER_LEVEL, this.drLevel);
    this.hp = Math.max(0, this.hp - Math.round(amount * dr * this.weatherMultiplier));
    if (this.hp <= 0) this.fsm.set('DEAD', this);
  }

  padRegen(dt) {
    if (this.isDead()) return;
    const cap = this.maxHp * 0.5;
    if (this.hp >= cap) return;
    this.hp = Math.min(cap, this.hp + ((this.maxHp * 0.5) / 3) * dt);
  }

  useHealingItem() {
    if (this.healingItems <= 0 || this.isDead() || this.hp >= this.maxHp) return false;
    this.healingItems -= 1;
    this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.25);
    return true;
  }

  // ---- per-frame update ----
  update(dt, env) {
    this.wingPhase += dt * 26; // rapid, aggressive wingbeat
    if (this.invincibleTimer > 0) this.invincibleTimer -= dt;
    if (this.thornHitCooldown > 0) this.thornHitCooldown -= dt;
    if (this.attackCooldown > 0) this.attackCooldown -= dt;
    this.fsm.update(dt);

    if (this.isDead()) {
      this.vy = smoothLerp(this.vy, 30, 0.1, dt);
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      return;
    }

    if (env.healPressed) this.useHealingItem();
    if (env.attackPressed && this.canAttack()) this._fire(env);

    const mv = env.moveVec || { x: 0, y: 0 };
    const moving = mv.x !== 0 || mv.y !== 0;
    const speedFactor = env.meadow ? env.meadow.speedFactorAt(this.x, this.y) : 1;
    this.vx = smoothLerp(this.vx, mv.x * BASE_SPEED * speedFactor, ACCEL_LERP, dt);
    this.vy = smoothLerp(this.vy, mv.y * BASE_SPEED * speedFactor, ACCEL_LERP, dt);
    if (moving) {
      const target = Math.atan2(mv.y, mv.x);
      this.facing = normalizeAngle(this.facing + angleDiff(target, this.facing) * FACE_LERP);
    }

    this._applyWorld(dt, env);
  }

  // Spawn a projectile from the hornet's nose in the current facing direction.
  _fire(env) {
    this.attackCooldown = PROJ_COOLDOWN;
    const cos = Math.cos(this.facing);
    const sin = Math.sin(this.facing);
    const muzzle = this.radius + 6;
    this.projectiles.push({
      x: this.x + cos * muzzle,
      y: this.y + sin * muzzle,
      vx: cos * PROJ_SPEED,
      vy: sin * PROJ_SPEED,
      distanceTraveled: 0,
      active: true,
      trail: [],
    });
    if (env.effects) env.effects.screenShake(2, 120);
  }

  /**
   * Move and collide every active projectile. Called by main.js each PLAYING
   * frame after update(). `queryEnemies(x, y, r)` returns nearby live enemies
   * via the spatial grid. Ranged hits always deal full flat damage regardless
   * of the enemy's facing (unlike the melee crafts).
   */
  updateProjectiles(dt, queryEnemies) {
    if (this.projectiles.length === 0) return;
    for (const p of this.projectiles) {
      if (!p.active) continue;

      // Record a short fading trail behind the projectile.
      p.trail.push({ x: p.x, y: p.y });
      if (p.trail.length > TRAIL_LEN) p.trail.shift();

      const step = Math.hypot(p.vx, p.vy) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.distanceTraveled += step;

      if (queryEnemies) {
        const near = queryEnemies(p.x, p.y, PROJ_RADIUS + 32);
        for (const enemy of near) {
          if (enemy.dead) continue;
          const reach = PROJ_RADIUS + (enemy.radius || 0);
          if (distance(p, enemy) <= reach) {
            enemy.takeDamage(PROJ_DAMAGE);
            p.active = false;
            break;
          }
        }
      }

      if (p.distanceTraveled >= PROJ_RANGE) p.active = false;
    }
    this.projectiles = this.projectiles.filter((p) => p.active);
  }

  _applyWorld(dt, env) {
    const prevX = this.x;
    const prevY = this.y;
    let nx = this.x + this.vx * dt;
    let ny = this.y + this.vy * dt;

    if (env.meadow) {
      const wind = env.meadow.windForceAt(this.x, this.y);
      if (wind) {
        nx += wind.x * dt;
        ny += wind.y * dt;
      }
      const res = env.meadow.resolveThornCollision(prevX, prevY, nx, ny, this.radius);
      nx = res.x;
      ny = res.y;
      if (res.damaged && this.thornHitCooldown <= 0) {
        this.takeFlatDamage(THORN_DAMAGE);
        this.thornHitCooldown = 0.6;
      }
    }

    const size = env.meadow ? env.meadow.WORLD_SIZE : 3200;
    this.x = clamp(nx, this.radius, size - this.radius);
    this.y = clamp(ny, this.radius, size - this.radius);
  }

  // ---- landing / docking helpers ----
  setLanding() {
    if (this.fsm.is('FLYING')) this.fsm.set('LANDING', this);
  }
  setLanded() {
    this.fsm.set('LANDED', this);
  }
  setDocked() {
    this.fsm.set('DOCKED', this);
    this.vx = 0;
    this.vy = 0;
  }
  setFlying() {
    if (!this.isDead()) this.fsm.set('FLYING', this);
  }

  // ---- rendering (camera transform already applied) ----
  draw(ctx, t) {
    // Projectiles first, in world space, under the body.
    this._drawProjectiles(ctx);

    const flashing = this.invincibleTimer > 0 && !this.damageImmune;
    if (flashing && Math.floor(t * 20) % 2 === 0) return;

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.facing + Math.PI / 2);

    if (this.damageImmune) {
      ctx.save();
      ctx.globalAlpha = 0.25 + 0.1 * Math.sin(t * 6);
      ctx.fillStyle = rgba(COLORS.crimson, 1);
      ctx.beginPath();
      ctx.arc(0, 0, 21, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Narrow, angular wings (sharper and tighter than the bee's).
    const flap = Math.sin(this.wingPhase) * 0.3;
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.strokeStyle = rgba(COLORS.ink, 0.75);
    ctx.lineWidth = 1.1;
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.rotate(side * (0.45 + flap));
      ctx.beginPath();
      ctx.moveTo(0, -1);
      ctx.lineTo(side * 6, -3);
      ctx.lineTo(side * 13, 3);
      ctx.lineTo(0, 4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Sleek elongated teardrop body (~16×30): pointed abdomen toward the tail.
    ctx.beginPath();
    ctx.moveTo(0, -14); // nose
    ctx.quadraticCurveTo(8, -8, 7, 2);
    ctx.quadraticCurveTo(5, 14, 0, 16); // tapered stinger tail
    ctx.quadraticCurveTo(-5, 14, -7, 2);
    ctx.quadraticCurveTo(-8, -8, 0, -14);
    ctx.closePath();
    ctx.fillStyle = '#8B6914';
    ctx.fill();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = COLORS.ink;
    ctx.stroke();

    // Thin ink-line stripes across the abdomen.
    ctx.strokeStyle = rgba(COLORS.ink, 0.9);
    ctx.lineWidth = 1.2;
    for (const oy of [-2, 3, 8]) {
      ctx.beginPath();
      ctx.moveTo(-6, oy);
      ctx.lineTo(6, oy);
      ctx.stroke();
    }

    // Head + short antennae.
    ctx.beginPath();
    ctx.arc(0, -12, 2.6, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.ink;
    ctx.fill();
    ctx.strokeStyle = rgba(COLORS.ink, 0.85);
    ctx.lineWidth = 1;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * 1.5, -13);
      ctx.lineTo(side * 5, -19);
      ctx.stroke();
    }

    ctx.restore();
  }

  _drawProjectiles(ctx) {
    for (const p of this.projectiles) {
      // Fading ink-line trail behind the projectile.
      for (let i = 0; i < p.trail.length; i++) {
        const pt = p.trail[i];
        const a = ((i + 1) / (p.trail.length + 1)) * 0.5;
        ctx.save();
        ctx.globalAlpha = a;
        ctx.strokeStyle = rgba(COLORS.ink, 0.8);
        ctx.lineWidth = 1.4;
        const next = i < p.trail.length - 1 ? p.trail[i + 1] : p;
        ctx.beginPath();
        ctx.moveTo(pt.x, pt.y);
        ctx.lineTo(next.x, next.y);
        ctx.stroke();
        ctx.restore();
      }

      // Small elongated teardrop (~8×4) oriented along travel direction.
      const ang = Math.atan2(p.vy, p.vx);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(ang);
      ctx.beginPath();
      ctx.moveTo(4, 0); // tip
      ctx.quadraticCurveTo(0, 2, -4, 0);
      ctx.quadraticCurveTo(0, -2, 4, 0);
      ctx.closePath();
      ctx.fillStyle = '#D4A83F';
      ctx.fill();
      ctx.lineWidth = 0.8;
      ctx.strokeStyle = rgba(COLORS.ink, 0.7);
      ctx.stroke();
      ctx.restore();
    }
  }
}
