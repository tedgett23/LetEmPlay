import { expect, seedRandom, swipe, test } from './helpers';

test('restart handles a coin ID reused for a train', async ({ page }) => {
	await page.goto('/play/rail-dash');
	const play = page.getByRole('button', { name: 'Play', exact: true });
	await expect(play).toBeVisible();
	await page.evaluate(() => (Math.random = () => 1 / 2 ** 32));
	await play.click();
	const host = page.locator('.host');
	await expect(host).toHaveAttribute('data-score', /^[1-9]\d*$/);
	await page.getByRole('button', { name: 'Pause' }).click();
	await page.evaluate(() => (Math.random = () => 3 / 2 ** 32));
	// Advance the first restarted frame by at least one physics step, as on a busy phone.
	await page.clock.install();
	await page.clock.pauseAt(new Date(Date.now() + 1000));
	await page.getByRole('button', { name: 'Restart' }).dispatchEvent('click');
	await page.clock.fastForward(200);
	await expect(host).toHaveAttribute('data-score', /^[1-9]\d*$/);
});

test.describe('load recovery', () => {
	test.use({ serviceWorkers: 'block' });
	test('retry after a missing model starts a playable game', async ({ page }) => {
		await page.route(
			'**/rail-dash/models/character.glb',
			(route) => route.fulfill({ status: 404 }),
			{ times: 1 }
		);
		await page.goto('/play/rail-dash');
		await expect(page.getByRole('button', { name: 'Home' })).toBeVisible();
		await page.getByRole('button', { name: 'Try again' }).click();
		await page.getByRole('button', { name: 'Play', exact: true }).click();
		await expect(page.locator('.host')).toHaveAttribute('data-score', /^[1-9]\d*$/);
	});
});

test('a run scores distance as you go, with swipes along the way', async ({ page }) => {
	await page.goto('/play/rail-dash');
	await page.getByRole('button', { name: 'Play', exact: true }).click();
	const host = page.locator('.host');
	await expect(host).toHaveAttribute('data-phase', 'playing');
	await swipe(page, 'left');
	await swipe(page, 'up');
	await expect(host).toHaveAttribute('data-score', /^[1-9]\d*$/);
});

test('the pause button opens the pause menu', async ({ page }) => {
	await page.goto('/play/rail-dash');
	await page.getByRole('button', { name: 'Play', exact: true }).click();
	await page.getByRole('button', { name: 'Pause' }).click();
	await expect(page.getByRole('dialog', { name: 'Paused' })).toBeVisible();
	await page.getByRole('button', { name: 'Resume' }).click();
	await expect(page.locator('.host')).toHaveAttribute('data-phase', 'playing');
});

test('standing still eventually hits something, and the run ends with its score', async ({
	page
}) => {
	test.slow(); // many rendered frames under software WebGL; not a timing race
	await seedRandom(page);
	await page.clock.install();
	await page.goto('/play/rail-dash');
	await page.getByRole('button', { name: 'Play', exact: true }).click();
	await expect(page.locator('.host')).toHaveAttribute('data-phase', 'playing');

	const dialog = page.getByRole('dialog', { name: 'Game over' });
	// The loop clamps frames to 0.25 s, so advance in frame-sized hops.
	for (let hops = 0; hops < 600 && !(await dialog.isVisible()); hops++) {
		await page.clock.fastForward(250);
	}
	await expect(dialog).toBeVisible();
	const final = await page.getByTestId('final-score').textContent();
	expect(Number(final)).toBeGreaterThan(40); // at least the calm intro stretch
	await expect(page.locator('.host')).toHaveAttribute('data-score', final!);
});
