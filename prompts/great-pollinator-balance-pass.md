# Great Pollinator — Balance & Polish Pass

Read this entire file before touching any code. Work through all 7 sections in order. Each section lists exactly which files to touch. Commit once at the end with the message at the bottom.

---

## SECTION 1 — Replace API narrative with local prompt bank

### Problem
`NarrativeEngine.js` fires a live Anthropic API call every hive visit. Replace entirely with a local bank of 30 hand-authored events. The API endpoint (`/api/narrative`) can stay in place but will no longer be called from the client.

### 1A — Rewrite `src/game/narrative/NarrativeEngine.js`

Replace the entire file with the following. Do not keep any fetch/API code.

```js
// NarrativeEngine — local prompt bank replacing the Anthropic API call.
// 30 hand-authored events drawn randomly without replacement until the bank
// is exhausted, then reshuffled. Fires between every 3rd and 5th hive return
// (randomly chosen each cycle) so it never feels routine.
//
// Consequence type distribution across the 30 events (intentional weighting):
//   damage_modifier ×8  (buffs and debuffs — most common)
//   speed_modifier  ×6
//   pollen_modifier ×6
//   heal            ×5
//   pollen_bonus    ×3  (rare — small amounts only, never fills carry cap)
//   enemy_clear     ×2  (kills all enemies within 300px)
//
// pollen_bonus value is capped at 2 across all 30 events. Never more.

const EVENTS = [
  {
    title: 'Sudden Downpour',
    text: 'Storm clouds gather without warning. The rain drums the petals flat.',
    choices: [
      { label: 'Shelter under a leaf', consequence: { type: 'damage_modifier', value: 0.6, duration: 45, description: 'Sheltered — incoming damage reduced for 45s' } },
      { label: 'Fly through it', consequence: { type: 'speed_modifier', value: 1.3, duration: 30, description: 'Adrenaline — speed boosted for 30s' } },
    ],
  },
  {
    title: 'Spider Silk Tangle',
    text: 'A loose web strand catches your wing mid-flight. Every movement costs effort.',
    choices: [
      { label: 'Tear free immediately', consequence: { type: 'damage_modifier', value: 1.4, duration: 20, description: 'Disoriented — damage taken increased for 20s' } },
      { label: 'Work free carefully', consequence: { type: 'speed_modifier', value: 0.7, duration: 35, description: 'Slowed — movement reduced for 35s' } },
    ],
  },
  {
    title: 'Warm Thermal',
    text: 'A column of warm air rises from the sun-baked stone. It carries you effortlessly.',
    choices: [
      { label: 'Ride the thermal high', consequence: { type: 'speed_modifier', value: 1.5, duration: 40, description: 'Thermal lift — speed greatly boosted for 40s' } },
      { label: 'Stay low and collect', consequence: { type: 'pollen_modifier', value: 1.5, duration: 30, description: 'Focused foraging — pollen value boosted for 30s' } },
    ],
  },
  {
    title: 'Rival Drone',
    text: 'A scout from a competing hive is shadowing your route.',
    choices: [
      { label: 'Chase it off', consequence: { type: 'damage_modifier', value: 1.3, duration: 25, description: 'Territorial — incoming damage increased for 25s' } },
      { label: 'Take an alternate path', consequence: { type: 'speed_modifier', value: 0.8, duration: 30, description: 'Cautious route — movement slightly slowed for 30s' } },
    ],
  },
  {
    title: 'Pollen Cloud',
    text: 'A meadow sedge releases its full season of pollen at once. The air turns gold.',
    choices: [
      { label: 'Fly through the cloud', consequence: { type: 'pollen_modifier', value: 2.0, duration: 20, description: 'Pollen surge — collection value doubled for 20s' } },
      { label: 'Wait for it to settle', consequence: { type: 'heal', value: 0.25, description: 'Rested — recovered 25% HP' } },
    ],
  },
  {
    title: 'Sudden Cold Snap',
    text: 'The temperature drops sharply. Your wings stiffen at the joints.',
    choices: [
      { label: 'Push through the cold', consequence: { type: 'speed_modifier', value: 0.65, duration: 40, description: 'Cold-stiffened — movement reduced for 40s' } },
      { label: 'Vibrate wings to warm up', consequence: { type: 'damage_modifier', value: 1.25, duration: 30, description: 'Exposed — damage taken increased while warming for 30s' } },
    ],
  },
  {
    title: 'Old Wax Seal',
    text: 'You find a cache of old propolis sealed by a previous generation. It smells of ancient summers.',
    choices: [
      { label: 'Eat it for energy', consequence: { type: 'heal', value: 0.4, description: 'Old propolis — recovered 40% HP' } },
      { label: 'Rub it on your wings', consequence: { type: 'damage_modifier', value: 0.7, duration: 50, description: 'Propolis armor — damage reduced for 50s' } },
    ],
  },
  {
    title: 'Wind Shift',
    text: 'The prevailing wind swings 180 degrees. Your mental map inverts.',
    choices: [
      { label: 'Use the tailwind', consequence: { type: 'speed_modifier', value: 1.4, duration: 35, description: 'Tailwind — speed boosted for 35s' } },
      { label: 'Fight the headwind', consequence: { type: 'pollen_modifier', value: 1.3, duration: 40, description: 'Hard-won — pollen value increased for 40s' } },
    ],
  },
  {
    title: 'Ant Column',
    text: 'A foraging column of ants is crossing your usual path. They carry fragments of leaf and seed.',
    choices: [
      { label: 'Follow the column', consequence: { type: 'pollen_bonus', value: 2, description: 'Ant scouts — found 2 pollen along their trail' } },
      { label: 'Cross overhead', consequence: { type: 'speed_modifier', value: 1.2, duration: 25, description: 'Shortcut — movement boosted for 25s' } },
    ],
  },
  {
    title: 'Thunderclap',
    text: 'A single massive thunderclap shakes the petals loose across the whole meadow.',
    choices: [
      { label: 'Dive for cover', consequence: { type: 'damage_modifier', value: 0.75, duration: 30, description: 'Sheltered — damage reduced for 30s' } },
      { label: 'Use the chaos', consequence: { type: 'enemy_clear', value: 300, description: 'Thunder startled enemies within 300px — they scattered' } },
    ],
  },
  {
    title: 'Morning Dew',
    text: 'Heavy dew has pooled in every cup and hollow. The world sparkles.',
    choices: [
      { label: 'Drink deeply', consequence: { type: 'heal', value: 0.5, description: 'Refreshed — recovered 50% HP' } },
      { label: 'Use it to clean wings', consequence: { type: 'speed_modifier', value: 1.25, duration: 40, description: 'Clean wings — speed slightly boosted for 40s' } },
    ],
  },
  {
    title: 'Territorial Wasp',
    text: 'A paper wasp hovers at the boundary of its nest zone, wings drumming a warning.',
    choices: [
      { label: 'Retreat and regroup', consequence: { type: 'speed_modifier', value: 0.75, duration: 20, description: 'Rerouted — speed reduced briefly' } },
      { label: 'Hold your line', consequence: { type: 'damage_modifier', value: 1.35, duration: 25, description: 'Contested zone — incoming damage increased for 25s' } },
    ],
  },
  {
    title: 'Abandoned Larder',
    text: 'A shallow burrow holds a cache of dried pollen left by a solitary bee that never returned.',
    choices: [
      { label: 'Take what you can carry', consequence: { type: 'pollen_bonus', value: 2, description: 'Larder find — recovered 2 pollen' } },
      { label: 'Leave it — press on', consequence: { type: 'speed_modifier', value: 1.3, duration: 30, description: 'Motivated — speed boosted for 30s' } },
    ],
  },
  {
    title: 'Noon Heat',
    text: 'The sun reaches its peak. Heat shimmer rises from every surface.',
    choices: [
      { label: 'Rest in shade', consequence: { type: 'heal', value: 0.35, description: 'Midday rest — recovered 35% HP' } },
      { label: 'Forage through the heat', consequence: { type: 'pollen_modifier', value: 1.4, duration: 25, description: 'Peak bloom — pollen value increased for 25s' } },
    ],
  },
  {
    title: 'Spore Burst',
    text: 'A puffball fungus detonates directly in your path. You fly through a cloud of brown dust.',
    choices: [
      { label: 'Bank away sharply', consequence: { type: 'speed_modifier', value: 1.35, duration: 20, description: 'Evasive — speed boosted briefly' } },
      { label: 'Fly straight through', consequence: { type: 'damage_modifier', value: 1.3, duration: 30, description: 'Spore-dusted — damage taken increased for 30s' } },
    ],
  },
  {
    title: 'Old Orb-Weaver',
    text: 'A massive orb-weaver has rebuilt her web overnight across your best route.',
    choices: [
      { label: 'Cut through the web', consequence: { type: 'damage_modifier', value: 1.2, duration: 20, description: 'Tangled briefly — damage increased for 20s' } },
      { label: 'Detour around her', consequence: { type: 'pollen_modifier', value: 1.25, duration: 35, description: 'Scenic detour — pollen value increased for 35s' } },
    ],
  },
  {
    title: 'Static Charge',
    text: 'Dry air and fast movement build a static charge across your body. Pollen leaps toward you unbidden.',
    choices: [
      { label: 'Exploit the charge', consequence: { type: 'pollen_modifier', value: 1.6, duration: 20, description: 'Electrostatic — pollen collection value boosted for 20s' } },
      { label: 'Discharge on a stem', consequence: { type: 'heal', value: 0.2, description: 'Grounded — discharged safely, minor HP recovered' } },
    ],
  },
  {
    title: 'Predator Overhead',
    text: 'A shadow passes — a swallow hunting on the wing. Every insect in the meadow freezes.',
    choices: [
      { label: 'Stay perfectly still', consequence: { type: 'enemy_clear', value: 300, description: 'Predator panic — nearby enemies fled the area' } },
      { label: 'Use the distraction', consequence: { type: 'pollen_bonus', value: 1, description: 'Opportunist — collected 1 pollen while enemies froze' } },
    ],
  },
  {
    title: 'Fungal Mat',
    text: 'A patch of mycelium network hums faintly underfoot. Something old and slow is thinking here.',
    choices: [
      { label: 'Absorb the signal', consequence: { type: 'damage_modifier', value: 0.65, duration: 45, description: 'Network calm — damage received greatly reduced for 45s' } },
      { label: 'Carry a spore', consequence: { type: 'pollen_modifier', value: 1.3, duration: 40, description: 'Spore carrier — pollen value boosted for 40s' } },
    ],
  },
  {
    title: 'Broken Antenna',
    text: 'One antenna took a hit from a branch. Perception is reduced but the sting is stronger.',
    choices: [
      { label: 'Fight through it', consequence: { type: 'damage_modifier', value: 1.2, duration: 35, description: 'Half-blind — damage received increased for 35s' } },
      { label: 'Compensate carefully', consequence: { type: 'speed_modifier', value: 0.8, duration: 30, description: 'Cautious — movement slowed while compensating' } },
    ],
  },
  {
    title: 'Late Bloomer',
    text: 'A patch of flowers missed the main season. They are blooming now, unpollinated, heavy with nectar.',
    choices: [
      { label: 'Focus on them', consequence: { type: 'pollen_modifier', value: 1.8, duration: 25, description: 'Late bloom — pollen value greatly boosted for 25s' } },
      { label: 'Mark them and move on', consequence: { type: 'speed_modifier', value: 1.2, duration: 35, description: 'Good intel — movement boosted for 35s' } },
    ],
  },
  {
    title: 'Beetle Standoff',
    text: 'A rhinoceros beetle blocks the path, horns lowered. It will not yield.',
    choices: [
      { label: 'Go over it', consequence: { type: 'speed_modifier', value: 1.3, duration: 20, description: 'Cleared obstacle — brief speed boost' } },
      { label: 'Sting it and push through', consequence: { type: 'damage_modifier', value: 1.25, duration: 20, description: 'Spent venom — damage received increased for 20s' } },
    ],
  },
  {
    title: 'Damp Hollow',
    text: 'A mossy hollow holds trapped cool air. The moisture restores something in you.',
    choices: [
      { label: 'Rest here fully', consequence: { type: 'heal', value: 0.6, description: 'Deep rest — recovered 60% HP' } },
      { label: 'Fill up and fly', consequence: { type: 'heal', value: 0.3, description: 'Quick rest — recovered 30% HP' } },
    ],
  },
  {
    title: 'Magnetic Anomaly',
    text: 'Something underground is interfering with your navigation sense. The hive seems further than it should.',
    choices: [
      { label: 'Trust your memory', consequence: { type: 'pollen_modifier', value: 1.35, duration: 30, description: 'Forced focus — pollen value increased for 30s' } },
      { label: 'Fly in circles to recalibrate', consequence: { type: 'speed_modifier', value: 0.7, duration: 25, description: 'Disoriented — movement slowed for 25s' } },
    ],
  },
  {
    title: 'Hive Memory',
    text: 'A waggle dance from a returning forager is still fresh in your memory. You know exactly where to go.',
    choices: [
      { label: 'Follow the route precisely', consequence: { type: 'pollen_modifier', value: 1.5, duration: 30, description: 'Hive intel — pollen value boosted for 30s' } },
      { label: 'Extend the route', consequence: { type: 'speed_modifier', value: 1.35, duration: 40, description: 'Ambitious forager — speed boosted for 40s' } },
    ],
  },
  {
    title: 'Wildfire Smoke',
    text: 'Distant smoke drifts in. It calms the insects but stings the eyes.',
    choices: [
      { label: 'Use the calm', consequence: { type: 'enemy_clear', value: 300, description: 'Smoke calm — nearby enemies became docile' } },
      { label: 'Fly below the smoke layer', consequence: { type: 'damage_modifier', value: 0.75, duration: 35, description: 'Low flight — damage reduced for 35s' } },
    ],
  },
  {
    title: 'First Frost Warning',
    text: 'A single frosted petal tells you the season is turning. Every run feels more urgent.',
    choices: [
      { label: 'Forage harder', consequence: { type: 'pollen_modifier', value: 1.4, duration: 35, description: 'Urgency — pollen value increased for 35s' } },
      { label: 'Prepare for the cold', consequence: { type: 'damage_modifier', value: 0.7, duration: 45, description: 'Fortified — damage reduced for 45s' } },
    ],
  },
  {
    title: 'Caterpillar Trail',
    text: 'A processionary caterpillar column winds across a leaf cluster, leaving a sticky silk trail.',
    choices: [
      { label: 'Leap over the trail', consequence: { type: 'speed_modifier', value: 1.25, duration: 25, description: 'Clean jump — speed briefly boosted' } },
      { label: 'Crawl through carefully', consequence: { type: 'damage_modifier', value: 1.15, duration: 20, description: 'Silk-slowed — minor damage increase for 20s' } },
    ],
  },
  {
    title: 'Raindrop Impact',
    text: 'A single fat raindrop hits your thorax at full speed. You spin and recover.',
    choices: [
      { label: 'Shake it off', consequence: { type: 'heal', value: 0.15, description: 'Recovered — minor HP restored from the shock' } },
      { label: 'Use the momentum', consequence: { type: 'speed_modifier', value: 1.4, duration: 15, description: 'Slingshot — brief speed surge' } },
    ],
  },
  {
    title: 'Quiet Hour',
    text: 'An unexpected stillness settles over the meadow. Even the predators seem to pause.',
    choices: [
      { label: 'Forage freely', consequence: { type: 'pollen_modifier', value: 1.6, duration: 30, description: 'Quiet hour — pollen value greatly boosted for 30s' } },
      { label: 'Recover while you can', consequence: { type: 'heal', value: 0.45, description: 'Rest — recovered 45% HP' } },
    ],
  },
];

export class NarrativeEngine {
  constructor() {
    this.activeEvent = null;
    this.loading = false;      // kept for UI compatibility (EventUI checks this)
    this._deck = [];           // remaining unplayed indices
    this._nextTriggerIn = this._rollTrigger(); // hive returns until next event
    this._returnsSinceEvent = 0;
  }

  // Rolls how many hive returns until the next event fires (3, 4, or 5).
  _rollTrigger() {
    return 3 + Math.floor(Math.random() * 3); // 3, 4, or 5
  }

  // Draw a random event from the deck without replacement.
  _drawEvent() {
    if (this._deck.length === 0) {
      // Reshuffle all 30
      this._deck = EVENTS.map((_, i) => i).sort(() => Math.random() - 0.5);
    }
    return EVENTS[this._deck.pop()];
  }

  // Called when player ENTERS the hive.
  onHiveEnter(/* runContext — kept for API compatibility */) {
    this._returnsSinceEvent += 1;

    if (this.activeEvent) return; // one at a time

    const shouldFire = this._returnsSinceEvent >= this._nextTriggerIn;
    if (!shouldFire) return;

    this.activeEvent = this._drawEvent();
    this._returnsSinceEvent = 0;
    this._nextTriggerIn = this._rollTrigger();
  }

  // Called when player EXITS the hive — returns true if an event is waiting.
  onHiveExit() {
    return this.activeEvent !== null;
  }

  resolveChoice(choiceIndex) {
    if (!this.activeEvent) return null;
    const choice = this.activeEvent.choices[choiceIndex];
    const consequence = choice ? choice.consequence : null;
    this.activeEvent = null;
    return consequence;
  }

  hasActiveEvent() { return this.activeEvent !== null; }
  isLoading()      { return false; } // no async — always false
  reset() {
    this.activeEvent = null;
    this._returnsSinceEvent = 0;
    this._nextTriggerIn = this._rollTrigger();
  }
}

export function isBeneficialConsequence(c) {
  if (!c) return true;
  switch (c.type) {
    case 'heal':
    case 'pollen_bonus':
    case 'enemy_clear':
      return true;
    case 'pollen_modifier':
    case 'speed_modifier':
      return c.value >= 1;
    case 'damage_modifier':
      return c.value <= 1;
    default:
      return true;
  }
}
```

