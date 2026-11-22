/**
 * Seeded Mulberry32 PRNG — deterministic sequences from an integer seed.
 * Pure module: no DOM / Math.random() dependency for gameplay rolls.
 */

function toUint32(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) {
    return seed >>> 0;
  }
  if (typeof seed === 'string') {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < seed.length; i++) {
      h ^= seed.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  return 1;
}

/**
 * @param {number|string} [seed=1]
 * @returns {{
 *   seed: number,
 *   next: () => number,
 *   nextFloat: () => number,
 *   nextInt: (maxExclusive: number) => number,
 *   range: (minInclusive: number, maxInclusive: number) => number,
 * }}
 */
export function createRng(seed = 1) {
  const initial = toUint32(seed) || 1;
  let state = initial;

  /** @returns {number} uint32 in [0, 2^32) */
  function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }

  /** @returns {number} float in [0, 1) */
  function nextFloat() {
    return next() / 0x100000000;
  }

  /**
   * @param {number} maxExclusive
   * @returns {number} integer in [0, maxExclusive)
   */
  function nextInt(maxExclusive) {
    const max = Math.floor(Number(maxExclusive));
    if (!Number.isFinite(max) || max <= 0) return 0;
    return next() % max;
  }

  /**
   * @param {number} minInclusive
   * @param {number} maxInclusive
   * @returns {number} integer in [minInclusive, maxInclusive]
   */
  function range(minInclusive, maxInclusive) {
    const min = Math.floor(Number(minInclusive));
    const max = Math.floor(Number(maxInclusive));
    if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) {
      return min;
    }
    return min + nextInt(max - min + 1);
  }

  return {
    seed: initial,
    next,
    nextFloat,
    nextInt,
    range,
  };
}
