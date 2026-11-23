import { expect, test } from '@playwright/test';
import { dragPiece, flickBasket, routes, scoreFirstMove, swipe, visit } from './arcade';

test('every route renders without outbound links or third-party traffic, including during play', async ({
	page,
	context,
	baseURL
}) => {
	// Ten seconds of observed play per game, by design, plus every route.
	test.slow();
	const origin = new URL(baseURL!).origin;
	const foreign: string[] = [];
	context.on('request', (req) => {
		const url = new URL(req.url());
		if (url.protocol.startsWith('http') && url.origin !== origin) foreign.push(req.url());
	});
	page.on('websocket', (socket) => {
		const url = new URL(socket.url().replace(/^ws/, 'http'));
		if (url.origin !== origin) foreign.push(socket.url());
	});

	for (const [path, heading] of routes) {
		await visit(page, path, heading);
		const hrefs = await page
			.locator('a[href]')
			.evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).href));
		for (const href of hrefs) expect(new URL(href).origin, `${path} → ${href}`).toBe(origin);
		if (path === '/play/block-drop') {
			await scoreFirstMove(page);
			const until = Date.now() + 10_000;
			await dragPiece(page, 0, 180, 790);
			await dragPiece(page, 2, 540, 790);
			// Deliberate observation window for delayed network activity.
			await page.waitForTimeout(Math.max(0, until - Date.now()));
		}
		if (path === '/play/rail-dash') {
			await page.getByRole('button', { name: 'Play', exact: true }).click();
			const until = Date.now() + 10_000;
			await swipe(page, 'left');
			await swipe(page, 'up');
			await expect(page.locator('.host')).toHaveAttribute('data-score', /^[1-9]\d*$/);
			// Deliberate observation window for delayed network activity.
			await page.waitForTimeout(Math.max(0, until - Date.now()));
		}
		if (path === '/play/hoop-flick') {
			await page.getByRole('button', { name: 'Play', exact: true }).click();
			const until = Date.now() + 10_000;
			await flickBasket(page);
			// Deliberate observation window for delayed network activity.
			await page.waitForTimeout(Math.max(0, until - Date.now()));
		}
	}
	expect(foreign).toEqual([]);
});
