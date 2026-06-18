# Claude Code Build Prompt — The Great Pollinator (Phase 2)

You are extending an existing, working browser game called **The Great Pollinator** in the `jet750/jaxontravis-com` repository. Phase 1 is complete and live at `/games/pollinator`. Read every instruction carefully before writing any code. Do not modify any files outside of those explicitly listed below.

---

## CRITICAL: READ THESE FILES BEFORE WRITING ANYTHING

Before touching any code, read the current state of these files so you understand the existing architecture:

```
src/pages/games/pollinator/game/main.js
src/pages/games/pollinator/game/entities/Bee.js
src/pages/games/pollinator/game/ui/HiveStore.js
src/pages/games/pollinator/game/utils/storage.js
src/pages/games/pollinator/game/world/Meadow.js
src/pages/games/pollinator/game/utils/renderer.js
src/pages/games/pollinator/game/utils/math.js
src/pages/games/pollinator/game/engine/StateMachine.js
```

The game uses: vanilla JS modules, HTML5 Canvas 2D API, no external game libraries, no npm game dependencies. All visuals are drawn with canvas paths. Do not introduce any new npm packages.

---

## PART 1 — CORRECTION PASS (fix before building new features)

These values are wrong in the current Phase 1 code and must be corrected first, before any Phase 2 work begins.

### 1A. Fix upgrade values in `src/pages/games/pollinator/game/ui/HiveStore.js`

Find the `UPGRADES` export array and update these entries:

```js
// CHANGE:
{ id: 'maxHp', name: 'Max HP +20', cost: 15, max: 5, kind: 'level', desc: '+20 max HP per level' }
// TO:
{ id: 'maxHp', name: 'Max HP +10', cost: 15, max: 5, kind: 'level', desc: '+10 max HP per level' }

// CHANGE:
{ id: 'damageReduction', name: 'Damage Reduction', cost: 10, max: 5, kind: 'level', formula: '×0.95ⁿ' }
// TO:
{ id: 'damageReduction', name: 'Damage Reduction', cost: 10, max: 5, kind: 'level', formula: '×0.95 per level (stacking)' }

// CHANGE:
{ id: 'attackBoost', name: 'Attack Boost', cost: 10, max: 5, kind: 'level', formula: '×1.05ⁿ' }
// TO:
{ id: 'attackBoost', name: 'Attack Boost', cost: 10, max: 5, kind: 'level', formula: '+×0.05 per level (max ×1.25)' }
```

### 1B. Fix HP upgrade in `src/pages/games/pollinator/game/entities/Bee.js`

Find where `maxHp` is calculated from `maxHpLevel` and change:
```js
// CHANGE:
this.maxHp = 100 + 20 * this.maxHpLevel;
// TO:
this.maxHp = 100 + 10 * this.maxHpLevel;
```
This caps max HP at 150 (5 levels × 10 = +50).

### 1C. Fix enemy damage to flat values in `Bee.js`

Find where incoming damage from enemies is applied. Enemy damage must be **flat values**, not percentages of max HP. Locate the damage-receive logic and ensure T1 deals 15 flat, T2 deals 25 flat, T3 deals 35 flat. The Carnivorous Plant remains a special case at `Math.floor(this.maxHp * 0.5)` — half of current max HP. Thorn contact is 8 flat.

If enemy tier is passed as a parameter to the hit function, map it:
```js
const TIER_DAMAGE = { 1: 15, 2: 25, 3: 35 };
const flat = TIER_DAMAGE[tier] ?? 15;
```

Apply damage reduction on top of flat values:
```js
const DR_PER_LEVEL = 0.05;
const drMultiplier = Math.pow(1 - DR_PER_LEVEL, this.drLevel); // 0.95^n
const finalDamage = Math.round(flat * drMultiplier);
```

### 1D. Fix safe pad healing in `main.js`

Find the pad heal logic (where player is stationary on a safe pad). Change heal rate so that it restores **up to 50% of max HP over 3 seconds** (not 15%):
```js
// Heal rate: (maxHp * 0.5) / 3 HP per second while on pad
const PAD_HEAL_RATE = this.bee.maxHp * 0.5 / 3; // per second
// Cap: do not heal above 50% of maxHp from pad regen
// (full heal only happens on hive return)
```

