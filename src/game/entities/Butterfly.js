// The Butterfly craft — a Garden specialist. A graceful glider.
//
// Shares the Bee/Moth/Locust/Hornet craft interface so main.js treats it
// uniformly. Combat is unique: a Glide Dash that phases over thorns and enemies
// (no recoil), with a follow-up Petal Burst if the attack is held after landing.

import { StateMachine } from '../engine/StateMachine.js';
import { COLORS, rgba } from '../utils/renderer.js';
import {
  clamp,
  angleDiff,
  normalizeAngle,
  distance,
  smoothLerp,
} from '../utils/math.js';

const BASE_SPEED = 240; // px/s — nimble
const ACCEL_LERP = 0.15;
const FACE_LERP = 0.25;

const MAX_HP = 70;
const MAX_CARRY = 8;

const DR_PER_LEVEL = 0.05;
const THORN_DAMAGE = 8;
const HIT_IFRAME = 0.8;

const DASH_DISTANCE = 120; // px
const DASH_DURATION = 0.18; // s
const DASH_COOLDOWN = 0.6; // s base
const DASH_DAMAGE = 30; // flat damage to enemies passed through (no recoil)

const PETAL_CHARGE = 0.4; // s of held attack after a glide dash to release the burst
const PETAL_RADIUS = 80; // AoE radius
const PETAL_DAMAGE = 15; // T1 flat damage
const PETAL_SLOW = 0.4; // enemy speed factor while slowed
const PETAL_SLOW_TIME = 3; // s
const PETAL_FX = 0.4; // s burst visual

export class Butterfly {
  constructor(x, y, upgrades = {}) {
    this.craftType = 'butterfly';
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
    this.dashCooldown = 0;
    this.wingPhase = 0;

    this._dashDir = 0;
    this._dashTraveled = 0;
    this._dashHits = new Set();
    this._petalArmed = false;
    this._petalCharge = 0;
    this._petalFx = 0; // burst FX timer
    this._petalX = 0;
    this._petalY = 0;

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
    this.wingPhase += dt * (this.fsm.is('DASHING') ? 20 : 10);
    if (this.invincibleTimer > 0) this.invincibleTimer -= dt;
    if (this.thornHitCooldown > 0) this.thornHitCooldown -= dt;
    if (this.dashCooldown > 0) this.dashCooldown -= dt;
    if (this._petalFx > 0) this._petalFx -= dt;
    this.fsm.update(dt);

    if (this.isDead()) {
      this.vy = smoothLerp(this.vy, 30, 0.1, dt);
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      return;
    }

    if (this.fsm.is('DASHING')) {
      this._updateDash(dt, env);
      this._applyWorld(dt, env, /* dashing */ true);
      return;
    }

    if (env.healPressed) this.useHealingItem();

    // Petal Burst: charges while the secondary (or held attack) is engaged after
    // a glide dash lands. On mobile only the dedicated secondary button can hold.
    if (this._petalArmed) {
      if (env.attackHeld || env.secondaryHeld) {
        this._petalCharge += dt;
        if (this._petalCharge >= PETAL_CHARGE) {
          this._firePetalBurst(env);
          this._petalArmed = false;
        }
      } else {
        this._petalArmed = false;
      }
    }

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
    this._petalArmed = false;
    this.dashCooldown = this.dashCooldownBase || DASH_COOLDOWN;
  }

  _updateDash(dt, env) {
    const speed = DASH_DISTANCE / DASH_DURATION;
    this.vx = Math.cos(this._dashDir) * speed;
    this.vy = Math.sin(this._dashDir) * speed;
    this._dashTraveled += speed * dt;

    // Phase through enemies: deal damage once each, no recoil to the player.
    if (env.queryEnemies) {
      const near = env.queryEnemies(this.x, this.y, 52);
      for (const e of near) {
        if (e.dead || this._dashHits.has(e)) continue;
        if (distance(this, e) <= this.radius + (e.radius || 14) + 8) {
          e.takeDamage(DASH_DAMAGE, { source: 'butterfly' });
          this._dashHits.add(e);
        }
      }
    }

    if (this._dashTraveled >= DASH_DISTANCE) {
      this.fsm.set('FLYING', this);
      this._petalArmed = true; // open the held-attack window for the petal burst
      this._petalCharge = 0;
    }
  }

  _firePetalBurst(env) {
    this._petalFx = PETAL_FX;
    this._petalX = this.x;
    this._petalY = this.y;
    if (env.queryEnemies) {
      const near = env.queryEnemies(this.x, this.y, PETAL_RADIUS + 30);
      for (const e of near) {
        if (e.dead) continue;
        if (distance(e, this) <= PETAL_RADIUS + (e.radius || 0)) {
          e.takeDamage(PETAL_DAMAGE, { source: 'butterfly' });
          if (e.applyExternalSlow) e.applyExternalSlow(PETAL_SLOW, PETAL_SLOW_TIME);
        }
      }
    }
    if (env.effects) env.effects.screenShake(2, 150);
  }

  _applyWorld(dt, env, dashing) {
    const prevX = this.x;
    const prevY = this.y;
    let nx = this.x + this.vx * dt;
    let ny = this.y + this.vy * dt;

    // Glide dash phases over thorns + wind; normal flight resolves them.
    if (env.meadow && !dashing) {
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
    // Petal burst ring (world space, under the body).
    if (this._petalFx > 0) {
      const k = 1 - this._petalFx / PETAL_FX;
      ctx.save();
      ctx.globalAlpha = 0.5 * (1 - k);
      ctx.strokeStyle = rgba('#C8A8D4', 0.95);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(this._petalX, this._petalY, PETAL_RADIUS * k, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

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

    // Four large wings (two per side), slow flutter.
    const flutter = Math.sin(this.wingPhase) * 0.3;
    ctx.strokeStyle = rgba(COLORS.ink, 0.6);
    ctx.lineWidth = 1.1;
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.rotate(side * (0.5 + flutter));
      // upper wing
      ctx.fillStyle = 'rgba(200,168,212,0.7)';
      ctx.beginPath();
      ctx.ellipse(side * 11, -6, 11, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // lower wing
      ctx.fillStyle = 'rgba(180,150,196,0.65)';
      ctx.beginPath();
      ctx.ellipse(side * 9, 7, 8, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Elongated body (~10×20) in pale lavender.
    ctx.beginPath();
    ctx.ellipse(0, 0, 5, 10, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#C8A8D4';
    ctx.fill();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = COLORS.ink;
    ctx.stroke();

    // Antennae.
    ctx.strokeStyle = rgba(COLORS.ink, 0.85);
    ctx.lineWidth = 1;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * 1.5, -9);
      ctx.quadraticCurveTo(side * 6, -15, side * 4, -19);
      ctx.stroke();
    }

    ctx.restore();
  }
}
