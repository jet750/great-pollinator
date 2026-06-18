// Pollen pickup. Three types differ by value, size, and color.
// Floats gently; when it enters the bee's collection radius it flies to the bee
// over 300ms and is absorbed (adding its value to carried count).

import { COLORS, rgba } from '../../utils/renderer.js';
import { distance, lerp } from '../../utils/math.js';

const TYPES = {
  common: { value: 1, radius: 6, color: COLORS.gold },
  uncommon: { value: 3, radius: 9, color: COLORS.ember },
  rare: { value: 5, radius: 12, color: COLORS.crimson },
};

const COLLECT_TIME = 0.3; // s fly-to-bee

export class Pollen {
  constructor(x, y, type) {
    const def = TYPES[type] || TYPES.common;
    this.x = x;
    this.y = y;
    this.type = type;
    this.value = def.value;
    this.radius = def.radius;
    this.color = def.color;
    this.kind = 'pollen';

    this.collected = false;
    this._collecting = false;
    this._t = 0;
    this._fromX = x;
    this._fromY = y;
    this._phase = Math.random() * Math.PI * 2;
    this._floatY = 0;
  }

  update(dt, bee, time) {
    if (this.collected) return;

    // Gentle vertical float (±3px, 2s cycle).
    this._floatY = Math.sin(time * Math.PI + this._phase) * 3;

    if (this._collecting) {
      this._t += dt / COLLECT_TIME;
      const k = Math.min(1, this._t);
      this.x = lerp(this._fromX, bee.x, k);
      this.y = lerp(this._fromY, bee.y, k);
      if (k >= 1) {
        if (bee.addPollen(this.type)) {
          this.collected = true;
        } else {
          // Bee is at the hard cap — abandon collection, drop back.
          this._collecting = false;
          this._t = 0;
        }
      }
      return;
    }

    // Begin collection when within radius and the bee has room.
    if (
      bee.carriedValue + this.value <= 15 &&
      distance(this, bee) <= bee.collectionRadius
    ) {
      this._collecting = true;
      this._t = 0;
      this._fromX = this.x;
      this._fromY = this.y;
    }
  }

  draw(ctx) {
    if (this.collected) return;
    const y = this.y + (this._collecting ? 0 : this._floatY);
    ctx.save();
    ctx.translate(this.x, y);

    // soft glow
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius + 4, 0, Math.PI * 2);
    ctx.fill();

    // body
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = rgba(COLORS.ink, 0.7);
    ctx.stroke();

    // tiny highlight
    ctx.beginPath();
    ctx.arc(-this.radius * 0.3, -this.radius * 0.3, this.radius * 0.3, 0, Math.PI * 2);
    ctx.fillStyle = rgba('#FFFFFF', 0.5);
    ctx.fill();
    ctx.restore();
  }
}

export { TYPES as POLLEN_TYPES };
