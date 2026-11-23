// Block Drop layout in logical units (720×1280 portrait). Pure math so it can be unit tested.
import type { Piece } from '../logic/pieces';
import { SIZE } from '../logic/board';

export const W = 720;
export const H = 1280;

export const CELL = 80;
export const BOARD_X = 40;
export const BOARD_Y = 250;
export const BOARD_PX = CELL * SIZE;

export const SLOT_W = W / 3;
export const TRAY_Y = 1050; // slot centers
export const TRAY_TOP = BOARD_Y + BOARD_PX + 20;
export const TRAY_CELL = 44;

export const PAUSE = { x: 600, y: 40, size: 96 };

/** How far above the finger a dragged piece floats, in cells. */
export const LIFT_CELLS = 1.5;

export interface Pt {
	x: number;
	y: number;
}

export function cellCenter(index: number): Pt {
	return {
		x: BOARD_X + (index % SIZE) * CELL + CELL / 2,
		y: BOARD_Y + Math.floor(index / SIZE) * CELL + CELL / 2
	};
}

export function slotCenter(slot: number): Pt {
	return { x: SLOT_W * slot + SLOT_W / 2, y: TRAY_Y };
}

/** Which tray slot a point is in, or null. Generous hit areas for small fingers. */
export function slotAt(p: Pt): number | null {
	if (p.y < TRAY_TOP || p.y > H) return null;
	const slot = Math.floor(p.x / SLOT_W);
	return slot >= 0 && slot < 3 ? slot : null;
}

export function inPause(p: Pt): boolean {
	const pad = 24;
	return (
		p.x >= PAUSE.x - pad &&
		p.x <= PAUSE.x + PAUSE.size + pad &&
		p.y >= PAUSE.y - pad &&
		p.y <= PAUSE.y + PAUSE.size + pad
	);
}

/** Center of the dragged piece for a finger position: lifted so the finger doesn't hide it. */
export function dragCenter(finger: Pt, piece: Piece): Pt {
	return { x: finger.x, y: finger.y - (piece.height * CELL) / 2 - LIFT_CELLS * CELL };
}

/** Board cell (top-left of the piece) nearest to where the dragged piece is drawn. */
export function snap(center: Pt, piece: Piece): Pt {
	return {
		x: Math.round((center.x - (piece.width * CELL) / 2 - BOARD_X) / CELL),
		y: Math.round((center.y - (piece.height * CELL) / 2 - BOARD_Y) / CELL)
	};
}

/** Offset of cell (dx, dy) from a piece's center, at a given cell size. */
export function cellOffset(piece: Piece, dx: number, dy: number, cell: number): Pt {
	return {
		x: (dx - piece.width / 2 + 0.5) * cell,
		y: (dy - piece.height / 2 + 0.5) * cell
	};
}
