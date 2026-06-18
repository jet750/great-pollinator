# Claude Code Build Prompt — The Great Pollinator (Phase 1)

You are building a complete, playable browser game called **The Great Pollinator** and integrating it into an existing React/Vite portfolio site. Read every instruction carefully before writing any code. Do not make speculative changes to any existing files outside of what is explicitly listed below.

---

## REPOSITORY CONTEXT

This is the `jet750/jaxontravis-com` repository — a React/Vite app deployed on Vercel. The existing router lives in `src/App.jsx`. All existing routes render inside `RootLayout` (which includes `Nav` and `Footer`). The game route must be added **outside** `RootLayout` so it renders as a full-screen canvas with no nav or footer.

Do not modify any existing pages, components, hooks, or styles. Only touch `src/App.jsx` to add the new route, and create all new files in the locations specified below.

---

## STEP 1 — FILE STRUCTURE TO CREATE

Create the following files. Create all directories as needed.

```
src/pages/games/pollinator/PollinatorPage.jsx
src/pages/games/pollinator/PollinatorPage.module.css
src/pages/games/pollinator/game/main.js
src/pages/games/pollinator/game/engine/GameLoop.js
src/pages/games/pollinator/game/engine/Camera.js
src/pages/games/pollinator/game/engine/SpatialGrid.js
src/pages/games/pollinator/game/engine/StateMachine.js
src/pages/games/pollinator/game/entities/Bee.js
src/pages/games/pollinator/game/entities/enemies/Seeker.js
src/pages/games/pollinator/game/entities/enemies/Patroller.js
src/pages/games/pollinator/game/entities/enemies/CarnivorousPlant.js
src/pages/games/pollinator/game/entities/enemies/Frog.js
src/pages/games/pollinator/game/entities/pickups/Pollen.js
src/pages/games/pollinator/game/entities/pickups/PowerUpPlant.js
src/pages/games/pollinator/game/world/Meadow.js
src/pages/games/pollinator/game/ui/HUD.js
src/pages/games/pollinator/game/ui/Minimap.js
src/pages/games/pollinator/game/ui/HiveStore.js
src/pages/games/pollinator/game/ui/VirtualJoystick.js
src/pages/games/pollinator/game/ui/StartScreen.js
src/pages/games/pollinator/game/ui/GameOverScreen.js
src/pages/games/pollinator/game/utils/storage.js
src/pages/games/pollinator/game/utils/math.js
src/pages/games/pollinator/game/utils/renderer.js
```

---

## STEP 2 — MODIFY src/App.jsx

Add one lazy-loaded route for the game page. The game route must be placed **outside** the `<Route element={<RootLayout />}>` block so it renders without Nav or Footer.

Add this import at the top with the other lazy imports:
```js
const PollinatorPage = lazy(() => import('./pages/games/pollinator/PollinatorPage'));
```

Add this route inside `<Routes>` but outside the RootLayout route block, alongside the existing `<Route path="*" .../>`:
```jsx
<Route path="/games/pollinator" element={
  <Suspense fallback={<div style={{ background: '#141210', minHeight: '100vh' }} />}>
    <PollinatorPage />
  </Suspense>
} />
```

---

## STEP 3 — GAME SPECIFICATIONS

### Visual Design System

The game uses a Victorian botanical illustration aesthetic — watercolor ink-wash, parchment backgrounds, naturalist illustration style. All rendering is done on an HTML5 Canvas using the 2D context. Use SVG-style path drawing and CSS color fills to achieve the illustrated look. No pixel art.

Color palette (use these exact values throughout):
- Parchment (background): `#F0EBE2`
- Ink (lines, text): `#1C1209`
- Botanical Gold (common pollen, accents): `#D4A83F`
- Botanical Green (environment, safe zones): `#8AB87E`
- Ember Clay (uncommon pollen, damage): `#C4714A`
- Crimson (rare pollen, danger): `#8B2020`
- Lavender Violet (Lavender power-up): `#7B6FA0`
- Obsidian (UI background): `#141210`

Typography for canvas-drawn UI text:
- Titles/headers: `"Cormorant Garamond", serif`
- Body/HUD: `"Inter", sans-serif`
- Numbers/counters: `"JetBrains Mono", monospace`

---

### Canvas & Responsive Sizing

