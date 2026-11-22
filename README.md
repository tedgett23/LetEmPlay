# Arcade (working name)

Free, ad-free casual games for kids. Installable as a PWA and fully playable offline. No accounts,
no purchases, no tracking, no data leaves the device.

- **Spec:** [`MVP.md`](MVP.md)
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
