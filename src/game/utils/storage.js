// localStorage persistence for The Great Pollinator.
// Every access is wrapped in try/catch so the game keeps running in
// private-mode browsers or when storage is unavailable.

const STORAGE_KEYS = {
  HIGH_SCORE: 'pollinator_highscore',
  TOTAL_BANKED: 'pollinator_total_banked',
  TOTAL_EVER_BANKED: 'pollinator_total_ever_banked',
  UPGRADES: 'pollinator_upgrades',
  FOG: 'pollinator_minimap_fog',
  HIVE_RETURNS: 'pollinator_hive_returns',
  ACTIVE_BIOME: 'pollinator_active_biome',
  KILL_SCORE: 'pollinator_kill_score',
};

// Upgrade levels shape. Every craft now has its own independent upgrade levels.
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

function readString(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : raw;
  } catch {
    return fallback;
  }
}

function readNumber(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
}

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

/** Returns the full progress object with sensible defaults. */
export function loadProgress() {
  const upgrades = { ...DEFAULT_UPGRADES, ...readJSON(STORAGE_KEYS.UPGRADES, {}) };
  // Defensive: ensure the craft fields keep their expected shapes.
  if (!Array.isArray(upgrades.craftsUnlocked)) upgrades.craftsUnlocked = [];
  if (typeof upgrades.activeCraft !== 'string') upgrades.activeCraft = 'bee';
  // Ensure crafts sub-object exists with defaults for all craft IDs
  if (!upgrades.crafts || typeof upgrades.crafts !== 'object') upgrades.crafts = {};
  for (const id of CRAFT_IDS) {
    if (!upgrades.crafts[id]) upgrades.crafts[id] = defaultCraftUpgrades();
  }
  // Backward compatibility: migrate legacy flat upgrade fields into the bee's
  // craft entry (these existed before per-craft upgrades were introduced).
  const LEGACY_FIELDS = ['maxHp','damageReduction','attackBoost','pollenCapacity','dashCooldown','magnetRadius','comboWindow','healingItems'];
  const hasLegacy = LEGACY_FIELDS.some(f => upgrades[f] != null && upgrades[f] !== 0);
  if (hasLegacy) {
    for (const f of LEGACY_FIELDS) {
      if (upgrades[f] != null) upgrades.crafts.bee[f] = upgrades[f];
    }
    LEGACY_FIELDS.forEach(f => delete upgrades[f]);
  }
  return {
    highScore: readNumber(STORAGE_KEYS.HIGH_SCORE, 0),
    totalBanked: readNumber(STORAGE_KEYS.TOTAL_BANKED, 0),
    // Lifetime pollen ever banked — only ever increases (never spent down), so
    // it gates biome unlocks as a permanent milestone. Default 0; clamped up to
    // the current balance so pre-existing saves don't re-lock already-earned biomes.
    totalEverBanked: Math.max(
      readNumber(STORAGE_KEYS.TOTAL_EVER_BANKED, 0),
      readNumber(STORAGE_KEYS.TOTAL_BANKED, 0),
    ),
    upgrades,
    // Fog is stored as an array of {x,y} world points the player has visited.
    fog: readJSON(STORAGE_KEYS.FOG, []),
    // Hive-return count persists within a game session, resets on new game.
    hiveReturnCount: readNumber(STORAGE_KEYS.HIVE_RETURNS, 0),
    // Currently selected expedition biome (drives world + craft availability).
    activeBiome: readString(STORAGE_KEYS.ACTIVE_BIOME, 'meadow'),
    // Lifetime kill score (persists across runs, resets on new game).
    killScore: readNumber(STORAGE_KEYS.KILL_SCORE, 0),
  };
}

/** Writes the full progress object. Partial objects are merged on read elsewhere. */
export function saveProgress(data) {
  try {
    if (data.highScore != null) {
      localStorage.setItem(STORAGE_KEYS.HIGH_SCORE, String(data.highScore));
    }
    if (data.totalBanked != null) {
      localStorage.setItem(STORAGE_KEYS.TOTAL_BANKED, String(data.totalBanked));
    }
    if (data.totalEverBanked != null) {
      localStorage.setItem(STORAGE_KEYS.TOTAL_EVER_BANKED, String(data.totalEverBanked));
    }
    if (data.upgrades != null) {
      localStorage.setItem(STORAGE_KEYS.UPGRADES, JSON.stringify(data.upgrades));
    }
    if (data.fog != null) {
      localStorage.setItem(STORAGE_KEYS.FOG, JSON.stringify(data.fog));
    }
    if (data.hiveReturnCount != null) {
      localStorage.setItem(STORAGE_KEYS.HIVE_RETURNS, String(data.hiveReturnCount));
    }
    if (data.activeBiome != null) {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_BIOME, data.activeBiome);
    }
    if (data.killScore != null) {
      localStorage.setItem(STORAGE_KEYS.KILL_SCORE, String(data.killScore));
    }
  } catch {
    // Storage full or blocked — fail silently, the run continues in memory.
  }
}

/** Clears every pollinator_ key (full progress reset). */
export function resetProgress() {
  try {
    Object.values(STORAGE_KEYS).forEach((k) => localStorage.removeItem(k));
  } catch {
    // no-op
  }
}

export { STORAGE_KEYS, DEFAULT_UPGRADES };
