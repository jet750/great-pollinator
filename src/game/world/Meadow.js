// The Meadow biome: 3200×3200 world. Owns terrain rendering, environmental
// hazards (wind / webs / thorns), the central hive, the two safe pads, and the
// random rain weather event (storm → ×1.5 damage; see main.js for the modifier).
// Exposes query helpers consumed by the Bee and enemies.
//
// TODO(Phase 3): Forest / Garden / Greenhouse biomes (rain is the primary
// hazard in Garden/Greenhouse).

import {
  COLORS,
  rgba,
  washBlob,
  drawFlower,
  drawLeaf,
  drawGrassTuft,
  drawPulseRing,
} from '../utils/renderer.js';
import { makeRng, clamp, distance } from '../utils/math.js';

const WORLD_SIZE = 3200;
const CELL = 800; // 4×4 conceptual grid
const RAIN_WARNING = 3.0; // seconds of cloud-shadow telegraph before a storm
const WIND_FORCE = 80;
const WIND_ON = 5;
const WIND_OFF = 10;
const WIND_PERIOD = WIND_ON + WIND_OFF;

export class Meadow {
  constructor() {
    this.WORLD_SIZE = WORLD_SIZE;
    this.CELL = CELL;
    this.time = 0;

    this.hive = { x: 1600, y: 1600, size: 80, radius: 60 };
    this.pads = [
      { x: 800, y: 800, radius: 50 },
      { x: 2400, y: 2400, radius: 50 },
    ];

    // Wind gusts: rectangular regions, each with a flow direction + phase offset
    // so they pulse out of sync.
    this.windZones = [
      { x: 400, y: 1400, w: 300, h: 120, dir: 0, offset: 0 },
      { x: 2000, y: 600, w: 120, h: 300, dir: Math.PI / 2, offset: 5 },
      { x: 1750, y: 2300, w: 300, h: 120, dir: Math.PI, offset: 10 },
    ];

    // Spider webs: permanent circular slow zones.
    this.webZones = [
      { x: 1200, y: 520, radius: 70 },
      { x: 620, y: 2100, radius: 70 },
      { x: 2600, y: 1500, radius: 70 },
      { x: 2100, y: 2650, radius: 70 },
    ];

    // Rain weather event. `active` is read by main.js to apply the ×1.5
    // storm-damage modifier; the warning phase telegraphs the incoming storm.
    this.rain = {
      active: false,
      timer: 0,
      nextTrigger: 45 + Math.random() * 60, // first rain between 45–105s into a run
      duration: 0,
      warningActive: false,
      warningTimer: 0,
    };

    // Thorns: solid rectangular blockers.
    this.thorns = [
      { x: 1100, y: 1080, w: 120, h: 60 },
      { x: 2000, y: 1880, w: 60, h: 120 },
      { x: 500, y: 1780, w: 120, h: 60 },
      { x: 2380, y: 900, w: 60, h: 120 },
      { x: 1480, y: 2380, w: 120, h: 60 },
      { x: 900, y: 420, w: 60, h: 120 },
    ];

    this._buildDecor();
  }

  // Stable decorative scatter (fixed seed → consistent layout).
  _buildDecor() {
    const rng = makeRng(0xB1A2C3);
    this.washes = [];
    for (let i = 0; i < 150; i++) {
      this.washes.push({
        x: rng() * WORLD_SIZE,
        y: rng() * WORLD_SIZE,
        rx: 40 + rng() * 120,
        ry: 30 + rng() * 90,
        rot: rng() * Math.PI,
        color: rng() > 0.45 ? COLORS.green : COLORS.gold,
        alpha: 0.05 + rng() * 0.06,
      });
    }
    this.decor = [];
    for (let i = 0; i < 220; i++) {
      const r = rng();
      const type = r < 0.4 ? 'grass' : r < 0.75 ? 'flower' : 'leaf';
      this.decor.push({
        x: rng() * WORLD_SIZE,
        y: rng() * WORLD_SIZE,
        type,
        rot: rng() * Math.PI * 2,
        scale: 0.7 + rng() * 0.8,
        petals: 5 + Math.floor(rng() * 4),
        color: r < 0.6 ? COLORS.gold : COLORS.ember,
      });
    }
  }

