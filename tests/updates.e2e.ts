import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { expect, test } from './helpers';

// Serve the production artifact as two successive deployments on an isolated origin.
// Only change the version and an HTML marker (and re-hash the inline bootstrap for its CSP).
// A real HTTP origin is needed: Playwright page.route doesn't intercept worker install fetches.
test('home applies a complete update while another tab keeps its game, then works offline', async ({
	page,
	context,
	baseURL
}) => {
	test.slow();
	const upstream = baseURL!;
	const { version } = (await (await fetch(`${upstream}/_app/version.json`)).json()) as {
		version: string;
	};
	let deploy = 'first';
	const hash = (s: string) => createHash('sha256').update(s).digest('base64');
	const server = createServer((req, res) => {
		void (async () => {
			const url = new URL(req.url!, upstream);
			const release = deploy;
			if (release === 'broken' && url.pathname === '/thumbs/doodle-cove.jpg') {
				res.writeHead(503).end();
				return;
			}
			const response = await fetch(url);
			const mime = response.headers.get('content-type') ?? 'application/octet-stream';
			res.writeHead(response.status, {
				'Content-Type': mime,
				'Cache-Control': url.pathname === '/service-worker.js' ? 'no-cache' : 'max-age=3600'
			});
			if (mime.includes('text/html')) {
				let html = await response.text();
				for (const [, script] of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
					if (!script?.includes(version)) continue;
					const next = script.replaceAll(version, `${version}-${release}`);
					html = html.replace(hash(script), hash(next)).replace(script, () => next);
				}
				res.end(html.replace('<html ', `<html data-release="${release}" `));
			} else if (url.pathname === '/service-worker.js' || url.pathname === '/_app/version.json') {
				res.end((await response.text()).replaceAll(version, `${version}-${release}`));
			} else res.end(Buffer.from(await response.arrayBuffer()));
		})().catch(() => res.destroy());
	});
	server.listen(0, '127.0.0.1');
	await once(server, 'listening');
	const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	try {
		await page.goto(origin);
		await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
		const game = await context.newPage();
		await game.goto(`${origin}/play/doodle-cove`);
		await game.getByRole('button', { name: 'Play', exact: true }).click();
		await game.getByRole('button', { name: /Free-style/ }).click();
		await page.bringToFront();
		deploy = 'broken';
		const state = await page.evaluate(async () => {
			const reg = await navigator.serviceWorker.ready;
			const failed = new Promise<string>((resolve) => {
				reg.addEventListener(
					'updatefound',
					() => {
						const installing = reg.installing!;
						installing.addEventListener('statechange', () => {
							if (installing.state === 'redundant' || installing.state === 'activated')
								resolve(installing.state);
						});
					},
					{ once: true }
				);
			});
			await reg.update();
			return failed;
		});
		expect(state).toBe('redundant');
		await expect(page.locator('html')).toHaveAttribute('data-release', 'first');
		deploy = 'second';
		await page.reload();
		await expect(page.locator('html')).toHaveAttribute('data-release', 'second', {
			timeout: 20000
		});
		await expect(game.locator('html')).toHaveAttribute('data-release', 'first');
		await expect(game.getByRole('button', { name: 'Marker' })).toBeVisible();
		await context.setOffline(true);
		await page.reload();
		await expect(page.locator('html')).toHaveAttribute('data-release', 'second');
		await expect(page.getByRole('link', { name: /Doodle Cove/ })).toBeVisible();
	} finally {
		server.close();
		server.closeAllConnections();
	}
});
