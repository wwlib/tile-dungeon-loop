import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame,
  movePlayer,
  step,
  getTile,
  inspect,
  TILE,
  isWalkable,
} from '../src/game-state.js';
import { createArenaMap, getTileAt } from '../src/map.js';

test('pure game-state imports without DOM globals', () => {
  assert.equal(typeof globalThis.document, 'undefined');
  assert.equal(typeof globalThis.window, 'undefined');
  assert.equal(typeof globalThis.HTMLCanvasElement, 'undefined');
  const state = createGame(1);
  assert.ok(state.width > 0 && state.height > 0);
  assert.equal(typeof state.player.x, 'number');
  assert.equal(typeof state.player.y, 'number');
});

test('createArenaMap is walled with interior floors and pillars', () => {
  const map = createArenaMap(11, 9);
  assert.equal(map.width, 11);
  assert.equal(map.height, 9);
  assert.equal(map.tiles.length, 11 * 9);

  for (let x = 0; x < map.width; x++) {
    assert.equal(getTileAt(map, x, 0), TILE.WALL);
    assert.equal(getTileAt(map, x, map.height - 1), TILE.WALL);
  }
  for (let y = 0; y < map.height; y++) {
    assert.equal(getTileAt(map, 0, y), TILE.WALL);
    assert.equal(getTileAt(map, map.width - 1, y), TILE.WALL);
  }

  let floors = 0;
  let interiorWalls = 0;
  for (let y = 1; y < map.height - 1; y++) {
    for (let x = 1; x < map.width - 1; x++) {
      const t = getTileAt(map, x, y);
      if (t === TILE.FLOOR) floors++;
      if (t === TILE.WALL) interiorWalls++;
    }
  }
  assert.ok(floors > 0);
  assert.ok(interiorWalls > 0);
  assert.equal(getTileAt(map, -1, 0), TILE.WALL);
});

test('createGame places player on walkable tile and exposes inspect helpers', () => {
  const state = createGame(42);
  assert.equal(state.seed, 42);
  assert.equal(state.turn, 0);
  assert.ok(isWalkable(getTile(state, state.player.x, state.player.y)));
  assert.equal(getTile(state, state.stairs.x, state.stairs.y), TILE.STAIRS);
  assert.ok(state.visibility instanceof Uint8Array);
  const info = inspect(state);
  assert.equal(info.player.x, state.player.x);
  assert.equal(info.player.y, state.player.y);
  assert.equal(info.turn, 0);
  assert.equal(info.seed, 42);
  assert.equal(info.width, state.width);
  assert.equal(info.height, state.height);
  assert.equal(info.stairs.x, state.stairs.x);
  assert.equal(info.stairs.y, state.stairs.y);
  assert.ok(info.explored > 0);
});

test('player moves in all four cardinal directions', () => {
  const state = createGame(1, { width: 21, height: 15 });
  const ox = 5;
  const oy = 5;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      state.tiles[(oy + dy) * state.width + (ox + dx)] = TILE.FLOOR;
    }
  }
  state.player.x = ox;
  state.player.y = oy;
  state.turn = 0;

  movePlayer(state, 0, -1);
  assert.equal(state.player.x, ox);
  assert.equal(state.player.y, oy - 1);
  assert.equal(state.turn, 1);

  movePlayer(state, 0, 1);
  assert.equal(state.player.x, ox);
  assert.equal(state.player.y, oy);
  assert.equal(state.turn, 2);

  movePlayer(state, -1, 0);
  assert.equal(state.player.x, ox - 1);
  assert.equal(state.player.y, oy);
  assert.equal(state.turn, 3);

  movePlayer(state, 1, 0);
  assert.equal(state.player.x, ox);
  assert.equal(state.player.y, oy);
  assert.equal(state.turn, 4);
});

test('wall collision blocks movement; turn still advances', () => {
  const state = createGame(1);
  state.tiles[5 * state.width + 1] = TILE.FLOOR;
  state.player.x = 1;
  state.player.y = 5;
  const before = { x: state.player.x, y: state.player.y };
  movePlayer(state, -1, 0);
  assert.equal(state.player.x, before.x);
  assert.equal(state.player.y, before.y);
  assert.equal(state.turn, 1);

  let found = false;
  for (let y = 1; y < state.height - 1 && !found; y++) {
    for (let x = 1; x < state.width - 1 && !found; x++) {
      if (getTile(state, x, y) !== TILE.FLOOR) continue;
      if (getTile(state, x + 1, y) === TILE.WALL) {
        state.player.x = x;
        state.player.y = y;
        const pos = { x, y };
        movePlayer(state, 1, 0);
        assert.equal(state.player.x, pos.x);
        assert.equal(state.player.y, pos.y);
        found = true;
      }
    }
  }
  assert.ok(found, 'expected an interior wall adjacent to floor');
});

test('bounds safety: out-of-bounds moves do not escape the map', () => {
  const state = createGame(1, { width: 9, height: 7 });
  state.tiles[1 * state.width + 1] = TILE.FLOOR;
  state.player.x = 1;
  state.player.y = 1;

  movePlayer(state, -10, -10);
  assert.ok(state.player.x >= 0 && state.player.x < state.width);
  assert.ok(state.player.y >= 0 && state.player.y < state.height);
  assert.equal(state.player.x, 1);
  assert.equal(state.player.y, 1);
});

test('step(move) and step(wait) drive the same rules', () => {
  const state = createGame(1, { width: 11, height: 9 });
  const ox = 3;
  const oy = 3;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      state.tiles[(oy + dy) * state.width + (ox + dx)] = TILE.FLOOR;
    }
  }
  state.player.x = ox;
  state.player.y = oy;
  state.turn = 0;

  step(state, { type: 'move', dx: 1, dy: 0 });
  assert.equal(state.player.x, ox + 1);
  assert.equal(state.turn, 1);

  step(state, { type: 'wait' });
  assert.equal(state.player.x, ox + 1);
  assert.equal(state.turn, 2);
});
