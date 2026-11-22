import { TILE } from './tiles.js';

/**
 * Build a rectangular arena: solid outer walls, open floor, and a few
 * interior pillar obstacles for collision testing.
 *
 * @param {number} [width=21]
 * @param {number} [height=15]
 * @returns {{ width: number, height: number, tiles: number[] }}
 */
export function createArenaMap(width = 21, height = 15) {
  const w = Math.max(5, Math.floor(width));
  const h = Math.max(5, Math.floor(height));
  const tiles = new Array(w * h).fill(TILE.FLOOR);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) {
        tiles[y * w + x] = TILE.WALL;
      }
    }
  }

  // Interior pillars / obstacle clusters (fixed layout for M1).
  const pillars = [
    [Math.floor(w / 3), Math.floor(h / 3)],
    [Math.floor((2 * w) / 3), Math.floor(h / 3)],
    [Math.floor(w / 3), Math.floor((2 * h) / 3)],
    [Math.floor((2 * w) / 3), Math.floor((2 * h) / 3)],
    [Math.floor(w / 2), Math.floor(h / 2)],
  ];
  for (const [px, py] of pillars) {
    if (px > 0 && py > 0 && px < w - 1 && py < h - 1) {
      tiles[py * w + px] = TILE.WALL;
    }
  }

  return { width: w, height: h, tiles };
}

/**
 * @param {{ width: number, height: number, tiles: number[] }} map
 * @param {number} x
 * @param {number} y
 * @returns {number}
 */
export function getTileAt(map, x, y) {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) {
    return TILE.WALL;
  }
  return map.tiles[y * map.width + x];
}

/**
 * @param {{ width: number, height: number, tiles: number[] }} map
 * @param {number} x
 * @param {number} y
 * @param {number} tile
 */
export function setTileAt(map, x, y, tile) {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return;
  map.tiles[y * map.width + x] = tile;
}

/**
 * First walkable floor cell found in row-major order, or null.
 * @param {{ width: number, height: number, tiles: number[] }} map
 * @returns {{ x: number, y: number } | null}
 */
export function findSpawn(map) {
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (map.tiles[y * map.width + x] === TILE.FLOOR) {
        return { x, y };
      }
    }
  }
  return null;
}
