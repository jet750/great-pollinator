// The Spider craft — a Greenhouse specialist. A trapper / area-denial collector.
//
// Shares the craft interface. Its Web Layer extrudes slow-zone webs while the
// attack is held; enemies that wander in are slowed, and any enemy that dies
// inside a placed web drops bonus pollen (the trap reward, granted by main.js).
//
// NOTE: exported as `Spider`; main.js imports it as `SpiderCraft` to avoid the
// name collision with the enemy SpiderEnemy.

import { StateMachine } from '../engine/StateMachine.js';
import { COLORS, rgba } from '../utils/renderer.js';
import {
  clamp,
  angleDiff,
  normalizeAngle,
  smoothLerp,
} from '../utils/math.js';

const BASE_SPEED = 160; // px/s — slow but high capacity
const ACCEL_LERP = 0.15;
const FACE_LERP = 0.22;

const MAX_HP = 110;
const MAX_CARRY = 12;

const DR_PER_LEVEL = 0.05;
const THORN_DAMAGE = 8;
const HIT_IFRAME = 0.8;

const WEB_INTERVAL = 1.2; // s between placed webs while held
const WEB_RADIUS = 80;
const WEB_LIFETIME = 30; // s
const MAX_WEBS = 5;

export class Spider {
  constructor(x, y, upgrades = {}) {
    this.craftType = 'spider_craft';
    this.x = x;
    this.y = y;
    this.radius = 13;
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
    this.wingPhase = 0;
    this._legPhase = 0;

    // Web Layer state — placed webs are read by main.js for rendering, enemy
    // slow queries, and the on-kill lure bonus.
    this.placedWebs = [];
    this._webTimer = 0;

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

  // The Spider has no offensive attack; its "attack" input lays webs instead.
  canAttack() {
    return false;
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

  /** Trap reward: bonus common pollen when an enemy dies inside a placed web. */
  grantWebLure(n = 2) {
    for (let i = 0; i < n; i++) this.addPollen('common');
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
    this._legPhase += dt * (this.speed > 20 ? 14 : 5);
    if (this.invincibleTimer > 0) this.invincibleTimer -= dt;
    if (this.thornHitCooldown > 0) this.thornHitCooldown -= dt;
    this.fsm.update(dt);

    // Web Layer: extrude a web every WEB_INTERVAL while the attack is held.
    if (!this.isDead() && this.fsm.is('FLYING')) {
      if (env.attackHeld) {
        this._webTimer -= dt;
        if (this._webTimer <= 0) {
          this._placeWeb();
          this._webTimer = WEB_INTERVAL;
        }
      } else {
        this._webTimer = 0; // primed to drop a web immediately on next hold
      }
    }
    // Expire placed webs.
    if (this.placedWebs.length) {
      for (const w of this.placedWebs) w.timer -= dt;
      this.placedWebs = this.placedWebs.filter((w) => w.timer > 0);
    }

    if (this.isDead()) {
      this.vy = smoothLerp(this.vy, 30, 0.1, dt);
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      return;
    }

    if (env.healPressed) this.useHealingItem();

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

  _placeWeb() {
    if (this.placedWebs.length >= MAX_WEBS) this.placedWebs.shift();
    this.placedWebs.push({ x: this.x, y: this.y, radius: WEB_RADIUS, timer: WEB_LIFETIME });
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
      ctx.arc(0, 0, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 8 thin radial legs, gently animated.
    ctx.strokeStyle = rgba(COLORS.ink, 0.85);
    ctx.lineWidth = 1.4;
    ctx.lineCap = 'round';
    for (let i = 0; i < 8; i++) {
      const base = (i / 8) * Math.PI * 2;
      const wiggle = Math.sin(this._legPhase + i) * 0.15;
      const a = base + wiggle;
      const knee = 9;
      const foot = 16;
      const kx = Math.cos(a) * knee;
      const ky = Math.sin(a) * knee - 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(kx, ky);
      ctx.lineTo(Math.cos(a) * foot, Math.sin(a) * foot);
      ctx.stroke();
    }

    // Compact round body with a subtle hour-glass marking.
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, Math.PI * 2);
    ctx.fillStyle = '#3A3A3A';
    ctx.fill();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = COLORS.ink;
    ctx.stroke();

    ctx.fillStyle = rgba(COLORS.crimson, 0.85);
    ctx.beginPath();
    ctx.moveTo(-3, -3);
    ctx.lineTo(3, -3);
    ctx.lineTo(-3, 3);
    ctx.lineTo(3, 3);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }
}
