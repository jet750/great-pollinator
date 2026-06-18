// Power-up plants. The bee lands by hovering within 40px and holding still for
// 0.5s; the effect fires on launch (main.js drives the landing handshake and
// applies the active effect). Timed plants recharge 30s after use.
//
// Phase 1 species: Sunflower, Lavender, Foxglove (timed buffs).
// Phase 2 rare species: Moonflower, Ironweed — instant, one-use, wilt when spent.

import { COLORS, drawFlower, rgba, drawPulseRing, mixHex } from '../../utils/renderer.js';

export const POWERUP_DEFS = {
  sunflower: { color: COLORS.gold, duration: 15, label: 'Sunflower' },
  lavender: { color: COLORS.lavender, duration: 12, label: 'Lavender' },
  foxglove: { color: COLORS.crimson, duration: 10, label: 'Foxglove' },
  moonflower: {
    id: 'moonflower',
    label: 'Moonflower',
    color: '#B8A0D4', // pale violet
    duration: 0, // instant use, no duration
    rarity: 'rare',
    oneUse: true, // does not recharge
    effect: 'instant_store', // opens hive store overlay without returning to hive
  },
  ironweed: {
    id: 'ironweed',
    label: 'Ironweed',
    color: '#6B8B3A', // olive green
    duration: 0, // instant use
    rarity: 'rare',
    oneUse: true,
    effect: 'full_heal', // restores hp to maxHp immediately
  },
};

const TRIGGER_RADIUS = 40;
const RECHARGE = 30; // s

export class PowerUpPlant {
  constructor(x, y, type) {
    const def = POWERUP_DEFS[type];
    this.x = x;
    this.y = y;
    this.type = type;
    this.color = def.color;
    this.duration = def.duration;
    this.effect = def.effect || null;
    this.rarity = def.rarity || 'common';
    this.oneUse = !!def.oneUse;
    this.radius = TRIGGER_RADIUS;
    this.kind = 'plant';

    this.available = true;
    this.spent = false; // one-use plants flip this permanently after activation
    this.rechargeTimer = 0;
  }

  update(dt) {
    if (this.spent) return; // wilted one-use plants never recharge
    if (!this.available) {
      this.rechargeTimer -= dt;
      if (this.rechargeTimer <= 0) {
        this.available = true;
        this.rechargeTimer = 0;
      }
    }
  }

  /** Called by main when the effect launches. */
  consume() {
    if (this.oneUse) {
      // Spent for the rest of the run: wilts, no pulse, no recharge.
      this.spent = true;
      this.available = false;
      return;
    }
    this.available = false;
    this.rechargeTimer = RECHARGE;
  }

  draw(ctx, t) {
    ctx.save();
    ctx.translate(this.x, this.y);

    if (this.spent) {
      this._drawWilted(ctx);
      ctx.restore();
      return;
    }

    if (this.available) {
      drawPulseRing(ctx, 0, 0, 26, this.color, t);
    } else {
      ctx.globalAlpha = 0.45; // dimmed while recharging
    }

    // stem
    ctx.strokeStyle = '#4F6B3A';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 30);
    ctx.lineTo(0, 4);
    ctx.stroke();

    switch (this.type) {
      case 'sunflower':
        drawFlower(ctx, 22, 16, COLORS.gold, '#5A3D1F');
        break;
      case 'lavender':
        this._drawLavender(ctx);
        break;
      case 'foxglove':
        this._drawFoxglove(ctx);
        break;
      case 'moonflower':
        drawFlower(ctx, 20, 8, this.color, '#F0EBE2');
        break;
      case 'ironweed':
        this._drawIronweed(ctx);
        break;
      default:
        break;
    }
    ctx.restore();
  }

  /** Drooped, desaturated stem drawn once a one-use plant has been spent. */
  _drawWilted(ctx) {
    const gray = '#8A847C';
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = '#5A554E';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    // drooping stem curving over to one side
    ctx.beginPath();
    ctx.moveTo(0, 30);
    ctx.quadraticCurveTo(0, 8, 12, 6);
    ctx.stroke();
    // wilted head (desaturated, drooping)
    ctx.fillStyle = gray;
    ctx.strokeStyle = rgba(COLORS.ink, 0.4);
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      ctx.save();
      ctx.translate(12, 6);
      ctx.rotate(0.5 + i * 0.5);
      ctx.beginPath();
      ctx.ellipse(0, 6, 3, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  /** Olive-green ironweed: a small cluster of star florets atop the stem. */
  _drawIronweed(ctx) {
    ctx.save();
    ctx.translate(0, -2);
    ctx.fillStyle = this.color;
    ctx.strokeStyle = rgba(COLORS.ink, 0.5);
    ctx.lineWidth = 1;
    const spots = [
      [0, -6],
      [-6, 0],
      [6, 0],
      [-3, 6],
      [3, 6],
    ];
    for (const [sx, sy] of spots) {
      ctx.save();
      ctx.translate(sx, sy);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * 4, Math.sin(a) * 4);
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = this.color;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(0, 0, 2, 0, Math.PI * 2);
      ctx.fillStyle = mixHex(this.color, COLORS.ink, 0.3);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  _drawLavender(ctx) {
    ctx.save();
    ctx.translate(0, -4);
    ctx.fillStyle = COLORS.lavender;
    ctx.strokeStyle = rgba(COLORS.ink, 0.5);
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      const y = -i * 6;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(side * 4, y, 3.5, 5, side * 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  _drawFoxglove(ctx) {
    ctx.save();
    ctx.fillStyle = COLORS.crimson;
    ctx.strokeStyle = rgba(COLORS.ink, 0.5);
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      const y = -2 - i * 7;
      const side = i % 2 === 0 ? -1 : 1;
      ctx.save();
      ctx.translate(side * 6, y);
      ctx.beginPath();
      ctx.ellipse(0, 0, 5, 7, side * 0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // bell mouth
      ctx.beginPath();
      ctx.arc(0, 5, 3, 0, Math.PI * 2);
      ctx.fillStyle = rgba('#FFFFFF', 0.4);
      ctx.fill();
      ctx.fillStyle = COLORS.crimson;
      ctx.restore();
    }
    ctx.restore();
  }

  // ---- HUD icon (shared with HUD power-up slot) ----
  static drawIcon(ctx, type, x, y, size) {
    ctx.save();
    ctx.translate(x, y);
    const r = size / 2;
    switch (type) {
      case 'sunflower': {
        ctx.strokeStyle = COLORS.gold;
        ctx.lineWidth = 2;
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55);
          ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.4, 0, Math.PI * 2);
        ctx.fillStyle = COLORS.gold;
        ctx.fill();
        break;
      }
      case 'lavender': {
        ctx.fillStyle = COLORS.lavender;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.ellipse((i - 1) * r * 0.5, 0, r * 0.22, r * 0.7, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case 'foxglove': {
        ctx.fillStyle = COLORS.crimson;
        ctx.beginPath();
        ctx.moveTo(0, -r);
        ctx.quadraticCurveTo(r * 0.7, -r * 0.3, r * 0.4, r);
        ctx.lineTo(-r * 0.4, r);
        ctx.quadraticCurveTo(-r * 0.7, -r * 0.3, 0, -r);
        ctx.fill();
        break;
      }
      default:
        break;
    }
    ctx.restore();
  }
}
