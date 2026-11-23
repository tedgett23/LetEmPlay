# Credits

Source zips live in `assets-src/kenney/`, and `pnpm assets` builds what ships in
`static/assets/`. Every third-party asset used in the app. All must be CC0 or similarly permissive and bundled
locally. Keep this in sync with `src/lib/credits.ts`, which the in-app Credits
page shows as plain text.

| Pack                              | Author | License | Downloaded | Used in                                              |
| --------------------------------- | ------ | ------- | ---------- | ---------------------------------------------------- |
| Interface Sounds 1.0              | Kenney | CC0 1.0 | 2026-11-22 | Block Drop, Hoop Flick, Rail Dash, Web Slinger, Goal |
| Impact Sounds 1.0                 | Kenney | CC0 1.0 | 2026-11-22 | Hoop Flick, Rail Dash, Web Slinger, Goal             |
| Train Kit                         | Kenney | CC0 1.0 | 2026-11-22 | Rail Dash                                            |
| City Kit (Commercial) 2.1         | Kenney | CC0 1.0 | 2026-11-22 | Rail Dash                                            |
| Animated Characters: Protagonists | Kenney | CC0 1.0 | 2026-11-22 | Rail Dash, Web Slinger, Goal                         |

Block Drop draws its own tiles and stars; Hoop Flick draws its ball, hoop and court. Both use Kenney sound effects.

Goal's players wear custom soccer uniforms on the shared animated character. Its courses, ball and obstacles are drawn in code.

Doodle Cove's ten coloring pages are original path drawings. The game uses no third-party art packs.

## Software

SvelteKit, Svelte, PixiJS (MIT). Three.js (MIT) renders Rail Dash. Hoop Flick uses its own small physics code (no Matter.js).

The City Kit zip in `assets-src/` is missing its final index (an interrupted download).
`pnpm assets` recovers its files anyway and keeps only ones whose checksum matches, so they are
identical to the originals. Replacing the zip with a complete download changes nothing.
