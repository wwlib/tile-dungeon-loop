import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame,
  movePlayer,
  useItem,
  equipItem,
  drinkBestPotion,
  pickupItem,
  descendStairs,
  inspect,
  refreshCombatStats,
  getTile,
  calcDamage,
  TILE,
  isWalkable,
  PLAYER_MAX_HP,
  PLAYER_BASE_ATTACK,
  PLAYER_BASE_DEFENSE,
  MAX_INVENTORY,
  floorSeed,
} from '../src/game-state.js';
import {
  spawnItems,
  itemAt,
  createItem,
  cloneItem,
  ITEM_TEMPLATES,
  maxTierForDepth,
  templatesForDepth,
  describeItem,
} from '../src/items.js';
import {
  spawnMonsters,
  createMonster,
  ARCHETYPES,
  depthStatBonuses,
  spawnParamsForDepth,
} from '../src/monsters.js';
import { createRng } from '../src/rng.js';
import { generateDungeon, analyzeConnectivity } from '../src/dungeon.js';

function openArena(state, ox = 5, oy = 5) {
  for (let y = oy - 2; y <= oy + 2; y++) {
    for (let x = ox - 2; x <= ox + 2; x++) {
      state.tiles[y * state.width + x] = TILE.FLOOR;
    }
  }
  state.player.x = ox;
  state.player.y = oy;
  state.monsters = [];
  state.items = [];
}

test('item templates cover potions, weapons, and armor', () => {
  const kinds = new Set(ITEM_TEMPLATES.map((t) => t.kind));
  assert.ok(kinds.has('potion'));
  assert.ok(kinds.has('weapon'));
  assert.ok(kinds.has('armor'));
  for (const t of ITEM_TEMPLATES) {
    assert.ok(t.tier >= 1 && t.tier <= 3);
    if (t.kind === 'potion') assert.ok(t.heal > 0);
    else assert.ok(t.bonus > 0);
  }
});

test('floorSeed is stable and depth-1 equals run seed', () => {
  assert.equal(floorSeed(42, 1), 42);
  assert.equal(floorSeed(42, 2), floorSeed(42, 2));
  assert.notEqual(floorSeed(42, 1), floorSeed(42, 2));
  assert.notEqual(floorSeed(42, 2), floorSeed(42, 3));
});

test('deeper depths unlock higher item tiers', () => {
  assert.equal(maxTierForDepth(1), 1);
  assert.equal(maxTierForDepth(3), 2);
  assert.equal(maxTierForDepth(5), 3);
  assert.ok(templatesForDepth(1).every((t) => t.tier <= 1));
  assert.ok(templatesForDepth(5).some((t) => t.tier === 3));
});

test('spawnItems is deterministic for the same seed and depth', () => {
  const dungeon = generateDungeon(77);
  const player = { ...dungeon.spawn };
  const a = spawnItems(createRng(77), dungeon, player, 1);
  const b = spawnItems(createRng(77), dungeon, player, 1);
  assert.deepEqual(
    a.map((it) => ({ kind: it.kind, name: it.name, x: it.x, y: it.y, tier: it.tier })),
    b.map((it) => ({ kind: it.kind, name: it.name, x: it.x, y: it.y, tier: it.tier })),
  );
});

test('createGame spawns floor items on walkable non-overlapping tiles', () => {
  for (const seed of [1, 7, 42, 100]) {
    const state = createGame(seed);
    assert.equal(state.depth, 1);
    assert.ok(Array.isArray(state.items));
    assert.ok(Array.isArray(state.inventory));
    assert.equal(state.inventory.length, 0);
    assert.equal(state.equipped.weapon, null);
    assert.equal(state.equipped.armor, null);

    const occupied = new Set([`${state.player.x},${state.player.y}`]);
    for (const m of state.monsters) occupied.add(`${m.x},${m.y}`);

    for (const item of state.items) {
      assert.equal(item.onFloor, true);
      assert.ok(isWalkable(getTile(state, item.x, item.y)));
      assert.notEqual(getTile(state, item.x, item.y), TILE.WALL);
      const key = `${item.x},${item.y}`;
      assert.equal(occupied.has(key), false, `seed ${seed}: item overlaps at ${key}`);
      occupied.add(key);
    }
  }
});

