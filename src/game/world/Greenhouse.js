// The Greenhouse biome: 8000×8000 world (2.5× Meadow). A dark glass house with
// dense climbing-vine walls, tropical decor, condensation, and the most
// aggressive rain. Exposes the exact same interface as Meadow.

import {
  COLORS,
  rgba,
  washBlob,
  drawFlower,
  drawLeaf,
  drawPulseRing,
} from '../utils/renderer.js';
import { makeRng, clamp, distance } from '../utils/math.js';

const WORLD_SIZE = 8000;
const CELL = 800;
const RAIN_WARNING = 3.0;

// Greenhouse palette.
const JADE = '#5A7A5A';
const GLASS = '#B8D4C8';

export class Greenhouse {
  constructor() {
    this.WORLD_SIZE = WORLD_SIZE;
    this.CELL = CELL;
    this.time = 0;

    this.hive = { x: 4000, y: 4000, size: 80, radius: 60 };
    this.pads = [
      { x: 1000, y: 1000, radius: 50 },
      { x: 7000, y: 1000, radius: 50 },
      { x: 1000, y: 7000, radius: 50 },
      { x: 7000, y: 7000, radius: 50 },
      { x: 4000, y: 800, radius: 50 },
      { x: 4000, y: 7200, radius: 50 },
      { x: 800, y: 4000, radius: 50 },
      { x: 7200, y: 4000, radius: 50 },
    ];

    this.windZones = [];
    this.webZones = [];

    // Most aggressive rain of any biome.
    this.rain = {
      active: false,
      timer: 0,
      nextTrigger: 15 + Math.random() * 20,
      duration: 0,
      warningActive: false,
      warningTimer: 0,
    };

    // Asymmetric grid chambers — claustrophobic, irregular room-like spaces.
    this.thorns = [
      // Horizontal dividers — irregular spacing
      { x: 400,  y: 2000, w: 3200, h: 60 },
      { x: 4400, y: 2000, w: 3200, h: 60 },
      { x: 800,  y: 4000, w: 2800, h: 60 },
      { x: 4400, y: 4200, w: 3000, h: 60 },
      { x: 400,  y: 6000, w: 3400, h: 60 },
      { x: 4200, y: 5800, w: 3400, h: 60 },
      // Vertical dividers — offset to create irregular rooms
      { x: 2000, y: 400,  w: 60,   h: 1400 },
      { x: 2000, y: 2200, w: 60,   h: 1600 },
      { x: 4000, y: 600,  w: 60,   h: 1200 },
      { x: 6000, y: 2200, w: 60,   h: 1600 },
      { x: 2200, y: 4200, w: 60,   h: 1400 },
      { x: 5800, y: 4400, w: 60,   h: 1400 },
      { x: 3800, y: 6000, w: 60,   h: 1600 },
      // Inner chamber walls near hive
      { x: 3200, y: 3200, w: 400,  h: 50 },
      { x: 4400, y: 3200, w: 400,  h: 50 },
      { x: 3200, y: 4750, w: 400,  h: 50 },
      { x: 4400, y: 4750, w: 400,  h: 50 },
      { x: 3200, y: 3200, w: 50,   h: 400 },
      { x: 4750, y: 3200, w: 50,   h: 400 },
      { x: 3200, y: 4350, w: 50,   h: 400 },
      { x: 4750, y: 4350, w: 50,   h: 400 },
    ];

    this._enemyWebs = [];
    this._buildDecor();
  }

