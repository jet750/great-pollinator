# Claude Code Build Prompt — The Great Pollinator (Phase 3)

You are completing the final sprint build of **The Great Pollinator** in the `jet750/jaxontravis-com` repository. Phase 1 and Phase 2 are complete. This phase delivers the mobile safe area fix, the Hornet craft, the Oregon Trail AI narrative layer, audio, polish passes, and closes out the sprint.

Read every instruction carefully before writing any code. Do not modify any files outside those explicitly listed below.

---

## ⚠️ CONCURRENT SESSION GUARDRAIL — READ FIRST

A second Claude Code session is running simultaneously in this same repository building a different game in a different subfolder. To prevent file conflicts:

**You are ONLY permitted to modify files inside:**
```
src/pages/games/pollinator/
```

**The following files are FROZEN — do not read, write, or modify under any circumstances:**
```
src/App.jsx                  ← route already exists from Phase 1, no changes needed
src/main.jsx
src/index.css
src/layouts/
src/components/
src/pages/HomePage.jsx
src/pages/AboutPage.jsx
src/pages/AIInterviewPage.jsx
src/pages/PerennialPage.jsx
src/pages/BazaarBlendsPage.jsx
src/pages/Photography.jsx
src/pages/WorkSamplesPage.jsx
src/pages/NotFoundPage.jsx
Any file outside src/pages/games/pollinator/
```

The `/games/pollinator` route in `src/App.jsx` was added in Phase 1 and is confirmed present. Do not touch `App.jsx` for any reason. If you believe a change outside `src/pages/games/pollinator/` is required, stop and explain why rather than making the change.

---

## CRITICAL: READ THESE FILES BEFORE WRITING ANYTHING

Before touching any code, read the current state of these files:

```
src/pages/games/pollinator/PollinatorPage.jsx
src/pages/games/pollinator/PollinatorPage.module.css
src/pages/games/pollinator/game/main.js
src/pages/games/pollinator/game/ui/VirtualJoystick.js
src/pages/games/pollinator/game/ui/HiveStore.js
src/pages/games/pollinator/game/ui/HUD.js
src/pages/games/pollinator/game/entities/Bee.js
src/pages/games/pollinator/game/utils/storage.js
src/pages/games/pollinator/game/utils/renderer.js
```

---

## PART 1 — MOBILE SAFE AREA FIX (highest priority, do this first)

This is a critical bug. On mobile Chrome and Safari, the browser navigation bar (bottom tab bar, address bar, home indicator) overlaps the canvas bottom edge. The virtual joystick and hive exit button are partially or fully hidden behind browser UI, making the game unplayable on mobile.

### Fix A: CSS — `PollinatorPage.module.css`

Replace the current `.wrapper` and `.canvas` rules entirely with the following:

```css
/* Full-screen game canvas — no nav, no footer, no scroll. */
.wrapper {
  position: fixed;
  inset: 0;
  margin: 0;
  padding: 0;
  overflow: hidden;
  background: #141210;
  touch-action: none;
  -webkit-user-select: none;
  user-select: none;

  /* Respect iOS home indicator and Android nav bar */
  padding-bottom: env(safe-area-inset-bottom);
  padding-top: env(safe-area-inset-top);
  padding-left: env(safe-area-inset-left);
  padding-right: env(safe-area-inset-right);

  /* Use dvh (dynamic viewport height) which excludes browser chrome.
     Falls back to 100vh for browsers that don't support dvh yet. */
  height: 100vh;
  height: 100dvh;
}

.canvas {
  display: block;
  width: 100%;
  height: 100%;
  touch-action: none;
}
```

