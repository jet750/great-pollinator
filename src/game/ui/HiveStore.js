// Full-canvas hive overlay with three tabs: BANK, STORE, HANGAR.
// Rendering records clickable button rects; main.js calls hitTest() on a
// pointer event and executes the returned intent (deposit / buy / tab / exit).
// The store itself holds no game state beyond the active tab.

import { COLORS, FONTS, font, text, panel, rgba } from '../utils/renderer.js';

// Upgrade catalog. `kind: 'level'` items cap at `max`; healing items add stock.
export const UPGRADES = [
  { id: 'maxHp', name: 'Max HP +10', cost: 15, max: 5, kind: 'level', desc: '+10 max HP per level' },
  { id: 'damageReduction', name: 'Damage Reduction', cost: 10, max: 5, kind: 'level', formula: '×0.95 per level (stacking)' },
  { id: 'attackBoost', name: 'Attack Boost', cost: 10, max: 5, kind: 'level', formula: '+×0.05 per level (max ×1.25)' },
  { id: 'heal1', name: 'Healing Item ×1', cost: 8, kind: 'heal', amount: 1, desc: 'max 3 held' },
  { id: 'heal3', name: 'Healing Item ×3', cost: 20, kind: 'heal', amount: 3, desc: 'if space allows' },
];

// Craft catalog for the Hangar tab. The Bee is always available (cost 0);
// Moth and Locust are unlocked with banked pollen. Costs are deducted from the
// banked total in main.js.
export const CRAFTS = [
  { id: 'bee', name: 'Bee', hp: '100–150', speed: 180, capacity: 10, cost: 0, special: 'Rear-sting dash. Balanced collector with the highest capacity.' },
  { id: 'moth', name: 'Moth', hp: 80, speed: 220, capacity: 5, cost: 50, special: 'Frontal consume pulse. Fast and frail; clears mobile enemies.' },
  { id: 'locust', name: 'Locust', hp: 120, speed: 140, capacity: 5, cost: 80, special: 'AoE chomp. Slow tank; the only craft that kills Carnivorous Plants.' },
  { id: 'hornet', name: 'Hornet', hp: 90, speed: 200, capacity: 8, cost: 120, special: 'Projectile sting. Ranged specialist; fires from afar.' },
];

export class HiveStore {
  constructor() {
    this.tab = 'BANK';
    this._buttons = [];
  }

  open() {
    this.tab = 'BANK';
  }

  _btn(id, x, y, w, h, data) {
    this._buttons.push({ id, x, y, w, h, data });
  }

