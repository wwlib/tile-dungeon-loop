# Tile Dungeon (loop rebuild)

A browser-playable tile-based dungeon roguelike in plain Node.js and HTML5 Canvas, with zero runtime dependencies.

This repo is the **`aflt loop` rebuild** of the game, used to compare against an earlier flat-run build. It was grown from an M0 scaffold (seeded RNG/server/canvas stub) by the `hello-aflt` loop: milestones M1–M4, an M5a eval harness, then eval-gated improvement rounds planned by Cursor via `plan-next`.

Built with [AgentFleet (`aflt`)](https://github.com/wwlib/aflt).

## Quick start

```bash
npm start
```

Open `http://127.0.0.1:8792` (or `http://<lan-ip>:8792`). The server binds `0.0.0.0` on port **8792** by default (`PORT=…` to override). Ports 8790 and 8791 are reserved on the original build host.

```bash
node --test test/*.test.js
node scripts/eval/eval.js --json
```

The package.json `eval` script is `node scripts/eval/eval.js --json`.

## Comparison with the flat-run baseline

The original game (`tile-dungeon`) was built as eight separate `aflt run` sessions orchestrated outside the loop runner. This repo used `aflt loop` instead. Criteria were wall time, tokens, and quality. Numbers below were **recomputed 2026-11-23** after usage backfill, dropping 200,482 failed 8:18 PM planner tokens, and repairing r2’s sparse estimate (still `accuracy=estimated`; Cursor never reported exact API usage for that turn). Cost stays **null / unknown**.

| | Flat-run baseline | Loop path (first `hello-aflt` + fair `hello-aflt-improve`) |
|---|---|---|
| Wall time | 1h 19m 6s | **58m 50s** (18m 53s + 39m 57s) |
| Tokens (with planner) | n/a | **5,996,177** (first 4,232,189 + improve 1,763,988) |
| Tokens (without planner) | **8,936,876** | **5,322,759** |
| Improve rounds kept | 3 (flat path) | **3 kept** (88.2 → 92.4 → 94.1 → **96.8**) |
| Fresh-eval overall | **97.2** (weakest `turns_survived` 81.1) | **96.8** (weakest `avg_depth` 84.3) |
| Tests (`node --test test/*.test.js`) | **72** pass / 0 fail | **68** pass / 0 fail |

**Test-count note:** a naive `\btest\s*\(` grep on this repo’s `test/` hits **73** because **5** lines are RegExp `.test(` calls, not `node:test` cases. The runner reports **68**.

First-loop M5a baseline was **88.2**; one early improve briefly reached **92.4** then a false-plateau gate reverted gameplay. The fair `--fresh` improve later kept three rounds through **96.8** (`f420cfc` / `e31b8ea` / `6deab49`). Full write-up: `/tmp/aflt-dungeon-loop/comparison.md` on the build host.

## Architecture

- `server.js` — minimal Node HTTP static server (`0.0.0.0`, default port 8792) serving `public/`, `src/`, and `/health`.
- `public/index.html` — canvas + HUD entry.
- `src/` — ES modules shared by the browser and Node tests. Game rules stay pure (no DOM) in modules such as `rng.js`, `game-state.js`, `dungeon.js`, `fov.js`, `monsters.js` (depth-gated spawn tables via `spawnTableForDepth`), and `items.js`. `renderer.js` and `main.js` handle canvas and input.
- `scripts/eval/` — headless bot (`bot.js`), scorer (`scorer.js`), and CLI (`eval.js`).
- `test/` — headless `node:test` suites.
- `.agentfleet.json` — registers the `aflt` project as `tile-dungeon-loop`.

## Milestones

- **M1** — Seeded RNG, pure game state, canvas map, keyboard movement, wall collision, tests.
- **M2** — Procedural dungeon generation, FOV and fog of war, multi-seed solvability tests.
- **M3** — Monsters, turn-based combat, HP, message log, death and restart.
- **M4** — Items, inventory, stairs to deeper levels, difficulty scaling.
- **M5a** — Headless bot and eval harness (crash-free, solvability, average depth, turns survived, balance sanity).
- **Improve** — Depth-aware spawn tables (no orcs on floor 1), denser floor loot, and player base DEF 1 so weak hits glance and early orc trades are survivable longer.

## License

See the repository; this is a public comparison artifact for [aflt](https://github.com/wwlib/aflt).
