/// <reference lib="webworker" />
// Precache everything on install, serve cache-first, never hit a third-party origin.
import { self } from '$app/service-worker';
import { immutable, assets, prerendered } from '$app/manifest';
import { version } from '$app/env';

const CACHE = `letemplay-${version}`;

// Everything the app needs, so all games work fully offline after the first visit.
const PRECACHE = [
	...immutable.map((f) => f.path),
	// iOS launch screens are only fetched when the app is added to the home screen; caching
	// all 17 device sizes on every device would waste space.
	...assets.map((f) => f.path).filter((p) => !p.startsWith('splash/')),
	...prerendered.map((f) => f.path)
].map((p) => new URL(p, self.registration.scope).pathname);

const PRECACHE_SET = new Set(PRECACHE);

self.addEventListener('install', (event) => {
	event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
	// No skipWaiting(): the new version takes over on the next cold launch so play is never
	// interrupted.
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			for (const key of await caches.keys()) {
				if (key.startsWith('letemplay-') && key !== CACHE) await caches.delete(key);
			}
			await self.clients.claim();
		})()
	);
});

self.addEventListener('fetch', (event) => {
	const req = event.request;
	if (req.method !== 'GET') return;
	const url = new URL(req.url);
	if (url.origin !== self.location.origin) return; // never proxy/cache foreign origins

	event.respondWith(
		(async () => {
			const cache = await caches.open(CACHE);

			// Cache-first. Prerendered pages are stored without a trailing slash / .html.
			const path = url.pathname.replace(/\/$/, '') || '/';
			const hit =
				(await cache.match(req, { ignoreSearch: true })) ??
				(PRECACHE_SET.has(path) ? await cache.match(path) : undefined);
			if (hit) return hit;

			try {
				const res = await fetch(req);
				if (res.ok && res.type === 'basic') void cache.put(req, res.clone());
				return res;
			} catch {
				if (req.mode === 'navigate') {
					const home = await cache.match('/');
					if (home) return home;
				}
				return new Response('Offline', { status: 503, statusText: 'Offline' });
			}
		})()
	);
});
