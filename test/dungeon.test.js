import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateDungeon,
  analyzeConnectivity,
  isReachable,
  floodFillWalkable,
} from '../src/dungeon.js';
import { TILE, isWalkable } from '../src/tiles.js';
import { getTileAt } from '../src/map.js';

test('identical seeds produce identical dungeons', () => {
  const a = generateDungeon(777);
  const b = generateDungeon(777);
  assert.equal(a.width, b.width);
  assert.equal(a.height, b.height);
  assert.deepEqual(a.tiles, b.tiles);
  assert.deepEqual(a.spawn, b.spawn);
  assert.deepEqual(a.stairs, b.stairs);
  assert.deepEqual(a.rooms, b.rooms);
});

test('different seeds produce different layouts', () => {
  const a = generateDungeon(1);
  const b = generateDungeon(2);
  assert.notDeepEqual(a.tiles, b.tiles);
});

test('dungeon has walkable spawn, stairs tile, and multiple rooms', () => {
  const d = generateDungeon(42);
  assert.ok(d.rooms.length >= 2);
  assert.ok(isWalkable(getTileAt(d, d.spawn.x, d.spawn.y)));
  assert.equal(getTileAt(d, d.stairs.x, d.stairs.y), TILE.STAIRS);
  assert.ok(d.spawn.x !== d.stairs.x || d.spawn.y !== d.stairs.y);
});

test('outer border remains walls', () => {
  const d = generateDungeon(9, { width: 25, height: 19 });
  for (let x = 0; x < d.width; x++) {
    assert.equal(getTileAt(d, x, 0), TILE.WALL);
    assert.equal(getTileAt(d, x, d.height - 1), TILE.WALL);
  }
  for (let y = 0; y < d.height; y++) {
    assert.equal(getTileAt(d, 0, y), TILE.WALL);
    assert.equal(getTileAt(d, d.width - 1, y), TILE.WALL);
  }
});

test('50 seeds: spawn, stairs, full connectivity and solvability', () => {
  const failures = [];
  for (let seed = 1; seed <= 50; seed++) {
    const d = generateDungeon(seed);
    const map = { width: d.width, height: d.height, tiles: d.tiles };

    if (!isWalkable(getTileAt(d, d.spawn.x, d.spawn.y))) {
      failures.push(`seed ${seed}: spawn not walkable`);
      continue;
    }
    if (getTileAt(d, d.stairs.x, d.stairs.y) !== TILE.STAIRS) {
      failures.push(`seed ${seed}: stairs tile missing`);
      continue;
    }

    const analysis = analyzeConnectivity(d);
    if (!analysis.connected) {
      failures.push(
        `seed ${seed}: not fully connected (${analysis.reachable}/${analysis.walkable})`,
      );
    }
    if (!analysis.stairsReachable) {
      failures.push(`seed ${seed}: stairs unreachable from spawn`);
    }

    // Every room center must be reachable from spawn.
    for (let i = 0; i < d.rooms.length; i++) {
      const room = d.rooms[i];
      const cx = room.x + Math.floor(room.w / 2);
      const cy = room.y + Math.floor(room.h / 2);
      if (!isWalkable(getTileAt(d, cx, cy))) continue;
      if (!isReachable(map, d.spawn, { x: cx, y: cy })) {
        failures.push(`seed ${seed}: room ${i} center unreachable`);
      }
    }

    // Flood fill size matches walkable count.
    const filled = floodFillWalkable(map, d.spawn);
    if (filled.size !== analysis.walkable) {
      failures.push(`seed ${seed}: flood ${filled.size} != walkable ${analysis.walkable}`);
    }
  }

  assert.equal(failures.length, 0, failures.join('\n'));
});
