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
const immutableDir = new URL('_app/immutable/', self.registration.scope).pathname;

self.addEventListener('install', (event) => {
	event.waitUntil(
		(async () => {
			const cache = await caches.open(CACHE);
			// HTML and unversioned art may still be fresh in the HTTP cache from the previous build.
			try {
				await cache.addAll(
					PRECACHE.map(
						(path) =>
							new Request(new URL(path, self.registration.scope), {
								cache: path.startsWith(immutableDir) ? 'default' : 'no-cache'
							})
					)
				);
			} catch (error) {
				// addAll is atomic; don't mistake an empty failed install for the previous build.
				if (!(await cache.keys()).length) await caches.delete(CACHE);
				throw error;
			}
			await self.skipWaiting(); // only after the entire new release is playable offline
		})()
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			// A game in another tab may still lazy-load chunks from the previous release.
			// Cache names are returned in creation order. Retain at most one previous release.
			const older = (await caches.keys()).filter(
				(key) => key.startsWith('letemplay-') && key !== CACHE
			);
			await Promise.all(older.slice(0, -1).map((key) => caches.delete(key)));
			await self.clients.claim();
		})()
	);
});

self.addEventListener('message', (event) => {
	if (event.data === 'letemplay:check-version') {
		event.source?.postMessage({ type: 'letemplay:active-version', version });
	}
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
			if (path.startsWith(immutableDir)) {
				for (const key of await caches.keys()) {
					if (!key.startsWith('letemplay-') || key === CACHE) continue;
					const previous = await caches.match(req, { cacheName: key, ignoreSearch: true });
					if (previous) return previous;
				}
			}

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
