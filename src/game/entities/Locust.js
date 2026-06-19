// The Locust craft — the tankiest, slowest flyer. A path-clearer.
//
// Shares the Bee/Moth craft interface so main.js treats it uniformly. Movement,
// health, landing and world-collision patterns are copied from Bee.js; the
// combat mechanic is a short forward lunge with a wide rectangular "AoE Chomp"
// hitbox. The Locust is the ONLY craft that can kill Carnivorous Plants (full
// 80 damage, 2 hits at 160 HP).

import { StateMachine } from '../engine/StateMachine.js';
import { COLORS, rgba } from '../utils/renderer.js';
import {
  clamp,
  angleDiff,
  normalizeAngle,
  smoothLerp,
} from '../utils/math.js';

const BASE_SPEED = 140; // px/s — slowest craft
const ACCEL_LERP = 0.15;
const FACE_LERP = 0.22;

const MAX_HP = 120;
const MAX_CARRY = 5;

const DR_PER_LEVEL = 0.05;
const THORN_DAMAGE = 8;
const HIT_IFRAME = 0.8;

const CHOMP_DAMAGE = 80;
const CHOMP_COOLDOWN = 1.2; // 1200ms
const LUNGE_DIST = 40;
const LUNGE_TIME = 0.2; // 200ms
const HITBOX_LEN = 80; // forward reach
const HITBOX_HALF_W = 20; // half of the 40px width

export class Locust {
  constructor(x, y, upgrades = {}) {
    this.craftType = 'locust';
    this.x = x;
    this.y = y;
    this.radius = 14;
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
    this.bobPhase = 0;

    this._lungeDir = 0;
    this._lungeTraveled = 0;
    this._chompHits = new Set();
    this._jaw = 0; // 0..1 jaw-close animation
    this._splat = null; // { x, y, timer } ink splatter at impact

    this.fsm = new StateMachine('FLYING', {
      FLYING: {}, LUNGING: {}, LANDING: {}, LANDED: {}, DOCKED: {}, DEAD: {},
    });

    // Upgrade bases. Locust has no dash attack → _baseDashCooldown = 0.
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
    this.baseCollectionRadius = 60 + 20 * magLevel;
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
    this.bobPhase += dt * 8;
    if (this.invincibleTimer > 0) this.invincibleTimer -= dt;
    if (this.thornHitCooldown > 0) this.thornHitCooldown -= dt;
    if (this.attackCooldown > 0) this.attackCooldown -= dt;
    if (this._splat) {
      this._splat.timer -= dt;
      if (this._splat.timer <= 0) this._splat = null;
    }
    this.fsm.update(dt);

    if (this.isDead()) {
      this.vy = smoothLerp(this.vy, 30, 0.1, dt);
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      return;
    }

    if (this.fsm.is('LUNGING')) {
      this._updateLunge(dt, env);
      this._applyWorld(dt, env, true);
      return;
    }

    if (env.healPressed) this.useHealingItem();
    if (env.attackPressed && this.canAttack()) this._startLunge();

    const mv = env.moveVec || { x: 0, y: 0 };
    const moving = mv.x !== 0 || mv.y !== 0;
    const speedFactor = env.meadow ? env.meadow.speedFactorAt(this.x, this.y) : 1;
    this.vx = smoothLerp(this.vx, mv.x * BASE_SPEED * speedFactor, ACCEL_LERP, dt);
    this.vy = smoothLerp(this.vy, mv.y * BASE_SPEED * speedFactor, ACCEL_LERP, dt);
    if (moving) {
      const target = Math.atan2(mv.y, mv.x);
      this.facing = normalizeAngle(this.facing + angleDiff(target, this.facing) * FACE_LERP);
    }

    this._applyWorld(dt, env, false);
  }

  _startLunge() {
    this.fsm.set('LUNGING', this);
    this._lungeDir = this.facing;
    this._lungeTraveled = 0;
    this._chompHits.clear();
    this._jaw = 0;
    this.attackCooldown = CHOMP_COOLDOWN;
  }

