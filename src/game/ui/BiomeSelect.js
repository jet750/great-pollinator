// Biome Select screen — rendered between START and PLAYING.
// Presents four "expedition doors" in a 2×2 grid. Only the Meadow is playable
// in Phase 2; Forest / Garden / Greenhouse are shown with a "COMING SOON" badge
// and open a brief "under construction" overlay on click.
//
// main.js drives this: setPointer() feeds hover, draw() renders, hitTest()
// returns an intent ({ action: 'play', biome } for Meadow) on click/tap.
//
// TODO(Phase 3): remove COMING SOON badges and wire the remaining biomes.

import { COLORS, FONTS, font, text, panel, roundRectPath, rgba, drawFlower, drawLeaf } from '../utils/renderer.js';

const BIOMES = [
  { id: 'meadow', name: 'Meadow', threat: 1, border: '#8AB87E', swatches: ['#8AB87E', '#D4A83F', '#F0EBE2'], locked: false },
  { id: 'forest', name: 'Forest', threat: 2, border: '#3D5A3E', swatches: ['#3D5A3E', '#C4714A', '#D9CFC4'], locked: true },
  { id: 'garden', name: 'Garden', threat: 3, border: '#D4928A', swatches: ['#D4928A', '#C4714A', '#F5F0E8'], locked: true },
  { id: 'greenhouse', name: 'Greenhouse', threat: 4, border: '#5A7A5A', swatches: ['#5A7A5A', '#B8D4C8', '#2A3A2A'], locked: true },
];

const GAP = 20;

export class BiomeSelect {
  constructor() {
    this._buttons = []; // { id, x, y, w, h, data } recorded each draw
    this._pointer = { x: -1, y: -1 };
    this.hover = null; // hovered biome id
    this.lockedOverlay = null; // biome id whose "under construction" overlay is open
  }

  reset() {
    this.lockedOverlay = null;
    this.hover = null;
  }

  setPointer(x, y) {
    this._pointer = { x, y };
  }

  update() {
    // Hover is recomputed from the recorded door rects each draw; nothing else
    // is time-driven here.
  }

  _btn(id, x, y, w, h, data) {
    this._buttons.push({ id, x, y, w, h, data });
  }

  /** Returns an intent ({ action: 'play', biome }) or null (handled internally). */
  hitTest(px, py) {
    // While the construction overlay is open, only its Return button responds.
    if (this.lockedOverlay) {
      for (const b of this._buttons) {
        if (b.id === 'overlay-return' && this._inside(b, px, py)) {
          this.lockedOverlay = null;
          return null;
        }
      }
      return null;
    }
    for (const b of this._buttons) {
      if (b.id === 'door' && this._inside(b, px, py)) {
        const biome = BIOMES.find((x) => x.id === b.data);
        if (biome.locked) {
          this.lockedOverlay = biome.id;
          return null;
        }
        return { action: 'play', biome: biome.id };
      }
    }
    return null;
  }

  _inside(b, px, py) {
    return px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h;
  }

  _layout(w, h) {
    const doorW = Math.min(180, (w - GAP * 3) / 2);
    const doorH = Math.min(220, doorW * (220 / 180));
    const gridW = doorW * 2 + GAP;
    const gridH = doorH * 2 + GAP;
    const startX = (w - gridW) / 2;
    const startY = Math.min(h * 0.27, h - gridH - 24);
    const rects = [];
    BIOMES.forEach((biome, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      rects.push({
        biome,
        x: startX + col * (doorW + GAP),
        y: startY + row * (doorH + GAP),
        w: doorW,
        h: doorH,
      });
    });
    return rects;
  }

  draw(ctx, w, h) {
    this._buttons = [];

    // background
    ctx.save();
    ctx.fillStyle = COLORS.parchment;
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2;
    text(ctx, 'CHOOSE YOUR EXPEDITION', cx, h * 0.1, {
      fontStr: font(FONTS.title, 28, '600'),
      color: COLORS.ink,
    });
    text(ctx, 'Each biome offers different threats and rewards.', cx, h * 0.1 + 28, {
      fontStr: font(FONTS.body, 13),
      color: rgba(COLORS.ink, 0.6),
    });

    const rects = this._layout(w, h);

    // recompute hover from the current pointer
    this.hover = null;
    if (!this.lockedOverlay) {
      for (const r of rects) {
        if (this._inside(r, this._pointer.x, this._pointer.y)) this.hover = r.biome.id;
      }
    }

    for (const r of rects) {
      this._drawDoor(ctx, r);
      this._btn('door', r.x, r.y, r.w, r.h, r.biome.id);
    }

    if (this.lockedOverlay) this._drawLockedOverlay(ctx, w, h);

    ctx.restore();
  }

