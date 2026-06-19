// The player-controlled bee.
//
// Owns: movement (with hazard response via the Meadow), the player state
// machine, the dash-sting combat resolution, health, and self-rendering.
// Cross-entity concerns (pollen collection, power-up landing, pad regen, the
// hive dock) are driven by main.js, which sets modifier fields and calls the
// small public methods exposed here.

import { StateMachine } from '../engine/StateMachine.js';
import {
  COLORS,
  rgba,
} from '../utils/renderer.js';
import {
  clamp,
  angleDiff,
  normalizeAngle,
  distance,
  smoothLerp,
} from '../utils/math.js';

const BASE_SPEED = 180; // px/s
const ACCEL_LERP = 0.15;
const FACE_LERP = 0.25;

const DASH_DISTANCE = 80; // px
const DASH_DURATION = 0.15; // s
const DASH_COOLDOWN = 0.6; // s
const REAR_THRESHOLD = (100 * Math.PI) / 180; // rear-hemisphere cone (rad)

const REAR_IFRAME = 0.4; // s of invincibility after a rear hit
const HIT_IFRAME = 0.8; // s of invincibility after taking a hit

const BASE_ATTACK = 34;
const MAX_CARRY = 10;

const DR_PER_LEVEL = 0.05; // damage reduction = ×0.95 per level (stacking)
const THORN_DAMAGE = 8; // flat contact damage from thorn edges

// Enemy damage is now a FLAT value (T1=15, T2=25, T3=35); the bee converts it
// through damage-reduction upgrades (×0.95ⁿ), the active weather multiplier
// (storm ×1.5), and the foxglove shield. See main.js / Enemy.js for the source
// flat values.
export class Bee {
  constructor(x, y, upgrades) {
    this.x = x;
    this.y = y;
    this.radius = 12;
    this.vx = 0;
    this.vy = 0;
    this.facing = -Math.PI / 2; // pointing up

    this.craftType = 'bee';

    // --- upgrades ---
    this.maxHpLevel = upgrades.maxHp || 0;
    this.drLevel = upgrades.damageReduction || 0;
    this.attackLevel = upgrades.attackBoost || 0;
    this.maxHp = 100 + 10 * this.maxHpLevel; // +10 per level → cap 150 at Lv5
    this.hp = this.maxHp;
    this.healingItems = upgrades.healingItems || 0;

    // --- pollen ---
    this.carried = { common: 0, uncommon: 0, rare: 0 };
    this.carriedBonus = 0; // extra value earned via combo multiplier (banked, not capacity)
    this.collectedCount = 0; // monotonic counter; main reads its delta for combo tracking
    this.maxCarry = MAX_CARRY; // capacity metric (weighted value) — shared HUD reads this

    // --- modifiers set each frame by main (power-ups / weather / combo) ---
    this.collectionRadius = 60;
    this.damageImmune = false; // foxglove
    this.weatherMultiplier = 1; // storm ×1.5 (set by main each frame)
    this.comboMultiplier = 1; // combo pollen-value multiplier (set by main each frame)

    // --- timers ---
    this.invincibleTimer = 0;
    this.dashCooldown = 0;
    this.thornHitCooldown = 0;
    this.wingPhase = 0;
    this.flashAlphaSeed = 0;

    // The state machine carries every player state named in the spec. The
    // INVINCIBLE i-frame itself is tracked with `invincibleTimer` so it can
    // coexist with flight (you keep moving while flashing); the state value is
    // used for LANDING/LANDED/DOCKED/DASHING/DEAD gating.
    this.fsm = new StateMachine('FLYING', {
      FLYING: {},
      DASHING: {},
      INVINCIBLE: {},
      LANDING: {},
      LANDED: {},
      DOCKED: {},
      DEAD: {},
    });

    // dash bookkeeping
    this._dashDir = 0;
    this._dashTraveled = 0;
    this._dashHits = new Set();

    // Upgrade bases (read by applyUpgrades to derive scaled stats).
    this._baseCapacity = MAX_CARRY;
    this._baseDashCooldown = DASH_COOLDOWN;
    this.dashCooldownBase = DASH_COOLDOWN;
    this.baseCollectionRadius = 60;
    this.comboWindowBonus = 0;
    this.applyUpgrades(upgrades);
  }