`PollinatorPage.jsx` renders a single `<canvas>` element that fills 100vw × 100vh with no margin or overflow. On mount, initialize the game engine. On unmount, cancel the animation frame loop and remove all input listeners.

The canvas internal resolution is 900×650 on desktop. On mobile (viewport width < 768px), use 390×700 portrait orientation. Detect on mount and on window resize. Apply `devicePixelRatio` scaling for sharp rendering on retina screens.

---

### Game States (Top-Level)

The game runs through these top-level states managed in `main.js`:
1. `START` — renders the start screen
2. `PLAYING` — active game loop running
3. `HIVE` — hive interface overlay active, game loop paused
4. `GAMEOVER` — game over screen rendered

---

### THE WORLD — Meadow Biome

The Meadow is a large open world map: **3200 × 3200 pixels** (world space). The camera follows the player and clips the visible viewport to 900×650 (desktop) or 390×700 (mobile).

**Rendering the Meadow:**
- Background: parchment `#F0EBE2` with subtle ink-wash texture (draw irregular low-opacity ellipses in greens and golds to suggest grass and wildflowers)
- Scatter decorative botanical elements: simple SVG-style path flowers, leaf shapes, grass tufts drawn in ink-line style
- The world is divided conceptually into a 4×4 grid of cells (each cell is 800×800). Enemies and hazards outside the current grid cell are not updated (frozen) but are rendered if near the viewport edge

**Hive placement:** The hive spawns at world position (1600, 1600) — center of the map. It is a hexagonal structure drawn in gold and ink, approximately 80×80px. Flying into its collision zone (radius 60px) triggers the HIVE state.

**Safe Landing Pads:** Two circular pads, radius 50px, drawn as botanical rosette patterns in green. Place at world positions (800, 800) and (2400, 2400). Inside pad radius: enemies do not enter, player regenerates 15% HP over 3 seconds while stationary.

---

### THE PLAYER — Bee

Implement in `Bee.js`. The bee is the player-controlled entity.

**Visual:** Draw the bee as a rounded ellipse body (~24×16px) in amber-gold with ink-line wing shapes extending from sides. Animate wings with a subtle oscillation. Rotate the sprite to face the direction of movement.

**Movement:**
- 8-directional movement via WASD or Arrow Keys
- Base speed: 180px/second (world space)
- Smooth acceleration/deceleration (lerp factor 0.15)
- On mobile: movement driven by VirtualJoystick input

**Health System:**
- Max HP: 100 (represented as a percentage bar)
- Health bar renders in HUD — ink-line border, fill color transitions green → amber → red as HP decreases
- At 0 HP: trigger GAMEOVER state
- HP upgrades from store: each level adds +20 max HP (up to 5 levels = 200 max HP)

**Pollen Capacity:**
- Default max carry: 10 pollen units
- Passive collection radius: 60px — any pollen within this radius is automatically collected each frame
- Overcapacity (>10): player can carry up to 15 but attack is disabled. Amber tint on bee sprite.
- Visual counter in HUD: current / max, turns amber above 10, red above 12

**Player States (StateMachine):**
- `FLYING` — normal movement
- `DASHING` — dash-sting attack active (150ms duration)
- `INVINCIBLE` — post-hit invincibility frame (800ms, sprite flashes)
- `LANDING` — hovering over pad or plant (0.5s before effect triggers)
- `LANDED` — on pad or plant, effects active
- `DOCKED` — inside hive zone
- `DEAD` — death animation, then GAMEOVER

**Dash-Sting Attack (Combat Core):**

On spacebar press (desktop) or attack button tap (mobile):
1. Player dashes forward 80px in current facing direction over 150ms
2. During dash: check collision with all enemies in range
3. Evaluate hit direction: calculate angle between dash direction and enemy's current facing direction
4. If the approach angle is within 100° of the enemy's rear (i.e. the player approached from the rear hemisphere): **rear hit** — deal full attack damage, apply 400ms invincibility frame to player, trigger screenshake (3px offset, 200ms)
5. If approach is frontal: **frontal hit** — deal 50% attack damage to enemy, deal 25% of base enemy damage back to player (no invincibility frame)
6. Cooldown: 600ms before next dash can trigger
7. No attack if `INVINCIBLE` state is active, or if player is in `LANDED` state, or if overcapacity

**Base attack damage:** 34 (kills T1 in 1 rear hit, T2 in 2 rear hits, T3 in 3 rear hits). Attack boost upgrade: ×1.05 per level.

