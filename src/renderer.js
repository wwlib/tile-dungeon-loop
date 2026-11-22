import { TILE, VIS } from './tiles.js';
import { countExplored } from './fov.js';

const COLORS = {
  unseen: '#0a0c10',
  floorVisible: '#1a2332',
  floorVisibleAlt: '#16202c',
  floorExplored: '#0f1419',
  floorExploredAlt: '#0c1014',
  wallVisible: '#4a5568',
  wallVisibleEdge: '#2d3748',
  wallExplored: '#2a3038',
  wallExploredEdge: '#1a1f26',
  stairsVisible: '#63b3ed',
  stairsExplored: '#2b6cb0',
  player: '#f6e05e',
  playerOutline: '#744210',
  grid: '#0d1117',
  hpFull: '#48bb78',
  hpLow: '#e53e3e',
  hpBg: '#1a202c',
  overlay: 'rgba(0, 0, 0, 0.62)',
  overlayText: '#f6e05e',
};

/**
 * Draw the tile grid, visible monsters, player, overlays, and HUD.
 * @param {HTMLCanvasElement} canvas
 * @param {import('./game-state.js').GameState} state
 * @param {{ hud?: HTMLElement | null, log?: HTMLElement | null }} [options]
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
      const vis = state.visibility
        ? state.visibility[y * state.width + x]
        : VIS.VISIBLE;
      const px = offsetX + x * tileSize;
      const py = offsetY + y * tileSize;

      if (vis === VIS.UNSEEN) {
        ctx.fillStyle = COLORS.unseen;
        ctx.fillRect(px, py, tileSize, tileSize);
        continue;
      }

      const tile = state.tiles[y * state.width + x];
      const visible = vis === VIS.VISIBLE;

      if (tile === TILE.WALL) {
        ctx.fillStyle = visible ? COLORS.wallVisible : COLORS.wallExplored;
        ctx.fillRect(px, py, tileSize, tileSize);
        ctx.fillStyle = visible ? COLORS.wallVisibleEdge : COLORS.wallExploredEdge;
        ctx.fillRect(px, py, tileSize, Math.max(1, Math.floor(tileSize * 0.15)));
      } else if (tile === TILE.STAIRS) {
        ctx.fillStyle = visible
          ? (x + y) % 2 === 0
            ? COLORS.floorVisible
            : COLORS.floorVisibleAlt
          : (x + y) % 2 === 0
            ? COLORS.floorExplored
            : COLORS.floorExploredAlt;
        ctx.fillRect(px, py, tileSize, tileSize);
        const pad = Math.max(1, Math.floor(tileSize * 0.22));
        ctx.fillStyle = visible ? COLORS.stairsVisible : COLORS.stairsExplored;
        ctx.fillRect(px + pad, py + pad, tileSize - pad * 2, tileSize - pad * 2);
        ctx.strokeStyle = visible ? '#ebf8ff' : '#2c5282';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px + pad, py + tileSize - pad);
        ctx.lineTo(px + tileSize - pad, py + pad);
        ctx.stroke();
        ctx.fillStyle = visible ? '#ebf8ff' : '#63b3ed';
        ctx.font = `bold ${Math.max(8, Math.floor(tileSize * 0.45))}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('>', px + tileSize / 2, py + tileSize / 2);
      } else {
        ctx.fillStyle = visible
          ? (x + y) % 2 === 0
            ? COLORS.floorVisible
            : COLORS.floorVisibleAlt
          : (x + y) % 2 === 0
            ? COLORS.floorExplored
            : COLORS.floorExploredAlt;
        ctx.fillRect(px, py, tileSize, tileSize);
      }
    }
  }

  // Monsters — only while currently in FOV.
  if (state.monsters) {
    for (const monster of state.monsters) {
      if (!monster.alive) continue;
      const vis = state.visibility
        ? state.visibility[monster.y * state.width + monster.x]
        : VIS.VISIBLE;
      if (vis !== VIS.VISIBLE) continue;

      const mx = offsetX + monster.x * tileSize;
      const my = offsetY + monster.y * tileSize;
      const pad = Math.max(1, Math.floor(tileSize * 0.18));

      ctx.fillStyle = monster.color || '#fc8181';
      ctx.font = `bold ${Math.max(10, Math.floor(tileSize * 0.55))}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(
        monster.symbol || '?',
        mx + tileSize / 2,
        my + tileSize / 2 + 1,
      );

      // Tiny HP bar above the glyph.
      const barH = Math.max(2, Math.floor(tileSize * 0.1));
      const barW = tileSize - pad * 2;
      const ratio = monster.maxHp > 0 ? monster.hp / monster.maxHp : 0;
      ctx.fillStyle = COLORS.hpBg;
      ctx.fillRect(mx + pad, my + 1, barW, barH);
      ctx.fillStyle = ratio > 0.35 ? COLORS.hpFull : COLORS.hpLow;
      ctx.fillRect(mx + pad, my + 1, Math.max(0, Math.floor(barW * ratio)), barH);
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

  // Player HP bar under the player glyph.
  if (state.player.maxHp) {
    const barH = Math.max(2, Math.floor(tileSize * 0.12));
    const barW = tileSize - pad * 2;
    const ratio = state.player.hp / state.player.maxHp;
    ctx.fillStyle = COLORS.hpBg;
    ctx.fillRect(ppx + pad, ppy + tileSize - barH - 1, barW, barH);
    ctx.fillStyle = ratio > 0.35 ? COLORS.hpFull : COLORS.hpLow;
    ctx.fillRect(
      ppx + pad,
      ppy + tileSize - barH - 1,
      Math.max(0, Math.floor(barW * ratio)),
      barH,
    );
  }

  if (state.gameOver) {
    ctx.fillStyle = COLORS.overlay;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = COLORS.overlayText;
    ctx.font = 'bold 28px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2 - 14);
    ctx.font = '14px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    ctx.fillStyle = '#e6edf3';
    ctx.fillText('Press R or Enter to restart', canvas.width / 2, canvas.height / 2 + 16);
  }

  if (options.hud) {
    updateHud(options.hud, state);
  }
  if (options.log) {
    updateLog(options.log, state);
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
  const exploredEl = hud.querySelector('[data-hud="explored"]');
  const hpEl = hud.querySelector('[data-hud="hp"]');
  const killsEl = hud.querySelector('[data-hud="kills"]');
  const hpBarFill = hud.querySelector('[data-hud="hp-bar"]');

  if (seedEl) seedEl.textContent = String(state.seed);
  if (posEl) posEl.textContent = `${state.player.x}, ${state.player.y}`;
  if (turnEl) turnEl.textContent = String(state.turn);
  if (exploredEl) {
    exploredEl.textContent = String(countExplored(state.visibility));
  }
  if (hpEl) {
    hpEl.textContent = `${state.player.hp}/${state.player.maxHp}`;
  }
  if (killsEl) killsEl.textContent = String(state.kills ?? 0);
  if (hpBarFill instanceof HTMLElement) {
    const ratio =
      state.player.maxHp > 0
        ? Math.max(0, Math.min(1, state.player.hp / state.player.maxHp))
        : 0;
    hpBarFill.style.width = `${Math.round(ratio * 100)}%`;
    hpBarFill.style.background =
      ratio > 0.35 ? COLORS.hpFull : COLORS.hpLow;
  }
}

/**
 * @param {HTMLElement} logEl
 * @param {import('./game-state.js').GameState} state
 */
export function updateLog(logEl, state) {
  const messages = state.messages ?? [];
  // Show newest last (reading order top→bottom).
  logEl.innerHTML = '';
  const recent = messages.slice(-12);
  for (const msg of recent) {
    const line = document.createElement('div');
    line.className = 'log-line';
    line.textContent = msg;
    logEl.appendChild(line);
  }
  logEl.scrollTop = logEl.scrollHeight;
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
