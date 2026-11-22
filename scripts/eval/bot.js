/**
 * Pure deterministic headless bot player for tile-dungeon eval (M5a).
 * Uses only src/game-state.js actions — no DOM.
 */

import {
  createGame,
  movePlayer,
  useItem,
  drinkBestPotion,
  descendStairs,
  isOnStairs,
  getTile,
  getVis,
  isWalkable,
  step,
  VIS,
} from '../../src/game-state.js';
import { analyzeConnectivity } from '../../src/dungeon.js';
import { monsterAt } from '../../src/monsters.js';

const CARDINAL = Object.freeze([
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
]);

const DEFAULT_TARGET_DEPTH = 5;
const DEFAULT_MAX_TURNS = 800;
const HEAL_HP_RATIO = 0.45;
const HEAL_HP_ABS = 8;
const STUCK_IDLE_TURNS = 48;
const FLOOR_EXPLORE_SOFT_CAP = 220;

/**
 * @typedef {{
 *   seed: number,
 *   crashed: boolean,
 *   error: string | null,
 *   invalidState: boolean,
 *   stuck: boolean,
 *   finalDepth: number,
 *   maxDepth: number,
 *   turns: number,
 *   kills: number,
 *   damageTaken: number,
 *   damageDealt: number,
 *   potionsUsed: number,
 *   itemsCollected: number,
 *   gameOver: boolean,
 *   victory: boolean,
 *   targetReached: boolean,
 *   floorsVisited: number,
 *   floorsSolvable: number,
 * }} BotTelemetry
 */

/**
 * Play one seeded game to completion (target depth, death, stuck, or turn cap).
 * @param {number|string} seed
 * @param {{
 *   targetDepth?: number,
 *   maxTurns?: number,
 *   width?: number,
 *   height?: number,
 *   fovRadius?: number,
 * }} [options]
 * @returns {BotTelemetry}
 */
export function playSeed(seed, options = {}) {
  const targetDepth = Math.max(1, Math.floor(options.targetDepth ?? DEFAULT_TARGET_DEPTH));
  const maxTurns = Math.max(1, Math.floor(options.maxTurns ?? DEFAULT_MAX_TURNS));

  /** @type {BotTelemetry} */
  const telemetry = blankTelemetry(seed);

  /** @type {import('../../src/game-state.js').GameState | null} */
  let state = null;
  try {
    state = createGame(seed, {
      width: options.width,
      height: options.height,
      fovRadius: options.fovRadius,
    });
  } catch (err) {
    telemetry.crashed = true;
    telemetry.error = errMessage(err);
    return telemetry;
  }

  recordFloor(state, telemetry);
  if (checkInvalid(state, telemetry)) return finalize(state, telemetry, targetDepth);

  let idleTurns = 0;
  /** @type {string} */
  let lastSig = signature(state);

  try {
    while (
      !state.gameOver &&
      state.turn < maxTurns &&
      state.depth < targetDepth &&
      !telemetry.stuck &&
      !telemetry.invalidState
    ) {
      const before = snapshot(state);
      const action = chooseAction(state, {
        targetDepth,
        maxTurns,
        floorTurns: state.turn - before.floorStartTurn,
      });

      applyAction(state, action, telemetry);

      // descendStairs returns a new state object
      if (action.type === 'descend') {
        const next = descendStairs(state);
        if (next !== state) {
          state = next;
          recordFloor(state, telemetry);
        }
      }

      accumulateCombat(before, state, telemetry);
      telemetry.maxDepth = Math.max(telemetry.maxDepth, state.depth);

      if (checkInvalid(state, telemetry)) break;

      const sig = signature(state);
      if (sig === lastSig) {
        idleTurns += 1;
        if (idleTurns >= STUCK_IDLE_TURNS) {
          telemetry.stuck = true;
          break;
        }
      } else {
        idleTurns = 0;
        lastSig = sig;
      }

      if (state.depth >= targetDepth) break;
    }
  } catch (err) {
    telemetry.crashed = true;
    telemetry.error = errMessage(err);
  }

  return finalize(state, telemetry, targetDepth);
}

/**
 * Deterministic alias used by eval runner / tests.
 * @param {number|string} seed
 * @param {Parameters<typeof playSeed>[1]} [options]
 */
