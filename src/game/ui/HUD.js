// On-canvas HUD: health bar, pollen counter, active power-up slot, healing count.
// Pure rendering — no DOM. The minimap is drawn separately by Minimap.js.

import { COLORS, FONTS, font, text, panel, roundRectPath, rgba, mixHex } from '../utils/renderer.js';
import { PowerUpPlant } from '../entities/pickups/PowerUpPlant.js';
import { clamp } from '../utils/math.js';

function hpColor(frac) {
  // green → amber → red
  if (frac > 0.5) return mixHex(COLORS.ember, COLORS.green, (frac - 0.5) / 0.5);
  return mixHex(COLORS.crimson, COLORS.ember, frac / 0.5);
}

// Combo indicator styling per multiplier threshold.
const COMBO_STYLES = {
  1.2: { label: '×1.2 COMBO', color: COLORS.gold },
  1.5: { label: '×1.5 COMBO', color: COLORS.ember },
  2.0: { label: '×2.0 COMBO', color: COLORS.crimson },
};

export const HUD = {
  draw(ctx, { bee, banked, activePowerUp, w, h, isMobile, combo, rainActive, t = 0, muteState = false, muteBtnRect = null, modifiers = [], killScore = 0, activeBiome = 'meadow', state = 'PLAYING', handBtnRect = null }) {
    // Dark biomes (Forest, Greenhouse) use a near-black terrain, against which
    // the ink-colored HUD text becomes unreadable. Lay a semi-transparent light
    // backdrop behind the top-left HUD cluster to restore contrast.
    const darkBiome = activeBiome === 'forest' || activeBiome === 'greenhouse';
    if (darkBiome) {
      ctx.save();
      ctx.fillStyle = 'rgba(240,235,226,0.15)';
      roundRectPath(ctx, 6, 6, 220, 90, 8);
      ctx.fill();
      ctx.restore();
    }

    // ---- Kill score (top-left) ----
    ctx.save();
    ctx.translate(22, 18);
    // hexagon icon
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      const px = Math.cos(a) * 9;
      const py = Math.sin(a) * 9;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = COLORS.gold;
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = COLORS.ink;
    ctx.stroke();
    // small stinger symbol inside
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(0, -3);
    ctx.lineTo(0, 2.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 3, 1.4, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.ink;
    ctx.fill();
    ctx.restore();
    text(ctx, `${killScore}`, 36, 18, {
      fontStr: font(FONTS.mono, 12),
      color: COLORS.ink,
      align: 'left',
    });

    // ---- Health bar (top-left, below the kill score) ----
    const hx = 16;
    const hy = 44;
    const hw = 160;
    const hh = 16;
    text(ctx, '⬡ HP', hx, hy - 8, {
      fontStr: font(FONTS.body, 11, '600'),
      color: COLORS.ink,
      align: 'left',
    });
    panel(ctx, hx, hy, hw, hh, { fill: rgba(COLORS.obsidian, 0.25), stroke: COLORS.ink, lineWidth: 2, radius: 4 });
    const frac = clamp(bee.hp / bee.maxHp, 0, 1);
    ctx.save();
    ctx.fillStyle = hpColor(frac);
    const innerW = (hw - 4) * frac;
    ctx.beginPath();
    ctx.rect(hx + 2, hy + 2, innerW, hh - 4);
    ctx.fill();
    ctx.restore();
    text(ctx, `${Math.ceil(bee.hp)}/${bee.maxHp}`, hx + hw / 2, hy + hh / 2, {
      fontStr: font(FONTS.mono, 10),
      color: COLORS.ink,
    });

    // ---- Pollen counter (top-center) ----
    const cx = w / 2;
    const totalCarried = bee.capacityUsed;
    const maxCarry = bee.maxCarry;
    let pollenColor = COLORS.gold;
    if (totalCarried > maxCarry) pollenColor = COLORS.crimson;
    else if (totalCarried === maxCarry) pollenColor = COLORS.ember;
    text(ctx, `${totalCarried} / ${maxCarry}`, cx, 22, {
      fontStr: font(FONTS.mono, 14, '700'),
      color: pollenColor,
    });
    text(ctx, `BANKED: ${banked}`, cx, 40, {
      fontStr: font(FONTS.body, 11),
      color: COLORS.ink,
      alpha: 0.8,
    });

    // ---- Stacked warnings / status, directly below the capacity counter ----
    let warnY = 56;
    if (totalCarried > maxCarry) {
      // Overcapacity: amber text warning (no sprite tint).
      text(ctx, '⚠ ATTACK DISABLED — OVERCAPACITY', cx, warnY, {
        fontStr: font(FONTS.body, 11),
        color: COLORS.gold,
      });
      warnY += 16;
    }
    if (rainActive) {
      text(ctx, '🌧 STORM — DMG ×1.5', cx, warnY, {
        fontStr: font(FONTS.body, 11),
        color: COLORS.gold,
      });
      warnY += 16;
    }
    if (combo && combo.count >= 5) {
      const style = COMBO_STYLES[combo.multiplier] || COMBO_STYLES[1.2];
      // Pulse scale 1.0 → 1.08 on a 0.4s cycle.
      const scale = 1.04 + 0.04 * Math.sin(t * 5 * Math.PI);
      ctx.save();
      ctx.translate(cx, warnY + 4);
      ctx.scale(scale, scale);
      text(ctx, style.label, 0, 0, {
        fontStr: font(FONTS.mono, 13, '700'),
        color: style.color,
      });
      ctx.restore();
      warnY += 20;
    }

    // ---- Active narrative-modifier tags (gold/crimson/amber, color-coded) ----
    if (modifiers && modifiers.length) {
      for (const m of modifiers) {
        text(ctx, m.label, cx, warnY, {
          fontStr: font(FONTS.mono, 11, '700'),
          color: m.color,
        });
        warnY += 16;
      }
    }

    // ---- Active power-up slot (top-right) ----
    const px = w - 48;
    const py = 16;
    panel(ctx, px, py, 32, 32, { fill: rgba(COLORS.obsidian, 0.2), stroke: COLORS.ink, lineWidth: 1.5, radius: 6 });
    if (activePowerUp) {
      PowerUpPlant.drawIcon(ctx, activePowerUp.type, px + 16, py + 16, 22);
      // clockwise depleting ring
      const remain = clamp(activePowerUp.timer / activePowerUp.duration, 0, 1);
      ctx.save();
      ctx.strokeStyle = activePowerUp.color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(px + 16, py + 16, 18, -Math.PI / 2, -Math.PI / 2 + remain * Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    } else {
      text(ctx, 'NONE', px + 16, py + 16, {
        fontStr: font(FONTS.body, 10),
        color: rgba(COLORS.ink, 0.6),
      });
    }

    // ---- Mute toggle (top-right, beside the power-up slot) ----
    if (muteBtnRect) {
      const m = muteBtnRect;
      panel(ctx, m.x, m.y, m.w, m.h, { fill: rgba(COLORS.obsidian, 0.2), stroke: COLORS.ink, lineWidth: 1.5, radius: 6 });
      const mcx = m.x + m.w / 2;
      const mcy = m.y + m.h / 2;
      ctx.save();
      // Speaker body.
      ctx.fillStyle = COLORS.ink;
      ctx.strokeStyle = COLORS.ink;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(mcx - 7, mcy - 3);
      ctx.lineTo(mcx - 3, mcy - 3);
      ctx.lineTo(mcx + 1, mcy - 6);
      ctx.lineTo(mcx + 1, mcy + 6);
      ctx.lineTo(mcx - 3, mcy + 3);
      ctx.lineTo(mcx - 7, mcy + 3);
      ctx.closePath();
      ctx.fill();
      if (muteState) {
        // Crimson X when muted.
        ctx.strokeStyle = COLORS.crimson;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(mcx + 3, mcy - 5);
        ctx.lineTo(mcx + 9, mcy + 5);
        ctx.moveTo(mcx + 9, mcy - 5);
        ctx.lineTo(mcx + 3, mcy + 5);
        ctx.stroke();
      } else {
        // Two sound-wave arcs when audible.
        ctx.beginPath();
        ctx.arc(mcx + 1, mcy, 4, -Math.PI / 3, Math.PI / 3);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(mcx + 1, mcy, 7, -Math.PI / 3, Math.PI / 3);
        ctx.stroke();
      }
      ctx.restore();
    }

    // ---- Healing items (bottom-left) ----
    const by = h - 30;
    ctx.save();
    // vial icon
    ctx.translate(20, by);
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = 1.4;
    ctx.fillStyle = rgba(COLORS.green, 0.7);
    roundRectPath(ctx, -4, -8, 8, 14, 3);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    text(ctx, `× ${bee.healingItems}`, 32, by - 1, {
      fontStr: font(FONTS.mono, 13, '700'),
      color: COLORS.ink,
      align: 'left',
    });
    if (!isMobile) {
      text(ctx, 'H to use', 64, by - 1, {
        fontStr: font(FONTS.body, 10),
        color: rgba(COLORS.ink, 0.6),
        align: 'left',
      });
    }

    // ---- Mobile handedness toggle (⇄) — bottom center, below the heal button ----
    if (handBtnRect && isMobile && state === 'PLAYING') {
      const r = handBtnRect;
      panel(ctx, r.x, r.y, r.w, r.h, {
        fill: 'rgba(0,0,0,0.35)',
        stroke: rgba(COLORS.parchment, 0.5),
        lineWidth: 1.5,
        radius: 6,
      });
      text(ctx, '⇄', r.x + r.w / 2, r.y + r.h / 2, {
        fontStr: font(FONTS.body, 14, '700'),
        color: rgba(COLORS.parchment, 0.85),
      });
    }

    // ---- Desktop control hint bar (persistent, PLAYING only) ----
    if (!isMobile && state === 'PLAYING') {
      let showControls = true;
      try { showControls = localStorage.getItem('pollinator_show_controls') !== 'off'; } catch (e) { showControls = true; }
      if (showControls) {
        const barH = 28;
        const barY = h - barH;
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(0, barY, w, barH);
        ctx.restore();
        const segments = [
          'WASD / ↑↓←→   Move',
          'SPACE   Attack / Dash',
          'F   Secondary',
          'H   Heal',
          'ESC   Hive',
          '`   Dev Menu',
        ];
        const slotW = w / segments.length;
        segments.forEach((seg, i) => {
          text(ctx, seg, slotW * (i + 0.5), barY + barH / 2, {
            fontStr: font(FONTS.body, 10),
            color: 'rgba(255,255,255,0.7)',
          });
        });
      }
    }
  },
};