### 1B — Add `enemy_clear` consequence to `_applyNarrativeConsequence` in `src/game/main.js`

Find `_applyNarrativeConsequence` and add inside the switch before the `default`:
```js
case 'enemy_clear': {
  const range = consequence.value || 300;
  for (const e of this.enemies) {
    if (!e.dead && distance(this.bee, e) <= range) {
      e.takeDamage(e.hp);
    }
  }
  break;
}
```

---

## SECTION 2 — Per-craft upgrade paths

### 2A — Update `src/game/utils/storage.js`

Replace `DEFAULT_UPGRADES` with a per-craft structure:

```js
const CRAFT_IDS = ['bee', 'moth', 'locust', 'hornet', 'butterfly', 'wasp', 'dragonfly', 'spider_craft'];

function defaultCraftUpgrades() {
  return {
    maxHp: 0,
    damageReduction: 0,
    attackBoost: 0,
    pollenCapacity: 0,
    dashCooldown: 0,
    magnetRadius: 0,
    comboWindow: 0,
    healingItems: 0,
  };
}

const DEFAULT_UPGRADES = {
  craftsUnlocked: [],
  activeCraft: 'bee',
  // Per-craft upgrade levels — each craft has its own independent levels
  crafts: Object.fromEntries(CRAFT_IDS.map(id => [id, defaultCraftUpgrades()])),
};
```

