// Math utilities for The Great Pollinator.
// Pure functions only — no game state, no canvas access.

const TWO_PI = Math.PI * 2;

/** Euclidean distance between two {x,y} points. */
export function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Squared distance — cheaper when only comparing magnitudes. */
export function distanceSq(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/** Angle in radians pointing from `from` toward `to`. */
export function angle(from, to) {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

/** Shortest signed angular difference (a - b), result in -PI..PI. */
export function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= TWO_PI;
  while (d < -Math.PI) d += TWO_PI;
  return d;
}

/** Linear interpolation. */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Clamp value to [min, max]. */
export function clamp(val, min, max) {
  return val < min ? min : val > max ? max : val;
}

/** Normalize an angle to the range -PI..PI. */
export function normalizeAngle(angle) {
  let a = angle % TWO_PI;
  if (a > Math.PI) a -= TWO_PI;
  if (a < -Math.PI) a += TWO_PI;
  return a;
}

/** Random float in [min, max). */
export function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

/** Random integer in [min, max] inclusive. */
export function randomInt(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

/**
 * Tiny seeded PRNG (mulberry32). Returns a function producing floats in [0,1).
 * Used for deterministic-ish pollen/decor scatter within a run.
 */
export function makeRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Frame-rate independent lerp smoothing factor. */
export function smoothLerp(a, b, factor, dt) {
  // Convert a per-frame lerp factor into a dt-aware one (assumes 60fps baseline).
  const t = 1 - Math.pow(1 - factor, dt * 60);
  return a + (b - a) * t;
}