**Damage Reduction Upgrades:** Each level: `incoming_damage = incoming_damage × 0.95`. Max 5 levels.

**Healing Items:** Consumable, triggered by H key (desktop) or heal button (mobile). Restores 25% of max HP. Up to 3 can be held at a time. Count shown in HUD.

---

### POLLEN PICKUPS

Implement in `Pollen.js`.

Three types, differentiated by color and size:
- **Common (Yellow):** value 1, radius 6px, color `#D4A83F`, spawns abundantly across the meadow (80% of all pollen)
- **Uncommon (Orange):** value 3, radius 9px, color `#C4714A`, spawns near Patroller enemies (15% of all pollen)
- **Rare (Crimson):** value 5, radius 12px, color `#8B2020`, spawns behind T3 enemies or inside hazard zones (5% of all pollen)

All pollen has a gentle float animation (±3px vertical oscillation, 2-second cycle).

**Spawn distribution:** Scatter 60 common, 15 uncommon, and 5 rare pollen across the 3200×3200 world at the start of each run. Use seeded random positions that avoid spawning inside the hive zone or on top of enemies. Pollen does not respawn mid-run.

**Collection:** When pollen enters the player's passive collection radius (60px), it flies toward the player over 300ms then disappears, adding its value to carried count. Sunflower power-up extends radius to 180px.

---

### ENEMIES

All enemies follow the same combat interaction contract:
- They do NOT deal damage on passive collision
- They deal damage through telegraphed attack cycles: **windup → attack → cooldown**
- All enemies rotate/face their current direction of movement or target

**Implement shared `Enemy` base class** with: position, facing angle, HP, tier, state machine (IDLE / PATROL / ALERTED / WINDUP / ATTACKING / COOLDOWN / DEAD), draw method, and update method.

---

**T1: SEEKER** (`Seeker.js`)
- Visual: small rounded oval, dark brown `#3D2B1F`, with two small antennae
- Size: 18×12px
- HP: 30
- Detection radius: 150px — when player enters, switches to ALERTED → chases player
- Patrol: slow random movement when idle (40px/s)
- Chase speed: 120px/s
- Attack: when within 30px of player, enter WINDUP (0.4s, sprite turns red), then ATTACKING (lunge 40px toward player, deals T1 damage if contact), then COOLDOWN (1.5s)
- Spawns: 8 scattered across meadow world

**T2: PATROLLER** (`Patroller.js`)
- Visual: elongated oval, deep green `#3D5A2A`, with small wing shapes
- Size: 22×14px
- HP: 60
- Behavior: circles within 200px radius of its assigned uncommon pollen cluster
- Detection radius: 200px
- Speed: 90px/s patrol, 140px/s chase
- Attack: WINDUP (0.6s, color flash amber), charge lunge 60px, T2 damage, COOLDOWN (2s)
- Spawns: 4 in meadow, each assigned to guard a cluster of uncommon pollen

**T3: CARNIVOROUS PLANT** (`CarnivorousPlant.js`)
- Visual: stationary, drawn as an open pitcher plant mouth (~40×50px), deep red-green `#4A2D1F`, with visible "teeth" as jagged lines around the rim
- Does not move
- Snap zone radius: 80px
- No windup — if player enters snap zone: immediate ATTACKING state, deals T3 damage (30% HP), then COOLDOWN (2.5s retraction)
- HP: 80. Bee dash-sting does only 10 damage (not full 34) — cannot kill with Bee alone (Locust required, Phase 2)
- Spawns: 2 in meadow, placed to block access to rare pollen

**T3: FROG** (`Frog.js`)
- Visual: squat rounded rectangle body (~36×28px), mottled green `#4A6B3A`, with bulging eye circles
- Stationary body position
- Tongue attack: 200px range
- WINDUP: 1.2s (body swells visually — scale from 1.0 to 1.3, color shifts yellow-green)
- ATTACKING: tongue extends as a thin line to player position (captured at windup start, not tracking), instant hit check, T3 damage if player is in range and hasn't moved out
- COOLDOWN: 3.5s — design window for player to dash in and attack
- HP: 90. Dies in 3 rear hits
- Spawns: 1 in meadow, placed near a rare pollen cluster

---

### ENVIRONMENTAL HAZARDS