Update `loadProgress()` to ensure the `crafts` object is always populated with defaults for any missing craft:
```js
const upgrades = { ...DEFAULT_UPGRADES, ...readJSON(STORAGE_KEYS.UPGRADES, {}) };
if (!Array.isArray(upgrades.craftsUnlocked)) upgrades.craftsUnlocked = [];
if (typeof upgrades.activeCraft !== 'string') upgrades.activeCraft = 'bee';
// Ensure crafts sub-object exists with defaults for all craft IDs
if (!upgrades.crafts || typeof upgrades.crafts !== 'object') upgrades.crafts = {};
for (const id of CRAFT_IDS) {
  if (!upgrades.crafts[id]) upgrades.crafts[id] = defaultCraftUpgrades();
}
```

**Backward compatibility:** The old flat `upgrades.maxHp` etc. may exist in localStorage from before this change. In `loadProgress`, after populating the crafts object, check for legacy flat fields and migrate them into the bee's craft entry:
```js
const LEGACY_FIELDS = ['maxHp','damageReduction','attackBoost','pollenCapacity','dashCooldown','magnetRadius','comboWindow','healingItems'];
const hasLegacy = LEGACY_FIELDS.some(f => upgrades[f] != null && upgrades[f] !== 0);
if (hasLegacy) {
  for (const f of LEGACY_FIELDS) {
    if (upgrades[f] != null) upgrades.crafts.bee[f] = upgrades[f];
  }
  LEGACY_FIELDS.forEach(f => delete upgrades[f]);
}
```

