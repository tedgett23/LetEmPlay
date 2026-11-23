# Agent guide

**Read the Principles in `README.md` first.** They are non-negotiable: no third-party requests,
no data leaving the device, no outbound links, no manipulative patterns, original games only (no
clone names/art/characters), offline play, kid-proof UX.

Targets that still apply to every change:

- Devices: iPhone XR/11-class and newer (iOS Safari 16.4+), iPad 9th gen, a ~2021 budget Android
  phone. Portrait only; touch only (no keyboard controls).
- 60 fps in play; no per-frame allocations in hot paths; `destroy()` frees everything, so
  switching games repeatedly doesn't grow memory.
- Gzipped JS budgets: shell < 80 KB, Block Drop < 250 KB, Hoop Flick < 300 KB, Rail Dash < 350 KB;
  offline download < 25 MB. `pnpm release-check` enforces these.
- Service worker: precache everything, cache-first, no "update available" pop-ups (the new
  version takes over on the next cold launch).

## Commands

```sh
pnpm dev                 # dev server
pnpm check               # svelte-check (types)
pnpm lint                # prettier + eslint
pnpm format              # auto-format
pnpm test:unit --run     # vitest (game logic, kit)
pnpm test:e2e            # playwright: builds, previews, runs iPhone + Pixel emulation
pnpm test:e2e:install    # one-time: download chromium + webkit
pnpm build               # static site → build/
pnpm art                 # after a build: icons, iOS launch screens, home-card game screenshots
pnpm release-check       # after a build: JS budgets, offline size, CSP, links, URL audit
pnpm assets              # rebuild static/assets/ from the Kenney zips in assets-src/
```

Use the Makefile targets in [`development.md`](development.md): `make unit` or `make smoke` while editing, then `make verify` before handoff. The gate includes the production build used by both browser projects.

## Stack quirks (SvelteKit 3 / Svelte 5)

- Config lives in `vite.config.ts` (the `sveltekit({...})` plugin options). There is no `svelte.config.js`.
- The `$lib` alias is gone. From routes, import lib code with `#lib/...` **including the file extension**.
  Examples: `#lib/kit/storage.ts`, `#lib/kit/settings.svelte.ts`, `#lib/ui/PauseMenu.svelte`.
  Inside `src/lib`, use relative imports.
- `$app/environment` is now `$app/env`.
- The service worker is `src/service-worker/index.ts` (it has its own tsconfig) and uses
  `$app/manifest` (`immutable`, `assets`, `prerendered`) and `$app/service-worker` (`self`).
- Svelte 5 runes only (`$state`, `$props`, `$effect`). Reactive module state lives in `*.svelte.ts` files.

## Architecture

- `src/lib/kit/` holds shared game code. `types.ts` is the game contract (`GameDefinition`/`GameInstance`).
  Read it before writing a game.
- `src/lib/games/<id>/index.ts` default-exports a `GameDefinition`. Register the game in
  `src/lib/games/registry.ts`; `status: 'ready'` makes it playable and prerendered.
- Keep game rules in `games/<id>/logic/` (pure TS, no Pixi/Three imports, unit tested) and
  rendering in `games/<id>/render/`.
- **Import PixiJS only via `src/lib/kit/pixi.ts`.** It loads `pixi.js/unsafe-eval` first, which keeps
  Pixi working under our CSP without `'unsafe-eval'`. Use `createPixiStage()` to get letterboxed
  logical coordinates and `toLogical()` to map pointer events.
- Use the kit's fixed-timestep loop (`kit/loop.ts`) and render manually (`app.render()`); stages
  are created with `autoStart: false`. Block Drop sleeps between animations; input wakes its loop.
- The shell (`src/routes/play/[game]/+page.svelte`) owns pause/game-over/rotate overlays,
  visibility handling, back-navigation guarding, and high-score recording. Games call
  `ctx.events.onGameOver({ score })` and `ctx.events.onRequestPause()`.
- Contract details learned building Block Drop:
  - `start({ continueSaved })`: fresh by default. The shell shows Continue/New game when
    `hasSavedRun()` is true.
  - Expose `ready` (a promise) if the game sets itself up asynchronously. The shell waits for it
    before showing Play, so the first tap can't be lost. `mountPixiStage()` handles leaving during
    setup. The shell aborts the attempt's `signal` on failure or navigation; pass it to sound loads.
    Use `sheetAndSounds()` for a spritesheet plus sound set so reload and cleanup are ordered.
  - Save in-progress runs with `ctx.storage` and validate them when reading back (see
    `isGameState`).
  - The shell mirrors the score to `data-score` on `.host`. E2E tests read it.
