import test from 'node:test';
import assert from 'node:assert/strict';
import { TILE, VIS, blocksSight } from '../src/tiles.js';
import {
  computeFov,
  createVisibilityMap,
  applyFov,
  updateVisibility,
  hasLineOfSight,
  countExplored,
  getVisibility,
} from '../src/fov.js';
import { createGame, movePlayer, getVis } from '../src/game-state.js';

/** Build a tiny hand-crafted map for occlusion tests. */
function corridorMap() {
  // 7x5: player at (1,2), wall at (3,2), open floor beyond at (5,2)
  const width = 7;
  const height = 5;
  const tiles = new Array(width * height).fill(TILE.WALL);
  for (let x = 1; x <= 5; x++) {
    tiles[2 * width + x] = TILE.FLOOR;
  }
  tiles[2 * width + 3] = TILE.WALL; // occluder mid-corridor
  return { width, height, tiles };
}

test('walls block FOV beyond themselves', () => {
  const map = corridorMap();
  const visible = computeFov(map, 1, 2, 10);

  assert.ok(visible.has('1,2'), 'origin visible');
  assert.ok(visible.has('2,2'), 'tile before wall visible');
  assert.ok(visible.has('3,2'), 'wall itself visible when hit');
  assert.equal(visible.has('4,2'), false, 'tile beyond wall hidden');
  assert.equal(visible.has('5,2'), false, 'far tile beyond wall hidden');
});

test('hasLineOfSight reports occlusion', () => {
  const map = corridorMap();
  assert.equal(hasLineOfSight(map, 1, 2, 2, 2), true);
  assert.equal(hasLineOfSight(map, 1, 2, 3, 2), true); // destination can be the wall
  // Path through the wall tile before reaching beyond — blocked
  assert.equal(hasLineOfSight(map, 1, 2, 5, 2), false);
});

test('open room sees tiles within radius', () => {
  const width = 11;
  const height = 11;
  const tiles = new Array(width * height).fill(TILE.FLOOR);
  for (let x = 0; x < width; x++) {
    tiles[x] = TILE.WALL;
    tiles[(height - 1) * width + x] = TILE.WALL;
  }
  for (let y = 0; y < height; y++) {
    tiles[y * width] = TILE.WALL;
    tiles[y * width + width - 1] = TILE.WALL;
  }
  const map = { width, height, tiles };
  const visible = computeFov(map, 5, 5, 3);
  assert.ok(visible.has('5,5'));
  assert.ok(visible.has('5,4'));
  assert.ok(visible.has('4,5'));
  // Outside radius
  assert.equal(visible.has('5,1'), false);
});

test('fog of war: explored memory persists after leaving sight', () => {
  const state = createGame(100, { width: 31, height: 21, fovRadius: 5 });
  const startVis = getVis(state, state.player.x, state.player.y);
  assert.equal(startVis, VIS.VISIBLE);

  // Snapshot a currently visible floor tile that is not the player tile.
  /** @type {{ x: number, y: number } | null} */
  let marked = null;
  for (let y = 0; y < state.height && !marked; y++) {
    for (let x = 0; x < state.width && !marked; x++) {
      if (x === state.player.x && y === state.player.y) continue;
      if (getVis(state, x, y) === VIS.VISIBLE) {
        marked = { x, y };
      }
    }
  }
  assert.ok(marked, 'expected at least one visible neighbor');

  const exploredBefore = countExplored(state.visibility);
  assert.ok(exploredBefore > 1);

  // Walk far enough that the marked tile may fall out of FOV.
  const dx = marked.x >= state.player.x ? -1 : 1;
  for (let i = 0; i < 20; i++) {
    const before = { ...state.player };
    movePlayer(state, dx, 0);
    if (state.player.x === before.x && state.player.y === before.y) {
      movePlayer(state, 0, 1);
    }
  }

  const afterVis = getVis(state, marked.x, marked.y);
  // Either still visible (stuck near it) or explored — never unseen again.
  assert.ok(
    afterVis === VIS.EXPLORED || afterVis === VIS.VISIBLE,
    `expected explored or visible, got ${afterVis}`,
  );
  assert.notEqual(afterVis, VIS.UNSEEN);

  // Explored count is monotonic non-decreasing.
  assert.ok(countExplored(state.visibility) >= exploredBefore);
});

test('applyFov demotes previous visible to explored', () => {
  const vis = createVisibilityMap(5, 5);
  applyFov(vis, 5, 5, new Set(['2,2', '2,3']));
  assert.equal(getVisibility(vis, 5, 2, 2), VIS.VISIBLE);
  applyFov(vis, 5, 5, new Set(['2,2']));
  assert.equal(getVisibility(vis, 5, 2, 2), VIS.VISIBLE);
  assert.equal(getVisibility(vis, 5, 2, 3), VIS.EXPLORED);
  assert.equal(getVisibility(vis, 5, 0, 0), VIS.UNSEEN);
});

test('createGame initializes FOV around spawn', () => {
  const state = createGame(55);
  assert.equal(getVis(state, state.player.x, state.player.y), VIS.VISIBLE);
  assert.ok(countExplored(state.visibility) > 0);
  assert.ok(blocksSight(TILE.WALL));
  assert.equal(blocksSight(TILE.FLOOR), false);
});

test('updateVisibility refreshes current FOV', () => {
  const state = createGame(12, { fovRadius: 4 });
  const px = state.player.x;
  const py = state.player.y;
  // Force all explored then refresh
  state.visibility.fill(VIS.EXPLORED);
  updateVisibility(state);
  assert.equal(getVis(state, px, py), VIS.VISIBLE);
});