### 1E. Fix hive return to grant full heal

Find where the player enters the hive (docks at hive zone). Add:
```js
this.bee.hp = this.bee.maxHp; // full heal on hive return
```

### 1F. Fix overcapacity HUD warning in `src/pages/games/pollinator/game/ui/HUD.js`

Find where the pollen capacity counter is drawn. Remove any amber/red tint on the bee sprite. Instead, when carried pollen count exceeds max carry (10 default), draw a warning text line directly below the capacity counter:

```js
if (totalCarried > bee.maxCarry) {
  // draw warning text below capacity counter
  // text: '⚠ ATTACK DISABLED — OVERCAPACITY'
  // font: Inter 11px
  // color: #D4A83F (amber)
}
```

Do not modify the bee sprite tinting logic for overcapacity — remove it if it exists.

---

## PART 2 — NEW FEATURES (build after correction pass is verified)

---

### FEATURE 1: Biome Select Screen

**New file:** `src/pages/games/pollinator/game/ui/BiomeSelect.js`

This screen renders between the START state and the PLAYING state. After the player presses Enter/tap on the Start Screen, instead of auto-loading Meadow, show the Biome Select screen.

**Top-level game state change in `main.js`:**
Add a new state `'BIOME_SELECT'` between `'START'` and `'PLAYING'`. The state flow becomes:
```
START → BIOME_SELECT → PLAYING → HIVE → PLAYING → ... → GAMEOVER → START
```

**BiomeSelect rendering (full canvas):**
- Background: parchment `#F0EBE2`
- Title: "CHOOSE YOUR EXPEDITION" — Cormorant Garamond 28px, ink `#1C1209`, centered top
- Subtitle: "Each biome offers different threats and rewards." — Inter 13px, muted ink, centered below title
- Four biome doors arranged in a 2×2 grid centered on canvas
- Each door is a rounded rectangle panel (~180×220px) containing:
  - Biome name in Cormorant Garamond 20px
  - Threat level indicator: dots (● = filled, ○ = empty) — Meadow: 1/4, Forest: 2/4, Garden: 3/4, Greenhouse: 4/4
  - A small botanical illustration drawn with canvas paths representing the biome (flower cluster for Meadow, leaf cluster for Forest, rose for Garden, tropical leaf for Greenhouse)
  - Palette swatch strip (3 small colored rectangles) showing biome colors
- Hover state: panel border brightens, subtle scale (draw slightly larger)
- Click/tap: load that biome and transition to PLAYING state

**Biome door color schemes:**
- Meadow: border `#8AB87E`, swatch colors `['#8AB87E','#D4A83F','#F0EBE2']`
- Forest: border `#3D5A3E`, swatch colors `['#3D5A3E','#C4714A','#D9CFC4']`
- Garden: border `#D4928A`, swatch colors `['#D4928A','#C4714A','#F5F0E8']`
- Greenhouse: border `#5A7A5A`, swatch colors `['#5A7A5A','#B8D4C8','#2A3A2A']`

**Biome lock state:** Forest, Garden, and Greenhouse show a small "⚠ COMING SOON" badge in Phase 2 — they are selectable but immediately show a "This biome is under construction" overlay with a return button. Only Meadow is fully playable. This prevents confusion while keeping the full UI in place. Remove the badges in Phase 3 when remaining biomes are built.

---

### FEATURE 2: Fog of War on Minimap

**Modify:** `src/pages/games/pollinator/game/ui/Minimap.js`

The minimap currently shows the full world. Add a fog of war layer:

- Maintain a visited positions array: `this.fogVisited = []` — array of `{x, y}` world coordinates
- Each frame during PLAYING state, push the current player world position (throttled — only push if player has moved more than 50px from last pushed point, to keep array size manageable)
- On the minimap canvas, after drawing the base map, draw a dark fog overlay: `rgba(28, 18, 9, 0.82)` rectangle over the full minimap
- Then for each visited point, use `ctx.globalCompositeOperation = 'destination-out'` to punch a circular reveal hole of radius 14px (minimap scale: world 800px maps to minimap ~30px, so reveal radius 14px ≈ ~370 world px visibility)
- Reset composite operation after drawing reveals
- Persist fog state: when saving progress, include `fog: this.fogVisited` (already exists in storage schema). On load, restore `this.fogVisited` from `progress.fog`
- Fog resets on new game (full progress reset), NOT on death

