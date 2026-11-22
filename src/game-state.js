/**
 * Pure game-state module: procedural dungeon, FOV / fog of war, monsters,
 * turn-based melee combat, HP, message log, death / restart.
 * Zero DOM / window / canvas — safe for node:test.
 */

import { createRng } from './rng.js';
import { TILE, VIS, isWalkable } from './tiles.js';
import { getTileAt } from './map.js';
import { generateDungeon } from './dungeon.js';
import {
  createVisibilityMap,
  updateVisibility,
  countExplored,
  getVisibility,
} from './fov.js';
import {
  spawnMonsters,
  monsterAt,
  decideMonsterAction,
  ARCHETYPES,
} from './monsters.js';

const DEFAULT_WIDTH = 41;
const DEFAULT_HEIGHT = 31;
const DEFAULT_FOV_RADIUS = 8;
const DEFAULT_PLAYER_MAX_HP = 20;
const DEFAULT_PLAYER_ATTACK = 3;
const DEFAULT_PLAYER_DEFENSE = 0;
const MESSAGE_LOG_LIMIT = 40;

/**
 * @typedef {import('./monsters.js').Monster} Monster
 */

/**
 * @typedef {{
 *   seed: number,
 *   turn: number,
 *   width: number,
 *   height: number,
 *   tiles: number[],
 *   player: {
 *     x: number,
 *     y: number,
 *     hp: number,
 *     maxHp: number,
 *     attack: number,
 *     defense: number,
 *   },
 *   stairs: { x: number, y: number },
 *   rooms: { x: number, y: number, w: number, h: number }[],
 *   visibility: Uint8Array,
 *   fovRadius: number,
 *   monsters: Monster[],
 *   messages: string[],
 *   kills: number,
 *   gameOver: boolean,
 *   rng: ReturnType<typeof createRng>,
 *   _options: { width: number, height: number, fovRadius: number },
 * }} GameState
 */

/**
 * @typedef {{ width?: number, height?: number, fovRadius?: number }} CreateGameOptions
 */

/**
 * @param {number|string} [seed=1]
 * @param {CreateGameOptions} [options]
 * @returns {GameState}
 */
export function createGame(seed = 1, options = {}) {
  const width = options.width ?? DEFAULT_WIDTH;
  const height = options.height ?? DEFAULT_HEIGHT;
  const fovRadius = options.fovRadius ?? DEFAULT_FOV_RADIUS;
  const rng = createRng(seed);
  const dungeon = generateDungeon(rng.seed, { width, height });
  const visibility = createVisibilityMap(dungeon.width, dungeon.height);

  /** @type {GameState} */
  const state = {
    seed: rng.seed,
    turn: 0,
    width: dungeon.width,
    height: dungeon.height,
    tiles: dungeon.tiles,
    player: {
      x: dungeon.spawn.x,
      y: dungeon.spawn.y,
      hp: DEFAULT_PLAYER_MAX_HP,
      maxHp: DEFAULT_PLAYER_MAX_HP,
      attack: DEFAULT_PLAYER_ATTACK,
      defense: DEFAULT_PLAYER_DEFENSE,
    },
    stairs: { x: dungeon.stairs.x, y: dungeon.stairs.y },
    rooms: dungeon.rooms,
    visibility,
    fovRadius,
    monsters: [],
    messages: [],
    kills: 0,
    gameOver: false,
    rng,
    _options: { width, height, fovRadius },
  };

  state.monsters = spawnMonsters(state);
  pushMessage(state, 'Welcome to the dungeon. Survive.');
  updateVisibility(state);
  return state;
}

/**
 * Start a fresh dungeon with a new seed.
 * @param {number|string} seed
 * @param {CreateGameOptions} [options]
 * @returns {GameState}
 */
export function newGame(seed, options = {}) {
  return createGame(seed, options);
}

/**
 * Restart with the same seed and size options.
 * @param {GameState} state
 * @returns {GameState}
 */
export function restart(state) {
  const opts = state?._options ?? {};
  return createGame(state.seed, {
    width: opts.width,
    height: opts.height,
    fovRadius: opts.fovRadius,
  });
}

/**
 * @param {GameState} state
 * @param {number} x
 * @param {number} y
 * @returns {number}
 */
export function getTile(state, x, y) {
  return getTileAt(state, x, y);
}

/**
 * @param {GameState} state
 * @param {number} x
 * @param {number} y
 * @returns {number}
 */
export function getVis(state, x, y) {
  return getVisibility(state.visibility, state.width, x, y);
}

/**
 * Append a message, trimming to the recent bound.
 * @param {GameState} state
 * @param {string} text
 */
export function pushMessage(state, text) {
  state.messages.push(text);
  while (state.messages.length > MESSAGE_LOG_LIMIT) {
    state.messages.shift();
  }
}

