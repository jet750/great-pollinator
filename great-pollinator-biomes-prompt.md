# The Great Pollinator — Biome Expansion (Phase 4)

Read this entire file before writing a single line of code. This is a large build organized into 8 sequential sections. Complete each section fully before moving to the next. Commit once at the very end with the message at the bottom of this file.

Do not modify any file not explicitly listed in each section. Do not touch `index.html`, `vite.config.js`, or `api/`.

---

## ARCHITECTURE OVERVIEW — read before starting

The game currently has one playable biome (Meadow, `src/game/world/Meadow.js`). This build adds:

1. Three new world files: `Forest.js`, `Garden.js`, `Greenhouse.js` — each a self-contained world class matching Meadow's interface
2. A `BIOMES` config in a new `src/game/world/biomeConfig.js` file that all systems read from
3. Four new craft files: `Butterfly.js`, `Wasp.js`, `Dragonfly.js`, `Spider.js`
4. Six new enemy files: `MothSwarm.js`, `Spider.js` (enemy), `Mantis.js`, `HornetNest.js`, `VenusFlyTrap.js`, `Centipede.js`
5. New power-up plant types added to `PowerUpPlant.js`
6. Expanded upgrade system in `HiveStore.js`, `storage.js`, and all craft files
7. A `BIOMES` tab added to the hive overlay replacing the standalone `BiomeSelect` screen
8. Kill score counter in HUD

**Key architectural rules:**
- Every world class (Meadow, Forest, Garden, Greenhouse) must expose the same interface: `WORLD_SIZE`, `hive`, `pads`, `thorns`, `windZones`, `webZones`, `rain`, `update(dt)`, `drawTerrain(ctx, cam)`, `drawHazards(ctx, cam, t)`, `drawStructures(ctx, cam, t)`, `drawWeather(ctx, w, h)`, `speedFactorAt(x, y)`, `windForceAt(x, y)`, `isInHiveZone(x, y)`, `isInSafePad(x, y)`, `pointInSafePad(x, y, r)`, `resolveThornCollision(prevX, prevY, nx, ny, radius)`
- `main.js` references `this.meadow` throughout — do NOT rename it. When a different biome is active, `this.meadow` holds the Forest/Garden/Greenhouse instance. The variable name stays `meadow` for compatibility.
- Enemy files live in `src/game/entities/enemies/`. Craft files live in `src/game/entities/`.
- The enemy namespace collision: the player craft `Spider.js` goes in `src/game/entities/Spider.js`; the enemy `Spider` goes in `src/game/entities/enemies/SpiderEnemy.js`.

---

## SECTION 1 — Biome Config + Storage Expansion

### 1A. New file: `src/game/world/biomeConfig.js`

```js
// Central config for all four biomes. Imported by main.js, HiveStore, BiomeSelect,
// and each world class.

export const BIOME_DEFS = {
  meadow: {
    id: 'meadow',
    name: 'Meadow',
    threat: 1,
    worldSize: 3200,
    unlockCost: 0,          // always available
    levelCap: 5,            // max upgrade level allowed in this biome
    border: '#8AB87E',
    bg: '#F0EBE2',
    swatches: ['#8AB87E', '#D4A83F', '#F0EBE2'],
    craftsAvailable: ['bee', 'moth'],   // purchasable starting here
    newUpgrade: 'pollenCapacity',       // upgrade type first available here
    description: 'Open flowering meadow. Low threat. Learn the basics.',
  },
  forest: {
    id: 'forest',
    name: 'Forest',
    threat: 2,
    worldSize: 4800,        // 1.5× meadow
    unlockCost: 200,
    levelCap: 10,
    border: '#3D5A3E',
    bg: '#D9CFC4',
    swatches: ['#3D5A3E', '#C4714A', '#D9CFC4'],
    craftsAvailable: ['locust', 'hornet'],
    newUpgrade: 'dashCooldown',
    description: 'Dense canopy, spider webs, root systems. Moderate threat.',
  },
  garden: {
    id: 'garden',
    name: 'Garden',
    threat: 3,
    worldSize: 6400,        // 2× meadow
    unlockCost: 600,
    levelCap: 15,
    border: '#D4928A',
    bg: '#F5F0E8',
    swatches: ['#D4928A', '#C4714A', '#F5F0E8'],
    craftsAvailable: ['butterfly', 'wasp'],
    newUpgrade: 'magnetRadius',
    description: 'Formal gardens, trellises, rose arches. High threat.',
  },
  greenhouse: {
    id: 'greenhouse',
    name: 'Greenhouse',
    threat: 4,
    worldSize: 8000,        // 2.5× meadow
    unlockCost: 1400,
    levelCap: 20,
    border: '#5A7A5A',
    bg: '#2A3A2A',
    swatches: ['#5A7A5A', '#B8D4C8', '#2A3A2A'],
    craftsAvailable: ['dragonfly', 'spider_craft'],
    newUpgrade: 'comboWindow',
    description: 'Glass house, tropical specimens, carnivorous clusters. Extreme threat.',
  },
};

export const BIOME_ORDER = ['meadow', 'forest', 'garden', 'greenhouse'];

/** Returns the level cap for the given biome id. */
export function levelCapFor(biomeId) {
  return BIOME_DEFS[biomeId]?.levelCap ?? 5;
}

/** Returns true if the player's totalBanked meets the unlock cost for biomeId. */
export function isBiomeUnlocked(biomeId, totalBanked) {
  return totalBanked >= (BIOME_DEFS[biomeId]?.unlockCost ?? 0);
}
```

