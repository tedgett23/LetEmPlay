import { expect, test } from '@playwright/test';
import {
	colorFirstPage,
	flickBasket,
	routes,
	scoreFirstMove,
	climbFirstLevel,
	scoreFirstGoal,
	swipe,
	visit
} from './helpers';

// After the first load, everything works with no network.
test('works fully offline after first visit', async ({ page, context }) => {
	// Plays a move in every game offline; long by nature under software WebGL, not a timing race.
	test.slow();
	await page.goto('/');
	await page.evaluate(async () => {
		const reg = await navigator.serviceWorker.ready;
		// Wait until the precache finished and the worker is active.
		if (!reg.active) throw new Error('service worker not active');
	});
	// Make sure this page is controlled before going offline.
	await page.reload();
	await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

	await context.setOffline(true);

	for (const [path, heading] of routes) await visit(page, path, heading);
	await page.goto('/');
	await page.getByRole('link', { name: /Doodle Cove/ }).click();
	await colorFirstPage(page);

	// Navigate client-side from home into the game and play it offline.
	await page.goto('/');
	await page.getByRole('link', { name: /Block Drop/ }).click();
	await scoreFirstMove(page);

	await page.goto('/');
	await page.getByRole('link', { name: /Hoop Flick/ }).click();
	await page.getByRole('button', { name: 'Play', exact: true }).click();
	await flickBasket(page);

	await page.goto('/');
	await page.getByRole('link', { name: /Rail Dash/ }).click();
	await page.getByRole('button', { name: 'Play', exact: true }).click();
	await swipe(page, 'right');
	await expect(page.locator('.host')).toHaveAttribute('data-score', /^[1-9]\d*$/);

	await page.goto('/');
	await page.getByRole('link', { name: /Goal/ }).click();
	await scoreFirstGoal(page);

	await page.goto('/');
	await page.getByRole('link', { name: /Web Slinger/ }).click();
	await page.getByRole('button', { name: 'Play', exact: true }).click();
	await climbFirstLevel(page);
	await expect
		.poll(async () => Number(await page.locator('.host').getAttribute('data-score')), {
			timeout: 10_000
		})
		.toBeGreaterThanOrEqual(220);
});