export function runBot(seed, options) {
  return playSeed(seed, options);
}

/**
 * @param {number|string} seed
 * @returns {BotTelemetry}
 */
function blankTelemetry(seed) {
  const n = typeof seed === 'number' ? seed : Number(seed) || 0;
  return {
    seed: n,
    crashed: false,
    error: null,
    invalidState: false,
    stuck: false,
    finalDepth: 1,
    maxDepth: 1,
    turns: 0,
    kills: 0,
    damageTaken: 0,
    damageDealt: 0,
    potionsUsed: 0,
    itemsCollected: 0,
    gameOver: false,
    victory: false,
    targetReached: false,
    floorsVisited: 0,
    floorsSolvable: 0,
  };
}

/**
 * @param {import('../../src/game-state.js').GameState | null} state
 * @param {BotTelemetry} telemetry
 * @param {number} targetDepth
 */
function finalize(state, telemetry, targetDepth) {
  if (state) {
    telemetry.finalDepth = state.depth;
    telemetry.maxDepth = Math.max(telemetry.maxDepth, state.depth);
    telemetry.turns = state.turn;
    telemetry.kills = state.kills;
    telemetry.gameOver = Boolean(state.gameOver);
  }
  telemetry.targetReached = telemetry.maxDepth >= targetDepth;
  telemetry.victory = telemetry.targetReached;
  return telemetry;
}

/**
 * @param {import('../../src/game-state.js').GameState} state
 * @param {BotTelemetry} telemetry
 */
function recordFloor(state, telemetry) {
  telemetry.floorsVisited += 1;
  telemetry.maxDepth = Math.max(telemetry.maxDepth, state.depth);
  const dungeon = {
    width: state.width,
    height: state.height,
    tiles: state.tiles,
    rooms: state.rooms,
    spawn: { x: state.player.x, y: state.player.y },
    stairs: { x: state.stairs.x, y: state.stairs.y },
  };
  const analysis = analyzeConnectivity(dungeon);
  if (analysis.stairsReachable) telemetry.floorsSolvable += 1;
  // Stash floor-entry turn for explore soft-cap decisions.
  state._botFloorStartTurn = state.turn;
}

/**
 * @param {import('../../src/game-state.js').GameState} state
 * @param {BotTelemetry} telemetry
 */
function checkInvalid(state, telemetry) {
  const p = state.player;
  const bad =
    !p ||
    !Number.isFinite(p.hp) ||
    !Number.isFinite(p.maxHp) ||
    !Number.isFinite(state.turn) ||
    !Number.isFinite(state.depth) ||
    p.x < 0 ||
    p.y < 0 ||
    p.x >= state.width ||
    p.y >= state.height ||
    state.depth < 1 ||
    state.turn < 0;
  if (bad) {
    telemetry.invalidState = true;
    telemetry.error = telemetry.error ?? 'invalid game state';
  }
  return bad;
}

/**
 * @param {import('../../src/game-state.js').GameState} state
 */
function signature(state) {
  return [
    state.depth,
    state.player.x,
    state.player.y,
    state.player.hp,
    state.kills,
    state.inventory.length,
    state.equipped.weapon?.name ?? '-',
    state.equipped.armor?.name ?? '-',
    state.monsters.filter((m) => m.alive).length,
  ].join('|');
}

/**
 * @param {import('../../src/game-state.js').GameState} state
 */
function snapshot(state) {
  /** @type {Map<number, number>} */
  const monsterHp = new Map();
  for (const m of state.monsters) {
    if (m.alive) monsterHp.set(m.id, m.hp);
  }
  return {
    hp: state.player.hp,
    inventoryLen: state.inventory.length,
    monsterHp,
    floorStartTurn: state._botFloorStartTurn ?? 0,
  };
}

/**
 * @param {ReturnType<typeof snapshot>} before
 * @param {import('../../src/game-state.js').GameState} after
 * @param {BotTelemetry} telemetry
 */
