import { expect, flickBasket, test, toPage } from './arcade';

test('flick the ball into the hoop', async ({ page }) => {
	await page.goto('/play/hoop-flick');
	await page.getByRole('button', { name: 'Play', exact: true }).click();
	await flickBasket(page);
	await expect(page.locator('.host')).toHaveAttribute('data-score', /^[1-9]\d*$/);
});

test('a downward swipe is not a throw', async ({ page }) => {
	await page.goto('/play/hoop-flick');
	await page.getByRole('button', { name: 'Play', exact: true }).click();
	const P = await toPage(page);
	const a = P(360, 900);
	const b = P(360, 1200);
	await page.mouse.move(a.x, a.y);
	await page.mouse.down();
	await page.mouse.move(b.x, b.y, { steps: 6 });
	await page.mouse.up();
	await page.waitForTimeout(1500);
	await expect(page.locator('.host')).toHaveAttribute('data-score', '0');
});

test('the round ends when the 60-second clock runs out', async ({ page }) => {
	// A full round is about 240 rendered frames, slow under software WebGL; not a timing race.
	test.slow();
	await page.clock.install();
	await page.goto('/play/hoop-flick');
	await page.getByRole('button', { name: 'Play', exact: true }).click();
	await expect(page.locator('.host')).toHaveAttribute('data-phase', 'playing');

	// Pausing stops the clock: 30 s away in the pause menu doesn't count.
	const P = await toPage(page);
	const pause = P(648, 88);
	await page.mouse.click(pause.x, pause.y);
	await expect(page.getByRole('dialog', { name: 'Paused' })).toBeVisible();
	await page.clock.fastForward(30_000);
	await page.getByRole('button', { name: 'Resume' }).click();

	// The game loop clamps each frame to 0.25 s, so advance in frame-sized hops.
	const dialog = page.getByRole('dialog', { name: 'Game over' });
	for (let hops = 0; hops < 200; hops++) await page.clock.fastForward(250);
	await expect(dialog).toBeHidden(); // 50 s of play: still going
	for (let hops = 0; hops < 80 && !(await dialog.isVisible()); hops++) {
		await page.clock.fastForward(250);
	}
	await expect(dialog).toBeVisible();
	await expect(page.getByTestId('final-score')).toHaveText('0');
});
