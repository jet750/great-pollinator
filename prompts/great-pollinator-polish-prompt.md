# Great Pollinator — Polish Pass: 6 Targeted Fixes

Read this file in full before touching any code. Work through all 6 fixes in order. Commit after all 6 are complete. Do not modify any file not listed below.

---

## Files in scope (touch ONLY these)

- `src/game/ui/StartScreen.js`
- `src/game/ui/HiveStore.js`
- `src/game/ui/Minimap.js`
- `src/game/entities/pickups/PowerUpPlant.js`
- `src/game/world/Meadow.js`
- `src/game/entities/Bee.js`

Do NOT touch `src/game/main.js`, App.jsx, any scene files, or any other file.

---

## Fix 1 — StartScreen: Fix overlapping / cramped text layout

**Problem:** Title text overlaps the subtitle, the rules block lines run into each other, and the "PRESS ENTER" prompt gets pushed below the visible canvas on smaller screens.

**Solution in `src/game/ui/StartScreen.js`:**

Replace the entire `draw` method with a new layout that:

1. Measures actual available vertical space (`h`) and distributes elements proportionally — never hardcode absolute `y` offsets that overflow.
2. Uses a computed `lineGap` of at least `titleSize * 1.1 + 10` below the title before placing the subtitle — so the title never sits on top of the subtitle.
3. Reduces the illustration section height to `isMobile ? 80 : 100` (it's currently eating too much space at `110/130`).
4. For the rules block: set `lineHeight` to `16`, and compute the max width as `Math.min(460, w - 60)` — slightly tighter so lines don't crowd the edges on narrow viewports.
5. Adds a fixed minimum gap of `12px` between each completed rule block (currently uses `+6` which causes overlap when a rule wraps to 2 lines).
6. Clamps the "TAP/PRESS ENTER" prompt to `Math.min(y + 16, h - 30)` so it never renders off-screen.
7. Does NOT change any colors, fonts, assets, or game logic — this is a layout-only fix.

The key structural change: switch from cumulative `y +=` increments (which overflow when wraps happen) to a budget approach: compute the total height of all static elements first, then distribute vertical space proportionally across sections.

---

## Fix 2 — HiveStore Hangar tab: Fix craft card text legibility

**Problem:** In the Hangar tab, craft names, stats, and the special ability text are hard to read — the font sizes and card internal layout are too cramped, especially the `_wrapText` call for `craft.special` which can overlap the action button.

**Solution in `src/game/ui/HiveStore.js`:**

In the `_drawHangar` method:

1. Increase the craft name font size from `17` to `18` in the `text(ctx, craft.name, ...)` call.
2. Increase all three stat lines from size `11` to `12`.
3. For `craft.special` wrapped text: change font size from `10` to `11`, and reduce `lineHeight` from `12` to `11` to keep it compact but readable.
4. Clamp the `statY` starting position: change `const statY = cardY + 70` to `const statY = cardY + 72` to give the illustration a tiny bit more breathing room.
5. For the action button area at the bottom: change `cardY + cardH - 32` to `cardY + cardH - 34` to prevent button text from clipping the card border.
6. In `_wrapText`, ensure `maxWidth` passed in is `cardW - 24` (not `cardW - 16`) so long ability text wraps earlier and doesn't overflow the card edge. Update the call site: `this._wrapText(ctx, craft.special, ccx, statY + 48, cardW - 24, 11, ...)`.

---

## Fix 3 — Minimap: Show flowers and stationary enemies

**Problem:** The minimap only shows the hive and safe pads. Flowers (pollen pickups) and stationary enemies (CarnivorousPlant, Frog, Patroller) are not shown — making the minimap much less useful as a navigation aid.

**Solution in `src/game/ui/Minimap.js`:**

The `draw` method signature is `draw(ctx, { bee, meadow, x, y, size })`. In `main.js`, it's called as:
`this.minimap.draw(ctx, { bee: this.bee, meadow: this.meadow, x, y, size });`

Update the `Minimap.draw` method to also accept `flowers` and `staticEnemies` arrays. Then update the call in `src/game/main.js` inside `_renderMinimap` to pass them:

```js
this.minimap.draw(ctx, {
  bee: this.bee,
  meadow: this.meadow,
  x,
  y,
  size,
  flowers: this.pollen,        // all active pollen pickups
  staticEnemies: this.enemies.filter(e => !e.dead && (e.constructor.name === 'CarnivorousPlant' || e.constructor.name === 'Frog' || e.constructor.name === 'Patroller')),
});
```

WAIT — `main.js` is not in scope. Instead, update `Minimap.draw` to accept an optional `flowers` and `staticEnemies` from the options destructure with default `[]`, and update `_renderMinimap` in `main.js`... 

Actually, since we cannot touch main.js, update Minimap.draw to pull flowers and staticEnemies from the `meadow` object if present, OR accept them as optional params. The cleanest approach: add them as optional destructured params with defaults:

```js
draw(ctx, { bee, meadow, x, y, size = 120, flowers = [], staticEnemies = [] }) {
```

Then update `main.js`'s `_renderMinimap` call to pass them. Wait — `main.js` IS NOT in scope.

**Revised approach (no main.js edit needed):** Pass the extra data via a `game` reference on the minimap OR have main.js pass them. Since we can't touch main.js, update the minimap to accept an extended options object and edit the call site in main.js.

**CORRECTION: `main.js` IS in scope for the minimap call only.** Add `flowers` and `staticEnemies` to the minimap draw call in `_renderMinimap` in `src/game/main.js`. This is a 2-line targeted edit to `main.js` and it does not affect any other logic.

Files actually touched for Fix 3:
- `src/game/ui/Minimap.js` — update `draw()` signature and add rendering
- `src/game/main.js` — update the `_renderMinimap` call only (no other changes)

In `Minimap.draw`, after drawing the safe pads and before drawing the fog layer, add:

**Flowers (pollen dots):**
```js
// Flowers / pollen pickups — tiny dots colored by rarity
if (flowers && flowers.length) {
  for (const f of flowers) {
    const fx = x + f.x * scale;
    const fy = y + f.y * scale;
    ctx.beginPath();
    ctx.arc(fx, fy, 1.5, 0, Math.PI * 2);
    // color by type: common=gold, uncommon=ember/orange, rare=crimson
    const dotColor = f.type === 'rare' ? '#C0392B' : f.type === 'uncommon' ? '#D4812A' : COLORS.gold;
    ctx.fillStyle = dotColor;
    ctx.fill();
  }
}
```

**Stationary enemies — draw AFTER fog so they are always visible:**
Draw them after `ctx.drawImage(fog, x, y)` and before the player dot:

```js
if (staticEnemies && staticEnemies.length) {
  for (const e of staticEnemies) {
    const ex = x + e.x * scale;
    const ey = y + e.y * scale;
    ctx.beginPath();
    ctx.arc(ex, ey, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = '#C0392B'; // crimson — danger indicator
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }
}
```

The player dot must still render last (topmost).

In `src/game/main.js`, find `_renderMinimap` and change the `this.minimap.draw(...)` call to:
```js
this.minimap.draw(ctx, {
  bee: this.bee,
  meadow: this.meadow,
  x,
  y,
  size,
  flowers: this.pollen,
  staticEnemies: this.enemies.filter(
    (e) => !e.dead && (
      e.constructor.name === 'CarnivorousPlant' ||
      e.constructor.name === 'Frog' ||
      e.constructor.name === 'Patroller'
    )
  ),
});
```

---

## Fix 4 — Ironweed → Rose: Rename healing plant and redraw it

**Problem:** The `ironweed` power-up plant (full heal) has no accurate botanical identity. Rename it to `Rose` and redraw it as a recognizable red rose.

**Solution in `src/game/entities/pickups/PowerUpPlant.js`:**

1. In `POWERUP_DEFS`, change the `ironweed` entry's `label` from `'Ironweed'` to `'Rose'`. Keep the `id` as `'ironweed'` (internal key — do not rename the id, as it's referenced in `main.js` and world spawn). Change its color from `'#6B8B3A'` to `'#C0392B'` (deep red).

