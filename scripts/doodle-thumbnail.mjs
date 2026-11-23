// Color a real book page with the bucket, then crop the photo to the paper.
export async function doodleThumbnail(page, out, origin) {
	await page.goto(`${origin}/play/doodle-cove`);
	for (const name of ['Play', 'Coloring book', 'Cloud cruiser'])
		await page.getByRole('button', { name, exact: name !== 'Coloring book' }).click();
	const canvas = page.locator('.paper canvas');
	const { width, height } = await canvas.boundingBox();
	for (const [color, x, y] of [
		['Sky', 15, 16],
		['Leaf', 78, 363],
		['Pink', 117, 139],
		['Sunshine', 167, 149],
		['Berry', 195, 140],
		['Violet', 196, 248],
		['Cocoa', 181, 317],
		['Orange', 200, 291],
		['Sunshine', 324, 70]
	]) {
		await page.getByRole('button', { name: color, exact: true }).click();
		await canvas.click({ position: { x: (x * width) / 400, y: (y * height) / 400 } });
	}
	await page
		.locator('.paper')
		.screenshot({ path: `${out}/doodle-cove.jpg`, type: 'jpeg', quality: 83 });
}