test('stepping onto an item auto-picks it into inventory', () => {
  const state = createGame(1, { width: 21, height: 15 });
  openArena(state);
  const potion = createItem(
    ITEM_TEMPLATES.find((t) => t.id === 'potion_minor'),
    6,
    5,
    1,
  );
  state.items = [potion];

  movePlayer(state, 1, 0);

  assert.equal(state.player.x, 6);
  assert.equal(state.items.length, 0);
  assert.equal(state.inventory.length, 1);
  assert.equal(state.inventory[0].kind, 'potion');
  assert.equal(state.inventory[0].onFloor, false);
  assert.ok(state.messages.some((m) => m.includes('pick up')));
});

test('inventory is bounded; full bag leaves item on floor', () => {
  const state = createGame(1, { width: 21, height: 15 });
  openArena(state);
  const tmpl = ITEM_TEMPLATES.find((t) => t.id === 'potion_minor');
  for (let i = 0; i < MAX_INVENTORY; i++) {
    state.inventory.push(cloneItem(createItem(tmpl, -1, -1, i + 1)));
  }
  const floorPotion = createItem(tmpl, 6, 5, 99);
  state.items = [floorPotion];

  movePlayer(state, 1, 0);

  assert.equal(state.inventory.length, MAX_INVENTORY);
  assert.equal(state.items.length, 1);
  assert.ok(itemAt(state.items, 6, 5));
  assert.ok(state.messages.some((m) => /Inventory full/i.test(m)));
});

test('manual pickupItem works when standing on loot', () => {
  const state = createGame(1, { width: 21, height: 15 });
  openArena(state);
  const dagger = createItem(
    ITEM_TEMPLATES.find((t) => t.id === 'dagger'),
    5,
    5,
    1,
  );
  state.items = [dagger];

  pickupItem(state);

  assert.equal(state.inventory.length, 1);
  assert.equal(state.items.length, 0);
  assert.ok(state.messages.some((m) => m.includes('Dagger')));
});

test('drinking a healing potion restores HP capped at maxHp', () => {
  const state = createGame(1, { width: 21, height: 15 });
  openArena(state);
  state.player.hp = 10;
  const potion = createItem(
    ITEM_TEMPLATES.find((t) => t.id === 'potion_healing'),
    -1,
    -1,
    1,
  );
  potion.onFloor = false;
  state.inventory = [potion];

  useItem(state, 0);

  assert.equal(state.inventory.length, 0);
  assert.equal(state.player.hp, Math.min(PLAYER_MAX_HP, 10 + 14));
  assert.ok(state.messages.some((m) => m.includes('drink')));
});

test('potion heal never exceeds maxHp', () => {
  const state = createGame(1, { width: 21, height: 15 });
  openArena(state);
  state.player.hp = PLAYER_MAX_HP - 2;
  const potion = createItem(
    ITEM_TEMPLATES.find((t) => t.id === 'potion_greater'),
    -1,
    -1,
    1,
  );
  potion.onFloor = false;
  state.inventory = [potion];

  useItem(state, 0);

  assert.equal(state.player.hp, PLAYER_MAX_HP);
});

test('drinkBestPotion selects the highest heal amount', () => {
  const state = createGame(1, { width: 21, height: 15 });
  openArena(state);
  state.player.hp = 5;
  const minor = createItem(ITEM_TEMPLATES.find((t) => t.id === 'potion_minor'), -1, -1, 1);
  const greater = createItem(ITEM_TEMPLATES.find((t) => t.id === 'potion_greater'), -1, -1, 2);
  minor.onFloor = false;
  greater.onFloor = false;
  state.inventory = [minor, greater];

  drinkBestPotion(state);

  assert.equal(state.inventory.length, 1);
  assert.equal(state.inventory[0].name, 'Minor Potion');
  assert.equal(state.player.hp, Math.min(PLAYER_MAX_HP, 5 + 22));
});

test('equipping a weapon increases attack for combat', () => {
  const state = createGame(1, { width: 21, height: 15 });
  openArena(state);
  const sword = createItem(
    ITEM_TEMPLATES.find((t) => t.id === 'shortsword'),
    -1,
    -1,
    1,
  );
  sword.onFloor = false;
  state.inventory = [sword];

  assert.equal(state.player.attack, PLAYER_BASE_ATTACK);
  equipItem(state, 0);

  assert.equal(state.equipped.weapon?.name, 'Shortsword');
  assert.equal(state.player.attack, PLAYER_BASE_ATTACK + 2);
  assert.equal(state.inventory.length, 0);

  const goblin = createMonster(ARCHETYPES.goblin, 6, 5, 1);
  goblin.defense = 0;
  const dmg = calcDamage(state.player, goblin);
  assert.equal(dmg, PLAYER_BASE_ATTACK + 2);
});

