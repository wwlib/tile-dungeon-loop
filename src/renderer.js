import { TILE } from './tiles.js';

const COLORS = {
  floor: '#1a2332',
  floorAlt: '#16202c',
  wall: '#4a5568',
  wallEdge: '#2d3748',
  player: '#f6e05e',
  playerOutline: '#744210',
  grid: '#0d1117',
};

/**
 * Draw the tile grid and player onto an HTML5 canvas.
 * @param {HTMLCanvasElement} canvas
 * @param {import('./game-state.js').GameState} state
 * @param {{ hud?: HTMLElement | null }} [options]
 */
export function render(canvas, state, options = {}) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const tileSize = Math.floor(
    Math.min(canvas.width / state.width, canvas.height / state.height),
  );
  const offsetX = Math.floor((canvas.width - state.width * tileSize) / 2);
  const offsetY = Math.floor((canvas.height - state.height * tileSize) / 2);

  ctx.fillStyle = COLORS.grid;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      const tile = state.tiles[y * state.width + x];
      const px = offsetX + x * tileSize;
      const py = offsetY + y * tileSize;

      if (tile === TILE.WALL) {
        ctx.fillStyle = COLORS.wall;
        ctx.fillRect(px, py, tileSize, tileSize);
        ctx.fillStyle = COLORS.wallEdge;
        ctx.fillRect(px, py, tileSize, Math.max(1, Math.floor(tileSize * 0.15)));
      } else {
        ctx.fillStyle = (x + y) % 2 === 0 ? COLORS.floor : COLORS.floorAlt;
        ctx.fillRect(px, py, tileSize, tileSize);
      }
    }
  }

  const ppx = offsetX + state.player.x * tileSize;
  const ppy = offsetY + state.player.y * tileSize;
  const pad = Math.max(1, Math.floor(tileSize * 0.18));
  ctx.fillStyle = COLORS.playerOutline;
  ctx.fillRect(
    ppx + pad - 1,
    ppy + pad - 1,
    tileSize - pad * 2 + 2,
    tileSize - pad * 2 + 2,
  );
  ctx.fillStyle = COLORS.player;
  ctx.fillRect(ppx + pad, ppy + pad, tileSize - pad * 2, tileSize - pad * 2);

  if (options.hud) {
    updateHud(options.hud, state);
  }
}

/**
 * @param {HTMLElement} hud
 * @param {import('./game-state.js').GameState} state
 */
export function updateHud(hud, state) {
  const seedEl = hud.querySelector('[data-hud="seed"]');
  const posEl = hud.querySelector('[data-hud="pos"]');
  const turnEl = hud.querySelector('[data-hud="turn"]');

  if (seedEl) seedEl.textContent = String(state.seed);
  if (posEl) posEl.textContent = `${state.player.x}, ${state.player.y}`;
  if (turnEl) turnEl.textContent = String(state.turn);
}

/**
 * Map a KeyboardEvent to a move delta, or null if not a movement key.
 * @param {KeyboardEvent} event
 * @returns {{ dx: number, dy: number } | null}
 */
export function keyToDelta(event) {
  switch (event.key) {
    case 'ArrowUp':
    case 'w':
    case 'W':
      return { dx: 0, dy: -1 };
    case 'ArrowDown':
    case 's':
    case 'S':
      return { dx: 0, dy: 1 };
    case 'ArrowLeft':
    case 'a':
    case 'A':
      return { dx: -1, dy: 0 };
    case 'ArrowRight':
    case 'd':
    case 'D':
      return { dx: 1, dy: 0 };
    default:
      return null;
  }
}

/**
 * Whether the key should have its default browser action prevented
 * (page scroll on arrows / space).
 * @param {KeyboardEvent} event
 */
export function shouldPreventDefault(event) {
  return (
    event.key === 'ArrowUp' ||
    event.key === 'ArrowDown' ||
    event.key === 'ArrowLeft' ||
    event.key === 'ArrowRight' ||
    event.key === ' ' ||
    event.code === 'Space'
  );
}