Also add this to your project's `index.html` `<head>` if not already present — check first, only add if missing:

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
```

The `viewport-fit=cover` is what enables `env(safe-area-inset-*)` to work on iOS notch/home-indicator devices.

### Fix B: Game Engine — `main.js`

The game engine currently uses `window.innerHeight` implicitly via the fixed MOBILE dimensions `{ w: 390, h: 700 }`. This hardcoded height is what causes the overflow. Replace with dynamic measurement from the actual canvas element.

Find the `_resize()` method in `main.js` and update it to read the canvas's rendered dimensions rather than using hardcoded MOBILE/DESKTOP constants for height:

```js
_resize() {
  const rect = this.canvas.getBoundingClientRect();
  this.isMobile = window.innerWidth < MOBILE_BREAKPOINT;

  // Use actual rendered canvas dimensions (which now respect safe-area via CSS dvh).
  // This ensures the logical canvas matches what the user actually sees.
  this.LW = Math.round(rect.width);
  this.LH = Math.round(rect.height);

  this.dpr = Math.min(window.devicePixelRatio || 1, 2); // cap at 2× for perf
  this.canvas.width = Math.round(this.LW * this.dpr);
  this.canvas.height = Math.round(this.LH * this.dpr);

  this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  this.camera.resize(this.LW, this.LH);
  this.joystick.setViewport(this.LW, this.LH);
}
```

Remove the hardcoded `DESKTOP` and `MOBILE` dimension constants (`const DESKTOP = { w: 900, h: 650 }` etc.) from `main.js` entirely — they are no longer needed. The canvas now sizes itself to whatever the CSS gives it.

### Fix C: Virtual Joystick positioning — `VirtualJoystick.js`

The joystick and buttons are currently positioned at hardcoded offsets from the canvas bottom (`this.h - 95`, `this.h - 50`). Since the canvas now properly excludes browser chrome via `dvh`, these offsets are safe as-is — but add an additional bottom inset guard of 16px so there is always visible breathing room above any remaining system UI:

```js
// In _baseCenter(), _attackCenter(), _healCenter():
// Change all `this.h - 95` to `this.h - 111`  (95 + 16px inset)
// Change `this.h - 50` to `this.h - 66`        (50 + 16px inset)

_baseCenter()   { return { x: 95,             y: this.h - 111 }; }
_attackCenter() { return { x: this.w - 75,    y: this.h - 111 }; }
_healCenter()   { return { x: this.w / 2,     y: this.h - 66  }; }
```

### Fix D: Hive exit button — `HiveStore.js`

The hive store "Fly Out" button (and any other bottom-anchored interactive elements in the store overlay) must not be drawn within 80px of the canvas bottom on mobile. Find where the exit/fly-out button is rendered and add a guard:

```js
// When calculating the Y position of the Fly Out button:
const safeBottom = this.isMobile ? 80 : 20; // extra padding on mobile
const exitBtnY = h - safeBottom - 40; // 40 = button height
```

Pass `isMobile` flag into `HiveStore.draw()` from `main.js`. In `main.js`, update the `store.draw()` call to include `isMobile: this.isMobile` in the options object.

---

## PART 2 — HORNET CRAFT

**New file:** `src/pages/games/pollinator/game/entities/Hornet.js`

Follow the same interface pattern as `Bee.js`, `Moth.js`, and `Locust.js`.

### Visual
Sleeker, more angular body than the bee: ~30×16px elongated teardrop shape, deep yellow-black striped `#8B6914` body with thin ink-line stripes, narrow angular wings. More aggressive visual character than the bee — this is the offensive specialist.

### Stats
- Max HP: 90
- Max carry: 8 pollen
- Movement speed: 200px/s
- Overcapacity: 8–12 units (attack disabled above 8)
- Unlock cost: 120 pollen

### Attack — Projectile Sting
On attack input: fire a projectile in the current facing direction.

```js
// Projectile properties:
const PROJ_SPEED  = 420;   // px/s
const PROJ_DAMAGE = 45;    // flat damage per hit
const PROJ_RANGE  = 350;   // px before projectile expires
const PROJ_RADIUS = 5;     // collision radius
const PROJ_COOLDOWN = 0.5; // seconds
```

**Projectile object:** `{ x, y, vx, vy, distanceTraveled, active }`. Maintain a `this.projectiles = []` array on the Hornet. Each frame: update each active projectile position, check collision against enemies (passed in via the spatial grid), deactivate on hit or range expiry.

**Rendering:** Draw each active projectile as a small elongated teardrop (8×4px) in gold `#D4A83F` with a short ink-line trail behind it (4 trail points, fading opacity).

