import { TILE, VIS } from './tiles.js';
import { countExplored } from './fov.js';
import { describeItem } from './items.js';

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
  overlayMuted: '#e6edf3',
};

/**
 * Draw the tile grid, items, visible monsters, player, overlays, and HUD.
 * @param {HTMLCanvasElement} canvas
 * @param {import('./game-state.js').GameState} state
 * @param {{
 *   hud?: HTMLElement | null,
 *   log?: HTMLElement | null,
 *   inventory?: HTMLElement | null,
 * }} [options]
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

  // Floor items — visible fully; explored as dim glyphs.
  if (Array.isArray(state.items)) {
    for (const item of state.items) {
      if (!item.onFloor) continue;
      const vis = state.visibility
        ? state.visibility[item.y * state.width + item.x]
        : VIS.VISIBLE;
      if (vis === VIS.UNSEEN) continue;
      drawItem(ctx, offsetX, offsetY, tileSize, item, vis === VIS.VISIBLE);
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
    ctx.fillStyle = COLORS.overlayMuted;
    ctx.fillText('Press R or Enter to restart', canvas.width / 2, canvas.height / 2 + 16);
  }

  if (options.hud) {
    updateHud(options.hud, state);
  }
  if (options.log) {
    updateLog(options.log, state);
  }
  if (options.inventory) {
    updateInventoryPanel(options.inventory, state);
  }
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} offsetX
 * @param {number} offsetY
 * @param {number} tileSize
 * @param {import('./items.js').Item} item
 * @param {boolean} visible
 */
function drawItem(ctx, offsetX, offsetY, tileSize, item, visible) {
  const px = offsetX + item.x * tileSize;
  const py = offsetY + item.y * tileSize;
  const fontSize = Math.max(8, Math.floor(tileSize * 0.62));
  ctx.font = `bold ${fontSize}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.globalAlpha = visible ? 1 : 0.45;
  ctx.fillStyle = item.color || '#e2e8f0';
  ctx.fillText(
    item.glyph || '?',
    px + tileSize / 2,
    py + tileSize / 2 + 1,
  );
  ctx.globalAlpha = 1;
}

/**
 * @param {HTMLElement} hud
 * @param {import('./game-state.js').GameState} state
 */
export function updateHud(hud, state) {
  const root =
    (hud.closest && hud.closest('.layout')) || hud.parentElement || hud;
  const seedEl = root.querySelector('[data-hud="seed"]');
  const depthEl = root.querySelector('[data-hud="depth"]');
  const posEl = root.querySelector('[data-hud="pos"]');
  const turnEl = root.querySelector('[data-hud="turn"]');
  const exploredEl = root.querySelector('[data-hud="explored"]');
  const hpEl = root.querySelector('[data-hud="hp"]');
  const atkEl = root.querySelector('[data-hud="atk"]');
  const defEl = root.querySelector('[data-hud="def"]');
  const weaponEl = root.querySelector('[data-hud="weapon"]');
  const armorEl = root.querySelector('[data-hud="armor"]');
  const killsEl = root.querySelector('[data-hud="kills"]');
  const hpBarFill = root.querySelector('[data-hud="hp-bar"]');
  const descendBtn = root.querySelector('#descend');

  if (seedEl) seedEl.textContent = String(state.seed);
  if (depthEl) depthEl.textContent = String(state.depth ?? 1);
  if (posEl) posEl.textContent = `${state.player.x}, ${state.player.y}`;
  if (turnEl) turnEl.textContent = String(state.turn);
  if (exploredEl) {
    exploredEl.textContent = String(countExplored(state.visibility));
  }
  if (hpEl) {
    hpEl.textContent = `${state.player.hp}/${state.player.maxHp}`;
  }
  if (atkEl) atkEl.textContent = String(state.player.attack);
  if (defEl) defEl.textContent = String(state.player.defense);
  if (weaponEl) {
    weaponEl.textContent = state.equipped?.weapon
      ? describeItem(state.equipped.weapon)
      : '—';
  }
  if (armorEl) {
    armorEl.textContent = state.equipped?.armor
      ? describeItem(state.equipped.armor)
      : '—';
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
    hpBarFill.classList.toggle('low', ratio <= 0.35);
  }

  const onStairs =
    state.player.x === state.stairs.x && state.player.y === state.stairs.y;
  if (descendBtn instanceof HTMLButtonElement) {
    descendBtn.disabled = state.gameOver || !onStairs;
  }

  hud.classList.toggle('game-over', Boolean(state.gameOver));
  hud.classList.toggle('on-stairs', onStairs && !state.gameOver);
}

/**
 * Clickable inventory panel (slots 1–9).
 * @param {HTMLElement} panel
 * @param {import('./game-state.js').GameState} state
 */
export function updateInventoryPanel(panel, state) {
  const list = state.inventory ?? [];
  const rows = [];
  for (let i = 0; i < 9; i++) {
    const item = list[i];
    const label = item ? describeItem(item) : 'empty';
    const kind = item?.kind ?? 'empty';
    const disabled = state.gameOver || !item;
    rows.push(
      `<button type="button" class="inv-slot" data-inv-index="${i}" data-kind="${kind}" ${
        disabled ? 'disabled' : ''
      } title="${item ? `Use / equip slot ${i + 1}` : `Empty slot ${i + 1}`}">` +
        `<span class="inv-key">${i + 1}</span>` +
        `<span class="inv-name">${escapeHtml(label)}</span>` +
        `</button>`,
    );
  }
  panel.innerHTML = rows.join('');
}

/**
 * @param {HTMLElement} logEl
 * @param {import('./game-state.js').GameState} state
 */
export function updateLog(logEl, state) {
  const messages = state.messages ?? [];
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

/** @param {string} s */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
    event.code === 'Space' ||
    event.key === '>' ||
    event.key === '.'
  );
}
