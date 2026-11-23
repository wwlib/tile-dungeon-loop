/**
 * Item archetypes, seeded floor loot, and pure inventory helpers.
 * Zero DOM — safe for node:test.
 */

import { isWalkable } from './tiles.js';
import { getTileAt } from './map.js';

/** @typedef {'potion' | 'weapon' | 'armor'} ItemKind */

/**
 * @typedef {{
 *   id: string,
 *   kind: ItemKind,
 *   name: string,
 *   glyph: string,
 *   color: string,
 *   tier: number,
 *   heal?: number,
 *   bonus?: number,
 * }} ItemTemplate
 */

/**
 * @typedef {{
 *   id: number,
 *   kind: ItemKind,
 *   name: string,
 *   glyph: string,
 *   color: string,
 *   tier: number,
 *   heal?: number,
 *   bonus?: number,
 *   x: number,
 *   y: number,
 *   onFloor: boolean,
 * }} Item
 */

/** @type {Readonly<ItemTemplate[]>} */
export const ITEM_TEMPLATES = Object.freeze([
  Object.freeze({
    id: 'potion_minor',
    kind: 'potion',
    name: 'Minor Potion',
    glyph: '!',
    color: '#f687b3',
    tier: 1,
    heal: 8,
  }),
  Object.freeze({
    id: 'potion_healing',
    kind: 'potion',
    name: 'Healing Potion',
    glyph: '!',
    color: '#ed64a6',
    tier: 2,
    heal: 14,
  }),
  Object.freeze({
    id: 'potion_greater',
    kind: 'potion',
    name: 'Greater Potion',
    glyph: '!',
    color: '#d53f8c',
    tier: 3,
    heal: 22,
  }),
  Object.freeze({
    id: 'dagger',
    kind: 'weapon',
    name: 'Dagger',
    glyph: ')',
    color: '#a0aec0',
    tier: 1,
    bonus: 1,
  }),
  Object.freeze({
    id: 'shortsword',
    kind: 'weapon',
    name: 'Shortsword',
    glyph: ')',
    color: '#cbd5e0',
    tier: 2,
    bonus: 2,
  }),
  Object.freeze({
    id: 'longsword',
    kind: 'weapon',
    name: 'Longsword',
    glyph: ')',
    color: '#e2e8f0',
    tier: 3,
    bonus: 3,
  }),
  Object.freeze({
    id: 'leather',
    kind: 'armor',
    name: 'Leather Armor',
    glyph: '[',
    color: '#c05621',
    tier: 1,
    bonus: 1,
  }),
  Object.freeze({
    id: 'chain',
    kind: 'armor',
    name: 'Chain Mail',
    glyph: '[',
    color: '#718096',
    tier: 2,
    bonus: 2,
  }),
  Object.freeze({
    id: 'plate',
    kind: 'armor',
    name: 'Plate Armor',
    glyph: '[',
    color: '#a0aec0',
    tier: 3,
    bonus: 3,
  }),
]);

export const MAX_INVENTORY = 9;

/**
 * Mix run seed + depth into a deterministic floor seed.
 * Depth 1 uses the run seed directly so the first floor matches M2/M3 layouts.
 * @param {number} runSeed
 * @param {number} depth
 * @returns {number}
 */
export function floorSeed(runSeed, depth) {
  const d = Math.max(1, Math.floor(Number(depth) || 1));
  const base = (Number(runSeed) >>> 0) || 1;
  if (d === 1) return base;
  const mixed = base ^ Math.imul(d, 0x9e3779b9);
  return (mixed >>> 0) || 1;
}

/**
 * Highest item tier that can appear at a given depth (1–3).
 * @param {number} depth
 */
export function maxTierForDepth(depth) {
  const d = Math.max(1, Math.floor(Number(depth) || 1));
  if (d >= 5) return 3;
  if (d >= 3) return 2;
  return 1;
}

/**
 * @param {ItemTemplate} template
 * @param {number} x
 * @param {number} y
 * @param {number} id
 * @returns {Item}
 */
export function createItem(template, x, y, id) {
  /** @type {Item} */
  const item = {
    id,
    kind: template.kind,
    name: template.name,
    glyph: template.glyph,
    color: template.color,
    tier: template.tier,
    x,
    y,
    onFloor: true,
  };
  if (template.kind === 'potion') item.heal = template.heal ?? 0;
  else item.bonus = template.bonus ?? 0;
  return item;
}

/**
 * Clone an item without floor coordinates (for inventory / equipment).
 * @param {Item} item
 * @returns {Item}
 */
export function cloneItem(item) {
  /** @type {Item} */
  const copy = {
    id: item.id,
    kind: item.kind,
    name: item.name,
    glyph: item.glyph,
    color: item.color,
    tier: item.tier,
    x: item.x ?? -1,
    y: item.y ?? -1,
    onFloor: false,
  };
  if (item.kind === 'potion') copy.heal = item.heal ?? 0;
  else copy.bonus = item.bonus ?? 0;
  return copy;
}

