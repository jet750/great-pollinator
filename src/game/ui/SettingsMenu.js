// Full-canvas settings overlay (same panel style as CheatMenu).
//
// Accessible from the START screen (ESC) or the HIVE (gear icon). NOT available
// mid-game. Exposes draw() and a small intent API consumed by main.js:
//   { action: 'close' }
//   { action: 'set-volume', kind: 'master' | 'sfx', value: 0–100 }
//   { action: 'toggle-mute' }
//   { action: 'toggle-joystick' }
//   { action: 'toggle-controls' }
//
// Sliders are drag-tracked: hitTest() begins a drag on press, drag() continues
// it on pointer move, endDrag() releases it. Active drag state lives on the
// instance. Pure canvas rendering — no DOM.

import { COLORS, FONTS, font, text, panel, rgba } from '../utils/renderer.js';

export class SettingsMenu {
  constructor() {
    this._sliders = {}; // kind -> { x, w, hy } track geometry, set each draw
    this._buttons = []; // { x, y, w, h, intent }
    this._drag = null;  // 'master' | 'sfx' while a slider is being dragged
  }

  _valueFromX(kind, x) {
    const s = this._sliders[kind];
    if (!s) return 0;
    const t = Math.max(0, Math.min(1, (x - s.x) / s.w));
    return Math.round(t * 100);
  }

  /** Pointer-down. Begins a slider drag or returns a button intent (or null). */
  hitTest(x, y) {
    for (const kind of ['master', 'sfx']) {
      const s = this._sliders[kind];
      if (!s) continue;
      if (x >= s.x - 14 && x <= s.x + s.w + 14 && y >= s.hy - 18 && y <= s.hy + 18) {
        this._drag = kind;
        return { action: 'set-volume', kind, value: this._valueFromX(kind, x) };
      }
    }
    for (const b of this._buttons) {
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
        return b.intent;
      }
    }
    return null;
  }

  /** Pointer-move while a slider drag is active. */
  drag(x /* , y */) {
    if (!this._drag) return null;
    return { action: 'set-volume', kind: this._drag, value: this._valueFromX(this._drag, x) };
  }

  endDrag() {
    this._drag = null;
  }

  draw(ctx, { w, h, audio, joystick, showControls }) {
    this._buttons = [];

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.fillRect(0, 0, w, h);

    const pw = Math.min(440, w - 32);
    const ph = Math.min(470, h - 32);
    const px = (w - pw) / 2;
    const py = (h - ph) / 2;
    panel(ctx, px, py, pw, ph, { fill: COLORS.parchment, stroke: COLORS.ink, lineWidth: 3, radius: 12 });

    text(ctx, '⚙ SETTINGS', px + pw / 2, py + 26, {
      fontStr: font(FONTS.title, 22, '700'),
      color: COLORS.ink,
    });

    ctx.strokeStyle = rgba(COLORS.ink, 0.18);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px + 20, py + 46);
    ctx.lineTo(px + pw - 20, py + 46);
    ctx.stroke();

    const padX = 28;
    const trackX = px + padX;
    const trackW = pw - padX * 2;
    let cy = py + 80;

    cy = this._drawSlider(ctx, 'master', 'Master Volume', audio.masterVolume, trackX, cy, trackW);
    cy = this._drawSlider(ctx, 'sfx', 'SFX Volume', audio.sfxVolume, trackX, cy, trackW);

    cy = this._drawToggle(ctx, 'Mute All', audio.muted ? 'ON' : 'OFF', audio.muted,
      { action: 'toggle-mute' }, trackX, cy, trackW);
    cy = this._drawToggle(ctx, 'Joystick Side', joystick.flipped ? 'Right' : 'Left', joystick.flipped,
      { action: 'toggle-joystick' }, trackX, cy, trackW);
    cy = this._drawToggle(ctx, 'Show Controls Bar', showControls ? 'ON' : 'OFF', showControls,
      { action: 'toggle-controls' }, trackX, cy, trackW);

    // Close button.
    const cbW = 160;
    const cbX = px + (pw - cbW) / 2;
    const cbY = py + ph - 52;
    panel(ctx, cbX, cbY, cbW, 36, { fill: rgba(COLORS.gold, 0.25), stroke: COLORS.ink, lineWidth: 2, radius: 8 });
    text(ctx, 'Close', cbX + cbW / 2, cbY + 18, { fontStr: font(FONTS.title, 18, '600'), color: COLORS.ink });
    this._buttons.push({ x: cbX, y: cbY, w: cbW, h: 36, intent: { action: 'close' } });

    ctx.restore();
  }

  _drawSlider(ctx, kind, label, value, x, y, w) {
    text(ctx, label, x, y, { fontStr: font(FONTS.body, 13, '700'), color: COLORS.ink, align: 'left' });
    text(ctx, `${value}`, x + w, y, { fontStr: font(FONTS.mono, 12, '700'), color: rgba(COLORS.ink, 0.7), align: 'right' });

    const ty = y + 22; // track center
    const t = Math.max(0, Math.min(1, value / 100));
    const knobX = x + t * w;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineWidth = 6;
    ctx.strokeStyle = rgba(COLORS.ink, 0.2);
    ctx.beginPath();
    ctx.moveTo(x, ty);
    ctx.lineTo(x + w, ty);
    ctx.stroke();
    ctx.strokeStyle = COLORS.gold;
    ctx.beginPath();
    ctx.moveTo(x, ty);
    ctx.lineTo(knobX, ty);
    ctx.stroke();
    ctx.restore();

    ctx.beginPath();
    ctx.arc(knobX, ty, 10, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.parchment;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = COLORS.ink;
    ctx.stroke();

    this._sliders[kind] = { x, w, hy: ty };
    return ty + 36;
  }

  _drawToggle(ctx, label, valueLabel, on, intent, x, y, w) {
    const rowH = 28;
    text(ctx, label, x, y + rowH / 2, { fontStr: font(FONTS.body, 13, '700'), color: COLORS.ink, align: 'left' });
    const tw = 76;
    const tx = x + w - tw;
    const ty = y + (rowH - 24) / 2;
    panel(ctx, tx, ty, tw, 24, {
      fill: on ? rgba(COLORS.gold, 0.3) : rgba(COLORS.ink, 0.06),
      stroke: on ? COLORS.gold : rgba(COLORS.ink, 0.35),
      lineWidth: on ? 2 : 1,
      radius: 6,
    });
    text(ctx, valueLabel, tx + tw / 2, ty + 12, { fontStr: font(FONTS.body, 11, '700'), color: COLORS.ink });
    this._buttons.push({ x: tx, y: ty, w: tw, h: 24, intent });
    return y + rowH + 16;
  }
}
