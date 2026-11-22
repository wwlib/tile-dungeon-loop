/** Tile kinds for the grid map. Pure constants — no DOM. */

export const TILE = Object.freeze({
  FLOOR: 0,
  WALL: 1,
  STAIRS: 2,
});

export const TILE_NAMES = Object.freeze({
  [TILE.FLOOR]: 'floor',
  [TILE.WALL]: 'wall',
  [TILE.STAIRS]: 'stairs',
});

/** Per-tile visibility for FOV / fog of war. */
export const VIS = Object.freeze({
  UNSEEN: 0,
  EXPLORED: 1,
  VISIBLE: 2,
});

/** @param {number} tile */
export function isWalkable(tile) {
  return tile === TILE.FLOOR || tile === TILE.STAIRS;
}

/** @param {number} tile — walls block sight; floors and stairs do not. */
export function blocksSight(tile) {
  return tile === TILE.WALL;
}
