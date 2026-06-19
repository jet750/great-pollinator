// Start screen. Rendered on canvas while top-level state is START.
// main.js starts the run on Enter (desktop) or any tap (mobile).

import { COLORS, FONTS, font, text, drawFlower, rgba } from '../utils/renderer.js';

function fitFont(ctx, str, family, maxSize, maxWidth, weight) {
  let size = maxSize;
  do {
    ctx.font = font(family, size, weight);
    if (ctx.measureText(str).width <= maxWidth) break;
    size -= 1;
  } while (size > 12);
  return size;
}

export const StartScreen = {
  draw(ctx, { w, h, isMobile, highScore, t }) {
    ctx.save();
    ctx.fillStyle = COLORS.parchment;
    ctx.fillRect(0, 0, w, h);

    // subtle wash texture
    for (let i = 0; i < 6; i++) {
      ctx.globalAlpha = 0.05;
      ctx.fillStyle = i % 2 ? COLORS.green : COLORS.gold;
      ctx.beginPath();
      ctx.ellipse(
        (w / 6) * i + 40,
        h * (0.2 + 0.12 * Math.sin(i)),
        120,
        70,
        i,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    const cx = w / 2;
    let y = h * 0.10; // start a bit higher

    // Title
    const titleSize = fitFont(ctx, 'THE GREAT POLLINATOR', FONTS.title, isMobile ? 34 : 42, w - 40, '700');
    text(ctx, 'THE GREAT POLLINATOR', cx, y, {
      fontStr: font(FONTS.title, titleSize, '700'),
      color: COLORS.ink,
    });
    y += titleSize + 8; // tighter gap — title to subtitle

    // Subtitle
    text(ctx, 'A Botanical Field Expedition', cx, y, {
      fontStr: `italic ${font(FONTS.body, 16)}`,
      color: rgba(COLORS.ink, 0.65),
    });
    y += 28; // subtitle to illustration gap

    // Illustration block — bee above the flower
    ctx.save();
    ctx.translate(cx, y + (isMobile ? 34 : 42));
    drawFlower(ctx, isMobile ? 34 : 42, 12, COLORS.gold, '#5A3D1F');
    ctx.translate(0, isMobile ? -50 : -60); // bee sits above flower, clear of subtitle
    ctx.fillStyle = COLORS.ink;
    ctx.beginPath();
    ctx.ellipse(0, 0, 9, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = rgba(COLORS.ink, 0.6);
    ctx.lineWidth = 1;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(side * 9, -3, 8, 4, side * 0.5, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    y += isMobile ? 86 : 100; // advance past illustration

    // Rules block with tighter line height and max width
    const rules = [
      'Collect pollen across the meadow and return to the hive to bank your haul.',
      'Approach enemies from behind to sting them. Frontal attacks cost you health.',
      'Land on glowing plants to activate power-ups. Use safe pads to recover.',
      'Spend pollen at the hive store to upgrade your colony.',
    ];
    ctx.save();
    ctx.font = font(FONTS.body, 13);
    ctx.fillStyle = rgba(COLORS.ink, 0.85);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const maxRuleW = Math.min(480, w - 60);
    for (let ri = 0; ri < rules.length; ri++) {
      const line = rules[ri];
      this._wrapped(ctx, line, cx, y, maxRuleW, 17);
      y += this._wrappedHeight(ctx, line, maxRuleW, 17) + 17; // 17px lineHeight + 17px gap between rules
    }
    ctx.restore();
    y += 4;

    // Audio enable prompt
    text(ctx, 'Tap anywhere to enable audio', cx, y + 6, {
      fontStr: font(FONTS.body, 11),
      color: rgba(COLORS.ink, 0.5),
    });
    y += 20;

    // High score (if present)
    if (highScore > 0) {
      text(ctx, `Your best: ${highScore} pollen banked`, cx, y, {
        fontStr: font(FONTS.body, 13, '600'),
        color: COLORS.gold,
      });
      y += 24;
    }

    // Press prompt (pulsing) — clamped to never go off-screen
    const pulse = 0.5 + 0.5 * Math.sin(t * 3);
    ctx.globalAlpha = 0.55 + 0.45 * pulse;
    text(ctx, isMobile ? 'TAP TO BEGIN' : 'PRESS ENTER TO BEGIN', cx, Math.min(y + 12, h - 30), {
      fontStr: font(FONTS.body, 14, '700'),
      color: COLORS.ink,
    });
    ctx.globalAlpha = 1;
    ctx.restore();
  },

  _splitLines(ctx, str, maxWidth) {
    const words = str.split(' ');
    const lines = [];
    let cur = '';
    for (const word of words) {
      const test = cur ? cur + ' ' + word : word;
      if (ctx.measureText(test).width > maxWidth && cur) {
        lines.push(cur);
        cur = word;
      } else {
        cur = test;
      }
    }
    if (cur) lines.push(cur);
    return lines;
  },

  _wrapped(ctx, str, cx, y, maxWidth, lineHeight) {
    const lines = this._splitLines(ctx, str, maxWidth);
    lines.forEach((ln, i) => ctx.fillText(ln, cx, y + i * lineHeight));
  },

  _wrappedHeight(ctx, str, maxWidth, lineHeight) {
    return (this._splitLines(ctx, str, maxWidth).length - 1) * lineHeight;
  },
};
