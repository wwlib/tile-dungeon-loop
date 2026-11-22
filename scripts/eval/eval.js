#!/usr/bin/env node
/**
 * CLI eval runner (M5a): play N seeded games with the headless bot, score, print JSON.
 *
 * Usage:
 *   node scripts/eval/eval.js --json
 *   node scripts/eval/eval.js --json --seeds 20 --write
 *   node scripts/eval/eval.js --json --seeds 5 --max-turns 400 --target-depth 5
 */

import { mkdir, writeFile, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { playSeed } from './bot.js';
import { scoreRuns, clampRound, WEIGHTS } from './scorer.js';
import { generateDungeon, analyzeConnectivity } from '../../src/dungeon.js';
import { floorSeed } from '../../src/items.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const EVAL_DIR = path.join(ROOT, 'eval');
const LATEST_PATH = path.join(EVAL_DIR, 'latest-score.json');
const HISTORY_PATH = path.join(EVAL_DIR, 'history.jsonl');

/**
 * @param {string[]} argv
 */
export function parseArgs(argv) {
  const args = {
    json: false,
    write: false,
    seeds: 20,
    targetDepth: 5,
    maxTurns: 800,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') args.json = true;
    else if (a === '--write') args.write = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--seeds' && argv[i + 1]) {
      args.seeds = Math.max(0, Math.floor(Number(argv[++i]) || 0));
    } else if (a === '--target-depth' && argv[i + 1]) {
      args.targetDepth = Math.max(1, Math.floor(Number(argv[++i]) || 5));
    } else if (a === '--max-turns' && argv[i + 1]) {
      args.maxTurns = Math.max(1, Math.floor(Number(argv[++i]) || 800));
    }
  }
  return args;
}

/**
 * Solvability sweep over generated floors for seeds 1..N at depths 1..maxDepth.
 * @param {number} seedCount
 * @param {number} [maxDepth=5]
 */
export function checkGeneratedSolvability(seedCount, maxDepth = 5) {
  let floorsVisited = 0;
  let floorsSolvable = 0;
  for (let seed = 1; seed <= seedCount; seed++) {
    for (let depth = 1; depth <= maxDepth; depth++) {
      const fSeed = floorSeed(seed, depth);
      const dungeon = generateDungeon(fSeed);
      const analysis = analyzeConnectivity(dungeon);
      floorsVisited += 1;
      if (analysis.stairsReachable && analysis.connected) floorsSolvable += 1;
    }
  }
  return { floorsVisited, floorsSolvable };
}

/**
 * Run the full eval harness.
 * @param {{
 *   seeds?: number,
 *   targetDepth?: number,
 *   maxTurns?: number,
 *   write?: boolean,
 * }} [options]
 */
export async function runEval(options = {}) {
  const seedCount = options.seeds ?? 20;
  const targetDepth = options.targetDepth ?? 5;
  const maxTurns = options.maxTurns ?? 800;

  /** @type {import('./bot.js').BotTelemetry[]} */
  const runs = [];
  for (let seed = 1; seed <= seedCount; seed++) {
    runs.push(
      playSeed(seed, {
        targetDepth,
        maxTurns,
      }),
    );
  }

  const genSolv = checkGeneratedSolvability(seedCount, targetDepth);
  const scored = scoreRuns(runs, {
    floorsVisited: genSolv.floorsVisited,
    floorsSolvable: genSolv.floorsSolvable,
  });

  const result = {
    overall: scored.overall,
    weakest: scored.weakest,
    metrics: scored.metrics,
    stats: {
      ...scored.stats,
      botFloorsVisited: scored.stats.botFloorsVisited,
      botFloorsSolvable: scored.stats.botFloorsSolvable,
      generatorFloorsVisited: genSolv.floorsVisited,
      generatorFloorsSolvable: genSolv.floorsSolvable,
    },
    runs: summarizeRuns(runs),
  };

  if (options.write) {
    await persistScore(result);
  }

  return result;
}

/**
 * @param {import('./bot.js').BotTelemetry[]} runs
 */
function summarizeRuns(runs) {
  return runs.map((r) => ({
    seed: r.seed,
    crashed: r.crashed,
    error: r.error,
    invalidState: r.invalidState,
    stuck: r.stuck,
    finalDepth: r.finalDepth,
    maxDepth: r.maxDepth,
    turns: r.turns,
    kills: r.kills,
    damageTaken: r.damageTaken,
    damageDealt: r.damageDealt,
    potionsUsed: r.potionsUsed,
    itemsCollected: r.itemsCollected,
    gameOver: r.gameOver,
    victory: r.victory,
    targetReached: r.targetReached,
    floorsVisited: r.floorsVisited,
    floorsSolvable: r.floorsSolvable,
  }));
}

/**
 * @param {object} result
 */
async function persistScore(result) {
  await mkdir(EVAL_DIR, { recursive: true });
  const payload = {
    ...result,
    timestamp: new Date().toISOString(),
  };
  await writeFile(LATEST_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  await appendFile(HISTORY_PATH, `${JSON.stringify(payload)}\n`, 'utf8');
}

function printHelp() {
  console.log(`Usage: node scripts/eval/eval.js [options]

Options:
  --json              Print full JSON result
  --write             Save eval/latest-score.json and append eval/history.jsonl
  --seeds N           Number of seeds (1..N), default 20
  --target-depth D    Bot target depth, default 5
  --max-turns T       Per-run turn cap, default 800
  --help              Show this help
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const result = await runEval({
    seeds: args.seeds,
    targetDepth: args.targetDepth,
    maxTurns: args.maxTurns,
    write: args.write,
  });

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(
      `overall=${result.overall} weakest=${result.weakest} ` +
        `crash_free=${result.metrics.crash_free} solvability=${result.metrics.solvability} ` +
        `avg_depth=${result.metrics.avg_depth} turns_survived=${result.metrics.turns_survived} ` +
        `balance_sanity=${result.metrics.balance_sanity}`,
    );
  }
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

// Re-export helpers useful to tests.
export { clampRound, WEIGHTS };