**Wire fog updates in `main.js`:** Each PLAYING frame, call `minimap.trackPosition(bee.x, bee.y)`. On GAMEOVER, call `saveProgress({ fog: minimap.fogVisited })`.

---

### FEATURE 3: Combo Multiplier

**Modify:** `src/pages/games/pollinator/game/main.js` and `src/pages/games/pollinator/game/ui/HUD.js`

**Logic in `main.js`:**
- Track `this.comboCount = 0` and `this.comboTimer = 0`
- When pollen is collected: increment `comboCount`, reset `comboTimer` to 3.0 seconds
- Each frame during PLAYING: decrement `comboTimer` by dt. If `comboTimer <= 0`, reset `comboCount = 0`
- When player takes damage: reset `comboCount = 0` and `comboTimer = 0`
- Apply multiplier to pollen value at moment of collection:
  ```js
  const COMBO_THRESHOLDS = [
    { count: 5,  multiplier: 1.2 },
    { count: 10, multiplier: 1.5 },
    { count: 20, multiplier: 2.0 },
  ];
  function getMultiplier(comboCount) {
    let m = 1.0;
    for (const t of COMBO_THRESHOLDS) {
      if (comboCount >= t.count) m = t.multiplier;
    }
    return m;
  }
  // Applied: pollenValue = Math.round(baseValue * getMultiplier(comboCount))
  ```

**HUD display:** When `comboCount >= 5`, show combo indicator below the pollen counter:
- Text: `×1.2 COMBO` / `×1.5 COMBO` / `×2.0 COMBO` depending on threshold
- Font: JetBrains Mono 13px
- Color: gold `#D4A83F` at ×1.2, ember `#C4714A` at ×1.5, crimson `#8B2020` at ×2.0
- Pulse animation: scale between 1.0 and 1.08 on a 0.4s cycle while active
- Disappears when combo resets

---

### FEATURE 4: Rain Weather Event

**Modify:** `src/pages/games/pollinator/game/world/Meadow.js`

Add rain as a random weather event that can trigger in the Meadow (and will be the primary hazard in Garden/Greenhouse in Phase 3).

**Rain state in Meadow:**
```js
this.rain = {
  active: false,
  timer: 0,
  nextTrigger: 45 + Math.random() * 60, // first rain between 45-105s into run
  duration: 0,
  warningActive: false,
  warningTimer: 0,
};
```

**Rain update cycle (call in `Meadow.update(dt)`):**
1. Count down `nextTrigger`. When it hits 0: begin warning phase (`warningActive = true`, `warningTimer = 3.0`)
2. Warning phase (3 seconds): draw cloud shadow overlay — semi-transparent dark gray wash sliding in from top. No damage yet.
3. After warning: `rain.active = true`, `rain.duration = 15 + Math.random() * 5` seconds
4. While active: apply rain overlay rendering (see below). Expose `rain.active` as a readable property.
5. After duration: deactivate. Set `nextTrigger = 60 + Math.random() * 90` for next event.

**Rain rendering in `Meadow.draw(ctx, camera)`:**
- When `rain.warningActive`: draw a semi-transparent gradient overlay (dark gray, opacity 0.0 → 0.25 over warning duration) sliding down from top of viewport
- When `rain.active`: draw animated rain streaks — generate ~40 streak positions each frame, draw as thin 1px lines angled slightly right (15°), length 12-20px, color `rgba(180, 200, 220, 0.5)`. Streaks move downward at ~300px/s (offset by time). Draw a persistent semi-transparent overlay `rgba(100, 120, 140, 0.15)`.

**Damage modifier in `main.js`:**
- Each frame, check `meadow.rain.active`
- When active, set a flag `this._rainActive = true` on the game instance
- In the damage-receive function for the bee, if `this._rainActive`, multiply final damage by 1.5 before applying
- Show rain warning in HUD: when `rain.active`, draw a small amber text in top-center below the pollen counter: `"🌧 STORM — DMG ×1.5"` Inter 11px

---

### FEATURE 5: Rare Power-Up Plants — Moonflower and Ironweed

**Modify:** `src/pages/games/pollinator/game/entities/pickups/PowerUpPlant.js`

