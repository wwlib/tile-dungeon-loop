/**
 * Field of view and fog-of-war helpers.
 * Recursive shadowcasting with wall occlusion. Pure — no DOM.
 */

import { VIS, blocksSight } from './tiles.js';
import { getTileAt } from './map.js';

/** Eight octants as (xx, xy, yx, yy) transform multipliers. */
const OCTANTS = [
  [1, 0, 0, 1],
  [0, 1, 1, 0],
  [0, -1, 1, 0],
  [-1, 0, 0, 1],
  [-1, 0, 0, -1],
  [0, -1, -1, 0],
  [0, 1, -1, 0],
  [1, 0, 0, -1],
];

/**
 * Compute currently visible tiles from (ox, oy) within radius.
 * Walls block sight beyond themselves but remain visible when first hit.
 *
 * @param {{ width: number, height: number, tiles: number[] }} map
 * @param {number} ox
 * @param {number} oy
 * @param {number} [radius=8]
 * @returns {Set<string>} keys `"x,y"`
 */
export function computeFov(map, ox, oy, radius = 8) {
  const visible = new Set();
  visible.add(`${ox},${oy}`);
  const r2 = radius * radius;

  for (const [xx, xy, yx, yy] of OCTANTS) {
    castLight(map, ox, oy, radius, r2, 1, 1.0, 0.0, xx, xy, yx, yy, visible);
  }
  return visible;
}

/**
 * Allocate a visibility buffer (all UNSEEN) matching map size.
 * @param {number} width
 * @param {number} height
 * @returns {Uint8Array}
 */
export function createVisibilityMap(width, height) {
  return new Uint8Array(width * height);
}

/**
 * Apply FOV: previously VISIBLE → EXPLORED; newly seen → VISIBLE.
 * Unseen tiles stay UNSEEN until first sighted.
 *
 * @param {Uint8Array} visibility
 * @param {number} width
 * @param {number} height
 * @param {Set<string>} visibleSet
 */
export function applyFov(visibility, width, height, visibleSet) {
  for (let i = 0; i < visibility.length; i++) {
    if (visibility[i] === VIS.VISIBLE) {
      visibility[i] = VIS.EXPLORED;
    }
  }
  for (const key of visibleSet) {
    const [x, y] = key.split(',').map(Number);
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    visibility[y * width + x] = VIS.VISIBLE;
  }
}

/**
 * Full refresh helper: compute FOV from player and update fog memory.
 *
 * @param {{ width: number, height: number, tiles: number[], visibility: Uint8Array, player: { x: number, y: number }, fovRadius?: number }} state
 */
export function updateVisibility(state) {
  const radius = state.fovRadius ?? 8;
  const visible = computeFov(state, state.player.x, state.player.y, radius);
  applyFov(state.visibility, state.width, state.height, visible);
}

/**
 * @param {Uint8Array} visibility
 * @param {number} width
 * @param {number} x
 * @param {number} y
 * @returns {number}
 */
export function getVisibility(visibility, width, x, y) {
  if (x < 0 || y < 0) return VIS.UNSEEN;
  const idx = y * width + x;
  if (idx < 0 || idx >= visibility.length) return VIS.UNSEEN;
  return visibility[idx];
}

/**
 * Count tiles that have been seen at least once (explored or visible).
 * @param {Uint8Array} visibility
 * @returns {number}
 */
export function countExplored(visibility) {
  let n = 0;
  for (let i = 0; i < visibility.length; i++) {
    if (visibility[i] !== VIS.UNSEEN) n++;
  }
  return n;
}

/**
 * Bresenham line-of-sight check (useful for tests / targeted queries).
 * Returns true if every tile before the destination is non-blocking.
 *
 * @param {{ width: number, height: number, tiles: number[] }} map
 * @param {number} x0
 * @param {number} y0
 * @param {number} x1
 * @param {number} y1
 * @returns {boolean}
 */
export function hasLineOfSight(map, x0, y0, x1, y1) {
  let x = x0;
  let y = y0;
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  while (true) {
    if (x === x1 && y === y1) return true;
    // Intermediate tiles that block sight occlude the destination.
    if ((x !== x0 || y !== y0) && blocksSight(getTileAt(map, x, y))) {
      return false;
    }
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
}

/**
 * Recursive shadowcasting for one octant.
 * @param {{ width: number, height: number, tiles: number[] }} map
 * @param {number} ox
 * @param {number} oy
 * @param {number} radius
 * @param {number} r2
 * @param {number} row
 * @param {number} startSlope
 * @param {number} endSlope
 * @param {number} xx
 * @param {number} xy
 * @param {number} yx
 * @param {number} yy
 * @param {Set<string>} visible
 */
function castLight(
  map,
  ox,
  oy,
  radius,
  r2,
  row,
  startSlope,
  endSlope,
  xx,
  xy,
  yx,
  yy,
  visible,
) {
  if (startSlope < endSlope) return;

  for (let i = row; i <= radius; i++) {
    let dx = -i - 1;
    let dy = -i;
    let blocked = false;
    let newStart = startSlope;

    while (dx <= 0) {
      dx += 1;
      const mapX = ox + dx * xx + dy * xy;
      const mapY = oy + dx * yx + dy * yy;
      const leftSlope = (dx - 0.5) / (dy + 0.5);
      const rightSlope = (dx + 0.5) / (dy - 0.5);

      if (startSlope < rightSlope) continue;
      if (endSlope > leftSlope) break;

      const dist2 = dx * dx + dy * dy;
      if (dist2 <= r2 && inBounds(map, mapX, mapY)) {
        visible.add(`${mapX},${mapY}`);
      }

      if (blocked) {
        if (!inBounds(map, mapX, mapY) || blocksSight(getTileAt(map, mapX, mapY))) {
          newStart = rightSlope;
          continue;
        }
        blocked = false;
        startSlope = newStart;
      } else if (inBounds(map, mapX, mapY) && blocksSight(getTileAt(map, mapX, mapY))) {
        blocked = true;
        castLight(
          map,
          ox,
          oy,
          radius,
          r2,
          i + 1,
          startSlope,
          leftSlope,
          xx,
          xy,
          yx,
          yy,
          visible,
        );
        newStart = rightSlope;
      }
    }

    if (blocked) break;
  }
}

/**
 * @param {{ width: number, height: number }} map
 * @param {number} x
 * @param {number} y
 */
function inBounds(map, x, y) {
  return x >= 0 && y >= 0 && x < map.width && y < map.height;
}
