/**
 * Pure game-state module: procedural dungeon, FOV / fog of war, monsters,
 * turn-based melee combat, items, inventory, multi-level progression.
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
import {
  spawnItems,
  itemAt,
  cloneItem,
  describeItem,
  floorSeed,
  MAX_INVENTORY,
} from './items.js';

const DEFAULT_WIDTH = 41;
const DEFAULT_HEIGHT = 31;
const DEFAULT_FOV_RADIUS = 8;
const DEFAULT_PLAYER_MAX_HP = 20;
const DEFAULT_PLAYER_ATTACK = 3;
const DEFAULT_PLAYER_DEFENSE = 0;
const MESSAGE_LOG_LIMIT = 40;

/** Exported aliases used by headless tests. */
export const PLAYER_MAX_HP = DEFAULT_PLAYER_MAX_HP;
export const PLAYER_BASE_ATTACK = DEFAULT_PLAYER_ATTACK;
export const PLAYER_BASE_DEFENSE = DEFAULT_PLAYER_DEFENSE;

/**
 * @typedef {import('./monsters.js').Monster} Monster
 * @typedef {import('./items.js').Item} Item
 */

/**
 * @typedef {{
 *   seed: number,
 *   depth: number,
 *   turn: number,
 *   width: number,
 *   height: number,
 *   tiles: number[],
 *   player: {
 *     x: number,
 *     y: number,
 *     hp: number,
 *     maxHp: number,
 *     baseAttack: number,
 *     baseDefense: number,
 *     attack: number,
 *     defense: number,
 *   },
 *   stairs: { x: number, y: number },
 *   rooms: { x: number, y: number, w: number, h: number }[],
 *   visibility: Uint8Array,
 *   fovRadius: number,
 *   monsters: Monster[],
 *   items: Item[],
 *   inventory: Item[],
 *   equipped: { weapon: Item | null, armor: Item | null },
 *   messages: string[],
 *   kills: number,
 *   gameOver: boolean,
 *   rng: ReturnType<typeof createRng>,
 *   _options: { width: number, height: number, fovRadius: number },
 * }} GameState
 */

/**
 * @typedef {{
 *   width?: number,
 *   height?: number,
 *   fovRadius?: number,
 *   depth?: number,
 *   carryOver?: {
 *     hp: number,
 *     maxHp: number,
 *     baseAttack?: number,
 *     baseDefense?: number,
 *     inventory: Item[],
 *     equipped: { weapon: Item | null, armor: Item | null },
 *     kills: number,
 *     turn: number,
 *   },
 * }} CreateGameOptions
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
  const depth = Math.max(1, Math.floor(options.depth ?? 1));
  const carry = options.carryOver ?? null;

  const runRng = createRng(seed);
  const runSeed = runRng.seed;
  const fSeed = floorSeed(runSeed, depth);
  const dungeon = generateDungeon(fSeed, { width, height });
  const visibility = createVisibilityMap(dungeon.width, dungeon.height);
  // Separate PRNG stream for monsters/items on this floor (same floor seed).
  const rng = createRng(fSeed);

  const maxHp = carry?.maxHp ?? DEFAULT_PLAYER_MAX_HP;
  const hp = carry ? Math.min(Math.max(1, carry.hp), maxHp) : maxHp;
  const baseAttack = carry?.baseAttack ?? DEFAULT_PLAYER_ATTACK;
  const baseDefense = carry?.baseDefense ?? DEFAULT_PLAYER_DEFENSE;

  /** @type {Item[]} */
  const inventory = carry
    ? carry.inventory.map((it) => cloneItem(it))
    : [];
  /** @type {{ weapon: Item | null, armor: Item | null }} */
  const equipped = carry
    ? {
        weapon: carry.equipped.weapon ? cloneItem(carry.equipped.weapon) : null,
        armor: carry.equipped.armor ? cloneItem(carry.equipped.armor) : null,
      }
    : { weapon: null, armor: null };

  /** @type {GameState} */
  const state = {
    seed: runSeed,
    depth,
    turn: carry?.turn ?? 0,
    width: dungeon.width,
    height: dungeon.height,
    tiles: dungeon.tiles,
    player: {
      x: dungeon.spawn.x,
      y: dungeon.spawn.y,
      hp,
      maxHp,
      baseAttack,
      baseDefense,
      attack: baseAttack,
      defense: baseDefense,
    },
    stairs: { x: dungeon.stairs.x, y: dungeon.stairs.y },
    rooms: dungeon.rooms,
    visibility,
    fovRadius,
    monsters: [],
    items: [],
    inventory,
    equipped,
    messages: [],
    kills: carry?.kills ?? 0,
    gameOver: false,
    rng,
    _options: { width, height, fovRadius },
  };

  state.monsters = spawnMonsters(state, { depth });
  const occupied = new Set(state.monsters.map((m) => `${m.x},${m.y}`));
  state.items = spawnItems(rng, dungeon, state.player, depth, occupied);
  refreshCombatStats(state);

  if (carry) {
    pushMessage(state, `You descend to depth ${depth}.`);
  } else {
    pushMessage(state, 'Welcome to the dungeon. Survive.');
  }
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
 * Restart with the same seed and size options — clean initial state at depth 1.
 * @param {GameState} state
 * @returns {GameState}
 */
