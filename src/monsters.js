/**
 * Monster archetypes, seeded spawning, and simple chase / wander AI.
 * Pure module — no DOM.
 */

import { isWalkable } from './tiles.js';
import { getTileAt } from './map.js';

/** @typedef {{
 *   id: string,
 *   name: string,
 *   symbol: string,
 *   color: string,
 *   maxHp: number,
 *   attack: number,
 *   defense: number,
 *   xp: number,
 *   aggroRange: number,
 * }} MonsterArchetype
 */

/** @typedef {{
 *   id: number,
 *   kind: string,
 *   name: string,
 *   symbol: string,
 *   color: string,
 *   x: number,
 *   y: number,
 *   maxHp: number,
 *   hp: number,
 *   attack: number,
 *   defense: number,
 *   xp: number,
 *   aggroRange: number,
 *   alive: boolean,
 * }} Monster
 */

/** @type {Readonly<Record<string, MonsterArchetype>>} */
export const ARCHETYPES = Object.freeze({
  goblin: Object.freeze({
    id: 'goblin',
    name: 'Goblin',
    symbol: 'g',
    color: '#68d391',
    maxHp: 6,
    attack: 2,
    defense: 0,
    xp: 5,
    aggroRange: 6,
  }),
  slime: Object.freeze({
    id: 'slime',
    name: 'Slime',
    symbol: 's',
    color: '#9ae6b4',
    maxHp: 4,
    attack: 1,
    defense: 0,
    xp: 3,
    aggroRange: 4,
  }),
  bat: Object.freeze({
    id: 'bat',
    name: 'Bat',
    symbol: 'b',
    color: '#b794f4',
    maxHp: 3,
    attack: 1,
    defense: 0,
    xp: 2,
    aggroRange: 7,
  }),
  orc: Object.freeze({
    id: 'orc',
    name: 'Orc',
    symbol: 'O',
    color: '#fc8181',
    maxHp: 12,
    attack: 4,
    defense: 1,
    xp: 12,
    aggroRange: 7,
  }),
});

const SPAWN_TABLE = Object.freeze([
  'slime',
  'slime',
  'bat',
  'goblin',
  'goblin',
  'goblin',
  'orc',
]);

const CARDINAL = Object.freeze([
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
]);

/**
 * @param {MonsterArchetype} arch
 * @param {number} x
 * @param {number} y
 * @param {number} id
 * @returns {Monster}
 */
export function createMonster(arch, x, y, id) {
  return {
    id,
    kind: arch.id,
    name: arch.name,
    symbol: arch.symbol,
    color: arch.color,
    x,
    y,
    maxHp: arch.maxHp,
    hp: arch.maxHp,
    attack: arch.attack,
    defense: arch.defense,
    xp: arch.xp,
    aggroRange: arch.aggroRange,
    alive: true,
  };
}

/**
 * Seeded monster placement in rooms other than the spawn room.
 * Never overlaps walls, stairs, the player, or another monster.
 *
 * @param {{
 *   width: number,
 *   height: number,
 *   tiles: number[],
 *   rooms: { x: number, y: number, w: number, h: number }[],
 *   player: { x: number, y: number },
 *   stairs: { x: number, y: number },
 *   rng: { nextInt: (n: number) => number, range: (a: number, b: number) => number },
 * }} state
 * @param {{ density?: number }} [options]
 * @returns {Monster[]}
 */
export function spawnMonsters(state, options = {}) {
  const density = options.density ?? 1;
  /** @type {Monster[]} */
  const monsters = [];
  const occupied = new Set([
    `${state.player.x},${state.player.y}`,
    `${state.stairs.x},${state.stairs.y}`,
  ]);

  const rooms = state.rooms ?? [];
  // Skip rooms[0] — player spawn room.
  for (let ri = 1; ri < rooms.length; ri++) {
    const room = rooms[ri];
    const count = Math.max(0, state.rng.range(0, Math.min(2, density + 1)));
    for (let n = 0; n < count; n++) {
      const candidates = floorTilesInRoom(state, room, occupied);
      if (candidates.length === 0) break;
      const pick = candidates[state.rng.nextInt(candidates.length)];
      const kind = SPAWN_TABLE[state.rng.nextInt(SPAWN_TABLE.length)];
      const arch = ARCHETYPES[kind];
      const monster = createMonster(arch, pick.x, pick.y, monsters.length + 1);
      monsters.push(monster);
      occupied.add(`${pick.x},${pick.y}`);
    }
  }

  return monsters;
}

/**
 * @param {{ width: number, height: number, tiles: number[] }} map
 * @param {{ x: number, y: number, w: number, h: number }} room
 * @param {Set<string>} occupied
 * @returns {{ x: number, y: number }[]}
 */
function floorTilesInRoom(map, room, occupied) {
  /** @type {{ x: number, y: number }[]} */
  const out = [];
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      const key = `${x},${y}`;
      if (occupied.has(key)) continue;
      if (!isWalkable(getTileAt(map, x, y))) continue;
      out.push({ x, y });
    }
  }
  return out;
}