**Hit behavior:** On collision with an enemy within `PROJ_RADIUS`, call `enemy.takeDamage(PROJ_DAMAGE)`. The projectile is then deactivated. Unlike melee crafts, direction does not matter — ranged hits always deal full damage.

**Wiring in `main.js`:** In the PLAYING update loop, after updating the Hornet entity, also call `hornet.updateProjectiles(dt, enemies, grid)` to update and check projectile collisions. Pass projectile updates into the spatial grid check. In the render loop, the projectiles are drawn as part of `hornet.draw(ctx, camera)`.

**Add to Hangar in `HiveStore.js`:** Add Hornet card alongside Moth and Locust. Unlock cost: 120 pollen.

**Add to `_spawnCraft()` in `main.js`:**
```js
case 'hornet': return new Hornet(x, y, upgrades);
```

**Add import in `main.js`:**
```js
import { Hornet } from './entities/Hornet.js';
```

---

## PART 3 — OREGON TRAIL AI NARRATIVE LAYER

This is the feature that turns this from a vanilla canvas game into an AI-powered portfolio piece. A Claude-powered event system generates unique narrative events mid-run using the Anthropic API. Every run has different events.

### Architecture Overview

The AI layer is a lightweight event system. Each time the player exits the hive, a narrative event fires — but only if fewer than 5 events have occurred this session. The API call begins the moment the player *enters* the hive (while they're using the Bank/Store/Hangar tabs), so it resolves silently in the background. On exit, if the event is ready, it displays immediately with no loading wait. If still resolving (rare — the call is fast), show the brief loading state. This design means the narrative never interrupts active gameplay — it only fires at the natural context-switch moment the player is already expecting.

### New file: `src/pages/games/pollinator/game/narrative/NarrativeEngine.js`

```js
// NarrativeEngine: generates procedural field journal events via the Anthropic API.
// Fires on hive exit (not on a timer) — the API call begins when the player enters
// the hive so it resolves during their Bank/Store/Hangar session. Max 5 events per run.

export class NarrativeEngine {
  constructor() {
    this.activeEvent  = null;
    this.loading      = false;
    this._eventCount  = 0;
    this._pending     = null; // Promise in-flight during hive session
  }

  // Call this when player ENTERS the hive — begins the API call in background.
  onHiveEnter(runContext) {
    if (this._eventCount >= 5) return; // session cap
    if (this.loading || this.activeEvent) return; // already one pending or active
    this.loading  = true;
    this._pending = fetchNarrativeEvent(this._eventCount + 1, runContext)
      .then(event  => { this.activeEvent = event; this._eventCount++; })
      .catch(err   => { console.warn('[NarrativeEngine] skipping event:', err.message); })
      .finally(()  => { this.loading = false; this._pending = null; });
  }

  // Call this when player EXITS the hive — returns true if an event is waiting.
  onHiveExit() {
    return this.activeEvent !== null || this.loading;
  }

  resolveChoice(choiceIndex) {
    if (!this.activeEvent) return null;
    const consequence = this.activeEvent.choices[choiceIndex].consequence;
    this.activeEvent  = null;
    return consequence;
  }

  hasActiveEvent() { return this.activeEvent !== null; }
  isLoading()      { return this.loading; }

  reset() {
    this.activeEvent = null;
    this.loading     = false;
    this._eventCount = 0;
    this._pending    = null;
  }
}
```

### API Call Function (in same file)

```js
async function fetchNarrativeEvent(eventNumber, runContext = {}) {
  const contextLine = runContext.pollenBanked != null
    ? `Current run context: ${runContext.pollenBanked} pollen banked this run, HP at ${Math.round((runContext.hp / runContext.maxHp) * 100)}%, active craft: ${runContext.craft || 'bee'}.`
    : '';

  const systemPrompt = `You are the narrator of a Victorian botanical field journal game called The Great Pollinator.
The player is a naturalist's bee collecting pollen specimens across garden biomes.
Generate a brief field journal entry describing an unexpected event the bee encounters on re-deployment.
The event should feel authentic to Victorian natural history writing — precise, observational, slightly formal.
${contextLine}

Respond ONLY with a valid JSON object in this exact shape, no preamble, no markdown fences:
{
  "title": "short event title (max 5 words)",
  "text": "2-3 sentences describing the event in Victorian naturalist voice",
  "choices": [
    {
      "label": "short action label (max 4 words)",
      "description": "one sentence outcome description",
      "consequence": {
        "type": "pollen_modifier | damage_modifier | heal | speed_modifier | pollen_bonus",
        "value": <number>,
        "duration": <seconds or 0 for instant>,
        "description": "brief mechanical effect shown to player"
      }
    },
    {
      "label": "short action label (max 4 words)",
      "description": "one sentence outcome description",
      "consequence": {
        "type": "pollen_modifier | damage_modifier | heal | speed_modifier | pollen_bonus",
        "value": <number>,
        "duration": <seconds or 0 for instant>,
        "description": "brief mechanical effect shown to player"
      }
    }
  ]
}

Consequence types and value meanings:
- pollen_modifier: multiplier on pollen yield for duration (e.g. 0.7 = 30% less, 1.3 = 30% more)
- damage_modifier: multiplier on incoming damage for duration (e.g. 1.5 = 50% more damage taken)
- heal: instant HP restore as percentage of max HP (e.g. 0.25 = 25% heal)
- speed_modifier: multiplier on movement speed for duration (e.g. 0.6 = 40% slower)
- pollen_bonus: instant flat pollen added to carried count (e.g. 5 = +5 pollen)

One choice should be generally favorable, one risky or neutral. Do not make both choices obviously good.
Vary the scenario each call — it is event number ${eventNumber} of this session.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{ role: 'user', content: 'Generate the next field journal event.' }],
    }),
  });

  if (!response.ok) throw new Error(`API ${response.status}`);
  const data  = await response.json();
  const raw   = data.content?.[0]?.text ?? '';
  const clean = raw.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
}
```

### Hive-Exit Event Trigger in `main.js`

Replace the timer-based trigger with hive entry/exit hooks:

```js
// When player ENTERS hive zone (docks):
this.narrative.onHiveEnter({
  pollenBanked: this.runBanked,
  hp: this.bee.hp,
  maxHp: this.bee.maxHp,
  craft: this.progress.upgrades.activeCraft || 'bee',
});

