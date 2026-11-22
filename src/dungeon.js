/**
 * Seeded rooms-and-corridors dungeon generator.
 * Pure module: uses only the explicit PRNG from rng.js.
 */

import { createRng } from './rng.js';
import { TILE, isWalkable } from './tiles.js';
import { getTileAt, setTileAt } from './map.js';

const DEFAULT_WIDTH = 41;
const DEFAULT_HEIGHT = 31;
const MIN_ROOM_SIZE = 4;
const MAX_ROOM_SIZE = 9;
const MAX_ROOM_ATTEMPTS = 80;
const TARGET_ROOMS = 12;

/**
 * @typedef {{ x: number, y: number, w: number, h: number }} Room
 * @typedef {{
 *   width: number,
 *   height: number,
 *   tiles: number[],
 *   rooms: Room[],
 *   spawn: { x: number, y: number },
 *   stairs: { x: number, y: number },
 * }} Dungeon
 */

/**
 * @param {number|string} [seed=1]
 * @param {{ width?: number, height?: number, roomAttempts?: number, targetRooms?: number }} [options]
 * @returns {Dungeon}
 */
export function generateDungeon(seed = 1, options = {}) {
  const rng = createRng(seed);
  const width = Math.max(15, Math.floor(options.width ?? DEFAULT_WIDTH));
  const height = Math.max(11, Math.floor(options.height ?? DEFAULT_HEIGHT));
  const roomAttempts = options.roomAttempts ?? MAX_ROOM_ATTEMPTS;
  const targetRooms = options.targetRooms ?? TARGET_ROOMS;

  const tiles = new Array(width * height).fill(TILE.WALL);
  /** @type {Room[]} */
  const rooms = [];

  for (let attempt = 0; attempt < roomAttempts && rooms.length < targetRooms; attempt++) {
    const rw = rng.range(MIN_ROOM_SIZE, MAX_ROOM_SIZE);
    const rh = rng.range(MIN_ROOM_SIZE, MAX_ROOM_SIZE);
    const rx = rng.range(1, width - rw - 2);
    const ry = rng.range(1, height - rh - 2);
    const room = { x: rx, y: ry, w: rw, h: rh };
    if (roomsOverlap(room, rooms, 1)) continue;
    carveRoom(tiles, width, room);
    rooms.push(room);
  }

  // Guarantee at least two rooms so spawn and stairs can differ.
  if (rooms.length === 0) {
    const fallback = {
      x: Math.max(1, Math.floor(width / 2) - 2),
      y: Math.max(1, Math.floor(height / 2) - 2),
      w: Math.min(5, width - 3),
      h: Math.min(5, height - 3),
    };
    carveRoom(tiles, width, fallback);
    rooms.push(fallback);
  }
  if (rooms.length === 1) {
    const first = rooms[0];
    const second = placeDistantRoom(rng, width, height, first);
    carveRoom(tiles, width, second);
    rooms.push(second);
  }

  // Connect rooms in placement order with L-shaped corridors, then
  // reinforce connectivity with a nearest-neighbor pass.
  for (let i = 1; i < rooms.length; i++) {
    connectRooms(tiles, width, rooms[i - 1], rooms[i], rng);
  }
  ensureRoomGraphConnected(tiles, width, rooms, rng);

  const spawn = roomCenter(rooms[0]);
  let stairsRoom = rooms[rooms.length - 1];
  let bestDist = -1;
  for (let i = 1; i < rooms.length; i++) {
    const c = roomCenter(rooms[i]);
    const d = Math.abs(c.x - spawn.x) + Math.abs(c.y - spawn.y);
    if (d > bestDist) {
      bestDist = d;
      stairsRoom = rooms[i];
    }
  }
  const stairsTile = pickStairsTile(tiles, width, height, stairsRoom, spawn);
  setTileAt({ width, height, tiles }, stairsTile.x, stairsTile.y, TILE.STAIRS);

  // Final connectivity repair: if any floor is unreachable from spawn, tunnel to it.
  repairConnectivity(tiles, width, height, spawn);

  return {
    width,
    height,
    tiles,
    rooms,
    spawn: { ...spawn },
    stairs: { x: stairsTile.x, y: stairsTile.y },
  };
}

/**
 * BFS flood-fill of walkable tiles from start.
 * @param {{ width: number, height: number, tiles: number[] }} map
 * @param {{ x: number, y: number }} start
 * @returns {Set<string>}
 */