- Hoop Flick (`src/lib/games/hoop-flick/`) is the reference for real-time games: a fixed-step
  `step(state, dt)` returning events that the glue turns into sounds and effects, all feel
  constants in `logic/tuning.ts`, art drawn with Pixi Graphics and baked once into textures
  (`bake()` in its view). Its E2E flicks use exact-timestamp DevTools touch events on Chromium,
  because the emulator delivers `page.mouse` moves a frame apart (see `flickBasket` in
  `tests/helpers.ts`).
- Only touch Pixi `Text` when the value changes; every change re-rasterises it.
- Web Slinger (`src/lib/games/web-slinger/`) is a vertical climb up a shaft one screen wide.
  Draw a line (anywhere on screen): its direction aims the web, its length sets the speed. The
  hero zips straight there and sticks: stands on ledge tops, clings to walls and ledge sides,
  hangs under ledges and the ceiling. Out of reach, the line is a leap (a ballistic arc). You can
  re-aim mid-flight. Flying into a robber knocks them over; a quick tap webs one. The aim guide
  in the view draws exactly the path `launch()` will take. Levels are ledge lists in
  `logic/levels.ts`, and a planning robot (`logic/bot.ts`) must climb every level with at
  least 3 working moves at every step (a unit test enforces it). The run is saved per level;
  after game over the level reached is kept for Continue. Its characters are the Rail Dash 3D
  model pre-rendered to a sprite sheet by `scripts/render-sprites.mjs` (Three.js in the test
  browser, with custom-painted hero and robber skins); `pnpm assets` runs it. Crates on ledges
  smash when you fly through them and pop out coins.
- Rail Dash (`src/lib/games/rail-dash/`) is the Three.js game. Its HUD is plain DOM inside the
  container; the Pause button stops `pointerdown` propagation so the swipe detector doesn't
  capture it. Swipes use `attachGestures(..., { swipeOnMove: true })` so moves start mid-gesture.
  Track patterns are ASCII in `logic/patterns.ts`; `logic/validate.ts` must accept every one
  (a unit test enforces it).
- E2E helpers in `tests/helpers.ts`: `flickBasket` (exact-timestamp flicks: DevTools touch on
  Chromium, timed in-page pointer events on WebKit), `swipe`, and `seedRandom` (makes
  `Math.random` repeatable in the page so a generated run is the same every time).
- Reference game: `src/lib/games/block-drop/`. Its pieces are `logic/` (pure rules), `render/layout.ts`
  (pure layout math), `render/view.ts` (Pixi drawing and animation) and `index.ts` (glue).
- E2E tests drive games by converting logical coordinates to page coordinates (see
  `tests/block-drop.e2e.ts`) and seed `localStorage` to set up exact board states. Don't add
  test-only hooks to games.
- Playwright serves the build on port 4174, so a manual `pnpm preview` on 4173 won't collide.
- All user-facing text lives in `src/lib/strings.ts`.

## Assets

Kenney blocks automated downloads, so the user downloads packs manually. The zips go in
`assets-src/kenney/` (never `static/`, because everything in `static/` ships and gets precached).
`scripts/build-assets.mjs` extracts them, converts Kenney's XML spritesheets into PixiJS JSON, and
copies the chosen sounds. Kenney audio is `.ogg` only, which iOS can't play before 18.4. If `ffmpeg`
is on PATH, the script also writes `.m4a`, and `loadSoundSet` picks the best format per device.
Byte-identical sound sets share files through relative aliases in each game's `sfx/index.json`.

If a zip is truncated (its central directory is missing), `pnpm assets` recovers every entry whose
CRC-32 matches and warns; it never writes outside the pack's folder.

Kenney's animated characters ship as FBX only. `scripts/fbx-to-glb.mjs` converts the model plus
its animation files into one GLB in Node, using Three's FBXLoader and GLTFExporter (no extra
tools); the skin PNG is applied at runtime. Rail Dash models load once per session through
`rail-dash/render/models.ts`.

Use Kenney (CC0) packs. Verify each pack's license on its page. Put files under
`static/assets/<game>/` and record every pack in both `CREDITS.md` and `src/lib/credits.ts`.
Credits are plain text, never links.