**Wind Gusts:**
- 3 wind zones placed across the meadow, each as a rectangular region (~300×120px)
- Visual: sweeping ink-wash brush strokes with directional arrows drawn in the zone, semi-transparent
- Active cycle: 5s on, 10s off, staggered per zone so they don't all pulse together
- While active: applies constant force of 80px/s in the indicated direction to the player
- Player can compensate by moving against the force — requires angling

**Spider Webs:**
- 4 circular slow zones, radius 70px
- Visual: drawn as ink-line radial web pattern, semi-transparent white overlay
- Effect: player movement speed reduced to 40% while inside
- Permanent — always active, no cycle

**Thorns:**
- 6 thorn clusters as rectangular blockers (~60×120px or ~120×60px, randomize orientation)
- Visual: ink-line bramble/thorn illustration, dark green-brown
- Solid collision: player cannot pass through (treat as wall)
- Contact edge: if player collides with edge instead of center, deal 5% HP flat damage and deflect

---

### POWER-UP PLANTS

Implement in `PowerUpPlant.js`. Three types in Phase 1.

Each plant is a fixed world position. Player triggers it by hovering over it (entering 40px radius) and remaining still for 0.5s — the bee "lands." On launch (moving away), the effect activates.

One active power-up at a time. If a new one is collected while one is active, it replaces the current one.

Visual for each: draw as a botanical illustration of the plant species. Use simple SVG-style paths. A glowing pulse ring around the plant indicates it is available to collect (not yet used this run).

**Sunflower** (2 in meadow):
- Color: `#D4A83F`
- Effect: pollen collection radius expands from 60px to 180px
- Duration: 15 seconds
- HUD icon: circle with radiating lines (sun shape)

**Lavender** (2 in meadow):
- Color: `#7B6FA0`
- Effect: all enemy movement and attack speeds reduced to 40%
- Duration: 12 seconds
- HUD icon: small spike cluster shape

**Foxglove** (1 in meadow):
- Color: `#8B2020`
- Effect: all incoming damage negated (player is invincible)
- Duration: 10 seconds
- HUD icon: bell/tube flower shape

All three plants recharge after 30 seconds and can be used again in the same run.

---

### THE HIVE INTERFACE

When player enters the hive zone, game pauses and renders the HiveStore overlay on top of the canvas.

Draw as a full-canvas overlay with three tabs: **BANK**, **STORE**, **HANGAR**

**BANK tab (default open):**
- Shows carried pollen count with breakdown (common/uncommon/rare)
- "Deposit All" button: transfers carried pollen to banked total, updates localStorage
- Visual: honeycomb cells filling with gold as pollen is banked

**STORE tab:**
- Lists upgrades. Show current level and cost in pollen.
- Deducts from banked pollen first, then carried pollen
- Available upgrades:
  - Max HP +20 — costs 15 pollen per level (max 5 levels)
  - Damage Reduction — costs 10 pollen per level (max 5 levels), shows formula `×0.95^n`
  - Attack Boost — costs 10 pollen per level (max 5 levels), shows formula `×1.05^n`
  - Healing Item ×1 — costs 8 pollen (max 3 held)
  - Healing Item ×3 — costs 20 pollen (if space allows)
- All upgrades persist across runs (saved to localStorage)

**HANGAR tab (Phase 2 placeholder):**
- Display silhouettes of Moth and Locust with "Coming Soon" label
- No interaction

**Exit hive:** "Fly Out" button or pressing Escape returns to PLAYING state

---

### HUD

Render HUD elements directly on the canvas, on top of the world layer. Do not use HTML elements for HUD — keep everything on canvas for clean mobile rendering.

Layout (desktop 900×650 canvas):
- **Top-left:** Health bar — ink-bordered rectangle 160×16px, fill transitions from green to amber to red. Above it: small bee icon + "HP" label in Inter 11px
- **Top-center:** Pollen counter — current carried / max in JetBrains Mono 14px. Color: gold normal, amber at overcapacity, red above 130%. Below it: "BANKED:" + total in Inter 11px
- **Top-right:** Active power-up slot — 32×32px icon with circular countdown ring depleting clockwise. "NONE" in Inter 10px when empty
- **Bottom-right (desktop) / Top-right below power-up (mobile):** Minimap — 120×120px
- **Bottom-left:** Healing item count — small vial icon × count. "H to use" label on desktop

---

### MINIMAP