export function floodFillWalkable(map, start) {
  const seen = new Set();
  if (!isWalkable(getTileAt(map, start.x, start.y))) return seen;
  const queue = [{ x: start.x, y: start.y }];
  seen.add(`${start.x},${start.y}`);
  const dirs = [
    [0, -1],
    [0, 1],
    [-1, 0],
    [1, 0],
  ];
  while (queue.length > 0) {
    const cur = queue.shift();
    for (const [dx, dy] of dirs) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      const key = `${nx},${ny}`;
      if (seen.has(key)) continue;
      if (!isWalkable(getTileAt(map, nx, ny))) continue;
      seen.add(key);
      queue.push({ x: nx, y: ny });
    }
  }
  return seen;
}

/**
 * @param {{ width: number, height: number, tiles: number[] }} map
 * @param {{ x: number, y: number }} from
 * @param {{ x: number, y: number }} to
 * @returns {boolean}
 */
export function isReachable(map, from, to) {
  return floodFillWalkable(map, from).has(`${to.x},${to.y}`);
}

/**
 * Count walkable tiles and verify all are reachable from spawn.
 * @param {Dungeon} dungeon
 * @returns {{ walkable: number, reachable: number, connected: boolean, stairsReachable: boolean }}
 */
export function analyzeConnectivity(dungeon) {
  const map = { width: dungeon.width, height: dungeon.height, tiles: dungeon.tiles };
  let walkable = 0;
  for (let i = 0; i < dungeon.tiles.length; i++) {
    if (isWalkable(dungeon.tiles[i])) walkable++;
  }
  const reachable = floodFillWalkable(map, dungeon.spawn);
  return {
    walkable,
    reachable: reachable.size,
    connected: reachable.size === walkable && walkable > 0,
    stairsReachable: reachable.has(`${dungeon.stairs.x},${dungeon.stairs.y}`),
  };
}

/** @param {Room} room */
function roomCenter(room) {
  return {
    x: room.x + Math.floor(room.w / 2),
    y: room.y + Math.floor(room.h / 2),
  };
}

/**
 * @param {Room} room
 * @param {Room[]} rooms
 * @param {number} padding
 */
function roomsOverlap(room, rooms, padding) {
  for (const other of rooms) {
    if (
      room.x - padding <= other.x + other.w &&
      room.x + room.w + padding >= other.x &&
      room.y - padding <= other.y + other.h &&
      room.y + room.h + padding >= other.y
    ) {
      return true;
    }
  }
  return false;
}

/**
 * @param {number[]} tiles
 * @param {number} width
 * @param {Room} room
 */
function carveRoom(tiles, width, room) {
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      tiles[y * width + x] = TILE.FLOOR;
    }
  }
}

/**
 * @param {number[]} tiles
 * @param {number} width
 * @param {number} x1
 * @param {number} y1
 * @param {number} x2
 * @param {number} y2
 * @param {{ nextInt: (n: number) => number }} rng
 */
function carveCorridor(tiles, width, x1, y1, x2, y2, rng) {
  if (rng.nextInt(2) === 0) {
    carveHTunnel(tiles, width, x1, x2, y1);
    carveVTunnel(tiles, width, y1, y2, x2);
  } else {
    carveVTunnel(tiles, width, y1, y2, x1);
    carveHTunnel(tiles, width, x1, x2, y2);
  }
}

/**
 * @param {number[]} tiles
 * @param {number} width
 * @param {Room} a
 * @param {Room} b
 * @param {{ nextInt: (n: number) => number }} rng
 */
function connectRooms(tiles, width, a, b, rng) {
  const ca = roomCenter(a);
  const cb = roomCenter(b);
  carveCorridor(tiles, width, ca.x, ca.y, cb.x, cb.y, rng);
}

/**
 * @param {number[]} tiles
 * @param {number} width
 * @param {number} x1
 * @param {number} x2
 * @param {number} y
 */
function carveHTunnel(tiles, width, x1, x2, y) {
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  for (let x = minX; x <= maxX; x++) {
    tiles[y * width + x] = TILE.FLOOR;
  }
}

/**
 * @param {number[]} tiles
 * @param {number} width
 * @param {number} y1
 * @param {number} y2
 * @param {number} x
 */
function carveVTunnel(tiles, width, y1, y2, x) {
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);
  for (let y = minY; y <= maxY; y++) {
    tiles[y * width + x] = TILE.FLOOR;
  }
}