Add two new entries to `POWERUP_DEFS`:

```js
{
  id: 'moonflower',
  label: 'Moonflower',
  color: '#B8A0D4',        // pale violet
  duration: 0,             // instant use, no duration
  rarity: 'rare',
  oneUse: true,            // does not recharge
  effect: 'instant_store', // opens hive store overlay without returning to hive
},
{
  id: 'ironweed',
  label: 'Ironweed',
  color: '#6B8B3A',        // olive green
  duration: 0,             // instant use
  rarity: 'rare',
  oneUse: true,
  effect: 'full_heal',     // restores hp to maxHp immediately
},
```

**Spawn:** 1 Moonflower and 1 Ironweed per Meadow run. Place at world positions that are deep in the map, behind hazard clusters (e.g. Moonflower at ~(2800, 500), Ironweed at ~(300, 2700)). These positions should feel like rewards for exploring.

**One-use behavior:** After activation, the plant visually wilts (draw as a drooped stem, color desaturated to gray). It does not respawn mid-run and does not recharge. The pulse ring is removed when spent.

**Effect handling in `main.js`:**
- `instant_store`: set game state to `'HIVE'`, open the store tab directly (call `this.store.open(); this.store.tab = 'STORE'`), set a flag `this._fieldStore = true` so that exiting the store returns to PLAYING rather than requiring hive re-entry
- `full_heal`: immediately set `this.bee.hp = this.bee.maxHp`, show a brief canvas flash (white overlay, opacity 0.4, fading over 0.5s)

---

### FEATURE 6: Moth and Locust Crafts + Hangar

**New files:**
```
src/pages/games/pollinator/game/entities/Moth.js
src/pages/games/pollinator/game/entities/Locust.js
```

**Modify:** `src/pages/games/pollinator/game/ui/HiveStore.js` (Hangar tab)

---

#### Craft Base Class Pattern

Both Moth and Locust share the same interface as Bee. Create a shared interface (document with JSDoc, do not create a separate class file — just ensure both follow the same method signatures as Bee):

Required public interface:
```js
// Properties all crafts expose:
this.x, this.y           // world position
this.radius              // collision radius
this.hp, this.maxHp      // health
this.carried             // { common, uncommon, rare }
this.maxCarry            // capacity
this.facing              // angle in radians
this.vx, this.vy         // velocity

// Methods all crafts expose:
update(dt, inputState, world, grid)
draw(ctx, camera)
takeDamage(amount)       // returns true if dead
getCarriedTotal()        // sum of carried pollen values
```

Copy the state machine, movement, and input handling patterns from `Bee.js`. Adapt the attack mechanic per craft.

---

#### `Moth.js`

**Visual:** Elongated oval body ~28×18px, pale cream-brown `#C8B89A`, with two large rounded wing shapes extending from sides (wider than bee wings, semi-transparent `rgba(200,180,160,0.6)` fill with ink outline). Antenna are longer and more curved than bee.

**Stats:**
- Max HP: 80 (Moths are faster but frailer)
- Max carry: 5 pollen
- Movement speed: 220px/s (faster than bee)
- Overcapacity: 5–8 units (attack disabled above 5)

**Attack — Frontal Consume:**
- No dash. On attack input: emit a 60px circular "consume" pulse centered on the moth's front (facing direction)
- Deals 50 flat damage to any mobile enemy (Seeker, Patroller, Frog) within the pulse radius
- Does NOT damage Carnivorous Plants (Moth ignores static plant enemies entirely — they are immune to Moth)
- Cooldown: 800ms
- Visual: brief ink-burst circle emanating from moth's front, radius expanding from 0 to 60px over 200ms, fades out

**Design role:** Clearing mobile enemy density fast. Less survivable, lower carry, better at combat than collection.

---

#### `Locust.js`

**Visual:** Larger, heavier body ~32×20px, dark olive `#5A6B2A` with angular wing shapes (more angular/geometric than bee or moth). Heavier ink lines. Moves with a slight bobbing animation.

**Stats:**
- Max HP: 120 (tankiest craft)
- Max carry: 5 pollen
- Movement speed: 140px/s (slowest craft)
- Overcapacity: 5–8 units

