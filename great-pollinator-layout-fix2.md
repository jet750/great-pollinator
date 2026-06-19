# Great Pollinator — Layout Fix Pass 2 + Vercel Protection Fix

Read entirely before touching any code. Two independent workstreams below.

---

## PART A: Vercel Deployment Protection — Fix pollinator.jaxontravis.com

The site returns 403 `host_not_allowed` on all URLs including raw Vercel deployment URLs. This means Vercel Authentication (deployment protection) is enabled on the project, blocking all public traffic.

**Fix: Disable deployment protection so the site is publicly accessible.**

1. Open https://vercel.com/jaxon-travis/great-pollinator/settings/deployment-protection
2. Under "Vercel Authentication", toggle it OFF (set to "Disabled").
3. Under "Password Protection", confirm it is also off.
4. Save. The domain `pollinator.jaxontravis.com` should resolve within ~30 seconds.

**No code changes needed for this part.** This is a Vercel dashboard toggle.

---

## PART B: UI Layout Fixes — StartScreen and HiveStore

Files in scope for code changes:
- `src/game/ui/StartScreen.js`
- `src/game/ui/HiveStore.js`

Do NOT touch any other files.

---

### Fix B1 — StartScreen: Bee silhouette overlapping subtitle + rules not separating

**What's broken (from screenshot):**
- The bee silhouette `ctx.translate(0, isMobile ? -56 : -66)` is positioned too high, landing directly on top of the "A Botanical Field Expedition" italic subtitle.
- The four rules display as one visually merged block — individual rules need more visual separation so each reads as a discrete item.
- The `y` budget after the illustration section is tight, causing everything from rules onward to compress.

**Fix in `StartScreen.draw()`:**

1. **Move the illustration below the subtitle, not above it.** Currently the subtitle renders at `y += titleSize * 0.7 + 14` then the illustration at the same `y` position. Restructure so subtitle renders first, then a gap, then the illustration:

```js
// After title:
y += titleSize + 8;  // tighter gap — title to subtitle

text(ctx, 'A Botanical Field Expedition', cx, y, {
  fontStr: `italic ${font(FONTS.body, 16)}`,
  color: rgba(COLORS.ink, 0.65),
});
y += 28;  // subtitle to illustration gap

// Illustration block — bee above the flower
ctx.save();
ctx.translate(cx, y + (isMobile ? 34 : 42));
drawFlower(ctx, isMobile ? 34 : 42, 12, COLORS.gold, '#5A3D1F');
ctx.translate(0, isMobile ? -50 : -60);  // bee sits above flower, clear of subtitle
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
y += isMobile ? 86 : 100;  // advance past illustration
```

2. **Rules block: add a visual separator between rules.** Each rule should be separated by a short ink-line rule or at minimum a larger gap. Replace the rules rendering loop with:

```js
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
```

3. **Remove the separate subtitle `text()` call** that currently follows the title, since it is now placed inline above the illustration in step 1.

4. **Start `y` at `h * 0.10`** (currently `h * 0.13`) to give a tiny extra top margin that helps the bottom elements not compress.

5. The "Tap anywhere to enable audio" and high score lines and "PRESS ENTER" prompt stay unchanged — they will now fall naturally into available space below the rules.

---

### Fix B2 — HiveStore Hangar: "SELECT YOUR CRAFT" overlapping tabs + stats behind buttons

**What's broken (from screenshot):**
- "SELECT YOUR CRAFT" subtitle renders at `contentY - 18` which puts it in the tab button area, visually overlapping the STORE/HANGAR tab row.
- "Banked pollen: N" renders at `contentY - 2`, also too close to the tabs.
- Within each craft card: Speed and Capacity stat text renders behind the SWITCH/ACTIVE/cost button because the button `ayy = cardY + cardH - 32` overlaps with `statY + 28`.

**Fix in `_drawHangar()`:**

1. **Move the subtitle and banked-pollen line down** so they sit inside the content area, not in the tab zone. Change:
```js
// BEFORE:
text(ctx, 'SELECT YOUR CRAFT', cx, contentY - 18, ...)
text(ctx, `Banked pollen: ${banked}`, cx, contentY - 2, ...)
const gridY = contentY + 10;
```
to:
```js
// AFTER:
text(ctx, 'SELECT YOUR CRAFT', cx, contentY + 6, ...)
text(ctx, `Banked pollen: ${banked}`, cx, contentY + 22, ...)
const gridY = contentY + 38;  // push grid down to clear these labels
```

2. **Fix the card internal layout** so stats and the action button don't collide. The card height (`cardH`) is dynamically computed. The action button currently anchors at `cardY + cardH - 32`. Stats start at `cardY + 70`. On small panels the stats at `statY + 28` (Capacity) can fall at or below `cardY + cardH - 44`, colliding with the button.

Fix: add a `clampedStatY` that ensures the stats block never starts so low that it overlaps the button area. Change:

```js
// BEFORE:
const statY = cardY + 72;
text(ctx, `HP ${craft.hp}`, ccx, statY, ...)
text(ctx, `Speed ${craft.speed}`, ccx, statY + 14, ...)
text(ctx, `Capacity ${craft.capacity}`, ccx, statY + 28, ...)
this._wrapText(ctx, craft.special, ccx, statY + 48, cardW - 24, 11, ...)
```

```js
// AFTER:
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
```

3. **Increase action button height slightly** from `24` to `26` for better tap target and visual weight. Update the button panel/text/btn calls:
```js
const ayy = cardY + cardH - 34;
// all three button variants: change height from 24 → 26
panel(ctx, ax, ayy, aw, 26, ...)
text(ctx, ..., ax + aw / 2, ayy + 13, ...)  // vertical center of 26px = 13
this._btn('...', ax, ayy, aw, 26, ...)
```

4. **Reduce craft name font** from `18` back to `16` — it was bumped previously and is now too large for the card width on mobile, which causes it to approach the icon. `font(FONTS.title, 16, '600')`.

---

### Fix B3 — HiveStore STORE tab: detail text overflow

**What's broken (not shown in screenshot but consistent with the same class of issue):**
The STORE tab renders `detail` text like `Lv 0/5  ×0.95 per level (stacking)` at font size 10, left-aligned starting at `rx + 12`. On narrow panels this text can overflow the right edge of the card (into the buy button area).

**Fix in `_drawStore()`:**

Clamp the detail text rendering width by measuring it and truncating with ellipsis if it would overflow the button:

```js
// After computing `detail`, before the text() call:
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
```

Replace the existing `text(ctx, detail, rx + 12, ry + 28, ...)` call with the above block.

---

## Commit message (after all B fixes)

`fix: layout pass 2 — start screen bee/subtitle separation, hangar label/stats/button overlap, store detail text clamp`

