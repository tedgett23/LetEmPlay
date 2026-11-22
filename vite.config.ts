import { defineConfig } from 'vitest/config';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			// Fully static output. No server, no API routes (MVP.md §3, §4).
			adapter: adapter({ fallback: undefined, strict: true }),
			// MVP.md §8: zero third-party requests. Emitted as a <meta> tag on prerendered pages.
			// If a library needs 'unsafe-eval' or a remote origin, do NOT loosen this — flag it.
			csp: {
				mode: 'hash',
				directives: {
					'default-src': ['self'],
					'script-src': ['self'],
					'style-src': ['self', 'unsafe-inline'],
					'img-src': ['self', 'data:', 'blob:'],
					'media-src': ['self', 'blob:'],
					// data: lets Pixi probe image decoding in WebKit; it never touches the network.
					'connect-src': ['self', 'data:'],
					'font-src': ['self'],
					'worker-src': ['self', 'blob:'],
					'frame-src': ['none'],
					'object-src': ['none'],
					'base-uri': ['self'],
					'form-action': ['none']
				}
			},
			prerender: {
				handleHttpError: 'fail',
				handleMissingId: 'fail'
			}
		})
	],
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'unit',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