Render in `Minimap.js` as a 120×120px inset canvas (or canvas-within-canvas using offscreen canvas).

- Shows full 3200×3200 world scaled to 120×120
- Player position: gold dot
- Hive position: hexagon outline
- Safe pad positions: green circles
- Fog of war: dark overlay (`rgba(28,18,9,0.75)`) that is erased (clipped) where player has explored. Track visited positions in an array, draw reveal circles of radius 60 (map-scaled) around each
- Fog state persists for the session (reset on new game)

---

### VIRTUAL JOYSTICK (Mobile)

Render in `VirtualJoystick.js` directly on the canvas.

Only shown when `window.innerWidth < 768`.

Layout:
- Left side (bottom-left): circular joystick base, radius 55px, center at (95, canvasHeight - 95). Semi-transparent dark fill. Inner knob radius 22px follows touch within the base radius. Returns to center on touch end.
- Right side (bottom-right): circular attack button, radius 40px, center at (canvasWidth - 75, canvasHeight - 95). Shows sting icon. Visual press state on touch.
- Center-bottom: heal button, radius 28px, center at (canvasWidth / 2, canvasHeight - 50). Shows vial icon.

Input: use `touchstart`, `touchmove`, `touchend` events on the canvas element. Map joystick knob offset to directional velocity vector. 8-directional snap: quantize the angle to nearest 45° for crisp movement feel.

---

### START SCREEN

Render in `StartScreen.js` on the canvas when game state is `START`.

Layout:
- Full canvas fill: parchment `#F0EBE2`
- Center: game title "THE GREAT POLLINATOR" in Cormorant Garamond 42px, ink color `#1C1209`
- Below title: subtitle "A Botanical Field Expedition" in Inter italic 16px, muted ink
- Below subtitle: botanical illustration of a bee over a meadow flower (draw with canvas paths — a large flower with radiating petals in gold, a bee silhouette above it)
- Rules block (Inter 13px, centered, max width 500px):
  - "Collect pollen across the meadow and return to the hive to bank your haul."
  - "Approach enemies from behind to sting them. Frontal attacks cost you health."
  - "Land on glowing plants to activate power-ups. Use safe pads to recover."
  - "Spend pollen at the hive store to upgrade your colony."
- High score line (if localStorage value > 0): "Your best: [X] pollen banked" in gold
- Press prompt: "PRESS ENTER TO BEGIN" (desktop) / "TAP TO BEGIN" (mobile) — pulse animation, Inter 14px

---

### GAME OVER SCREEN

Render in `GameOverScreen.js` on the canvas when game state is `GAMEOVER`.

Layout:
- Full canvas fill: dark obsidian `#141210`
- Center-top: botanical illustration (large wilted flower, ink-line style, petals drooping — draw with canvas paths)
- Below illustration: "EXPEDITION ENDED" in Cormorant Garamond 36px, parchment color
- Run score: "Pollen Banked: [X]" in JetBrains Mono 22px, gold
- High score: "All-Time Record: [X]" in Inter 14px, muted gold (update if new high score)
- If new high score: "NEW RECORD" badge in crimson
- Button: "TRY AGAIN" — parchment background, ink border, Cormorant Garamond 18px. Click/tap restarts run (does not reset upgrades or banked total)
- Smaller text below: "New Game (resets all progress)" — clicking this shows a confirmation dialog drawn on canvas ("Are you sure? All progress will be lost. YES / NO") before executing full reset

---

### STORAGE UTILITY

Implement in `storage.js`. Wrap all localStorage calls in try/catch.

```js
const STORAGE_KEYS = {
  HIGH_SCORE: 'pollinator_highscore',
  TOTAL_BANKED: 'pollinator_total_banked',
  UPGRADES: 'pollinator_upgrades',
  FOG: 'pollinator_minimap_fog',
};

export function loadProgress() { ... }   // returns object with all keys, defaults to 0/empty
export function saveProgress(data) { ... } // writes full progress object
export function resetProgress() { ... }  // clears all pollinator_ keys
```

---

### MATH UTILITY

Implement in `math.js`:
```js
export function distance(a, b) { ... }          // Euclidean distance between two {x,y} points
export function angle(from, to) { ... }          // Angle in radians from point to point
export function angleDiff(a, b) { ... }          // Shortest angular difference between two angles
export function lerp(a, b, t) { ... }            // Linear interpolation
export function clamp(val, min, max) { ... }     // Clamp value
export function normalizeAngle(angle) { ... }    // Normalize to -PI..PI
export function randomBetween(min, max) { ... }  // Random float in range
export function randomInt(min, max) { ... }      // Random integer in range
```

