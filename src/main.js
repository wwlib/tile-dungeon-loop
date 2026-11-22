import { createGame, movePlayer, step, restart } from './game-state.js';
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
const newSeedBtn = document.getElementById('new-seed');
const restartBtn = document.getElementById('restart');

if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('Missing #game canvas');
}

let state = createGame(readSeedFromUrl());
writeSeedToUrl(state.seed);

function redraw() {
  render(canvas, state, { hud });
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

function onKeyDown(event) {
  if (shouldPreventDefault(event)) {
    event.preventDefault();
  }

  const noMod = !event.metaKey && !event.ctrlKey && !event.altKey;

  if (noMod && (event.key === 'r' || event.key === 'R')) {
    restartSameSeed();
    return;
  }

  if (noMod && (event.key === 'n' || event.key === 'N')) {
    startWithSeed(randomSeed());
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

window.addEventListener('keydown', onKeyDown);
redraw();