/**
 * Templates available at this depth, weighted toward higher tiers as depth grows.
 * @param {number} depth
 * @returns {ItemTemplate[]}
 */
export function templatesForDepth(depth) {
  const maxTier = maxTierForDepth(depth);
  return ITEM_TEMPLATES.filter((t) => t.tier <= maxTier);
}

/**
 * Pick a template with depth-biased weighting (deeper → prefer higher tier).
 * @param {{ nextFloat: () => number, nextInt: (n: number) => number }} rng
 * @param {number} depth
 * @returns {ItemTemplate}
 */
export function pickTemplate(rng, depth) {
  const pool = templatesForDepth(depth);
  if (pool.length === 0) return ITEM_TEMPLATES[0];
  const d = Math.max(1, Math.floor(Number(depth) || 1));
  const weights = pool.map((t) => {
    const depthBoost = t.tier >= maxTierForDepth(depth) ? d : 1;
    return t.tier * depthBoost;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = rng.nextFloat() * total;
  for (let i = 0; i < pool.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

/**
 * Seeded item placement in rooms away from spawn / stairs / occupied tiles.
 *
 * @param {{ nextInt: (n: number) => number, range: (a: number, b: number) => number, nextFloat: () => number }} rng
 * @param {{
 *   width: number,
 *   height: number,
 *   tiles: number[],
 *   rooms: { x: number, y: number, w: number, h: number }[],
 *   stairs?: { x: number, y: number },
 * }} dungeon
 * @param {{ x: number, y: number }} playerPos
 * @param {number} [depth=1]
 * @param {Set<string>} [occupied]
 * @param {{ density?: number, maxPerRoom?: number }} [options]
 * @returns {Item[]}
 */
export function spawnItems(rng, dungeon, playerPos, depth = 1, occupied = new Set(), options = {}) {
  const d = Math.max(1, Math.floor(Number(depth) || 1));
  const density = options.density ?? Math.min(0.7, 0.45 + d * 0.05);
  const maxPerRoom = options.maxPerRoom ?? (d >= 4 ? 2 : 1);

  /** @type {Item[]} */
  const items = [];
  const blocked = new Set(occupied);
  blocked.add(`${playerPos.x},${playerPos.y}`);
  if (dungeon.stairs) {
    blocked.add(`${dungeon.stairs.x},${dungeon.stairs.y}`);
  }

  let nextId = 1;
  const rooms = dungeon.rooms ?? [];

  for (let i = 0; i < rooms.length; i++) {
    const room = rooms[i];
    if (roomContains(room, playerPos.x, playerPos.y)) continue;
    if (rng.nextFloat() > density) continue;

    const count = rng.range(1, maxPerRoom);
    for (let n = 0; n < count; n++) {
      const spot = pickFloorInRoom(rng, dungeon, room, blocked);
      if (!spot) break;
      const template = pickTemplate(rng, d);
      const item = createItem(template, spot.x, spot.y, nextId++);
      items.push(item);
      blocked.add(`${spot.x},${spot.y}`);
    }
  }

  return items;
}

/**
 * Floor item at tile, or null.
 * @param {Item[]} items
 * @param {number} x
 * @param {number} y
 * @returns {Item | null}
 */
export function itemAt(items, x, y) {
  for (const item of items) {
    if (item.onFloor && item.x === x && item.y === y) return item;
  }
  return null;
}

/**
 * Short description for HUD / log.
 * @param {Item} item
 */
export function describeItem(item) {
  if (item.kind === 'potion') return `${item.name} (+${item.heal} HP)`;
  if (item.kind === 'weapon') return `${item.name} (+${item.bonus} ATK)`;
  if (item.kind === 'armor') return `${item.name} (+${item.bonus} DEF)`;
  return item.name;
}

/**
 * @param {{ x: number, y: number, w: number, h: number }} room
 * @param {number} x
 * @param {number} y
 */
function roomContains(room, x, y) {
  return x >= room.x && x < room.x + room.w && y >= room.y && y < room.y + room.h;
}

/**
 * @param {{ nextInt: (n: number) => number }} rng
 * @param {{ width: number, height: number, tiles: number[] }} dungeon
 * @param {{ x: number, y: number, w: number, h: number }} room
 * @param {Set<string>} occupied
 * @returns {{ x: number, y: number } | null}
 */
function pickFloorInRoom(rng, dungeon, room, occupied) {
  /** @type {{ x: number, y: number }[]} */
  const candidates = [];
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      if (!isWalkable(getTileAt(dungeon, x, y))) continue;
      if (occupied.has(`${x},${y}`)) continue;
      candidates.push({ x, y });
    }
  }
  if (candidates.length === 0) return null;
  return candidates[rng.nextInt(candidates.length)];
}
