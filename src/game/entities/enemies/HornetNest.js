// T3 Hornet Nest — a large static spawner. Periodically releases mini-drones
// that chase the player, then return and despawn after a time. The nest manages
// its drones internally: it moves/renders them and registers live drones into
// the spatial grid so the player's attacks can hit them. Drone kills credit
// points via `pendingScore`, which main.js drains each frame.

import { Enemy } from './Enemy.js';
import { COLORS, rgba } from '../../utils/renderer.js';
import { distance, angle as angleTo, normalizeAngle, angleDiff, clamp } from '../../utils/math.js';

const SPAWN_INTERVAL = 6; // s between spawn waves
const MAX_DRONES = 4;
const DRONE_LIFE = 8; // s of chasing before returning to nest
const DRONE_SPEED = 100;
const DRONE_RETURN_SPEED = 130;
const DRONE_DMG_COOLDOWN = 1.2;
const DRONE_SCORE = 5;

export class HornetNest extends Enemy {
  constructor(x, y) {
    super(x, y, { tier: 3, hp: 120, radius: 24, killScore: 25 });
    this.facing = -Math.PI / 2;
    this.drones = [];
    this.pendingScore = 0; // drained by main (per-drone kill points)
    this._spawnTimer = SPAWN_INTERVAL * 0.5;
  }

  respawn() {
    super.respawn();
    this.facing = -Math.PI / 2;
    this.drones = [];
    this.pendingScore = 0;
    this._spawnTimer = SPAWN_INTERVAL * 0.5;
  }

  /** Live drones exposed as hittable objects for external queries. */
  getDrones() {
    return this.drones.filter((d) => !d.dead && !d._despawn);
  }

  _spawnDrone() {
    const a = Math.random() * Math.PI * 2;
    this.drones.push({
      x: this.x + Math.cos(a) * (this.radius + 6),
      y: this.y + Math.sin(a) * (this.radius + 6),
      vx: 0,
      vy: 0,
      facing: a,
      radius: 7,
      hp: 20,
      maxHp: 20,
      dead: false,
      deathTimer: 0,
      kind: 'enemy',
      life: DRONE_LIFE,
      _atk: 0,
      _despawn: false,
      _scoreAwarded: false,
      // Drones take flat damage; expose the methods the player's attacks expect.
      dashDamage(amount) { return amount; },
      takeDamage(amount) {
        if (this.dead) return;
        this.hp -= amount;
        if (this.hp <= 0) { this.hp = 0; this.dead = true; }
      },
    });
  }

  _moveDrone(d, tx, ty, speed, dt) {
    const target = angleTo(d, { x: tx, y: ty });
    d.facing = normalizeAngle(d.facing + angleDiff(target, d.facing) * 0.2);
    d.x += Math.cos(d.facing) * speed * dt;
    d.y += Math.sin(d.facing) * speed * dt;
  }

  behave(dt, env) {
    const bee = env.bee;

    // Spawn waves.
    this._spawnTimer -= dt;
    if (this._spawnTimer <= 0) {
      this._spawnTimer = SPAWN_INTERVAL;
      let live = this.getDrones().length;
      for (let i = 0; i < 2 && live < MAX_DRONES; i++) {
        this._spawnDrone();
        live++;
      }
    }

    // Update drones.
    const size = env.meadow ? env.meadow.WORLD_SIZE : 3200;
    for (const d of this.drones) {
      if (d.dead) {
        d.deathTimer += dt;
        continue;
      }
      d.life -= dt;
      if (d.life <= 0) {
        // Return to the nest, then despawn (no score for a natural retreat).
        if (distance(d, this) < 22) {
          d._despawn = true;
        } else {
          this._moveDrone(d, this.x, this.y, DRONE_RETURN_SPEED, dt);
        }
      } else {
        this._moveDrone(d, bee.x, bee.y, DRONE_SPEED, dt);
        if (distance(d, bee) <= d.radius + bee.radius + 3) {
          d._atk -= dt;
          if (d._atk <= 0) {
            bee.takeDamage(15); // T1
            d._atk = DRONE_DMG_COOLDOWN;
          }
        }
      }
      d.x = clamp(d.x, d.radius, size - d.radius);
      d.y = clamp(d.y, d.radius, size - d.radius);
      // Register live drones so the player's attack queries can hit them.
      if (!d.dead && env.grid) env.grid.insert(d);
    }

    // Credit points for any newly-killed drones.
    for (const d of this.drones) {
      if (d.dead && !d._scoreAwarded) {
        d._scoreAwarded = true;
        this.pendingScore += DRONE_SCORE;
      }
    }

    // Cull despawned / fully-faded drones.
    this.drones = this.drones.filter((d) => !d._despawn && !(d.dead && d.deathTimer > 0.6));

    // Slowly rotate for a little life.
    this.facing += dt * 0.3;
  }

  draw(ctx, t) {
    // Drones (under/over the nest, world space).
    for (const d of this.drones) {
      ctx.save();
      if (d.dead) ctx.globalAlpha = Math.max(0, 1 - d.deathTimer / 0.6);
      ctx.translate(d.x, d.y);
      ctx.rotate(d.facing + Math.PI / 2);
      // tiny bee silhouette
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.strokeStyle = rgba(COLORS.ink, 0.6);
      ctx.lineWidth = 0.8;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(side * 4, -1, 4, 2.4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.ellipse(0, 0, 3, 5, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#8B6914';
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Nest body.
    ctx.save();
    if (this.dead) ctx.globalAlpha = Math.max(0, 1 - this.deathTimer / 0.6);
    ctx.translate(this.x, this.y);

    // teardrop paper-lantern shape
    ctx.beginPath();
    ctx.moveTo(0, -26);
    ctx.bezierCurveTo(22, -16, 20, 20, 0, 26);
    ctx.bezierCurveTo(-20, 20, -22, -16, 0, -26);
    ctx.closePath();
    ctx.fillStyle = '#D4C8A8';
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = COLORS.ink;
    ctx.stroke();

    // horizontal paper-layer rings
    ctx.strokeStyle = rgba(COLORS.ink, 0.4);
    ctx.lineWidth = 1;
    for (let oy = -18; oy <= 18; oy += 6) {
      const w = Math.sqrt(Math.max(0, 1 - (oy / 26) ** 2)) * 21;
      ctx.beginPath();
      ctx.moveTo(-w, oy);
      ctx.quadraticCurveTo(0, oy + 3, w, oy);
      ctx.stroke();
    }

    // entrance hole
    ctx.beginPath();
    ctx.arc(0, 16, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#2A2218';
    ctx.fill();

    if (this.fsm.isAny('IDLE', 'PATROL')) {
      ctx.globalAlpha = 0.1 + 0.05 * Math.sin(t * 3);
      ctx.strokeStyle = COLORS.crimson;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, 40, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}