// When player exits hive (clicks Fly Out):
if (this.narrative.onHiveExit()) {
  this.state = 'EVENT'; // show event before returning to field
} else {
  this.state = 'PLAYING';
}
```

The player never waits for the API cold — the call fires while they're spending pollen at the store, which typically takes 5–15 seconds. The ~1 second API response time is fully absorbed.

**In `main.js` render loop:** Add `'EVENT'` case that calls `this.eventUI.draw(ctx, this.narrative.activeEvent, this.narrative.isLoading(), this.LW, this.LH)`.

### New file: `src/pages/games/pollinator/game/ui/EventUI.js`

Full-canvas overlay rendered over the paused game world (world is still visible but dimmed underneath).

**Layout:**
- Semi-transparent dark overlay: `rgba(20, 18, 16, 0.78)`
- Centered panel: parchment `#F0EBE2`, rounded corners, ~480px wide, ~320px tall (scale for mobile)
- Top of panel: small botanical ink illustration (a quill pen writing in a journal — draw with canvas paths)
- Panel header: event `title` in Cormorant Garamond 22px, ink `#1C1209`
- Divider: thin ink line
- Event `text` in Inter 14px, ink, max width ~420px, line-wrapped
- Two choice buttons side by side (or stacked on mobile < 480px canvas width):
  - Each button: rounded rect, parchment background, ink border
  - Button label in Cormorant Garamond 16px bold
  - Button description in Inter 11px italic below label
  - Consequence description in JetBrains Mono 11px below that, in gold for beneficial, crimson for harmful
  - Hover state: border brightens, slight background tint
- Loading state (while API call is in-flight): show animated ellipsis "Consulting the field notes..." in Inter 14px italic, centered in where the text block will be. Dot animation: one dot appears every 0.4s cycling 1→2→3→1