**Attack — AoE Chomp:**
- On attack input: short forward lunge (40px, 200ms) with a large rectangular hitbox (~80×40px) aligned to facing direction
- Deals 80 flat damage to all enemies within the hitbox
- **Special:** Is the ONLY craft that can kill Carnivorous Plants. Carnivorous Plants take full 80 damage from Locust (2 hits to kill)
- Cooldown: 1200ms (slower, heavier attack)
- Visual: jaws animation — two arc shapes closing on the front of the Locust, ink splatter at impact

**Design role:** Path clearing. Send Locust first to kill Carnivorous Plants, freeing up pollen clusters for Bee to collect on subsequent runs.

---

#### Enemy Respawn System

**Modify `main.js`:**

Track a hive return counter: `this.hiveReturnCount = 0`. Increment each time player docks at hive (enters hive zone).

When an enemy is killed, record it:
```js
// In the enemies array, set on the killed enemy object:
enemy.killedAtReturn = this.hiveReturnCount;
enemy.dead = true;
// Do NOT splice from array — keep in array, just skip update/render when dead=true
```

Each frame during PLAYING, check each dead enemy:
```js
const RESPAWN_AFTER_RETURNS = 2;
if (enemy.dead && this.hiveReturnCount >= enemy.killedAtReturn + RESPAWN_AFTER_RETURNS) {
  // Respawn: reset enemy HP, position (back to original spawn position), state to IDLE
  enemy.respawn();
  enemy.dead = false;
}
```

Add `respawn()` method to each enemy class that resets HP, state, and position to the original spawn coordinates.

---

#### Hangar Tab (fully functional)

**Modify `HiveStore.js` Hangar tab rendering:**

Replace the Phase 1 placeholder with a functional craft selection interface.

Display three craft cards in a row (or stacked on mobile), each showing:
- Craft name in Cormorant Garamond 18px
- Craft illustration (simple canvas-path drawing of the insect)
- Stats: HP, Speed, Capacity in Inter 12px
- Special ability description in Inter 11px italic
- Unlock cost if not yet unlocked, or "ACTIVE" badge if currently selected, or "SWITCH" button if unlocked but not active

**Craft unlock costs** (deducted from banked pollen):
- Moth: 50 pollen
- Locust: 80 pollen

**Storage:** Add `craftsUnlocked` array and `activeCraft` string to the upgrades object in `storage.js`:
```js
// Add to DEFAULT_UPGRADES:
craftsUnlocked: [],  // e.g. ['moth', 'locust']
activeCraft: 'bee',  // 'bee' | 'moth' | 'locust'
```

**Craft switching in `main.js`:**
When player switches craft at Hangar and exits hive, instantiate the correct craft class at the hive position. The previous craft's carried pollen is transferred (auto-banked before switch). HP is set to max for the new craft (fresh deployment from hive).

---

### FEATURE 7: Storage Schema Update

**Modify `src/pages/games/pollinator/game/utils/storage.js`**

Add new fields to `DEFAULT_UPGRADES`:
```js
craftsUnlocked: [],   // array of unlocked craft IDs
activeCraft: 'bee',   // currently selected craft
```

Add `hiveReturnCount` to the saved progress (persists within a game session but resets on new game):
```js
// Add to loadProgress return:
hiveReturnCount: readNumber('pollinator_hive_returns', 0),

// Add to saveProgress:
if (data.hiveReturnCount != null) {
  localStorage.setItem('pollinator_hive_returns', String(data.hiveReturnCount));
}

// Add to resetProgress:
localStorage.removeItem('pollinator_hive_returns');
```

---

## PART 3 — WIRING CHANGES IN `main.js`

After building all new features, update `main.js` to wire everything together:

1. **Import new files:**
```js
import { Moth } from './entities/Moth.js';
import { Locust } from './entities/Locust.js';
import { BiomeSelect } from './ui/BiomeSelect.js';
```

2. **Add `'BIOME_SELECT'` to top-level state handling.** In the main `update()` and `render()` switch statements, add cases for `'BIOME_SELECT'` that call `biomeSelect.update(inputState)` and `biomeSelect.draw(ctx, w, h)`.

3. **Transition START → BIOME_SELECT** on Enter/tap (instead of directly to PLAYING).

4. **Transition BIOME_SELECT → PLAYING** when a biome door is clicked. For now, all four doors load Meadow (other biomes show "coming soon" overlay as described above).

