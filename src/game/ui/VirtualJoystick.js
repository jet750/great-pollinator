// On-canvas virtual joystick for mobile (shown only when innerWidth < 768).
// Left: movement joystick (8-direction snapped). Right: dash/sting button.
// Center-bottom: heal button. main.js feeds logical-canvas touch coords in.

import { COLORS, FONTS, font, text, rgba } from '../utils/renderer.js';
import { clamp } from '../utils/math.js';

const BASE_RADIUS = 55;
const KNOB_RADIUS = 22;
const ATTACK_RADIUS = 40;
const HEAL_RADIUS = 28;
const DEADZONE = 0.28;

export class VirtualJoystick {
  constructor() {
    this.moveVec = { x: 0, y: 0 };
    this._attackRequested = false;
    this._healRequested = false;

    this._joyId = null;
    this._knobX = 0; // offset from base center
    this._knobY = 0;
    this._attackActive = false; // visual press
    this._attackId = null;
    this._healActive = false;
    this._healId = null;

    this.w = 0;
    this.h = 0;
  }

  // Offsets include a 16px bottom inset on top of the original gaps so there is
  // always visible breathing room above any remaining system UI.
  _baseCenter() {
    return { x: 95, y: this.h - 111 };
  }
  _attackCenter() {
    return { x: this.w - 75, y: this.h - 111 };
  }
  _healCenter() {
    return { x: this.w / 2, y: this.h - 66 };
  }

  setViewport(w, h) {
    this.w = w;
    this.h = h;
  }

  _within(cx, cy, x, y, r) {
    const dx = x - cx;
    const dy = y - cy;
    return dx * dx + dy * dy <= r * r;
  }

  touchStart(id, x, y) {
    const base = this._baseCenter();
    const atk = this._attackCenter();
    const heal = this._healCenter();
    // Generous hit area for the joystick (whole lower-left quadrant near base).
    if (this._joyId == null && this._within(base.x, base.y, x, y, BASE_RADIUS + 40)) {
      this._joyId = id;
      this._updateKnob(x, y);
      return;
    }
    if (this._within(atk.x, atk.y, x, y, ATTACK_RADIUS + 10)) {
      this._attackActive = true;
      this._attackId = id;
      this._attackRequested = true;
      return;
    }
    if (this._within(heal.x, heal.y, x, y, HEAL_RADIUS + 10)) {
      this._healActive = true;
      this._healId = id;
      this._healRequested = true;
    }
  }

  touchMove(id, x, y) {
    if (id === this._joyId) this._updateKnob(x, y);
  }

  touchEnd(id) {
    if (id === this._joyId) {
      this._joyId = null;
      this._knobX = 0;
      this._knobY = 0;
      this.moveVec = { x: 0, y: 0 };
    }
    if (id === this._attackId) {
      this._attackActive = false;
      this._attackId = null;
    }
    if (id === this._healId) {
      this._healActive = false;
      this._healId = null;
    }
  }

  reset() {
    this._joyId = null;
    this._attackId = null;
    this._healId = null;
    this._knobX = 0;
    this._knobY = 0;
    this._attackActive = false;
    this._healActive = false;
    this.moveVec = { x: 0, y: 0 };
  }

  _updateKnob(x, y) {
    const base = this._baseCenter();
    let dx = x - base.x;
    let dy = y - base.y;
    const mag = Math.hypot(dx, dy);
    if (mag > BASE_RADIUS) {
      dx = (dx / mag) * BASE_RADIUS;
      dy = (dy / mag) * BASE_RADIUS;
    }
    this._knobX = dx;
    this._knobY = dy;

    const norm = clamp(mag / BASE_RADIUS, 0, 1);
    if (norm < DEADZONE) {
      this.moveVec = { x: 0, y: 0 };
    } else {
      // Quantize to nearest 45° for crisp 8-directional movement.
      const raw = Math.atan2(dy, dx);
      const snapped = Math.round(raw / (Math.PI / 4)) * (Math.PI / 4);
      this.moveVec = { x: Math.cos(snapped), y: Math.sin(snapped) };
    }
  }

  // main polls these once per frame (edge-triggered).
  pollAttack() {
    const v = this._attackRequested;
    this._attackRequested = false;
    return v;
  }
  pollHeal() {
    const v = this._healRequested;
    this._healRequested = false;
    return v;
  }

  draw(ctx) {
    const base = this._baseCenter();
    const atk = this._attackCenter();
    const heal = this._healCenter();

    // joystick base
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = rgba(COLORS.obsidian, 0.6);
    ctx.beginPath();
    ctx.arc(base.x, base.y, BASE_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = rgba(COLORS.parchment, 0.5);
    ctx.lineWidth = 2;
    ctx.stroke();
    // knob
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = rgba(COLORS.gold, 0.8);
    ctx.beginPath();
    ctx.arc(base.x + this._knobX, base.y + this._knobY, KNOB_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    // attack button
    ctx.save();
    ctx.globalAlpha = this._attackActive ? 0.95 : 0.6;
    ctx.fillStyle = this._attackActive ? rgba(COLORS.crimson, 0.85) : rgba(COLORS.ember, 0.6);
    ctx.beginPath();
    ctx.arc(atk.x, atk.y, ATTACK_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = 2;
    ctx.stroke();
    // sting icon (downward triangle)
    ctx.fillStyle = COLORS.parchment;
    ctx.beginPath();
    ctx.moveTo(atk.x - 8, atk.y - 8);
    ctx.lineTo(atk.x + 8, atk.y - 8);
    ctx.lineTo(atk.x, atk.y + 12);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // heal button
    ctx.save();
    ctx.globalAlpha = this._healActive ? 0.95 : 0.55;
    ctx.fillStyle = rgba(COLORS.green, 0.7);
    ctx.beginPath();
    ctx.arc(heal.x, heal.y, HEAL_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = 2;
    ctx.stroke();
    // vial icon
    ctx.fillStyle = COLORS.parchment;
    ctx.fillRect(heal.x - 4, heal.y - 9, 8, 16);
    ctx.strokeRect(heal.x - 4, heal.y - 9, 8, 16);
    ctx.restore();

    text(ctx, '+', heal.x, heal.y, { fontStr: font(FONTS.mono, 12, '700'), color: COLORS.green });
  }
}
