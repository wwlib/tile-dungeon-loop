# Tile Dungeon

A browser-playable tile-based dungeon roguelike built with plain Node.js and HTML5 Canvas, with zero runtime dependencies. Created as an autonomous multi-milestone stress test for [AgentFleet (`aflt`)](https://github.com/wwlib/aflt). This checkout is the `aflt loop` rebuild used to compare against the original flat-run repo `~/github/wwlib/tile-dungeon`.

## Quick Start

```bash
npm start
```

Open `http://127.0.0.1:8792` (or `http://<lan-ip>:8792` on the local network). Optional query: `?seed=42`.

> **Port note:** The server binds `0.0.0.0` on port `8792` by default (configurable via `PORT=...`) because ports `8790` and `8791` are already in use on this host (`8791` is the original tile-dungeon baseline).

## Controls (M4)

| Input | Action |
| --- | --- |
| Arrow keys / WASD | Move one tile (walls block; bump a monster to attack; auto-pick up items) |
| Space | Wait one turn (monsters still act) |
| 1–9 | Use / equip inventory slot (drink potion or equip weapon/armor) |
| H | Drink the best healing potion in inventory |
| G | Pick up an item underfoot (if inventory was full earlier) |
| `>` / Enter on stairs or **Descend** | Go down to the next depth |
| R or **Restart** | Restart the current seed at depth 1 |
| N or **New Seed** | Start a new random seed |

HUD shows **seed**, **depth**, **HP** (with bar), **ATK**, **DEF**, **player position**, **turn**, **kills**, and **explored** tile count. The sidebar lists **equipped weapon/armor** and a clickable **inventory** (slots 1–9). A message log under the canvas records combat, loot, descent, and death. Unseen tiles are hidden; explored tiles are dim; currently visible tiles are bright. Monsters render only while in FOV (with tiny HP bars). Items show as glyphs when seen (faint on explored). Stairs appear as a blue `>` when seen. On death, a Game Over overlay appears and actions freeze until restart.

Deeper floors scale monster count/strength and unlock higher-tier potions, weapons, and armor. Descending preserves HP, inventory, equipment, kills, and turn count.

## Testing

```bash
npm test
```

Uses Node's built-in `node:test` runner against headless tests in `test/` (`smoke`, `rng`, `game-state`, `dungeon`, `fov`, `combat`, `items`, `eval`).

## Headless Eval (M5a)

```bash
npm run eval
# equivalent: node scripts/eval/eval.js --json
node scripts/eval/eval.js --json --seeds 20 --write
```

- `scripts/eval/bot.js` — deterministic headless bot (BFS explore, combat, heal, equip, descend).
- `scripts/eval/scorer.js` — pure 0–100 metrics (`crash_free`, `solvability`, `avg_depth`, `turns_survived`, `balance_sanity`) and weighted overall.
- `scripts/eval/eval.js` — CLI runner (default seeds `1..20`); `--write` saves `eval/latest-score.json` and appends `eval/history.jsonl`.

## Architecture

- `server.js` — minimal Node HTTP static server (`0.0.0.0`, default port `8792`) serving `public/`, `src/`, and `/health`.
- `public/index.html` — browser entry point hosting the `<canvas>`, HUD, inventory sidebar, Descend / Restart / New Seed controls, and message log.
- `src/` — native ES modules shared directly between the browser and Node tests:
  - `rng.js` — seeded Mulberry32 PRNG (`createRng`) with `next` / `nextFloat` / `nextInt` / `range`.
  - `tiles.js` — tile constants (`FLOOR` / `WALL` / `STAIRS`), visibility (`VIS`), `isWalkable` / `blocksSight`.
  - `map.js` — arena grid builder (`createArenaMap`) plus `getTileAt` / `setTileAt` / `findSpawn`.
  - `dungeon.js` — seeded rooms-and-corridors generator with spawn, stairs, corridor carving, and BFS connectivity repair.
  - `fov.js` — recursive shadowcasting FOV, fog-of-war apply/update, explored count, Bresenham LOS.
  - `monsters.js` — archetypes (Goblin / Slime / Bat / Orc), depth-scaled spawning, chase / wander AI.
  - `items.js` — potion / weapon / armor templates, seeded floor loot, inventory helpers, `floorSeed(run, depth)`.
  - `game-state.js` — pure state (`createGame`, `movePlayer`, `useItem`, `descendStairs`, `restart`, `inspect`); dungeon + FOV + combat + inventory + depth; no DOM.
  - `renderer.js` — canvas tile drawing with FOV shading, items, visible monsters, HP bars, Game Over overlay, HUD / inventory / log updates.
  - `main.js` — browser adapter: keyboard / inventory clicks / Descend / Restart / New Seed → state and redraw.
- `scripts/eval/` — headless bot (`bot.js`), pure scorer (`scorer.js`), and CLI runner (`eval.js`) for M5 balance/eval loops.
- `test/` — headless `node:test` suites covering seed determinism, dungeon connectivity, FOV/fog, movement, combat/AI, items/progression, eval harness, and server smoke.
- `.agentfleet.json` — registers `tile-dungeon` as an `aflt` project (`{"project": "tile-dungeon"}`).

## Milestone Plan

- **M1 — Core Grid & Movement:** ✅ Seeded RNG, pure game-state module separate from rendering, canvas tile map, keyboard movement, wall collision, headless state tests.
- **M2 — Procedural Dungeon & FOV:** ✅ Deterministic rooms-and-corridors generation, field of view and fog of war, multi-seed solvability/connectivity tests.
- **M3 — Monsters & Turn-Based Combat:** ✅ Monster AI, turn-based melee combat, HP, message log, death and restart, headless combat tests.
- **M4 — Items, Inventory & Deeper Levels:** ✅ Potions, weapons/armor, inventory UI, stairs down, depth-based difficulty scaling, headless progression tests.
- **M5 — Headless Bot & Eval Loop:** ✅ M5a harness (`scripts/eval/` bot + scorer + CLI, `npm run eval`, headless `test/eval.test.js`); remaining: iterative balance/gameplay improvement rounds until score plateau.