5. **Craft instantiation helper:**
```js
_spawnCraft(type, x, y) {
  const upgrades = this.progress.upgrades;
  switch (type) {
    case 'moth':    return new Moth(x, y, upgrades);
    case 'locust':  return new Locust(x, y, upgrades);
    default:        return new Bee(x, y, upgrades);
  }
}
```
Call this in `newRun()` using `this.progress.upgrades.activeCraft`.

6. **Hive return count:** Increment `this.hiveReturnCount` when player docks at hive. Pass to respawn check each frame.

7. **Field store flag:** When Moonflower triggers store, set `this._fieldStore = true`. In HIVE exit logic, if `this._fieldStore`, return to PLAYING instead of requiring hive re-entry, then clear the flag.

8. **Rain damage modifier:** Read `this.meadow.rain.active` each frame. If true, apply ×1.5 multiplier inside `bee.takeDamage()` call (pass a `weatherMultiplier` parameter or set it on the game instance before calling takeDamage).

---

## PART 4 — DO NOT TOUCH

- `src/App.jsx` — no changes needed
- `src/pages/games/pollinator/PollinatorPage.jsx` — no changes needed
- `src/pages/games/pollinator/PollinatorPage.module.css` — no changes needed
- Any file outside `src/pages/games/pollinator/` — no changes whatsoever
- Do not install any npm packages
- Do not add audio — deferred to Phase 3
- Do not build Forest, Garden, or Greenhouse biomes fully — BiomeSelect shows them as coming soon

---

## PART 5 — COMPLETION CHECKLIST

Before finishing, verify each of the following works without errors:

**Correction Pass:**
- [ ] HP upgrade gives +10 per level (max 150 HP at level 5)
- [ ] T1 enemies deal 15 flat damage, T2 deal 25, T3 deal 35
- [ ] Carnivorous Plant still deals 50% of max HP
- [ ] Damage reduction applies as `0.95^n` stacking multiplier on flat damage
- [ ] Safe pad heals up to 50% max HP over 3 seconds
- [ ] Hive return grants full heal to max HP
- [ ] Overcapacity shows text warning in HUD, not bee sprite tint

**New Features:**
- [ ] Biome select screen renders after Start Screen
- [ ] All four biome doors render with correct colors and threat indicators
- [ ] Forest, Garden, Greenhouse show "coming soon" overlay on click
- [ ] Meadow loads correctly from biome select
- [ ] Fog of war hides unexplored minimap areas, reveals as player moves
- [ ] Fog persists through death within a session, resets on new game
- [ ] Combo counter increments on pollen collection, resets on damage or timeout
- [ ] ×1.2 / ×1.5 / ×2.0 multipliers apply at correct thresholds
- [ ] Combo indicator renders in HUD with correct colors
- [ ] Rain triggers randomly after ~45s, shows 3s warning, applies ×1.5 damage
- [ ] Rain renders visually (streaks + overlay)
- [ ] Rain HUD warning shows while active
- [ ] Moonflower spawns deep in Meadow, opens store mid-field on use, wilts after
- [ ] Ironweed spawns deep in Meadow, fully heals on use, wilts after
- [ ] Moth craft purchasable for 50 pollen, selectable in Hangar
- [ ] Locust craft purchasable for 80 pollen, selectable in Hangar
- [ ] Active craft shown in Hangar with "ACTIVE" badge
- [ ] Switching craft auto-banks pollen and spawns new craft at full HP
- [ ] Killed enemies track `killedAtReturn` and respawn after 2 hive returns
- [ ] `respawn()` method resets enemy to original position and full HP
- [ ] Locust deals 80 damage to Carnivorous Plants (kills in 2 hits)
- [ ] Moth consume attack ignores Carnivorous Plants entirely
- [ ] `craftsUnlocked` and `activeCraft` persist to localStorage
- [ ] `hiveReturnCount` saves and loads correctly
- [ ] No console errors on load, no regressions to Phase 1 Meadow gameplay

---

*Phase 2 build. Do not implement Phase 3 features (Hornet craft, audio, Oregon Trail AI layer, Forest/Garden/Greenhouse full biome builds, power-up stacking, performance profiling pass).*
*Note Phase 3 integration points with TODO comments where relevant.*
