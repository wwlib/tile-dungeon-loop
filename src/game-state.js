/**
 * Pure game-state module: procedural dungeon, player movement with wall
 * collision, FOV / fog of war. Zero DOM / window / canvas — safe for node:test.
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

const DEFAULT_WIDTH = 41;
const DEFAULT_HEIGHT = 31;
const DEFAULT_FOV_RADIUS = 8;

/**
 * @typedef {{
 *   seed: number,
 *   turn: number,
 *   width: number,
 *   height: number,
 *   tiles: number[],
 *   player: { x: number, y: number },
 *   stairs: { x: number, y: number },
 *   rooms: { x: number, y: number, w: number, h: number }[],
 *   visibility: Uint8Array,
 *   fovRadius: number,
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
    player: { x: dungeon.spawn.x, y: dungeon.spawn.y },
    stairs: { x: dungeon.stairs.x, y: dungeon.stairs.y },
    rooms: dungeon.rooms,
    visibility,
    fovRadius,
    rng,
    _options: { width, height, fovRadius },
  };

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
 * @param {GameState} state
 * @returns {{
 *   seed: number,
 *   turn: number,
 *   player: { x: number, y: number },
 *   stairs: { x: number, y: number },
 *   width: number,
 *   height: number,
 *   explored: number,
 * }}
 */
export function inspect(state) {
  return {
    seed: state.seed,
    turn: state.turn,
    player: { x: state.player.x, y: state.player.y },
    stairs: { x: state.stairs.x, y: state.stairs.y },
    width: state.width,
    height: state.height,
    explored: countExplored(state.visibility),
  };
}

/**
 * Attempt to move the player by (dx, dy). Walls and out-of-bounds block
 * the move (position is clamped to map bounds before the walkability check).
 * Turn advances on every attempt; FOV refreshes after each attempt.
 *
 * @param {GameState} state
 * @param {number} dx
 * @param {number} dy
 * @returns {GameState}
 */
export function movePlayer(state, dx, dy) {
  const nx = state.player.x + Math.trunc(dx);
  const ny = state.player.y + Math.trunc(dy);

  const cx = Math.max(0, Math.min(state.width - 1, nx));
  const cy = Math.max(0, Math.min(state.height - 1, ny));

  if (isWalkable(getTile(state, cx, cy))) {
    state.player.x = cx;
    state.player.y = cy;
  }

  state.turn += 1;
  updateVisibility(state);
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
  if (action.type === 'move') {
    return movePlayer(state, action.dx ?? 0, action.dy ?? 0);
  }
  if (action.type === 'wait') {
    state.turn += 1;
    updateVisibility(state);
    return state;
  }
  return state;
}

export { TILE, VIS, isWalkable, countExplored };
