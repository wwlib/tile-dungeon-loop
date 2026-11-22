import test from 'node:test';
import assert from 'node:assert/strict';
import { playSeed, runBot } from '../scripts/eval/bot.js';
import {
  scoreRuns,
  clampRound,
  WEIGHTS,
  AVG_DEPTH_TARGET,
  TURNS_HEALTHY_MIN,
  TURNS_HEALTHY_GOOD,
  TURNS_SHORT_DEATH,
  TURNS_STALL_SOFT,
} from '../scripts/eval/scorer.js';
import {
  runEval,
  parseArgs,
  checkGeneratedSolvability,
} from '../scripts/eval/eval.js';

const TELEMETRY_KEYS = [
  'seed',
  'crashed',
  'error',
  'invalidState',
  'stuck',
  'finalDepth',
  'maxDepth',
  'turns',
  'kills',
  'damageTaken',
  'damageDealt',
  'potionsUsed',
  'itemsCollected',
  'gameOver',
  'victory',
  'targetReached',
  'floorsVisited',
  'floorsSolvable',
];

test('scorer constants match M5a baseline', () => {
  assert.equal(AVG_DEPTH_TARGET, 3.5);
  assert.equal(TURNS_HEALTHY_MIN, 120);
  assert.equal(TURNS_HEALTHY_GOOD, 400);
  assert.equal(TURNS_SHORT_DEATH, 20);
  assert.equal(TURNS_STALL_SOFT, 700);
  assert.equal(WEIGHTS.crash_free, 0.25);
  assert.equal(WEIGHTS.solvability, 0.2);
  assert.equal(WEIGHTS.avg_depth, 0.2);
  assert.equal(WEIGHTS.turns_survived, 0.15);
  assert.equal(WEIGHTS.balance_sanity, 0.2);
  const weightSum = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(weightSum - 1) < 1e-9);
});

test('clampRound bounds to [0,100] at 1 decimal', () => {
  assert.equal(clampRound(-5), 0);
  assert.equal(clampRound(150), 100);
  assert.equal(clampRound(33.34), 33.3);
  assert.equal(clampRound(33.35), 33.4);
  assert.equal(clampRound(Number.NaN), 0);
});

test('bot completes three seeded runs cleanly', () => {
  for (const seed of [1, 2, 3]) {
    const result = playSeed(seed, { targetDepth: 3, maxTurns: 250 });
    for (const key of TELEMETRY_KEYS) {
      assert.ok(key in result, `missing telemetry key ${key}`);
    }
    assert.equal(result.seed, seed);
    assert.equal(result.crashed, false);
    assert.equal(result.invalidState, false);
    assert.equal(result.error, null);
    assert.ok(Number.isFinite(result.turns));
    assert.ok(result.turns >= 0);
    assert.ok(result.turns <= 250);
    assert.ok(result.maxDepth >= 1);
    assert.ok(result.floorsVisited >= 1);
    assert.ok(result.floorsSolvable >= 0);
    assert.ok(result.floorsSolvable <= result.floorsVisited);
  }
});

test('runBot is deterministic for the same seed', () => {
  const a = runBot(7, { targetDepth: 2, maxTurns: 120 });
  const b = runBot(7, { targetDepth: 2, maxTurns: 120 });
  assert.deepEqual(
    {
      turns: a.turns,
      maxDepth: a.maxDepth,
      kills: a.kills,
      damageTaken: a.damageTaken,
      damageDealt: a.damageDealt,
      potionsUsed: a.potionsUsed,
      itemsCollected: a.itemsCollected,
      gameOver: a.gameOver,
      stuck: a.stuck,
    },
    {
      turns: b.turns,
      maxDepth: b.maxDepth,
      kills: b.kills,
      damageTaken: b.damageTaken,
      damageDealt: b.damageDealt,
      potionsUsed: b.potionsUsed,
      itemsCollected: b.itemsCollected,
      gameOver: b.gameOver,
      stuck: b.stuck,
    },
  );
});

test('scoreRuns produces bounded 0-100 JSON metrics', () => {
  const runs = [1, 2, 3].map((seed) =>
    playSeed(seed, { targetDepth: 3, maxTurns: 200 }),
  );
  const scored = scoreRuns(runs);
  assert.ok(Number.isFinite(scored.overall));
  assert.ok(scored.overall >= 0 && scored.overall <= 100);
  assert.equal(Math.round(scored.overall * 10) / 10, scored.overall);

  for (const [name, value] of Object.entries(scored.metrics)) {
    assert.ok(Number.isFinite(value), `${name} not finite`);
    assert.ok(value >= 0 && value <= 100, `${name}=${value} out of range`);
    assert.equal(Math.round(value * 10) / 10, value, `${name} not 1-decimal`);
  }
  assert.ok(typeof scored.weakest === 'string');
  assert.ok(scored.weakest in scored.metrics);
  assert.ok(scored.stats.n === 3);
  assert.equal(scored.metrics.crash_free, 100);
});

test('parseArgs reads --seeds --json --write', () => {
  const args = parseArgs(['--json', '--write', '--seeds', '3', '--max-turns', '100']);
  assert.equal(args.json, true);
  assert.equal(args.write, true);
  assert.equal(args.seeds, 3);
  assert.equal(args.maxTurns, 100);
});

test('checkGeneratedSolvability reports solvable floors', () => {
  const { floorsVisited, floorsSolvable } = checkGeneratedSolvability(3, 2);
  assert.equal(floorsVisited, 6);
  assert.equal(floorsSolvable, floorsVisited);
});

test('runEval with 3 seeds returns valid JSON-shaped score', async () => {
  const result = await runEval({
    seeds: 3,
    targetDepth: 3,
    maxTurns: 200,
    write: false,
  });
  assert.ok(result.overall >= 0 && result.overall <= 100);
  assert.ok(result.metrics);
  assert.ok(result.stats);
  assert.ok(Array.isArray(result.runs));
  assert.equal(result.runs.length, 3);
  for (const value of Object.values(result.metrics)) {
    assert.ok(value >= 0 && value <= 100);
  }
  assert.equal(result.metrics.solvability, 100);
  assert.ok(result.stats.generatorFloorsVisited >= 3);
});