### 2B — Update `src/game/main.js` — per-craft upgrade reads

Everywhere `this.progress.upgrades.maxHp` (or any other flat upgrade field) is read, replace with `this._craftUpgrades()`:

Add helper method:
```js
/** Returns the upgrade object for the currently active craft. */
_craftUpgrades() {
  const id = this.progress.upgrades.activeCraft || 'bee';
  return this.progress.upgrades.crafts?.[id] || {};
}
```

Update `_spawnCraft` to pass `this._craftUpgrades()` to the craft constructor instead of `this.progress.upgrades`.

Update `_buy` to write to the active craft's entry:
```js
_buy(upgradeId) {
  const u = UPGRADES.find(x => x.id === upgradeId);
  if (!u) return;
  const craftId = this.progress.upgrades.activeCraft || 'bee';
  const craftUp = this.progress.upgrades.crafts[craftId];
  const cap = levelCapFor(this.activeBiome || 'meadow');
  if (u.kind === 'level') {
    if ((craftUp[u.id] || 0) >= Math.min(cap, u.globalMax || 20)) return;
    const cost = u.cost;
    const available = this.progress.totalBanked + this.bee.getCarriedTotal();
    if (available < cost) return;
    // Deduct from carried first, then banked
    let remaining = cost;
    remaining = this.bee.spendCarried(remaining);
    this.progress.totalBanked = Math.max(0, this.progress.totalBanked - remaining);
    craftUp[u.id] = (craftUp[u.id] || 0) + 1;
  } else if (u.kind === 'heal') {
    const held = craftUp.healingItems || 0;
    if (held >= 3) return;
    const amount = Math.min(u.amount, 3 - held);
    if (amount <= 0) return;
    const cost = u.cost;
    const available = this.progress.totalBanked + this.bee.getCarriedTotal();
    if (available < cost) return;
    let remaining = cost;
    remaining = this.bee.spendCarried(remaining);
    this.progress.totalBanked = Math.max(0, this.progress.totalBanked - remaining);
    craftUp.healingItems = held + amount;
  }
  this._save();
  if (this.bee?.applyUpgrades) this.bee.applyUpgrades(craftUp);
}
```

### 2C — Update `src/game/ui/HiveStore.js` STORE tab

