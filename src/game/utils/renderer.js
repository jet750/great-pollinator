// Shared rendering palette, fonts, and botanical drawing helpers.
// Keeps the Victorian botanical-illustration look consistent across every module.
// All visuals are drawn with the Canvas 2D API — no images, no external assets.

export const COLORS = {
  parchment: '#F0EBE2',
  ink: '#1C1209',
  gold: '#D4A83F', // common pollen / accents
  green: '#8AB87E', // environment / safe zones
  ember: '#C4714A', // uncommon pollen / damage
  crimson: '#8B2020', // rare pollen / danger
  lavender: '#7B6FA0', // lavender power-up
  obsidian: '#141210', // UI background
  // Working tints used for shading the illustration.
  inkSoft: 'rgba(28,18,9,0.55)',
  inkFaint: 'rgba(28,18,9,0.18)',
  parchmentSoft: '#E6DECF',
};

export const FONTS = {
  title: '"Cormorant Garamond", serif',
  body: '"Inter", sans-serif',
  mono: '"JetBrains Mono", monospace',
};

/** Convenience for sized font strings. */
export function font(family, size, weight = '') {
  return `${weight ? weight + ' ' : ''}${size}px ${family}`;
}

/** Draw centered text. align/baseline default to center/middle. */
export function text(ctx, str, x, y, { fontStr, color = COLORS.ink, align = 'center', baseline = 'middle', alpha = 1 } = {}) {
  ctx.save();
  ctx.globalAlpha = alpha;
  if (fontStr) ctx.font = fontStr;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.fillText(str, x, y);
  ctx.restore();
}

/** Rounded-rectangle path (does not fill/stroke). */
export function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Fill + ink stroke a rounded rect in one call. */
export function panel(ctx, x, y, w, h, { fill = COLORS.parchment, stroke = COLORS.ink, lineWidth = 2, radius = 8, alpha = 1 } = {}) {
  ctx.save();
  ctx.globalAlpha = alpha;
  roundRectPath(ctx, x, y, w, h, radius);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
  ctx.restore();
}

/** Soft watercolor blob — irregular low-opacity ellipse, for ink-wash texture. */
export function washBlob(ctx, x, y, rx, ry, color, alpha = 0.08, rot = 0) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Botanical flower drawn as radiating petals in naturalist-illustration style.
 * Centered at (0,0) in the current transform.
 */
export function drawFlower(ctx, radius, petalCount, petalColor, centerColor = COLORS.gold, { ink = true } = {}) {
  ctx.save();
  for (let i = 0; i < petalCount; i++) {
    const a = (i / petalCount) * Math.PI * 2;
    ctx.save();
    ctx.rotate(a);
    ctx.beginPath();
    // Teardrop petal via quadratic curves.
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(radius * 0.35, -radius * 0.5, 0, -radius);
    ctx.quadraticCurveTo(-radius * 0.35, -radius * 0.5, 0, 0);
    ctx.closePath();
    ctx.fillStyle = petalColor;
    ctx.globalAlpha = 0.92;
    ctx.fill();
    if (ink) {
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 1;
      ctx.strokeStyle = COLORS.ink;
      ctx.stroke();
    }
    ctx.restore();
  }
  // Center disc.
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.32, 0, Math.PI * 2);
  ctx.fillStyle = centerColor;
  ctx.fill();
  if (ink) {
    ctx.lineWidth = 1;
    ctx.strokeStyle = COLORS.ink;
    ctx.stroke();
  }
  ctx.restore();
}

/** Simple ink-line leaf shape, tip pointing up. Centered at base (0,0). */
export function drawLeaf(ctx, len, width, color = COLORS.green) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(width, -len * 0.5, 0, -len);
  ctx.quadraticCurveTo(-width, -len * 0.5, 0, 0);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.8;
  ctx.fill();
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = 1;
  ctx.strokeStyle = COLORS.ink;
  ctx.stroke();
  // midrib
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -len);
  ctx.stroke();
  ctx.restore();
}

/** Grass tuft of a few ink blades. Base at (0,0). */
export function drawGrassTuft(ctx, h, color = COLORS.green) {
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.4;
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(i * 4, -h * 0.6, i * 6, -h);
    ctx.stroke();
  }
  ctx.restore();
}

/** A glowing pulse ring (for available power-ups / interactables). */
export function drawPulseRing(ctx, x, y, baseRadius, color, t) {
  const pulse = 0.5 + 0.5 * Math.sin(t * 3);
  ctx.save();
  ctx.globalAlpha = 0.15 + 0.25 * pulse;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2 + 2 * pulse;
  ctx.beginPath();
  ctx.arc(x, y, baseRadius + pulse * 6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** Linearly blend two hex colors. t=0 → c1, t=1 → c2. */
export function mixHex(c1, c2, t) {
  const a = hexToRgb(c1);
  const b = hexToRgb(c2);
  const r = Math.round(a.r + (b.r - a.r) * t);
  const g = Math.round(a.g + (b.g - a.g) * t);
  const bl = Math.round(a.b + (b.b - a.b) * t);
  return `rgb(${r},${g},${bl})`;
}

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const num = parseInt(full, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

/** rgba() string from a hex color + alpha. */
export function rgba(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}
