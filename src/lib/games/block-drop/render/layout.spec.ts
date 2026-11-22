import { describe, expect, it } from 'vitest';
import { pieceById } from '../logic/pieces';
import { BOARD_X, BOARD_Y, CELL, cellCenter, dragCenter, inPause, slotAt, snap } from './layout';

describe('layout', () => {
	it('snaps a piece drawn exactly over a cell to that cell', () => {
		const p = pieceById('o2');
		const center = { x: BOARD_X + 3 * CELL + CELL, y: BOARD_Y + 5 * CELL + CELL };
		expect(snap(center, p)).toEqual({ x: 3, y: 5 });
		// Up to just under half a cell off still snaps to the same place.
		expect(snap({ x: center.x + CELL * 0.45, y: center.y - CELL * 0.45 }, p)).toEqual({
			x: 3,
			y: 5
		});
	});

	it('lifts the dragged piece above the finger', () => {
		const p = pieceById('i3v');
		const c = dragCenter({ x: 300, y: 1000 }, p);
		expect(c.x).toBe(300);
		expect(c.y + (p.height * CELL) / 2).toBeLessThan(1000); // bottom edge above the finger
	});

	it('maps tray and pause hit areas', () => {
		expect(slotAt({ x: 10, y: 1050 })).toBe(0);
		expect(slotAt({ x: 360, y: 1050 })).toBe(1);
		expect(slotAt({ x: 710, y: 1200 })).toBe(2);
		expect(slotAt({ x: 360, y: 500 })).toBeNull();
		expect(inPause({ x: 640, y: 80 })).toBe(true);
		expect(inPause({ x: 300, y: 80 })).toBe(false);
	});

	it('cell centers line up with the board grid', () => {
		expect(cellCenter(0)).toEqual({ x: BOARD_X + CELL / 2, y: BOARD_Y + CELL / 2 });
		expect(cellCenter(63)).toEqual({ x: BOARD_X + 7.5 * CELL, y: BOARD_Y + 7.5 * CELL });
	});
});
