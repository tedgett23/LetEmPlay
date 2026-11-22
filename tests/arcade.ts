import { expect, test as base, type Page } from '@playwright/test';

// Report exceptions from game callbacks at their source, rather than just timing out on a score.
export const test = base.extend({
	page: async ({ page }, use) => {
		const errors: string[] = [];
		page.on('pageerror', (e) => errors.push(e.stack ?? String(e)));
		await use(page);
		expect(errors, 'uncaught browser errors').toEqual([]);
	}
});
export { expect };

export const routes = [
	['/', 'Arcade'],
	['/settings', 'Settings'],
	['/parents', 'For parents'],
	['/credits', 'Credits'],
	['/play/block-drop', 'Block Drop']
] as const;

export async function visit(page: Page, path: string, heading: string) {
	const response = await page.goto(path);
	expect(response?.ok(), path).toBe(true);
	await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
}

/** Convert the game's letterboxed logical coordinates to browser CSS pixels. */
export async function toPage(page: Page) {
	const host = (await page.locator('.stage').boundingBox())!;
	const s = Math.min(host.width / 720, host.height / 1280);
	const ox = host.x + (host.width - 720 * s) / 2;
	const oy = host.y + (host.height - 1280 * s) / 2;
	return (x: number, y: number) => ({ x: ox + x * s, y: oy + y * s });
}

export async function dragPiece(page: Page, slot: number, x: number, y: number) {
	await expect(page.locator('.host')).toHaveAttribute('data-phase', 'playing');
	const point = await toPage(page);
	const from = point(240 * slot + 120, 1050);
	const to = point(x, y);
	await page.mouse.move(from.x, from.y);
	await page.mouse.down();
	await page.mouse.move(to.x, to.y);
	await page.mouse.up();
}

/** Any opening piece fits here on an empty board, regardless of the random seed. */
export async function scoreFirstMove(page: Page) {
	await page.getByRole('button', { name: 'Play', exact: true }).click();
	await dragPiece(page, 1, 360, 900);
	await expect(page.locator('.host')).toHaveAttribute('data-score', /^[1-9]\d*$/);
}
