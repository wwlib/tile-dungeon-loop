/**
 * Pure scoring formulas for tile-dungeon eval (M5a). No I/O.
 * Metric names, weights, and normalization constants match the baseline harness.
 */

export const AVG_DEPTH_TARGET = 3.5;
export const TURNS_HEALTHY_MIN = 120;
export const TURNS_HEALTHY_GOOD = 400;
export const TURNS_SHORT_DEATH = 20;
export const TURNS_STALL_SOFT = 700;

/** @type {Readonly<{ crash_free: number, solvability: number, avg_depth: number, turns_survived: number, balance_sanity: number }>} */
export const WEIGHTS = Object.freeze({
  crash_free: 0.25,
  solvability: 0.2,
  avg_depth: 0.2,
  turns_survived: 0.15,
  balance_sanity: 0.2,
});

/**
 * @typedef {import('./bot.js').BotTelemetry} BotTelemetry
 */

/**
 * @typedef {{
 *   overall: number,
 *   weakest: string,
 *   metrics: {
 *     crash_free: number,
 *     solvability: number,
 *     avg_depth: number,
 *     turns_survived: number,
 *     balance_sanity: number,
 *   },
 *   stats: {
 *     n: number,
 *     avgMaxDepth: number,
 *     avgTurns: number,
 *     avgKills: number,
 *     avgDamageTaken: number,
 *     avgDamageDealt: number,
 *     avgPotionsUsed: number,
 *     avgItemsCollected: number,
 *     floorsVisited: number,
 *     floorsSolvable: number,
 *     botFloorsVisited: number,
 *     botFloorsSolvable: number,
 *     crashCount: number,
 *     invalidCount: number,
 *     stuckRuns: number,
 *     shortDeathRate: number,
 *     depthAtLeast2Rate: number,
 *     gameOverRate: number,
 *     targetReachedRate: number,
 *   },
 *   runs: BotTelemetry[],
 * }} EvalScore
 */

/**
 * Clamp to [0, 100] and round to 1 decimal place.
 * @param {number} value
 * @returns {number}
 */
export function clampRound(value) {
  if (!Number.isFinite(value)) return 0;
  const clamped = Math.max(0, Math.min(100, value));
  return Math.round(clamped * 10) / 10;
}

/**
 * Score an array of bot run telemetries into 0–100 metrics + overall.
 * @param {BotTelemetry[]} runs
 * @param {{ floorsVisited?: number, floorsSolvable?: number }} [floorOverride]
 *   Optional solvability counts (e.g. from the generated-floor sweep).
 * @returns {EvalScore}
 */
export function scoreRuns(runs, floorOverride = {}) {
  const list = Array.isArray(runs) ? runs : [];
  const stats = computeStats(list, floorOverride);

  const metrics = {
    crash_free: scoreCrashFree(list, stats),
    solvability: scoreSolvability(stats),
    avg_depth: scoreAvgDepth(stats),
    turns_survived: scoreTurnsSurvived(stats),
    balance_sanity: scoreBalanceSanity(stats),
  };

  let overall = 0;
  for (const [name, weight] of Object.entries(WEIGHTS)) {
    overall += metrics[/** @type {keyof typeof metrics} */ (name)] * weight;
  }
  overall = clampRound(overall);

  let weakest = 'crash_free';
  let weakestVal = Infinity;
  for (const [name, value] of Object.entries(metrics)) {
    if (value < weakestVal) {
      weakestVal = value;
      weakest = name;
    }
  }

  return {
    overall,
    weakest,
    metrics,
    stats,
    runs: list,
  };
}

/**
 * @param {BotTelemetry[]} runs
 * @param {{ floorsVisited?: number, floorsSolvable?: number }} [floorOverride]
 */
