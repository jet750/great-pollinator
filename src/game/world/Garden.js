// The Garden biome: 6400×6400 world (2× Meadow). Formal hedgerows form a
// concentric maze; aggressive rain is the primary hazard (no wind, no webs).
// Exposes the exact same interface as Meadow.

import {
  COLORS,
  rgba,
  washBlob,
  drawFlower,
  drawPulseRing,
} from '../utils/renderer.js';
import { makeRng, clamp, distance } from '../utils/math.js';

const WORLD_SIZE = 6400;
const CELL = 800;
const RAIN_WARNING = 3.0;

// Garden palette.
const ROSE = '#D4928A';
const TERRA = '#C4714A';

export class Garden {
  constructor() {
    this.WORLD_SIZE = WORLD_SIZE;
    this.CELL = CELL;
    this.time = 0;

    this.hive = { x: 3200, y: 3200, size: 80, radius: 60 };
    this.pads = [
      { x: 900, y: 900, radius: 50 },
      { x: 5500, y: 900, radius: 50 },
      { x: 900, y: 5500, radius: 50 },
      { x: 5500, y: 5500, radius: 50 },
      { x: 3200, y: 800, radius: 50 },
      { x: 3200, y: 5600, radius: 50 },
    ];

    // No wind, no webs — the maze + storms define the Garden.
    this.windZones = [];
    this.webZones = [];

    // Rain fires aggressively (more often, longer storms) than the Forest.
    this.rain = {
      active: false,
      timer: 0,
      nextTrigger: 20 + Math.random() * 30,
      duration: 0,
      warningActive: false,
      warningTimer: 0,
    };

    // Formal concentric hedge rings with deliberate entry gaps.
    this.thorns = [
      // Outer ring (gap North at x≈3050–3350, South at x≈3050–3350, East at y≈3050–3350, West at y≈3050–3350)
      { x: 800,  y: 800,  w: 2250, h: 55 },  // N top segment
      { x: 3350, y: 800,  w: 2250, h: 55 },  // N bot segment
      { x: 800,  y: 5545, w: 2250, h: 55 },
      { x: 3350, y: 5545, w: 2250, h: 55 },
      { x: 800,  y: 800,  w: 55,   h: 2250 },
      { x: 800,  y: 3350, w: 55,   h: 2250 },
      { x: 5545, y: 800,  w: 55,   h: 2250 },
      { x: 5545, y: 3350, w: 55,   h: 2250 },
      // Mid ring (tighter, gap on West and East)
      { x: 1800, y: 1800, w: 1100, h: 45 },
      { x: 3100, y: 1800, w: 1100, h: 45 },
      { x: 1800, y: 4555, w: 1100, h: 45 },
      { x: 3100, y: 4555, w: 1100, h: 45 },
      { x: 1800, y: 1800, w: 45,   h: 1100 },
      { x: 1800, y: 3100, w: 45,   h: 1100 },
      { x: 4555, y: 1800, w: 45,   h: 1100 },
      { x: 4555, y: 3100, w: 45,   h: 1100 },
    ];

    this._enemyWebs = [];
    this._buildDecor();
  }

  _buildDecor() {
    const rng = makeRng(0x6A4D11);
    this.washes = [];
    for (let i = 0; i < 320; i++) {
      this.washes.push({
        x: rng() * WORLD_SIZE,
        y: rng() * WORLD_SIZE,
        rx: 50 + rng() * 150,
        ry: 40 + rng() * 110,
        rot: rng() * Math.PI,
        color: rng() > 0.5 ? ROSE : TERRA,
        alpha: 0.04 + rng() * 0.06,
      });
    }
    this.decor = [];
    for (let i = 0; i < 460; i++) {
      const r = rng();
      this.decor.push({
        x: rng() * WORLD_SIZE,
        y: rng() * WORLD_SIZE,
        type: r < 0.55 ? 'rose' : 'trellis',
        rot: rng() * Math.PI * 2,
        scale: 0.7 + rng() * 0.8,
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
        r.nextTrigger = 20 + Math.random() * 30;
      }
      return;
    }
    if (r.warningActive) {
      r.warningTimer -= dt;
      if (r.warningTimer <= 0) {
        r.warningActive = false;
        r.active = true;
        r.duration = 20 + Math.random() * 8;
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
      grad.addColorStop(0, `rgba(44, 40, 48, ${0.3 * progress})`);
      grad.addColorStop(1, 'rgba(44, 40, 48, 0)');
      ctx.save();
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
      return;
    }
    if (r.active) {
      ctx.save();
      ctx.fillStyle = 'rgba(110, 120, 140, 0.16)';
      ctx.fillRect(0, 0, w, h);
      const angle = (15 * Math.PI) / 180;
      const dx = Math.sin(angle);
      const dy = Math.cos(angle);
      const t = this.time;
      const speed = 340;
      ctx.strokeStyle = 'rgba(190, 200, 220, 0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < 56; i++) {
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
    return null;
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
    // Warm terracotta-cream base — cultivated soil
    ctx.fillStyle = '#E8D8C4';
    ctx.fillRect(0, 0, this.WORLD_SIZE, this.WORLD_SIZE);

    // Blush rose wash blobs
    for (const b of this.washes) {
      if (!camera.isVisible(b.x, b.y, b.rx + b.ry, 40)) continue;
      washBlob(ctx, b.x, b.y, b.rx, b.ry, '#C4826A', 0.12, b.rot);
    }
    // Trellis lines — thin parallel diagonal strokes
    ctx.strokeStyle = 'rgba(140,90,60,0.18)';
    ctx.lineWidth = 1;
    for (let i = -20; i < this.WORLD_SIZE / 120 + 20; i++) {
      const sx = i * 120;
      if (!camera.isVisible(sx, 0, 120, this.WORLD_SIZE)) continue;
      ctx.beginPath();
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx + this.WORLD_SIZE * 0.15, this.WORLD_SIZE);
      ctx.stroke();
    }
    // Small rose-bud cluster decor
    for (const d of this.decor) {
      if (!camera.isVisible(d.x, d.y, 30, 30)) continue;
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.scale(d.scale, d.scale);
      drawFlower(ctx, 9, 5, '#D4826A', '#C06040');
      ctx.restore();
    }

    ctx.strokeStyle = rgba(COLORS.ink, 0.55);
    ctx.lineWidth = 6;
    ctx.strokeRect(0, 0, this.WORLD_SIZE, this.WORLD_SIZE);
  }

  drawHazards(ctx, camera /* , t */) {
    // Thorns only — Garden has no webs or wind.
    for (const th of this.thorns) {
      if (!camera.isVisible(th.x + th.w / 2, th.y + th.h / 2, Math.max(th.w, th.h), 20)) continue;
      ctx.save();
      ctx.fillStyle = '#4A6A28'; // trimmed hedgerow
      ctx.strokeStyle = '#2A4A18';
      ctx.lineWidth = 1.5;
      ctx.fillRect(th.x, th.y, th.w, th.h);
      ctx.strokeRect(th.x, th.y, th.w, th.h);
      // leafy hedge texture
      ctx.strokeStyle = rgba('#3D5A2A', 0.7);
      ctx.lineWidth = 1.2;
      const step = 16;
      for (let sx = th.x + 4; sx < th.x + th.w; sx += step) {
        for (let sy = th.y + 4; sy < th.y + th.h; sy += step) {
          ctx.beginPath();
          ctx.arc(sx + 3, sy + 3, 3, 0, Math.PI * 2);
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
