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
	['/play/hoop-flick', 'Hoop Flick'],
	['/play/rail-dash', 'Rail Dash']
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
 * WebKit has no DevTools input API, so dispatch the pointer sequence inside the page, waiting
 * between events on the page's own clock so the game measures an exact speed. Uses the mouse
 * pointer id, which is always active, so the game's pointer capture accepts it.
 */
async function pageFlick(page: Page, speed: number) {
	const point = await toPage(page);
	const start = point(BALL_IN_HAND.x, BALL_IN_HAND.y);
	const scale = point(1, 0).x - point(0, 0).x;
	await page.evaluate(
		({ x, y, perMs }) => {
			const target = document.elementFromPoint(x, y)!;
			const fire = (type: string, cy: number) =>
				target.dispatchEvent(
					new PointerEvent(type, {
						bubbles: true,
						cancelable: true,
						pointerId: 1,
						pointerType: 'mouse',
						isPrimary: true,
						clientX: x,
						clientY: cy,
						buttons: type === 'pointerup' ? 0 : 1
					})
				);
			const wait = (ms: number) => {
				const until = performance.now() + ms;
				while (performance.now() < until) {
					/* hold the main thread so the gap is exact */
				}
			};
			fire('pointerdown', y);
			for (let i = 1; i <= 8; i++) {
				wait(16);
				fire('pointermove', y - perMs * 16 * i);
			}
			fire('pointerup', y - perMs * 16 * 8);
		},
		{ x: start.x, y: start.y, perMs: speed * scale }
	);
}

/** One perfect flick from the ball in hand; it must score. */
export async function flickBasket(page: Page) {
	const host = page.locator('.host');
	await expect(host).toHaveAttribute('data-phase', 'playing');
	const before = await host.getAttribute('data-score');
	if (page.context().browser()?.browserType().name() === 'chromium') {
		await cdpFlick(page, PERFECT_FLICK);
	} else {
		await pageFlick(page, PERFECT_FLICK);
	}
	await expect(host).not.toHaveAttribute('data-score', before!, { timeout: 5000 });
}

// ---- Rail Dash -------------------------------------------------------------------------------

/** Swipe across the middle of the stage. */
export async function swipe(page: Page, dir: 'left' | 'right' | 'up' | 'down') {
	const box = (await page.locator('.stage').boundingBox())!;
	const x = box.x + box.width / 2;
	const y = box.y + box.height * 0.6;
	const d = 90;
	const [dx, dy] = { left: [-d, 0], right: [d, 0], up: [0, -d], down: [0, d] }[dir];
	await page.mouse.move(x, y);
	await page.mouse.down();
	await page.mouse.move(x + dx! / 2, y + dy! / 2);
	await page.mouse.move(x + dx!, y + dy!);
	await page.mouse.up();
}

/** Make Math.random repeatable in the page, so a run's generated track is the same every time. */
export async function seedRandom(page: Page, seed = 1) {
	await page.addInitScript((s) => {
		let t = s >>> 0;
		Math.random = () => {
			t = (t + 0x6d2b79f5) >>> 0;
			let r = Math.imul(t ^ (t >>> 15), t | 1);
			r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
			return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
		};
	}, seed);
}
