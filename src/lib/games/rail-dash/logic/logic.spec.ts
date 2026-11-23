import { describe, expect, it } from 'vitest';
import { createRng } from '../../../kit/rng';
import { parsePattern, PATTERNS } from './patterns';
import {
	coinValue,
	input,
	movingFront,
	newRun,
	pickPattern,
	score,
	step,
	type Obstacle,
	type RunEvent,
	type RunState
} from './run';
import { laneX, speedAt, TUNING } from './tuning';
import { isPassable, passableFrom } from './validate';

const DT = 1 / 60;

/** A run with no generated content, so tests place obstacles by hand. */
function emptyRun(): RunState {
	const s = newRun(1);
	s.spawnedTo = 1e9;
	return s;
}

function addObstacle(s: RunState, o: Partial<Obstacle> & Pick<Obstacle, 'kind' | 's'>) {
	const length =
		o.length ?? (o.kind === 'low' || o.kind === 'high' ? TUNING.obstacles[o.kind].depth : 12);
	s.obstacles.push({ id: s.nextId++, lane: 0, front: o.s, warned: false, length, ...o });
}

function run(s: RunState, seconds: number): RunEvent[] {
	const all: RunEvent[] = [];
	for (let t = 0; t < seconds && !s.over; t += DT) all.push(...step(s, DT));
	return all;
}

const types = (es: RunEvent[]) => es.map((e) => e.type);

describe('patterns', () => {
	it('parses rows far-to-near with trains as single runs', () => {
		const p = parsePattern('t', 1, ['T..', 'T.c', '.b.']);
		expect(p.length).toBe(3 * TUNING.world.rowLength);
		const train = p.obstacles.find((o) => o.kind === 'train')!;
		expect(train).toMatchObject({ lane: -1, at: TUNING.world.rowLength });
		expect(train.length).toBeCloseTo(2 * TUNING.world.rowLength - 0.5);
		expect(p.obstacles.find((o) => o.kind === 'low')!.lane).toBe(0);
		expect(p.coins).toEqual([{ lane: 1, at: 6, y: 0.8 }]);
	});
	it('rejects bad rows', () => {
		expect(() => parsePattern('x', 1, ['T.'])).toThrow();
		expect(() => parsePattern('x', 1, ['T?.'])).toThrow();
	});
	it('has at least 20 patterns across 3 tiers', () => {
		expect(PATTERNS.length).toBeGreaterThanOrEqual(20);
		expect(new Set(PATTERNS.map((p) => p.tier))).toEqual(new Set([1, 2, 3]));
	});
});

describe('passability validator', () => {
	it.each(PATTERNS.map((p) => [p.name, p] as const))('"%s" is passable', (_, p) => {
		expect(isPassable(p)).toBe(true);
	});
	it('rejects a wall across all three lanes', () => {
		expect(isPassable(parsePattern('wall', 1, ['TTT']))).toBe(false);
	});
	it('rejects a two-lane switch that is too short at top speed', () => {
		const p = parsePattern('tight', 3, ['.TT', '...', '...', 'TT.', '...']);
		expect(passableFrom(p, TUNING.speed.start, 0, 8)).toBe(true);
		expect(passableFrom(p, TUNING.speed.max, 0, 8)).toBe(false);
	});
	it('treats bars and gantries as passable (slide under)', () => {
		expect(isPassable(parsePattern('bars', 1, ['ggg', 'bbb']))).toBe(true);
	});
});

