import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame,
  movePlayer,
  step,
  restart,
  inspect,
  calcDamage,
  pushMessage,
  runMonsterTurns,
  TILE,
  isWalkable,
  MESSAGE_LOG_LIMIT,
  PLAYER_BASE_DEFENSE,
  PLAYER_BASE_ATTACK,
} from '../src/game-state.js';
import {
  ARCHETYPES,
  createMonster,
  spawnMonsters,
  spawnTableForDepth,
  monsterAt,
  chooseChaseStep,
  canMonsterOccupy,
  chebyshev,
} from '../src/monsters.js';
import { createRng } from '../src/rng.js';

/** Open a small floor pad around (x,y) for scripted combat setups. */
function clearPad(state, x, y, radius = 2) {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const tx = x + dx;
      const ty = y + dy;
      if (tx <= 0 || ty <= 0 || tx >= state.width - 1 || ty >= state.height - 1) {
        continue;
      }
      state.tiles[ty * state.width + tx] = TILE.FLOOR;
    }
  }
}

test('identical seeds spawn identical monster layouts', () => {
  const a = createGame(4242);
  const b = createGame(4242);
  assert.equal(a.monsters.length, b.monsters.length);
  assert.ok(a.monsters.length > 0, 'expected at least one monster');
  for (let i = 0; i < a.monsters.length; i++) {
    assert.equal(a.monsters[i].kind, b.monsters[i].kind);
    assert.equal(a.monsters[i].x, b.monsters[i].x);
    assert.equal(a.monsters[i].y, b.monsters[i].y);
    assert.equal(a.monsters[i].maxHp, b.monsters[i].maxHp);
  }
});

test('monsters do not overlap walls, player, stairs, or each other', () => {
  for (const seed of [1, 7, 42, 99, 1234]) {
    const state = createGame(seed);
    const seen = new Set();
    for (const m of state.monsters) {
      assert.ok(m.alive);
      assert.ok(isWalkable(state.tiles[m.y * state.width + m.x]), `wall overlap seed=${seed}`);
      assert.ok(!(m.x === state.player.x && m.y === state.player.y), 'player overlap');
      assert.ok(!(m.x === state.stairs.x && m.y === state.stairs.y), 'stairs overlap');
      const key = `${m.x},${m.y}`;
      assert.equal(seen.has(key), false, `monster stack at ${key}`);
      seen.add(key);
      // Spawn room (rooms[0]) should be empty of monsters.
      const spawnRoom = state.rooms[0];
      const inSpawn =
        m.x >= spawnRoom.x &&
        m.x < spawnRoom.x + spawnRoom.w &&
        m.y >= spawnRoom.y &&
        m.y < spawnRoom.y + spawnRoom.h;
      assert.equal(inSpawn, false, `monster in spawn room seed=${seed}`);
    }
  }
});

test('spawnMonsters is deterministic given the same rng stream', () => {
  const base = createGame(50);
  const rngA = createRng(999);
  const rngB = createRng(999);
  const stateA = {
    ...base,
    rng: rngA,
    player: { ...base.player },
    stairs: { ...base.stairs },
    monsters: [],
  };
  const stateB = {
    ...base,
    rng: rngB,
    player: { ...base.player },
    stairs: { ...base.stairs },
    monsters: [],
  };
  const ma = spawnMonsters(stateA);
  const mb = spawnMonsters(stateB);
  assert.deepEqual(
    ma.map((m) => ({ k: m.kind, x: m.x, y: m.y })),
    mb.map((m) => ({ k: m.kind, x: m.x, y: m.y })),
  );
});

test('depth 1 spawn table excludes orcs; orcs appear from depth 2+', () => {
  assert.equal(spawnTableForDepth(1).includes('orc'), false);
  assert.ok(spawnTableForDepth(1).includes('goblin'));
  assert.ok(spawnTableForDepth(1).includes('slime'));
  assert.ok(spawnTableForDepth(2).includes('orc'));
  assert.ok(spawnTableForDepth(3).includes('orc'));

  for (const seed of [1, 2, 3, 7, 10, 13, 18, 42, 99, 1234]) {
    const d1 = createGame(seed);
    assert.ok(
      d1.monsters.every((m) => m.kind !== 'orc'),
      `depth-1 orc on seed ${seed}`,
    );
  }

  // Depth 2+ must be able to spawn orcs across a multi-seed sweep.
  let sawOrc = false;
  for (let seed = 1; seed <= 40; seed++) {
    const deep = createGame(seed, { depth: 2 });
    if (deep.monsters.some((m) => m.kind === 'orc')) {
      sawOrc = true;
      break;
    }
  }
  assert.equal(sawOrc, true, 'expected at least one depth-2 orc across seeds');
});

