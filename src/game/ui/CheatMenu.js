// Dev cheat menu — toggled by ` (backtick) on desktop or 7 rapid attack taps on mobile.
// Renders as a full-canvas overlay. Game continues running underneath.
// All cheat actions mutate progress directly via a callback: onCheat(action).

import { COLORS, FONTS, font, text, panel, rgba } from '../utils/renderer.js';

const ACTIONS = [
  { id: 'biome_meadow',      label: 'Switch → Meadow',        sub: 'set active biome' },
  { id: 'biome_forest',      label: 'Switch → Forest',        sub: 'unlock + set active' },
  { id: 'biome_garden',      label: 'Switch → Garden',        sub: 'unlock + set active' },
  { id: 'biome_greenhouse',  label: 'Switch → Greenhouse',    sub: 'unlock + set active' },
  { id: 'pollen_500',        label: '+500 Banked Pollen',     sub: 'added to banked + lifetime' },
  { id: 'pollen_2000',       label: '+2000 Banked Pollen',    sub: 'added to banked + lifetime' },
  { id: 'max_upgrades',      label: 'Max All Upgrades',       sub: 'active craft → biome cap' },
  { id: 'unlock_all_crafts', label: 'Unlock All Crafts',      sub: 'marks all crafts purchased' },
  { id: 'full_heal',         label: 'Full Heal',              sub: 'restore HP to max' },
  { id: 'kill_score_reset',  label: 'Reset Kill Score',       sub: 'sets killScore to 0' },
  { id: 'reset_progress',    label: '⚠ RESET ALL PROGRESS',   sub: 'wipes save — cannot undo' },
];

export class CheatMenu {
  constructor() {
    this._btns = [];
  }

  // Returns true if (x, y) hits a button. Calls onCheat with the action id and closes.
  hitTest(x, y, onCheat) {
    for (const b of this._btns) {
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
        onCheat(b.id);
        return true;
      }
    }
    return false;
  }

  draw(ctx, { w, h }) {
    this._btns = [];

    // Dark scrim behind the panel
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.fillRect(0, 0, w, h);

    // Panel
    const pw = Math.min(420, w - 40);
    const ph = Math.min(580, h - 40);
    const px = (w - pw) / 2;
    const py = (h - ph) / 2;
    panel(ctx, px, py, pw, ph, { fill: COLORS.parchment, stroke: '#C0392B', lineWidth: 3, radius: 12 });

    // Header
    text(ctx, '⚙ DEV MENU', px + pw / 2, py + 22, {
      fontStr: font(FONTS.title, 18, '700'),
      color: '#C0392B',
    });
    text(ctx, 'Changes take effect immediately', px + pw / 2, py + 40, {
      fontStr: font(FONTS.body, 11),
      color: rgba(COLORS.ink, 0.5),
    });

    // Divider
    ctx.strokeStyle = rgba(COLORS.ink, 0.15);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px + 16, py + 52);
    ctx.lineTo(px + pw - 16, py + 52);
    ctx.stroke();

    // Action buttons — 2 columns
    const cols = 2;
    const colGap = 16;
    const btnW = (pw - 48) / cols;
    const btnH = 44;
    const startY = py + 62;

    ACTIONS.forEach((a, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const bx = px + 16 + col * (btnW + colGap);
      const by = startY + row * (btnH + 8);

      // Highlight reset button differently
      const isDanger = a.id === 'reset_progress';
      const fill = isDanger ? 'rgba(192,57,43,0.12)' : rgba(COLORS.parchment, 0.8);
      const stroke = isDanger ? '#C0392B' : rgba(COLORS.ink, 0.25);

      panel(ctx, bx, by, btnW, btnH, { fill, stroke, lineWidth: isDanger ? 2 : 1, radius: 6 });

      text(ctx, a.label, bx + btnW / 2, by + 14, {
        fontStr: font(FONTS.body, 12, '600'),
        color: isDanger ? '#C0392B' : COLORS.ink,
      });
      text(ctx, a.sub, bx + btnW / 2, by + 30, {
        fontStr: font(FONTS.body, 10),
        color: rgba(COLORS.ink, 0.5),
      });

      this._btns.push({ id: a.id, x: bx, y: by, w: btnW, h: btnH });
    });

    // Close hint
    const hintY = py + ph - 18;
    text(ctx, '` to close  |  tap outside to close', px + pw / 2, hintY, {
      fontStr: font(FONTS.body, 10),
      color: rgba(COLORS.ink, 0.4),
    });

    ctx.restore();
  }
}