---

### SPATIAL GRID COLLISION

Implement in `SpatialGrid.js`. Cell size: 200px.

```js
export class SpatialGrid {
  constructor(worldWidth, worldHeight, cellSize) { ... }
  insert(entity) { ... }   // add entity to its cell(s)
  retrieve(x, y, radius) { ... } // return all entities in cells overlapping the query area
  clear() { ... }          // reset grid each frame before re-inserting
}
```

Use this in the main game loop: clear the grid, re-insert all entities, then use it for all collision queries instead of iterating all entities.

---

### GAME LOOP

Implement in `GameLoop.js`. Fixed-timestep loop, capped at 50ms to prevent spiral-of-death on tab blur.

```js
export class GameLoop {
  constructor(updateFn, renderFn) { ... }
  start() { ... }   // begins requestAnimationFrame loop
  stop() { ... }    // cancels animation frame, used on React component unmount
}
```

---

### CAMERA

Implement in `Camera.js`. Follows the player with soft lag (lerp factor 0.08 for smooth feel). Clamps to world bounds so the world edge never shows parchment-colored void.

```js
export class Camera {
  constructor(viewportWidth, viewportHeight, worldWidth, worldHeight) { ... }
  follow(targetX, targetY, dt) { ... }  // smooth follow with lerp
  worldToScreen(worldX, worldY) { ... } // convert world coords to screen coords for rendering
  screenToWorld(screenX, screenY) { ... } // inverse, for input handling
  apply(ctx) { ... }   // apply canvas translate for world rendering
  reset(ctx) { ... }  // reset canvas translate for HUD rendering
}
```

---

## STEP 4 — PERFORMANCE REQUIREMENTS

- Target 60fps on desktop Chrome
- All entity updates outside the current 800×800 grid cell are skipped (position frozen)
- Spatial grid used for all collision queries — no O(n²) entity iteration
- Canvas cleared and fully redrawn each frame (no dirty-rect optimization needed at this scale)
- DevicePixelRatio scaling applied once on init and on resize, not every frame

---

## STEP 5 — WHAT NOT TO DO

- Do not install any npm packages. Use only what is already in the project (React, Vite, Framer Motion, React Router). The game engine uses zero external dependencies.
- Do not use HTML elements for game UI (no divs, buttons, or inputs overlaid on the canvas) — all rendering including HUD, store, and virtual joystick is done on the canvas itself
- Do not use `<img>` tags or external asset files — all visuals are drawn with Canvas 2D API paths, arcs, and fills
- Do not modify any existing files except `src/App.jsx` (the single route addition in Step 2)
- Do not add any serverless API functions — this game is entirely client-side
- Do not add audio — audio is deferred to Phase 3

---

## STEP 6 — COMPLETION CHECKLIST

Before finishing, verify:
- [ ] `/games/pollinator` route works without breaking any existing routes
- [ ] Game canvas fills full viewport on desktop and mobile
- [ ] Bee moves in 8 directions with smooth acceleration
- [ ] Dash-sting attack registers rear vs. frontal hits correctly
- [ ] All 4 enemy types spawn and follow their windup-attack-cooldown cycles
- [ ] All 3 environmental hazards (wind, web, thorns) function
- [ ] All 3 power-up plants activate on landing and expire after duration
- [ ] Pollen collection, banking, and overcapacity states all work
- [ ] Hive store opens on entry, upgrades deduct pollen and persist to localStorage
- [ ] Health bar depletes, healing items restore HP, death triggers game over
- [ ] Start screen renders with rules and high score
- [ ] Game over screen renders with score, high score, try again, new game confirmation
- [ ] Virtual joystick renders and controls movement on mobile viewport
- [ ] localStorage saves and loads correctly across page refreshes
- [ ] No console errors on initial load
- [ ] No modifications to existing portfolio pages or components

---

*Phase 1 build. Do not implement Phase 2 features (Moth, Locust, Hangar, Forest/Garden/Greenhouse biomes, rain events, fog of war minimap, biome select screen). Note any Phase 2 integration points with TODO comments in the relevant files.*