/**
 * Living monster at tile, or null.
 * @param {Monster[]} monsters
 * @param {number} x
 * @param {number} y
 * @returns {Monster | null}
 */
export function monsterAt(monsters, x, y) {
  for (const m of monsters) {
    if (m.alive && m.x === x && m.y === y) return m;
  }
  return null;
}

/**
 * Chebyshev distance.
 * @param {{ x: number, y: number }} a
 * @param {{ x: number, y: number }} b
 */
export function chebyshev(a, b) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/**
 * Manhattan distance.
 * @param {{ x: number, y: number }} a
 * @param {{ x: number, y: number }} b
 */
export function manhattan(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/**
 * Whether a tile is free for a monster to step onto.
 * @param {{ width: number, height: number, tiles: number[], player: { x: number, y: number }, monsters: Monster[] }} state
 * @param {number} x
 * @param {number} y
 * @param {Monster} self
 */
export function canMonsterOccupy(state, x, y, self) {
  if (!isWalkable(getTileAt(state, x, y))) return false;
  if (state.player.x === x && state.player.y === y) return false;
  for (const m of state.monsters) {
    if (!m.alive || m === self) continue;
    if (m.x === x && m.y === y) return false;
  }
  return true;
}

/**
 * Choose a cardinal step that reduces Manhattan distance to the player,
 * preferring the axis with larger remaining delta. Falls back to any free
 * step that does not increase distance.
 *
 * @param {{ width: number, height: number, tiles: number[], player: { x: number, y: number }, monsters: Monster[] }} state
 * @param {Monster} monster
 * @returns {{ dx: number, dy: number } | null}
 */
export function chooseChaseStep(state, monster) {
  const tx = state.player.x;
  const ty = state.player.y;
  const dx = Math.sign(tx - monster.x);
  const dy = Math.sign(ty - monster.y);

  /** @type {{ dx: number, dy: number }[]} */
  const preferred = [];
  if (Math.abs(tx - monster.x) >= Math.abs(ty - monster.y)) {
    if (dx !== 0) preferred.push({ dx, dy: 0 });
    if (dy !== 0) preferred.push({ dx: 0, dy });
  } else {
    if (dy !== 0) preferred.push({ dx: 0, dy });
    if (dx !== 0) preferred.push({ dx, dy: 0 });
  }

  for (const step of preferred) {
    const nx = monster.x + step.dx;
    const ny = monster.y + step.dy;
    if (canMonsterOccupy(state, nx, ny, monster)) return step;
  }

  // Try remaining cardinals that do not increase distance.
  const curDist = manhattan(monster, state.player);
  for (const [cx, cy] of CARDINAL) {
    if (preferred.some((p) => p.dx === cx && p.dy === cy)) continue;
    const nx = monster.x + cx;
    const ny = monster.y + cy;
    if (!canMonsterOccupy(state, nx, ny, monster)) continue;
    if (manhattan({ x: nx, y: ny }, state.player) <= curDist) {
      return { dx: cx, dy: cy };
    }
  }
  return null;
}

/**
 * Occasional random wander step, or null to hold.
 * @param {{ width: number, height: number, tiles: number[], player: { x: number, y: number }, monsters: Monster[], rng: { nextFloat: () => number, nextInt: (n: number) => number } }} state
 * @param {Monster} monster
 * @param {number} [chance=0.25]
 * @returns {{ dx: number, dy: number } | null}
 */
export function chooseWanderStep(state, monster, chance = 0.25) {
  if (state.rng.nextFloat() >= chance) return null;
  const order = CARDINAL.slice();
  // Deterministic shuffle via RNG.
  for (let i = order.length - 1; i > 0; i--) {
    const j = state.rng.nextInt(i + 1);
    const tmp = order[i];
    order[i] = order[j];
    order[j] = tmp;
  }
  for (const [dx, dy] of order) {
    const nx = monster.x + dx;
    const ny = monster.y + dy;
    if (canMonsterOccupy(state, nx, ny, monster)) {
      return { dx, dy };
    }
  }
  return null;
}

/**
 * Decide the monster's action for this turn.
 * @returns {{ type: 'attack' } | { type: 'move', dx: number, dy: number } | { type: 'wait' }}
 */
export function decideMonsterAction(state, monster) {
  const dist = chebyshev(monster, state.player);
  if (dist <= 1) {
    return { type: 'attack' };
  }
  if (dist <= monster.aggroRange) {
    const step = chooseChaseStep(state, monster);
    if (step) return { type: 'move', dx: step.dx, dy: step.dy };
    return { type: 'wait' };
  }
  const wander = chooseWanderStep(state, monster);
  if (wander) return { type: 'move', dx: wander.dx, dy: wander.dy };
  return { type: 'wait' };
}
