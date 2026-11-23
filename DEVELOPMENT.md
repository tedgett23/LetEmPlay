# Development and testing

Use `make help` to see the targets. On a new host, install Node.js 24, pnpm and GNU Make, then run `make setup` once. It installs the locked dependencies, Chromium, WebKit and their system libraries. Use `pnpm dev` to work on the app.

| When                                                  | Run                                                                            | What it proves                                                                                     |
| ----------------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Editing rules, scoring, storage, input math or layout | `make watch` while editing; `make unit` for a single run                       | Pure TypeScript behavior in Node, without a renderer or browser.                                   |
| Editing gameplay, touch input, rendering or the shell | `make smoke`                                                                   | Block Drop interactions on iPhone/WebKit. Use `make smoke PROJECT=pixel` for Android/Chromium.     |
| Editing routing, caching, CSP or privacy              | `make smoke SPEC=tests/offline.e2e.ts` or `make smoke SPEC=tests/shell.e2e.ts` | Offline gameplay or route/link/network behavior against the built site.                            |
| Before handing off a change or merging a PR           | `make verify`                                                                  | Types, lint/format, unit tests, production build and the full suite on both engines, sequentially. |

`make test` runs both test layers; `make e2e` runs the full browser suite alone. The browser command builds once and starts a private preview on port 4174 for both projects. Leave that port free. The output in `build/` is the artifact the suite exercised; a PR or release job using `make verify` should use that output rather than run a second build.

## Keeping the browser loop small

Playwright uses up to two workers and takes screenshots on failure. Tracing is off by default. For a failure, first repeat the smallest case **without tracing** to preserve its timing. Then record a targeted trace if needed:

```sh
make smoke PW_ARGS='--grep "game over" --workers=1 --repeat-each=3'
make smoke PW_ARGS='--grep "game over" --workers=1 --trace=on'
```

Open the reported zip with `pnpm exec playwright show-trace <path-to-trace.zip>`. On a constrained machine, use `PW_ARGS=--workers=1` for smoke runs; keep both engines in the PR gate. Scope a run before adding workers. Do not add retries or raise timeouts to cover a timing-dependent failure.

## Adding coverage

- Put rule and edge-case tests beside the pure TypeScript module. Use seeded state for repeatability. Reserve browser tests for behavior that crosses the game, renderer, shell, storage, or service worker.
- Exercise real input and assert outcomes: a changed score, a resumed save, or a completed transition. Wait for observable state instead of sleeping for an animation. Seed normal storage when needed; do not add production test hooks.
- When adding a route, add its path and identifying heading to `tests/helpers.ts`. A successful status alone cannot distinguish the offline home fallback from the requested page. For each new playable game, add a scoring or equivalent move both offline and during the ten-second privacy observation in `tests/shell.e2e.ts`.
- Before milestone sign-off, also run the installed PWA on a real iPhone and Android device (and a tablet if available), in airplane mode. Use the manual QA matrix below.

## Manual QA matrix (launch sign-off)

Run on each device: a real iPhone (iOS 16.4+), a 2021-era budget Android phone (Chrome), and an iPad. Install to the home screen first, then turn on airplane mode.

| Check        | How                                                                             | Pass when                                                                                     |
| ------------ | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Install      | Share → Add to Home Screen (iOS); install prompt or menu (Android)              | Icon looks right, launch screen shows, opens full screen                                      |
| Offline      | Airplane mode, cold launch, play each game                                      | Every game loads and plays; no error pages                                                    |
| Audio        | First tap in each game                                                          | Sounds start on the first touch; Settings mute works                                          |
| Touch        | Block Drop drag on a small phone; Hoop Flick flicks; Rail Dash swipes           | Pieces land where aimed; flicks feel consistent; no missed or doubled swipes                  |
| Drawing      | Fill a book shape, draw across its outline, erase, then reopen the page offline | Ink follows the finger, printed lines stay intact, and each drawing is restored independently |
| Background   | Switch apps mid-game, come back                                                 | Game is paused; Hoop Flick's clock didn't run; resume works                                   |
| Rotation     | Turn the device sideways mid-game                                               | Game pauses and asks to turn back; resumes cleanly                                            |
| Safe areas   | Notch, Dynamic Island, home bar, iPad split                                     | Nothing important is under a notch or the home bar                                            |
| Back gesture | Swipe back / Android back mid-game                                              | Pauses instead of leaving                                                                     |
| Performance  | Rail Dash for 5+ minutes; Block Drop long game                                  | Smooth; with remote DevTools, memory flattens instead of climbing                             |
| Scores       | Set a best, close the app, reopen                                               | Best shows on the home card; "Hold to erase" clears all                                       |
| Privacy      | Parents page; remote DevTools Network tab while playing                         | Only this site's own files are requested                                                      |
