// The Forest biome: 4800×4800 world (1.5× Meadow). Dense canopy with narrow
// thorn chokepoints, numerous spider-web slow zones (no wind), and frequent
// rain. Exposes the exact same interface as Meadow so main.js / Bee / enemies
// treat any active world uniformly (main.js keeps the field name `this.meadow`).

import {
  COLORS,
  rgba,
  washBlob,
  drawFlower,
  drawPulseRing,
} from '../utils/renderer.js';
import { makeRng, clamp, distance } from '../utils/math.js';

const WORLD_SIZE = 4800;
const CELL = 800;
const RAIN_WARNING = 3.0;

// Forest palette.
const MOSS = '#3D5A3E';
const AMBER = '#C4714A';

export class Forest {
  constructor() {
    this.WORLD_SIZE = WORLD_SIZE;
    this.CELL = CELL;
    this.time = 0;

    this.hive = { x: 2400, y: 2400, size: 80, radius: 60 };
    this.pads = [
      { x: 800, y: 800, radius: 50 },
      { x: 4000, y: 800, radius: 50 },
      { x: 800, y: 4000, radius: 50 },
      { x: 4000, y: 4000, radius: 50 },
    ];

    // Forest has no wind — web slow zones are the primary movement hazard.
    this.windZones = [];

    // Spider webs: larger and more numerous than the Meadow's.
    this.webZones = [
      { x: 1000, y: 1000, radius: 100 },
      { x: 3800, y: 1000, radius: 100 },
      { x: 1000, y: 3800, radius: 100 },
      { x: 3800, y: 3800, radius: 100 },
      { x: 2400, y: 800, radius: 80 },
      { x: 2400, y: 4000, radius: 80 },
      { x: 800, y: 2400, radius: 80 },
      { x: 4000, y: 2400, radius: 80 },
    ];

    // Rain fires more frequently than the Meadow's.
    this.rain = {
      active: false,
      timer: 0,
      nextTrigger: 30 + Math.random() * 45,
      duration: 0,
      warningActive: false,
      warningTimer: 0,
    };

    // Diagonal barrier system — angled corridors rather than orthogonal walls.
    this.thorns = [
      // NW–SE diagonal zone — creates a forced diagonal passage through the forest
      { x: 600,  y: 600,  w: 600, h: 50 },
      { x: 1200, y: 1200, w: 600, h: 50 },
      { x: 2800, y: 600,  w: 50,  h: 600 },
      { x: 3200, y: 1200, w: 50,  h: 600 },
      // Central ring — tighter than Meadow
      { x: 1600, y: 1100, w: 50,  h: 600 },
      { x: 3150, y: 1100, w: 50,  h: 600 },
      { x: 1100, y: 1600, w: 600, h: 50 },
      { x: 1100, y: 3150, w: 600, h: 50 },
      { x: 3500, y: 1600, w: 600, h: 50 },
      { x: 3500, y: 3150, w: 600, h: 50 },
      { x: 1600, y: 3500, w: 50,  h: 600 },
      { x: 3150, y: 3500, w: 50,  h: 600 },
      // Scattered interior blockers
      { x: 2200, y: 1800, w: 200, h: 50 },
      { x: 2200, y: 2950, w: 200, h: 50 },
      { x: 1800, y: 2200, w: 50,  h: 200 },
      { x: 2950, y: 2200, w: 50,  h: 200 },
    ];

    this._enemyWebs = []; // SpiderEnemy impact slow zones (set by main each frame)
    this._buildDecor();
  }

  _buildDecor() {
    const rng = makeRng(0xF0E51A);
    this.washes = [];
    for (let i = 0; i < 220; i++) {
      this.washes.push({
        x: rng() * WORLD_SIZE,
        y: rng() * WORLD_SIZE,
        rx: 50 + rng() * 150,
        ry: 40 + rng() * 110,
        rot: rng() * Math.PI,
        color: rng() > 0.4 ? MOSS : AMBER,
        alpha: 0.05 + rng() * 0.07,
      });
    }
    // Forest decor: roots and simple tree icons
    this.decor = [];
    const drng = makeRng(42);
    for (let i = 0; i < 80; i++) {
      this.decor.push({
        type: drng() < 0.4 ? 'tree' : 'root',
        x: drng() * WORLD_SIZE,
        y: drng() * WORLD_SIZE,
        rot: drng() * Math.PI * 2,
        scale: 0.7 + drng() * 0.8,
      });
    }
  }