/**
 * @param {{ range: (a: number, b: number) => number }} rng
 * @param {number} width
 * @param {number} height
 * @param {Room} first
 * @returns {Room}
 */
function placeDistantRoom(rng, width, height, first) {
  const rw = rng.range(MIN_ROOM_SIZE, Math.min(MAX_ROOM_SIZE, width - 4));
  const rh = rng.range(MIN_ROOM_SIZE, Math.min(MAX_ROOM_SIZE, height - 4));
  const preferRight = first.x < width / 2;
  const preferDown = first.y < height / 2;
  let rx = preferRight
    ? rng.range(Math.floor(width / 2), width - rw - 2)
    : rng.range(1, Math.max(1, Math.floor(width / 2) - rw));
  let ry = preferDown
    ? rng.range(Math.floor(height / 2), height - rh - 2)
    : rng.range(1, Math.max(1, Math.floor(height / 2) - rh));
  rx = Math.max(1, Math.min(rx, width - rw - 2));
  ry = Math.max(1, Math.min(ry, height - rh - 2));
  return { x: rx, y: ry, w: rw, h: rh };
}

/**
 * Connect any room whose center is not reachable from room 0.
 * @param {number[]} tiles
 * @param {number} width
 * @param {Room[]} rooms
 * @param {{ nextInt: (n: number) => number }} rng
 */
function ensureRoomGraphConnected(tiles, width, rooms, rng) {
  const map = { width, height: Math.floor(tiles.length / width), tiles };
  const origin = roomCenter(rooms[0]);
  for (let i = 1; i < rooms.length; i++) {
    const target = roomCenter(rooms[i]);
    if (isReachable(map, origin, target)) continue;
    // Tunnel to nearest already-reachable room center.
    let best = rooms[0];
    let bestDist = Infinity;
    for (let j = 0; j < i; j++) {
      const c = roomCenter(rooms[j]);
      if (!isReachable(map, origin, c)) continue;
      const d = Math.abs(c.x - target.x) + Math.abs(c.y - target.y);
      if (d < bestDist) {
        bestDist = d;
        best = rooms[j];
      }
    }
    connectRooms(tiles, width, best, rooms[i], rng);
  }
}

/**
 * @param {number[]} tiles
 * @param {number} width
 * @param {number} height
 * @param {Room} room
 * @param {{ x: number, y: number }} spawn
 */
function pickStairsTile(tiles, width, height, room, spawn) {
  const center = roomCenter(room);
  if (
    (center.x !== spawn.x || center.y !== spawn.y) &&
    tiles[center.y * width + center.x] === TILE.FLOOR
  ) {
    return center;
  }
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      if (x === spawn.x && y === spawn.y) continue;
      if (tiles[y * width + x] === TILE.FLOOR) return { x, y };
    }
  }
  // Last resort: any floor not on spawn.
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      if (x === spawn.x && y === spawn.y) continue;
      if (tiles[y * width + x] === TILE.FLOOR) return { x, y };
    }
  }
  return center;
}

/**
 * Carve tunnels from spawn to any unreachable walkable tiles.
 * @param {number[]} tiles
 * @param {number} width
 * @param {number} height
 * @param {{ x: number, y: number }} spawn
 */
function repairConnectivity(tiles, width, height, spawn) {
  const map = { width, height, tiles };

  for (let pass = 0; pass < width * height; pass++) {
    const reachable = floodFillWalkable(map, spawn);
    /** @type {{ x: number, y: number } | null} */
    let orphan = null;
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        if (!isWalkable(tiles[y * width + x])) continue;
        if (!reachable.has(`${x},${y}`)) {
          orphan = { x, y };
          break;
        }
      }
      if (orphan) break;
    }
    if (!orphan) return;

    // Find nearest reachable floor and carve an L-tunnel.
    let nearest = spawn;
    let best = Infinity;
    for (const key of reachable) {
      const [sx, sy] = key.split(',').map(Number);
      const d = Math.abs(sx - orphan.x) + Math.abs(sy - orphan.y);
      if (d < best) {
        best = d;
        nearest = { x: sx, y: sy };
      }
    }
    carveHTunnel(tiles, width, nearest.x, orphan.x, nearest.y);
    carveVTunnel(tiles, width, nearest.y, orphan.y, orphan.x);
  }
}
