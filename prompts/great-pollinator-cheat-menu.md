# Great Pollinator — Dev Cheat Menu

Read entirely before touching any code. This adds a developer cheat overlay triggered by backtick (`) on desktop and 7 rapid attack-button taps on mobile. It must never affect production game state unless the player explicitly uses a cheat action. Commit at the end.

---

## Files in scope

- `src/game/main.js`
- `src/game/ui/CheatMenu.js` (new file)

Do not touch any other files.

---

## How it works

The cheat menu is a full-canvas overlay (same style as HiveStore) that renders on top of everything. It is toggled open/closed. While open, the game loop continues running underneath (state does not pause) — the overlay is purely UI. Cheat actions take effect immediately on click/tap and close the menu automatically.

---

## New file: `src/game/ui/CheatMenu.js`

```js
// Dev cheat menu — toggled by ` (backtick) on desktop or 7 rapid attack taps on mobile.
// Renders as a full-canvas overlay. Game continues running underneath.
// All cheat actions mutate progress directly via a callback: onCheat(action, value).

import { COLORS, FONTS, font, text, panel, rgba } from '../utils/renderer.js';
import { BIOME_ORDER } from '../world/biomeConfig.js';

const ACTIONS = [
  { id: 'biome_meadow',      label: 'Switch → Meadow',        sub: 'set active biome' },
  { id: 'biome_forest',      label: 'Switch → Forest',        sub: 'unlock + set active' },
  { id: 'biome_garden',      label: 'Switch → Garden',        sub: 'unlock + set active' },
  { id: 'biome_greenhouse',  label: 'Switch → Greenhouse',    sub: 'unlock + set active' },
  { id: 'pollen_500',        label: '+500 Banked Pollen',     sub: 'added to total banked' },
  { id: 'pollen_2000',       label: '+2000 Banked Pollen',    sub: 'added to total banked' },
  { id: 'max_upgrades',      label: 'Max All Upgrades',       sub: 'sets all levels to biome cap' },
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
    const btnW = (pw - 48) / cols;
    const btnH = 44;
    const startY = py + 62;
    const colGap = 16;

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
```

---

## Changes to `src/game/main.js`

### Import

Add at the top with other UI imports:
```js
import { CheatMenu } from './ui/CheatMenu.js';
```

### Constructor additions

After `this.biomeSelect = new BiomeSelect();`:
```js
this.cheatMenu = new CheatMenu();
this._cheatOpen = false;

// Mobile combo detector — 7 rapid attack taps within 2.5s
this._cheatTapTimes = [];
```

### Toggle cheat menu in `_handleKeyDown`

Inside `_handleKeyDown`, after the existing key checks, add:
```js
if (k === '`') {
  this._cheatOpen = !this._cheatOpen;
  return;
}
```

### Mobile combo detection in `_handleTouchStart` / joystick attack path

In `_handleTouchStart`, find where `joystick.touchStart` fires and where `_attackRequested` would be set. After the joystick processes the attack tap, add:
```js
// Dev cheat combo: 7 rapid attack-button taps within 2.5s
if (this.joystick.consumeAttack && this.joystick._attackRequested) {
  // NOTE: _attackRequested was just set; record the time
}
```

Actually, the cleaner approach: in `_handleTouchStart`, after processing the joystick touch, check if an attack was just registered:
```js
// After joystick.touchStart(t.identifier, p.x, p.y):
const atkCenter = this.joystick._attackCenter();
const ATTACK_RADIUS_HIT = 50;
const dx = p.x - atkCenter.x, dy = p.y - atkCenter.y;
if (Math.sqrt(dx*dx + dy*dy) <= ATTACK_RADIUS_HIT) {
  const now = performance.now();
  this._cheatTapTimes.push(now);
  // Keep only taps within the last 2500ms
  this._cheatTapTimes = this._cheatTapTimes.filter(t => now - t <= 2500);
  if (this._cheatTapTimes.length >= 7) {
    this._cheatOpen = !this._cheatOpen;
    this._cheatTapTimes = [];
  }
}
```

Place this block inside the `for (const t of e.changedTouches)` loop, after `this.joystick.touchStart(...)`.

### Pointer hit-test for cheat menu

In `_handlePointer(x, y)` (the unified pointer handler), add as the **first** check before anything else:
```js
if (this._cheatOpen) {
  const hit = this.cheatMenu.hitTest(x, y, (action) => this._applyCheat(action));
  if (!hit) this._cheatOpen = false; // tap outside closes
  return; // consume the event regardless
}
```

### `_applyCheat(action)` method

Add this new method:
```js
_applyCheat(action) {
  const up = this.progress.upgrades;
  const biomeCapFor = (b) => ({ meadow: 5, forest: 10, garden: 15, greenhouse: 20 }[b] ?? 5);

  switch (action) {
    case 'biome_meadow':
      this.progress.activeBiome = 'meadow';
      break;
    case 'biome_forest':
      this.progress.totalBanked = Math.max(this.progress.totalBanked, 200);
      this.progress.activeBiome = 'forest';
      break;
    case 'biome_garden':
      this.progress.totalBanked = Math.max(this.progress.totalBanked, 600);
      this.progress.activeBiome = 'garden';
      break;
    case 'biome_greenhouse':
      this.progress.totalBanked = Math.max(this.progress.totalBanked, 1400);
      this.progress.activeBiome = 'greenhouse';
      break;
    case 'pollen_500':
      this.progress.totalBanked += 500;
      break;
    case 'pollen_2000':
      this.progress.totalBanked += 2000;
      break;
    case 'max_upgrades': {
      const cap = biomeCapFor(this.progress.activeBiome || 'meadow');
      ['maxHp', 'damageReduction', 'attackBoost', 'pollenCapacity',
       'dashCooldown', 'magnetRadius', 'comboWindow'].forEach(k => {
        up[k] = Math.min(cap, 20);
      });
      up.healingItems = 3;
      // Re-apply to active craft immediately
      if (this.bee?.applyUpgrades) this.bee.applyUpgrades(up);
      break;
    }
    case 'unlock_all_crafts':
      up.unlockedCrafts = ['bee', 'moth', 'locust', 'hornet', 'butterfly', 'wasp', 'dragonfly', 'spider_craft'];
      break;
    case 'full_heal':
      if (this.bee) {
        this.bee.hp = this.bee.maxHp;
      }
      break;
    case 'kill_score_reset':
      this.progress.killScore = 0;
      this.sessionKillScore = 0;
      break;
    case 'reset_progress':
      resetProgress();
      this.progress = loadProgress();
      this._cheatOpen = false;
      this.newRun();
      return; // newRun handles the state reset, skip the save below
  }

  this._save();
  this._cheatOpen = false;
}
```

### Render the cheat menu overlay

In the `render()` method, at the very end after all other draw calls (but before `ctx.restore()` of the root save if there is one), add:
```js
if (this._cheatOpen) {
  this.cheatMenu.draw(ctx, { w: this.LW, h: this.LH });
}
```

This ensures the cheat overlay always renders on top of everything.

---

## Commit

```
git add src/game/ui/CheatMenu.js src/game/main.js
git commit -m "feat: dev cheat menu (backtick / 7-tap mobile combo) — biome switch, pollen add, max upgrades, unlock crafts, full heal, reset"
```