/**
 * Melee damage: at least 1 when attack exceeds defense by any amount,
 * otherwise a glancing 0 (logged as a miss by the caller when 0).
 * @param {{ attack: number }} attacker
 * @param {{ defense: number }} defender
 * @returns {number}
 */
export function calcDamage(attacker, defender) {
  return Math.max(0, attacker.attack - defender.defense);
}

/**
 * @param {GameState} state
 * @returns {{
 *   seed: number,
 *   turn: number,
 *   player: { x: number, y: number, hp: number, maxHp: number },
 *   stairs: { x: number, y: number },
 *   width: number,
 *   height: number,
 *   explored: number,
 *   kills: number,
 *   gameOver: boolean,
 *   monsterCount: number,
 * }}
 */
export function inspect(state) {
  return {
    seed: state.seed,
    turn: state.turn,
    player: {
      x: state.player.x,
      y: state.player.y,
      hp: state.player.hp,
      maxHp: state.player.maxHp,
    },
    stairs: { x: state.stairs.x, y: state.stairs.y },
    width: state.width,
    height: state.height,
    explored: countExplored(state.visibility),
    kills: state.kills,
    gameOver: state.gameOver,
    monsterCount: state.monsters.filter((m) => m.alive).length,
  };
}

/**
 * Player attacks a living monster; consumes no turn by itself.
 * @param {GameState} state
 * @param {Monster} monster
 */
function playerAttack(state, monster) {
  const dmg = calcDamage(state.player, monster);
  if (dmg <= 0) {
    pushMessage(state, `You miss the ${monster.name}.`);
    return;
  }
  monster.hp -= dmg;
  pushMessage(state, `You hit the ${monster.name} for ${dmg}.`);
  if (monster.hp <= 0) {
    monster.hp = 0;
    monster.alive = false;
    state.kills += 1;
    pushMessage(state, `You kill the ${monster.name}!`);
  }
}

/**
 * Monster attacks the player.
 * @param {GameState} state
 * @param {Monster} monster
 */
function monsterAttack(state, monster) {
  if (state.gameOver) return;
  const dmg = calcDamage(monster, state.player);
  if (dmg <= 0) {
    pushMessage(state, `The ${monster.name} misses you.`);
    return;
  }
  state.player.hp -= dmg;
  pushMessage(state, `The ${monster.name} hits you for ${dmg}.`);
  if (state.player.hp <= 0) {
    state.player.hp = 0;
    state.gameOver = true;
    pushMessage(state, 'You die. Press R or Enter to restart.');
  }
}

/**
 * Run living monsters' AI after a player turn.
 * @param {GameState} state
 */
export function runMonsterTurns(state) {
  if (state.gameOver) return;
  for (const monster of state.monsters) {
    if (!monster.alive || state.gameOver) continue;
    const action = decideMonsterAction(state, monster);
    if (action.type === 'attack') {
      monsterAttack(state, monster);
    } else if (action.type === 'move') {
      monster.x += action.dx;
      monster.y += action.dy;
    }
  }
}

/**
 * Shared post-player-action bookkeeping.
 * @param {GameState} state
 */
function endPlayerTurn(state) {
  state.turn += 1;
  runMonsterTurns(state);
  updateVisibility(state);
}

/**
 * Attempt to move the player by (dx, dy). Walls and out-of-bounds block
 * the move. Bumping a living monster attacks instead of moving.
 * Turn advances on every non-game-over attempt; monsters then act.
 *
 * @param {GameState} state
 * @param {number} dx
 * @param {number} dy
 * @returns {GameState}
 */
export function movePlayer(state, dx, dy) {
  if (state.gameOver) return state;

  const nx = state.player.x + Math.trunc(dx);
  const ny = state.player.y + Math.trunc(dy);

  const cx = Math.max(0, Math.min(state.width - 1, nx));
  const cy = Math.max(0, Math.min(state.height - 1, ny));

  const target = monsterAt(state.monsters, cx, cy);
  if (target) {
    playerAttack(state, target);
    endPlayerTurn(state);
    return state;
  }

  if (isWalkable(getTile(state, cx, cy))) {
    state.player.x = cx;
    state.player.y = cy;
  }

  endPlayerTurn(state);
  return state;
}

/**
 * Higher-level action stepper.
 * @param {GameState} state
 * @param {{ type: string, dx?: number, dy?: number }} action
 * @returns {GameState}
 */
export function step(state, action) {
  if (!action || typeof action !== 'object') return state;
  if (action.type === 'restart') {
    return restart(state);
  }
  if (state.gameOver) return state;
  if (action.type === 'move') {
    return movePlayer(state, action.dx ?? 0, action.dy ?? 0);
  }
  if (action.type === 'wait') {
    endPlayerTurn(state);
    return state;
  }
  return state;
}

export {
  TILE,
  VIS,
  isWalkable,
  countExplored,
  ARCHETYPES,
  monsterAt,
  MESSAGE_LOG_LIMIT,
};
