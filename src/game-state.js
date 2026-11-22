/**
 * Pure game-state module: grid map, player position, movement with wall
 * collision. Zero DOM / window / canvas — safe for node:test.
 */

import { createRng } from './rng.js';
import { TILE, isWalkable } from './tiles.js';
import { createArenaMap, getTileAt, findSpawn } from './map.js';

const DEFAULT_WIDTH = 21;
const DEFAULT_HEIGHT = 15;

/**
 * @typedef {{
 *   seed: number,
 *   turn: number,
 *   width: number,
 *   height: number,
 *   tiles: number[],
 *   player: { x: number, y: number },
 *   rng: ReturnType<typeof createRng>,
 *   _options: { width: number, height: number },
 * }} GameState
 */

/**
 * @typedef {{ width?: number, height?: number }} CreateGameOptions
 */

/**
 * @param {number|string} [seed=1]
 * @param {CreateGameOptions} [options]
 * @returns {GameState}
 */
export function createGame(seed = 1, options = {}) {
  const width = options.width ?? DEFAULT_WIDTH;
  const height = options.height ?? DEFAULT_HEIGHT;
  const rng = createRng(seed);
  const map = createArenaMap(width, height);
  const spawn = findSpawn(map) ?? { x: 1, y: 1 };

  return {
    seed: rng.seed,
    turn: 0,
    width: map.width,
    height: map.height,
    tiles: map.tiles,
    player: { x: spawn.x, y: spawn.y },
    rng,
    _options: { width, height },
  };
}

/**
 * Start a fresh arena with a new seed.
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
 * @returns {{
 *   seed: number,
 *   turn: number,
 *   player: { x: number, y: number },
 *   width: number,
 *   height: number,
 * }}
 */
export function inspect(state) {
  return {
    seed: state.seed,
    turn: state.turn,
    player: { x: state.player.x, y: state.player.y },
    width: state.width,
    height: state.height,
  };
}

/**
 * Attempt to move the player by (dx, dy). Walls and out-of-bounds block
 * the move (position is clamped to map bounds before the walkability check).
 * Turn advances on every attempt.
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
    return state;
  }
  return state;
}

export { TILE, isWalkable };