  // ---- derived getters ----
  /** Raw weighted value of carried pollen (capacity metric). */
  get carriedValue() {
    return this.carried.common * 1 + this.carried.uncommon * 3 + this.carried.rare * 5;
  }

  /** Capacity usage shown in the HUD (weighted value for the bee). */
  get capacityUsed() {
    return this.carriedValue;
  }

  /** Total bankable value including combo bonus (craft interface). */
  getCarriedTotal() {
    return this.carriedValue + this.carriedBonus;
  }

  get overCapacity() {
    return this.carriedValue > this.maxCarry;
  }

  get attackDamage() {
    // +0.05 per level, linear, capped at ×1.25 (Lv5).
    return BASE_ATTACK * Math.min(1.25, 1 + 0.05 * this.attackLevel);
  }

  /** Whether there is room to begin collecting one pollen of `type`. */
  canCollect(type) {
    const value = type === 'rare' ? 5 : type === 'uncommon' ? 3 : 1;
    return this.carriedValue + value <= this.maxCarry + 5;
  }

  /** Recompute upgrade-derived stats from the saved upgrades object. */
  applyUpgrades(upgrades) {
    this.maxHpLevel = upgrades.maxHp || 0;
    this.drLevel = upgrades.damageReduction || 0;
    this.attackLevel = upgrades.attackBoost || 0;
    this.maxHp = 100 + 10 * this.maxHpLevel;
    this.hp = Math.min(this.hp, this.maxHp);

    // Pollen capacity: +5 carry value per level.
    const capLevel = upgrades.pollenCapacity || 0;
    this.maxCarry = this._baseCapacity + 5 * capLevel;
    // Dash cooldown: ×0.9 per level (Forest+).
    const dcLevel = upgrades.dashCooldown || 0;
    this.dashCooldownBase = this._baseDashCooldown * Math.pow(0.9, dcLevel);
    // Magnet radius: +20px per level (Garden+); main reads baseCollectionRadius.
    const magLevel = upgrades.magnetRadius || 0;
    this.baseCollectionRadius = 60 + 20 * magLevel;
    // Combo-window bonus seconds (Greenhouse+); read by main each frame.
    this.comboWindowBonus = (upgrades.comboWindow || 0) * 0.5;
  }

  isInvincible() {
    return this.invincibleTimer > 0 || this.damageImmune;
  }

  isDead() {
    return this.fsm.is('DEAD');
  }

  canAttack() {
    return (
      this.fsm.isAny('FLYING') &&
      this.invincibleTimer <= 0 &&
      !this.overCapacity &&
      this.dashCooldown <= 0
    );
  }

  // ---- pollen ----
  /** Add one pollen of the given type if under the hard cap. Returns true if taken. */
  addPollen(type) {
    const value = type === 'rare' ? 5 : type === 'uncommon' ? 3 : 1;
    if (this.carriedValue + value > this.maxCarry + 5) return false;
    this.carried[type] += 1;
    this.collectedCount += 1;
    // Combo multiplier adds bonus value (banked, does not consume capacity).
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
  /**
   * Flat damage from an enemy. `amount` is a flat HP value (T1=15, T2=25,
   * T3=35, etc). Damage reduction (×0.95ⁿ) and the active weather multiplier
   * (storm ×1.5) are applied before the hit lands.
   */
  takeDamage(amount, { ignoreIFrames = false, applyIFrame = true } = {}) {
    if (this.isDead()) return;
    if (this.damageImmune) return; // foxglove
    if (!ignoreIFrames && this.invincibleTimer > 0) return;
    const drMultiplier = Math.pow(1 - DR_PER_LEVEL, this.drLevel); // 0.95ⁿ
    const finalDamage = Math.round(amount * drMultiplier * this.weatherMultiplier);
    this.hp = Math.max(0, this.hp - finalDamage);
    if (applyIFrame) this.invincibleTimer = Math.max(this.invincibleTimer, HIT_IFRAME);
    if (this.hp <= 0) {
      this.fsm.set('DEAD', this);
    }
  }

  /** Flat damage that bypasses i-frames (thorn edge contact). */
  takeFlatDamage(amount) {
    if (this.isDead() || this.damageImmune) return;
    const drMultiplier = Math.pow(1 - DR_PER_LEVEL, this.drLevel);
    this.hp = Math.max(0, this.hp - Math.round(amount * drMultiplier * this.weatherMultiplier));
    if (this.hp <= 0) this.fsm.set('DEAD', this);
  }

  /** Heal up to 50% of max HP while resting on a safe pad. */
  padRegen(dt) {
    if (this.isDead()) return;
    const cap = this.maxHp * 0.5;
    if (this.hp >= cap) return; // pads only restore to half — full heal is hive-only
    const rate = (this.maxHp * 0.5) / 3; // HP per second → reaches 50% over 3s
    this.hp = Math.min(cap, this.hp + rate * dt);
  }

  useHealingItem() {
    if (this.healingItems <= 0 || this.isDead()) return false;
    if (this.hp >= this.maxHp) return false;
    this.healingItems -= 1;
    this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.25);
    return true;
  }

