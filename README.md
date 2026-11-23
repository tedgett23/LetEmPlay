# Arcade (working name)

Free, ad-free casual games for kids. Installable as a PWA and fully playable offline. No accounts,
no purchases, no tracking, no data leaves the device.

- **Agent and contributor guide:** [`CLAUDE.md`](CLAUDE.md)
- **Development and testing:** [`development.md`](development.md) (`make help` for commands)

```sh
pnpm install
pnpm test:e2e:install   # first time only
pnpm dev
```

`pnpm build` produces a fully static site in `build/`. Host it on any static host over HTTPS
(HTTPS is needed for the service worker). If the host allows custom headers, mirror the CSP from
`vite.config.ts` as an HTTP header too.

## Principles

These are the rules the project is built on. Changes must keep all of them.

1. **Zero third-party network requests.** Every byte (code, fonts, images, audio, models) comes
   from this site's own origin. No CDNs, web fonts, analytics, error reporting, embeds or iframes.
2. **No data leaves the device.** Scores, settings and saves stay in `localStorage` on the device.
   There is no API and no `fetch` to anything but the site's own static files.
3. **No outbound links** anywhere a kid can tap, including credits and the parents page (credits
   are plain text).
4. **No manipulative patterns:** no nagging timers, notifications, "rate us", daily rewards,
   streaks, fake currencies, loot boxes or "watch to continue". Coins only add to the score.
5. **Works fully offline** after the first visit or install.
6. **Original games, not clones.** Genre mechanics are fine; names, characters, art, sounds, UI
   and level content are our own. Don't name existing games in code, files or metadata.
7. **Kid-proof UX:** touch targets of at least 48×48 CSS px, a deliberate confirm for anything
   destructive, and no screen a kid can get stuck on.

How they're enforced: a strict Content-Security-Policy (`vite.config.ts`; never add
`'unsafe-eval'` or a remote origin), an end-to-end test that fails if any request leaves the site
while every route is visited and every game is played, an offline test, and `pnpm
release-check`, which audits the built site's policy, links and every URL string it contains.