describe('running', () => {
	it('speeds up to a cap and scores distance', () => {
		expect(speedAt(0)).toBe(TUNING.speed.start);
		expect(speedAt(TUNING.speed.rampSeconds * 2)).toBe(TUNING.speed.max);
		const s = emptyRun();
		run(s, 2);
		expect(s.distance).toBeGreaterThan(19);
		expect(score(s)).toBe(Math.floor(s.distance));
	});

	it('changes lanes in about 120 ms and stops at the edges', () => {
		const s = emptyRun();
		input(s, 'left');
		run(s, TUNING.player.laneChangeSeconds + DT);
		expect(s.player.x).toBeCloseTo(laneX(-1));
		expect(types(input(s, 'left'))).toEqual([]);
		expect(s.player.lane).toBe(-1);
	});

	it('crashes head-on into a train', () => {
		const s = emptyRun();
		addObstacle(s, { kind: 'train', s: 10 });
		const es = run(s, 2);
		expect(s.over).toBe(true);
		expect(types(es)).toContain('crash');
	});

	it('a side clip on a lane change is a stumble, not a crash', () => {
		const s = emptyRun();
		addObstacle(s, { kind: 'train', lane: -1, s: 0, length: 40 }); // already alongside, to the left
		input(s, 'left');
		const es = run(s, 1);
		expect(types(es)).toContain('stumble');
		expect(s.over).toBe(false);
		expect(s.player.lane).toBe(0);
		run(s, 0.3);
		expect(s.player.x).toBeCloseTo(0);
	});

	it('jumping clears a low bar; running into it crashes', () => {
		const crash = emptyRun();
		addObstacle(crash, { kind: 'low', s: 8 });
		run(crash, 2);
		expect(crash.over).toBe(true);

		const jump = emptyRun();
		addObstacle(jump, { kind: 'low', s: 8 });
		run(jump, 0.5); // bar at 8 m, 5 m travelled
		input(jump, 'jump');
		run(jump, 2);
		expect(jump.over).toBe(false);
	});

	it('sliding goes under bars and gantries; jumping into a gantry crashes', () => {
		for (const kind of ['low', 'high'] as const) {
			const s = emptyRun();
			addObstacle(s, { kind, s: 8 });
			run(s, 0.5);
			input(s, 'slide');
			run(s, 2);
			expect(s.over, kind).toBe(false);
		}
		const s = emptyRun();
		addObstacle(s, { kind: 'high', s: 8 });
		run(s, 0.5);
		input(s, 'jump');
		run(s, 2);
		expect(s.over).toBe(true);
	});

	it('a timed jump lands on a train roof, runs along it, and drops off the end', () => {
		const s = emptyRun();
		const roof = TUNING.obstacles.train.height;
		addObstacle(s, { kind: 'train', s: 12, length: 20 });
		// Jump about 0.3 s before the front arrives, so you're near the top of the arc.
		run(s, (12 - 3) / TUNING.speed.start - 0.05);
		input(s, 'jump');
		run(s, 1);
		expect(s.over).toBe(false);
		expect(s.player.airborne).toBe(false);
		expect(s.player.y).toBeCloseTo(roof);
		run(s, 2); // past the end of the train, and down
		expect(s.over).toBe(false);
		expect(s.player.y).toBe(0);
	});

	it('stepping sideways off a roof falls to the track', () => {
		const s = emptyRun();
		addObstacle(s, { kind: 'train', s: -5, length: 40 });
		s.player.y = TUNING.obstacles.train.height;
		s.player.ground = s.player.y;
		run(s, 0.1);
		expect(s.player.airborne).toBe(false); // standing on the roof
		input(s, 'right');
		run(s, 1.5);
		expect(s.over).toBe(false);
		expect(s.player.y).toBe(0);
		expect(s.player.lane).toBe(1);
	});

	it('a train is too tall to jump over from beside it: no landing from below', () => {
		const s = emptyRun();
		addObstacle(s, { kind: 'train', s: 3, length: 30 });
		run(s, 0.25); // front reaches you while you're still low
		input(s, 'jump');
		run(s, 1);
		expect(s.over).toBe(true);
	});

	it('swipe down mid-air drops fast and slides on landing', () => {
		const s = emptyRun();
		input(s, 'jump');
		run(s, 0.15);
		input(s, 'slide');
		const es = run(s, 0.2);
		expect(types(es)).toEqual(expect.arrayContaining(['land', 'slide']));
		expect(s.player.slide).toBeGreaterThan(0);
	});

	it('buffers a jump pressed just before landing', () => {
		const s = emptyRun();
		input(s, 'jump');
		run(s, TUNING.player.jumpSeconds - 0.08);
		expect(s.player.airborne).toBe(true);
		input(s, 'jump'); // ~80 ms early
		const es = run(s, 0.15);
		expect(types(es).filter((t) => t === 'jump')).toHaveLength(1);
		expect(s.player.airborne).toBe(true);
	});

	it('oncoming trains move, warn early, and meet you where the pattern says', () => {
		const s = emptyRun();
		addObstacle(s, { kind: 'moving', s: 60, lane: 1, length: 12 });
		const o = s.obstacles[0]!;
		expect(movingFront(o, 0, 10)).toBeGreaterThan(60);
		expect(movingFront(o, 60, 10)).toBeCloseTo(60);
		const es = run(s, 4);
		expect(types(es)).toContain('warn');
		expect(s.over).toBe(false); // it's in the right lane
	});

	it('collects coins, worth more in later tiers', () => {
		const s = emptyRun();
		s.coinsList.push({ id: 99, lane: 0, s: 5, y: 0.8, taken: false });
		s.coinsList.push({ id: 100, lane: 1, s: 6, y: 0.8, taken: false });
		const es = run(s, 1);
		expect(es.filter((e) => e.type === 'coin')).toHaveLength(1);
		expect(s.coins).toBe(1);
		expect(score(s)).toBe(Math.floor(s.distance) + TUNING.coin.value);
		expect(coinValue(TUNING.tiers.three)).toBe(TUNING.coin.value * 3);
	});
});

describe('world generation', () => {
	it('only picks unlocked tiers and never repeats a pattern back to back', () => {
		const rng = createRng(7);
		let last = '';
		for (let i = 0; i < 200; i++) {
			const p = pickPattern(rng, 1, last);
			expect(p.tier).toBe(1);
			expect(p.name).not.toBe(last);
			last = p.name;
		}
	});

	it('keeps content ahead and forgets it behind over a 5-minute run', () => {
		const s = newRun(42);
		let maxObjects = 0;
		for (let t = 0; t < 300; t += DT) {
			step(s, DT);
			s.over = false; // keep running through crashes: this only checks spawning/recycling
			maxObjects = Math.max(maxObjects, s.obstacles.length + s.coinsList.length);
			for (const o of s.obstacles) {
				expect(o.front + o.length).toBeGreaterThan(s.distance - TUNING.world.despawnBehind - 1);
			}
		}
		expect(s.spawnedTo).toBeGreaterThan(s.distance + TUNING.world.spawnAhead - 1);
		expect(maxObjects).toBeLessThan(200);
		expect(s.distance).toBeGreaterThan(4000);
	});
});
