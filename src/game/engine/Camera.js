// Camera that follows the player with soft lag and clamps to world bounds,
// so the parchment void beyond the meadow never shows.

import { clamp, smoothLerp } from '../utils/math.js';

const FOLLOW_LERP = 0.08;

export class Camera {
  constructor(viewportWidth, viewportHeight, worldWidth, worldHeight) {
    this.vw = viewportWidth;
    this.vh = viewportHeight;
    this.worldWidth = worldWidth;
    this.worldHeight = worldHeight;
    // Top-left of the viewport in world space.
    this.x = 0;
    this.y = 0;
  }

  /** Update viewport size (e.g. on resize / orientation change). */
  resize(viewportWidth, viewportHeight) {
    this.vw = viewportWidth;
    this.vh = viewportHeight;
  }

  /** Smoothly center on a target world point, clamped to world bounds. */
  follow(targetX, targetY, dt) {
    const desiredX = targetX - this.vw / 2;
    const desiredY = targetY - this.vh / 2;
    this.x = smoothLerp(this.x, desiredX, FOLLOW_LERP, dt);
    this.y = smoothLerp(this.y, desiredY, FOLLOW_LERP, dt);
    this._clamp();
  }

  /** Snap immediately to a target (used on spawn / restart). */
  snapTo(targetX, targetY) {
    this.x = targetX - this.vw / 2;
    this.y = targetY - this.vh / 2;
    this._clamp();
  }

  _clamp() {
    const maxX = Math.max(0, this.worldWidth - this.vw);
    const maxY = Math.max(0, this.worldHeight - this.vh);
    this.x = clamp(this.x, 0, maxX);
    this.y = clamp(this.y, 0, maxY);
  }

  worldToScreen(worldX, worldY) {
    return { x: worldX - this.x, y: worldY - this.y };
  }

  screenToWorld(screenX, screenY) {
    return { x: screenX + this.x, y: screenY + this.y };
  }

  /** Translate the context so world-space draws land in the right place. */
  apply(ctx) {
    ctx.save();
    ctx.translate(-Math.round(this.x), -Math.round(this.y));
  }

  /** Undo apply(); restores the identity translate for HUD rendering. */
  reset(ctx) {
    ctx.restore();
  }

  /** True if a world-space circle is within (or near) the viewport. */
  isVisible(worldX, worldY, radius = 0, margin = 0) {
    return (
      worldX + radius >= this.x - margin &&
      worldX - radius <= this.x + this.vw + margin &&
      worldY + radius >= this.y - margin &&
      worldY - radius <= this.y + this.vh + margin
    );
  }
}