  update(dt) {
    this.time += dt;
    this._updateRain(dt);
  }

  _updateRain(dt) {
    const r = this.rain;
    if (r.active) {
      r.duration -= dt;
      if (r.duration <= 0) {
        r.active = false;
        r.nextTrigger = 30 + Math.random() * 45;
      }
      return;
    }
    if (r.warningActive) {
      r.warningTimer -= dt;
      if (r.warningTimer <= 0) {
        r.warningActive = false;
        r.active = true;
        r.duration = 15 + Math.random() * 5;
      }
      return;
    }
    r.nextTrigger -= dt;
    if (r.nextTrigger <= 0) {
      r.warningActive = true;
      r.warningTimer = RAIN_WARNING;
    }
  }

  drawWeather(ctx, w, h) {
    const r = this.rain;
    if (r.warningActive) {
      const progress = 1 - r.warningTimer / RAIN_WARNING;
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, `rgba(34, 40, 36, ${0.28 * progress})`);
      grad.addColorStop(1, 'rgba(34, 40, 36, 0)');
      ctx.save();
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
      return;
    }
    if (r.active) {
      ctx.save();
      ctx.fillStyle = 'rgba(90, 110, 95, 0.16)';
      ctx.fillRect(0, 0, w, h);
      const angle = (15 * Math.PI) / 180;
      const dx = Math.sin(angle);
      const dy = Math.cos(angle);
      const t = this.time;
      const speed = 320;
      ctx.strokeStyle = 'rgba(190, 205, 195, 0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < 48; i++) {
        const len = 12 + ((i * 37) % 9);
        const baseX = (((i * 89) % 100) / 100) * (w + 40) - 20;
        const phase = ((i * 53) % 100) / 100;
        const yy = ((t * speed + phase * (h + 40)) % (h + 40)) - 20;
        const xx = baseX + yy * dx * 0.2;
        ctx.moveTo(xx, yy);
        ctx.lineTo(xx + dx * len, yy + dy * len);
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  // ---- queries ----
  getEnemyWebZones() {
    return this._enemyWebs || [];
  }
  setEnemyWebZones(zones) {
    this._enemyWebs = zones;
  }

  windForceAt() {
    return null; // no wind in the Forest
  }

  speedFactorAt(x, y) {
    for (const w of this.webZones) {
      if (distance({ x, y }, w) <= w.radius) return 0.4;
    }
    for (const w of this._enemyWebs) {
      if (distance({ x, y }, w) <= w.radius) return 0.4;
    }
    return 1;
  }

  isInHiveZone(x, y) {
    return distance({ x, y }, this.hive) <= this.hive.radius;
  }

  isInSafePad(x, y) {
    for (const p of this.pads) {
      if (distance({ x, y }, p) <= p.radius) return p;
    }
    return null;
  }

  pointInSafePad(x, y, r = 0) {
    for (const p of this.pads) {
      if (distance({ x, y }, p) <= p.radius + r) return true;
    }
    return false;
  }

  resolveThornCollision(prevX, prevY, nx, ny, radius) {
    let x = nx;
    let y = ny;
    let damaged = false;
    for (const t of this.thorns) {
      const closestX = clamp(x, t.x, t.x + t.w);
      const closestY = clamp(y, t.y, t.y + t.h);
      const dx = x - closestX;
      const dy = y - closestY;
      const distSq = dx * dx + dy * dy;
      if (distSq < radius * radius) {
        const dist = Math.sqrt(distSq) || 0.0001;
        const push = radius - dist;
        x += (dx / dist) * push;
        y += (dy / dist) * push;
        damaged = true;
      }
    }
    return { x, y, damaged };
  }

  // ---- rendering ----
  drawTerrain(ctx, camera) {
    // Dark loamy soil base
    ctx.fillStyle = '#2C1F14';
    ctx.fillRect(0, 0, this.WORLD_SIZE, this.WORLD_SIZE);

    // Mossy patches — dark green wash blobs
    for (const b of this.washes) {
      if (!camera.isVisible(b.x, b.y, b.rx + b.ry, 40)) continue;
      washBlob(ctx, b.x, b.y, b.rx, b.ry, '#3D5A2A', 0.18, b.rot);
    }
    // Root-line texture: horizontal dark streaks
    ctx.strokeStyle = 'rgba(20,12,6,0.35)';
    ctx.lineWidth = 2;
    for (const d of this.decor) {
      if (!camera.isVisible(d.x, d.y, 40, 40)) continue;
      if (d.type === 'root') {
        ctx.save();
        ctx.translate(d.x, d.y);
        ctx.rotate(d.rot);
        ctx.beginPath();
        ctx.moveTo(-d.scale * 20, 0);
        ctx.bezierCurveTo(-d.scale * 8, -d.scale * 6, d.scale * 8, d.scale * 4, d.scale * 22, 0);
        ctx.stroke();
        ctx.restore();
      } else if (d.type === 'tree') {
        // Simple tree icon: trunk rectangle + circle canopy
        ctx.save();
        ctx.translate(d.x, d.y);
        ctx.fillStyle = '#4A2E0A';
        ctx.fillRect(-4 * d.scale, 0, 8 * d.scale, 18 * d.scale);
        ctx.beginPath();
        ctx.arc(0, -12 * d.scale, 16 * d.scale, 0, Math.PI * 2);
        ctx.fillStyle = rgba('#2A4A18', 0.7);
        ctx.fill();
        ctx.restore();
      }
    }

    ctx.strokeStyle = rgba(COLORS.ink, 0.55);
    ctx.lineWidth = 6;
    ctx.strokeRect(0, 0, this.WORLD_SIZE, this.WORLD_SIZE);
  }

  drawHazards(ctx, camera, t) {
    // Web zones — faint radial silk lines.
    for (const w of this.webZones) {
      if (!camera.isVisible(w.x, w.y, w.radius, 20)) continue;
      ctx.save();
      ctx.translate(w.x, w.y);
      ctx.globalAlpha = 0.25;
      ctx.strokeStyle = '#8A7A6A';
      ctx.lineWidth = 1;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * w.radius, Math.sin(a) * w.radius);
        ctx.stroke();
      }
      for (let r = 18; r < w.radius; r += 18) {
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    this._drawThorns(ctx, camera);
  }

  _drawThorns(ctx, camera) {
    for (const th of this.thorns) {
      if (!camera.isVisible(th.x + th.w / 2, th.y + th.h / 2, Math.max(th.w, th.h), 20)) continue;
      ctx.save();
      ctx.fillStyle = '#3A2010';
      ctx.strokeStyle = '#5A3A1A';
      ctx.lineWidth = 1.5;
      ctx.fillRect(th.x, th.y, th.w, th.h);
      ctx.strokeRect(th.x, th.y, th.w, th.h);
      ctx.strokeStyle = rgba(COLORS.ink, 0.7);
      ctx.lineWidth = 1.2;
      const step = 16;
      for (let sx = th.x + 4; sx < th.x + th.w; sx += step) {
        for (let sy = th.y + 4; sy < th.y + th.h; sy += step) {
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx + 6, sy + 6);
          ctx.moveTo(sx + 6, sy);
          ctx.lineTo(sx, sy + 6);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
  }

  drawStructures(ctx, camera, t) {
    for (const p of this.pads) {
      if (!camera.isVisible(p.x, p.y, p.radius, 20)) continue;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = COLORS.green;
      ctx.beginPath();
      ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.85;
      drawFlower(ctx, p.radius * 0.7, 12, rgba(COLORS.green, 1), COLORS.gold);
      ctx.globalAlpha = 0.4;
      ctx.strokeStyle = COLORS.green;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    const h = this.hive;
    if (camera.isVisible(h.x, h.y, h.radius + 20, 20)) {
      drawPulseRing(ctx, h.x, h.y, h.radius, COLORS.gold, t);
      ctx.save();
      ctx.translate(h.x, h.y);
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
        const px = Math.cos(a) * 42;
        const py = Math.sin(a) * 42;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = COLORS.gold;
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = COLORS.ink;
      ctx.stroke();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = rgba(COLORS.ink, 0.8);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * 16, Math.sin(a) * 16, 8, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
}

export { WORLD_SIZE, CELL };