### 1B. Update `src/game/utils/storage.js`

Add new fields to `DEFAULT_UPGRADES` and `STORAGE_KEYS`:

```js
// New STORAGE_KEYS entries:
ACTIVE_BIOME: 'pollinator_active_biome',
KILL_SCORE: 'pollinator_kill_score',

// New DEFAULT_UPGRADES fields:
pollenCapacity: 0,    // +5 carry per level, max 20 across all biomes
dashCooldown: 0,      // ×0.9 per level, unlocks in Forest
magnetRadius: 0,      // +20px per level, unlocks in Garden
comboWindow: 0,       // +0.5s per level, unlocks in Greenhouse
```

Add `activeBiome` and `killScore` to `loadProgress()` return object:
```js
activeBiome: localStorage.getItem('pollinator_active_biome') || 'meadow',
killScore: readNumber('pollinator_kill_score', 0),
```

Add save handling in `saveProgress(data)`:
```js
if (data.activeBiome != null) localStorage.setItem('pollinator_active_biome', data.activeBiome);
if (data.killScore != null) localStorage.setItem('pollinator_kill_score', String(data.killScore));
```

Add `'pollinator_active_biome'` and `'pollinator_kill_score'` to `resetProgress()`.

---

## SECTION 2 — Three New World Files

Create each of the following. They follow the exact same structural pattern as `Meadow.js` but with biome-specific sizes, palettes, hazard configs, and decor. The `drawTerrain`, `drawHazards`, `drawStructures`, `drawWeather`, and all query methods must match Meadow's interface exactly (same method signatures, same return shapes).

### 2A. New file: `src/game/world/Forest.js`

World size: **4800×4800**. Palette: deep moss `#3D5A3E`, amber `#C4714A`, dark parchment `#D9CFC4`.

**Constructor differences from Meadow:**
```js
this.WORLD_SIZE = 4800;
this.hive = { x: 2400, y: 2400, size: 80, radius: 60 };
this.pads = [
  { x: 800, y: 800, radius: 50 },
  { x: 4000, y: 800, radius: 50 },
  { x: 800, y: 4000, radius: 50 },
  { x: 4000, y: 4000, radius: 50 },
];
```
(4 pads instead of 2, because the world is 1.5× larger)

**Thorn barriers** — denser forest walls with narrower chokepoints (150px gaps):
```js
this.thorns = [
  // North wall — two segments, gap at x≈2300–2450
  { x: 600, y: 1200, w: 1700, h: 50 },
  { x: 2450, y: 1200, w: 1750, h: 50 },
  // South wall
  { x: 600, y: 3550, w: 1700, h: 50 },
  { x: 2450, y: 3550, w: 1750, h: 50 },
  // West wall — gap at y≈2300–2450
  { x: 1200, y: 600, w: 50, h: 1700 },
  { x: 1200, y: 2450, w: 50, h: 1700 },
  // East wall
  { x: 3550, y: 600, w: 50, h: 1700 },
  { x: 3550, y: 2450, w: 50, h: 1700 },
  // Inner ring around hive
  { x: 1900, y: 1900, w: 160, h: 40 },
  { x: 2740, y: 1900, w: 160, h: 40 },
  { x: 1900, y: 2860, w: 160, h: 40 },
  { x: 2740, y: 2860, w: 160, h: 40 },
];
```

**Wind zones:** None — Forest has no wind (replaced by web slow zones).