  _drawDoor(ctx, r) {
    const { biome } = r;
    const hovered = this.hover === biome.id;

    ctx.save();
    if (hovered) {
      // subtle scale-up around the door's center
      const sc = 1.04;
      const ccx = r.x + r.w / 2;
      const ccy = r.y + r.h / 2;
      ctx.translate(ccx, ccy);
      ctx.scale(sc, sc);
      ctx.translate(-ccx, -ccy);
    }

    // panel
    panel(ctx, r.x, r.y, r.w, r.h, {
      fill: rgba(COLORS.parchmentSoft, 1),
      stroke: hovered ? biome.border : rgba(biome.border, 0.7),
      lineWidth: hovered ? 3.5 : 2.5,
      radius: 12,
    });

    const cx = r.x + r.w / 2;

    // biome name
    text(ctx, biome.name, cx, r.y + 28, {
      fontStr: font(FONTS.title, 20, '600'),
      color: COLORS.ink,
    });

    // threat dots
    this._drawThreatDots(ctx, cx, r.y + 50, biome);

    // botanical illustration (mid-panel)
    ctx.save();
    ctx.translate(cx, r.y + r.h * 0.55);
    this._drawBotanical(ctx, biome.id);
    ctx.restore();

    // palette swatch strip
    this._drawSwatches(ctx, cx, r.y + r.h - 46, biome);

    // lock badge
    if (biome.locked) {
      const bw = r.w - 24;
      const bx = r.x + 12;
      const by = r.y + r.h - 26;
      panel(ctx, bx, by, bw, 18, {
        fill: rgba(COLORS.crimson, 0.12),
        stroke: rgba(COLORS.crimson, 0.5),
        lineWidth: 1,
        radius: 5,
      });
      text(ctx, '⚠ COMING SOON', cx, by + 9, {
        fontStr: font(FONTS.body, 10, '700'),
        color: COLORS.crimson,
      });
    } else {
      text(ctx, 'ENTER →', cx, r.y + r.h - 16, {
        fontStr: font(FONTS.body, 11, '700'),
        color: biome.border,
      });
    }

    ctx.restore();
  }

  _drawThreatDots(ctx, cx, y, biome) {
    const n = 4;
    const spacing = 14;
    const startX = cx - ((n - 1) * spacing) / 2;
    for (let i = 0; i < n; i++) {
      ctx.beginPath();
      ctx.arc(startX + i * spacing, y, 4, 0, Math.PI * 2);
      if (i < biome.threat) {
        ctx.fillStyle = biome.border;
        ctx.fill();
      } else {
        ctx.strokeStyle = rgba(COLORS.ink, 0.4);
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
    }
  }

  _drawSwatches(ctx, cx, y, biome) {
    const sw = 22;
    const sh = 12;
    const total = biome.swatches.length * sw + (biome.swatches.length - 1) * 4;
    let x = cx - total / 2;
    for (const c of biome.swatches) {
      ctx.fillStyle = c;
      roundRectPath(ctx, x, y, sw, sh, 3);
      ctx.fill();
      ctx.strokeStyle = rgba(COLORS.ink, 0.3);
      ctx.lineWidth = 1;
      ctx.stroke();
      x += sw + 4;
    }
  }

  // Simple canvas-path botanicals, one per biome.
  _drawBotanical(ctx, id) {
    switch (id) {
      case 'meadow': {
        // flower cluster
        for (const [dx, dy, r] of [[-14, 4, 11], [14, 4, 11], [0, -8, 13]]) {
          ctx.save();
          ctx.translate(dx, dy);
          drawFlower(ctx, r, 8, COLORS.gold, '#5A3D1F');
          ctx.restore();
        }
        break;
      }
      case 'forest': {
        // leaf cluster
        for (const rot of [-0.5, 0, 0.5]) {
          ctx.save();
          ctx.rotate(rot);
          drawLeaf(ctx, 28, 10, '#3D5A3E');
          ctx.restore();
        }
        break;
      }
      case 'garden': {
        // a stylized rose (concentric petal arcs)
        ctx.save();
        for (let ring = 3; ring >= 1; ring--) {
          ctx.beginPath();
          ctx.arc(0, 0, ring * 6, 0, Math.PI * 2);
          ctx.fillStyle = rgba('#D4928A', 0.35 + (3 - ring) * 0.2);
          ctx.fill();
          ctx.strokeStyle = rgba(COLORS.ink, 0.35);
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        ctx.restore();
        break;
      }
      case 'greenhouse': {
        // broad tropical leaf with central rib + veins
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(0, 20);
        ctx.quadraticCurveTo(22, 0, 0, -24);
        ctx.quadraticCurveTo(-22, 0, 0, 20);
        ctx.closePath();
        ctx.fillStyle = rgba('#5A7A5A', 0.85);
        ctx.fill();
        ctx.strokeStyle = COLORS.ink;
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.strokeStyle = rgba(COLORS.ink, 0.5);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, 18);
        ctx.lineTo(0, -22);
        for (let i = -3; i <= 3; i++) {
          ctx.moveTo(0, i * 5);
          ctx.lineTo(i * 3, i * 5 - 8);
        }
        ctx.stroke();
        ctx.restore();
        break;
      }
      default:
        break;
    }
  }

  _drawLockedOverlay(ctx, w, h) {
    ctx.save();
    ctx.fillStyle = rgba(COLORS.obsidian, 0.78);
    ctx.fillRect(0, 0, w, h);

    const dw = Math.min(340, w - 40);
    const dh = 180;
    const dx = (w - dw) / 2;
    const dy = (h - dh) / 2;
    panel(ctx, dx, dy, dw, dh, { fill: COLORS.parchment, stroke: COLORS.ink, lineWidth: 3, radius: 12 });

    const biome = BIOMES.find((b) => b.id === this.lockedOverlay);
    text(ctx, biome ? biome.name : 'Biome', w / 2, dy + 38, {
      fontStr: font(FONTS.title, 24, '600'),
      color: COLORS.ink,
    });
    text(ctx, 'This biome is under construction.', w / 2, dy + 74, {
      fontStr: font(FONTS.body, 13),
      color: rgba(COLORS.ink, 0.7),
    });

    const bw = 150;
    const bx = w / 2 - bw / 2;
    const by = dy + dh - 54;
    panel(ctx, bx, by, bw, 38, { fill: rgba(COLORS.gold, 0.3), stroke: COLORS.ink, lineWidth: 2, radius: 8 });
    text(ctx, '← Return', w / 2, by + 19, {
      fontStr: font(FONTS.title, 17, '600'),
      color: COLORS.ink,
    });
    this._btn('overlay-return', bx, by, bw, 38);

    ctx.restore();
  }
}