test('bumping a monster attacks instead of moving; HP drops; death removes it', () => {
  const state = createGame(1, { width: 21, height: 15 });
  state.monsters = [];
  clearPad(state, 5, 5);
  state.player.x = 5;
  state.player.y = 5;
  state.player.hp = state.player.maxHp;
  state.turn = 0;
  state.messages = [];

  const goblin = createMonster(ARCHETYPES.goblin, 6, 5, 1);
  goblin.hp = 4;
  goblin.maxHp = 4;
  state.monsters.push(goblin);

  const beforeHp = goblin.hp;
  movePlayer(state, 1, 0);

  assert.equal(state.player.x, 5, 'player stays put when bumping');
  assert.equal(state.player.y, 5);
  assert.equal(state.turn, 1);
  assert.ok(goblin.hp < beforeHp, 'monster took damage');
  assert.ok(state.messages.some((m) => /hit the Goblin/i.test(m)));

  // Finish it off.
  while (goblin.alive) {
    movePlayer(state, 1, 0);
  }
  assert.equal(goblin.alive, false);
  assert.equal(goblin.hp, 0);
  assert.equal(state.kills, 1);
  assert.ok(state.messages.some((m) => /kill the Goblin/i.test(m)));
  assert.equal(monsterAt(state.monsters, 6, 5), null);

  // Tile is now free to walk onto.
  movePlayer(state, 1, 0);
  assert.equal(state.player.x, 6);
  assert.equal(state.player.y, 5);
});

test('adjacent monster damages the player on the monster turn', () => {
  const state = createGame(2, { width: 21, height: 15 });
  state.monsters = [];
  clearPad(state, 5, 5);
  state.player.x = 5;
  state.player.y = 5;
  state.player.hp = 20;
  state.player.defense = 0;
  state.turn = 0;
  state.messages = [];

  const slime = createMonster(ARCHETYPES.slime, 6, 5, 1);
  state.monsters.push(slime);

  const hpBefore = state.player.hp;
  // Wait — player does nothing; adjacent slime attacks.
  step(state, { type: 'wait' });
  assert.equal(state.turn, 1);
  assert.ok(state.player.hp < hpBefore, 'player took damage');
  assert.ok(state.messages.some((m) => /Slime hits you/i.test(m)));
});

test('calcDamage never goes negative; equal stats miss', () => {
  assert.equal(calcDamage({ attack: 3 }, { defense: 1 }), 2);
  assert.equal(calcDamage({ attack: 2 }, { defense: 2 }), 0);
  assert.equal(calcDamage({ attack: 1 }, { defense: 5 }), 0);
});

test('player starts with base DEF 1 so weak hits glance and orcs hit softer', () => {
  assert.equal(PLAYER_BASE_DEFENSE, 1);
  const state = createGame(11);
  assert.equal(state.player.defense, PLAYER_BASE_DEFENSE);
  assert.equal(state.player.attack, PLAYER_BASE_ATTACK);

  // Slimes / bats (atk 1) glance off bare defense; goblins still chip for 1.
  assert.equal(calcDamage({ attack: 1 }, state.player), 0);
  assert.equal(calcDamage({ attack: 2 }, state.player), 1);
  // Depth-2 orc (atk 4) deals 3 instead of 4 — the main early-death softener.
  assert.equal(calcDamage({ attack: 4 }, state.player), 3);
  assert.equal(
    calcDamage({ attack: 4 }, { defense: 0 }),
    4,
    'without base DEF, orcs still deal full 4',
  );
});

test('monster AI chases when within aggro and is blocked by walls/monsters', () => {
  const state = createGame(3, { width: 21, height: 15 });
  state.monsters = [];
  clearPad(state, 8, 8, 4);
  state.player.x = 8;
  state.player.y = 8;

  const goblin = createMonster(ARCHETYPES.goblin, 12, 8, 1);
  state.monsters.push(goblin);

  assert.ok(chebyshev(goblin, state.player) <= goblin.aggroRange);
  const step1 = chooseChaseStep(state, goblin);
  assert.ok(step1);
  assert.equal(step1.dx, -1);
  assert.equal(step1.dy, 0);

  // Wall directly toward the player.
  state.tiles[8 * state.width + 11] = TILE.WALL;
  const blocked = chooseChaseStep(state, goblin);
  // Should pick an alternate axis or still find a detour; must not step into the wall.
  if (blocked) {
    const nx = goblin.x + blocked.dx;
    const ny = goblin.y + blocked.dy;
    assert.ok(canMonsterOccupy(state, nx, ny, goblin));
  }

  // Another monster occupies the preferred tile — cannot stack.
  state.tiles[8 * state.width + 11] = TILE.FLOOR;
  const blocker = createMonster(ARCHETYPES.bat, 11, 8, 2);
  state.monsters.push(blocker);
  assert.equal(canMonsterOccupy(state, 11, 8, goblin), false);

  // Run AI: goblin should move closer over a few turns.
  state.monsters = [goblin];
  const startDist = chebyshev(goblin, state.player);
  for (let i = 0; i < 5; i++) {
    step(state, { type: 'wait' });
  }
  assert.ok(
    chebyshev(goblin, state.player) < startDist || chebyshev(goblin, state.player) <= 1,
    'goblin should close distance while aggroed',
  );
});