  _updateLunge(dt, env) {
    const speed = LUNGE_DIST / LUNGE_TIME;
    this.vx = Math.cos(this._lungeDir) * speed;
    this.vy = Math.sin(this._lungeDir) * speed;
    this._lungeTraveled += speed * dt;
    this._jaw = Math.min(1, this._lungeTraveled / LUNGE_DIST);

    this._resolveChomp(env);

    if (this._lungeTraveled >= LUNGE_DIST) this.fsm.set('FLYING', this);
  }

  // Oriented rectangular hitbox: 0..HITBOX_LEN forward, ±HITBOX_HALF_W across.
  // 80 flat damage; Carnivorous Plants take full damage (no fromDash flag).
  _resolveChomp(env) {
    if (!env.queryEnemies) return;
    const cos = Math.cos(this._lungeDir);
    const sin = Math.sin(this._lungeDir);
    const near = env.queryEnemies(this.x, this.y, HITBOX_LEN + 30);
    for (const enemy of near) {
      if (enemy.dead || this._chompHits.has(enemy)) continue;
      const dx = enemy.x - this.x;
      const dy = enemy.y - this.y;
      const fwd = dx * cos + dy * sin;
      const side = -dx * sin + dy * cos;
      const r = enemy.radius || 0;
      if (fwd >= -r && fwd <= HITBOX_LEN + r && Math.abs(side) <= HITBOX_HALF_W + r) {
        enemy.takeDamage(CHOMP_DAMAGE);
        this._chompHits.add(enemy);
        this._splat = { x: enemy.x, y: enemy.y, timer: 0.18 };
        if (env.effects) env.effects.screenShake(4, 200);
      }
    }
  }

  _applyWorld(dt, env, windOff) {
    const prevX = this.x;
    const prevY = this.y;
    let nx = this.x + this.vx * dt;
    let ny = this.y + this.vy * dt;

    if (env.meadow) {
      if (!windOff) {
        const wind = env.meadow.windForceAt(this.x, this.y);
        if (wind) {
          nx += wind.x * dt;
          ny += wind.y * dt;
        }
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
    const flashing = this.invincibleTimer > 0 && !this.damageImmune;
    if (flashing && Math.floor(t * 20) % 2 === 0) return;

    // Ink splatter at the last impact point (world space).
    if (this._splat) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, this._splat.timer / 0.18) * 0.7;
      ctx.fillStyle = COLORS.ink;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const d = 6 + (i % 2) * 5;
        ctx.beginPath();
        ctx.arc(this._splat.x + Math.cos(a) * d, this._splat.y + Math.sin(a) * d, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    const bob = Math.sin(this.bobPhase) * 1.2;
    ctx.save();
    ctx.translate(this.x, this.y + bob);
    ctx.rotate(this.facing + Math.PI / 2);

    if (this.damageImmune) {
      ctx.save();
      ctx.globalAlpha = 0.25 + 0.1 * Math.sin(t * 6);
      ctx.fillStyle = rgba(COLORS.crimson, 1);
      ctx.beginPath();
      ctx.arc(0, 0, 24, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Angular, geometric wings.
    ctx.fillStyle = 'rgba(120,140,90,0.45)';
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = 1.4;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * 4, -4);
      ctx.lineTo(side * 16, -2);
      ctx.lineTo(side * 13, 12);
      ctx.lineTo(side * 4, 8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Heavy olive body (~32×20).
    ctx.beginPath();
    ctx.ellipse(0, 0, 10, 16, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#5A6B2A';
    ctx.fill();
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = COLORS.ink;
    ctx.stroke();

    // Heavy ink segmentation.
    ctx.strokeStyle = rgba(COLORS.ink, 0.9);
    ctx.lineWidth = 1.6;
    for (const oy of [-6, -1, 4, 9]) {
      ctx.beginPath();
      ctx.moveTo(-7, oy);
      ctx.lineTo(7, oy);
      ctx.stroke();
    }

    // Mandibles / jaws — closing arcs while lunging.
    const jawSpread = this.fsm.is('LUNGING') ? (1 - this._jaw) * 0.6 + 0.1 : 0.5;
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = 2;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(0, -16, 7, -Math.PI / 2 - side * jawSpread, -Math.PI / 2 + side * jawSpread, side < 0);
      ctx.stroke();
    }

    ctx.restore();
  }
}
