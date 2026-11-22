/** Tile kinds for the grid map. Pure constants — no DOM. */

export const TILE = Object.freeze({
  FLOOR: 0,
  WALL: 1,
});

export const TILE_NAMES = Object.freeze({
  [TILE.FLOOR]: 'floor',
  [TILE.WALL]: 'wall',
});

/** @param {number} tile */
export function isWalkable(tile) {
  return tile === TILE.FLOOR;
}