test('message log is bounded and records combat events', () => {
  const state = createGame(4);
  state.messages = [];
  for (let i = 0; i < MESSAGE_LOG_LIMIT + 10; i++) {
    pushMessage(state, `msg-${i}`);
  }
  assert.equal(state.messages.length, MESSAGE_LOG_LIMIT);
  assert.equal(state.messages[0], 'msg-10');
  assert.equal(state.messages[state.messages.length - 1], `msg-${MESSAGE_LOG_LIMIT + 9}`);
});

test('player death sets gameOver and blocks further actions', () => {
  const state = createGame(5, { width: 21, height: 15 });
  state.monsters = [];
  clearPad(state, 5, 5);
  state.player.x = 5;
  state.player.y = 5;
  state.player.hp = 2;
  state.player.defense = 0;
  state.messages = [];
  state.gameOver = false;

  const orc = createMonster(ARCHETYPES.orc, 6, 5, 1);
  state.monsters.push(orc);

  // Orc attack is 4 — one adjacent monster turn kills the player.
  step(state, { type: 'wait' });
  assert.equal(state.gameOver, true);
  assert.equal(state.player.hp, 0);
  assert.ok(state.messages.some((m) => /You die/i.test(m)));

  const turnAtDeath = state.turn;
  const pos = { x: state.player.x, y: state.player.y };
  movePlayer(state, -1, 0);
  step(state, { type: 'wait' });
  assert.equal(state.turn, turnAtDeath);
  assert.equal(state.player.x, pos.x);
  assert.equal(state.player.y, pos.y);
  assert.equal(orc.x, 6, 'monsters freeze after game over');
});

test('restart restores a clean initial state for the same seed', () => {
  const state = createGame(88);
  const snapshot = {
    monsters: state.monsters.map((m) => ({
      kind: m.kind,
      x: m.x,
      y: m.y,
      hp: m.hp,
    })),
    player: { x: state.player.x, y: state.player.y, maxHp: state.player.maxHp },
  };

  // Mutate heavily.
  state.player.hp = 1;
  state.kills = 9;
  state.gameOver = true;
  state.turn = 50;
  state.messages.push('extra');
  if (state.monsters[0]) {
    state.monsters[0].alive = false;
    state.monsters[0].hp = 0;
  }
  movePlayer(state, 1, 0); // no-op while dead

  const fresh = restart(state);
  assert.equal(fresh.seed, 88);
  assert.equal(fresh.turn, 0);
  assert.equal(fresh.gameOver, false);
  assert.equal(fresh.kills, 0);
  assert.equal(fresh.player.hp, fresh.player.maxHp);
  assert.equal(fresh.player.x, snapshot.player.x);
  assert.equal(fresh.player.y, snapshot.player.y);
  assert.equal(fresh.monsters.length, snapshot.monsters.length);
  for (let i = 0; i < fresh.monsters.length; i++) {
    assert.equal(fresh.monsters[i].kind, snapshot.monsters[i].kind);
    assert.equal(fresh.monsters[i].x, snapshot.monsters[i].x);
    assert.equal(fresh.monsters[i].y, snapshot.monsters[i].y);
    assert.equal(fresh.monsters[i].hp, fresh.monsters[i].maxHp);
    assert.equal(fresh.monsters[i].alive, true);
  }
  assert.ok(fresh.messages.length >= 1);
  assert.ok(fresh.messages[0].includes('Welcome'));
});

test('inspect exposes combat fields', () => {
  const state = createGame(11);
  const info = inspect(state);
  assert.equal(info.player.hp, state.player.maxHp);
  assert.equal(info.player.maxHp, state.player.maxHp);
  assert.equal(info.kills, 0);
  assert.equal(info.gameOver, false);
  assert.equal(info.monsterCount, state.monsters.filter((m) => m.alive).length);
});

test('runMonsterTurns skips dead monsters', () => {
  const state = createGame(6, { width: 15, height: 11 });
  state.monsters = [];
  clearPad(state, 4, 4);
  state.player.x = 4;
  state.player.y = 4;
  const dead = createMonster(ARCHETYPES.bat, 5, 4, 1);
  dead.alive = false;
  dead.hp = 0;
  state.monsters.push(dead);
  const hp = state.player.hp;
  runMonsterTurns(state);
  assert.equal(state.player.hp, hp);
});
