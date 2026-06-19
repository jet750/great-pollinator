// The Great Pollinator — top-level game controller (Phase 1).
//
// Owns the canvas, the device-pixel-ratio sizing, the input layer, the
// top-level state machine (START / PLAYING / HIVE / GAMEOVER), world assembly,
// the per-frame update/render wiring, power-up logic, the hive economy, and
// persistence. Instantiated by PollinatorPage; call start() on mount and
// destroy() on unmount.

import { GameLoop } from './engine/GameLoop.js';
import { Camera } from './engine/Camera.js';
import { SpatialGrid } from './engine/SpatialGrid.js';

import { Meadow } from './world/Meadow.js';
import { Bee } from './entities/Bee.js';
import { Moth } from './entities/Moth.js';
import { Locust } from './entities/Locust.js';
import { Hornet } from './entities/Hornet.js';
import { Seeker } from './entities/enemies/Seeker.js';
import { Patroller } from './entities/enemies/Patroller.js';
import { CarnivorousPlant } from './entities/enemies/CarnivorousPlant.js';
import { Frog } from './entities/enemies/Frog.js';
import { Pollen } from './entities/pickups/Pollen.js';
import { PowerUpPlant, POWERUP_DEFS } from './entities/pickups/PowerUpPlant.js';

import { HUD } from './ui/HUD.js';
import { Minimap } from './ui/Minimap.js';
import { HiveStore, UPGRADES, CRAFTS } from './ui/HiveStore.js';
import { BiomeSelect } from './ui/BiomeSelect.js';
import { VirtualJoystick } from './ui/VirtualJoystick.js';
import { StartScreen } from './ui/StartScreen.js';
import { GameOverScreen } from './ui/GameOverScreen.js';

import { AudioManager } from './audio/AudioManager.js';
import { NarrativeEngine, isBeneficialConsequence } from './narrative/NarrativeEngine.js';
import { EventUI } from './ui/EventUI.js';

import { loadProgress, saveProgress, resetProgress } from './utils/storage.js';
import { makeRng, distance, clamp } from './utils/math.js';
import { COLORS, FONTS, font, text } from './utils/renderer.js';

const MOBILE_BREAKPOINT = 768;

const COMBO_WINDOW = 3.0; // seconds before a combo decays
const COMBO_THRESHOLDS = [
  { count: 5, multiplier: 1.2 },
  { count: 10, multiplier: 1.5 },
  { count: 20, multiplier: 2.0 },
];

/** Highest combo multiplier unlocked at the given chain length. */
function getMultiplier(comboCount) {
  let m = 1.0;
  for (const t of COMBO_THRESHOLDS) {
    if (comboCount >= t.count) m = t.multiplier;
  }
  return m;
}

const RESPAWN_AFTER_RETURNS = 2; // dead enemies respawn after this many hive returns

export default class PollinatorGame {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    this.state = 'START';
    this.time = 0;

    this.isMobile = window.innerWidth < MOBILE_BREAKPOINT;
    // Seed the logical size from the window so Camera/grid can be constructed.
    // start() calls _resize() immediately, which corrects these to the exact
    // canvas rect (which now respects safe-area insets via CSS dvh + env()).
    this.LW = window.innerWidth;
    this.LH = window.innerHeight;
    this.dpr = 1;

    this.progress = loadProgress();

    this.camera = new Camera(this.LW, this.LH, 3200, 3200);
    this.grid = new SpatialGrid(3200, 3200, 200);
    this.joystick = new VirtualJoystick();
    this.store = new HiveStore();
    this.gameOver = new GameOverScreen();
    this.biomeSelect = new BiomeSelect();
    this.minimap = new Minimap();
    this.minimap.loadFog(this.progress.fog);

    // Procedural audio. The AudioContext is created on the first user gesture
    // (see the input handlers); until then every play call is a no-op.
    this.audio = new AudioManager();
    this._muteBtnRect = null; // set each HUD frame; hit-tested on pointer events

    // Oregon-Trail-style AI narrative layer. The engine generates a field
    // journal event via the serverless proxy while the player is in the hive;
    // eventUI renders the choice overlay. Both reset each run (see newRun).
    this.narrative = new NarrativeEngine();
    this.eventUI = new EventUI();

    // Narrative consequence modifiers (timed; neutral when their timer is ≤0).
    this._pollenMultiplier = 1;
    this._pollenModTimer = 0;
    this._narrativeDmgMult = 1;
    this._narrativeDmgTimer = 0;
    this._speedMult = 1;
    this._speedModTimer = 0;
    this._narrativeFlash = null; // { text, color, timer } HUD flash on choice

    // Persisted hive-return count drives the enemy respawn timer.
    this.hiveReturnCount = this.progress.hiveReturnCount || 0;

    // input state
    this.keys = new Set();
    this._pendingAttack = false;
    this._pendingHeal = false;
    this._pendingEnter = false;
    this._pendingEscape = false;
    this._pointer = { x: -1, y: -1 }; // last pointer position (for hover)

    // run state (built in newRun)
    this.bee = null;
    this.meadow = null;
    this.enemies = [];
    this.pollen = [];
    this.plants = [];
    this.activePowerUp = null;
    this.runBanked = 0;
    this._prevHigh = 0;
    this._isNewRecord = false;
    this._deathTimer = 0;

    // combo multiplier state
    this.comboCount = 0;
    this.comboTimer = 0;

    // weather + field-store + flash effects
    this._rainActive = false;
    this._fieldStore = false; // true while a Moonflower-opened store is active
    this._flash = { alpha: 0, timer: 0, duration: 0 }; // white heal flash

