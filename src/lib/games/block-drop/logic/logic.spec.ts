import { describe, expect, it } from 'vitest';
import {
	anyMoveAvailable,
	applyClears,
	canPlace,
	clearedCells,
	emptyBoard,
	findClears,
	fitsAnywhere,
	idx,
	place,
	SIZE
} from './board';
import { PIECES, pieceById } from './pieces';
import { createRng } from './rng';
import {
	applyMove,
	BOARD_CLEAR_BONUS,
	checkOver,
	clearBonus,
	dealTray,
	isGameState,
	newGame,
	type GameState
} from './game';

/** Board from ASCII: '#' filled (color 1), '.' empty. */
function boardFrom(art: string): number[] {
	const rows = art
		.trim()
		.split('\n')
		.map((r) => r.trim());
	return rows.flatMap((r) => [...r].map((c) => (c === '#' ? 1 : 0)));
}

const FULL_BUT_ROW0 = boardFrom(`
	........
	########
	########
	########
	########
	########
	########
	########
`);

describe('pieces', () => {
	it('have unique ids, valid sizes and positive weights', () => {
		const ids = new Set(PIECES.map((p) => p.id));
		expect(ids.size).toBe(PIECES.length);
		for (const p of PIECES) {
			expect(p.weight).toBeGreaterThan(0);
			expect(p.width).toBeLessThanOrEqual(5);
			expect(p.height).toBeLessThanOrEqual(5);
			expect(Math.min(...p.cells.map(([x]) => x))).toBe(0);
			expect(Math.min(...p.cells.map(([, y]) => y))).toBe(0);
		}
	});

	it('parses shapes correctly', () => {
		expect(pieceById('t-up').cells).toEqual([
			[1, 0],
			[0, 1],
			[1, 1],
			[2, 1]
		]);
		expect(pieceById('o3').cells).toHaveLength(9);
		expect(pieceById('l5a').cells).toHaveLength(5);
	});
});

describe('board', () => {
	it('canPlace respects bounds and occupied cells', () => {
		const b = emptyBoard();
		const i3 = pieceById('i3h');
		expect(canPlace(b, i3, 0, 0)).toBe(true);
		expect(canPlace(b, i3, 5, 7)).toBe(true);
		expect(canPlace(b, i3, 6, 0)).toBe(false);
		expect(canPlace(b, i3, -1, 0)).toBe(false);
		const filled = place(b, pieceById('dot'), 2, 0, 1);
		expect(canPlace(filled, i3, 0, 0)).toBe(false);
		expect(canPlace(filled, i3, 3, 0)).toBe(true);
	});

	it('place does not mutate the input', () => {
		const b = emptyBoard();
		const next = place(b, pieceById('o2'), 0, 0, 2);
		expect(b.every((c) => c === 0)).toBe(true);
		expect([next[idx(0, 0)], next[idx(1, 0)], next[idx(0, 1)], next[idx(1, 1)]]).toEqual([
			2, 2, 2, 2
		]);
	});

	it('finds full rows and columns together', () => {
		const b = emptyBoard();
		for (let i = 0; i < SIZE; i++) {
			b[idx(i, 3)] = 1; // row 3
			b[idx(5, i)] = 2; // col 5
		}
		const clears = findClears(b);
		expect(clears).toEqual({ rows: [3], cols: [5] });
		expect(clearedCells(clears)).toHaveLength(15); // overlap counted once
		expect(applyClears(b, clears).every((c) => c === 0)).toBe(true);
	});

	it('fitsAnywhere / anyMoveAvailable', () => {
		expect(fitsAnywhere(FULL_BUT_ROW0, pieceById('i5h'))).toBe(true);
		expect(fitsAnywhere(FULL_BUT_ROW0, pieceById('i2v'))).toBe(false);
		expect(anyMoveAvailable(FULL_BUT_ROW0, [pieceById('o2'), null, pieceById('i2v')])).toBe(false);
		expect(anyMoveAvailable(FULL_BUT_ROW0, [null, pieceById('dot'), null])).toBe(true);
	});
});

describe('scoring', () => {
	it('rewards multi-line clears quadratically and combos linearly', () => {
		expect(clearBonus(0, 3)).toBe(0);
		expect(clearBonus(1, 1)).toBe(10);
		expect(clearBonus(2, 1)).toBe(40);
		expect(clearBonus(3, 1)).toBe(90);
		expect(clearBonus(2, 3)).toBe(120);
	});
});

describe('dealTray', () => {
	it('is deterministic for a seed', () => {
		expect(dealTray(createRng(42), emptyBoard())).toEqual(dealTray(createRng(42), emptyBoard()));
	});

	it('always deals at least one fitting piece when any piece could fit', () => {
		// Only a single empty cell → only "dot" fits.
		const b = boardFrom(`
			#######.
			########
			########
			########
			########
			########
			########
			########
		`);
		for (let seed = 0; seed < 300; seed++) {
			const tray = dealTray(createRng(seed), b);
			expect(
				tray.some((t) => t.pieceId === 'dot'),
				`seed ${seed}`
			).toBe(true);
		}
	});

	it('uses only valid colors', () => {
		const rng = createRng(7);
		for (let i = 0; i < 100; i++)
			for (const t of dealTray(rng, emptyBoard())) {
				expect(t.color).toBeGreaterThanOrEqual(1);
				expect(t.color).toBeLessThanOrEqual(4);
			}
	});
});

