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

The original game (`tile-dungeon`) was built as eight separate `aflt run` sessions orchestrated outside the loop runner. This repo used `aflt loop` instead. Criteria were wall time, tokens, and quality.

| | Flat-run baseline | This loop rebuild |
|---|---|---|
| Wall time | 1h 19m 6s | **18m 51s** |
| Tokens | 8,936,876 | **3,752,022** (3,422,067 without the planner) |
| Improve rounds kept | 3 (score 89.7 → 97.2) | **0 kept** (1 attempted) |
| Final live eval | **97.2** | **88.2** |
| Tests | 72 pass / 0 fail | 66 pass / 0 fail |

This is **not a like-for-like quality comparison**. The loop ran only one improvement round. That round briefly reached **92.4**, then a comparison-harness bug treated it as a plateau (the worker had already written 92.4 to `eval/history.jsonl`, so the gate compared 92.4 to 92.4), reverted the gameplay changes, and stopped. A fresh eval of this tree scores **88.2**, the M5a baseline. The scorers share the same metric names, weights, and constants but are separate rewrites, so scores are similar rather than strictly identical.

Cursor cost is null in `aflt` usage summaries; token totals above are from those summaries and are partly `accuracy=partial`.

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
