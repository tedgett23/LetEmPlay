// Photograph a real kick a few simulation frames after launch. The fixed clock keeps the
// ball and its ribbon in the frame on software WebGL as well as on a fast GPU.
export async function goalThumbnail(page, out, origin) {
	await page.setViewportSize({ width: 500, height: 560 });
	await page.goto(`${origin}/play/goal`);
	await page.getByRole('button', { name: 'Play', exact: true }).click();
	await page.addStyleTag({ content: '.goal-hud{visibility:hidden}' });
	await page.clock.install();
	await page.clock.pauseAt(new Date(Date.now() + 1000));
	await page.mouse.move(248, 430);
	await page.mouse.down();
	await page.mouse.move(260, 250, { steps: 5 });
	await page.mouse.up();
	await page.clock.runFor(150);
	await page.screenshot({
		path: `${out}/goal.jpg`,
		type: 'jpeg',
		quality: 87,
		clip: { x: 0, y: 0, width: 500, height: 500 }
	});
}
