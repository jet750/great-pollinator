// Game over screen. Rendered on canvas while top-level state is GAMEOVER.
// "Try Again" restarts the run (keeps upgrades + banked total).
// "New Game" opens a canvas confirm dialog before a full progress reset.

import { COLORS, FONTS, font, text, panel, rgba } from '../utils/renderer.js';

export class GameOverScreen {
  constructor() {
    this.confirming = false;
    this._buttons = [];
  }

  reset() {
    this.confirming = false;
  }

  _btn(id, x, y, w, h) {
    this._buttons.push({ id, x, y, w, h });
  }

  /** Returns an intent ('again' | 'newgame' | 'confirm-yes' | 'confirm-no') or null. */
  hitTest(px, py) {
    for (const b of this._buttons) {
      if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) {
        if (b.id === 'newgame') {
          this.confirming = true;
          return { action: 'open-confirm' };
        }
        if (b.id === 'confirm-no') {
          this.confirming = false;
          return { action: 'cancel-confirm' };
        }
        return { action: b.id };
      }
    }
    return null;
  }

  draw(ctx, { w, h, runScore, highScore, isNewRecord }) {
    this._buttons = [];
    ctx.save();
    ctx.fillStyle = COLORS.obsidian;
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2;
    let y = h * 0.16;

    // Wilted flower illustration (drooping petals, ink-line).
    ctx.save();
    ctx.translate(cx, y);
    ctx.strokeStyle = rgba(COLORS.parchment, 0.6);
    ctx.lineWidth = 2;
    // drooping stem
    ctx.beginPath();
    ctx.moveTo(0, 50);
    ctx.quadraticCurveTo(10, 10, 0, -10);
    ctx.stroke();
    // drooping petals
    ctx.fillStyle = rgba(COLORS.ember, 0.5);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      ctx.save();
      ctx.rotate(a + 0.4);
      ctx.beginPath();
      ctx.moveTo(0, -10);
      ctx.quadraticCurveTo(8, -2, 4, 20);
      ctx.quadraticCurveTo(-2, 4, 0, -10);
      ctx.fill();
      ctx.strokeStyle = rgba(COLORS.parchment, 0.4);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }
    ctx.beginPath();
    ctx.arc(0, -10, 7, 0, Math.PI * 2);
    ctx.fillStyle = rgba(COLORS.gold, 0.5);
    ctx.fill();
    ctx.restore();
    y += 96;

    text(ctx, 'EXPEDITION ENDED', cx, y, {
      fontStr: font(FONTS.title, 36, '600'),
      color: COLORS.parchment,
    });
    y += 44;

    text(ctx, `Pollen Banked: ${runScore}`, cx, y, {
      fontStr: font(FONTS.mono, 22, '700'),
      color: COLORS.gold,
    });
    y += 32;

    text(ctx, `All-Time Record: ${highScore}`, cx, y, {
      fontStr: font(FONTS.body, 14),
      color: rgba(COLORS.gold, 0.6),
    });
    y += 28;

    if (isNewRecord) {
      panel(ctx, cx - 70, y - 4, 140, 26, { fill: rgba(COLORS.crimson, 0.85), stroke: COLORS.crimson, lineWidth: 1, radius: 13 });
      text(ctx, 'NEW RECORD', cx, y + 9, {
        fontStr: font(FONTS.body, 13, '700'),
        color: COLORS.parchment,
      });
      y += 44;
    } else {
      y += 16;
    }

    // Try Again
    const bw = 200;
    const bx = cx - bw / 2;
    panel(ctx, bx, y, bw, 42, { fill: COLORS.parchment, stroke: COLORS.ink, lineWidth: 2, radius: 8 });
    text(ctx, 'TRY AGAIN', cx, y + 21, {
      fontStr: font(FONTS.title, 18, '600'),
      color: COLORS.ink,
    });
    this._btn('again', bx, y, bw, 42);
    y += 50;

    // Perennial cross-link — opens the card-game page in a new tab.
    text(ctx, 'Explore the Perennial card game →', cx, y, {
      fontStr: font(FONTS.body, 12),
      color: COLORS.gold,
    });
    this._btn('perennial', cx - 130, y - 12, 260, 24);
    y += 38;

    // New Game (full reset)
    text(ctx, 'New Game (resets all progress)', cx, y, {
      fontStr: font(FONTS.body, 12),
      color: rgba(COLORS.parchment, 0.55),
    });
    this._btn('newgame', cx - 120, y - 12, 240, 24);

    // Sprint attribution — the portfolio signal, visible in end-screen shots.
    text(ctx, 'Built in 2 days · The Great Pollinator v1.0 · jaxontravis.com', cx, h - 24, {
      fontStr: font(FONTS.body, 10),
      color: 'rgba(240,235,226,0.45)',
    });

    // Confirm dialog overlay
    if (this.confirming) {
      ctx.fillStyle = rgba(COLORS.obsidian, 0.8);
      ctx.fillRect(0, 0, w, h);
      const dw = Math.min(340, w - 40);
      const dh = 170;
      const dx = (w - dw) / 2;
      const dy = (h - dh) / 2;
      panel(ctx, dx, dy, dw, dh, { fill: COLORS.parchment, stroke: COLORS.ink, lineWidth: 3, radius: 12 });
      text(ctx, 'Are you sure?', w / 2, dy + 36, {
        fontStr: font(FONTS.title, 22, '600'),
        color: COLORS.ink,
      });
      text(ctx, 'All progress will be lost.', w / 2, dy + 66, {
        fontStr: font(FONTS.body, 13),
        color: rgba(COLORS.ink, 0.7),
      });
      const yesW = 100;
      const gap = 20;
      const yesX = w / 2 - yesW - gap / 2;
      const noX = w / 2 + gap / 2;
      const byy = dy + dh - 56;
      panel(ctx, yesX, byy, yesW, 38, { fill: rgba(COLORS.crimson, 0.85), stroke: COLORS.ink, lineWidth: 2, radius: 8 });
      text(ctx, 'YES', yesX + yesW / 2, byy + 19, { fontStr: font(FONTS.body, 15, '700'), color: COLORS.parchment });
      this._btn('confirm-yes', yesX, byy, yesW, 38);
      panel(ctx, noX, byy, yesW, 38, { fill: rgba(COLORS.green, 0.4), stroke: COLORS.ink, lineWidth: 2, radius: 8 });
      text(ctx, 'NO', noX + yesW / 2, byy + 19, { fontStr: font(FONTS.body, 15, '700'), color: COLORS.ink });
      this._btn('confirm-no', noX, byy, yesW, 38);
    }

    ctx.restore();
  }
}
