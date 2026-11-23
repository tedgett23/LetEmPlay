import type { Page } from '@playwright/test';
import { dragPiece, expect, scoreFirstMove, test, toPage } from './helpers';

// Logical layout (src/lib/games/block-drop/render/layout.ts): 720×1280, 80px cells,
// board at (40, 250), tray slot centers at y=1050, pieces float 1.5 cells + half their
// height above the finger.
const CELL = 80;
const BOARD = { x: 40, y: 250 };
const KEY = 'letemplay:v1:block-drop:run';

test('cancelled drag returns the piece without committing the move', async ({ page }) => {
	await page.goto('/play/block-drop');
	await page.getByRole('button', { name: 'Play', exact: true }).click();
	const point = await toPage(page);
	const from = point(360, 1050);
	const to = point(360, 900);
	await page.mouse.move(from.x, from.y);
	await page.mouse.down();
	await page.locator('.stage').evaluate((el) => {
		el.addEventListener(
			'pointermove',
			(e) => {
				el.dispatchEvent(
					new PointerEvent('pointercancel', { pointerId: (e as PointerEvent).pointerId })
				);
			},
			{ once: true }
		);
	});
	await page.mouse.move(to.x, to.y);
	await page.mouse.up();
	await expect(page.locator('.host')).toHaveAttribute('data-score', '0');
	await dragPiece(page, 1, 360, 900);
	await expect(page.locator('.host')).toHaveAttribute('data-score', /^[1-9]\d*$/);
});

/** Drag the piece in tray `slot` so a 1×1 piece lands on board cell (cx, cy). */
async function dragDotTo(page: Page, slot: number, cx: number, cy: number) {
	const cellCenter = { x: BOARD.x + cx * CELL + CELL / 2, y: BOARD.y + cy * CELL + CELL / 2 };
	await dragPiece(page, slot, cellCenter.x, cellCenter.y + CELL / 2 + 1.5 * CELL);
}

async function seedRun(page: Page, origin: string, board: number[], tray: unknown[], score = 0) {
	const value = JSON.stringify({
		v: 1,
		d: { board, tray, score, combo: 0, rngState: 12345, over: false }
	});
	await page
		.context()
		.setStorageState({ cookies: [], origins: [{ origin, localStorage: [{ name: KEY, value }] }] });
}

test('continue a saved run and clear a line', async ({ page, baseURL }) => {
	const board = new Array<number>(64).fill(0);
	for (let x = 0; x < 7; x++) board[x] = 2; // row 0 missing its last cell
	board[63] = 4; // keep one tile so this isn't a whole-board clear
	await seedRun(
		page,
		baseURL!,
		board,
		[{ pieceId: 'dot', color: 1 }, { pieceId: 'o2', color: 3 }, null],
		50
	);

	await page.goto('/play/block-drop');
	await page.getByRole('button', { name: 'Continue' }).click();
	await dragDotTo(page, 0, 7, 0);

	// 50 + 1 cell + 10 for one line.
	await expect(page.locator('.host')).toHaveAttribute('data-score', '61');

	// Progress is saved: leave and come back, Continue is offered again.
	await page.goto('/play/block-drop');
	await page.getByRole('button', { name: 'Continue' }).click();
	await expect(page.locator('.host')).toHaveAttribute('data-score', '61');
});

test('game over when no tray piece fits, and the best score is kept', async ({ page, baseURL }) => {
	// Checkerboard with no 2×2 hole and no full line; row 4 is full except its last cell.
	const board = Array.from({ length: 64 }, (_, i) => {
		const x = i % 8;
		const y = Math.floor(i / 8);
		if (y === 4) return x < 7 ? 1 : 0;
		return (x + y) % 2 === 0 ? 1 : 0;
	});
	await seedRun(page, baseURL!, board, [
		{ pieceId: 'dot', color: 2 },
		{ pieceId: 'o2', color: 3 },
		null
	]);

	await page.goto('/play/block-drop');
	await page.getByRole('button', { name: 'Continue' }).click();
	await dragDotTo(page, 0, 7, 4); // clears row 4, leaving nowhere for the 2×2
	await expect(page.locator('.host')).toHaveAttribute('data-score', '11');

	// Generous timeout: the game-over fade is several frames, and software WebGL in CI is slow.
	await expect(page.getByTestId('final-score')).toHaveText('11', { timeout: 15_000 });
	await expect(page.getByRole('dialog', { name: 'Game over' })).toContainText('New best!');

	// The finished run is gone, and the best score shows on the home card.
	await page.goto('/play/block-drop');
	await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
	await page.goto('/');
	await expect(page.getByRole('link', { name: /Block Drop/ })).toContainText('Best: 11');
});

test('pause menu: resume and restart', async ({ page }) => {
	await page.goto('/play/block-drop');
	await scoreFirstMove(page);
	const P = await toPage(page);
	const pause = P(648, 88);
	await page.mouse.click(pause.x, pause.y);
	await expect(page.getByRole('dialog', { name: 'Paused' })).toBeVisible();
	await page.getByRole('button', { name: 'Resume' }).click();
	await expect(page.getByRole('dialog', { name: 'Paused' })).toBeHidden();
	await page.mouse.click(pause.x, pause.y);
	await page.getByRole('button', { name: 'Restart' }).click();
	await expect(page.locator('.host')).toHaveAttribute('data-phase', 'playing');
	await expect(page.locator('.host')).toHaveAttribute('data-score', '0');
});
