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
