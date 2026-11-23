// Hand-authored obstacle patterns. Each pattern is drawn as the player sees it:
// three columns (left, centre, right lanes), FAR rows at the top, NEAR rows at the bottom.
// Each row is TUNING.world.rowLength metres long.
//
//   .  empty           c  coin on the ground       B  low bar with a coin above it
//   b  low bar         g  high gantry (slide)      T  parked train (a column run = one train)
//   M  oncoming train  a  coin up high (jump arc)
//   R  parked train with a coin on its roof (jump up to collect)
//
// Every pattern must pass validate.ts from every starting lane at every speed; a unit test
// checks the whole set, so a new pattern that can't be passed fails the build.
import { TUNING } from './tuning';

export type ObstacleKind = 'low' | 'high' | 'train' | 'moving';

export interface PatternObstacle {
	kind: ObstacleKind;
	lane: number;
	/** Distance from the pattern start to the obstacle's near edge (for 'moving': where it meets you). */
	at: number;
	/** Track length (trains); bars use their depth. */
	length: number;
}

export interface PatternCoin {
	lane: number;
	at: number;
	/** Height of the coin's centre. */
	y: number;
}

export interface Pattern {
	name: string;
	tier: 1 | 2 | 3;
	length: number;
	obstacles: PatternObstacle[];
	coins: PatternCoin[];
}

const RAW: { name: string; tier: 1 | 2 | 3; rows: string[] }[] = [
	// ---- Tier 1: one idea at a time ----
	{ name: 'coin line', tier: 1, rows: ['.c.', '.c.', '.c.', '.c.'] },
	{ name: 'coin zigzag', tier: 1, rows: ['c..', '.c.', '..c', '.c.'] },
	{ name: 'first bar', tier: 1, rows: ['.c.', '...', '.B.', '...', '.c.'] },
	{ name: 'first gantry', tier: 1, rows: ['.c.', '.g.', '.c.'] },
	{ name: 'train left', tier: 1, rows: ['T..', 'Tc.', 'Tc.', 'T..'] },
	{ name: 'train right', tier: 1, rows: ['..T', '.cT', '.cT', '..T'] },
	{ name: 'train centre', tier: 1, rows: ['.T.', 'cT.', 'cT.', '.T.'] },
	{ name: 'roof run', tier: 1, rows: ['.R.', '.R.', '.R.', '.T.', '...'] },
	{ name: 'two bars', tier: 1, rows: ['b..', '...', '...', '..b'] },

	// ---- Tier 2: combinations ----
	{ name: 'gate', tier: 2, rows: ['T.T', 'TcT', 'TcT', 'T.T'] },
	{ name: 'roof hop', tier: 2, rows: ['R..', 'R..', '...', '.R.', '.R.', '.T.', '...'] },
	{ name: 'bars across', tier: 2, rows: ['...', 'BBB', '...'] },
	{ name: 'gantries across', tier: 2, rows: ['ccc', 'ggg', '...'] },
	{ name: 'mixed row', tier: 2, rows: ['..T', 'bgT', '..T'] },
	{ name: 'oncoming centre', tier: 2, rows: ['.M.', '.M.', '.M.', 'c.c', 'c.c'] },
	{ name: 'long train bar', tier: 2, rows: ['T..', 'T..', 'Tb.', 'T..', 'T..'] },
	{ name: 'bar steps', tier: 2, rows: ['b..', '...', '.b.', '...', '..b'] },
	{
		name: 'switch sides',
		tier: 2,
		rows: ['.TT', '.TT', 'c..', 'c..', 'c..', 'TT.', 'TT.', '...']
	},

	// ---- Tier 3: reading ahead ----
	{
		name: 'chicane',
		tier: 3,
		rows: ['TT.', 'TT.', 'TT.', '..c', '..c', '..c', '.TT', '.TT', '.TT', '...']
	},
	{ name: 'oncoming and parked', tier: 3, rows: ['M.T', 'M.T', 'M.T', '...', '.b.'] },
	{ name: 'parked and oncoming', tier: 3, rows: ['T.M', 'T.M', 'T.M', '.c.'] },
	{ name: 'bar then gantry', tier: 3, rows: ['ggg', '...', '...', 'BBB'] },
	{ name: 'gate tricks', tier: 3, rows: ['T.T', 'TgT', 'T.T', 'TbT', 'T.T'] },
	{
		name: 'oncoming squeeze',
		tier: 3,
		rows: ['T..', 'T..', '...', '...', '.MT', '.MT', '.MT', '...']
	},
	{ name: 'triple stack', tier: 3, rows: ['ggg', '...', '...', 'bbb', '...', '...', 'ggg'] },
	{ name: 'twin oncoming', tier: 3, rows: ['M.M', 'M.M', 'M.M', '.c.', '.c.'] }
];

const KIND: Partial<Record<string, 'low' | 'high'>> = { b: 'low', B: 'low', g: 'high' };

export function parsePattern(name: string, tier: 1 | 2 | 3, rows: string[]): Pattern {
	const R = TUNING.world.rowLength;
	const near = [...rows].reverse(); // index 0 = nearest row
	const obstacles: PatternObstacle[] = [];
	const coins: PatternCoin[] = [];
	const groundCoin = 0.8;

	for (let lane = 0; lane < 3; lane++) {
		let run: { kind: 'train' | 'moving'; start: number } | null = null;
		const closeRun = (end: number) => {
			if (!run) return;
			// Leave a small gap so two back-to-back trains read as two.
			obstacles.push({
				kind: run.kind,
				lane: lane - 1,
				at: run.start * R,
				length: (end - run.start) * R - 0.5
			});
			run = null;
		};
		for (let i = 0; i <= near.length; i++) {
			const row = near[i];
			const ch = row?.[lane] ?? '.';
			if (row !== undefined && row.length !== 3)
				throw new Error(`pattern "${name}": row "${row}" needs 3 lanes`);
			const train = ch === 'T' || ch === 'R' ? 'train' : ch === 'M' ? 'moving' : null;
			if (run && run.kind !== train) closeRun(i);
			if (train && !run) run = { kind: train, start: i };
			if (i === near.length) break;

			const mid = i * R + R / 2;
			const kind = KIND[ch];
			if (kind) {
				const depth = TUNING.obstacles[kind].depth;
				obstacles.push({ kind, lane: lane - 1, at: mid - depth / 2, length: depth });
			}
			if (ch === 'c') coins.push({ lane: lane - 1, at: mid, y: groundCoin });
			if (ch === 'a' || ch === 'B')
				coins.push({ lane: lane - 1, at: mid, y: TUNING.coin.arcHeight + 0.6 });
			if (!kind && !train && !'.caBR'.includes(ch)) {
				throw new Error(`pattern "${name}": unknown cell "${ch}"`);
			}
		}
	}
	return { name, tier, length: near.length * R, obstacles, coins };
}

export const PATTERNS: Pattern[] = RAW.map((p) => parsePattern(p.name, p.tier, p.rows));
