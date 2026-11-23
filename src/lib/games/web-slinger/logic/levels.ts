// Levels are tall shafts between two walls, written bottom to top as a list of ledges. A ledge
// sticks out from the left wall, the right wall, or floats in the middle (a girder). A unit test
// plays every level with a planning robot that only uses the real controls, so a level that
// can't be climbed fails the build.
import { TUNING } from './tuning';

const W = TUNING.shaftWidth;

export interface Ledge {
	x0: number;
	x1: number;
	/** Height of the walkable top. */
	top: number;
	/** Spike strips on the top, as [x0, x1] ranges. */
	spikes: [number, number][];
}
export interface Point {
	x: number;
	y: number;
}
export interface Level {
	name: string;
	/** Ledge 0 is the floor (the whole width at y = 0). */
	ledges: Ledge[];
	/** Bad guys stand on a ledge top. */
	baddies: Point[];
	/** Wooden crates sit on ledge tops (x is the crate's centre); fly through to smash them. */
	crates: Point[];
	coins: Point[];
	start: Point;
	/** The flag on the top ledge; landing on that ledge finishes the level. */
	finish: Point;
	finishLedge: number;
	/** The ceiling: webs stick to it too. */
	height: number;
	/** A short coaching line shown as the level starts. */
	hint?: string;
}

type Side = 'L' | 'R' | 'M';
interface LedgeOpts {
	/** Bad guys, as distances from the ledge's wall end (left end for middle girders). */
	baddies?: number[];
	/** Crates, measured the same way. */
	crates?: number[];
	/** Spikes, as [from, to] distances along the ledge. */
	spikes?: [number, number][];
	coins?: number;
	finish?: boolean;
}
export interface LedgeSpec {
	side: Side;
	top: number;
	w: number;
	o: LedgeOpts;
}

export const ledge = (side: Side, top: number, w: number, o: LedgeOpts = {}): LedgeSpec => ({
	side,
	top,
	w,
	o
});

export function build(name: string, specs: LedgeSpec[], hint?: string): Level {
	const level: Level = {
		name,
		ledges: [{ x0: 0, x1: W, top: 0, spikes: [] }],
		baddies: [],
		crates: [],
		coins: [],
		start: { x: W / 2, y: 0 },
		finish: { x: 0, y: 0 },
		finishLedge: -1,
		height: 0,
		...(hint ? { hint } : {})
	};
	for (const s of specs) {
		const x0 = s.side === 'L' ? 0 : s.side === 'R' ? W - s.w : (W - s.w) / 2;
		const x1 = x0 + s.w;
		// Distances are measured from the wall the ledge hangs on.
		const at = (d: number) => (s.side === 'R' ? x1 - d : x0 + d);
		level.ledges.push({
			x0,
			x1,
			top: s.top,
			spikes: (s.o.spikes ?? []).map(([a, b]) => {
				const p = at(a);
				const q = at(b);
				return [Math.min(p, q), Math.max(p, q)];
			})
		});
		for (const d of s.o.baddies ?? []) level.baddies.push({ x: at(d), y: s.top });
		for (const d of s.o.crates ?? []) level.crates.push({ x: at(d), y: s.top });
		const n = s.o.coins ?? 0;
		for (let k = 0; k < n; k++)
			level.coins.push({ x: x0 + ((k + 1) * s.w) / (n + 1), y: s.top + 1 });
		if (s.o.finish) {
			level.finish = { x: at(s.w - 1.2), y: s.top };
			level.finishLedge = level.ledges.length - 1;
		}
	}
	if (level.finishLedge < 0) throw new Error(`level "${name}" needs a finish ledge`);
	level.height = Math.max(...level.ledges.map((l) => l.top)) + 7;
	return level;
}

export const LEVELS: Level[] = [
	build(
		'First climb',
		[ledge('L', 6, 5, { coins: 2 }), ledge('R', 12, 5, { finish: true, coins: 2 })],
		'Draw a line to fly that way!'
	),
	build(
		'Catch a robber',
		[
			ledge('R', 6, 6, { baddies: [2] }),
			ledge('L', 12, 5, { crates: [1.5] }),
			ledge('R', 18, 5, { finish: true })
		],
		'Fly into a robber, or tap one to web them!'
	),
	build('Zig zag', [
		ledge('L', 6, 5, { crates: [1.5] }),
		ledge('R', 12, 5, { baddies: [2] }),
		ledge('L', 18, 5, { coins: 2 }),
		ledge('M', 24, 4, { coins: 2 }),
		ledge('R', 30, 5, { finish: true })
	]),
	build(
		'Watch your step',
		[
			ledge('R', 6, 6, { spikes: [[3.5, 6]] }),
			ledge('L', 12, 6, { baddies: [2], spikes: [[4, 6]] }),
			ledge('R', 18, 5, { coins: 2, crates: [1.5] }),
			ledge('L', 24, 5, { finish: true })
		],
		'Spikes sting! Aim for the clear end of a ledge.'
	),
	build('Two robbers', [
		ledge('L', 6, 5),
		ledge('R', 12, 7, { baddies: [2, 5] }),
		ledge('L', 18, 5, { crates: [1.5, 3] }),
		ledge('R', 24, 6, { baddies: [3] }),
		ledge('L', 30, 5, { finish: true })
	]),
	build('Girders', [
		ledge('M', 5, 4, { coins: 2 }),
		ledge('L', 10, 4, { baddies: [2] }),
		ledge('M', 15, 4, { coins: 2 }),
		ledge('R', 20, 4, { baddies: [2] }),
		ledge('M', 25, 4, { coins: 2 }),
		ledge('L', 30, 5, { finish: true })
	]),
	build('Spike tower', [
		ledge('R', 6, 6, { spikes: [[0, 2.5]] }),
		ledge('L', 12, 6, { baddies: [4], spikes: [[0, 2]] }),
		ledge('R', 18, 6, { spikes: [[3.5, 6]] }),
		ledge('M', 24, 4, { coins: 3 }),
		ledge('R', 30, 6, { baddies: [2] }),
		ledge('L', 36, 5, { finish: true })
	]),
	build('Robber roost', [
		ledge('L', 6, 6, { baddies: [3] }),
		ledge('R', 12, 6, { baddies: [3] }),
		ledge('L', 18, 6, { baddies: [3] }),
		ledge('R', 24, 6, { crates: [1.5, 3, 4.5] }),
		ledge('L', 30, 6, { baddies: [2, 4.5] }),
		ledge('R', 36, 5, { finish: true })
	]),
	build('High rise', [
		ledge('R', 7, 5),
		ledge('L', 14, 5, { baddies: [2] }),
		ledge('R', 21, 5, { spikes: [[3, 5]] }),
		ledge('M', 28, 4, { coins: 3 }),
		ledge('L', 35, 5, { baddies: [3] }),
		ledge('R', 42, 5, { finish: true })
	]),
	build('Top of the town', [
		ledge('L', 6, 6, { baddies: [3], coins: 1 }),
		ledge('R', 12, 6, { spikes: [[0, 2]], baddies: [4] }),
		ledge('M', 18, 4, { coins: 2 }),
		ledge('L', 24, 6, { baddies: [2, 5], spikes: [[3.2, 4]] }),
		ledge('R', 30, 6, { crates: [1.5, 3] }),
		ledge('M', 36, 4, { baddies: [2] }),
		ledge('L', 42, 5, { finish: true })
	])
];
