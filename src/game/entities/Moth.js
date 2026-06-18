// The Moth craft — a faster, frailer alternative to the Bee.
//
// Shares the Bee's public interface (see the JSDoc "craft interface" below) so
// main.js can treat any active craft uniformly. Movement, health, landing and
// world-collision patterns are copied from Bee.js; the combat mechanic is
// unique: a short-range "Frontal Consume" pulse that clears mobile enemies.
//
// Craft interface (Bee / Moth / Locust all expose):
//   props:   x, y, radius, hp, maxHp, carried, maxCarry, facing, vx, vy
//   methods: update(dt, env), draw(ctx, t), takeDamage(amount) → dead?,
//            getCarriedTotal()

import { StateMachine } from '../engine/StateMachine.js';
import { COLORS, rgba } from '../utils/renderer.js';
import {
  clamp,
  angleDiff,
  normalizeAngle,
  distance,
  smoothLerp,
} from '../utils/math.js';

const BASE_SPEED = 220; // px/s — faster than the bee
const ACCEL_LERP = 0.15;
const FACE_LERP = 0.25;

const MAX_HP = 80;
const MAX_CARRY = 5; // pollen (count)
const HARD_CAP = 8; // overcapacity tolerance — attack disabled above MAX_CARRY

const DR_PER_LEVEL = 0.05;
const THORN_DAMAGE = 8;
const HIT_IFRAME = 0.8;

const CONSUME_RADIUS = 60;
const CONSUME_DAMAGE = 50;
const CONSUME_COOLDOWN = 0.8; // 800ms
const CONSUME_FX = 0.2; // 200ms expanding ink-burst
const FRONT_OFFSET = 20; // pulse center ahead of the moth

export class Moth {
  constructor(x, y, upgrades = {}) {
    this.craftType = 'moth';
    this.x = x;
    this.y = y;
    this.radius = 12;
    this.vx = 0;
    this.vy = 0;
    this.facing = -Math.PI / 2;

    // Crafts have fixed HP; the damage-reduction upgrade still applies on hit.
    this.maxHp = MAX_HP;
    this.hp = this.maxHp;
    this.drLevel = upgrades.damageReduction || 0;
    this.healingItems = upgrades.healingItems || 0;

    // pollen (count-based capacity for crafts)
    this.carried = { common: 0, uncommon: 0, rare: 0 };
    this.carriedBonus = 0;
    this.collectedCount = 0;
    this.maxCarry = MAX_CARRY;

    // per-frame modifiers set by main
    this.collectionRadius = 60;
    this.damageImmune = false;
    this.weatherMultiplier = 1;
    this.comboMultiplier = 1;

    this.invincibleTimer = 0;
    this.thornHitCooldown = 0;
    this.attackCooldown = 0;
    this.wingPhase = 0;

    this._consumeTimer = 0; // counts down the burst FX
    this._consumeX = 0;
    this._consumeY = 0;

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
    this.wingPhase += dt * 22; // faster wingbeat than bee
    if (this.invincibleTimer > 0) this.invincibleTimer -= dt;
    if (this.thornHitCooldown > 0) this.thornHitCooldown -= dt;
    if (this.attackCooldown > 0) this.attackCooldown -= dt;
    if (this._consumeTimer > 0) this._consumeTimer -= dt;
    this.fsm.update(dt);

    if (this.isDead()) {
      this.vy = smoothLerp(this.vy, 30, 0.1, dt);
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      return;
    }

    if (env.healPressed) this.useHealingItem();
    if (env.attackPressed && this.canAttack()) this._consume(env);

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

  // Frontal Consume: a 60px pulse on the moth's front. Ignores Carnivorous
  // Plants (immuneToMoth); 50 flat to every other enemy inside the radius.
  _consume(env) {
    this.attackCooldown = CONSUME_COOLDOWN;
    this._consumeTimer = CONSUME_FX;
    const fx = this.x + Math.cos(this.facing) * FRONT_OFFSET;
    const fy = this.y + Math.sin(this.facing) * FRONT_OFFSET;
    this._consumeX = fx;
    this._consumeY = fy;
    if (env.queryEnemies) {
      const near = env.queryEnemies(fx, fy, CONSUME_RADIUS + 20);
      for (const enemy of near) {
        if (enemy.dead || enemy.immuneToMoth) continue;
        if (distance(enemy, { x: fx, y: fy }) <= CONSUME_RADIUS + (enemy.radius || 0)) {
          enemy.takeDamage(CONSUME_DAMAGE);
        }
      }
    }
    if (env.effects) env.effects.screenShake(3, 160);
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

    // Consume burst (drawn under the body, in world space).
    if (this._consumeTimer > 0) {
      const k = 1 - this._consumeTimer / CONSUME_FX; // 0 → 1
      ctx.save();
      ctx.globalAlpha = 0.5 * (1 - k);
      ctx.strokeStyle = rgba(COLORS.ink, 0.9);
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(this._consumeX, this._consumeY, CONSUME_RADIUS * k, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

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

    // Large rounded wings (wider than the bee), semi-transparent.
    const flap = Math.sin(this.wingPhase) * 0.35;
    ctx.fillStyle = 'rgba(200,180,160,0.6)';
    ctx.strokeStyle = rgba(COLORS.ink, 0.7);
    ctx.lineWidth = 1.2;
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.rotate(side * (0.6 + flap));
      ctx.beginPath();
      ctx.ellipse(side * 11, -1, 13, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Elongated cream-brown body (~28×18).
    ctx.beginPath();
    ctx.ellipse(0, 0, 9, 14, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#C8B89A';
    ctx.fill();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = COLORS.ink;
    ctx.stroke();

    // Body segmentation.
    ctx.strokeStyle = rgba(COLORS.ink, 0.6);
    ctx.lineWidth = 1;
    for (const oy of [-4, 0, 4, 8]) {
      ctx.beginPath();
      ctx.moveTo(-6, oy);
      ctx.lineTo(6, oy);
      ctx.stroke();
    }

    // Long, curved antennae.
    ctx.strokeStyle = rgba(COLORS.ink, 0.85);
    ctx.lineWidth = 1.2;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * 2, -12);
      ctx.quadraticCurveTo(side * 9, -20, side * 5, -26);
      ctx.stroke();
    }

    ctx.restore();
  }
}