  // ---- main per-frame update ----
  /**
   * env = {
   *   moveVec: {x,y},   // normalized 8-dir intent (0,0 if idle)
   *   attackPressed,    // edge-triggered
   *   healPressed,      // edge-triggered
   *   meadow,           // hazards + world bounds
   *   queryEnemies,     // (x,y,r) => Enemy[]
   *   effects,          // { screenShake(px, ms) }
   *   enemySpeedFactor, // unused by bee, present for symmetry
   *   controllable,     // false while docked/landed pause movement input
   * }
   */
  update(dt, env) {
    this.wingPhase += dt * (this.fsm.is('DASHING') ? 30 : 16);
    if (this.invincibleTimer > 0) this.invincibleTimer -= dt;
    if (this.dashCooldown > 0) this.dashCooldown -= dt;
    if (this.thornHitCooldown > 0) this.thornHitCooldown -= dt;
    this.fsm.update(dt);

    if (this.isDead()) {
      // gentle drift down during the death beat; main triggers GAMEOVER
      this.vy = smoothLerp(this.vy, 30, 0.1, dt);
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      return;
    }

    if (this.fsm.is('DASHING')) {
      this._updateDash(dt, env);
      this._applyWorld(dt, env, /*windWebOff*/ true);
      return;
    }

    // Heal request.
    if (env.healPressed) this.useHealingItem();

    // Attack request.
    if (env.attackPressed && this.canAttack()) {
      this._startDash();
    }

    // --- movement intent ---
    const mv = env.moveVec || { x: 0, y: 0 };
    const moving = mv.x !== 0 || mv.y !== 0;
    const speedFactor = env.meadow ? env.meadow.speedFactorAt(this.x, this.y) : 1;
    const targetVx = mv.x * BASE_SPEED * speedFactor;
    const targetVy = mv.y * BASE_SPEED * speedFactor;
    this.vx = smoothLerp(this.vx, targetVx, ACCEL_LERP, dt);
    this.vy = smoothLerp(this.vy, targetVy, ACCEL_LERP, dt);

    // Face the direction of travel.
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
    this.dashCooldown = this.dashCooldownBase || DASH_COOLDOWN;
  }

  _updateDash(dt, env) {
    const speed = DASH_DISTANCE / DASH_DURATION; // px/s
    const step = speed * dt;
    this.vx = Math.cos(this._dashDir) * speed;
    this.vy = Math.sin(this._dashDir) * speed;
    this._dashTraveled += step;

    // Resolve hits against nearby enemies once each per dash.
    if (env.queryEnemies) {
      const near = env.queryEnemies(this.x, this.y, 48);
      for (const enemy of near) {
        if (enemy.dead || this._dashHits.has(enemy)) continue;
        const reach = this.radius + (enemy.radius || 14) + 6;
        if (distance(this, enemy) <= reach) {
          this._resolveHit(enemy, env);
          this._dashHits.add(enemy);
        }
      }
    }

    if (this._dashTraveled >= DASH_DISTANCE) {
      this.fsm.set('FLYING', this);
    }
  }