**Click/tap handling:** Record button rects in `_buttons[]` array (same pattern as HiveStore). `main.js` calls `eventUI.hitTest(x, y)` on pointer events when state is `'EVENT'`. On hit: call `this.narrative.resolveChoice(choiceIndex)`, apply returned consequence, return to `'PLAYING'` state.

### Consequence Application in `main.js`

```js
_applyNarrativeConsequence(consequence) {
  if (!consequence) return;
  switch (consequence.type) {
    case 'pollen_modifier':
      this._pollenMultiplier = consequence.value;
      this._pollenModTimer   = consequence.duration;
      break;
    case 'damage_modifier':
      this._narrativeDmgMult = consequence.value;
      this._narrativeDmgTimer = consequence.duration;
      break;
    case 'heal':
      this.bee.hp = Math.min(this.bee.maxHp, this.bee.hp + this.bee.maxHp * consequence.value);
      break;
    case 'speed_modifier':
      this._speedMult    = consequence.value;
      this._speedModTimer = consequence.duration;
      break;
    case 'pollen_bonus':
      // Add directly to carried pollen (common) if under hard cap
      const current = this.bee.getCarriedTotal();
      if (current < this.bee.hardCap) {
        this.bee.carried.common += Math.min(consequence.value, this.bee.hardCap - current);
      }
      break;
  }
  // Show brief consequence flash in HUD
  this._narrativeFlash = { text: consequence.description, timer: 4.0 };
}
```

Tick modifier timers each frame in the PLAYING update loop and reset to 1.0/null when expired. Apply `_pollenMultiplier` when banking pollen, `_narrativeDmgMult` in damage receive, `_speedMult` in Bee movement speed calculation.

Show active narrative modifiers in HUD as small status tags below the pollen counter (similar to combo indicator — small text, color-coded gold/crimson).

### Import and wire in `main.js`

```js
import { NarrativeEngine } from './narrative/NarrativeEngine.js';
import { EventUI }         from './ui/EventUI.js';

// In constructor:
this.narrative = new NarrativeEngine();
this.eventUI   = new EventUI();

// Reset narrative on newRun():
this.narrative = new NarrativeEngine();
```

---

## PART 4 — AUDIO LAYER

**New file:** `src/pages/games/pollinator/game/audio/AudioManager.js`

Use the Web Audio API only — no external libraries, no audio files. Generate all sounds procedurally with oscillators.

```js
export class AudioManager {
  constructor() {
    this._ctx    = null;
    this._muted  = false;
    this._master = null;
  }

  init() {
    // Defer AudioContext creation to first user interaction (browser autoplay policy).
    if (this._ctx) return;
    this._ctx    = new (window.AudioContext || window.webkitAudioContext)();
    this._master = this._ctx.createGain();
    this._master.gain.value = 0.4;
    this._master.connect(this._ctx.destination);
  }

  toggleMute() {
    this._muted = !this._muted;
    if (this._master) this._master.gain.value = this._muted ? 0 : 0.4;
    return this._muted;
  }

  // --- Sound effect methods ---

  playCollect(pollenType) { /* short ascending blip, pitch varies by type */ }
  playAttackDash()        { /* brief whoosh */ }
  playHitReceived()       { /* low thud */ }
  playHitLanded()         { /* satisfying crack */ }
  playPollenDeposit()     { /* soft chime sequence */ }
  playPowerUpActivate()   { /* rising tone */ }
  playDeath()             { /* descending tone */ }
  playHiveEnter()         { /* gentle buzz chord */ }
  playEventTrigger()      { /* page-turn papery sound */ }
}
```

**Implement each sound using Web Audio API oscillators and gain envelopes.** Keep each sound under 300ms. Suggested implementations:

```js
playCollect(pollenType) {
  if (!this._ctx || this._muted) return;
  const pitches = { common: 523, uncommon: 659, rare: 784 }; // C5, E5, G5
  const osc  = this._ctx.createOscillator();
  const gain = this._ctx.createGain();
  osc.connect(gain); gain.connect(this._master);
  osc.type      = 'sine';
  osc.frequency.value = pitches[pollenType] || 523;
  gain.gain.setValueAtTime(0.3, this._ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, this._ctx.currentTime + 0.12);
  osc.start(); osc.stop(this._ctx.currentTime + 0.12);
}

playAttackDash() {
  if (!this._ctx || this._muted) return;
  const buf  = this._ctx.createBuffer(1, this._ctx.sampleRate * 0.1, this._ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src  = this._ctx.createBufferSource();
  const gain = this._ctx.createGain();
  const filt = this._ctx.createBiquadFilter();
  filt.type = 'bandpass'; filt.frequency.value = 800;
  src.buffer = buf;
  src.connect(filt); filt.connect(gain); gain.connect(this._master);
  gain.gain.value = 0.25;
  src.start();
}

playHitReceived() {
  if (!this._ctx || this._muted) return;
  const osc  = this._ctx.createOscillator();
  const gain = this._ctx.createGain();
  osc.connect(gain); gain.connect(this._master);
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(180, this._ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(60, this._ctx.currentTime + 0.15);
  gain.gain.setValueAtTime(0.4, this._ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, this._ctx.currentTime + 0.15);
  osc.start(); osc.stop(this._ctx.currentTime + 0.15);
}

playHitLanded() {
  if (!this._ctx || this._muted) return;
  const osc  = this._ctx.createOscillator();
  const gain = this._ctx.createGain();
  osc.connect(gain); gain.connect(this._master);
  osc.type = 'square';
  osc.frequency.setValueAtTime(440, this._ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(220, this._ctx.currentTime + 0.08);
  gain.gain.setValueAtTime(0.35, this._ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, this._ctx.currentTime + 0.08);
  osc.start(); osc.stop(this._ctx.currentTime + 0.08);
}

playPollenDeposit() {
  if (!this._ctx || this._muted) return;
  [523, 659, 784].forEach((freq, i) => {
    const osc  = this._ctx.createOscillator();
    const gain = this._ctx.createGain();
    osc.connect(gain); gain.connect(this._master);
    osc.type = 'sine';
    osc.frequency.value = freq;
    const t = this._ctx.currentTime + i * 0.08;
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    osc.start(t); osc.stop(t + 0.18);
  });
}

playPowerUpActivate() {
  if (!this._ctx || this._muted) return;
  const osc  = this._ctx.createOscillator();
  const gain = this._ctx.createGain();
  osc.connect(gain); gain.connect(this._master);
  osc.type = 'sine';
  osc.frequency.setValueAtTime(440, this._ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(880, this._ctx.currentTime + 0.25);
  gain.gain.setValueAtTime(0.3, this._ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, this._ctx.currentTime + 0.25);
  osc.start(); osc.stop(this._ctx.currentTime + 0.25);
}

playDeath() {
  if (!this._ctx || this._muted) return;
  const osc  = this._ctx.createOscillator();
  const gain = this._ctx.createGain();
  osc.connect(gain); gain.connect(this._master);
  osc.type = 'sine';
  osc.frequency.setValueAtTime(440, this._ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(110, this._ctx.currentTime + 0.6);
  gain.gain.setValueAtTime(0.4, this._ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, this._ctx.currentTime + 0.6);
  osc.start(); osc.stop(this._ctx.currentTime + 0.6);
}

playHiveEnter() {
  if (!this._ctx || this._muted) return;
  [330, 415, 494].forEach((freq, i) => {
    const osc  = this._ctx.createOscillator();
    const gain = this._ctx.createGain();
    osc.connect(gain); gain.connect(this._master);
    osc.type = 'sine';
    osc.frequency.value = freq;
    const t = this._ctx.currentTime + i * 0.04;
    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.start(t); osc.stop(t + 0.3);
  });
}

playEventTrigger() {
  if (!this._ctx || this._muted) return;
  // Soft noise burst simulating a page turn
  const buf  = this._ctx.createBuffer(1, this._ctx.sampleRate * 0.2, this._ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    const env  = Math.sin((i / data.length) * Math.PI);
    data[i] = (Math.random() * 2 - 1) * env * 0.3;
  }
  const src  = this._ctx.createBufferSource();
  const filt = this._ctx.createBiquadFilter();
  const gain = this._ctx.createGain();
  filt.type = 'highpass'; filt.frequency.value = 2000;
  src.buffer = buf;
  src.connect(filt); filt.connect(gain); gain.connect(this._master);
  gain.gain.value = 0.5;
  src.start();
}
```