function stateWith(board: number[], tray: GameState['tray'], extra: Partial<GameState> = {}) {
	return { board, tray, score: 0, combo: 0, rngState: 1, over: false, ...extra };
}

describe('applyMove', () => {
	it('places, scores cells, and empties the tray slot', () => {
		const s = newGame(1);
		const slot = 0;
		const piece = pieceById(s.tray[slot]!.pieceId);
		const r = applyMove(s, slot, 0, 0)!;
		expect(r).not.toBeNull();
		expect(r.points).toBe(piece.cells.length);
		expect(r.state.tray[slot]).toBeNull();
		expect(r.placedCells).toHaveLength(piece.cells.length);
		expect(s.board.every((c) => c === 0)).toBe(true); // input untouched
	});

	it('rejects illegal moves', () => {
		const s = stateWith(FULL_BUT_ROW0, [{ pieceId: 'i2v', color: 1 }, null, null]);
		expect(applyMove(s, 0, 0, 0)).toBeNull();
		expect(applyMove(s, 1, 0, 0)).toBeNull(); // empty slot
		expect(applyMove({ ...s, over: true }, 0, 0, 0)).toBeNull();
	});

	it('clears lines, applies combo, clears the board, and deals a new tray when empty', () => {
		const s = stateWith(emptyBoard(), [
			null,
			{ pieceId: 'i4h', color: 2 },
			{ pieceId: 'i4h', color: 3 }
		]);
		const first = applyMove(s, 1, 0, 0)!;
		expect(first.clears).toEqual({ rows: [], cols: [] });
		expect(first.state.combo).toBe(0);
		expect(first.points).toBe(4);
		expect(first.dealt).toBe(false);

		const second = applyMove(first.state, 2, 4, 0)!;
		expect(second.clears).toEqual({ rows: [0], cols: [] });
		expect(second.clearedCells.map((c) => c.color)).toEqual([2, 2, 2, 2, 3, 3, 3, 3]);
		expect(second.state.combo).toBe(1);
		expect(second.boardCleared).toBe(true);
		expect(second.points).toBe(4 + clearBonus(1, 1) + BOARD_CLEAR_BONUS);
		expect(second.dealt).toBe(true);
		expect(second.state.tray.every((t) => t !== null)).toBe(true);
		expect(second.state.over).toBe(false);
	});

	it('grows the combo on consecutive clears', () => {
		const b = emptyBoard();
		for (let x = 0; x < 7; x++) {
			b[idx(x, 0)] = 1;
			b[idx(x, 1)] = 1;
		}
		const s = stateWith(
			b,
			[
				{ pieceId: 'dot', color: 1 },
				{ pieceId: 'dot', color: 1 },
				{ pieceId: 'dot', color: 1 }
			],
			{ combo: 2 }
		);
		const r = applyMove(s, 0, 7, 0)!;
		expect(r.state.combo).toBe(3);
		expect(r.points).toBe(1 + clearBonus(1, 3));
	});

	it('resets the combo on a placement that clears nothing', () => {
		const s = stateWith(emptyBoard(), [{ pieceId: 'dot', color: 1 }, null, null], { combo: 4 });
		expect(applyMove(s, 0, 0, 0)!.state.combo).toBe(0);
	});

	it('ends the game when nothing in the tray fits', () => {
		// No full lines and no 2x2 hole anywhere, even after row 4 clears.
		const b = boardFrom(`
			#.#.#.#.
			.#.#.#.#
			#.#.#.#.
			.#.#.#.#
			#######.
			.#.#.#.#
			#.#.#.#.
			.#.#.#.#
		`);
		const s = stateWith(b, [{ pieceId: 'dot', color: 1 }, { pieceId: 'o2', color: 1 }, null]);
		const r = applyMove(s, 0, 7, 4)!;
		expect(r.clears).toEqual({ rows: [4], cols: [] });
		expect(r.state.over).toBe(true);
	});
});

describe('persistence helpers', () => {
	it('validates saved state and recomputes game over', () => {
		const s = newGame(3);
		expect(isGameState(JSON.parse(JSON.stringify(s)))).toBe(true);
		expect(isGameState({ ...s, board: [1, 2] })).toBe(false);
		expect(isGameState({ ...s, tray: [{ pieceId: 'nope', color: 1 }, null, null] })).toBe(false);
		const stuck = stateWith(FULL_BUT_ROW0, [{ pieceId: 'o2', color: 1 }, null, null]);
		expect(checkOver(stuck).over).toBe(true);
	});

	it('a full random playthrough never makes an illegal state', () => {
		let s = newGame(99);
		let moves = 0;
		const rng = createRng(5);
		while (!s.over && moves < 500) {
			const options: [number, number, number][] = [];
			s.tray.forEach((t, slot) => {
				if (!t) return;
				const p = pieceById(t.pieceId);
				for (let y = 0; y < 8; y++)
					for (let x = 0; x < 8; x++) if (canPlace(s.board, p, x, y)) options.push([slot, x, y]);
			});
			expect(options.length).toBeGreaterThan(0);
			const [slot, x, y] = options[rng.int(options.length)]!;
			s = applyMove(s, slot, x, y)!.state;
			expect(isGameState(s)).toBe(true);
			moves++;
		}
		expect(moves).toBeGreaterThan(5);
	});
});