  update(dt) {
    this.time += dt;
    this._updateRain(dt);
  }

  // ---- rain weather cycle ----
  _updateRain(dt) {
    const r = this.rain;
    if (r.active) {
      r.duration -= dt;
      if (r.duration <= 0) {
        r.active = false;
        r.nextTrigger = 60 + Math.random() * 90; // next event 60–150s away
      }
      return;
    }
    if (r.warningActive) {
      r.warningTimer -= dt;
      if (r.warningTimer <= 0) {
        r.warningActive = false;
        r.active = true;
        r.duration = 15 + Math.random() * 5; // storm lasts 15–20s
      }
      return;
    }
    r.nextTrigger -= dt;
    if (r.nextTrigger <= 0) {
      r.warningActive = true;
      r.warningTimer = RAIN_WARNING; // 3s telegraph before the storm
    }
  }

  /**
   * Screen-space weather overlay (NOT camera-transformed). Drawn by main after
   * the world, before the HUD: a cloud-shadow during the warning phase, then
   * animated rain streaks + a cool wash while the storm is active.
   */
  drawWeather(ctx, w, h) {
    const r = this.rain;

    if (r.warningActive) {
      // Darkening cloud shadow sliding in from the top (opacity 0 → 0.25).
      const progress = 1 - r.warningTimer / RAIN_WARNING;
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, `rgba(40, 44, 52, ${0.25 * progress})`);
      grad.addColorStop(1, 'rgba(40, 44, 52, 0)');
      ctx.save();
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
      return;
    }

    if (r.active) {
      ctx.save();
      // persistent cool overlay
      ctx.fillStyle = 'rgba(100, 120, 140, 0.15)';
      ctx.fillRect(0, 0, w, h);

      // animated streaks: thin lines angled ~15° right, falling at ~300px/s
      const angle = (15 * Math.PI) / 180;
      const dx = Math.sin(angle);
      const dy = Math.cos(angle);
      const t = this.time;
      const speed = 300;
      ctx.strokeStyle = 'rgba(180, 200, 220, 0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < 40; i++) {
        const len = 12 + ((i * 37) % 9); // 12–20px
        const baseX = ((i * 89) % 100) / 100 * (w + 40) - 20;
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
  _windActive(zone) {
    const phase = (this.time + zone.offset) % WIND_PERIOD;
    return phase < WIND_ON;
  }

  windForceAt(x, y) {
    for (const z of this.windZones) {
      if (x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h && this._windActive(z)) {
        return { x: Math.cos(z.dir) * WIND_FORCE, y: Math.sin(z.dir) * WIND_FORCE };
      }
    }
    return null;
  }

  speedFactorAt(x, y) {
    for (const w of this.webZones) {
      if (distance({ x, y }, w) <= w.radius) return 0.4;
    }
    return 1;
  }

  isInHiveZone(x, y) {
    return distance({ x, y }, this.hive) <= this.hive.radius;
  }

  /** Pad the bee is inside (for HP regen), or null. */
  isInSafePad(x, y) {
    for (const p of this.pads) {
      if (distance({ x, y }, p) <= p.radius) return p;
    }
    return null;
  }

  /** Whether a circle of `r` at (x,y) overlaps any pad (enemy avoidance). */
  pointInSafePad(x, y, r = 0) {
    for (const p of this.pads) {
      if (distance({ x, y }, p) <= p.radius + r) return true;
    }
    return false;
  }

  /**
   * Resolve a moving circle against thorn rectangles. Returns the corrected
   * position and whether a collision occurred (caller applies edge damage).
   */
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
        // Push out along the surface normal (deflect).
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
    // Base parchment across the whole world (cheap single fill).
    ctx.fillStyle = COLORS.parchment;
    ctx.fillRect(0, 0, WORLD_SIZE, WORLD_SIZE);

    // Ink-wash texture (visible blobs only).
    for (const b of this.washes) {
      if (!camera.isVisible(b.x, b.y, b.rx + b.ry, 40)) continue;
      washBlob(ctx, b.x, b.y, b.rx, b.ry, b.color, b.alpha, b.rot);
    }

    // Decorative botanicals.
    for (const d of this.decor) {
      if (!camera.isVisible(d.x, d.y, 30, 30)) continue;
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(d.rot);
      ctx.scale(d.scale, d.scale);
      if (d.type === 'grass') drawGrassTuft(ctx, 18, COLORS.green);
      else if (d.type === 'flower') drawFlower(ctx, 9, d.petals, d.color, COLORS.gold);
      else drawLeaf(ctx, 18, 7, COLORS.green);
      ctx.restore();
    }

    // World-edge ink frame so the boundary never reads as void.
    ctx.strokeStyle = rgba(COLORS.ink, 0.5);
    ctx.lineWidth = 6;
    ctx.strokeRect(0, 0, WORLD_SIZE, WORLD_SIZE);
  }