  /** Returns an intent object or null. */
  hitTest(px, py) {
    for (const b of this._buttons) {
      if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) {
        if (b.id === 'tab') {
          this.tab = b.data;
          return { action: 'tab', tab: b.data };
        }
        return { action: b.id, data: b.data };
      }
    }
    return null;
  }

  draw(ctx, { bee, banked, upgrades, w, h, isMobile }) {
    this._buttons = [];

    // dim backdrop
    ctx.save();
    ctx.fillStyle = rgba(COLORS.obsidian, 0.82);
    ctx.fillRect(0, 0, w, h);

    // Reserve a bottom safe zone on mobile so the whole panel — including the
    // bottom-anchored Fly Out button — stays clear of the browser nav bar / home
    // indicator. The button remains panel-relative, so it never detaches or
    // overlaps content on large desktop screens.
    const safeBottom = isMobile ? 80 : 20;
    const pw = Math.min(w - 32, 560);
    const ph = Math.min(h - 32 - safeBottom, 600);
    const px = (w - pw) / 2;
    const py = (h - safeBottom - ph) / 2;
    panel(ctx, px, py, pw, ph, { fill: COLORS.parchment, stroke: COLORS.ink, lineWidth: 3, radius: 14 });

    text(ctx, 'THE HIVE', px + pw / 2, py + 30, {
      fontStr: font(FONTS.title, 30, '600'),
      color: COLORS.ink,
    });

    // ---- tabs ----
    const tabs = ['BANK', 'STORE', 'HANGAR'];
    const tabW = (pw - 60) / 3;
    const tabY = py + 54;
    tabs.forEach((t, i) => {
      const tx = px + 30 + i * tabW;
      const active = this.tab === t;
      panel(ctx, tx, tabY, tabW - 8, 32, {
        fill: active ? rgba(COLORS.gold, 0.3) : 'transparent',
        stroke: active ? COLORS.gold : rgba(COLORS.ink, 0.4),
        lineWidth: active ? 2 : 1,
        radius: 6,
      });
      text(ctx, t, tx + (tabW - 8) / 2, tabY + 16, {
        fontStr: font(FONTS.body, 13, '700'),
        color: active ? COLORS.ink : rgba(COLORS.ink, 0.6),
      });
      this._btn('tab', tx, tabY, tabW - 8, 32, t);
    });

    const contentY = tabY + 50;
    if (this.tab === 'BANK') this._drawBank(ctx, { bee, banked, px, py, pw, ph, contentY });
    else if (this.tab === 'STORE') this._drawStore(ctx, { bee, banked, upgrades, px, pw, contentY });
    else this._drawHangar(ctx, { banked, upgrades, px, py, pw, ph, contentY });

    // ---- Fly Out button ----
    const exitW = 140;
    const exitX = px + (pw - exitW) / 2;
    const exitY = py + ph - 48;
    panel(ctx, exitX, exitY, exitW, 34, { fill: rgba(COLORS.gold, 0.25), stroke: COLORS.ink, lineWidth: 2, radius: 8 });
    text(ctx, 'Fly Out  ↑', exitX + exitW / 2, exitY + 17, {
      fontStr: font(FONTS.title, 18, '600'),
      color: COLORS.ink,
    });
    this._btn('exit', exitX, exitY, exitW, 34);
    text(ctx, 'or press Esc', px + pw / 2, exitY + 46, {
      fontStr: font(FONTS.body, 10),
      color: rgba(COLORS.ink, 0.5),
    });

    ctx.restore();
  }

  _drawBank(ctx, { bee, banked, px, pw, contentY }) {
    const cx = px + pw / 2;
    text(ctx, 'CARRIED POLLEN', cx, contentY, {
      fontStr: font(FONTS.body, 12, '700'),
      color: rgba(COLORS.ink, 0.7),
    });
    const rows = [
      ['Common', bee.carried.common, COLORS.gold],
      ['Uncommon', bee.carried.uncommon, COLORS.ember],
      ['Rare', bee.carried.rare, COLORS.crimson],
    ];
    rows.forEach((r, i) => {
      const ry = contentY + 26 + i * 24;
      ctx.beginPath();
      ctx.arc(px + 60, ry, 6, 0, Math.PI * 2);
      ctx.fillStyle = r[2];
      ctx.fill();
      text(ctx, r[0], px + 76, ry, { fontStr: font(FONTS.body, 13), color: COLORS.ink, align: 'left' });
      text(ctx, `× ${r[1]}`, px + pw - 60, ry, { fontStr: font(FONTS.mono, 13), color: COLORS.ink, align: 'right' });
    });

    text(ctx, `Total value carried: ${bee.getCarriedTotal()}`, cx, contentY + 108, {
      fontStr: font(FONTS.mono, 14, '700'),
      color: COLORS.gold,
    });

    // honeycomb fill visualization of banked total
    this._drawHoneycomb(ctx, px + 40, contentY + 130, pw - 80, 70, banked);
    text(ctx, `BANKED TOTAL: ${banked}`, cx, contentY + 218, {
      fontStr: font(FONTS.mono, 14, '700'),
      color: COLORS.ink,
    });

    // Deposit All
    const bw = 180;
    const bx = cx - bw / 2;
    const byy = contentY + 234;
    const enabled = bee.getCarriedTotal() > 0;
    panel(ctx, bx, byy, bw, 36, {
      fill: enabled ? rgba(COLORS.green, 0.35) : rgba(COLORS.ink, 0.08),
      stroke: COLORS.ink,
      lineWidth: 2,
      radius: 8,
    });
    text(ctx, 'Deposit All', cx, byy + 18, {
      fontStr: font(FONTS.title, 18, '600'),
      color: enabled ? COLORS.ink : rgba(COLORS.ink, 0.4),
    });
    if (enabled) this._btn('deposit', bx, byy, bw, 36);
  }

  _drawHoneycomb(ctx, x, y, w, h, banked) {
    const cols = 12;
    const rows = 3;
    const cellW = w / cols;
    const fillCount = Math.min(cols * rows, Math.floor(banked / 5));
    let idx = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const hx = x + c * cellW + (r % 2) * cellW * 0.5 + cellW * 0.5;
        const hy = y + r * (h / rows) + h / rows / 2;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
          const hxp = hx + Math.cos(a) * cellW * 0.45;
          const hyp = hy + Math.sin(a) * cellW * 0.45;
          if (i === 0) ctx.moveTo(hxp, hyp);
          else ctx.lineTo(hxp, hyp);
        }
        ctx.closePath();
        ctx.fillStyle = idx < fillCount ? rgba(COLORS.gold, 0.85) : rgba(COLORS.ink, 0.06);
        ctx.fill();
        ctx.strokeStyle = rgba(COLORS.ink, 0.4);
        ctx.lineWidth = 1;
        ctx.stroke();
        idx++;
      }
    }
  }

  _drawStore(ctx, { bee, banked, upgrades, px, pw, contentY }) {
    const carried = bee.getCarriedTotal();
    const available = banked + carried;
    text(ctx, `Spendable pollen: ${available}  (banked ${banked} + carried ${carried})`, px + pw / 2, contentY - 8, {
      fontStr: font(FONTS.body, 11),
      color: rgba(COLORS.ink, 0.7),
    });

    const rowH = 46;
    UPGRADES.forEach((u, i) => {
      const ry = contentY + 12 + i * rowH;
      const rx = px + 24;
      const rw = pw - 48;
      panel(ctx, rx, ry, rw, rowH - 8, { fill: rgba(COLORS.ink, 0.03), stroke: rgba(COLORS.ink, 0.25), lineWidth: 1, radius: 6 });

      // name + detail
      text(ctx, u.name, rx + 12, ry + 14, { fontStr: font(FONTS.body, 13, '700'), color: COLORS.ink, align: 'left' });
      let detail;
      let maxed;
      if (u.kind === 'level') {
        const lvl = upgrades[u.id] || 0;
        maxed = lvl >= u.max;
        detail = `Lv ${lvl}/${u.max}${u.formula ? '  ' + u.formula : ''}`;
      } else {
        maxed = (upgrades.healingItems || 0) >= 3;
        detail = `${u.desc} (held ${upgrades.healingItems || 0}/3)`;
      }
      const bw = 96;
      const bx2 = rx + rw - bw - 8;
      const maxDetailW = bx2 - (rx + 12) - 8; // space between left edge and buy button
      ctx.save();
      ctx.font = font(FONTS.body, 10);
      let displayDetail = detail;
      while (ctx.measureText(displayDetail).width > maxDetailW && displayDetail.length > 4) {
        displayDetail = displayDetail.slice(0, -2) + '…';
      }
      ctx.restore();
      text(ctx, displayDetail, rx + 12, ry + 28, { fontStr: font(FONTS.body, 10), color: rgba(COLORS.ink, 0.6), align: 'left' });

      // buy button
      const canAfford = available >= u.cost;
      const buyEnabled = !maxed && canAfford;
      const bx = rx + rw - bw - 8;
      const byy = ry + (rowH - 8) / 2 - 14;
      panel(ctx, bx, byy, bw, 28, {
        fill: buyEnabled ? rgba(COLORS.gold, 0.3) : rgba(COLORS.ink, 0.05),
        stroke: buyEnabled ? COLORS.ink : rgba(COLORS.ink, 0.3),
        lineWidth: buyEnabled ? 1.6 : 1,
        radius: 6,
      });
      const label = maxed ? 'MAX' : `${u.cost} ◆`;
      text(ctx, label, bx + bw / 2, byy + 14, {
        fontStr: font(FONTS.mono, 12, '700'),
        color: buyEnabled ? COLORS.ink : rgba(COLORS.ink, 0.4),
      });
      if (buyEnabled) this._btn('buy', bx, byy, bw, 28, u.id);
    });
  }

  _drawHangar(ctx, { banked, upgrades, px, py, pw, ph, contentY }) {
    const cx = px + pw / 2;
    text(ctx, 'SELECT YOUR CRAFT', cx, contentY + 6, {
      fontStr: font(FONTS.body, 12, '700'),
      color: rgba(COLORS.ink, 0.7),
    });
    text(ctx, `Banked pollen: ${banked}`, cx, contentY + 22, {
      fontStr: font(FONTS.mono, 11), color: rgba(COLORS.ink, 0.6),
    });

    const unlocked = upgrades.craftsUnlocked || [];
    const active = upgrades.activeCraft || 'bee';

    // 2-column grid so all four crafts stay readable on phone-width panels.
    const cols = 2;
    const rows = Math.ceil(CRAFTS.length / cols);
    const gap = 10;
    const gridX = px + 24;
    const gridW = pw - 48;
    const cardW = (gridW - gap * (cols - 1)) / cols;
    const gridY = contentY + 38; // push grid down to clear these labels
    const gridH = py + ph - 64 - gridY - 8;
    const cardH = (gridH - gap * (rows - 1)) / rows;

    CRAFTS.forEach((craft, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cardX = gridX + col * (cardW + gap);
      const cardY = gridY + row * (cardH + gap);
      const isUnlocked = craft.cost === 0 || unlocked.includes(craft.id);
      const isActive = active === craft.id;

      panel(ctx, cardX, cardY, cardW, cardH, {
        fill: isActive ? rgba(COLORS.gold, 0.12) : rgba(COLORS.ink, 0.03),
        stroke: isActive ? COLORS.gold : rgba(COLORS.ink, 0.3),
        lineWidth: isActive ? 2.5 : 1.2,
        radius: 8,
      });

      const ccx = cardX + cardW / 2;
      text(ctx, craft.name, ccx, cardY + 16, { fontStr: font(FONTS.title, 16, '600'), color: COLORS.ink });

      // illustration
      ctx.save();
      ctx.translate(ccx, cardY + 44);
      this._drawCraftIcon(ctx, craft.id);
      ctx.restore();

      // stats — clamped so they never fall behind the action button
      const btnAreaTop = cardY + cardH - 38; // button + safe margin
      const statY = Math.min(cardY + 72, btnAreaTop - 72); // guaranteed clear of button
      text(ctx, `HP ${craft.hp}`, ccx, statY, { fontStr: font(FONTS.body, 12), color: rgba(COLORS.ink, 0.85) });
      text(ctx, `Speed ${craft.speed}`, ccx, statY + 16, { fontStr: font(FONTS.body, 12), color: rgba(COLORS.ink, 0.85) });
      text(ctx, `Capacity ${craft.capacity}`, ccx, statY + 32, { fontStr: font(FONTS.body, 12), color: rgba(COLORS.ink, 0.85) });
      // Special ability: only render if there's room above the button
      const specialY = statY + 50;
      if (specialY + 20 < btnAreaTop) {
        this._wrapText(ctx, craft.special, ccx, specialY, cardW - 24, 11, {
          fontStr: `italic ${font(FONTS.body, 11)}`,
          color: rgba(COLORS.ink, 0.7),
        });
      }

      // action control (bottom of card)
      const aw = cardW - 20;
      const ax = cardX + 10;
      const ayy = cardY + cardH - 34;
      if (isActive) {
        panel(ctx, ax, ayy, aw, 26, { fill: rgba(COLORS.gold, 0.3), stroke: COLORS.gold, lineWidth: 1.5, radius: 6 });
        text(ctx, 'ACTIVE', ax + aw / 2, ayy + 13, { fontStr: font(FONTS.body, 12, '700'), color: COLORS.ink });
      } else if (isUnlocked) {
        panel(ctx, ax, ayy, aw, 26, { fill: rgba(COLORS.green, 0.3), stroke: COLORS.ink, lineWidth: 1.4, radius: 6 });
        text(ctx, 'SWITCH', ax + aw / 2, ayy + 13, { fontStr: font(FONTS.body, 12, '700'), color: COLORS.ink });
        this._btn('switch-craft', ax, ayy, aw, 26, craft.id);
      } else {
        const canAfford = banked >= craft.cost;
        panel(ctx, ax, ayy, aw, 26, {
          fill: canAfford ? rgba(COLORS.gold, 0.3) : rgba(COLORS.ink, 0.05),
          stroke: canAfford ? COLORS.ink : rgba(COLORS.ink, 0.3),
          lineWidth: canAfford ? 1.6 : 1,
          radius: 6,
        });
        text(ctx, `${craft.cost} ◆`, ax + aw / 2, ayy + 13, {
          fontStr: font(FONTS.mono, 12, '700'),
          color: canAfford ? COLORS.ink : rgba(COLORS.ink, 0.4),
        });
        if (canAfford) this._btn('buy-craft', ax, ayy, aw, 26, craft.id);
      }
    });
  }

  // Simple top-down insect silhouettes for the hangar cards.
  _drawCraftIcon(ctx, id) {
    ctx.save();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = COLORS.ink;
    if (id === 'bee') {
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(side * 9, -2, 9, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.ellipse(0, 0, 7, 11, 0, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.gold;
      ctx.fill();
      ctx.stroke();
    } else if (id === 'moth') {
      ctx.fillStyle = 'rgba(200,180,160,0.6)';
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(side * 11, -1, 12, 7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.ellipse(0, 0, 8, 12, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#C8B89A';
      ctx.fill();
      ctx.stroke();
    } else if (id === 'hornet') {
      // Narrow angular wings + a sleek striped body — the aggressive silhouette.
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(side * 3, -2);
        ctx.lineTo(side * 13, -4);
        ctx.lineTo(side * 11, 4);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.ellipse(0, 0, 6, 13, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#8B6914';
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = rgba(COLORS.ink, 0.85);
      ctx.lineWidth = 1;
      for (const oy of [-3, 1, 5]) {
        ctx.beginPath();
        ctx.moveTo(-4, oy);
        ctx.lineTo(4, oy);
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = 'rgba(120,140,90,0.45)';
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(side * 4, -4);
        ctx.lineTo(side * 15, -2);
        ctx.lineTo(side * 12, 11);
        ctx.lineTo(side * 4, 8);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.ellipse(0, 0, 9, 14, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#5A6B2A';
      ctx.fill();
      ctx.lineWidth = 1.8;
      ctx.stroke();
    }
    ctx.restore();
  }

  // Minimal word-wrap helper for card copy.
  _wrapText(ctx, str, cx, y, maxWidth, lineHeight, opts) {
    ctx.save();
    ctx.font = opts.fontStr;
    const words = str.split(' ');
    const lines = [];
    let cur = '';
    for (const word of words) {
      const test = cur ? `${cur} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && cur) {
        lines.push(cur);
        cur = word;
      } else {
        cur = test;
      }
    }
    if (cur) lines.push(cur);
    ctx.restore();
    lines.forEach((ln, i) => text(ctx, ln, cx, y + i * lineHeight, opts));
  }
}