### Wiring Audio in `main.js`

```js
import { AudioManager } from './audio/AudioManager.js';

// In constructor:
this.audio = new AudioManager();

// Initialize on first user interaction (attach to the canvas pointerdown listener):
// Add inside the existing pointer/touch handler:
this.audio.init();

// Call audio methods at these moments:
// Pollen collected:       this.audio.playCollect(pollen.type)
// Dash attack fired:      this.audio.playAttackDash()
// Player hit received:    this.audio.playHitReceived()
// Enemy hit landed:       this.audio.playHitLanded()
// Pollen deposited:       this.audio.playPollenDeposit()
// Power-up activated:     this.audio.playPowerUpActivate()
// Player dies:            this.audio.playDeath()
// Entering hive:          this.audio.playHiveEnter()
// Narrative event fires:  this.audio.playEventTrigger()
```

### Mute Toggle Button

Add a small mute button to the HUD (top-right corner, above or beside the power-up slot). Draw as a speaker icon (canvas paths: rectangle body + two sound wave arcs, or an X through it when muted). On click/tap: call `this.audio.toggleMute()`, update icon state.

Add to `HUD.js`: accept `muteState` and `muteBtnRect` in the draw options. Record the button rect for hit-testing in `main.js`.

---

## PART 5 — POLISH PASS

### 5A. Start Screen — Add Mute Notice

On the Start Screen, add a small line below the rules: `"Tap anywhere to enable audio"` — Inter 11px, muted ink color. This primes the user for the audio init on first interaction.

### 5B. HUD — Narrative Flash Display

When `this._narrativeFlash` is active in `main.js`, render a centered text overlay near the bottom of the game canvas (above the joystick on mobile):
- Text from `_narrativeFlash.text`
- Font: Inter 13px italic
- Color: gold if beneficial consequence, crimson if harmful
- Fades out over 4 seconds (alpha = timer / 4.0)

### 5C. HUD — Active Narrative Modifier Tags

Below the pollen counter, alongside the combo indicator, show small status tags for any active narrative modifiers:
- Examples: `"POLLEN ×1.3"` in gold, `"DMG ×1.5"` in crimson, `"SPEED ×0.6"` in amber
- Font: JetBrains Mono 11px
- Only show while modifier timer > 0

### 5D. Game Over Screen — Sprint Attribution

Add a small line at the bottom of the game over screen:
- `"Built in 2 days · The Great Pollinator v1.0 · jaxontravis.com"`
- Font: Inter 10px, muted parchment color `rgba(240,235,226,0.45)`
- This is the portfolio signal — visible to anyone who screenshots the end screen

### 5E. Perennial Link on Game Over Screen

Below the "Try Again" button, add a small text link:
- `"Explore the Perennial card game →"`
- Font: Inter 12px, gold `#D4A83F`
- On click/tap: `window.open('https://jaxontravis.com/perennial', '_blank')`
- Record the click rect for hit-testing in `main.js`

---

## PART 6 — STORAGE UPDATE

**Modify `src/pages/games/pollinator/game/utils/storage.js`**

Add `activeCraft: 'hornet'` as a valid option in the craft switching logic (already handled if Phase 2 was built correctly — just verify `DEFAULT_UPGRADES` includes `craftsUnlocked: []` and `activeCraft: 'bee'`).

No other storage changes needed for Phase 3.

---

## PART 7 — WIRING SUMMARY FOR `main.js`

Full list of additions/changes to `main.js` in Phase 3:

1. Import `NarrativeEngine`, `EventUI`, `AudioManager`, `Hornet`
2. Instantiate all four in constructor
3. Add `'EVENT'` to update and render switch statements
4. Call `this.narrative.update(dt)` in PLAYING update, check `hasActiveEvent()` to transition to EVENT state
5. Call `this.eventUI.draw()` in EVENT render
6. Wire `hitTest` for EVENT state pointer events → `resolveChoice` → `_applyNarrativeConsequence` → return to PLAYING
7. Call `this.audio.init()` on first pointer/touch event
8. Wire all audio calls at correct game moments (listed in Part 4)
9. Add mute button rect tracking and hit-test in pointer handler
10. Add `_narrativeFlash`, `_pollenMultiplier`, `_narrativeDmgMult`, `_speedMult` modifier fields and tick them down each PLAYING frame
11. Apply modifiers in correct calculation points (pollen banking, damage receive, movement speed)
12. Add Hornet to `_spawnCraft()` switch
13. Add `hornet.updateProjectiles()` call in PLAYING update when active craft is Hornet
14. Render narrative flash text and modifier tags by passing to HUD draw
15. Wire Perennial link click on game over screen
16. Reset `narrative` and `_narrativeFlash` and all modifier fields in `newRun()`

---

## PART 8 — DO NOT TOUCH

**All changes must stay inside `src/pages/games/pollinator/` — this is a hard boundary enforced by a concurrent build session in the same repo.**

- `src/App.jsx` — **DO NOT TOUCH.** Route confirmed present from Phase 1. A second Claude Code session may be writing to this file simultaneously.
- `src/pages/games/pollinator/PollinatorPage.jsx` — CSS fix only in `.module.css`, not the JSX
- Any file outside `src/pages/games/pollinator/` — **hard stop, no exceptions**
- Do not install any npm packages
- Do not build Forest, Garden, or Greenhouse biomes — still coming soon
- Do not add `viewport-fit=cover` to `index.html` if it is already present — check first before writing

---

## PART 9 — COMPLETION CHECKLIST

**Mobile Safe Area:**
- [ ] Canvas does not extend behind Chrome bottom navigation bar on Android
- [ ] Canvas does not extend behind Safari home indicator on iOS
- [ ] Virtual joystick base, attack button, and heal button are all fully visible and tappable
- [ ] Hive exit button is fully visible above any browser UI
- [ ] No layout regressions on desktop (still fills viewport correctly)

**Hornet:**
- [ ] Hornet purchasable for 120 pollen in Hangar
- [ ] Projectiles fire in facing direction, travel 350px, expire on hit or range
- [ ] Projectiles deal 45 flat damage regardless of direction
- [ ] Projectile trail renders correctly
- [ ] Hornet cannot be selected until purchased
- [ ] `_spawnCraft('hornet')` returns correct instance

**Narrative AI Layer:**
- [ ] EVENT fires on hive exit (not on a timer), max 5 events per session
- [ ] API call begins when player enters hive, resolves before exit
- [ ] API call generates valid JSON event object
- [ ] Loading state shows animated ellipsis if API still in-flight on exit
- [ ] Event panel renders with title, text, and two choice buttons
- [ ] Both choice buttons are tappable on mobile without browser UI interference
- [ ] Consequence is applied correctly on choice (test each type)
- [ ] API failure fails silently — game continues without event, no console errors uncaught
- [ ] Narrative modifiers show in HUD while active
- [ ] Narrative flash text appears and fades correctly
- [ ] Narrative engine resets on newRun()

**Audio:**
- [ ] No audio plays before first user interaction
- [ ] All 9 sound effects trigger at correct game moments
- [ ] Mute button toggles audio on and off
- [ ] Mute state persists across hive store opens and game state transitions
- [ ] No AudioContext errors in console
- [ ] Sounds are not ear-piercing (gain values capped)

**Polish:**
- [ ] Sprint attribution line visible on game over screen
- [ ] Perennial link visible and functional on game over screen
- [ ] Narrative flash text renders above joystick on mobile
- [ ] Mute notice visible on start screen

---

*This is the final Phase 3 sprint build. The game is considered v1.0 complete after this pass.*
*Phase 4 considerations (if any): Forest/Garden/Greenhouse full biome builds, power-up stacking, leaderboard, standalone domain deployment.*
