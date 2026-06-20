// Full-canvas hive overlay with three tabs: BANK, STORE, HANGAR.
// Rendering records clickable button rects; main.js calls hitTest() on a
// pointer event and executes the returned intent (deposit / buy / tab / exit).
// The store itself holds no game state beyond the active tab.

import { COLORS, FONTS, font, text, panel, rgba, drawFlower, drawLeaf } from '../utils/renderer.js';
import { levelCapFor, BIOME_DEFS, BIOME_ORDER, isBiomeUnlocked } from '../world/biomeConfig.js';

// Base upgrades — available in all biomes, levels 1–20 total (5 per biome).
// The `biomeUnlock` field means the upgrade type first becomes purchasable
// when that biome is active. The effective max in a biome = biome's levelCap.
export const UPGRADES = [
  { id: 'maxHp',          name: 'Max HP',              cost: 15, globalMax: 20, kind: 'level', formula: '+10 HP/level', biomeUnlock: 'meadow' },
  { id: 'damageReduction',name: 'Damage Reduction',     cost: 10, globalMax: 20, kind: 'level', formula: '×0.95/level', biomeUnlock: 'meadow' },
  { id: 'attackBoost',    name: 'Attack Boost',         cost: 10, globalMax: 20, kind: 'level', formula: '+5% dmg/level', biomeUnlock: 'meadow' },
  { id: 'pollenCapacity', name: 'Pollen Capacity',      cost: 12, globalMax: 20, kind: 'level', formula: '+5 carry/level', biomeUnlock: 'meadow' },
  { id: 'dashCooldown',   name: 'Practiced Sting',      cost: 14, globalMax: 20, kind: 'level', formula: '-10% cooldown/lv', biomeUnlock: 'forest' },
  { id: 'magnetRadius',   name: 'Floral Attunement',    cost: 14, globalMax: 20, kind: 'level', formula: '+20px radius/lv', biomeUnlock: 'garden' },
  { id: 'comboWindow',    name: 'Focused Forager',       cost: 14, globalMax: 20, kind: 'level', formula: '+0.5s combo/lv', biomeUnlock: 'greenhouse' },
  { id: 'heal1',          name: 'Healing Item ×1',      cost: 8,  kind: 'heal', amount: 1, desc: 'max 3 held' },
  { id: 'heal3',          name: 'Healing Item ×3',      cost: 20, kind: 'heal', amount: 3, desc: 'if space allows' },
];

// Craft catalog for the Hangar tab. The Bee is always available (cost 0); the
// rest are unlocked with banked pollen. Each craft first appears in the Hangar
// once its `biomeUnlock` biome is unlocked. Costs are deducted in main.js.
export const CRAFTS = [
  { id: 'bee', name: 'Bee', hp: '100–150', speed: 180, capacity: 10, cost: 0, biomeUnlock: 'meadow', special: 'Rear-sting dash. Balanced collector with the highest capacity.' },
  { id: 'moth', name: 'Moth', hp: 80, speed: 220, capacity: 5, cost: 50, biomeUnlock: 'meadow', special: 'Frontal consume pulse. Fast and frail; clears mobile enemies.' },
  { id: 'locust', name: 'Locust', hp: 120, speed: 140, capacity: 5, cost: 80, biomeUnlock: 'forest', special: 'AoE chomp. Slow tank; the only craft that kills Carnivorous Plants.' },
  { id: 'hornet', name: 'Hornet', hp: 90, speed: 200, capacity: 8, cost: 120, biomeUnlock: 'forest', special: 'Projectile sting. Ranged specialist; fires from afar.' },
  { id: 'butterfly', name: 'Butterfly', hp: 70, speed: 240, capacity: 8, cost: 200, biomeUnlock: 'garden', special: 'Glide dash: passes over thorns + enemies. Second action: petal burst slows nearby foes.' },
  { id: 'wasp',      name: 'Wasp',      hp: 85, speed: 210, capacity: 7, cost: 200, biomeUnlock: 'garden', special: 'Ring sting: fires 8 projectiles radially. High damage, slower fire rate than Hornet.' },
  { id: 'dragonfly', name: 'Dragonfly', hp: 95, speed: 260, capacity: 9, cost: 400, biomeUnlock: 'greenhouse', special: 'Phase dash: brief invincibility frame on every dash. Fastest craft.' },
  { id: 'spider_craft', name: 'Spider', hp: 110, speed: 160, capacity: 12, cost: 400, biomeUnlock: 'greenhouse', special: 'Web layer: places slow-zone webs on spacebar hold. Lures enemies for pollen drops.' },
];