2. In `draw()`, find the `case 'ironweed':` and replace the call to `this._drawIronweed(ctx)` with `this._drawRose(ctx)`.

3. Remove the `_drawIronweed` method entirely and add a new `_drawRose(ctx)` method:

```js
_drawRose(ctx) {
  ctx.save();
  ctx.translate(0, -4);

  // Five overlapping petals arranged in a circle
  const petalColor = '#C0392B'; // deep red
  const petalStroke = 'rgba(80, 10, 10, 0.6)';
  ctx.strokeStyle = petalStroke;
  ctx.lineWidth = 1;

  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
    ctx.save();
    ctx.rotate(angle);
    ctx.beginPath();
    // Petal: narrow ellipse offset from center
    ctx.ellipse(0, -8, 5, 9, 0, 0, Math.PI * 2);
    ctx.fillStyle = petalColor;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // Inner petals (slightly smaller, rotated 36°)
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2 - Math.PI / 2 + Math.PI / 5;
    ctx.save();
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.ellipse(0, -5, 3.5, 6, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#A93226'; // slightly darker inner
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // Center bud
  ctx.beginPath();
  ctx.arc(0, 0, 4, 0, Math.PI * 2);
  ctx.fillStyle = '#922B21';
  ctx.fill();
  ctx.strokeStyle = petalStroke;
  ctx.stroke();

  ctx.restore();
}
```

4. The pulse ring aura is already rendered from the parent `draw()` method using `this.color` — since we changed `ironweed`'s color to `'#C0392B'`, the aura will now be red/rose-colored automatically. No change needed there.

5. Update the label displayed in-world. The `POWERUP_DEFS.ironweed.label` is used by `HUD.js` for the active power-up display. Changing it to `'Rose'` is sufficient — no other files need touching.

---

## Fix 5 — Combat: Remove self-damage when attacking (only take damage when HIT)

**Problem:** When the player attacks an enemy frontally, `_resolveHit` calls `this.takeDamage(...)` on the bee — dealing 25% of the enemy's base damage as recoil. The spec says the player should only take damage when an enemy hits them, not when the player initiates an attack.