test('equipping armor increases defense and reduces incoming damage', () => {
  const state = createGame(1, { width: 21, height: 15 });
  openArena(state);
  const armor = createItem(
    ITEM_TEMPLATES.find((t) => t.id === 'chain'),
    -1,
    -1,
    1,
  );
  armor.onFloor = false;
  state.inventory = [armor];

  useItem(state, 0);

  assert.equal(state.equipped.armor?.name, 'Chain Mail');
  assert.equal(state.player.defense, PLAYER_BASE_DEFENSE + 2);
  refreshCombatStats(state);
  assert.equal(state.player.defense, PLAYER_BASE_DEFENSE + 2);

  const orc = createMonster(ARCHETYPES.orc, 5, 6, 1);
  const expected = calcDamage(orc, state.player);
  assert.equal(expected, Math.max(0, orc.attack - state.player.defense));
});

test('equip swaps previous gear back into inventory', () => {
  const state = createGame(1, { width: 21, height: 15 });
  openArena(state);
  const dagger = createItem(ITEM_TEMPLATES.find((t) => t.id === 'dagger'), -1, -1, 1);
  const sword = createItem(ITEM_TEMPLATES.find((t) => t.id === 'longsword'), -1, -1, 2);
  dagger.onFloor = false;
  sword.onFloor = false;
  state.inventory = [dagger, sword];

  useItem(state, 0); // equip dagger
  assert.equal(state.equipped.weapon?.name, 'Dagger');
  useItem(state, 0); // remaining slot is sword
  assert.equal(state.equipped.weapon?.name, 'Longsword');
  assert.equal(state.inventory.length, 1);
  assert.equal(state.inventory[0].name, 'Dagger');
  assert.equal(state.player.attack, PLAYER_BASE_ATTACK + 3);
});

test('descending stairs increments depth and preserves player progression', () => {
  const state = createGame(42, { width: 21, height: 15 });
  state.player.hp = 18;
  state.kills = 3;
  state.turn = 25;
  const sword = createItem(ITEM_TEMPLATES.find((t) => t.id === 'dagger'), -1, -1, 1);
  const potion = createItem(ITEM_TEMPLATES.find((t) => t.id === 'potion_minor'), -1, -1, 2);
  sword.onFloor = false;
  potion.onFloor = false;
  state.inventory = [potion];
  state.equipped.weapon = cloneItem(sword);
  refreshCombatStats(state);

  state.monsters = [];
  state.player.x = state.stairs.x;
  state.player.y = state.stairs.y;

  const next = descendStairs(state);

  assert.equal(next.seed, 42);
  assert.equal(next.depth, 2);
  assert.equal(next.player.hp, 18);
  assert.equal(next.player.maxHp, PLAYER_MAX_HP);
  assert.equal(next.kills, 3);
  assert.equal(next.turn, 25);
  assert.equal(next.inventory.length, 1);
  assert.equal(next.inventory[0].kind, 'potion');
  assert.equal(next.equipped.weapon?.name, 'Dagger');
  assert.equal(next.player.attack, PLAYER_BASE_ATTACK + 1);
  assert.ok(isWalkable(getTile(next, next.player.x, next.player.y)));
  assert.equal(getTile(next, next.stairs.x, next.stairs.y), TILE.STAIRS);
  assert.notEqual(
    `${next.player.x},${next.player.y}`,
    `${state.player.x},${state.player.y}`,
  );
  assert.notEqual(floorSeed(42, 1), floorSeed(42, 2));
  assert.ok(next.messages.some((m) => m.includes('depth 2')));
});

test('new floor from descend is connected and stairs reachable', () => {
  let state = createGame(9, { width: 31, height: 21 });
  for (let d = 1; d <= 4; d++) {
    assert.equal(state.depth, d);
    const analysis = analyzeConnectivity({
      width: state.width,
      height: state.height,
      tiles: state.tiles,
      rooms: state.rooms,
      spawn: { x: state.player.x, y: state.player.y },
      stairs: state.stairs,
    });
    assert.equal(analysis.connected, true, `depth ${d} not connected`);
    assert.equal(analysis.stairsReachable, true, `depth ${d} stairs unreachable`);
    state.monsters = [];
    state.player.x = state.stairs.x;
    state.player.y = state.stairs.y;
    state = descendStairs(state);
  }
  assert.equal(state.depth, 5);
});