export class HiveStore {
  constructor() {
    this.tab = 'BANK';
    this._buttons = [];
    this._hangarPage = 0;
  }

  open() {
    this.tab = 'BANK';
    this._hangarPage = 0;
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
        if (b.id === 'hangar-prev') { this._hangarPage = Math.max(0, this._hangarPage - 1); return { action: 'tab', tab: 'HANGAR' }; }
        if (b.id === 'hangar-next') { this._hangarPage += 1; return { action: 'tab', tab: 'HANGAR' }; }
        return { action: b.id, data: b.data };
      }
    }
    return null;
  }

  draw(ctx, { bee, banked, everBanked = banked, upgrades, craftUpgrades = {}, w, h, isMobile, activeBiome = 'meadow' }) {
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

    // ---- Settings gear (top-right corner of the panel) ----
    const gearW = 28;
    const gearX = px + pw - gearW - 10;
    const gearY = py + 10;
    panel(ctx, gearX, gearY, gearW, gearW, {
      fill: rgba(COLORS.ink, 0.05),
      stroke: rgba(COLORS.ink, 0.35),
      lineWidth: 1,
      radius: 6,
    });
    text(ctx, '⚙', gearX + gearW / 2, gearY + gearW / 2 + 1, {
      fontStr: font(FONTS.body, 16),
      color: COLORS.ink,
    });
    this._btn('settings', gearX, gearY, gearW, gearW);

    // ---- tabs ----
    const tabs = ['BANK', 'STORE', 'HANGAR', 'BIOMES'];
    const tabW = (pw - 60) / 4;
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
        fontStr: font(FONTS.body, 12, '700'),
        color: active ? COLORS.ink : rgba(COLORS.ink, 0.6),
      });
      this._btn('tab', tx, tabY, tabW - 8, 32, t);
    });

    const contentY = tabY + 50;
    if (this.tab === 'BANK') this._drawBank(ctx, { bee, banked, px, py, pw, ph, contentY });
    else if (this.tab === 'STORE') this._drawStore(ctx, { bee, banked, upgrades, craftUpgrades, px, pw, contentY, activeBiome });
    else if (this.tab === 'HANGAR') this._drawHangar(ctx, { banked, upgrades, px, py, pw, ph, contentY, activeBiome });
    else this._drawBiomes(ctx, { banked, everBanked, activeBiome, px, py, pw, ph, contentY });

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

  _drawStore(ctx, { bee, banked, upgrades, craftUpgrades = {}, px, pw, contentY, activeBiome = 'meadow' }) {
    const carried = bee.getCarriedTotal();
    const available = banked + carried;
    const activeIdx = Math.max(0, BIOME_ORDER.indexOf(activeBiome));
    const biomeCap = levelCapFor(activeBiome);
    const cx = px + pw / 2;

    // Subtitle: which craft's upgrades these are (upgrades are per-craft now).
    const craftId = upgrades.activeCraft || 'bee';
    const craftName = craftId.charAt(0).toUpperCase() + craftId.slice(1).replace('_craft', '');
    text(ctx, `Upgrades for: ${craftName}`, cx, contentY - 20, {
      fontStr: font(FONTS.body, 11, '600'),
      color: rgba(COLORS.ink, 0.55),
    });

    text(ctx, `Spendable pollen: ${available}  (level cap ${biomeCap} in ${BIOME_DEFS[activeBiome]?.name || 'Meadow'})`, cx, contentY - 8, {
      fontStr: font(FONTS.body, 11),
      color: rgba(COLORS.ink, 0.7),
    });

    // Only show upgrades whose biomeUnlock biome is the current biome or earlier.
    const visible = UPGRADES.filter((u) => {
      if (!u.biomeUnlock) return true; // heal items: always available
      return BIOME_ORDER.indexOf(u.biomeUnlock) <= activeIdx;
    });

    const rowH = 46;
    visible.forEach((u, i) => {
      const ry = contentY + 12 + i * rowH;
      const rx = px + 24;
      const rw = pw - 48;
      panel(ctx, rx, ry, rw, rowH - 8, { fill: rgba(COLORS.ink, 0.03), stroke: rgba(COLORS.ink, 0.25), lineWidth: 1, radius: 6 });

      // name + detail
      text(ctx, u.name, rx + 12, ry + 14, { fontStr: font(FONTS.body, 13, '700'), color: COLORS.ink, align: 'left' });
      let detail;
      let maxed;
      let cappedByBiome = false;
      if (u.kind === 'level') {
        const lvl = craftUpgrades[u.id] || 0;
        // Effective max in this biome = min(global max, biome level cap).
        const effectiveMax = Math.min(u.globalMax, biomeCap);
        maxed = lvl >= effectiveMax;
        // Capped by the biome (not the absolute global) → label CAP, not MAX.
        cappedByBiome = maxed && lvl < u.globalMax;
        detail = `Lv ${lvl}/${effectiveMax}${u.formula ? '  ' + u.formula : ''}`;
      } else {
        maxed = (craftUpgrades.healingItems || 0) >= 3;
        detail = `${u.desc} (held ${craftUpgrades.healingItems || 0}/3)`;
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
      // CAP (biome cap reached, can level further next biome) vs MAX (global).
      const label = maxed ? (cappedByBiome ? 'CAP' : 'MAX') : `${u.cost} ◆`;
      text(ctx, label, bx + bw / 2, byy + 14, {
        fontStr: font(FONTS.mono, 12, '700'),
        color: buyEnabled ? COLORS.ink : (cappedByBiome ? COLORS.ember : rgba(COLORS.ink, 0.4)),
      });
      if (buyEnabled) this._btn('buy', bx, byy, bw, 28, u.id);
    });
  }

  _drawHangar(ctx, { banked, upgrades, px, py, pw, ph, contentY }) {
    const cx = px + pw / 2;
    const craftId = upgrades.activeCraft || 'bee';

    // Filter to only crafts available in the current/unlocked biomes
    const visibleCrafts = CRAFTS.filter(c => {
      return c.cost === 0 || (upgrades.craftsUnlocked || []).includes(c.id) ||
             this._isCraftPurchasable(c, upgrades);
    });

    const PAGE_SIZE = 4;
    const totalPages = Math.ceil(visibleCrafts.length / PAGE_SIZE);
    // Clamp page to valid range
    this._hangarPage = Math.max(0, Math.min(this._hangarPage, totalPages - 1));
    const pageStart = this._hangarPage * PAGE_SIZE;
    const pageCrafts = visibleCrafts.slice(pageStart, pageStart + PAGE_SIZE);

    // Header
    text(ctx, 'SELECT YOUR CRAFT', cx, contentY + 6, {
      fontStr: font(FONTS.body, 12, '700'), color: rgba(COLORS.ink, 0.7),
    });
    text(ctx, `Banked pollen: ${banked}`, cx, contentY + 22, {
      fontStr: font(FONTS.mono, 11), color: rgba(COLORS.ink, 0.6),
    });

    // Pagination controls (only if more than one page)
    if (totalPages > 1) {
      const arrowY = contentY + 14;
      // Left arrow
      if (this._hangarPage > 0) {
        const lx = px + 20;
        panel(ctx, lx, arrowY, 28, 22, { fill: rgba(COLORS.ink, 0.08), stroke: rgba(COLORS.ink, 0.3), lineWidth: 1, radius: 5 });
        text(ctx, '‹', lx + 14, arrowY + 11, { fontStr: font(FONTS.title, 16), color: COLORS.ink });
        this._btn('hangar-prev', lx, arrowY, 28, 22);
      }
      // Right arrow
      if (this._hangarPage < totalPages - 1) {
        const rx2 = px + pw - 48;
        panel(ctx, rx2, arrowY, 28, 22, { fill: rgba(COLORS.ink, 0.08), stroke: rgba(COLORS.ink, 0.3), lineWidth: 1, radius: 5 });
        text(ctx, '›', rx2 + 14, arrowY + 11, { fontStr: font(FONTS.title, 16), color: COLORS.ink });
        this._btn('hangar-next', rx2, arrowY, 28, 22);
      }
      // Page indicator
      text(ctx, `${this._hangarPage + 1} / ${totalPages}`, cx, contentY + 38, {
        fontStr: font(FONTS.body, 10), color: rgba(COLORS.ink, 0.45),
      });
    }

    // Craft grid — always 2×2
    const cols = 2;
    const gap = 10;
    const gridX = px + 24;
    const gridW = pw - 48;
    const cardW = (gridW - gap) / cols;
    const gridY = contentY + (totalPages > 1 ? 50 : 38);
    const availH = py + ph - 64 - gridY - 8;
    const cardH = (availH - gap) / 2;

    pageCrafts.forEach((craft, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cardX = gridX + col * (cardW + gap);
      const cardY = gridY + row * (cardH + gap);
      const isUnlocked = craft.cost === 0 || (upgrades.craftsUnlocked || []).includes(craft.id);
      const isActive = craftId === craft.id;

      panel(ctx, cardX, cardY, cardW, cardH, {
        fill: isActive ? rgba(COLORS.gold, 0.12) : rgba(COLORS.ink, 0.03),
        stroke: isActive ? COLORS.gold : rgba(COLORS.ink, 0.3),
        lineWidth: isActive ? 2.5 : 1.2,
        radius: 8,
      });

      const ccx = cardX + cardW / 2;
      text(ctx, craft.name, ccx, cardY + 16, { fontStr: font(FONTS.title, 16, '600'), color: COLORS.ink });

      ctx.save();
      ctx.translate(ccx, cardY + 44);
      this._drawCraftIcon(ctx, craft.id);
      ctx.restore();

      const btnAreaTop = cardY + cardH - 38;
      const statY = Math.min(cardY + 72, btnAreaTop - 76);
      text(ctx, `HP ${craft.hp}`, ccx, statY, { fontStr: font(FONTS.body, 11), color: rgba(COLORS.ink, 0.85) });
      text(ctx, `Speed ${craft.speed}`, ccx, statY + 15, { fontStr: font(FONTS.body, 11), color: rgba(COLORS.ink, 0.85) });
      text(ctx, `Capacity ${craft.capacity}`, ccx, statY + 30, { fontStr: font(FONTS.body, 11), color: rgba(COLORS.ink, 0.85) });
      const specialY = statY + 47;
      if (specialY + 18 < btnAreaTop) {
        this._wrapText(ctx, craft.special, ccx, specialY, cardW - 20, 11, {
          fontStr: `italic ${font(FONTS.body, 10)}`,
          color: rgba(COLORS.ink, 0.65),
        });
      }

      const aw = cardW - 20;
      const ax = cardX + 10;
      const ayy = cardY + cardH - 34;
      if (isActive) {
        panel(ctx, ax, ayy, aw, 26, { fill: rgba(COLORS.gold, 0.3), stroke: COLORS.gold, lineWidth: 1.5, radius: 6 });
        text(ctx, 'ACTIVE', ax + aw / 2, ayy + 13, { fontStr: font(FONTS.body, 11, '700'), color: COLORS.ink });
      } else if (isUnlocked) {
        panel(ctx, ax, ayy, aw, 26, { fill: rgba(COLORS.green, 0.3), stroke: COLORS.ink, lineWidth: 1.4, radius: 6 });
        text(ctx, 'SWITCH', ax + aw / 2, ayy + 13, { fontStr: font(FONTS.body, 11, '700'), color: COLORS.ink });
        this._btn('switch-craft', ax, ayy, aw, 26, craft.id);
      } else {
        const canAfford = banked >= craft.cost;
        panel(ctx, ax, ayy, aw, 26, {
          fill: canAfford ? rgba(COLORS.gold, 0.3) : rgba(COLORS.ink, 0.05),
          stroke: canAfford ? COLORS.ink : rgba(COLORS.ink, 0.3),
          lineWidth: canAfford ? 1.6 : 1, radius: 6,
        });
        text(ctx, canAfford ? `${craft.cost} ◆` : `🔒 ${craft.cost} ◆`, ax + aw / 2, ayy + 13, {
          fontStr: font(FONTS.mono, 11, '700'),
          color: canAfford ? COLORS.ink : rgba(COLORS.ink, 0.4),
        });
        if (canAfford) this._btn('buy-craft', ax, ayy, aw, 26, craft.id);
      }
    });
  }

  _isCraftPurchasable(craft, upgrades) {
    // Show locked crafts that the player can see as a goal (all biome-unlocked crafts)
    return true;
  }

  _drawBiomes(ctx, { banked, everBanked = banked, activeBiome, px, py, pw, ph, contentY }) {
    const cx = px + pw / 2;
    text(ctx, 'CHOOSE YOUR EXPEDITION', cx, contentY + 6, {
      fontStr: font(FONTS.body, 12, '700'),
      color: rgba(COLORS.ink, 0.7),
    });
    text(ctx, 'Switch takes effect on your next Fly Out.', cx, contentY + 22, {
      fontStr: font(FONTS.body, 10), color: rgba(COLORS.ink, 0.6),
    });

    const cols = 2;
    const rows = 2;
    const gap = 12;
    const gridX = px + 24;
    const gridW = pw - 48;
    const cardW = (gridW - gap * (cols - 1)) / cols;
    const gridY = contentY + 38;
    const gridH = py + ph - 64 - gridY - 8;
    const cardH = (gridH - gap * (rows - 1)) / rows;

    BIOME_ORDER.forEach((id, i) => {
      const def = BIOME_DEFS[id];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cardX = gridX + col * (cardW + gap);
      const cardY = gridY + row * (cardH + gap);
      const isActive = activeBiome === id;
      // Biome unlocks gate on lifetime banked (a permanent milestone), so
      // spending pollen on upgrades never re-locks an already-earned biome.
      const unlocked = isBiomeUnlocked(id, everBanked);

      panel(ctx, cardX, cardY, cardW, cardH, {
        fill: isActive ? rgba(COLORS.gold, 0.12) : rgba(COLORS.ink, 0.03),
        stroke: isActive ? COLORS.gold : (unlocked ? rgba(def.border, 0.8) : rgba(COLORS.ink, 0.3)),
        lineWidth: isActive ? 2.5 : 1.4,
        radius: 8,
      });

      const ccx = cardX + cardW / 2;
      text(ctx, def.name, ccx, cardY + 16, { fontStr: font(FONTS.title, 16, '600'), color: COLORS.ink });

      // threat dots (● filled / ○ empty out of 4)
      const n = 4;
      const spacing = 12;
      const startX = ccx - ((n - 1) * spacing) / 2;
      for (let d = 0; d < n; d++) {
        ctx.beginPath();
        ctx.arc(startX + d * spacing, cardY + 34, 3.5, 0, Math.PI * 2);
        if (d < def.threat) {
          ctx.fillStyle = def.border;
          ctx.fill();
        } else {
          ctx.strokeStyle = rgba(COLORS.ink, 0.4);
          ctx.lineWidth = 1.1;
          ctx.stroke();
        }
      }

      // botanical illustration (mid-card)
      ctx.save();
      ctx.translate(ccx, cardY + cardH * 0.52);
      this._drawBiomeBotanical(ctx, id);
      ctx.restore();

      // swatch strip
      const sw = 16;
      const sh = 9;
      const total = def.swatches.length * sw + (def.swatches.length - 1) * 4;
      let swx = ccx - total / 2;
      const swy = cardY + cardH - 50;
      for (const c of def.swatches) {
        ctx.fillStyle = c;
        ctx.fillRect(swx, swy, sw, sh);
        ctx.strokeStyle = rgba(COLORS.ink, 0.3);
        ctx.lineWidth = 1;
        ctx.strokeRect(swx, swy, sw, sh);
        swx += sw + 4;
      }

      // status / action control (bottom of card)
      const aw = cardW - 20;
      const ax = cardX + 10;
      const ayy = cardY + cardH - 32;
      if (isActive) {
        panel(ctx, ax, ayy, aw, 24, { fill: rgba(COLORS.gold, 0.3), stroke: COLORS.gold, lineWidth: 1.5, radius: 6 });
        text(ctx, 'ACTIVE', ax + aw / 2, ayy + 12, { fontStr: font(FONTS.body, 11, '700'), color: COLORS.ink });
      } else if (unlocked) {
        panel(ctx, ax, ayy, aw, 24, { fill: rgba(COLORS.green, 0.3), stroke: COLORS.ink, lineWidth: 1.4, radius: 6 });
        text(ctx, 'TRAVEL HERE', ax + aw / 2, ayy + 12, { fontStr: font(FONTS.body, 11, '700'), color: COLORS.ink });
        this._btn('switch-biome', ax, ayy, aw, 24, id);
      } else {
        panel(ctx, ax, ayy, aw, 24, { fill: rgba(COLORS.ink, 0.05), stroke: rgba(COLORS.crimson, 0.5), lineWidth: 1.2, radius: 6 });
        text(ctx, `🔒 bank ${def.unlockCost} ◆`, ax + aw / 2, ayy + 12, {
          fontStr: font(FONTS.mono, 11, '700'), color: rgba(COLORS.crimson, 0.85),
        });
      }
    });
  }

  // Per-biome botanical illustration for the BIOMES tab cards.
  _drawBiomeBotanical(ctx, id) {
    switch (id) {
      case 'meadow':
        drawFlower(ctx, 18, 8, '#D4A83F', '#5A3D1F');
        break;
      case 'forest':
        drawLeaf(ctx, 28, 12, '#3D5A3E');
        break;
      case 'garden':
        drawFlower(ctx, 18, 5, '#D4928A', '#C4714A');
        break;
      case 'greenhouse': {
        // simple tropical leaf via two bezier curves
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(0, 18);
        ctx.bezierCurveTo(20, 6, 16, -16, 0, -22);
        ctx.bezierCurveTo(-16, -16, -20, 6, 0, 18);
        ctx.closePath();
        ctx.fillStyle = rgba('#5A7A5A', 0.9);
        ctx.fill();
        ctx.strokeStyle = COLORS.ink;
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.strokeStyle = rgba(COLORS.ink, 0.5);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, 16);
        ctx.lineTo(0, -20);
        ctx.stroke();
        ctx.restore();
        break;
      }
      default:
        break;
    }
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
    } else if (id === 'butterfly') {
      // Four broad pale-lavender wings.
      ctx.fillStyle = 'rgba(200,168,212,0.7)';
      for (const side of [-1, 1]) {
        for (const oy of [-5, 6]) {
          ctx.beginPath();
          ctx.ellipse(side * 9, oy, 8, 6, side * 0.3, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }
      ctx.beginPath();
      ctx.ellipse(0, 0, 4, 12, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#C8A8D4';
      ctx.fill();
      ctx.stroke();
    } else if (id === 'wasp') {
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(side * 2, -2);
        ctx.lineTo(side * 12, -5);
        ctx.lineTo(side * 10, 4);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.ellipse(0, 0, 5, 13, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#D4A020';
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = rgba(COLORS.ink, 0.9);
      ctx.lineWidth = 1.2;
      for (const oy of [-3, 1, 5]) {
        ctx.beginPath();
        ctx.moveTo(-4, oy);
        ctx.lineTo(4, oy);
        ctx.stroke();
      }
    } else if (id === 'dragonfly') {
      // Long thin body + four wide narrow wings.
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      for (const side of [-1, 1]) {
        for (const oy of [-4, 4]) {
          ctx.beginPath();
          ctx.ellipse(side * 12, oy, 12, 3, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }
      ctx.beginPath();
      ctx.ellipse(0, 0, 3.5, 15, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#4A9AA0';
      ctx.fill();
      ctx.stroke();
    } else if (id === 'spider_craft') {
      // Compact round body + 8 radial legs.
      ctx.strokeStyle = COLORS.ink;
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * 15, Math.sin(a) * 15);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, Math.PI * 2);
      ctx.fillStyle = '#3A3A3A';
      ctx.fill();
      ctx.lineWidth = 1.4;
      ctx.stroke();
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