**Solution in `src/game/entities/Bee.js`:**

Find `_resolveHit` and the `else` block (frontal hit path):

```js
} else {
  const dmg = enemy.dashDamage
    ? enemy.dashDamage(this.attackDamage * 0.5, false)
    : this.attackDamage * 0.5;
  enemy.takeDamage(dmg, { fromDash: true });
  // 25% of the enemy's base damage back to the player, no i-frame granted.
  this.takeDamage((enemy.damage || 0) * 0.25, { ignoreIFrames: true, applyIFrame: false });
}
```

Remove the self-damage line entirely. The `else` block should become:

```js
} else {
  const dmg = enemy.dashDamage
    ? enemy.dashDamage(this.attackDamage * 0.5, false)
    : this.attackDamage * 0.5;
  enemy.takeDamage(dmg, { fromDash: true });
  // Frontal hit: deal reduced damage to enemy but no recoil to player.
  // Player only takes damage when enemies actively hit them.
}
```

No other changes to Bee.js.

---

## Fix 6 — Thorns: Replace scattered small rectangles with chokepoint barrier walls

**Problem:** The current thorns are 6 small scattered rectangles (`120×60` or `60×120`) that act as minor obstacles but don't meaningfully shape the map. The requirement is for thorn barriers that create natural chokepoints — forcing the player to navigate between map zones through narrow passages, like a loose maze, without creating a single forced route.

**Solution in `src/game/world/Meadow.js`:**

Replace the `this.thorns` array definition with a new set of larger, strategically placed thorn walls that divide the 3200×3200 world into connected zones with 180–220px chokepoints between them.

Design goal: divide the map into rough quadrants with corridors between them. The hive is at (1600, 1600). Passages should allow free travel but require deliberate navigation.

Replace the existing `this.thorns = [...]` block with:

```js
// Thorn barrier system: four named wall groups creating maze-like chokepoints.
// Each barrier is a wide/tall rectangle that blocks direct cross-map movement.
// Gaps between barriers create the navigable passages (180-220px wide).
// The hive at (1600,1600) sits in the central open zone.
this.thorns = [
  // --- NORTH CORRIDOR WALL ---
  // Runs east-west across the upper third of the map, split into two segments
  // with a 200px gap near the center (passage at x≈1500–1700) and
  // a 180px gap at the west edge (passage at x≈280–460).
  { x: 460, y: 900, w: 1040, h: 40 },   // west segment: x460→1500
  { x: 1700, y: 900, w: 1040, h: 40 },  // east segment: x1700→2740

  // --- SOUTH CORRIDOR WALL ---
  // Mirror of north wall across the lower third, gap at center and east edge.
  { x: 460, y: 2260, w: 1040, h: 40 },  // west segment
  { x: 1700, y: 2260, w: 940, h: 40 },  // east segment: x1700→2640

  // --- WEST CORRIDOR WALL ---
  // Runs north-south across the left third, gap near center (y≈1500–1720)
  // and near the south end (y≈2080–2260 gap connects south and west zones).
  { x: 900, y: 460, w: 40, h: 440 },    // north segment: y460→900
  { x: 900, y: 1720, w: 40, h: 360 },   // south-center segment: y1720→2080

  // --- EAST CORRIDOR WALL ---
  // Mirror of west wall on the right third.
  { x: 2260, y: 460, w: 40, h: 440 },   // north segment
  { x: 2260, y: 1720, w: 40, h: 360 },  // south-center segment

  // --- INNER RING (smaller blockers near the hive to prevent direct dash-through) ---
  { x: 1260, y: 1260, w: 120, h: 30 },  // NW inner
  { x: 1820, y: 1260, w: 120, h: 30 },  // NE inner
  { x: 1260, y: 1910, w: 120, h: 30 },  // SW inner
  { x: 1820, y: 1910, w: 120, h: 30 },  // SE inner
];
```

The drawing code in `drawHazards` for thorns does NOT change — the existing rect-fill with bramble strokes already works for any rectangle size. No drawing changes needed.

**IMPORTANT:** After changing thorn positions, verify that none of the thorn rectangles overlap the hive zone (center 1600,1600 radius 60) or the safe pads at (800,800) and (2400,2400). The layout above is pre-verified to avoid these. Do not move the rectangles.

Also update the `drawHazards` thorn rendering to visually convey that these are walls, not just squares. In the existing thorn drawing loop in `drawHazards`, after the bramble strokes, add a subtle inner shadow line along the top and left edges to give the wall depth:

```js
// Wall edge highlight (top + left inner edge)
ctx.strokeStyle = rgba('#6B6040', 0.5);
ctx.lineWidth = 2;
ctx.beginPath();
ctx.moveTo(th.x + 2, th.y + th.h - 2);
ctx.lineTo(th.x + 2, th.y + 2);
ctx.lineTo(th.x + th.w - 2, th.y + 2);
ctx.stroke();
```

---

## Commit message

`fix: polish pass — start screen layout, store text legibility, minimap flowers/enemies, rose heal plant, no attack self-damage, chokepoint thorn barriers`

