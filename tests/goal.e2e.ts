import { continueGoal, expect, kickBall, scoreFirstGoal, test } from './helpers';

const score = (page: import('@playwright/test').Page) =>
	page
		.locator('.host')
		.getAttribute('data-score')
		.then((s) => Number(s));

test('kick straight up to score on the first level', async ({ page }) => {
	await page.goto('/play/goal');
	await scoreFirstGoal(page);
});

test('a fast ball knocks a chaser over', async ({ page, baseURL }) => {
	// Level 4, the hourglass: a chaser stands right in the middle of the way up.
	await continueGoal(page, baseURL!, { levelIndex: 3, score: 0, balls: 3 });
	await kickBall(page);
	await expect.poll(() => score(page)).toBeGreaterThanOrEqual(10);
});

test('losing the last ball ends the run, and the level is kept', async ({ page, baseURL }) => {
	await continueGoal(page, baseURL!, { levelIndex: 0, score: 0, balls: 1 });
	// The weakest kick wakes the chasers, and they take the ball (the unit tests check this).
	await kickBall(page, 0.95);
	await expect(page.getByRole('dialog', { name: 'Game over' })).toBeVisible({ timeout: 15_000 });
	await page.goto('/play/goal');
	await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible();
});

test('pause menu: resume', async ({ page }) => {
	await page.goto('/play/goal');
	await page.getByRole('button', { name: 'Play', exact: true }).click();
	await page.getByRole('button', { name: 'Pause', exact: true }).click();
	await expect(page.getByRole('dialog', { name: 'Paused' })).toBeVisible();
	await page.getByRole('button', { name: 'Resume' }).click();
	await expect(page.locator('.host')).toHaveAttribute('data-phase', 'playing');
});

test('dribble through the first level without lifting to shoot', async ({ page }) => {
	await page.goto('/play/goal');
	await page.getByRole('button', { name: 'Play', exact: true }).click();
	const box = (await page.locator('.stage').boundingBox())!;
	await page.clock.install();
	await page.clock.pauseAt(new Date(Date.now() + 1000));
	const x = box.x + box.width * 0.5,
		y = box.y + box.height * 0.94;
	await page.mouse.move(x, y);
	await page.mouse.down();
	for (let i = 1; i <= 20; i++) {
		const p = i / 20;
		await page.mouse.move(
			x + Math.sin(2 * Math.PI * p) * box.width * 0.06,
			y - p * box.height * 0.84
		);
		await page.clock.fastForward(144);
	}
	expect(await score(page)).toBeGreaterThanOrEqual(50);
	await page.mouse.up();
});