function computeStats(runs, floorOverride = {}) {
  const n = runs.length;
  const sum = {
    maxDepth: 0,
    turns: 0,
    kills: 0,
    damageTaken: 0,
    damageDealt: 0,
    potionsUsed: 0,
    itemsCollected: 0,
    floorsVisited: 0,
    floorsSolvable: 0,
  };
  let crashCount = 0;
  let invalidCount = 0;
  let stuckRuns = 0;
  let shortDeaths = 0;
  let depthAtLeast2 = 0;
  let gameOvers = 0;
  let targetReached = 0;

  for (const r of runs) {
    sum.maxDepth += num(r.maxDepth);
    sum.turns += num(r.turns);
    sum.kills += num(r.kills);
    sum.damageTaken += num(r.damageTaken);
    sum.damageDealt += num(r.damageDealt);
    sum.potionsUsed += num(r.potionsUsed);
    sum.itemsCollected += num(r.itemsCollected);
    sum.floorsVisited += num(r.floorsVisited);
    sum.floorsSolvable += num(r.floorsSolvable);

    if (r.crashed) crashCount += 1;
    if (r.invalidState) invalidCount += 1;
    if (r.stuck) stuckRuns += 1;
    if (r.gameOver) gameOvers += 1;
    if (r.gameOver && num(r.turns) < TURNS_SHORT_DEATH) shortDeaths += 1;
    if (num(r.maxDepth) >= 2) depthAtLeast2 += 1;
    if (r.targetReached || r.victory) targetReached += 1;
  }

  const avg = (v) => (n > 0 ? v / n : 0);
  const floorsVisited =
    floorOverride.floorsVisited !== undefined
      ? num(floorOverride.floorsVisited)
      : sum.floorsVisited;
  const floorsSolvable =
    floorOverride.floorsSolvable !== undefined
      ? num(floorOverride.floorsSolvable)
      : sum.floorsSolvable;

  return {
    n,
    avgMaxDepth: avg(sum.maxDepth),
    avgTurns: avg(sum.turns),
    avgKills: avg(sum.kills),
    avgDamageTaken: avg(sum.damageTaken),
    avgDamageDealt: avg(sum.damageDealt),
    avgPotionsUsed: avg(sum.potionsUsed),
    avgItemsCollected: avg(sum.itemsCollected),
    floorsVisited,
    floorsSolvable,
    botFloorsVisited: sum.floorsVisited,
    botFloorsSolvable: sum.floorsSolvable,
    crashCount,
    invalidCount,
    stuckRuns,
    shortDeathRate: n > 0 ? shortDeaths / n : 0,
    depthAtLeast2Rate: n > 0 ? depthAtLeast2 / n : 0,
    gameOverRate: n > 0 ? gameOvers / n : 0,
    targetReachedRate: n > 0 ? targetReached / n : 0,
  };
}

/**
 * @param {BotTelemetry[]} runs
 * @param {ReturnType<typeof computeStats>} stats
 */
function scoreCrashFree(runs, stats) {
  if (stats.n === 0) return 0;
  if (stats.crashCount > 0 || stats.invalidCount > 0) return 0;
  for (const r of runs) {
    if (hasNaNLike(r)) return 0;
  }
  return 100;
}

/**
 * @param {ReturnType<typeof computeStats>} stats
 */
function scoreSolvability(stats) {
  if (stats.floorsVisited <= 0) return 100;
  return clampRound(100 * (stats.floorsSolvable / stats.floorsVisited));
}

/**
 * @param {ReturnType<typeof computeStats>} stats
 */
function scoreAvgDepth(stats) {
  return clampRound(100 * (stats.avgMaxDepth / AVG_DEPTH_TARGET));
}

/**
 * @param {ReturnType<typeof computeStats>} stats
 */
function scoreTurnsSurvived(stats) {
  const avg = stats.avgTurns;
  let score;
  if (avg < TURNS_SHORT_DEATH) {
    score = (avg / TURNS_SHORT_DEATH) * 35;
  } else if (avg < TURNS_HEALTHY_MIN) {
    const t = (avg - TURNS_SHORT_DEATH) / (TURNS_HEALTHY_MIN - TURNS_SHORT_DEATH);
    score = 35 + t * 40;
  } else if (avg < TURNS_HEALTHY_GOOD) {
    const t = (avg - TURNS_HEALTHY_MIN) / (TURNS_HEALTHY_GOOD - TURNS_HEALTHY_MIN);
    score = 75 + t * 25;
  } else if (avg <= TURNS_STALL_SOFT) {
    score = 100;
  } else {
    score = 100 - Math.min(1, (avg - TURNS_STALL_SOFT) / 100) * 15;
  }
  if (stats.shortDeathRate > 0.3) score *= 0.7;
  return clampRound(score);
}

/**
 * @param {ReturnType<typeof computeStats>} stats
 */
function scoreBalanceSanity(stats) {
  const n = stats.n;
  const checks = [
    stats.avgKills > 1 ? 1 : stats.avgKills > 0 ? 0.5 : 0,
    stats.avgDamageTaken > 0 ? 1 : 0,
    stats.avgDamageDealt > 0 ? 1 : 0,
    stats.avgItemsCollected > 0.5 ? 1 : stats.avgItemsCollected > 0 ? 0.5 : 0,
    stats.avgPotionsUsed > 0
      ? 1
      : stats.avgDamageTaken < 2
        ? 0.5
        : 0.25,
    stats.depthAtLeast2Rate >= 0.5
      ? 1
      : stats.depthAtLeast2Rate >= 0.25
        ? 0.6
        : stats.depthAtLeast2Rate > 0
          ? 0.3
          : 0,
    stats.stuckRuns === 0 ? 1 : n > 0 ? Math.max(0, 1 - stats.stuckRuns / n) : 0,
  ];
  const mean = checks.reduce((a, b) => a + b, 0) / checks.length;
  return clampRound(mean * 100);
}

/**
 * @param {BotTelemetry} r
 */
function hasNaNLike(r) {
  const fields = [
    r.seed,
    r.finalDepth,
    r.maxDepth,
    r.turns,
    r.kills,
    r.damageTaken,
    r.damageDealt,
    r.potionsUsed,
    r.itemsCollected,
    r.floorsVisited,
    r.floorsSolvable,
  ];
  for (const v of fields) {
    if (typeof v === 'number' && !Number.isFinite(v)) return true;
  }
  return false;
}

/** @param {unknown} v */
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