    // landing handshake
    this._hoverPlant = null;
    this._hoverTimer = 0;
    this._landed = false;

    this._dockArmed = false;
    this.shake = { mag: 0, time: 0, duration: 0 };

    this.effects = { screenShake: (px, ms) => this._screenShake(px, ms) };

    this._bindHandlers();
    this.loop = new GameLoop((dt) => this.update(dt), () => this.render());
  }

  // ---------------------------------------------------------------- lifecycle
  start() {
    this._resize();
    window.addEventListener('resize', this._onResize);
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    this.canvas.addEventListener('mousedown', this._onMouseDown);
    this.canvas.addEventListener('mousemove', this._onMouseMove);
    this.canvas.addEventListener('touchstart', this._onTouchStart, { passive: false });
    this.canvas.addEventListener('touchmove', this._onTouchMove, { passive: false });
    this.canvas.addEventListener('touchend', this._onTouchEnd, { passive: false });
    this.canvas.addEventListener('touchcancel', this._onTouchEnd, { passive: false });
    this.newRun();
    this.state = 'START';
    this.loop.start();
  }

  destroy() {
    this.loop.stop();
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    this.canvas.removeEventListener('mousedown', this._onMouseDown);
    this.canvas.removeEventListener('mousemove', this._onMouseMove);
    this.canvas.removeEventListener('touchstart', this._onTouchStart);
    this.canvas.removeEventListener('touchmove', this._onTouchMove);
    this.canvas.removeEventListener('touchend', this._onTouchEnd);
    this.canvas.removeEventListener('touchcancel', this._onTouchEnd);
  }

  _bindHandlers() {
    this._onResize = () => this._resize();
    this._onKeyDown = (e) => this._handleKeyDown(e);
    this._onKeyUp = (e) => this.keys.delete(e.key.toLowerCase());
    this._onMouseDown = (e) => this._handleMouseDown(e);
    this._onMouseMove = (e) => this._handleMouseMove(e);
    this._onTouchStart = (e) => this._handleTouchStart(e);
    this._onTouchMove = (e) => this._handleTouchMove(e);
    this._onTouchEnd = (e) => this._handleTouchEnd(e);
  }

  // ----------------------------------------------------------------- sizing
  _resize() {
    const wasMobile = this.isMobile;
    this.isMobile = window.innerWidth < MOBILE_BREAKPOINT;

    // Use the actual rendered canvas dimensions (which now respect safe-area via
    // CSS dvh + env() insets) instead of hardcoded constants. This keeps the
    // logical canvas matched to exactly what the user sees, so the joystick and
    // hive UI never sit behind the browser's bottom chrome. Fall back to the
    // window size if the rect isn't laid out yet (avoids a 0×0 black canvas).
    const rect = this.canvas.getBoundingClientRect();
    this.LW = Math.round(rect.width) || window.innerWidth;
    this.LH = Math.round(rect.height) || window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2); // cap at 2× for perf

    this.canvas.width = Math.round(this.LW * this.dpr);
    this.canvas.height = Math.round(this.LH * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    this.camera.resize(this.LW, this.LH);
    if (this.bee) this.camera.snapTo(this.bee.x, this.bee.y);
    this.joystick.setViewport(this.LW, this.LH);

    if (wasMobile !== this.isMobile) this.joystick.reset();
  }

  // ----------------------------------------------------------------- input
  _toLogical(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * this.LW,
      y: ((clientY - rect.top) / rect.height) * this.LH,
    };
  }

  _handleKeyDown(e) {
    this.audio.init(); // first user gesture unlocks the AudioContext
    const k = e.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) {
      e.preventDefault();
    }
    if (e.repeat) return;
    this.keys.add(k);
    if (k === ' ') this._pendingAttack = true;
    if (k === 'h') this._pendingHeal = true;
    if (k === 'enter') this._pendingEnter = true;
    if (k === 'escape') this._pendingEscape = true;
  }

  _handleMouseDown(e) {
    this.audio.init(); // first user gesture unlocks the AudioContext
    const { x, y } = this._toLogical(e.clientX, e.clientY);
    this._handlePointer(x, y);
  }

  _handleMouseMove(e) {
    const { x, y } = this._toLogical(e.clientX, e.clientY);
    this._pointer = { x, y };
    if (this.state === 'BIOME_SELECT') this.biomeSelect.setPointer(x, y);
  }

  _handleTouchStart(e) {
    e.preventDefault();
    this.audio.init(); // first user gesture unlocks the AudioContext

    // The mute button overlays the joystick layer, so check it first on mobile.
    const first = e.changedTouches[0];
    if (first) {
      const fp = this._toLogical(first.clientX, first.clientY);
      if ((this.state === 'PLAYING' || this.state === 'HIVE') && this._hitMute(fp.x, fp.y)) return;
    }

    if (this.state === 'PLAYING' && this.isMobile) {
      for (const t of e.changedTouches) {
        const p = this._toLogical(t.clientX, t.clientY);
        this.joystick.touchStart(t.identifier, p.x, p.y);
      }
    } else {
      const t = e.changedTouches[0];
      const p = this._toLogical(t.clientX, t.clientY);
      this._handlePointer(p.x, p.y);
    }
  }

  _handleTouchMove(e) {
    e.preventDefault();
    if (this.state === 'PLAYING' && this.isMobile) {
      for (const t of e.changedTouches) {
        const p = this._toLogical(t.clientX, t.clientY);
        this.joystick.touchMove(t.identifier, p.x, p.y);
      }
    }
  }

  _handleTouchEnd(e) {
    e.preventDefault();
    if (this.isMobile) {
      for (const t of e.changedTouches) this.joystick.touchEnd(t.identifier);
    }
  }

  // Toggle mute if (x,y) is inside the HUD mute button. Returns true on hit.
  _hitMute(x, y) {
    const r = this._muteBtnRect;
    if (!r) return false;
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
      this.audio.toggleMute();
      return true;
    }
    return false;
  }

  // routes a click/tap based on the current top-level state
  _handlePointer(x, y) {
    // Mute button is live whenever the HUD is on screen (PLAYING / HIVE).
    if ((this.state === 'PLAYING' || this.state === 'HIVE') && this._hitMute(x, y)) return;
    if (this.state === 'START') {
      this._goToBiomeSelect();
    } else if (this.state === 'BIOME_SELECT') {
      const intent = this.biomeSelect.hitTest(x, y);
      if (intent && intent.action === 'play') this._beginExpedition(intent.biome);
    } else if (this.state === 'HIVE') {
      const intent = this.store.hitTest(x, y);
      if (intent) this._handleStoreIntent(intent);
    } else if (this.state === 'EVENT') {
      const idx = this.eventUI.hitTest(x, y);
      if (idx != null && this.narrative.hasActiveEvent()) {
        const consequence = this.narrative.resolveChoice(idx);
        this._applyNarrativeConsequence(consequence);
        this.state = 'PLAYING';
        this.bee.setFlying();
      }
    } else if (this.state === 'GAMEOVER') {
      const intent = this.gameOver.hitTest(x, y);
      if (intent) this._handleGameOverIntent(intent);
    }
  }

  // --------------------------------------------------------------- run setup
  newRun() {
    this.meadow = new Meadow();
    this.bee = this._spawnCraft(this.progress.upgrades.activeCraft, 1600, 1850);
    this.camera.snapTo(this.bee.x, this.bee.y);

    this.enemies = [];
    this.pollen = [];
    this.plants = [];
    this.activePowerUp = null;
    this.runBanked = 0;
    this._prevHigh = this.progress.highScore;
    this._isNewRecord = false;
    this._deathTimer = 0;
    this._hoverPlant = null;
    this._hoverTimer = 0;
    this._landed = false;
    this._dockArmed = false;
    this._fieldStore = false;
    this.comboCount = 0;
    this.comboTimer = 0;
    this._rainActive = false;
    this._flash = { alpha: 0, timer: 0, duration: 0 };
    this.joystick.reset();

    // Reset the narrative layer and all narrative modifiers for the new run.
    this.narrative = new NarrativeEngine();
    this._pollenMultiplier = 1;
    this._pollenModTimer = 0;
    this._narrativeDmgMult = 1;
    this._narrativeDmgTimer = 0;
    this._speedMult = 1;
    this._speedModTimer = 0;
    this._narrativeFlash = null;
    // Fog and hiveReturnCount persist across runs within a session.

    this._spawnWorld();
  }

  /** Instantiate the requested craft at (x, y), passing the saved upgrades. */
  _spawnCraft(type, x, y) {
    const upgrades = this.progress.upgrades;
    switch (type) {
      case 'moth':
        return new Moth(x, y, upgrades);
      case 'locust':
        return new Locust(x, y, upgrades);
      case 'hornet':
        return new Hornet(x, y, upgrades);
      default:
        return new Bee(x, y, upgrades);
    }
  }

  _spawnWorld() {
    const rng = makeRng((Date.now() & 0xffffffff) >>> 0);
    const hive = this.meadow.hive;
    const farFromHive = (x, y) => distance({ x, y }, hive) > 130;

    // --- uncommon pollen clusters guarded by Patrollers ---
    const clusters = [
      { x: 620, y: 2000 },
      { x: 2250, y: 720 },
      { x: 2500, y: 2200 },
      { x: 1050, y: 1150 },
    ];
    clusters.forEach((c, i) => {
      this.enemies.push(new Patroller(c.x + 80, c.y, c));
      const count = i === 3 ? 3 : 4; // 4+4+4+3 = 15
      for (let j = 0; j < count; j++) {
        const px = clamp(c.x + (rng() - 0.5) * 160, 30, 3170);
        const py = clamp(c.y + (rng() - 0.5) * 160, 30, 3170);
        if (farFromHive(px, py)) this.pollen.push(new Pollen(px, py, 'uncommon'));
      }
    });

    // --- T3 carnivorous plants guarding rare pollen ---
    const plantSpots = [
      { x: 420, y: 2650 },
      { x: 2820, y: 420 },
    ];
    plantSpots.forEach((s) => {
      this.enemies.push(new CarnivorousPlant(s.x, s.y));
      // rare pollen tucked just behind the plant
      this.pollen.push(new Pollen(clamp(s.x + 70, 30, 3170), clamp(s.y - 40, 30, 3170), 'rare'));
      this.pollen.push(new Pollen(clamp(s.x - 60, 30, 3170), clamp(s.y + 50, 30, 3170), 'rare'));
    });

    // --- T3 frog near a rare cluster ---
    const frogSpot = { x: 2700, y: 2720 };
    this.enemies.push(new Frog(frogSpot.x, frogSpot.y));
    this.pollen.push(new Pollen(frogSpot.x - 90, frogSpot.y - 30, 'rare'));

    // --- 8 Seekers scattered ---
    for (let i = 0; i < 8; i++) {
      let x;
      let y;
      let tries = 0;
      do {
        x = 200 + rng() * 2800;
        y = 200 + rng() * 2800;
        tries++;
      } while (!farFromHive(x, y) && tries < 10);
      this.enemies.push(new Seeker(x, y));
    }

    // --- 60 common pollen scattered (avoiding hive zone) ---
    let placed = 0;
    let guard = 0;
    while (placed < 60 && guard < 600) {
      guard++;
      const x = 80 + rng() * 3040;
      const y = 80 + rng() * 3040;
      if (!farFromHive(x, y)) continue;
      this.pollen.push(new Pollen(x, y, 'common'));
      placed++;
    }

    // --- power-up plants: 2 Sunflower, 2 Lavender, 1 Foxglove ---
    const powerSpots = [
      ['sunflower', 1000, 600],
      ['sunflower', 2300, 1900],
      ['lavender', 700, 1500],
      ['lavender', 2600, 1000],
      ['foxglove', 1500, 2600],
    ];
    powerSpots.forEach(([type, x, y]) => this.plants.push(new PowerUpPlant(x, y, type)));

    // --- rare one-use plants tucked deep behind hazards (exploration rewards) ---
    this.plants.push(new PowerUpPlant(2800, 500, 'moonflower'));
    this.plants.push(new PowerUpPlant(300, 2700, 'ironweed'));

    // tag enemies for grid queries
    this.enemies.forEach((e) => (e.kind = 'enemy'));
  }

  _goToBiomeSelect() {
    this.biomeSelect.reset();
    this.biomeSelect.setPointer(this._pointer.x, this._pointer.y);
    this.state = 'BIOME_SELECT';
  }

  // Load the chosen biome and drop into the field. Only Meadow is playable in
  // Phase 2; locked biomes never reach here (BiomeSelect shows an overlay).
  _beginExpedition(/* biome */) {
    this.newRun();
    this.state = 'PLAYING';
    this.bee.setFlying();
  }

  // ----------------------------------------------------------------- update
  update(dt) {
    this.time += dt;
    if (this.shake.time > 0) this.shake.time -= dt;

    if (this.state === 'START') {
      if (this._pendingEnter) this._goToBiomeSelect();
    } else if (this.state === 'BIOME_SELECT') {
      this.biomeSelect.update(this._pointer);
    } else if (this.state === 'PLAYING') {
      this._updatePlaying(dt);
    } else if (this.state === 'HIVE') {
      if (this._pendingEscape) this._exitHive();
    } else if (this.state === 'EVENT') {
      // The world is paused while the event shows. If the API call failed
      // (no event arrived and nothing is in flight), resume the field silently.
      if (!this.narrative.hasActiveEvent() && !this.narrative.isLoading()) {
        this.state = 'PLAYING';
      }
    } else if (this.state === 'GAMEOVER') {
      // input-driven only
    }

    // consume edge events
    this._pendingAttack = false;
    this._pendingHeal = false;
    this._pendingEnter = false;
    this._pendingEscape = false;
  }

  _movementVector() {
    if (this.isMobile) return this.joystick.moveVec;
    let mx = 0;
    let my = 0;
    if (this.keys.has('a') || this.keys.has('arrowleft')) mx -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) mx += 1;
    if (this.keys.has('w') || this.keys.has('arrowup')) my -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) my += 1;
    if (mx !== 0 || my !== 0) {
      const m = Math.hypot(mx, my);
      mx /= m;
      my /= m;
    }
    return { x: mx, y: my };
  }

  _updatePlaying(dt) {
    const bee = this.bee;
    this.meadow.update(dt);

    // Net-HP and collection snapshots for combo bookkeeping (see end of frame).
    const hpBefore = bee.hp;
    const collectedBefore = bee.collectedCount;

    // Weather: storm doubles down on damage (×1.5) via the bee's multiplier.
    // A narrative damage_modifier (if active) stacks on top of the weather.
    this._rainActive = this.meadow.rain.active;
    const narrativeDmg = this._narrativeDmgTimer > 0 ? this._narrativeDmgMult : 1;
    bee.weatherMultiplier = (this._rainActive ? 1.5 : 1) * narrativeDmg;

    // Combo decay, then expose the current multiplier so collections this frame
    // pick it up at the moment of pickup.
    if (this.comboCount > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.comboCount = 0;
        this.comboTimer = 0;
      }
    }
    bee.comboMultiplier = getMultiplier(this.comboCount);

    // Power-up modifiers.
    const slow = this.activePowerUp && this.activePowerUp.type === 'lavender' ? 0.4 : 1;
    bee.collectionRadius = this.activePowerUp && this.activePowerUp.type === 'sunflower' ? 180 : 60;
    bee.damageImmune = !!(this.activePowerUp && this.activePowerUp.type === 'foxglove');

    if (this.activePowerUp) {
      this.activePowerUp.timer -= dt;
      if (this.activePowerUp.timer <= 0) this.activePowerUp = null;
    }

    // Rebuild spatial grid with alive enemies (used for the attack queries).
    this.grid.clear();
    for (const e of this.enemies) if (!e.dead) this.grid.insert(e);
    const queryEnemies = (x, y, r) =>
      this.grid.retrieve(x, y, r).filter((e) => e.kind === 'enemy' && !e.dead);

    const attackPressed = this.isMobile ? this.joystick.pollAttack() : this._pendingAttack;
    const healPressed = this.isMobile ? this.joystick.pollHeal() : this._pendingHeal;

    // Snapshot for audio: whether an attack will actually fire this frame, and
    // total enemy HP so we can detect a landed hit afterward.
    const attackWillFire = attackPressed && bee.canAttack();
    const enemyHpBefore = this._sumEnemyHp();

    // A narrative speed_modifier scales the movement intent (the crafts derive
    // velocity from moveVec × BASE_SPEED, so scaling the vector scales speed).
    const speedMult = this._speedModTimer > 0 ? this._speedMult : 1;
    const baseMove = this._movementVector();
    const moveVec = speedMult === 1 ? baseMove : { x: baseMove.x * speedMult, y: baseMove.y * speedMult };

    bee.update(dt, {
      moveVec,
      attackPressed,
      healPressed,
      meadow: this.meadow,
      queryEnemies,
      effects: this.effects,
    });

    // Hornet: advance and collide its in-flight projectiles against live enemies
    // (full flat damage on first contact) using the same spatial-grid query.
    if (bee.craftType === 'hornet') bee.updateProjectiles(dt, queryEnemies);

    if (attackWillFire) this.audio.playAttackDash();
    if (this._sumEnemyHp() < enemyHpBefore) this.audio.playHitLanded();

    // Persist healing-item consumption (they're a saved, purchasable stock).
    if (bee.healingItems !== this.progress.upgrades.healingItems) {
      this.progress.upgrades.healingItems = bee.healingItems;
      this._save();
    }

    // Safe-pad regen — restores up to 50% of max HP over 3s while stationary.
    const pad = this.meadow.isInSafePad(bee.x, bee.y);
    if (pad && bee.speed < 30) bee.padRegen(dt);

    // Fog-of-war exploration tracking.
    this.minimap.trackPosition(bee.x, bee.y);

    this._updateLanding(dt);
    this._updateHiveDock();

    // Enemies — freeze those outside the bee's current 800px cell.
    const beeCellX = Math.floor(bee.x / 800);
    const beeCellY = Math.floor(bee.y / 800);
    for (const e of this.enemies) {
      if (e.dead) {
        e.update(dt, { bee, meadow: this.meadow, speedFactor: slow });
        continue;
      }
      const active = Math.floor(e.x / 800) === beeCellX && Math.floor(e.y / 800) === beeCellY;
      if (active) e.update(dt, { bee, meadow: this.meadow, speedFactor: slow });
    }

    // Respawn system: dead enemies are kept in the array. Record the hive-return
    // index at death, then revive RESPAWN_AFTER_RETURNS returns later.
    for (const e of this.enemies) {
      if (!e.dead) continue;
      if (e.killedAtReturn == null) {
        e.killedAtReturn = this.hiveReturnCount;
      } else if (this.hiveReturnCount >= e.killedAtReturn + RESPAWN_AFTER_RETURNS) {
        e.respawn();
      }
    }

    // Pollen.
    for (const p of this.pollen) p.update(dt, bee, this.time);
    for (const p of this.pollen) if (p.collected) this.audio.playCollect(p.type);
    this.pollen = this.pollen.filter((p) => !p.collected);

    // Power-up plant recharge.
    for (const pl of this.plants) pl.update(dt);

    // Combo: extend on pickup, break on taking damage this frame.
    const collected = bee.collectedCount - collectedBefore;
    if (collected > 0) {
      this.comboCount += collected;
      this.comboTimer = COMBO_WINDOW;
    }
    if (bee.hp < hpBefore) {
      this.comboCount = 0;
      this.comboTimer = 0;
      this.audio.playHitReceived();
    }

    // Heal-flash fade.
    if (this._flash.timer > 0) this._flash.timer -= dt;

    // Narrative modifier timers (reset to neutral on expiry) + flash fade.
    if (this._pollenModTimer > 0) {
      this._pollenModTimer -= dt;
      if (this._pollenModTimer <= 0) this._pollenMultiplier = 1;
    }
    if (this._narrativeDmgTimer > 0) {
      this._narrativeDmgTimer -= dt;
      if (this._narrativeDmgTimer <= 0) this._narrativeDmgMult = 1;
    }
    if (this._speedModTimer > 0) {
      this._speedModTimer -= dt;
      if (this._speedModTimer <= 0) this._speedMult = 1;
    }
    if (this._narrativeFlash && this._narrativeFlash.timer > 0) {
      this._narrativeFlash.timer -= dt;
      if (this._narrativeFlash.timer <= 0) this._narrativeFlash = null;
    }

    // Death → game over (after a short beat).
    if (bee.isDead()) {
      if (this._deathTimer === 0) this.audio.playDeath();
      this._deathTimer += dt;
      if (this._deathTimer > 1.1) this._triggerGameOver();
    }
  }

  /** Sum of every enemy's current HP (used to detect a landed player hit). */
  _sumEnemyHp() {
    let sum = 0;
    for (const e of this.enemies) sum += e.hp;
    return sum;
  }

  /** Active narrative-modifier status tags for the HUD (Part 5C). */
  _activeModifierTags() {
    const tags = [];
    if (this._pollenModTimer > 0) {
      tags.push({ label: `POLLEN ×${this._pollenMultiplier.toFixed(1)}`, color: COLORS.gold });
    }
    if (this._narrativeDmgTimer > 0) {
      tags.push({ label: `DMG ×${this._narrativeDmgMult.toFixed(1)}`, color: COLORS.crimson });
    }
    if (this._speedModTimer > 0) {
      tags.push({ label: `SPEED ×${this._speedMult.toFixed(1)}`, color: '#E0A030' });
    }
    return tags;
  }

  _updateLanding(dt) {
    const bee = this.bee;
    if (bee.isDead()) return;
    const still = bee.speed < 30;

    // Nearest available plant within trigger radius.
    let plant = null;
    let best = Infinity;
    for (const pl of this.plants) {
      if (!pl.available) continue;
      const d = distance(bee, pl);
      if (d <= pl.radius && d < best) {
        best = d;
        plant = pl;
      }
    }

    if (this._landed && this._hoverPlant) {
      // Armed — fire on launch (moving away or off the plant).
      if (!still || distance(bee, this._hoverPlant) > this._hoverPlant.radius) {
        this._activatePowerUp(this._hoverPlant);
        this._hoverPlant.consume();
        this._landed = false;
        this._hoverPlant = null;
        this._hoverTimer = 0;
        bee.setFlying();
      }
      return;
    }

    if (plant && still) {
      if (this._hoverPlant !== plant) {
        this._hoverPlant = plant;
        this._hoverTimer = 0;
      }
      this._hoverTimer += dt;
      if (this._hoverTimer >= 0.5) {
        this._landed = true;
        bee.setLanded();
      } else {
        bee.setLanding();
      }
    } else {
      this._hoverPlant = null;
      this._hoverTimer = 0;
      if (bee.fsm.is('LANDING')) bee.setFlying();
    }
  }

  _activatePowerUp(plant) {
    this.audio.playPowerUpActivate();
    const def = POWERUP_DEFS[plant.type];

    // Rare one-use plants resolve instantly rather than granting a timed buff.
    if (def.effect === 'instant_store') {
      this._openFieldStore();
      return;
    }
    if (def.effect === 'full_heal') {
      this.bee.hp = this.bee.maxHp;
      this._flash = { alpha: 0.4, timer: 0.5, duration: 0.5 };
      return;
    }

    this.activePowerUp = {
      type: plant.type,
      color: plant.color,
      duration: def.duration,
      timer: def.duration,
    };
  }

  // Moonflower: open the hive store mid-field (Store tab). Exiting returns to
  // PLAYING rather than requiring a hive dock (see _exitHive).
  _openFieldStore() {
    this.state = 'HIVE';
    this.bee.setDocked();
    this.store.open();
    this.store.tab = 'STORE';
    this._fieldStore = true;
  }

  _updateHiveDock() {
    const bee = this.bee;
    const inZone = this.meadow.isInHiveZone(bee.x, bee.y);
    if (!inZone) {
      this._dockArmed = true;
      return;
    }
    if (inZone && this._dockArmed && !bee.isDead()) {
      this._dockArmed = false;
      this._enterHive();
    }
  }

  _enterHive() {
    this.state = 'HIVE';
    this.audio.playHiveEnter();
    this.bee.setDocked();
    this.bee.hp = this.bee.maxHp; // full heal on hive return
    this.hiveReturnCount += 1; // drives enemy respawn timing
    this._save();
    this.store.open();

    // Kick off the narrative API call now so it resolves while the player is
    // spending pollen — by the time they Fly Out the event is usually ready.
    this.narrative.onHiveEnter({
      pollenBanked: this.runBanked,
      hp: this.bee.hp,
      maxHp: this.bee.maxHp,
      craft: this.progress.upgrades.activeCraft || 'bee',
    });
  }

  _exitHive() {
    this._maybeSwapCraft();
    this.bee.setFlying();
    const fromFieldStore = this._fieldStore;
    this._fieldStore = false;

    // A narrative event only fires after a real hive dock (onHiveEnter ran).
    // If one is ready or still resolving, show it before returning to the field.
    if (!fromFieldStore && this.narrative.onHiveExit()) {
      this.audio.playEventTrigger();
      this.state = 'EVENT';
    } else {
      this.state = 'PLAYING';
    }
    // _dockArmed stays false until the bee leaves the hive zone again.
  }

  // If the active craft selection changed in the Hangar, spawn the new craft.
  // Carried pollen is auto-banked first; the new craft deploys at full HP.
  _maybeSwapCraft() {
    const target = this.progress.upgrades.activeCraft || 'bee';
    if (this.bee.craftType === target) return;
    this._deposit(); // auto-bank before switching
    const x = this._fieldStore ? this.bee.x : this.meadow.hive.x;
    const y = this._fieldStore ? this.bee.y : this.meadow.hive.y;
    this.bee = this._spawnCraft(target, x, y);
    this.bee.setFlying();
    this.camera.snapTo(this.bee.x, this.bee.y);
  }

  // Apply the consequence of a resolved narrative choice. Timed modifiers set a
  // multiplier + timer (ticked in _updatePlaying); instant ones resolve now.
  _applyNarrativeConsequence(consequence) {
    if (!consequence) return;
    switch (consequence.type) {
      case 'pollen_modifier':
        this._pollenMultiplier = consequence.value;
        this._pollenModTimer = consequence.duration;
        break;
      case 'damage_modifier':
        this._narrativeDmgMult = consequence.value;
        this._narrativeDmgTimer = consequence.duration;
        break;
      case 'heal':
        this.bee.hp = Math.min(this.bee.maxHp, this.bee.hp + this.bee.maxHp * consequence.value);
        break;
      case 'speed_modifier':
        this._speedMult = consequence.value;
        this._speedModTimer = consequence.duration;
        break;
      case 'pollen_bonus': {
        // Add common pollen one at a time so each craft's hard cap is respected.
        let n = Math.max(0, Math.round(consequence.value));
        while (n > 0 && this.bee.addPollen('common')) n--;
        break;
      }
      default:
        break;
    }
    // Brief consequence flash in the HUD (gold beneficial / crimson harmful).
    this._narrativeFlash = {
      text: consequence.description || '',
      color: isBeneficialConsequence(consequence) ? COLORS.gold : COLORS.crimson,
      timer: 4.0,
    };
  }

  // ------------------------------------------------------------ hive economy
  _handleStoreIntent(intent) {
    if (intent.action === 'exit') {
      this._exitHive();
    } else if (intent.action === 'deposit') {
      this._deposit();
    } else if (intent.action === 'buy') {
      this._buy(intent.data);
    } else if (intent.action === 'buy-craft') {
      this._buyCraft(intent.data);
    } else if (intent.action === 'switch-craft') {
      this._switchCraft(intent.data);
    }
    // 'tab' handled inside the store
  }

  _buyCraft(craftId) {
    const craft = CRAFTS.find((c) => c.id === craftId);
    if (!craft || craft.cost <= 0) return;
    const up = this.progress.upgrades;
    if (up.craftsUnlocked.includes(craftId)) return;
    if (this.progress.totalBanked < craft.cost) return; // unlock cost is banked-only
    this.progress.totalBanked -= craft.cost;
    up.craftsUnlocked = [...up.craftsUnlocked, craftId];
    this._save();
  }

  _switchCraft(craftId) {
    const up = this.progress.upgrades;
    const unlocked = craftId === 'bee' || up.craftsUnlocked.includes(craftId);
    if (!unlocked || up.activeCraft === craftId) return;
    up.activeCraft = craftId;
    this._save();
    // The live craft swap happens on hive exit (auto-bank + fresh full-HP craft).
  }

  _deposit() {
    const base = this.bee.getCarriedTotal(); // includes combo bonus
    if (base <= 0) return;
    this.audio.playPollenDeposit();
    // A narrative pollen_modifier scales the banked yield while active.
    const mult = this._pollenModTimer > 0 ? this._pollenMultiplier : 1;
    const amount = Math.round(base * mult);
    this.progress.totalBanked += amount;
    this.runBanked += amount;
    this.bee.clearCarried();
    if (this.runBanked > this.progress.highScore) {
      this.progress.highScore = this.runBanked;
    }
    this._save();
  }

  _buy(upgradeId) {
    const u = UPGRADES.find((x) => x.id === upgradeId);
    if (!u) return;
    const up = this.progress.upgrades;

    // Maxed checks.
    if (u.kind === 'level' && (up[u.id] || 0) >= u.max) return;
    if (u.kind === 'heal' && (up.healingItems || 0) >= 3) return;
    if (u.kind === 'heal' && u.amount === 3 && (up.healingItems || 0) + 3 > 3) return;

    const available = this.progress.totalBanked + this.bee.getCarriedTotal();
    if (available < u.cost) return;

    this._spend(u.cost);

    // Apply effect.
    if (u.kind === 'level') {
      up[u.id] = (up[u.id] || 0) + 1;
      // Re-derive the active craft's stats from the upgrades (Bee uses the
      // +10/level HP formula; crafts keep fixed HP but pick up damage reduction).
      this.bee.applyUpgrades(up);
    } else {
      up.healingItems = Math.min(3, (up.healingItems || 0) + u.amount);
      this.bee.healingItems = up.healingItems;
    }
    this._save();
  }

  // Deduct from banked first, then from carried (overflow refunds to banked).
  _spend(cost) {
    let remaining = cost;
    const fromBank = Math.min(this.progress.totalBanked, remaining);
    this.progress.totalBanked -= fromBank;
    remaining -= fromBank;
    if (remaining <= 0) return;

    // Remove pollen value from carried, largest first; refund overflow.
    const order = ['rare', 'uncommon', 'common'];
    const values = { rare: 5, uncommon: 3, common: 1 };
    let removed = 0;
    for (const type of order) {
      while (this.bee.carried[type] > 0 && removed < remaining) {
        this.bee.carried[type] -= 1;
        removed += values[type];
      }
    }
    // Cover any shortfall from the combo bonus pool before refunding overflow.
    if (removed < remaining && this.bee.carriedBonus > 0) {
      const fromBonus = Math.min(this.bee.carriedBonus, remaining - removed);
      this.bee.carriedBonus -= fromBonus;
      removed += fromBonus;
    }
    const overflow = removed - remaining;
    if (overflow > 0) this.progress.totalBanked += overflow;
  }

  _save() {
    saveProgress({
      highScore: this.progress.highScore,
      totalBanked: this.progress.totalBanked,
      upgrades: this.progress.upgrades,
      hiveReturnCount: this.hiveReturnCount,
    });
  }

  // -------------------------------------------------------------- game over
  _triggerGameOver() {
    this._isNewRecord = this.runBanked > this._prevHigh && this.runBanked > 0;
    if (this._isNewRecord) {
      this.progress.highScore = this.runBanked;
      this._save();
    }
    // Persist explored fog (survives death within the session).
    saveProgress({ fog: this.minimap.fogVisited });
    this.gameOver.reset();
    this.state = 'GAMEOVER';
  }

  _handleGameOverIntent(intent) {
    if (intent.action === 'again') {
      this.newRun();
      this.state = 'PLAYING';
    } else if (intent.action === 'perennial') {
      window.open('https://jaxontravis.com/perennial', '_blank');
    } else if (intent.action === 'confirm-yes') {
      resetProgress();
      this.progress = loadProgress();
      this.hiveReturnCount = 0;
      this.minimap.loadFog([]); // fog resets on a full new game
      this.newRun();
      this.state = 'START';
    }
    // open-confirm / cancel-confirm handled inside the screen
  }

  _screenShake(px, ms) {
    this.shake.mag = px;
    this.shake.time = ms / 1000;
    this.shake.duration = ms / 1000;
  }

  // ----------------------------------------------------------------- render
  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.LW, this.LH);

    if (this.state === 'START') {
      StartScreen.draw(ctx, {
        w: this.LW,
        h: this.LH,
        isMobile: this.isMobile,
        highScore: this.progress.highScore,
        t: this.time,
      });
      return;
    }

    if (this.state === 'BIOME_SELECT') {
      this.biomeSelect.draw(ctx, this.LW, this.LH);
      return;
    }

    // PLAYING / HIVE / GAMEOVER / EVENT all render the world first.
    this._renderWorld(ctx);

    // Narrative event overlay (renders its own dim layer over the frozen world).
    if (this.state === 'EVENT') {
      this.eventUI.draw(ctx, this.narrative.activeEvent, this.narrative.isLoading(), this.LW, this.LH);
      return;
    }

    // Weather overlay (screen space) sits above the world, below the HUD.
    if (this.state === 'PLAYING' || this.state === 'HIVE') {
      this.meadow.drawWeather(ctx, this.LW, this.LH);
    }

    if (this.state === 'GAMEOVER') {
      this.gameOver.draw(ctx, {
        w: this.LW,
        h: this.LH,
        runScore: this.runBanked,
        highScore: this.progress.highScore,
        isNewRecord: this._isNewRecord,
      });
      return;
    }

    // HUD (PLAYING and HIVE).
    this._muteBtnRect = { x: this.LW - 84, y: 18, w: 28, h: 28 };
    HUD.draw(ctx, {
      bee: this.bee,
      banked: this.progress.totalBanked,
      activePowerUp: this.activePowerUp,
      w: this.LW,
      h: this.LH,
      isMobile: this.isMobile,
      combo: { count: this.comboCount, multiplier: getMultiplier(this.comboCount) },
      rainActive: this._rainActive,
      t: this.time,
      muteState: this.audio.muted,
      muteBtnRect: this._muteBtnRect,
      modifiers: this._activeModifierTags(),
    });
    this._renderMinimap(ctx);
    if (this.isMobile && this.state === 'PLAYING') this.joystick.draw(ctx);

    // Narrative consequence flash — centered near the bottom, above the joystick
    // on mobile. Fades out over its 4s lifetime; color set by the consequence.
    if (this._narrativeFlash && this._narrativeFlash.timer > 0) {
      const alpha = Math.max(0, Math.min(1, this._narrativeFlash.timer / 4.0));
      const fy = this.LH - (this.isMobile ? 178 : 70);
      text(ctx, this._narrativeFlash.text, this.LW / 2, fy, {
        fontStr: `italic ${font(FONTS.body, 13)}`,
        color: this._narrativeFlash.color,
        alpha,
      });
    }

    if (this.state === 'HIVE') {
      this.store.draw(ctx, {
        bee: this.bee,
        banked: this.progress.totalBanked,
        upgrades: this.progress.upgrades,
        w: this.LW,
        h: this.LH,
        isMobile: this.isMobile,
      });
    }

    // Heal flash (Ironweed full-heal) — topmost overlay, fades over 0.5s.
    if (this._flash.timer > 0 && this._flash.duration > 0) {
      const a = 0.4 * Math.max(0, this._flash.timer / this._flash.duration);
      ctx.save();
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.fillRect(0, 0, this.LW, this.LH);
      ctx.restore();
    }
  }

  _renderWorld(ctx) {
    const cam = this.camera;
    // soft follow only while actively playing
    if (this.state === 'PLAYING') cam.follow(this.bee.x, this.bee.y, 1 / 60);

    let sx = 0;
    let sy = 0;
    if (this.shake.time > 0) {
      const k = this.shake.time / this.shake.duration;
      sx = (Math.random() - 0.5) * 2 * this.shake.mag * k;
      sy = (Math.random() - 0.5) * 2 * this.shake.mag * k;
    }

    ctx.save();
    ctx.translate(-Math.round(cam.x + sx), -Math.round(cam.y + sy));

    this.meadow.drawTerrain(ctx, cam);
    this.meadow.drawHazards(ctx, cam, this.time);
    this.meadow.drawStructures(ctx, cam, this.time);

    for (const p of this.pollen) {
      if (cam.isVisible(p.x, p.y, 20, 20)) p.draw(ctx);
    }
    for (const pl of this.plants) {
      if (cam.isVisible(pl.x, pl.y, 40, 40)) pl.draw(ctx, this.time);
    }
    // Enemies near the viewport are rendered even when frozen. Fully-faded
    // dead enemies (awaiting respawn) are skipped.
    for (const e of this.enemies) {
      if (e.dead && e.deathTimer > 0.6) continue;
      if (cam.isVisible(e.x, e.y, 60, 40)) e.draw(ctx, this.time);
    }
    this.bee.draw(ctx, this.time);

    ctx.restore();
  }

  _renderMinimap(ctx) {
    const size = Minimap.SIZE;
    let x;
    let y;
    if (this.isMobile) {
      x = this.LW - size - 12;
      y = 56; // below the power-up slot
    } else {
      x = this.LW - size - 16;
      y = this.LH - size - 16;
    }
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
  }
}
