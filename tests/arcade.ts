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
	['/play/block-drop', 'Block Drop'],
	['/play/hoop-flick', 'Hoop Flick']
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

// ---- Hoop Flick ------------------------------------------------------------------------------

/** Upward flick speed (logical px/ms) that lands on the hoop; see hoop-flick/logic/tuning.ts. */
const PERFECT_FLICK = 2.6;
const BALL_IN_HAND = { x: 360, y: 1150 };

/**
 * One upward flick from the ball in hand at `speed` logical px/ms, as touch events with exact
 * timestamps through the DevTools protocol. Chromium only. Its emulator delivers `page.mouse`
 * moves a frame apart, and frames take hundreds of ms under software WebGL, so a mouse flick
 * there can't reach a real speed.
 */
async function cdpFlick(page: Page, speed: number) {
	const point = await toPage(page);
	const cdp = await page.context().newCDPSession(page);
	const start = point(BALL_IN_HAND.x, BALL_IN_HAND.y);
	const scale = point(1, 0).x - point(0, 0).x;
	const t0 = Date.now() / 1000;
	const at = (i: number) => ({ x: start.x, y: start.y - speed * scale * 16 * i });
	await cdp.send('Input.dispatchTouchEvent', {
		type: 'touchStart',
		touchPoints: [at(0)],
		timestamp: t0
	});
	for (let i = 1; i <= 8; i++) {
		await cdp.send('Input.dispatchTouchEvent', {
			type: 'touchMove',
			touchPoints: [at(i)],
			timestamp: t0 + (16 * i) / 1000
		});
	}
	await cdp.send('Input.dispatchTouchEvent', {
		type: 'touchEnd',
		touchPoints: [],
		timestamp: t0 + (16 * 8 + 1) / 1000
	});
	await cdp.detach();
}

/**
 * Flick the ball until a basket scores. On WebKit, Playwright can't fix the time between mouse
 * moves, so each attempt measures the speed the page actually saw (the game's own
 * trailing-window rule) and scales the next flick toward a perfect one.
 */
export async function flickBasket(page: Page, maxAttempts = 6) {
	const host = page.locator('.host');
	await expect(host).toHaveAttribute('data-phase', 'playing');
	const before = Number(await host.getAttribute('data-score'));
	const scored = async () => {
		try {
			await expect(host).not.toHaveAttribute('data-score', String(before), { timeout: 2500 });
			return true;
		} catch {
			return false;
		}
	};

	if (page.context().browser()?.browserType().name() === 'chromium') {
		await cdpFlick(page, PERFECT_FLICK);
		if (await scored()) return;
		throw new Error('a perfect flick missed');
	}

	await page.evaluate(() => {
		const w = window as unknown as {
			__flick?: { t: number; y: number }[];
			__flickHooked?: boolean;
		};
		if (w.__flickHooked) return;
		w.__flickHooked = true;
		w.__flick = [];
		const rec = (e: PointerEvent) => w.__flick!.push({ t: e.timeStamp, y: e.clientY });
		window.addEventListener('pointerdown', (e) => ((w.__flick = []), rec(e)), { capture: true });
		window.addEventListener('pointermove', rec, { capture: true });
		window.addEventListener('pointerup', rec, { capture: true });
	});
	const point = await toPage(page);
	const scale = point(1, 0).x - point(0, 0).x; // CSS px per logical px
	let perMove = 20; // logical px per mouse move; adjusted after each attempt

	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		const start = point(BALL_IN_HAND.x, BALL_IN_HAND.y);
		await page.mouse.move(start.x, start.y);
		await page.mouse.down();
		for (let i = 1; i <= 8; i++) await page.mouse.move(start.x, start.y - perMove * scale * i);
		await page.mouse.up();

		const seen = await page.evaluate(() => {
			const s = (window as unknown as { __flick: { t: number; y: number }[] }).__flick;
			const last = s[s.length - 1]!;
			let first = s[0]!;
			for (let i = s.length - 2; i >= 0; i--) {
				first = s[i]!;
				if (last.t - first.t >= 80) break;
			}
			return (first.y - last.y) / Math.max(last.t - first.t, 1);
		});
		const logicalSpeed = seen / scale;
		perMove *= Math.min(Math.max(PERFECT_FLICK / Math.max(logicalSpeed, 0.1), 0.4), 2.5);
		if (await scored()) return;
	}
	throw new Error('no basket after several flicks');
}