`_drawStore` must now receive `craftUpgrades` (the active craft's own upgrade object) instead of the flat `upgrades`. Update the draw call chain:

In `draw()`, change:
```js
else if (this.tab === 'STORE') this._drawStore(ctx, { bee, banked, upgrades: craftUpgrades, px, pw, contentY });
```

Pass `craftUpgrades` from `main.js` in the draw data object as a new field. In `main.js`, when calling `this.store.draw(...)`, add:
```js
craftUpgrades: this._craftUpgrades(),
```

In `_drawStore`, destructure `craftUpgrades` and use it for level reads:
```js
_drawStore(ctx, { bee, banked, craftUpgrades, upgrades, px, pw, contentY, activeBiome }) {
  // use craftUpgrades[u.id] instead of upgrades[u.id] for all level reads
}
```

Add a subtitle showing which craft's upgrades are shown:
```js
const craftId = upgrades.activeCraft || 'bee';
const craftName = craftId.charAt(0).toUpperCase() + craftId.slice(1).replace('_craft','');
text(ctx, `Upgrades for: ${craftName}`, cx, contentY - 20, {
  fontStr: font(FONTS.body, 11, '600'),
  color: rgba(COLORS.ink, 0.55),
});
```

---

## SECTION 3 — Magnet radius rebalance

### In all craft files (`Bee.js`, `Moth.js`, `Locust.js`, `Hornet.js`, `Butterfly.js`, `Wasp.js`, `Dragonfly.js`, `Spider.js`)

In `applyUpgrades`, change the magnet radius scaling from `+20px per level` to `+8px per level`:

```js
// BEFORE:
this.collectionRadius = 60 + 20 * magLevel;
// AFTER:
this.collectionRadius = 60 + 8 * magLevel;
```

Max radius at level 20 = 60 + 8×20 = 220px. But per-biome level cap means:
- Meadow cap 5: max 100px
- Forest cap 10: max 140px
- Garden cap 15: max 180px
- Greenhouse cap 20: max 220px

This keeps the upgrade meaningful and progressive without pulling off-screen pollen.

Also in `src/game/main.js`, the sunflower powerup overrides collection radius to 180. Change to 140 so it doesn't exceed Greenhouse-tier upgrade levels:
```js
bee.collectionRadius = this.activePowerUp?.type === 'sunflower' ? 140 : (bee.baseCollectionRadius || 60);
```

Add `this.baseCollectionRadius = this.collectionRadius` at the end of `applyUpgrades` in each craft so the powerup can restore the correct radius after expiry.

---

## SECTION 4 — Hangar pagination (4 crafts visible, left/right arrows)

### In `src/game/ui/HiveStore.js`

Add `this._hangarPage = 0;` to the constructor.

Replace `_drawHangar` with a paginated version. Show 4 crafts per page (2×2 grid). Navigation arrows appear when there are more than 4 crafts.

```js
_drawHangar(ctx, { banked, upgrades, px, py, pw, ph, contentY }) {
  const cx = px + pw / 2;
  const craftId = upgrades.activeCraft || 'bee';

  // Filter to only crafts available in the current/unlocked biomes
  const visibleCrafts = CRAFTS.filter(c => {
    return c.cost === 0 || (upgrades.craftsUnlocked || []).includes(c.id) ||
           this._isCraftPurchasable(c, upgrades);
  });

  const PAGE_SIZE = 4;
  const totalPages = Math.ceil(visibleCrafts.length / PAGE_SIZE);
  // Clamp page to valid range
  this._hangarPage = Math.max(0, Math.min(this._hangarPage, totalPages - 1));
  const pageStart = this._hangarPage * PAGE_SIZE;
  const pageCrafts = visibleCrafts.slice(pageStart, pageStart + PAGE_SIZE);

  // Header
  text(ctx, 'SELECT YOUR CRAFT', cx, contentY + 6, {
    fontStr: font(FONTS.body, 12, '700'), color: rgba(COLORS.ink, 0.7),
  });
  text(ctx, `Banked pollen: ${banked}`, cx, contentY + 22, {
    fontStr: font(FONTS.mono, 11), color: rgba(COLORS.ink, 0.6),
  });

  // Pagination controls (only if more than one page)
  if (totalPages > 1) {
    const arrowY = contentY + 14;
    // Left arrow
    if (this._hangarPage > 0) {
      const lx = px + 20;
      panel(ctx, lx, arrowY, 28, 22, { fill: rgba(COLORS.ink, 0.08), stroke: rgba(COLORS.ink, 0.3), lineWidth: 1, radius: 5 });
      text(ctx, '‹', lx + 14, arrowY + 11, { fontStr: font(FONTS.title, 16), color: COLORS.ink });
      this._btn('hangar-prev', lx, arrowY, 28, 22);
    }
    // Right arrow
    if (this._hangarPage < totalPages - 1) {
      const rx2 = px + pw - 48;
      panel(ctx, rx2, arrowY, 28, 22, { fill: rgba(COLORS.ink, 0.08), stroke: rgba(COLORS.ink, 0.3), lineWidth: 1, radius: 5 });
      text(ctx, '›', rx2 + 14, arrowY + 11, { fontStr: font(FONTS.title, 16), color: COLORS.ink });
      this._btn('hangar-next', rx2, arrowY, 28, 22);
    }
    // Page indicator
    text(ctx, `${this._hangarPage + 1} / ${totalPages}`, cx, contentY + 38, {
      fontStr: font(FONTS.body, 10), color: rgba(COLORS.ink, 0.45),
    });
  }

  // Craft grid — always 2×2
  const cols = 2;
  const gap = 10;
  const gridX = px + 24;
  const gridW = pw - 48;
  const cardW = (gridW - gap) / cols;
  const gridY = contentY + (totalPages > 1 ? 50 : 38);
  const availH = py + ph - 64 - gridY - 8;
  const cardH = (availH - gap) / 2;

  pageCrafts.forEach((craft, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cardX = gridX + col * (cardW + gap);
    const cardY = gridY + row * (cardH + gap);
    const isUnlocked = craft.cost === 0 || (upgrades.craftsUnlocked || []).includes(craft.id);
    const isActive = craftId === craft.id;

    panel(ctx, cardX, cardY, cardW, cardH, {
      fill: isActive ? rgba(COLORS.gold, 0.12) : rgba(COLORS.ink, 0.03),
      stroke: isActive ? COLORS.gold : rgba(COLORS.ink, 0.3),
      lineWidth: isActive ? 2.5 : 1.2,
      radius: 8,
    });

    const ccx = cardX + cardW / 2;
    text(ctx, craft.name, ccx, cardY + 16, { fontStr: font(FONTS.title, 16, '600'), color: COLORS.ink });

    ctx.save();
    ctx.translate(ccx, cardY + 44);
    this._drawCraftIcon(ctx, craft.id);
    ctx.restore();

    const btnAreaTop = cardY + cardH - 38;
    const statY = Math.min(cardY + 72, btnAreaTop - 76);
    text(ctx, `HP ${craft.hp}`, ccx, statY, { fontStr: font(FONTS.body, 11), color: rgba(COLORS.ink, 0.85) });
    text(ctx, `Speed ${craft.speed}`, ccx, statY + 15, { fontStr: font(FONTS.body, 11), color: rgba(COLORS.ink, 0.85) });
    text(ctx, `Capacity ${craft.capacity}`, ccx, statY + 30, { fontStr: font(FONTS.body, 11), color: rgba(COLORS.ink, 0.85) });
    const specialY = statY + 47;
    if (specialY + 18 < btnAreaTop) {
      this._wrapText(ctx, craft.special, ccx, specialY, cardW - 20, 11, {
        fontStr: `italic ${font(FONTS.body, 10)}`,
        color: rgba(COLORS.ink, 0.65),
      });
    }

    const aw = cardW - 20;
    const ax = cardX + 10;
    const ayy = cardY + cardH - 34;
    if (isActive) {
      panel(ctx, ax, ayy, aw, 26, { fill: rgba(COLORS.gold, 0.3), stroke: COLORS.gold, lineWidth: 1.5, radius: 6 });
      text(ctx, 'ACTIVE', ax + aw / 2, ayy + 13, { fontStr: font(FONTS.body, 11, '700'), color: COLORS.ink });
    } else if (isUnlocked) {
      panel(ctx, ax, ayy, aw, 26, { fill: rgba(COLORS.green, 0.3), stroke: COLORS.ink, lineWidth: 1.4, radius: 6 });
      text(ctx, 'SWITCH', ax + aw / 2, ayy + 13, { fontStr: font(FONTS.body, 11, '700'), color: COLORS.ink });
      this._btn('switch-craft', ax, ayy, aw, 26, craft.id);
    } else {
      const canAfford = banked >= craft.cost;
      panel(ctx, ax, ayy, aw, 26, {
        fill: canAfford ? rgba(COLORS.gold, 0.3) : rgba(COLORS.ink, 0.05),
        stroke: canAfford ? COLORS.ink : rgba(COLORS.ink, 0.3),
        lineWidth: canAfford ? 1.6 : 1, radius: 6,
      });
      text(ctx, canAfford ? `${craft.cost} ◆` : `🔒 ${craft.cost} ◆`, ax + aw / 2, ayy + 13, {
        fontStr: font(FONTS.mono, 11, '700'),
        color: canAfford ? COLORS.ink : rgba(COLORS.ink, 0.4),
      });
      if (canAfford) this._btn('buy-craft', ax, ayy, aw, 26, craft.id);
    }
  });
}

_isCraftPurchasable(craft, upgrades) {
  // Show locked crafts that the player can see as a goal (all biome-unlocked crafts)
  return true;
}
```

Handle `hangar-prev` and `hangar-next` in `hitTest`:
```js
if (b.id === 'hangar-prev') { this._hangarPage = Math.max(0, this._hangarPage - 1); return { action: 'tab', tab: 'HANGAR' }; }
if (b.id === 'hangar-next') { this._hangarPage += 1; return { action: 'tab', tab: 'HANGAR' }; }
```

Also reset `this._hangarPage = 0` in `open()`.

---

## SECTION 5 — Biome visual differentiation

Each world file needs a distinct color palette, background, and ambient decor. The rendering differences are in `drawTerrain` and `drawHazards`. Touch only these four files.

### 5A — `src/game/world/Meadow.js` (existing — baseline, no change needed)
Parchment base `#F0EBE2`. Green and gold accents. Grass tufts and small flowers. Keep as-is.

### 5B — `src/game/world/Forest.js`

Replace `drawTerrain` with:
```js
drawTerrain(ctx, camera) {
  // Dark loamy soil base
  ctx.fillStyle = '#2C1F14';
  ctx.fillRect(0, 0, this.WORLD_SIZE, this.WORLD_SIZE);

  // Mossy patches — dark green wash blobs
  for (const b of this.washes) {
    if (!camera.isVisible(b.x, b.y, b.rx + b.ry, 40)) continue;
    washBlob(ctx, b.x, b.y, b.rx, b.ry, '#3D5A2A', 0.18, b.rot);
  }
  // Root-line texture: horizontal dark streaks
  ctx.strokeStyle = 'rgba(20,12,6,0.35)';
  ctx.lineWidth = 2;
  for (const d of this.decor) {
    if (!camera.isVisible(d.x, d.y, 40, 40)) continue;
    if (d.type === 'root') {
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(d.rot);
      ctx.beginPath();
      ctx.moveTo(-d.scale * 20, 0);
      ctx.bezierCurveTo(-d.scale * 8, -d.scale * 6, d.scale * 8, d.scale * 4, d.scale * 22, 0);
      ctx.stroke();
      ctx.restore();
    } else if (d.type === 'tree') {
      // Simple tree icon: trunk rectangle + circle canopy
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.fillStyle = '#4A2E0A';
      ctx.fillRect(-4 * d.scale, 0, 8 * d.scale, 18 * d.scale);
      ctx.beginPath();
      ctx.arc(0, -12 * d.scale, 16 * d.scale, 0, Math.PI * 2);
      ctx.fillStyle = rgba('#2A4A18', 0.7);
      ctx.fill();
      ctx.restore();
    }
  }
}
```

In the Forest constructor, replace the decor generation with mixed `root` and `tree` types:
```js
// Forest decor: roots and simple tree icons
this.decor = [];
const rng = makeRng(42);
for (let i = 0; i < 80; i++) {
  this.decor.push({
    type: rng() < 0.4 ? 'tree' : 'root',
    x: rng() * this.WORLD_SIZE,
    y: rng() * this.WORLD_SIZE,
    rot: rng() * Math.PI * 2,
    scale: 0.7 + rng() * 0.8,
  });
}
```

In `drawHazards`, draw thorn barriers as dark bark-colored walls (`#3A2010` fill, `#5A3A1A` stroke) instead of the meadow's bramble-green.

### 5C — `src/game/world/Garden.js`

Replace `drawTerrain` with:
```js
drawTerrain(ctx, camera) {
  // Warm terracotta-cream base — cultivated soil
  ctx.fillStyle = '#E8D8C4';
  ctx.fillRect(0, 0, this.WORLD_SIZE, this.WORLD_SIZE);

  // Blush rose wash blobs
  for (const b of this.washes) {
    if (!camera.isVisible(b.x, b.y, b.rx + b.ry, 40)) continue;
    washBlob(ctx, b.x, b.y, b.rx, b.ry, '#C4826A', 0.12, b.rot);
  }
  // Trellis lines — thin parallel diagonal strokes
  ctx.strokeStyle = 'rgba(140,90,60,0.18)';
  ctx.lineWidth = 1;
  for (let i = -20; i < this.WORLD_SIZE / 120 + 20; i++) {
    const sx = i * 120;
    if (!camera.isVisible(sx, 0, 120, this.WORLD_SIZE)) continue;
    ctx.beginPath();
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx + this.WORLD_SIZE * 0.15, this.WORLD_SIZE);
    ctx.stroke();
  }
  // Small rose-bud cluster decor
  for (const d of this.decor) {
    if (!camera.isVisible(d.x, d.y, 30, 30)) continue;
    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.scale(d.scale, d.scale);
    drawFlower(ctx, 9, 5, '#D4826A', '#C06040');
    ctx.restore();
  }
}
```

Thorn hazards in Garden: draw as trimmed hedgerow (solid `#4A6A28` fill, `#2A4A18` stroke, slightly rounded rect):
```js
// In drawHazards, replace thorn fill color:
ctx.fillStyle = '#4A6A28';
ctx.strokeStyle = '#2A4A18';
```

### 5D — `src/game/world/Greenhouse.js`

Replace `drawTerrain` with:
```js
drawTerrain(ctx, camera) {
  // Dark humid floor — wet stone / peat
  ctx.fillStyle = '#1A2A1A';
  ctx.fillRect(0, 0, this.WORLD_SIZE, this.WORLD_SIZE);

  // Glass panel grid — faint bright lines suggesting greenhouse roof panels
  ctx.strokeStyle = 'rgba(160,210,180,0.08)';
  ctx.lineWidth = 1;
  const PANEL = 400;
  for (let gx = 0; gx < this.WORLD_SIZE; gx += PANEL) {
    if (!camera.isVisible(gx, 0, PANEL, this.WORLD_SIZE)) continue;
    ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, this.WORLD_SIZE); ctx.stroke();
  }
  for (let gy = 0; gy < this.WORLD_SIZE; gy += PANEL) {
    if (!camera.isVisible(0, gy, this.WORLD_SIZE, PANEL)) continue;
    ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(this.WORLD_SIZE, gy); ctx.stroke();
  }

  // Tropical leaf wash blobs
  for (const b of this.washes) {
    if (!camera.isVisible(b.x, b.y, b.rx + b.ry, 40)) continue;
    washBlob(ctx, b.x, b.y, b.rx, b.ry, '#2A5A3A', 0.22, b.rot);
  }
  // Condensation droplets + large leaf decor
  for (const d of this.decor) {
    if (!camera.isVisible(d.x, d.y, 40, 40)) continue;
    ctx.save();
    ctx.translate(d.x, d.y);
    if (d.type === 'drop') {
      ctx.beginPath();
      ctx.arc(0, 0, 2 * d.scale, 0, Math.PI * 2);
      ctx.fillStyle = rgba('#80C0A0', 0.35);
      ctx.fill();
    } else {
      ctx.rotate(d.rot);
      ctx.scale(d.scale, d.scale);
      drawLeaf(ctx, 28, 12, '#2A5A2A');
    }
    ctx.restore();
  }
}
```

Greenhouse decor constructor:
```js
this.decor = [];
const rng = makeRng(77);
for (let i = 0; i < 120; i++) {
  this.decor.push({
    type: rng() < 0.5 ? 'leaf' : 'drop',
    x: rng() * this.WORLD_SIZE,
    y: rng() * this.WORLD_SIZE,
    rot: rng() * Math.PI * 2,
    scale: 0.6 + rng() * 1.0,
  });
}
```

Greenhouse thorn barriers: draw as climbing vine walls — thick `#2A4A20` fill with `#4A8A40` accent stroke, plus short radial vine-tendril lines from the barrier edges.

---

## SECTION 6 — Unique map layouts per biome (distinct spawn positions)

Each world file's thorn layout and each `_spawn[Biome]` function in `main.js` must have spatially distinct configurations. The current four biomes may be using the same proportional thorn layout. Fix each biome to have a meaningfully different maze structure.

### Meadow (existing — keep as-is)
Central cross pattern with inner ring. No change needed.

### Forest — Diagonal barrier system
Replace Forest thorn array with diagonal-oriented barriers that create angled corridors (45° passages) rather than orthogonal ones:
```js
this.thorns = [
  // NW–SE diagonal zone — creates a forced diagonal passage through the forest
  { x: 600,  y: 600,  w: 600, h: 50 },
  { x: 1200, y: 1200, w: 600, h: 50 },
  { x: 2800, y: 600,  w: 50,  h: 600 },
  { x: 3200, y: 1200, w: 50,  h: 600 },
  // Central ring — tighter than Meadow
  { x: 1600, y: 1100, w: 50,  h: 600 },
  { x: 3150, y: 1100, w: 50,  h: 600 },
  { x: 1100, y: 1600, w: 600, h: 50 },
  { x: 1100, y: 3150, w: 600, h: 50 },
  { x: 3500, y: 1600, w: 600, h: 50 },
  { x: 3500, y: 3150, w: 600, h: 50 },
  { x: 1600, y: 3500, w: 50,  h: 600 },
  { x: 3150, y: 3500, w: 50,  h: 600 },
  // Scattered interior blockers
  { x: 2200, y: 1800, w: 200, h: 50 },
  { x: 2200, y: 2950, w: 200, h: 50 },
  { x: 1800, y: 2200, w: 50,  h: 200 },
  { x: 2950, y: 2200, w: 50,  h: 200 },
];
```

### Garden — Formal concentric hedge rings with gaps
Garden thorns should feel like a formal garden — concentric square rings with deliberate entry gaps:
```js
this.thorns = [
  // Outer ring (gap North at x≈3050–3350, South at x≈3050–3350, East at y≈3050–3350, West at y≈3050–3350)
  { x: 800,  y: 800,  w: 2250, h: 55 },  // N top segment
  { x: 3350, y: 800,  w: 2250, h: 55 },  // N bot segment
  { x: 800,  y: 5545, w: 2250, h: 55 },
  { x: 3350, y: 5545, w: 2250, h: 55 },
  { x: 800,  y: 800,  w: 55,   h: 2250 },
  { x: 800,  y: 3350, w: 55,   h: 2250 },
  { x: 5545, y: 800,  w: 55,   h: 2250 },
  { x: 5545, y: 3350, w: 55,   h: 2250 },
  // Mid ring (tighter, gap on West and East)
  { x: 1800, y: 1800, w: 1100, h: 45 },
  { x: 3100, y: 1800, w: 1100, h: 45 },
  { x: 1800, y: 4555, w: 1100, h: 45 },
  { x: 3100, y: 4555, w: 1100, h: 45 },
  { x: 1800, y: 1800, w: 45,   h: 1100 },
  { x: 1800, y: 3100, w: 45,   h: 1100 },
  { x: 4555, y: 1800, w: 45,   h: 1100 },
  { x: 4555, y: 3100, w: 45,   h: 1100 },
];
```

### Greenhouse — Asymmetric grid chambers
Greenhouse should feel claustrophobic with irregular room-like chambers:
```js
this.thorns = [
  // Horizontal dividers — irregular spacing
  { x: 400,  y: 2000, w: 3200, h: 60 },
  { x: 4400, y: 2000, w: 3200, h: 60 },
  { x: 800,  y: 4000, w: 2800, h: 60 },
  { x: 4400, y: 4200, w: 3000, h: 60 },
  { x: 400,  y: 6000, w: 3400, h: 60 },
  { x: 4200, y: 5800, w: 3400, h: 60 },
  // Vertical dividers — offset to create irregular rooms
  { x: 2000, y: 400,  w: 60,   h: 1400 },
  { x: 2000, y: 2200, w: 60,   h: 1600 },
  { x: 4000, y: 600,  w: 60,   h: 1200 },
  { x: 6000, y: 2200, w: 60,   h: 1600 },
  { x: 2200, y: 4200, w: 60,   h: 1400 },
  { x: 5800, y: 4400, w: 60,   h: 1400 },
  { x: 3800, y: 6000, w: 60,   h: 1600 },
  // Inner chamber walls near hive
  { x: 3200, y: 3200, w: 400,  h: 50 },
  { x: 4400, y: 3200, w: 400,  h: 50 },
  { x: 3200, y: 4750, w: 400,  h: 50 },
  { x: 4400, y: 4750, w: 400,  h: 50 },
  { x: 3200, y: 3200, w: 50,   h: 400 },
  { x: 4750, y: 3200, w: 50,   h: 400 },
  { x: 3200, y: 4350, w: 50,   h: 400 },
  { x: 4750, y: 4350, w: 50,   h: 400 },
];
```

---

## SECTION 7 — HUD contrast fix for dark biomes

### In `src/game/ui/HUD.js`

The HUD was designed for parchment backgrounds. Forest (`#2C1F14`) and Greenhouse (`#1A2A1A`) are dark — the existing ink-colored HUD text becomes unreadable.

Find the main `draw` method in `HUD.js`. Add a `biomeDark` flag and when active, render a semi-transparent light panel behind the HUD element cluster in the top-left corner:

In `main.js`, add `activeBiome: this.activeBiome || 'meadow'` to the HUD draw data object.

In `HUD.draw(ctx, data)`, destructure `activeBiome` and add:
```js
const darkBiome = activeBiome === 'forest' || activeBiome === 'greenhouse';
if (darkBiome) {
  // Semi-transparent backdrop behind the top-left HUD cluster
  ctx.save();
  ctx.fillStyle = 'rgba(240,235,226,0.15)';
  roundRectPath(ctx, 6, 6, 220, 90, 8);
  ctx.fill();
  ctx.restore();
}
// Then render all HUD elements as normal — ink colors remain readable against the light backdrop
```

Import `roundRectPath` from renderer if not already imported.

---

## Commit

```
git add -A
git commit -m "fix: balance pass — local 30-event prompt bank, per-craft upgrades, magnet rebalance, hangar pagination, biome visuals + unique maps, dark biome HUD contrast"
```