export function restart(state) {
  const opts = state?._options ?? {};
  return createGame(state.seed, {
    width: opts.width,
    height: opts.height,
    fovRadius: opts.fovRadius,
    depth: 1,
  });
}

/**
 * Descend stairs to depth + 1, preserving player progression.
 * @param {GameState} state
 * @returns {GameState}
 */
export function descendStairs(state) {
  if (state.gameOver) return state;
  if (state.player.x !== state.stairs.x || state.player.y !== state.stairs.y) {
    pushMessage(state, 'There are no stairs here.');
    return state;
  }

  const opts = state._options ?? {};
  return createGame(state.seed, {
    width: opts.width,
    height: opts.height,
    fovRadius: opts.fovRadius,
    depth: state.depth + 1,
    carryOver: {
      hp: state.player.hp,
      maxHp: state.player.maxHp,
      baseAttack: state.player.baseAttack,
      baseDefense: state.player.baseDefense,
      inventory: state.inventory.map((it) => cloneItem(it)),
      equipped: {
        weapon: state.equipped.weapon ? cloneItem(state.equipped.weapon) : null,
        armor: state.equipped.armor ? cloneItem(state.equipped.armor) : null,
      },
      kills: state.kills,
      turn: state.turn,
    },
  });
}

/**
 * True when the player is standing on the stairs tile.
 * @param {GameState} state
 */
export function isOnStairs(state) {
  return state.player.x === state.stairs.x && state.player.y === state.stairs.y;
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
 * Recompute player.attack / player.defense from base + equipment.
 * @param {GameState} state
 */
export function refreshCombatStats(state) {
  const weaponBonus = state.equipped.weapon?.bonus ?? 0;
  const armorBonus = state.equipped.armor?.bonus ?? 0;
  state.player.attack = state.player.baseAttack + weaponBonus;
  state.player.defense = state.player.baseDefense + armorBonus;
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
 *   depth: number,
 *   turn: number,
 *   player: {
 *     x: number,
 *     y: number,
 *     hp: number,
 *     maxHp: number,
 *     attack: number,
 *     defense: number,
 *   },
 *   stairs: { x: number, y: number },
 *   width: number,
 *   height: number,
 *   explored: number,
 *   kills: number,
 *   gameOver: boolean,
 *   monsterCount: number,
 *   inventoryCount: number,
 *   equipped: { weapon: string | null, armor: string | null },
 * }}
 */
export function inspect(state) {
  return {
    seed: state.seed,
    depth: state.depth,
    turn: state.turn,
    player: {
      x: state.player.x,
      y: state.player.y,
      hp: state.player.hp,
      maxHp: state.player.maxHp,
      attack: state.player.attack,
      defense: state.player.defense,
    },
    stairs: { x: state.stairs.x, y: state.stairs.y },
    width: state.width,
    height: state.height,
    explored: countExplored(state.visibility),
    kills: state.kills,
    gameOver: state.gameOver,
    monsterCount: state.monsters.filter((m) => m.alive).length,
    inventoryCount: state.inventory.length,
    equipped: {
      weapon: state.equipped.weapon?.name ?? null,
      armor: state.equipped.armor?.name ?? null,
    },
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
 * Auto-picks up items when stepping onto them.
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
    tryAutoPickup(state);
  }

  endPlayerTurn(state);
  return state;
}

/**
 * Pick up an item under the player (manual G key).
 * @param {GameState} state
 * @returns {GameState}
 */
export function pickupItem(state) {
  if (state.gameOver) return state;
  const floorItem = itemAt(state.items, state.player.x, state.player.y);
  if (!floorItem) {
    pushMessage(state, 'There is nothing here to pick up.');
    return state;
  }
  if (state.inventory.length >= MAX_INVENTORY) {
    pushMessage(state, 'Inventory is full.');
    return state;
  }
  takeItem(state, floorItem);
  return state;
}

/**
 * Use / equip inventory slot by 0-based index.
 * Potions: drink (heal, capped at maxHp). Weapons/armor: equip.
 * Consumes a turn and triggers monster AI on success.
 *
 * @param {GameState} state
 * @param {number} index
 * @returns {GameState}
 */