function accumulateCombat(before, after, telemetry) {
  if (after.player.hp < before.hp) {
    telemetry.damageTaken += before.hp - after.player.hp;
  }
  for (const m of after.monsters) {
    const prev = before.monsterHp.get(m.id);
    if (prev === undefined) continue;
    if (m.hp < prev) telemetry.damageDealt += prev - m.hp;
    if (!m.alive && prev > 0 && m.hp <= 0) {
      // already counted via hp delta
    }
  }
  if (after.inventory.length > before.inventoryLen) {
    telemetry.itemsCollected += after.inventory.length - before.inventoryLen;
  }
}

/**
 * @param {import('../../src/game-state.js').GameState} state
 * @param {{ type: string, dx?: number, dy?: number, index?: number }} action
 * @param {BotTelemetry} telemetry
 */
function applyAction(state, action, telemetry) {
  if (action.type === 'move') {
    movePlayer(state, action.dx ?? 0, action.dy ?? 0);
    return;
  }
  if (action.type === 'wait') {
    step(state, { type: 'wait' });
    return;
  }
  if (action.type === 'drinkBest') {
    const beforeLen = state.inventory.length;
    drinkBestPotion(state);
    if (state.inventory.length < beforeLen) telemetry.potionsUsed += 1;
    return;
  }
  if (action.type === 'use') {
    const item = state.inventory[action.index ?? -1];
    const wasPotion = item?.kind === 'potion';
    useItem(state, action.index ?? -1);
    if (wasPotion) telemetry.potionsUsed += 1;
    return;
  }
  // descend handled by caller (new state object)
}

/**
 * @param {import('../../src/game-state.js').GameState} state
 * @param {{ targetDepth: number, maxTurns: number, floorTurns: number }} ctx
 */
function chooseAction(state, ctx) {
  // 1. Heal when hurt and a potion is available.
  if (needsHeal(state) && hasPotion(state)) {
    return { type: 'drinkBest' };
  }

  // 2. Equip any strictly better weapon/armor in inventory.
  const equipIdx = findBetterEquipIndex(state);
  if (equipIdx >= 0) {
    return { type: 'use', index: equipIdx };
  }

  // 3. Fight adjacent monsters (prefer weak / finishable targets).
  const adjacent = adjacentMonsters(state);
  if (adjacent.length > 0) {
    const target = pickFightTarget(state, adjacent);
    return { type: 'move', dx: target.x - state.player.x, dy: target.y - state.player.y };
  }

  // 4. Path to a visible floor item if inventory has room.
  if (state.inventory.length < 9) {
    const itemTarget = nearestVisibleItem(state);
    if (itemTarget) {
      const step = firstStepToward(state, itemTarget.x, itemTarget.y, { attackMonsters: true });
      if (step) return { type: 'move', dx: step.dx, dy: step.dy };
    }
  }

  const stairsKnown = isKnown(state, state.stairs.x, state.stairs.y);
  const exploreTarget = nearestExploreTarget(state);
  const floorTurns = state.turn - (state._botFloorStartTurn ?? 0);
  const shouldDescend =
    stairsKnown &&
    (!exploreTarget || floorTurns >= FLOOR_EXPLORE_SOFT_CAP || state.depth >= ctx.targetDepth - 1);

  // 5. Head for stairs when exploration is done / soft-capped.
  if (shouldDescend) {
    if (isOnStairs(state)) {
      return { type: 'descend' };
    }
    const step = firstStepToward(state, state.stairs.x, state.stairs.y, {
      attackMonsters: true,
    });
    if (step) return { type: 'move', dx: step.dx, dy: step.dy };
  }

  // 6. Explore unseen tiles.
  if (exploreTarget) {
    const step = firstStepToward(state, exploreTarget.x, exploreTarget.y, {
      attackMonsters: true,
    });
    if (step) return { type: 'move', dx: step.dx, dy: step.dy };
  }

  // 7. Engage nearest visible monster.
  const visibleMonster = nearestVisibleMonster(state);
  if (visibleMonster) {
    const step = firstStepToward(state, visibleMonster.x, visibleMonster.y, {
      attackMonsters: true,
    });
    if (step) return { type: 'move', dx: step.dx, dy: step.dy };
  }

  // 8. Fallback: stairs, then wait.
  if (stairsKnown && !isOnStairs(state)) {
    const step = firstStepToward(state, state.stairs.x, state.stairs.y, {
      attackMonsters: true,
    });
    if (step) return { type: 'move', dx: step.dx, dy: step.dy };
  }
  if (isOnStairs(state)) return { type: 'descend' };

  return { type: 'wait' };
}

