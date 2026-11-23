// Board rules. A board is a flat array of SIZE*SIZE cells:
// 0 = empty, 1..N = a color index. All functions are pure.
import type { Piece } from './pieces';

export const SIZE = 8;
export type Board = readonly number[];

export function emptyBoard(): number[] {
	return new Array<number>(SIZE * SIZE).fill(0);
}

export const idx = (x: number, y: number) => y * SIZE + x;

export function canPlace(board: Board, piece: Piece, x: number, y: number): boolean {
	if (x < 0 || y < 0 || x + piece.width > SIZE || y + piece.height > SIZE) return false;
	for (const [dx, dy] of piece.cells) if (board[idx(x + dx, y + dy)] !== 0) return false;
	return true;
}

export function place(board: Board, piece: Piece, x: number, y: number, color: number): number[] {
	const next = [...board];
	for (const [dx, dy] of piece.cells) next[idx(x + dx, y + dy)] = color;
	return next;
}

export interface Clears {
	rows: number[];
	cols: number[];
}

export function findClears(board: Board): Clears {
	const rows: number[] = [];
	const cols: number[] = [];
	for (let i = 0; i < SIZE; i++) {
		let rowFull = true;
		let colFull = true;
		for (let j = 0; j < SIZE; j++) {
			if (board[idx(j, i)] === 0) rowFull = false;
			if (board[idx(i, j)] === 0) colFull = false;
		}
		if (rowFull) rows.push(i);
		if (colFull) cols.push(i);
	}
	return { rows, cols };
}

/** Cell indices removed by a set of clears (row/column overlaps counted once). */
export function clearedCells(clears: Clears): number[] {
	const set = new Set<number>();
	for (const r of clears.rows) for (let x = 0; x < SIZE; x++) set.add(idx(x, r));
	for (const c of clears.cols) for (let y = 0; y < SIZE; y++) set.add(idx(c, y));
	return [...set].sort((a, b) => a - b);
}

export function applyClears(board: Board, clears: Clears): number[] {
	const next = [...board];
	for (const i of clearedCells(clears)) next[i] = 0;
	return next;
}

export function fitsAnywhere(board: Board, piece: Piece): boolean {
	for (let y = 0; y <= SIZE - piece.height; y++)
		for (let x = 0; x <= SIZE - piece.width; x++) if (canPlace(board, piece, x, y)) return true;
	return false;
}

export function anyMoveAvailable(board: Board, tray: readonly (Piece | null)[]): boolean {
	return tray.some((p) => p !== null && fitsAnywhere(board, p));
}

export function isEmpty(board: Board): boolean {
	return board.every((c) => c === 0);
}