export function useItem(state, index) {
  if (state.gameOver) return state;
  const i = Math.floor(Number(index));
  if (!Number.isFinite(i) || i < 0 || i >= state.inventory.length) {
    pushMessage(state, 'No item in that slot.');
    return state;
  }

  const item = state.inventory[i];
  if (item.kind === 'potion') {
    drinkPotion(state, i);
  } else if (item.kind === 'weapon' || item.kind === 'armor') {
    equipFromInventory(state, i);
  } else {
    pushMessage(state, 'You cannot use that.');
    return state;
  }

  endPlayerTurn(state);
  return state;
}

/** Alias for useItem — equip weapons/armor or drink potions from a slot. */
export const equipItem = useItem;

/**
 * Drink the highest-heal potion in inventory (H key).
 * @param {GameState} state
 * @returns {GameState}
 */
export function drinkBestPotion(state) {
  if (state.gameOver) return state;
  let bestIdx = -1;
  let bestHeal = -1;
  for (let i = 0; i < state.inventory.length; i++) {
    const it = state.inventory[i];
    if (it.kind !== 'potion') continue;
    const heal = it.heal ?? 0;
    if (heal > bestHeal) {
      bestHeal = heal;
      bestIdx = i;
    }
  }
  if (bestIdx < 0) {
    pushMessage(state, 'You have no potions.');
    return state;
  }
  return useItem(state, bestIdx);
}

/**
 * Higher-level action stepper.
 * @param {GameState} state
 * @param {{
 *   type: string,
 *   dx?: number,
 *   dy?: number,
 *   index?: number,
 * }} action
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
  if (action.type === 'use' || action.type === 'equip') {
    return useItem(state, action.index ?? -1);
  }
  if (action.type === 'pickup') {
    return pickupItem(state);
  }
  if (action.type === 'drinkBest') {
    return drinkBestPotion(state);
  }
  if (action.type === 'descend') {
    return descendStairs(state);
  }
  return state;
}

/**
 * Auto-pickup when stepping onto a floor item (if inventory has room).
 * @param {GameState} state
 */
function tryAutoPickup(state) {
  const floorItem = itemAt(state.items, state.player.x, state.player.y);
  if (!floorItem) return;
  if (state.inventory.length >= MAX_INVENTORY) {
    pushMessage(state, `Inventory full — leave the ${floorItem.name}.`);
    return;
  }
  takeItem(state, floorItem);
}

/**
 * @param {GameState} state
 * @param {Item} floorItem
 */
function takeItem(state, floorItem) {
  floorItem.onFloor = false;
  state.items = state.items.filter((it) => it !== floorItem);
  const bag = cloneItem(floorItem);
  state.inventory.push(bag);
  pushMessage(state, `You pick up ${describeItem(bag)}.`);
}

/**
 * @param {GameState} state
 * @param {number} index
 */
function drinkPotion(state, index) {
  const item = state.inventory[index];
  const heal = item.heal ?? 0;
  const before = state.player.hp;
  state.player.hp = Math.min(state.player.maxHp, state.player.hp + heal);
  const gained = state.player.hp - before;
  state.inventory.splice(index, 1);
  pushMessage(state, `You drink the ${item.name} (+${gained} HP).`);
}

/**
 * Equip weapon/armor from inventory. Swapped gear returns to inventory
 * when there is room; otherwise it drops underfoot.
 * @param {GameState} state
 * @param {number} index
 */
function equipFromInventory(state, index) {
  const item = state.inventory[index];
  const slot = item.kind === 'weapon' ? 'weapon' : 'armor';
  const current = state.equipped[slot];

  state.inventory.splice(index, 1);

  if (current) {
    if (state.inventory.length < MAX_INVENTORY) {
      state.inventory.push(cloneItem(current));
    } else {
      const dropped = cloneItem(current);
      dropped.onFloor = true;
      dropped.x = state.player.x;
      dropped.y = state.player.y;
      state.items.push(dropped);
      pushMessage(state, `You drop the ${current.name}.`);
    }
  }

  state.equipped[slot] = cloneItem(item);
  refreshCombatStats(state);
  const stat = slot === 'weapon' ? 'ATK' : 'DEF';
  pushMessage(
    state,
    `You equip the ${item.name} (+${item.bonus} ${stat}).`,
  );
}

export {
  TILE,
  VIS,
  isWalkable,
  countExplored,
  ARCHETYPES,
  monsterAt,
  MESSAGE_LOG_LIMIT,
  MAX_INVENTORY,
  floorSeed,
};
