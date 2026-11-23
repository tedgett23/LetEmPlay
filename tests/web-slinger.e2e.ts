import {
	climbFirstLevel,
	continueWebSlinger,
	drawLine,
	expect,
	test,
	toPage,
	webSlingerPoint
} from './helpers';

const SHAFT = 720 / 54;
const score = (page: import('@playwright/test').Page) =>
	page
		.locator('.host')
		.getAttribute('data-score')
		.then((s) => Number(s));

test('draw lines to zip and leap up to the flag', async ({ page }) => {
	await page.goto('/play/web-slinger');
	await page.getByRole('button', { name: 'Play', exact: true }).click();
	await expect(page.locator('.host')).toHaveAttribute('data-phase', 'playing');
	await climbFirstLevel(page);
	// +100 for the level and +100 for losing no hearts (plus any coins on the way).
	await expect.poll(() => score(page), { timeout: 10_000 }).toBeGreaterThanOrEqual(200);
});

test('tap a robber to web them', async ({ page, baseURL }) => {
	// Level 2: a robber stands on the right ledge at 6 m, 2 m from the wall.
	await continueWebSlinger(page, baseURL!, { levelIndex: 1, score: 0, hearts: 3 });
	const W = await webSlingerPoint(page);
	const robber = W(SHAFT - 2, 6.85);
	await page.mouse.click(robber.x, robber.y);
	await expect.poll(() => score(page)).toBeGreaterThanOrEqual(50);
});

test('landing on spikes on the last heart ends the run, and the level is kept', async ({
	page,
	baseURL
}) => {
	// Level 4: up under the left ledge, then down-right onto the spiky ledge (see the unit tests).
	await continueWebSlinger(page, baseURL!, { levelIndex: 3, score: 0, hearts: 1 });
	await drawLine(page, 100);
	await drawLine(page, 310);
	await expect(page.getByRole('dialog', { name: 'Game over' })).toBeVisible({ timeout: 10_000 });
	await page.goto('/play/web-slinger');
	await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible();
});

test('pause menu: resume', async ({ page }) => {
	await page.goto('/play/web-slinger');
	await page.getByRole('button', { name: 'Play', exact: true }).click();
	const P = await toPage(page);
	const pause = P(648, 88);
	await page.mouse.click(pause.x, pause.y);
	await expect(page.getByRole('dialog', { name: 'Paused' })).toBeVisible();
	await page.getByRole('button', { name: 'Resume' }).click();
	await expect(page.locator('.host')).toHaveAttribute('data-phase', 'playing');
});
