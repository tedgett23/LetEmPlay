// Whole-game state machine for Block Drop. Pure and serializable, so the renderer stays
// dumb and a saved run can be restored exactly (MVP.md §10.1 "Persistence").
import {
	anyMoveAvailable,
	applyClears,
	canPlace,
	clearedCells,
	emptyBoard,
	findClears,
	fitsAnywhere,
	idx,
	isEmpty,
	place,
	type Clears
} from './board';
import { PIECES, pieceById, type Piece } from './pieces';
import { createRng, pickWeighted, type Rng } from './rng';

export const COLORS = 4; // red, yellow, green, blue (see render/textures.ts)
export const TRAY_SIZE = 3;

export interface TrayPiece {
	pieceId: string;
	color: number; // 1..COLORS
}

export interface GameState {
	board: number[];
	tray: (TrayPiece | null)[];
	score: number;
	/** Consecutive placements that cleared at least one line. */
	combo: number;
	rngState: number;
	over: boolean;
}

// ---- Scoring -------------------------------------------------------------------------------

export const POINTS_PER_CELL = 1;
export const BOARD_CLEAR_BONUS = 300;

/** Bonus for clearing `lines` at once during combo step `combo` (1 = first clear in a row). */
export function clearBonus(lines: number, combo: number): number {
	if (lines === 0) return 0;
	return 10 * lines * lines * Math.max(combo, 1);
}

// ---- Dealing -------------------------------------------------------------------------------

function randomTrayPiece(rng: Rng, pool: readonly Piece[] = PIECES): TrayPiece {
	const piece = pickWeighted(rng, pool, (p) => p.weight);
	return { pieceId: piece.id, color: 1 + rng.int(COLORS) };
}

/**
 * Deal three pieces. Fairness rule: if any piece in the whole set fits the board, at least one
 * dealt piece fits too. Only a truly full board can end the game on a fresh deal.
 */
export function dealTray(rng: Rng, board: readonly number[]): TrayPiece[] {
	const tray = Array.from({ length: TRAY_SIZE }, () => randomTrayPiece(rng));
	const fits = (t: TrayPiece) => fitsAnywhere(board, pieceById(t.pieceId));
	if (tray.some(fits)) return tray;
	const fitting = PIECES.filter((p) => fitsAnywhere(board, p));
	if (fitting.length === 0) return tray;
	tray[rng.int(TRAY_SIZE)] = randomTrayPiece(rng, fitting);
	return tray;
}

// ---- State transitions ---------------------------------------------------------------------

export function newGame(seed: number): GameState {
	const rng = createRng(seed);
	const board = emptyBoard();
	const tray = dealTray(rng, board);
	return { board, tray, score: 0, combo: 0, rngState: rng.state, over: false };
}

export function trayPieces(state: GameState): (Piece | null)[] {
	return state.tray.map((t) => (t ? pieceById(t.pieceId) : null));
}

export interface MoveResult {
	state: GameState;
	/** Board cell indices the piece now occupies. */
	placedCells: number[];
	clears: Clears;
	/** Board cell indices that were cleared (with their color before clearing). */
	clearedCells: { index: number; color: number }[];
	points: number;
	boardCleared: boolean;
	/** True if the tray was refilled after this move. */
	dealt: boolean;
}

/** Place tray piece `slot` with its top-left at (x, y). Returns null if the move is illegal. */
export function applyMove(state: GameState, slot: number, x: number, y: number): MoveResult | null {
	if (state.over) return null;
	const tp = state.tray[slot];
	if (!tp) return null;
	const piece = pieceById(tp.pieceId);
	if (!canPlace(state.board, piece, x, y)) return null;

	const placedBoard = place(state.board, piece, x, y, tp.color);
	const placedCells = piece.cells.map(([dx, dy]) => idx(x + dx, y + dy));
	const clears = findClears(placedBoard);
	const lines = clears.rows.length + clears.cols.length;
	const cleared = clearedCells(clears).map((index) => ({ index, color: placedBoard[index]! }));
	const board = applyClears(placedBoard, clears);

	const combo = lines > 0 ? state.combo + 1 : 0;
	const boardCleared = lines > 0 && isEmpty(board);
	const points =
		piece.cells.length * POINTS_PER_CELL +
		clearBonus(lines, combo) +
		(boardCleared ? BOARD_CLEAR_BONUS : 0);

	let tray = state.tray.map((t, i) => (i === slot ? null : t));
	const rng = createRng(state.rngState);
	let dealt = false;
	if (tray.every((t) => t === null)) {
		tray = dealTray(rng, board);
		dealt = true;
	}

	const next: GameState = {
		board,
		tray,
		score: state.score + points,
		combo,
		rngState: rng.state,
		over: false
	};
	next.over = !anyMoveAvailable(board, trayPieces(next));

	return { state: next, placedCells, clears, clearedCells: cleared, points, boardCleared, dealt };
}

/** Recompute `over` (used when restoring a saved run). */
export function checkOver(state: GameState): GameState {
	return { ...state, over: !anyMoveAvailable(state.board, trayPieces(state)) };
}

/** Light validation for data read back from storage. */
export function isGameState(v: unknown): v is GameState {
	if (!v || typeof v !== 'object') return false;
	const s = v as GameState;
	return (
		Array.isArray(s.board) &&
		s.board.length === 64 &&
		s.board.every((c) => Number.isInteger(c) && c >= 0 && c <= COLORS) &&
		Array.isArray(s.tray) &&
		s.tray.length === TRAY_SIZE &&
		s.tray.every(
			(t) =>
				t === null ||
				(typeof t === 'object' &&
					PIECES.some((p) => p.id === t.pieceId) &&
					Number.isInteger(t.color) &&
					t.color >= 1 &&
					t.color <= COLORS)
		) &&
		Number.isFinite(s.score) &&
		Number.isInteger(s.combo) &&
		Number.isInteger(s.rngState)
	);
}
