# Tile Dungeon

A browser-playable tile-based dungeon roguelike built with plain Node.js and HTML5 Canvas, with zero runtime dependencies. Created as an autonomous multi-milestone stress test for [AgentFleet (`aflt`)](https://github.com/wwlib/aflt). This checkout is the `aflt loop` rebuild used to compare against the original flat-run repo `~/github/wwlib/tile-dungeon`.

## Quick Start

```bash
npm start
```

Open `http://127.0.0.1:8792` (or `http://<lan-ip>:8792` on the local network).

> **Port note:** The server binds `0.0.0.0` on port `8792` by default (configurable via `PORT=...`) because ports `8790` and `8791` are already in use on this host (`8791` is the original tile-dungeon baseline).

## Testing

```bash
npm test
```

Uses Node's built-in `node:test` runner against headless tests in `test/`.

## Architecture

- `server.js` — minimal Node HTTP static server (`0.0.0.0`, default port `8792`) serving `public/`, `src/`, and `/health`.
- `public/index.html` — browser entry point hosting the `<canvas>` and HUD.
- `src/` — native ES modules shared directly between the browser and Node tests:
  - Pure deterministic RNG and game-state logic (map grid, generation, FOV, entities, combat, inventory, stairs) kept separate from DOM/canvas rendering.
  - Canvas renderer and keyboard input adapter in the browser entry module(s).
- `test/` — headless `node:test` suites covering game rules, seed determinism, solvability, combat, items, and evaluation.
- `scripts/eval/` — headless bot player and deterministic quality/balance evaluator (added in M5).
- `.agentfleet.json` — registers `tile-dungeon` as an `aflt` project (`{"project": "tile-dungeon"}`).

## Milestone Plan

- **M1 — Core Grid & Movement:** Seeded RNG, pure game-state module separate from rendering, canvas tile map, keyboard movement, wall collision, headless state tests.
- **M2 — Procedural Dungeon & FOV:** Deterministic rooms-and-corridors or BSP generation, field of view and fog of war, multi-seed solvability/connectivity tests.
- **M3 — Monsters & Turn-Based Combat:** Monster AI, turn-based melee combat, HP, message log, death and restart, headless combat tests.
- **M4 — Items, Inventory & Deeper Levels:** Potions, weapons/armor, inventory UI, stairs down, depth-based difficulty scaling, headless progression tests.
- **M5 — Headless Bot & Eval Loop:** `scripts/eval/` bot playing N seeded runs, scoring crash-free rate, solvability, average depth, turns survived, and balance sanity, followed by autonomous improvement rounds until score plateau.