  drawHazards(ctx, camera, t) {
    // Spider webs.
    for (const w of this.webZones) {
      if (!camera.isVisible(w.x, w.y, w.radius, 20)) continue;
      ctx.save();
      ctx.translate(w.x, w.y);
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = rgba('#FFFFFF', 0.9);
      ctx.lineWidth = 1;
      // radial spokes
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * w.radius, Math.sin(a) * w.radius);
        ctx.stroke();
      }
      // concentric rings
      for (let r = 14; r < w.radius; r += 14) {
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Wind gusts.
    for (const z of this.windZones) {
      if (!camera.isVisible(z.x + z.w / 2, z.y + z.h / 2, Math.max(z.w, z.h), 20)) continue;
      const active = this._windActive(z);
      ctx.save();
      ctx.globalAlpha = active ? 0.22 + 0.08 * Math.sin(t * 6) : 0.06;
      ctx.fillStyle = COLORS.green;
      ctx.fillRect(z.x, z.y, z.w, z.h);
      // directional brush arrows
      ctx.globalAlpha = active ? 0.5 : 0.15;
      ctx.strokeStyle = rgba(COLORS.ink, 0.8);
      ctx.lineWidth = 2;
      const cx = z.x + z.w / 2;
      const cy = z.y + z.h / 2;
      const dx = Math.cos(z.dir);
      const dy = Math.sin(z.dir);
      for (let i = -1; i <= 1; i++) {
        const ox = cx - dy * i * 28;
        const oy = cy + dx * i * 28;
        ctx.beginPath();
        ctx.moveTo(ox - dx * 28, oy - dy * 28);
        ctx.lineTo(ox + dx * 28, oy + dy * 28);
        // arrowhead
        ctx.lineTo(ox + dx * 18 - dy * 8, oy + dy * 18 + dx * 8);
        ctx.moveTo(ox + dx * 28, oy + dy * 28);
        ctx.lineTo(ox + dx * 18 + dy * 8, oy + dy * 18 - dx * 8);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Thorns.
    for (const th of this.thorns) {
      if (!camera.isVisible(th.x + th.w / 2, th.y + th.h / 2, Math.max(th.w, th.h), 20)) continue;
      ctx.save();
      ctx.fillStyle = '#3A3526';
      ctx.strokeStyle = COLORS.ink;
      ctx.lineWidth = 1.5;
      ctx.fillRect(th.x, th.y, th.w, th.h);
      ctx.strokeRect(th.x, th.y, th.w, th.h);
      // bramble strokes
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
    // Safe pads — botanical rosette in green.
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

    // Hive — gold hexagon with ink comb.
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
      // inner comb cells
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
