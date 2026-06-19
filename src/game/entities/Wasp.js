// The Wasp craft — a Garden specialist. A radial burst attacker.
//
// Shares the craft interface (and the projectile pattern of the Hornet). Its
// Ring Sting fires 8 projectiles outward in a full 360° ring at once: high
// damage, but a slower fire rate than the Hornet's single-shot sting.
//
// Projectiles are updated/collided via updateProjectiles(dt, queryEnemies),
// called by main.js after update() each PLAYING frame, and rendered in draw().

import { StateMachine } from '../engine/StateMachine.js';
import { COLORS, rgba } from '../utils/renderer.js';
import {
  clamp,
  angleDiff,
  normalizeAngle,
  distance,
  smoothLerp,
} from '../utils/math.js';

const BASE_SPEED = 210;
const ACCEL_LERP = 0.15;
const FACE_LERP = 0.25;

const MAX_HP = 85;
const MAX_CARRY = 7;

const DR_PER_LEVEL = 0.05;
const THORN_DAMAGE = 8;
const HIT_IFRAME = 0.8;

// Ring Sting.
const RING_COUNT = 8; // projectiles per volley (45° apart)
const PROJ_SPEED = 380; // px/s
const PROJ_DAMAGE = 35; // flat damage per hit
const PROJ_RANGE = 280; // px before expiry
const PROJ_RADIUS = 4; // collision radius
const PROJ_COOLDOWN = 1.4; // s between volleys
const TRAIL_LEN = 3;

export class Wasp {
  constructor(x, y, upgrades = {}) {
    this.craftType = 'wasp';
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

    this.projectiles = [];

    this.fsm = new StateMachine('FLYING', {
      FLYING: {}, INVINCIBLE: {}, LANDING: {}, LANDED: {}, DOCKED: {}, DEAD: {},
    });

    this._baseCapacity = MAX_CARRY;
    this._baseDashCooldown = 0;
    this.dashCooldownBase = 0;
    this.baseCollectionRadius = 60;
    this.comboWindowBonus = 0;
    this.applyUpgrades(upgrades);
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
    const capLevel = upgrades.pollenCapacity || 0;
    this.maxCarry = this._baseCapacity + 5 * capLevel;
    const dcLevel = upgrades.dashCooldown || 0;
    this.dashCooldownBase = this._baseDashCooldown * Math.pow(0.9, dcLevel);
    const magLevel = upgrades.magnetRadius || 0;
    this.baseCollectionRadius = 60 + 8 * magLevel;
    this.comboWindowBonus = (upgrades.comboWindow || 0) * 0.5;
  }

  // ---- pollen ----
  canCollect() {
    return this.carriedCount + 1 <= this.maxCarry + 5;
  }

  addPollen(type) {
    if (this.carriedCount + 1 > this.maxCarry + 5) return false;
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
    this.wingPhase += dt * 26;
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
    if (env.attackPressed && this.canAttack()) this._fireRing(env);

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

  // Fire RING_COUNT projectiles evenly around a full circle.
  _fireRing(env) {
    this.attackCooldown = PROJ_COOLDOWN;
    for (let i = 0; i < RING_COUNT; i++) {
      const a = (i / RING_COUNT) * Math.PI * 2;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      const muzzle = this.radius + 4;
      this.projectiles.push({
        x: this.x + cos * muzzle,
        y: this.y + sin * muzzle,
        vx: cos * PROJ_SPEED,
        vy: sin * PROJ_SPEED,
        distanceTraveled: 0,
        active: true,
        trail: [],
      });
    }
    if (env.effects) env.effects.screenShake(3, 150);
  }

  updateProjectiles(dt, queryEnemies) {
    if (this.projectiles.length === 0) return;
    for (const p of this.projectiles) {
      if (!p.active) continue;
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

  // ---- rendering ----
  draw(ctx, t) {
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

    // Angular swept-back wings.
    const flap = Math.sin(this.wingPhase) * 0.3;
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.strokeStyle = rgba(COLORS.ink, 0.75);
    ctx.lineWidth = 1.1;
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.rotate(side * (0.4 + flap));
      ctx.beginPath();
      ctx.moveTo(0, -1);
      ctx.lineTo(side * 5, -4);
      ctx.lineTo(side * 12, 4);
      ctx.lineTo(0, 5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Narrow yellow body with 3 dark stripes.
    ctx.beginPath();
    ctx.ellipse(0, 0, 5, 13, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#D4A020';
    ctx.fill();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = COLORS.ink;
    ctx.stroke();

    ctx.strokeStyle = rgba(COLORS.ink, 0.9);
    ctx.lineWidth = 2;
    for (const oy of [-4, 1, 6]) {
      ctx.beginPath();
      ctx.moveTo(-4.5, oy);
      ctx.lineTo(4.5, oy);
      ctx.stroke();
    }

    // Head + antennae.
    ctx.beginPath();
    ctx.arc(0, -12, 2.6, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.ink;
    ctx.fill();
    ctx.strokeStyle = rgba(COLORS.ink, 0.85);
    ctx.lineWidth = 1;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * 1.5, -13);
      ctx.lineTo(side * 5, -18);
      ctx.stroke();
    }

    ctx.restore();
  }

  _drawProjectiles(ctx) {
    for (const p of this.projectiles) {
      for (let i = 0; i < p.trail.length; i++) {
        const pt = p.trail[i];
        const a = ((i + 1) / (p.trail.length + 1)) * 0.5;
        ctx.save();
        ctx.globalAlpha = a;
        ctx.strokeStyle = rgba(COLORS.ink, 0.8);
        ctx.lineWidth = 1.2;
        const next = i < p.trail.length - 1 ? p.trail[i + 1] : p;
        ctx.beginPath();
        ctx.moveTo(pt.x, pt.y);
        ctx.lineTo(next.x, next.y);
        ctx.stroke();
        ctx.restore();
      }
      const ang = Math.atan2(p.vy, p.vx);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(ang);
      ctx.beginPath();
      ctx.moveTo(4, 0);
      ctx.quadraticCurveTo(0, 2, -4, 0);
      ctx.quadraticCurveTo(0, -2, 4, 0);
      ctx.closePath();
      ctx.fillStyle = '#D4A020';
      ctx.fill();
      ctx.lineWidth = 0.8;
      ctx.strokeStyle = rgba(COLORS.ink, 0.7);
      ctx.stroke();
      ctx.restore();
    }
  }
}