  _resolveHit(enemy, env) {
    // Rear vs frontal: compare dash direction to the enemy's facing.
    // Aligned (chasing it from behind) → rear; opposed (it looks at you) → frontal.
    const diff = Math.abs(angleDiff(this._dashDir, enemy.facing));
    const isRear = diff <= REAR_THRESHOLD;

    if (isRear) {
      const dmg = enemy.dashDamage ? enemy.dashDamage(this.attackDamage, true) : this.attackDamage;
      enemy.takeDamage(dmg, { fromDash: true, source: 'bee' });
      this.invincibleTimer = Math.max(this.invincibleTimer, REAR_IFRAME);
      if (env.effects) env.effects.screenShake(3, 200);
    } else {
      const dmg = enemy.dashDamage
        ? enemy.dashDamage(this.attackDamage * 0.5, false)
        : this.attackDamage * 0.5;
      enemy.takeDamage(dmg, { fromDash: true, source: 'bee' });
      // Frontal hit: deal reduced damage to enemy but no recoil to player.
      // Player only takes damage when enemies actively hit them.
    }
  }

  _applyWorld(dt, env, windWebOff) {
    const prevX = this.x;
    const prevY = this.y;

    // Integrate velocity.
    let nx = this.x + this.vx * dt;
    let ny = this.y + this.vy * dt;

    // Wind force (constant px/s while a gust is active). Disabled during dash.
    if (!windWebOff && env.meadow) {
      const wind = env.meadow.windForceAt(this.x, this.y);
      if (wind) {
        nx += wind.x * dt;
        ny += wind.y * dt;
      }
    }

    // Thorn collision (solid walls + edge nick).
    if (env.meadow) {
      const res = env.meadow.resolveThornCollision(prevX, prevY, nx, ny, this.radius);
      nx = res.x;
      ny = res.y;
      if (res.damaged && this.thornHitCooldown <= 0) {
        this.takeFlatDamage(THORN_DAMAGE);
        this.thornHitCooldown = 0.6;
      }
    }

    // World bounds.
    const size = env.meadow ? env.meadow.WORLD_SIZE : 3200;
    this.x = clamp(nx, this.radius, size - this.radius);
    this.y = clamp(ny, this.radius, size - this.radius);
  }

  // ---- landing / docking helpers (driven by main) ----
  setLanding() {
    if (this.fsm.isAny('FLYING')) this.fsm.set('LANDING', this);
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

  get speed() {
    return Math.hypot(this.vx, this.vy);
  }

  // ---- rendering (camera transform already applied) ----
  draw(ctx, t) {
    const flashing = this.invincibleTimer > 0 && !this.damageImmune;
    // Flicker visibility during i-frames.
    if (flashing && Math.floor(t * 20) % 2 === 0) return;

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.facing + Math.PI / 2); // sprite drawn pointing up

    // Overcapacity is surfaced as a HUD warning (see HUD.js), not a sprite tint.
    const bodyColor = COLORS.gold;

    // Foxglove shield aura.
    if (this.damageImmune) {
      ctx.save();
      ctx.globalAlpha = 0.25 + 0.1 * Math.sin(t * 6);
      ctx.fillStyle = rgba(COLORS.crimson, 1);
      ctx.beginPath();
      ctx.arc(0, 0, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Wings (ink-line, oscillating).
    const flap = Math.sin(this.wingPhase) * 0.4;
    ctx.strokeStyle = rgba(COLORS.ink, 0.75);
    ctx.lineWidth = 1.2;
    ctx.fillStyle = rgba('#FFFFFF', 0.35);
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.rotate(side * (0.5 + flap));
      ctx.beginPath();
      ctx.ellipse(side * 8, -2, 10, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Body ellipse (~24×16).
    ctx.beginPath();
    ctx.ellipse(0, 0, 8, 12, 0, 0, Math.PI * 2);
    ctx.fillStyle = bodyColor;
    ctx.fill();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = COLORS.ink;
    ctx.stroke();

    // Ink stripes.
    ctx.strokeStyle = rgba(COLORS.ink, 0.85);
    ctx.lineWidth = 1.6;
    for (const oy of [-3, 1, 5]) {
      ctx.beginPath();
      ctx.moveTo(-6, oy);
      ctx.lineTo(6, oy);
      ctx.stroke();
    }

    // Head dot toward facing.
    ctx.beginPath();
    ctx.arc(0, -11, 3, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.ink;
    ctx.fill();

    ctx.restore();
  }
}
