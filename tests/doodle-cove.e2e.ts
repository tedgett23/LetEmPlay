import { colorFirstPage, expect, inkAt, test } from './helpers';

test('free-style tools draw, erase and undo without losing the pad on reload', async ({ page }) => {
	await page.goto('/play/doodle-cove');
	const button = (name: string) => page.getByRole('button', { name, exact: true });
	async function enter() {
		await button('Play').click();
		await page.getByRole('button', { name: /Free-style/ }).click();
	}
	await enter();
	const paper = page.locator('canvas');
	const b = (await paper.boundingBox())!;
	const tap = (x: number, y: number) =>
		paper.click({ position: { x: (x * b.width) / 400, y: (y * b.height) / 400 } });
	await button('Sky').click();
	await page.mouse.move(b.x + b.width * 0.2, b.y + b.height * 0.5);
	await page.mouse.down();
	await page.mouse.move(b.x + b.width * 0.8, b.y + b.height * 0.5, { steps: 12 });
	await page.mouse.up();
	expect(await inkAt(page, 200, 200)).toEqual([68, 167, 237, 255]);
	expect(await inkAt(page, 200, 206)).toEqual([0, 0, 0, 0]);
	await button('Marker').click();
	await button('Leaf').click();
	await tap(200, 200);
	expect(await inkAt(page, 200, 206)).toEqual([130, 188, 72, 255]);
	await button('Eraser').click();
	await tap(200, 200);
	expect(await inkAt(page, 200, 200)).toEqual([0, 0, 0, 0]);
	await button('Undo').click();
	await page.reload();
	await enter();
	expect(await inkAt(page, 200, 200)).toEqual([130, 188, 72, 255]);
	await button('Clear').click();
	await button('Keep drawing').click();
	expect(await inkAt(page, 200, 206)).toEqual([130, 188, 72, 255]);
});

test('ten separate coloring pages support fill and drawing over the same picture', async ({
	page
}) => {
	await page.goto('/play/doodle-cove');
	await colorFirstPage(page);
	await page.getByRole('button', { name: 'Pen', exact: true }).click();
	await page.getByRole('button', { name: 'Violet', exact: true }).click();
	const paper = page.locator('canvas');
	const b = (await paper.boundingBox())!;
	await paper.click({ position: { x: b.width / 2, y: b.height / 2 } });
	expect(await inkAt(page, 200, 200)).toEqual([121, 87, 200, 255]);
	await page.getByRole('button', { name: /Pages/ }).click();
	await expect(page.locator('.tile')).toHaveCount(10);
	await page.getByRole('button', { name: 'Scoops of summer' }).click();
	expect(await inkAt(page, 195, 140)).toEqual([0, 0, 0, 0]);
	await page.getByRole('button', { name: /Pages/ }).click();
	await page.getByRole('button', { name: 'Cloud cruiser' }).click();
	expect(await inkAt(page, 195, 140)).toEqual([227, 71, 87, 255]);
});
