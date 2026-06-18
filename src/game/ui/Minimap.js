// Inset minimap of the full 3200×3200 world.
// Shows player, hive, and safe pads, with a fog-of-war layer that hides
// unexplored regions and reveals them as the player travels.
//
// The fog is composited on an offscreen canvas: we fill it solid, then punch
// circular reveal holes with `destination-out`, then draw the fogged layer over
// the base map. This honours the "fog rect + destination-out reveal" technique
// without erasing the live game world drawn beneath the minimap.

import { COLORS, rgba, panel } from '../utils/renderer.js';

const WORLD_SIZE = 3200;
const TRACK_MIN_DIST = 50; // only record a new point after moving this far (world px)
const REVEAL_RADIUS = 14; // minimap px (~370 world px of visibility)
const FOG_COLOR = 'rgba(28, 18, 9, 0.82)';

export class Minimap {
  static SIZE = 120;

  constructor() {
    this.fogVisited = []; // array of {x, y} world coordinates the player has visited
    this._last = null; // last recorded point (throttling)
    this._fog = null; // offscreen fog canvas (lazy)
    this._fogSize = 0;
  }

  /** Replace the visited set (e.g. when restoring from saved progress). */
  loadFog(points) {
    this.fogVisited = Array.isArray(points)
      ? points.filter((p) => p && typeof p.x === 'number' && typeof p.y === 'number')
      : [];
    this._last = null;
  }

  /** Record the player's world position, throttled to keep the array small. */
  trackPosition(x, y) {
    if (this._last) {
      const dx = x - this._last.x;
      const dy = y - this._last.y;
      if (dx * dx + dy * dy < TRACK_MIN_DIST * TRACK_MIN_DIST) return;
    }
    const point = { x, y };
    this.fogVisited.push(point);
    this._last = point;
  }

  _ensureFogCanvas(size) {
    if (!this._fog || this._fogSize !== size) {
      this._fog = document.createElement('canvas');
      this._fog.width = size;
      this._fog.height = size;
      this._fogSize = size;
    }
    return this._fog;
  }

  draw(ctx, { bee, meadow, x, y, size = 120 }) {
    const scale = size / meadow.WORLD_SIZE;
    ctx.save();
    panel(ctx, x, y, size, size, {
      fill: rgba(COLORS.obsidian, 0.7),
      stroke: COLORS.ink,
      lineWidth: 2,
      radius: 6,
    });

    // clip to the map rect
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, size, size);
    ctx.clip();

    // ---- base map (drawn first; fog is composited on top) ----
    // pads
    for (const p of meadow.pads) {
      ctx.beginPath();
      ctx.arc(x + p.x * scale, y + p.y * scale, Math.max(3, p.radius * scale), 0, Math.PI * 2);
      ctx.fillStyle = rgba(COLORS.green, 0.8);
      ctx.fill();
    }

    // hive hexagon outline
    const hx = x + meadow.hive.x * scale;
    const hy = y + meadow.hive.y * scale;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      const px = hx + Math.cos(a) * 5;
      const py = hy + Math.sin(a) * 5;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.strokeStyle = COLORS.gold;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // ---- fog layer (offscreen): solid fog with reveal holes punched out ----
    const fog = this._ensureFogCanvas(size);
    const fctx = fog.getContext('2d');
    fctx.clearRect(0, 0, size, size);
    fctx.fillStyle = FOG_COLOR;
    fctx.fillRect(0, 0, size, size);
    fctx.save();
    fctx.globalCompositeOperation = 'destination-out';
    for (const p of this.fogVisited) {
      fctx.beginPath();
      fctx.arc(p.x * scale, p.y * scale, REVEAL_RADIUS, 0, Math.PI * 2);
      fctx.fill();
    }
    fctx.restore();
    ctx.drawImage(fog, x, y);

    // player gold dot (always visible, above the fog)
    ctx.beginPath();
    ctx.arc(x + bee.x * scale, y + bee.y * scale, 3, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.gold;
    ctx.fill();
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.restore();
    ctx.restore();
  }
}

export { WORLD_SIZE };
