import {
  createGame,
  movePlayer,
  step,
  restart,
  useItem,
  pickupItem,
  drinkBestPotion,
  descendStairs,
  isOnStairs,
} from './game-state.js';
import { createRng } from './rng.js';
import { render, keyToDelta, shouldPreventDefault } from './renderer.js';

const DEFAULT_SEED = 42;

function readSeedFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('seed');
    if (raw == null || raw === '') return DEFAULT_SEED;
    const n = Number(raw);
    return Number.isFinite(n) ? n : DEFAULT_SEED;
  } catch {
    return DEFAULT_SEED;
  }
}

function writeSeedToUrl(seed) {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set('seed', String(seed));
    window.history.replaceState({}, '', url);
  } catch {
    // ignore (file:// or restricted history)
  }
}

function randomSeed() {
  return createRng(Date.now() ^ (Math.floor(Math.random() * 0xffffffff) >>> 0)).next();
}

const canvas = document.getElementById('game');
const hud = document.getElementById('hud');
const logEl = document.getElementById('message-log');
const invEl = document.getElementById('inventory');
const newSeedBtn = document.getElementById('new-seed');
const restartBtn = document.getElementById('restart');
const descendBtn = document.getElementById('descend');

if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('Missing #game canvas');
}

let state = createGame(readSeedFromUrl());
writeSeedToUrl(state.seed);

function redraw() {
  render(canvas, state, { hud, log: logEl, inventory: invEl });
}

function startWithSeed(seed) {
  state = createGame(seed);
  writeSeedToUrl(state.seed);
  redraw();
}

function restartSameSeed() {
  state = restart(state);
  writeSeedToUrl(state.seed);
  redraw();
}

function tryDescend() {
  if (state.gameOver) return;
  if (!isOnStairs(state)) return;
  state = descendStairs(state);
  redraw();
}

function onKeyDown(event) {
  if (shouldPreventDefault(event)) {
    event.preventDefault();
  }

  const noMod = !event.metaKey && !event.ctrlKey && !event.altKey;

  if (noMod && (event.key === 'r' || event.key === 'R')) {
    restartSameSeed();
    return;
  }

  if (noMod && event.key === 'Enter') {
    if (state.gameOver) {
      restartSameSeed();
      return;
    }
    if (isOnStairs(state)) {
      tryDescend();
      return;
    }
    restartSameSeed();
    return;
  }

  if (noMod && (event.key === '>' || (event.key === '.' && event.shiftKey))) {
    tryDescend();
    return;
  }

  if (noMod && (event.key === 'n' || event.key === 'N')) {
    startWithSeed(randomSeed());
    return;
  }

  if (state.gameOver) return;

  if (noMod && event.key >= '1' && event.key <= '9') {
    const index = Number(event.key) - 1;
    useItem(state, index);
    redraw();
    return;
  }

  if (noMod && (event.key === 'h' || event.key === 'H')) {
    drinkBestPotion(state);
    redraw();
    return;
  }

  if (noMod && (event.key === 'g' || event.key === 'G')) {
    pickupItem(state);
    redraw();
    return;
  }

  const delta = keyToDelta(event);
  if (delta) {
    movePlayer(state, delta.dx, delta.dy);
    redraw();
    return;
  }

  if (event.key === ' ' || event.code === 'Space') {
    step(state, { type: 'wait' });
    redraw();
  }
}

if (newSeedBtn) {
  newSeedBtn.addEventListener('click', () => {
    startWithSeed(randomSeed());
  });
}

if (restartBtn) {
  restartBtn.addEventListener('click', () => {
    restartSameSeed();
  });
}

if (descendBtn) {
  descendBtn.addEventListener('click', () => {
    tryDescend();
  });
}

if (invEl) {
  invEl.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const btn = target.closest('[data-inv-index]');
    if (!(btn instanceof HTMLElement)) return;
    if (btn.hasAttribute('disabled')) return;
    const index = Number(btn.getAttribute('data-inv-index'));
    if (!Number.isFinite(index)) return;
    useItem(state, index);
    redraw();
  });
}

window.addEventListener('keydown', onKeyDown);
redraw();