/**
 * @param {import('../../src/game-state.js').GameState} state
 */
function needsHeal(state) {
  const { hp, maxHp } = state.player;
  return hp < maxHp && (hp / maxHp <= HEAL_HP_RATIO || hp <= HEAL_HP_ABS);
}

/**
 * @param {import('../../src/game-state.js').GameState} state
 */
function hasPotion(state) {
  return state.inventory.some((it) => it.kind === 'potion');
}

/**
 * @param {import('../../src/game-state.js').GameState} state
 */
function findBetterEquipIndex(state) {
  let bestIdx = -1;
  let bestGain = 0;
  for (let i = 0; i < state.inventory.length; i++) {
    const it = state.inventory[i];
    if (it.kind === 'weapon') {
      const cur = state.equipped.weapon?.bonus ?? 0;
      const gain = (it.bonus ?? 0) - cur;
      if (gain > bestGain) {
        bestGain = gain;
        bestIdx = i;
      }
    } else if (it.kind === 'armor') {
      const cur = state.equipped.armor?.bonus ?? 0;
      const gain = (it.bonus ?? 0) - cur;
      if (gain > bestGain) {
        bestGain = gain;
        bestIdx = i;
      }
    }
  }
  return bestIdx;
}

/**
 * @param {import('../../src/game-state.js').GameState} state
 */
function adjacentMonsters(state) {
  /** @type {import('../../src/monsters.js').Monster[]} */
  const out = [];
  for (const [dx, dy] of CARDINAL) {
    const m = monsterAt(state.monsters, state.player.x + dx, state.player.y + dy);
    if (m) out.push(m);
  }
  return out;
}

/**
 * Prefer low-HP / low-threat targets we can finish.
 * @param {import('../../src/game-state.js').GameState} state
 * @param {import('../../src/monsters.js').Monster[]} monsters
 */
function pickFightTarget(state, monsters) {
  let best = monsters[0];
  let bestScore = Infinity;
  for (const m of monsters) {
    const threat = m.attack + m.hp * 0.1;
    const finishBonus = m.hp <= state.player.attack - m.defense ? -5 : 0;
    const score = threat + finishBonus;
    if (score < bestScore) {
      bestScore = score;
      best = m;
    }
  }
  return best;
}

/**
 * @param {import('../../src/game-state.js').GameState} state
 * @param {number} x
 * @param {number} y
 */
function isKnown(state, x, y) {
  const v = getVis(state, x, y);
  return v === VIS.VISIBLE || v === VIS.EXPLORED;
}

/**
 * @param {import('../../src/game-state.js').GameState} state
 * @param {number} x
 * @param {number} y
 */
function isVisible(state, x, y) {
  return getVis(state, x, y) === VIS.VISIBLE;
}

/**
 * @param {import('../../src/game-state.js').GameState} state
 */
function nearestVisibleItem(state) {
  let best = null;
  let bestDist = Infinity;
  for (const it of state.items) {
    if (!it.onFloor) continue;
    if (!isVisible(state, it.x, it.y)) continue;
    const d = Math.abs(it.x - state.player.x) + Math.abs(it.y - state.player.y);
    if (d < bestDist) {
      bestDist = d;
      best = it;
    }
  }
  return best;
}

/**
 * @param {import('../../src/game-state.js').GameState} state
 */
function nearestVisibleMonster(state) {
  let best = null;
  let bestDist = Infinity;
  for (const m of state.monsters) {
    if (!m.alive) continue;
    if (!isVisible(state, m.x, m.y)) continue;
    const d = Math.abs(m.x - state.player.x) + Math.abs(m.y - state.player.y);
    if (d < bestDist) {
      bestDist = d;
      best = m;
    }
  }
  return best;
}

/**
 * Walkable tile adjacent to at least one UNSEEN walkable (or any) tile —
 * frontier for exploration.
 * @param {import('../../src/game-state.js').GameState} state
 * @returns {{ x: number, y: number } | null}
 */