test('difficulty scales: deeper floors spawn more/stronger monsters and higher-tier loot', () => {
  const depths = [1, 3, 5];
  /** @type {{ depth: number, monsters: number, avgAtk: number, maxItemTier: number }[]} */
  const stats = [];

  for (const depth of depths) {
    let monsterTotal = 0;
    let atkTotal = 0;
    let monsterCount = 0;
    let maxTier = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const state = createGame(seed, { depth, width: 31, height: 23 });
      monsterTotal += state.monsters.length;
      for (const m of state.monsters) {
        atkTotal += m.attack;
        monsterCount += 1;
      }
      for (const it of state.items) {
        if (it.tier > maxTier) maxTier = it.tier;
      }
    }
    stats.push({
      depth,
      monsters: monsterTotal,
      avgAtk: monsterCount > 0 ? atkTotal / monsterCount : 0,
      maxItemTier: maxTier,
    });
  }

  assert.ok(stats[1].monsters > stats[0].monsters, 'depth 3 should spawn more monsters than depth 1');
  assert.ok(stats[2].monsters >= stats[1].monsters, 'depth 5 should spawn at least as many as depth 3');
  assert.ok(stats[1].avgAtk > stats[0].avgAtk, 'deeper monsters hit harder');
  assert.ok(stats[2].avgAtk >= stats[1].avgAtk);
  assert.ok(stats[0].maxItemTier <= 1);
  assert.ok(stats[2].maxItemTier >= 2);

  const b1 = depthStatBonuses(1);
  const b5 = depthStatBonuses(5);
  assert.equal(b1.hpBonus, 0);
  assert.ok(b5.hpBonus > b1.hpBonus);
  assert.ok(spawnParamsForDepth(5).density > spawnParamsForDepth(1).density);
});

test('inspect exposes depth, combat stats, and equipment', () => {
  const state = createGame(3);
  const info = inspect(state);
  assert.equal(info.depth, 1);
  assert.equal(info.player.attack, PLAYER_BASE_ATTACK);
  assert.equal(info.player.defense, PLAYER_BASE_DEFENSE);
  assert.equal(info.inventoryCount, 0);
  assert.equal(info.equipped.weapon, null);
  assert.equal(info.equipped.armor, null);
});

test('describeItem includes combat / heal numbers', () => {
  const potion = createItem(ITEM_TEMPLATES.find((t) => t.kind === 'potion'), 0, 0, 1);
  const weapon = createItem(ITEM_TEMPLATES.find((t) => t.kind === 'weapon'), 0, 0, 2);
  assert.match(describeItem(potion), /HP/);
  assert.match(describeItem(weapon), /ATK/);
});

test('identical seeds produce identical item layouts at the same depth', () => {
  const a = createGame(222, { depth: 2 });
  const b = createGame(222, { depth: 2 });
  assert.deepEqual(
    a.items.map((it) => ({ kind: it.kind, name: it.name, x: it.x, y: it.y })),
    b.items.map((it) => ({ kind: it.kind, name: it.name, x: it.x, y: it.y })),
  );
  assert.deepEqual(
    a.monsters.map((m) => ({ kind: m.kind, x: m.x, y: m.y, attack: m.attack })),
    b.monsters.map((m) => ({ kind: m.kind, x: m.x, y: m.y, attack: m.attack })),
  );
});

test('spawnMonsters respects depth options on a shared state shape', () => {
  const base = createGame(50);
  const rngA = createRng(999);
  const rngB = createRng(999);
  const stateA = {
    ...base,
    depth: 4,
    rng: rngA,
    player: { ...base.player },
    stairs: { ...base.stairs },
    monsters: [],
  };
  const stateB = {
    ...base,
    depth: 4,
    rng: rngB,
    player: { ...base.player },
    stairs: { ...base.stairs },
    monsters: [],
  };
  const ma = spawnMonsters(stateA, { depth: 4 });
  const mb = spawnMonsters(stateB, { depth: 4 });
  assert.deepEqual(
    ma.map((m) => ({ k: m.kind, x: m.x, y: m.y, atk: m.attack })),
    mb.map((m) => ({ k: m.kind, x: m.x, y: m.y, atk: m.attack })),
  );
  assert.ok(ma.some((m) => m.attack > ARCHETYPES[m.kind].attack || m.maxHp > ARCHETYPES[m.kind].maxHp));
});