**Web zones** (larger and more numerous than Meadow's):
```js
this.webZones = [
  { x: 1000, y: 1000, radius: 100 },
  { x: 3800, y: 1000, radius: 100 },
  { x: 1000, y: 3800, radius: 100 },
  { x: 3800, y: 3800, radius: 100 },
  { x: 2400, y: 800,  radius: 80 },
  { x: 2400, y: 4000, radius: 80 },
  { x: 800,  y: 2400, radius: 80 },
  { x: 4000, y: 2400, radius: 80 },
];
```

**Rain:** Active in Forest — same rain system as Meadow (copy the rain constructor and `_updateRain` method verbatim, adjusting `nextTrigger` to fire more frequently: `30 + Math.random() * 45`).

**`drawTerrain`:** Base fill `#D9CFC4`. Wash blobs in `#3D5A3E` and `#C4714A`. Decor: draw leaf clusters and gnarled root lines instead of flowers — use `drawLeaf` from renderer and manual arc paths for roots.

**`drawHazards`:** Draw web zones as faint radial silk lines (8 lines from center, low alpha `0.25`, stroke `#8A7A6A`). Draw thorns same as Meadow (filled rect + bramble strokes). No wind arrows.

**`drawStructures`:** Same hive and pad rendering as Meadow. Pads use the same rosette pattern.

### 2B. New file: `src/game/world/Garden.js`

World size: **6400×6400**. Palette: blush rose `#D4928A`, terracotta `#C4714A`, cream `#F5F0E8`.

**Constructor:**
```js
this.WORLD_SIZE = 6400;
this.hive = { x: 3200, y: 3200, size: 80, radius: 60 };
this.pads = [
  { x: 900,  y: 900,  radius: 50 },
  { x: 5500, y: 900,  radius: 50 },
  { x: 900,  y: 5500, radius: 50 },
  { x: 5500, y: 5500, radius: 50 },
  { x: 3200, y: 800,  radius: 50 },
  { x: 3200, y: 5600, radius: 50 },
];
```
(6 pads for 2× size)

**Thorn barriers** — formal garden hedgerows with 150px gaps:
```js
this.thorns = [
  // Outer ring (far from hive)
  { x: 800,  y: 1600, w: 2200, h: 55 },
  { x: 3150, y: 1600, w: 2450, h: 55 },
  { x: 800,  y: 4745, w: 2200, h: 55 },
  { x: 3150, y: 4745, w: 2450, h: 55 },
  { x: 1600, y: 800,  w: 55, h: 2200 },
  { x: 1600, y: 3150, w: 55, h: 2450 },
  { x: 4745, y: 800,  w: 55, h: 2200 },
  { x: 4745, y: 3150, w: 55, h: 2450 },
  // Mid ring (closer to hive)
  { x: 2200, y: 2500, w: 700, h: 40 },
  { x: 3500, y: 2500, w: 700, h: 40 },
  { x: 2200, y: 3860, w: 700, h: 40 },
  { x: 3500, y: 3860, w: 700, h: 40 },
  { x: 2500, y: 2200, w: 40, h: 700 },
  { x: 3860, y: 2200, w: 40, h: 700 },
  { x: 2500, y: 3500, w: 40, h: 700 },
  { x: 3860, y: 3500, w: 40, h: 700 },
];
```

**No wind zones.** Web zones: 4 large ones in the quadrant centers.

**Rain:** Fires more aggressively than Forest — `nextTrigger: 20 + Math.random() * 30`, duration `20 + Math.random() * 8`.

**`drawTerrain`:** Base fill `#F5F0E8`. Wash blobs in `#D4928A`. Decor: draw trellis lines (straight parallel strokes, low opacity) and small rose-bud clusters using `drawFlower` with `#D4928A` petals.

**`drawHazards`:** Thorns same style as Meadow. No webs. Rain same as Meadow rain overlay.

### 2C. New file: `src/game/world/Greenhouse.js`

World size: **8000×8000**. Palette: humid jade `#5A7A5A`, glass light `#B8D4C8`, deep shadow `#2A3A2A`.

**Constructor:**
```js
this.WORLD_SIZE = 8000;
this.hive = { x: 4000, y: 4000, size: 80, radius: 60 };
this.pads = [
  { x: 1000, y: 1000, radius: 50 },
  { x: 7000, y: 1000, radius: 50 },
  { x: 1000, y: 7000, radius: 50 },
  { x: 7000, y: 7000, radius: 50 },
  { x: 4000, y: 800,  radius: 50 },
  { x: 4000, y: 7200, radius: 50 },
  { x: 800,  y: 4000, radius: 50 },
  { x: 7200, y: 4000, radius: 50 },
];
```
(8 pads)

**Thorn barriers** — dense climbing vine walls. Use the same rectangular system scaled up with ~150px gaps. Create 20 thorn rectangles using the same quadrant + inner-ring pattern, scaled for 8000×8000 world. Proportionally similar to Garden but larger.

**`drawTerrain`:** Base fill `#2A3A2A` (dark). Wash blobs in `#5A7A5A` and `#B8D4C8`. Decor: draw condensation droplets (small arcs) on "glass" and tropical leaf shapes using `drawLeaf`.

**`drawHazards`:** Draw vine zones as thick green strokes along thorn borders. Rain aggressive: `nextTrigger: 15 + Math.random() * 20`.

---

## SECTION 3 — Upgrade System Expansion

### 3A. Update `src/game/ui/HiveStore.js`

**Replace the `UPGRADES` array** with a new biome-aware version:

```js
import { levelCapFor } from '../world/biomeConfig.js';

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
```

**Update `_drawStore`** to:
1. Filter shown upgrades by `biomeUnlock` — only show upgrades whose `biomeUnlock` biome is the current active biome or earlier in `BIOME_ORDER`. Pass `activeBiome` into `draw()` via the data object.
2. Enforce the biome level cap: compute `effectiveMax = Math.min(u.globalMax, levelCapFor(activeBiome))`. Use `effectiveMax` instead of `u.max` for the maxed check and display.
3. Show the level cap note: when a level is `maxed` due to the biome cap (not the global max), display `'CAP'` instead of `'MAX'` as the button label — this signals to the player they can level further in the next biome.

**Update the `draw()` method signature** to accept `activeBiome`:
```js
draw(ctx, { bee, banked, upgrades, w, h, isMobile, activeBiome }) {
```

**Add a BIOMES tab** — change the tabs array from `['BANK', 'STORE', 'HANGAR']` to `['BANK', 'STORE', 'HANGAR', 'BIOMES']`. The tab width calculation uses 4 instead of 3.

**Add `_drawBiomes(ctx, { banked, activeBiome, px, py, pw, ph, contentY })`** method:

Draw a 2×2 grid of biome cards (same pattern as `_drawHangar` craft cards). Each card shows:
- Biome name in title font
- Threat dots (● filled, ○ empty) out of 4
- Three color swatches
- Unlock cost OR "ACTIVE" if current OR "UNLOCKED" if accessible
- A simple botanical illustration using canvas paths:
  - Meadow: call `drawFlower(ctx, 18, 8, '#D4A83F', '#5A3D1F')` at card center
  - Forest: call `drawLeaf(ctx, 28, 12, '#3D5A3E')` at card center
  - Garden: call `drawFlower(ctx, 18, 5, '#D4928A', '#C4714A')` at card center
  - Greenhouse: draw a simple tropical leaf using two bezier curves in `#5A7A5A`

Clicking an unlocked biome emits `{ action: 'switch-biome', data: biomeId }`.
Clicking a locked biome shows the unlock cost in an overlay (same pattern as the craft locked overlay).

**Add `CRAFTS` entries for the 4 new crafts:**
```js
{ id: 'butterfly', name: 'Butterfly', hp: 70, speed: 240, capacity: 8, cost: 200, biomeUnlock: 'garden', special: 'Glide dash: passes over thorns + enemies. Second action: petal burst slows nearby foes.' },
{ id: 'wasp',      name: 'Wasp',      hp: 85, speed: 210, capacity: 7, cost: 200, biomeUnlock: 'garden', special: 'Ring sting: fires 8 projectiles radially. High damage, slower fire rate than Hornet.' },
{ id: 'dragonfly', name: 'Dragonfly', hp: 95, speed: 260, capacity: 9, cost: 400, biomeUnlock: 'greenhouse', special: 'Phase dash: brief invincibility frame on every dash. Fastest craft.' },
{ id: 'spider_craft', name: 'Spider', hp: 110, speed: 160, capacity: 12, cost: 400, biomeUnlock: 'greenhouse', special: 'Web layer: places slow-zone webs on spacebar hold. Lures enemies for pollen drops.' },
```

Gate craft display in `_drawHangar` by `biomeUnlock` — only show crafts whose `biomeUnlock` biome is unlocked. Pass `activeBiome` and `totalBanked` through to `_drawHangar`.

### 3B. Update all craft files to apply new upgrades

In `src/game/entities/Bee.js`, `Moth.js`, `Locust.js`, `Hornet.js` — update `applyUpgrades()` to handle the new upgrade fields:

```js
applyUpgrades(upgrades) {
  // existing:
  this.maxHpLevel = upgrades.maxHp || 0;
  this.drLevel = upgrades.damageReduction || 0;
  this.attackLevel = upgrades.attackBoost || 0;
  this.maxHp = 100 + 10 * this.maxHpLevel;  // (use craft base HP for non-bee)
  this.hp = Math.min(this.hp, this.maxHp);

  // NEW: pollen capacity
  const capLevel = upgrades.pollenCapacity || 0;
  this.maxCarry = this._baseCapacity + 5 * capLevel;  // _baseCapacity = craft's base value

  // NEW: dash cooldown (Bee, Butterfly, Dragonfly — crafts with dash attacks)
  const dcLevel = upgrades.dashCooldown || 0;
  this.dashCooldownBase = this._baseDashCooldown * Math.pow(0.9, dcLevel);

  // NEW: magnet radius
  const magLevel = upgrades.magnetRadius || 0;
  this.collectionRadius = 60 + 20 * magLevel;

  // NEW: combo window stored on the craft for main.js to read
  this.comboWindowBonus = (upgrades.comboWindow || 0) * 0.5;
}
```

Each craft's constructor must set `this._baseCapacity` to its base capacity value and `this._baseDashCooldown` to its dash cooldown constant. Non-dash crafts (Moth, Locust) set `_baseDashCooldown = 0`.

In `main.js`, update the combo window constant:
```js
const COMBO_WINDOW = 3.0 + (this.bee.comboWindowBonus || 0);
```
(compute this each frame inside `_updatePlaying` rather than using the top-level const directly)

Update `HARD_CAP` logic: since `maxCarry` now scales, the hard cap should be `maxCarry + 5` for all crafts (replace hardcoded values).

---

## SECTION 4 — New Craft Files

Create all four files in `src/game/entities/`. Base each on the Hornet pattern (it has the most complete interface). All must expose the full craft interface.

### 4A. `src/game/entities/Butterfly.js`

- `craftType: 'butterfly'`, base HP 70, base speed 240, base capacity 8
- **Glide Dash:** On spacebar, dashes 120px forward in 180ms. During the dash, `resolveThornCollision` is SKIPPED entirely (passes over thorns). Enemy collision during dash still resolves hits but deals NO recoil damage (butterfly phases through without friction).
- **Petal Burst (hold spacebar 0.4s):** After the glide dash lands, if spacebar is still held for 0.4s, releases a petal burst: circular AoE (radius 80px) that applies a 0.4× speed slow to all enemies within range for 3 seconds. Deals T1 damage to all caught enemies.
- **Draw:** Elongated body (~10×20px) in pale lavender `#C8A8D4` with four large wing ellipses (two per side, slightly transparent). Wings animate with a slow flutter phase.

### 4B. `src/game/entities/Wasp.js`

- `craftType: 'wasp'`, base HP 85, base speed 210, base capacity 7
- **Ring Sting:** On spacebar, fires 8 projectiles simultaneously in a full 360° ring (45° apart). Each projectile: speed 380px/s, damage 35, range 280px, radius 4px. Cooldown 1.4s (slower than Hornet's 0.5s — this is the tradeoff).
- Projectile update/collision via `updateProjectiles(dt, queryEnemies)` — same pattern as Hornet but iterates all 8 per fire.
- **Draw:** Narrower than the bee, yellow-black striped body with angular swept-back wings. Body: `#D4A020` with 3 dark stripes.

### 4C. `src/game/entities/Dragonfly.js`

- `craftType: 'dragonfly'`, base HP 95, base speed 260, base capacity 9
- **Phase Dash:** On spacebar, dashes 100px in current facing direction. For the entire 150ms dash duration, `this.damageImmune = true` (full invincibility). On dash completion, `damageImmune` returns to its pre-dash value. This is the key differentiator — every dash is a free invincibility window.
- Dash cooldown 0.6s base.
- **Draw:** Long thin body (~8×28px) in iridescent blue-green `#4A9AA0` with four narrow horizontal wing pairs that extend wide. Body has segmented appearance (3 arc sections).

### 4D. `src/game/entities/Spider.js` (craft)

- `craftType: 'spider_craft'`, base HP 110, base speed 160, base capacity 12
- **Web Layer (hold spacebar):** While spacebar is held, the spider extrudes a web zone at its current position every 1.2s. Web zones are stored in `this.placedWebs` (array of `{x, y, radius: 80, timer: 30}`). Each web lasts 30s then expires. Maximum 5 active webs at once (oldest removed when at cap).
- In `update()`, decrement web timers; remove expired ones.
- Webs are passed to main.js via `this.placedWebs` for rendering and for `speedFactorAt` queries. In `main.js _updatePlaying`, after computing `slow`, also check `bee.placedWebs` if craft is spider and add their slow zones to enemy movement checks (enemies entering the spider's placed webs also slow to 0.3×).
- **Web lure bonus:** When an enemy dies while inside a placed web, add 2 bonus common pollen to `this.carried` (the trap reward).
- **Draw:** Compact round body (~14px radius) in dark charcoal `#3A3A3A` with 8 thin radial legs drawn as lines. Body has a subtle hour-glass shape.

---

## SECTION 5 — New Enemy Files

### 5A. `src/game/entities/enemies/MothSwarm.js`

T1 variant. Acts as a cluster of 3 moths that move together as a loose group.
- HP: 30 per moth (3 individual HP pools). Kill one moth per hit.
- `this._moths = [{x, y, offset}, ...]` — each moth has a small random offset from the swarm center, animates independently.
- Movement: wander/chase same as Seeker. Detection range 160px.
- Attack: when within 28px of the bee, each living moth can deal T1 damage on its individual WINDUP→ATTACK cycle (stagger the 3 timers by 0.4s so they don't all fire simultaneously).
- `takeDamage(amount)`: kills one moth per hit (reduce count, not total HP).
- `get dead()`: true when all 3 moths are dead.
- Kill score value: 5 per moth (15 total for destroying the swarm).
- **Draw:** 3 small wing-pair shapes (two ellipses per moth, ~8×5px wings) fluttering in loose formation around the swarm center. Color: dusty tan `#B8A88A`.

### 5B. `src/game/entities/enemies/SpiderEnemy.js`

T2 stationary anchor. Sits at spawn, shoots web projectiles.
- HP: 50, radius 13.
- **Web Shot:** When player enters 220px detection range, enters WINDUP (0.5s), then fires a web projectile in a 90° forward arc (fires 3 projectiles spread 30° apart). Each web projectile: speed 200px/s, range 300px, radius 12px. On hit: creates a slow zone at impact position (`radius: 60, timer: 15s`). These slow zones are stored on the enemy and passed to `speedFactorAt` in main.js via `meadow.getEnemyWebZones()`.
- On-web movement: if the SpiderEnemy itself is on a web zone (its own or another spider's), its patrol speed doubles to 160px/s.
- Off-web movement: 40px/s patrol, 80px/s chase.
- Kill score: 10pts.
- **Draw:** Black oval body (~12×16px) with 8 radial leg lines. Web lines drawn from body to nearby terrain as faint silk strands.

**Note:** `main.js` must call `meadow.getEnemyWebZones()` which aggregates `SpiderEnemy` web zones into the world's `speedFactorAt` queries. Add this method to each world class:
```js
getEnemyWebZones() { return this._enemyWebs || []; }
setEnemyWebZones(zones) { this._enemyWebs = zones; }
```
In `main.js _updatePlaying`, after updating enemies, collect all SpiderEnemy web impacts: `const spiderWebs = this.enemies.filter(e => e.webImpacts).flatMap(e => e.webImpacts); this.meadow.setEnemyWebZones(spiderWebs);`

### 5C. `src/game/entities/enemies/Mantis.js`

T2 ambusher.
- HP: 55, radius 13.
- **Camouflage:** While in IDLE/PATROL state and player is NOT within 100px, `this.alpha = 0.3` (drawn at 30% opacity — faint, easy to miss).
- **Ambush trigger:** When player enters 100px, snaps to full opacity and immediately enters ALERTED → WINDUP (0.3s fast windup) → ATTACKING lunge (180px in 0.2s).
- **Attack:** Scythe swipe — hits the player if within 40px at ATTACKING state. Deals T2 damage. Cooldown 2.5s.
- After attacking (hit or miss), returns to PATROL with full opacity.
- Kill score: 10pts.
- **Draw:** Thin angular body (~10×22px) in leaf-green `#5A7A3A` with two folded forearm arcs. When camouflaged, draw at reduced alpha. Legs: 4 thin lines per side.

### 5D. `src/game/entities/enemies/HornetNest.js`

T3 static spawner.
- HP: 120 (nest itself). Radius 24 (large).
- Every 6s, spawns 2 mini-drones (Seeker-class, HP 20, T1 damage, radius 7). Max 4 active drones at a time. Drones chase the player for 8s then return to nest and despawn.
- `this.drones = []` — array managed internally. Main.js does NOT manage drones separately; the nest updates them each frame. Drones are rendered by the nest's `draw()` method.
- For collision queries from the bee, expose a `getDrones()` method that returns live drones as hittable objects with `{x, y, radius, hp, dead, takeDamage, facing}`.
- In `main.js _updatePlaying`, after the enemy update loop, call `this.enemies.filter(e => e.getDrones).forEach(n => n.getDrones().forEach(d => queryEnemies calls etc))` — actually simpler: in `behave()` the nest registers its drones into the spatial grid itself via `env.grid?.insert(drone)`. Pass `grid` in the env object. In `main.js`, add `grid: this.grid` to the env passed to `e.update()`.
- Kill score: 25pts for the nest. 5pts per drone.
- **Draw:** Teardrop paper-lantern shape in pale tan `#D4C8A8`, with horizontal layered ring lines suggesting paper layers. Drones drawn as tiny bee-silhouettes orbiting/flying outward.

### 5E. `src/game/entities/enemies/VenusFlyTrap.js`

T3 stationary — upgraded Carnivorous Plant variant for Greenhouse.
- HP: 200, radius 28.
- Snap radius: 120px (vs 80px for CarnivorousPlant).
- **Tracking pivot:** Rotates facing toward the player at 15°/s (0.26 rad/s) even while in COOLDOWN. The mouth always slowly tracks the player.
- Snap speed: 0.08s (vs CarnivorousPlant's implied 0.1s).
- Same damage as CarnivorousPlant: 50% of current maxHP.
- Requires Locust or Wasp to kill (Bee does max 10 damage per hit; Butterfly/Dragonfly/Spider do max 15).
- Kill score: 25pts.
- **Draw:** Wider than CarnivorousPlant — two large lobes with tooth-spikes (short radial lines along lobe edges). Deep red-green `#5A1A1A` body. Inner surface: pale `#F5E8E8`.

### 5F. `src/game/entities/enemies/Centipede.js`

T2 mobile with chained segments.
- **Structure:** Head + 5 body segments. Head is the primary entity. Each segment follows the one ahead of it with a 12px gap, using a simple follow-the-leader chain: `segment.x = lerp(segment.x, prev.x + offset, 0.3)` each frame.
- Head HP: 80 (killing head destroys whole centipede). Body segments have no individual HP.
- Head deals T2 damage (25). Body segments deal T1 damage (15) on contact cycle.
- Movement: wanders at 60px/s, chases at 110px/s. Detection 180px.
- Attack: head lunges 50px forward, 0.5s windup, 0.3s lunge, 2.0s cooldown.
- Body segment collision: each segment has radius 8. If the bee collides with a body segment (not head) during a non-invincible frame, apply T1 damage with a 0.8s i-frame.
- Kill score: 20pts.
- **Draw:** Head: oval 14×10px in dark amber `#7A5020`. Segments: linked ovals decreasing from 12×8px at segment 1 to 7×5px at segment 5, same color. Draw a connecting line between each segment.

---

## SECTION 6 — New Power-Up Plants

Update `src/game/entities/pickups/PowerUpPlant.js`.

### 6A. Add to `POWERUP_DEFS`:

```js
// Forest plants
clover: {
  label: 'Clover',
  color: '#5A9A5A',    // medium green
  duration: 10,
  effect: 'speed_burst',
  biomeUnlock: 'forest',
},
thistle: {
  label: 'Thistle',
  color: '#7A5A9A',    // purple
  duration: 0,
  effect: 'thorny_burst',
  oneUse: false,
  recharge: 45,
  biomeUnlock: 'forest',
},
// Garden plants
wisteria: {
  label: 'Wisteria',
  color: '#9A7AC8',    // lavender-purple
  duration: 20,
  effect: 'pollen_double',
  biomeUnlock: 'garden',
},
orchid: {
  label: 'Orchid',
  color: '#E8A0C8',    // pale pink
  duration: 8,
  effect: 'full_immunity',
  biomeUnlock: 'garden',
},
// Greenhouse plants
pitcherPlant: {
  label: 'Pitcher Plant',
  color: '#3A6A3A',    // deep green
  duration: 0,
  effect: 'pollen_magnet_burst',
  oneUse: true,
  biomeUnlock: 'greenhouse',
},
ghostOrchid: {
  label: 'Ghost Orchid',
  color: '#D8F0F0',    // pale ice blue
  duration: 15,
  effect: 'slow_motion',
  biomeUnlock: 'greenhouse',
},
```

### 6B. Add draw methods for each new plant:

All plants must be recognizable as flowers/plants — use `drawFlower` from renderer as the base for all of them, varying petal count, size, color, and adding a distinctive secondary element:

- **Clover:** Three `drawFlower(ctx, 10, 4, '#5A9A5A', '#3A7A3A')` heads arranged in a triangle at 0°, 120°, 240°. Draws as three small round flower clusters = clearly a clover.
- **Thistle:** `drawFlower(ctx, 16, 12, '#7A5A9A', '#5A3A7A')` with extra spiky rays (12 short radial lines extending beyond the petals in `#9A8AAA`). Recognizable as thistle.
- **Wisteria:** 5 small `drawFlower(ctx, 8, 5, '#9A7AC8', '#7A5AA8')` clustered in a drooping arc (draw 5 flowers offset downward in a curved line). Looks like a wisteria cluster.
- **Orchid:** `drawFlower(ctx, 20, 3, '#E8A0C8', '#C880A8')` with 3 large asymmetric petals + 2 smaller ones at 60° offset. 5 total petals but grouped 3+2. Orchid-like silhouette.
- **Pitcher Plant:** Draw a pitcher/vase shape (two bezier curves forming a rounded vase, `#3A6A3A` fill) with a small `drawFlower(ctx, 8, 5, '#5A9A5A', '#3A7A3A')` at the top as the lid. Clearly a pitcher plant.
- **Ghost Orchid:** `drawFlower(ctx, 18, 6, '#D8F0F0', '#B8E0E0')` with 6 elongated petals and a subtle glow effect (draw a second flower at 110% size, very low alpha `0.2`, offset by 1px). Ghostly pale appearance.

### 6C. Update `_activatePowerUp` in `main.js`:

Add handling for each new effect type:
```js
case 'speed_burst':
  this._speedMult = 2.0;
  this._speedModTimer = def.duration;
  break;
case 'thorny_burst':
  // Deal 20 damage to all enemies within 120px of the bee
  for (const e of this.enemies) {
    if (!e.dead && distance(this.bee, e) <= 120) e.takeDamage(20);
  }
  break;
case 'pollen_double':
  this._pollenMultiplier = 2.0;
  this._pollenModTimer = def.duration;
  break;
case 'full_immunity':
  this.activePowerUp = { type: plant.type, color: plant.color, duration: def.duration, timer: def.duration };
  this.bee.damageImmune = true;
  break;
case 'pollen_magnet_burst':
  // Instantly collect all pollen within 400px
  for (const p of this.pollen) {
    if (!p.collected && distance(this.bee, p) <= 400) {
      p.collected = true;
      this.bee.addPollen(p.type);
    }
  }
  break;
case 'slow_motion':
  // enemy speed factor 0.2 for duration — store as activePowerUp type 'slow_motion'
  this.activePowerUp = { type: 'slow_motion', color: plant.color, duration: def.duration, timer: def.duration };
  break;
```

In the `_updatePlaying` slow factor logic, add:
```js
const slow = (this.activePowerUp?.type === 'lavender' || this.activePowerUp?.type === 'slow_motion') ? 0.2 : 1;
```

---

## SECTION 7 — Kill Score System

### 7A. Define kill values

In `src/game/entities/enemies/Enemy.js`, add a `killScore` property to the constructor:
```js
this.killScore = opts.killScore ?? 5;
```

Set per-class kill scores in each enemy constructor:
- Seeker: `killScore: 5`
- Patroller: `killScore: 10`
- CarnivorousPlant: `killScore: 25`
- Frog: `killScore: 50`
- MothSwarm: `killScore: 5` (per moth)
- SpiderEnemy: `killScore: 10`
- Mantis: `killScore: 10`
- HornetNest: `killScore: 25` (nest) + 5 per drone
- VenusFlyTrap: `killScore: 25`
- Centipede: `killScore: 20`

### 7B. Track kills in `main.js`

Add `this.sessionKillScore = 0` to the constructor.

In `_updatePlaying`, after the enemy update loop, detect newly-dead enemies:
```js
for (const e of this.enemies) {
  if (e.dead && e.deathTimer < 0.05 && !e._scoreAwarded) {
    e._scoreAwarded = true;
    const pts = e.killScore ?? 5;
    this.sessionKillScore += pts;
    this.progress.killScore = (this.progress.killScore || 0) + pts;
    this._save();
  }
}
```

Add `killScore: this.progress.killScore` to `saveProgress` calls in `_save()`.

### 7C. Display in HUD

Update `src/game/ui/HUD.js` to accept `killScore` in its draw data and render a kill score indicator in the top-left corner:
- Hexagon icon (6-sided path, ~10px radius) in `COLORS.gold` with a small bee/stinger symbol inside
- Text: total kill score (lifetime, not per-run) to the right of the icon
- Font: `FONTS.mono` size 12
- Position: top-left, x=16, y=18

In `main.js render()`, add `killScore: this.progress.killScore` to the `HUD.draw()` data object.

---

## SECTION 8 — Wire Everything in `main.js`

### 8A. Import all new files

Add imports for Forest, Garden, Greenhouse world classes, all 4 new crafts, all 6 new enemies, updated biomeConfig helpers.

### 8B. Make `newRun()` biome-aware

Replace `this.meadow = new Meadow()` with:
```js
const biome = this.progress.activeBiome || 'meadow';
this.activeBiome = biome;
const WorldClass = { meadow: Meadow, forest: Forest, garden: Garden, greenhouse: Greenhouse }[biome] || Meadow;
this.meadow = new WorldClass();
```

Update `_spawnCraft` to also handle the 4 new crafts:
```js
case 'butterfly': return new Butterfly(x, y, upgrades);
case 'wasp':      return new Wasp(x, y, upgrades);
case 'dragonfly': return new Dragonfly(x, y, upgrades);
case 'spider_craft': return new SpiderCraft(x, y, upgrades);
```

### 8C. `_spawnWorld` becomes biome-aware

Rename current `_spawnWorld` to `_spawnMeadow`. Create `_spawnForest`, `_spawnGarden`, `_spawnGreenhouse`. Call the right one from `_spawnWorld` based on `this.activeBiome`.

**`_spawnForest`:** Same structure as `_spawnMeadow` but scaled to 4800×4800 world. Enemy mix: Meadow enemies (Seekers, Patrollers, CarnivorousPlants, Frog) PLUS 4 SpiderEnemy + 2 MothSwarm. More Patrollers (6 vs 4). Uncommon pollen clusters at 5 positions. 3 rare pollen guarded by CarnivorousPlants. 80 common pollen scattered. Power-up plants: 2 Sunflower, 2 Lavender, 1 Foxglove (carried from Meadow) + 2 Clover + 1 Thistle.

**`_spawnGarden`:** 6400×6400. All Forest enemies PLUS 3 Mantis + 2 HornetNest. Higher Patroller density (8). 5 rare pollen. 100 common. Power-ups: all Forest plants + 2 Wisteria + 1 Orchid.

**`_spawnGreenhouse`:** 8000×8000. All Garden enemies PLUS 3 VenusFlyTrap + 2 Centipede. Highest density overall. 8 rare. 120 common. Power-ups: all Garden plants + 1 PitcherPlant + 1 GhostOrchid.

### 8D. Handle switch-biome intent

In `_handleStoreIntent`:
```js
} else if (intent.action === 'switch-biome') {
  const newBiome = intent.data;
  if (isBiomeUnlocked(newBiome, this.progress.totalBanked)) {
    this.progress.activeBiome = newBiome;
    this._save();
    // Biome change takes effect on next expedition (Fly Out will start new run in new biome)
  }
}
```

### 8E. Pass `activeBiome` to HiveStore draw call

```js
this.store.draw(ctx, {
  bee: this.bee,
  banked: this.progress.totalBanked,
  upgrades: this.progress.upgrades,
  w: this.LW,
  h: this.LH,
  isMobile: this.isMobile,
  activeBiome: this.activeBiome || 'meadow',
});
```

### 8F. Apply upgrade level cap enforcement in `_buy`

Before allowing an upgrade purchase, check the biome cap:
```js
const cap = levelCapFor(this.activeBiome || 'meadow');
if (u.kind === 'level' && (up[u.id] || 0) >= cap) return; // biome cap reached
if (u.kind === 'level' && (up[u.id] || 0) >= u.globalMax) return; // absolute global max
```

### 8G. Spider craft web rendering

In `_renderWorld`, after rendering power-up plants and before rendering enemies, check if the active craft is spider_craft and render its placed webs:
```js
if (this.bee.craftType === 'spider_craft' && this.bee.placedWebs) {
  for (const web of this.bee.placedWebs) {
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.strokeStyle = '#C8C0B0';
    ctx.lineWidth = 1;
    // Draw 8 radial silk lines from web center
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(web.x, web.y);
      ctx.lineTo(web.x + Math.cos(a) * web.radius, web.y + Math.sin(a) * web.radius);
      ctx.stroke();
    }
    ctx.restore();
  }
}
```

Also add spider_craft's `placedWebs` to the `speedFactorAt` check in `_updatePlaying` for enemy movement.

---

## COMMIT

After all 8 sections are complete and the dev server runs without console errors:

```
git add -A
git commit -m "feat: biome expansion — Forest/Garden/Greenhouse worlds, 4 new crafts (Butterfly/Wasp/Dragonfly/Spider), 6 new enemies, 7 new power-up plants, biome-gated upgrade levels, kill score HUD, BIOMES tab in hive"
git push origin main
```