function nearestExploreTarget(state) {
  const startKey = `${state.player.x},${state.player.y}`;
  const queue = [{ x: state.player.x, y: state.player.y }];
  const seen = new Set([startKey]);

  while (queue.length > 0) {
    const cur = queue.shift();
    for (const [dx, dy] of CARDINAL) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      const key = `${nx},${ny}`;
      if (seen.has(key)) continue;
      if (nx < 0 || ny < 0 || nx >= state.width || ny >= state.height) continue;
      if (!isWalkable(getTile(state, nx, ny))) continue;
      // Treat living monsters as passable goals (we can bump-fight).
      seen.add(key);
      if (isExploreFrontier(state, nx, ny)) {
        return { x: nx, y: ny };
      }
      queue.push({ x: nx, y: ny });
    }
  }
  return null;
}

/**
 * A tile is an explore frontier if it is known and borders an UNSEEN tile.
 * @param {import('../../src/game-state.js').GameState} state
 * @param {number} x
 * @param {number} y
 */
function isExploreFrontier(state, x, y) {
  if (!isKnown(state, x, y)) return false;
  for (const [dx, dy] of CARDINAL) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= state.width || ny >= state.height) continue;
    if (getVis(state, nx, ny) === VIS.UNSEEN) return true;
  }
  return false;
}

/**
 * BFS first step from player toward (tx, ty).
 * When attackMonsters is set, living monsters are walkable (bump-fight).
 * @param {import('../../src/game-state.js').GameState} state
 * @param {number} tx
 * @param {number} ty
 * @param {{ attackMonsters?: boolean }} [opts]
 * @returns {{ dx: number, dy: number } | null}
 */
function firstStepToward(state, tx, ty, opts = {}) {
  const attackMonsters = opts.attackMonsters !== false;
  const px = state.player.x;
  const py = state.player.y;
  if (px === tx && py === ty) return null;

  const startKey = `${px},${py}`;
  const goalKey = `${tx},${ty}`;
  const queue = [{ x: px, y: py }];
  const seen = new Set([startKey]);
  /** @type {Map<string, string>} */
  const parent = new Map();

  while (queue.length > 0) {
    const cur = queue.shift();
    for (const [dx, dy] of CARDINAL) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      const key = `${nx},${ny}`;
      if (seen.has(key)) continue;
      if (nx < 0 || ny < 0 || nx >= state.width || ny >= state.height) continue;
      if (!isWalkable(getTile(state, nx, ny))) continue;
      const mon = monsterAt(state.monsters, nx, ny);
      if (mon && !attackMonsters) continue;

      seen.add(key);
      parent.set(key, `${cur.x},${cur.y}`);
      if (key === goalKey) {
        return firstStepFromParentMap(parent, startKey, goalKey, px, py);
      }
      queue.push({ x: nx, y: ny });
    }
  }

  // Soft fallback: greedy Manhattan step.
  let best = null;
  let bestDist = Math.abs(tx - px) + Math.abs(ty - py);
  for (const [dx, dy] of CARDINAL) {
    const nx = px + dx;
    const ny = py + dy;
    if (!isWalkable(getTile(state, nx, ny))) continue;
    const mon = monsterAt(state.monsters, nx, ny);
    if (mon && !attackMonsters) continue;
    const d = Math.abs(tx - nx) + Math.abs(ty - ny);
    if (d < bestDist) {
      bestDist = d;
      best = { dx, dy };
    }
  }
  return best;
}

/**
 * @param {Map<string, string>} parent
 * @param {string} startKey
 * @param {string} goalKey
 * @param {number} px
 * @param {number} py
 */
function firstStepFromParentMap(parent, startKey, goalKey, px, py) {
  let node = goalKey;
  let prev = goalKey;
  while (node !== startKey) {
    prev = node;
    const p = parent.get(node);
    if (p === undefined) return null;
    node = p;
  }
  const [fx, fy] = prev.split(',').map(Number);
  return { dx: fx - px, dy: fy - py };
}

/** @param {unknown} err */
function errMessage(err) {
  if (err && typeof err === 'object' && 'message' in err) {
    return String(/** @type {{ message: unknown }} */ (err).message);
  }
  return String(err);
}