  _buildDecor() {
    const rng = makeRng(0x2A3A2A);
    this.washes = [];
    for (let i = 0; i < 420; i++) {
      this.washes.push({
        x: rng() * WORLD_SIZE,
        y: rng() * WORLD_SIZE,
        rx: 60 + rng() * 170,
        ry: 50 + rng() * 120,
        rot: rng() * Math.PI,
        color: rng() > 0.45 ? JADE : GLASS,
        alpha: 0.05 + rng() * 0.08,
      });
    }
    this.decor = [];
    const drng = makeRng(77);
    for (let i = 0; i < 120; i++) {
      this.decor.push({
        type: drng() < 0.5 ? 'leaf' : 'drop',
        x: drng() * WORLD_SIZE,
        y: drng() * WORLD_SIZE,
        rot: drng() * Math.PI * 2,
        scale: 0.6 + drng() * 1.0,
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
        r.nextTrigger = 15 + Math.random() * 20;
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
      grad.addColorStop(0, `rgba(20, 30, 24, ${0.34 * progress})`);
      grad.addColorStop(1, 'rgba(20, 30, 24, 0)');
      ctx.save();
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
      return;
    }
    if (r.active) {
      ctx.save();
      ctx.fillStyle = 'rgba(80, 110, 95, 0.18)';
      ctx.fillRect(0, 0, w, h);
      const angle = (12 * Math.PI) / 180;
      const dx = Math.sin(angle);
      const dy = Math.cos(angle);
      const t = this.time;
      const speed = 360;
      ctx.strokeStyle = 'rgba(184, 212, 200, 0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < 64; i++) {
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
    // Dark humid floor — wet stone / peat
    ctx.fillStyle = '#1A2A1A';
    ctx.fillRect(0, 0, this.WORLD_SIZE, this.WORLD_SIZE);

    // Glass panel grid — faint bright lines suggesting greenhouse roof panels
    ctx.strokeStyle = 'rgba(160,210,180,0.08)';
    ctx.lineWidth = 1;
    const PANEL = 400;
    for (let gx = 0; gx < this.WORLD_SIZE; gx += PANEL) {
      if (!camera.isVisible(gx, 0, PANEL, this.WORLD_SIZE)) continue;
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, this.WORLD_SIZE); ctx.stroke();
    }
    for (let gy = 0; gy < this.WORLD_SIZE; gy += PANEL) {
      if (!camera.isVisible(0, gy, this.WORLD_SIZE, PANEL)) continue;
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(this.WORLD_SIZE, gy); ctx.stroke();
    }

    // Tropical leaf wash blobs
    for (const b of this.washes) {
      if (!camera.isVisible(b.x, b.y, b.rx + b.ry, 40)) continue;
      washBlob(ctx, b.x, b.y, b.rx, b.ry, '#2A5A3A', 0.22, b.rot);
    }
    // Condensation droplets + large leaf decor
    for (const d of this.decor) {
      if (!camera.isVisible(d.x, d.y, 40, 40)) continue;
      ctx.save();
      ctx.translate(d.x, d.y);
      if (d.type === 'drop') {
        ctx.beginPath();
        ctx.arc(0, 0, 2 * d.scale, 0, Math.PI * 2);
        ctx.fillStyle = rgba('#80C0A0', 0.35);
        ctx.fill();
      } else {
        ctx.rotate(d.rot);
        ctx.scale(d.scale, d.scale);
        drawLeaf(ctx, 28, 12, '#2A5A2A');
      }
      ctx.restore();
    }

    ctx.strokeStyle = rgba(GLASS, 0.4);
    ctx.lineWidth = 6;
    ctx.strokeRect(0, 0, this.WORLD_SIZE, this.WORLD_SIZE);
  }

  drawHazards(ctx, camera /* , t */) {
    // Climbing-vine walls — dark fill with thick green vine-stroke borders.
    for (const th of this.thorns) {
      if (!camera.isVisible(th.x + th.w / 2, th.y + th.h / 2, Math.max(th.w, th.h), 20)) continue;
      ctx.save();
      ctx.fillStyle = '#2A4A20';
      ctx.fillRect(th.x, th.y, th.w, th.h);
      // thick vine border
      ctx.strokeStyle = '#4A8A40';
      ctx.lineWidth = 4;
      ctx.strokeRect(th.x, th.y, th.w, th.h);
      // climbing-vine tendrils along the long axis
      ctx.strokeStyle = rgba('#3D5A3E', 0.8);
      ctx.lineWidth = 2;
      const horizontal = th.w >= th.h;
      const span = horizontal ? th.w : th.h;
      const step = 22;
      for (let s = 8; s < span; s += step) {
        ctx.beginPath();
        if (horizontal) {
          ctx.moveTo(th.x + s, th.y + 2);
          ctx.quadraticCurveTo(th.x + s + 6, th.y + th.h / 2, th.x + s, th.y + th.h - 2);
        } else {
          ctx.moveTo(th.x + 2, th.y + s);
          ctx.quadraticCurveTo(th.x + th.w / 2, th.y + s + 6, th.x + th.w - 2, th.y + s);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  drawStructures(ctx, camera, t) {
    for (const p of this.pads) {
      if (!camera.isVisible(p.x, p.y, p.radius, 20)) continue;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = GLASS;
      ctx.beginPath();
      ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.9;
      drawFlower(ctx, p.radius * 0.7, 12, rgba(JADE, 1), COLORS.gold);
      ctx.globalAlpha = 0.45;
      ctx.strokeStyle = GLASS;
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
