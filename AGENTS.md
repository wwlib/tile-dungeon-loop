# AGENTS.md — Tile Dungeon

Guidance for AI coding agents working on `tile-dungeon`.

## Stack & Constraints

- **Zero runtime dependencies.** Use plain Node.js (`>= 20`, tested on Node 24) and plain browser HTML5 `<canvas>` + ES modules (`"type": "module"` in `package.json`).
- **Pure state vs. rendering.** Keep all game rules, RNG, dungeon generation, FOV, AI, combat, inventory, and progression in pure ES modules under `src/` with zero DOM/`window`/`document` dependencies so `node:test` can drive every mechanic headlessly.
- **Deterministic RNG.** Use an explicit seeded PRNG (`src/rng.js`) for every random roll in gameplay and generation. Never rely on unseeded `Math.random()` inside simulation logic.
- **Testing.** Run `npm test` (`node --test test/*.test.js`). Keep all tests fast, deterministic, and hermetic.
- **Server.** `server.js` binds `0.0.0.0` on `process.env.PORT || 8792`. Never disturb unrelated processes on ports `8790` or `8791` or elsewhere. This comparison rebuild defaults to `8792`.

## Safety & Workflow Rules

- **Never use `pkill`, `killall`, or pattern-matched kills.** Only stop specific PIDs that you started.
- **Do not commit** inside `aflt run` worker tasks unless explicitly instructed; the orchestrator handles commits after verifying tests.
- **Never weaken tests or eval scorers** (`scripts/eval/`) to raise scores during improvement rounds.
- **Project registration:** `.agentfleet.json` sets `"project": "tile-dungeon"`. Note that `aflt <subcmd> --help` is not a dedicated help path in `aflt` — never invoke it.
- Keep `README.md` and `AGENTS.md` updated as milestones land.

## Current Modules (M5a)

| Module | Role |
| --- | --- |
| `src/rng.js` | Seeded Mulberry32 PRNG |
| `src/tiles.js` | `FLOOR` / `WALL` / `STAIRS`, `VIS`, `isWalkable` / `blocksSight` |
| `src/map.js` | Arena builder with outer walls + interior pillars |
| `src/dungeon.js` | Seeded rooms+corridors gen — spawn, stairs, corridors, connectivity repair / BFS analysis |
| `src/fov.js` | Recursive shadowcasting FOV, fog apply/update, explored count, Bresenham LOS |
| `src/monsters.js` | Archetypes, depth-scaled spawn tables / density / stats (`spawnTableForDepth`: no orcs on depth 1), chase / wander AI |
| `src/items.js` | Potion / weapon / armor templates; `spawnItems`; `floorSeed`; inventory helpers |
| `src/game-state.js` | Pure `createGame` / `movePlayer` / `useItem` / `descendStairs` / `restart` / `inspect`; FOV + combat + inventory + depth |
| `src/renderer.js` | Canvas draw: FOV shading, items, visible monsters + HP bars, Game Over overlay, HUD / inventory / log |
| `src/main.js` | Browser entry (Arrow/WASD, Space, 1–9, H, G, `>`/Enter descend, R, N) |
| `scripts/eval/bot.js` | Deterministic headless bot — BFS explore, fight, heal, equip, descend; per-run telemetry |
| `scripts/eval/scorer.js` | Pure scoring formulas (weights / normalization constants); no I/O |
| `scripts/eval/eval.js` | CLI runner (`--json`, `--seeds N`, `--write` → `eval/latest-score.json` + `eval/history.jsonl`) |
| `test/rng.test.js` | Seed determinism |
| `test/game-state.test.js` | Movement, collision, bounds, DOM-free import |
| `test/dungeon.test.js` | Determinism + 50-seed spawn/stairs/connectivity/solvability |
| `test/fov.test.js` | Wall occlusion, fog memory, createGame FOV init |
| `test/combat.test.js` | Monster spawn, bump combat, AI chase, message log, death, restart |
| `test/items.test.js` | Item spawn/pickup/potion/equip, stairs descent + preserve, depth difficulty scaling |
| `test/eval.test.js` | Bot seeded runs + scorer/eval 0–100 metric bounds (fast, 3 seeds) |
| `test/smoke.test.js` | Static server `/health` + `/` |

## Eval Commands

- `npm run eval` → `node scripts/eval/eval.js --json` (default seeds `1..20`).
- `node scripts/eval/eval.js --json --write` — also writes `eval/latest-score.json` and appends `eval/history.jsonl`.
- Never weaken tests or eval scorers to raise scores during improvement rounds.

## Milestones

1. **M1:** ✅ Grid tile map, canvas rendering, keyboard movement, wall collision, seeded RNG, pure state module, headless tests.
2. **M2:** ✅ Seeded procedural dungeon generation (rooms+corridors or BSP), FOV + fog of war, multi-seed connectivity/solvability tests.
3. **M3:** ✅ Monsters with AI, turn-based combat, HP, message log, death and restart, headless tests.
4. **M4:** ✅ Potions, weapons/armor, inventory, stairs to deeper levels, difficulty scaling, headless tests.
5. **M5:** ✅ M5a — `scripts/eval/` headless bot + scorer (crash-free, solvability, average depth, turns survived, balance sanity); remaining — iterative balance/gameplay improvement loop.
6. **Improve:** Depth-aware monster spawn tables — depth 1 is slime/bat/goblin only; orcs from depth 2; heavier orc weight from depth 3+. Higher item spawn density. Player base DEF 1 so atk-1 foes glance and orc bursts are less lethal on early floors.
