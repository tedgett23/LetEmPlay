// The piece set (MVP.md §10.1). No rotation: every orientation is its own piece.
// Shapes are drawn as ASCII so they're easy to review.

export interface Piece {
	id: string;
	/** [x, y] offsets from the piece's top-left. */
	cells: readonly (readonly [number, number])[];
	width: number;
	height: number;
	/** Relative chance of being dealt. Small/medium pieces are more common. */
	weight: number;
}

function shape(id: string, weight: number, art: string): Piece {
	const rows = art
		.trim()
		.split('\n')
		.map((r) => r.trim());
	const cells: [number, number][] = [];
	rows.forEach((row, y) => [...row].forEach((ch, x) => ch === '#' && cells.push([x, y])));
	return {
		id,
		cells,
		width: Math.max(...cells.map(([x]) => x)) + 1,
		height: Math.max(...cells.map(([, y]) => y)) + 1,
		weight
	};
}

export const PIECES: readonly Piece[] = [
	shape('dot', 4, '#'),

	shape('i2h', 6, '##'),
	shape('i2v', 6, '#\n#'),
	shape('i3h', 6, '###'),
	shape('i3v', 6, '#\n#\n#'),
	shape('i4h', 4, '####'),
	shape('i4v', 4, '#\n#\n#\n#'),
	shape('i5h', 2, '#####'),
	shape('i5v', 2, '#\n#\n#\n#\n#'),

	shape('o2', 6, '##\n##'),
	shape('o3', 2, '###\n###\n###'),

	// Small corners (3 cells)
	shape('l3a', 4, '#.\n##'),
	shape('l3b', 4, '.#\n##'),
	shape('l3c', 4, '##\n#.'),
	shape('l3d', 4, '##\n.#'),

	// Big corners (5 cells)
	shape('l5a', 2, '#..\n#..\n###'),
	shape('l5b', 2, '..#\n..#\n###'),
	shape('l5c', 2, '###\n#..\n#..'),
	shape('l5d', 2, '###\n..#\n..#'),

	// L/J tetrominoes
	shape('l4a', 3, '#.\n#.\n##'),
	shape('l4b', 3, '.#\n.#\n##'),
	shape('l4c', 3, '###\n#..'),
	shape('l4d', 3, '###\n..#'),
	shape('l4e', 3, '##\n#.\n#.'),
	shape('l4f', 3, '##\n.#\n.#'),
	shape('l4g', 3, '#..\n###'),
	shape('l4h', 3, '..#\n###'),

	// T
	shape('t-up', 3, '.#.\n###'),
	shape('t-down', 3, '###\n.#.'),
	shape('t-left', 3, '.#\n##\n.#'),
	shape('t-right', 3, '#.\n##\n#.'),

	// S / Z
	shape('s-h', 3, '.##\n##.'),
	shape('s-v', 3, '#.\n##\n.#'),
	shape('z-h', 3, '##.\n.##'),
	shape('z-v', 3, '.#\n##\n#.')
];

const BY_ID = new Map(PIECES.map((p) => [p.id, p]));

export function pieceById(id: string): Piece {
	const p = BY_ID.get(id);
	if (!p) throw new Error(`Unknown piece ${id}`);
	return p;
}
