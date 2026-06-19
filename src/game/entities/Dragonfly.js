// The Dragonfly craft — a Greenhouse specialist. The fastest flyer.
//
// Shares the craft interface. Its Phase Dash grants a full invincibility frame
// for the entire dash duration — every dash is a free i-window — while also
// dealing pass-through damage to enemies it crosses (no recoil to the player).

import { StateMachine } from '../engine/StateMachine.js';
import { COLORS, rgba } from '../utils/renderer.js';
import {
  clamp,
  angleDiff,
  normalizeAngle,
  distance,
  smoothLerp,
} from '../utils/math.js';

const BASE_SPEED = 260; // px/s — fastest craft
const ACCEL_LERP = 0.16;
const FACE_LERP = 0.26;

const MAX_HP = 95;
const MAX_CARRY = 9;

const DR_PER_LEVEL = 0.05;
const THORN_DAMAGE = 8;
const HIT_IFRAME = 0.8;

const DASH_DISTANCE = 100; // px
const DASH_DURATION = 0.15; // s — full invincibility window
const DASH_COOLDOWN = 0.6; // s base
const DASH_DAMAGE = 30; // flat pass-through damage

export class Dragonfly {
  constructor(x, y, upgrades = {}) {
    this.craftType = 'dragonfly';
    this.x = x;
    this.y = y;
    this.radius = 11;
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
    this.dashCooldown = 0;
    this.wingPhase = 0;

    this._dashDir = 0;
    this._dashTraveled = 0;
    this._dashHits = new Set();
    this._preDashImmune = false; // damageImmune value to restore after a phase dash

    this.fsm = new StateMachine('FLYING', {
      FLYING: {}, DASHING: {}, INVINCIBLE: {}, LANDING: {}, LANDED: {}, DOCKED: {}, DEAD: {},
    });

    this._baseCapacity = MAX_CARRY;
    this._baseDashCooldown = DASH_COOLDOWN;
    this.dashCooldownBase = DASH_COOLDOWN;
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
    return this.fsm.is('FLYING') && !this.overCapacity && this.dashCooldown <= 0;
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
    this.wingPhase += dt * (this.fsm.is('DASHING') ? 40 : 30);
    if (this.invincibleTimer > 0) this.invincibleTimer -= dt;
    if (this.thornHitCooldown > 0) this.thornHitCooldown -= dt;
    if (this.dashCooldown > 0) this.dashCooldown -= dt;
    this.fsm.update(dt);

    if (this.isDead()) {
      this.vy = smoothLerp(this.vy, 30, 0.1, dt);
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      return;
    }

    if (this.fsm.is('DASHING')) {
      this.damageImmune = true; // full invincibility for the whole dash
      this._updateDash(dt, env);
      this._applyWorld(dt, env, true);
      return;
    }

    if (env.healPressed) this.useHealingItem();
    if (env.attackPressed && this.canAttack()) this._startDash();

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

  _startDash() {
    this.fsm.set('DASHING', this);
    this._dashDir = this.facing;
    this._dashTraveled = 0;
    this._dashHits.clear();
    this._preDashImmune = this.damageImmune;
    this.dashCooldown = this.dashCooldownBase || DASH_COOLDOWN;
  }

  _updateDash(dt, env) {
    const speed = DASH_DISTANCE / DASH_DURATION;
    this.vx = Math.cos(this._dashDir) * speed;
    this.vy = Math.sin(this._dashDir) * speed;
    this._dashTraveled += speed * dt;

    if (env.queryEnemies) {
      const near = env.queryEnemies(this.x, this.y, 48);
      for (const e of near) {
        if (e.dead || this._dashHits.has(e)) continue;
        if (distance(this, e) <= this.radius + (e.radius || 14) + 6) {
          e.takeDamage(DASH_DAMAGE, { source: 'dragonfly' });
          this._dashHits.add(e);
        }
      }
    }

    if (this._dashTraveled >= DASH_DISTANCE) {
      this.fsm.set('FLYING', this);
      this.damageImmune = this._preDashImmune; // restore pre-dash immunity state
    }
  }

  _applyWorld(dt, env, dashing) {
    const prevX = this.x;
    const prevY = this.y;
    let nx = this.x + this.vx * dt;
    let ny = this.y + this.vy * dt;

    if (env.meadow) {
      if (!dashing) {
        const wind = env.meadow.windForceAt(this.x, this.y);
        if (wind) {
          nx += wind.x * dt;
          ny += wind.y * dt;
        }
      }
      const res = env.meadow.resolveThornCollision(prevX, prevY, nx, ny, this.radius);
      nx = res.x;
      ny = res.y;
      if (res.damaged && !dashing && this.thornHitCooldown <= 0) {
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

    // Phase-dash shimmer (iridescent aura during the i-window).
    if (this.fsm.is('DASHING')) {
      ctx.save();
      ctx.globalAlpha = 0.3 + 0.15 * Math.sin(t * 30);
      ctx.fillStyle = rgba('#4A9AA0', 1);
      ctx.beginPath();
      ctx.arc(0, 0, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else if (this.damageImmune) {
      ctx.save();
      ctx.globalAlpha = 0.25 + 0.1 * Math.sin(t * 6);
      ctx.fillStyle = rgba(COLORS.crimson, 1);
      ctx.beginPath();
      ctx.arc(0, 0, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Four narrow horizontal wing pairs extending wide.
    const flap = Math.sin(this.wingPhase) * 0.18;
    ctx.fillStyle = 'rgba(255,255,255,0.26)';
    ctx.strokeStyle = rgba(COLORS.ink, 0.6);
    ctx.lineWidth = 1;
    for (const side of [-1, 1]) {
      for (const oy of [-6, 2]) {
        ctx.save();
        ctx.rotate(side * flap);
        ctx.beginPath();
        ctx.ellipse(side * 14, oy, 14, 3.2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }

    // Long thin segmented body (~8×28).
    ctx.beginPath();
    ctx.ellipse(0, 0, 4, 14, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#4A9AA0';
    ctx.fill();
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = COLORS.ink;
    ctx.stroke();

    // 3 segment arcs.
    ctx.strokeStyle = rgba(COLORS.ink, 0.7);
    ctx.lineWidth = 1;
    for (const oy of [-4, 2, 8]) {
      ctx.beginPath();
      ctx.arc(0, oy, 4, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
    }

    // Head + large compound eyes.
    ctx.beginPath();
    ctx.arc(0, -13, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#2E6B70';
    ctx.fill();
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.restore();
  }
}
