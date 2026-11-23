import { describe, expect, it } from 'vitest';
import {
	bounce,
	distToSeg,
	insidePoly,
	newContact,
	polySegs,
	pushOut,
	segsCross
} from './geometry';
import {
	ballSpeed,
	isSavedRun,
	kick,
	nextLevel,
	steer,
	retryLevel,
	startLevel,
	step,
	type GameEvent,
	type GameState
} from './game';
import { LEVELS } from './levels';
import { TUNING } from './tuning';

const DT = 1 / 60;
const R = TUNING.ball.radius;
const CR = TUNING.chaser.radius;

/** Run until `until` is true or `seconds` pass. Collects every event. */
function run(s: GameState, seconds: number, until: (s: GameState) => boolean = () => false) {
	const all: GameEvent[] = [];
	const events: GameEvent[] = [];
	for (let t = 0; t < seconds; t += DT) {
		all.push(...step(s, DT, events));
		if (until(s)) break;
	}
	return all;
}

/** A kick at `deg` degrees (0 = right, 90 = straight up the screen). */
function kickAt(s: GameState, deg: number, power: number) {
	const r = (deg * Math.PI) / 180;
	return kick(s, Math.cos(r), -Math.sin(r), power, []);
}

function clone(s: GameState): GameState {
	return {
		...s,
		ball: { ...s.ball },
		chasers: s.chasers.map((c) => ({ ...c })),
		keeper: s.keeper && { ...s.keeper }
	};
}

describe('geometry', () => {
	it('pushes a circle out of a wall and reflects it', () => {
		const segs = polySegs([0, 100, 200, 100], 'wall', false);
		const p = { x: 50, y: 90, vx: 0, vy: 300 };
		const hit = newContact();
		expect(pushOut(p, 18, segs, [], hit)).toBe(true);
		expect(p.y).toBeCloseTo(82);
		expect(hit.ny).toBeCloseTo(-1);
		expect(bounce(p, hit.nx, hit.ny, 0.5)).toBeCloseTo(300);
		expect(p.vy).toBeCloseTo(-150);
	});

	it('does not bounce something already moving away', () => {
		const v = { vx: 0, vy: -100 };
		expect(bounce(v, 0, -1, 1)).toBe(0);
		expect(v.vy).toBe(-100);
	});

	it('tells inside from outside of a concave shape', () => {
		const L = [0, 0, 100, 0, 100, 40, 40, 40, 40, 100, 0, 100];
		expect(insidePoly(L, 20, 80)).toBe(true);
		expect(insidePoly(L, 80, 80)).toBe(false);
	});
});

describe('levels', () => {
	LEVELS.forEach((level, i) => {
		describe(`level ${i + 1}`, () => {
			const s = startLevel(i);
			const walls = s.arena.segs;
			const outline = level.outline;
			const n = outline.length;
			const { x: gx, y: gy, width } = level.goal;

			it('has the goal mouth as its closing edge', () => {
				expect([outline[0], outline[1]]).toEqual([gx + width / 2, gy]);
				expect([outline[n - 2], outline[n - 1]]).toEqual([gx - width / 2, gy]);
			});

			it('fits the stage and has a simple outline', () => {
				for (let k = 0; k < n; k += 2) {
					expect(outline[k]).toBeGreaterThanOrEqual(20);
					expect(outline[k]).toBeLessThanOrEqual(700);
				}
				const ring = polySegs(outline, 'wall');
				for (let a = 0; a < ring.length; a++)
					for (let b = a + 1; b < ring.length; b++)
						expect(segsCross(ring[a]!, ring[b]!), `edges ${a} and ${b}`).toBe(false);
			});

			it('puts the ball, chasers and obstacles inside with room to move', () => {
				const clear = (x: number, y: number, r: number, what: string) => {
					expect(insidePoly(outline, x, y), `${what} inside`).toBe(true);
					for (const w of walls)
						expect(distToSeg(x, y, w), `${what} clear of walls`).toBeGreaterThan(r + 4);
					for (const d of s.arena.discs)
						expect(Math.hypot(x - d.x, y - d.y), `${what} clear of ${d.kind}`).toBeGreaterThan(
							r + d.r + 4
						);
				};
				clear(level.ball.x, level.ball.y, R, 'ball');
				for (const c of level.chasers) {
					clear(c.x, c.y, CR, 'chaser');
					// Nobody starts on top of the ball: the first kick is always free.
					expect(Math.hypot(c.x - level.ball.x, c.y - level.ball.y)).toBeGreaterThan(180);
				}
				for (const d of level.discs ?? []) {
					expect(insidePoly(outline, d.x, d.y)).toBe(true);
					for (const w of walls) expect(distToSeg(d.x, d.y, w)).toBeGreaterThan(d.r + R * 2);
				}
				for (const b of level.blocks ?? [])
					for (let k = 0; k < b.length; k += 2)
						expect(insidePoly(outline, b[k]!, b[k + 1]!)).toBe(true);
			});

			it('never lets a full-strength ball out, in any direction', () => {
				for (let deg = 0; deg < 360; deg += 7.5) {
					const t = startLevel(i);
					t.chasers = [];
					t.keeper = null;
					kickAt(t, deg, 1);
					run(t, 4);
					const b = t.ball;
					const inNet = b.y < gy && Math.abs(b.x - gx) < width / 2;
					expect(insidePoly(outline, b.x, b.y) || inNet, `${deg}°`).toBe(true);
				}
			});

			it('can be won by a simple robot player', () => {
				expect(botPlays(i)).toBeLessThanOrEqual(8);
			});
		});
	});
});

describe('rules', () => {
	it('scores with a full-strength kick straight up on the first level', () => {
		const s = startLevel(0);
		expect(kickAt(s, 90, 1)).toBe(true);
		const events = run(s, 4, (t) => t.phase !== 'play');
		expect(s.phase).toBe('goal');
		expect(events.some((e) => e.type === 'goal')).toBe(true);
		expect(s.score).toBe(TUNING.scoring.goal);
	});

	it('keeps chasers still until the first kick', () => {
		const s = startLevel(0);
		const before = s.chasers.map((c) => [c.x, c.y]);
		run(s, 3);
		expect(s.chasers.map((c) => [c.x, c.y])).toEqual(before);
	});

	it('can collect a moving kick and flick again without waiting for rest', () => {
		const s = startLevel(0);
		kickAt(s, 0, 0.5);
		const before = s.ball.vx;
		steer(s, 0, -40);
		step(s, DT, []);
		expect(s.ball.vx).toBeLessThan(before);
		expect(s.ball.vy).toBeLessThan(0);
		expect(kickAt(s, 90, 1)).toBe(true);
		expect(s.dribble).toBeNull();
		expect(s.ball.vy).toBe(-TUNING.kick.maxSpeed);
	});

	it('knocks over a chaser hit by a fast ball', () => {
		const s = startLevel(0);
		s.chasers = [{ x: 360, y: 900, vx: 0, vy: 0, down: false }];
		kickAt(s, 90, 1);
		const events = run(s, 1, () => s.chasers[0]!.down);
		expect(events).toContainEqual({ type: 'knock', index: 0, combo: 1, points: 10 });
		expect(s.score).toBe(10);
		expect(ballSpeed(s.ball)).toBeGreaterThan(TUNING.chaser.knockSpeed * 0.8);
	});

	it('knocks over the chaser in the middle of the hourglass with a straight kick', () => {
		// The browser test relies on this shot.
		const s = startLevel(3);
		kickAt(s, 90, 1);
		const events = run(s, 4, (t) => t.phase !== 'play');
		expect(events.some((e) => e.type === 'knock' && e.index === 2)).toBe(true);
		expect(s.score).toBeGreaterThanOrEqual(TUNING.scoring.knock);
	});

	it('doubles up when one kick knocks over two chasers', () => {
		const s = startLevel(0);
		s.chasers = [
			{ x: 360, y: 950, vx: 0, vy: 0, down: false },
			{ x: 360, y: 760, vx: 0, vy: 0, down: false }
		];
		kickAt(s, 90, 1);
		run(s, 1.5, (t) => t.chasers.every((c) => c.down));
		expect(s.score).toBe(10 + 20);
	});

	it('loses the ball to a chaser if it is slow, and the level starts again', () => {
		const s = startLevel(0);
		kickAt(s, 90, 0);
		const events = run(s, 20, (t) => t.phase !== 'play');
		expect(s.phase).toBe('taken');
		expect(events.some((e) => e.type === 'taken')).toBe(true);
		expect(s.balls).toBe(TUNING.balls - 1);
		const again = retryLevel(s);
		expect(again.levelIndex).toBe(0);
		expect(again.balls).toBe(TUNING.balls - 1);
		expect(again.started).toBe(false);
	});

	it('ends the run when the last ball is taken', () => {
		const s = startLevel(0, 120, 1);
		kickAt(s, 90, 0);
		const events = run(s, 20, (t) => t.phase !== 'play');
		expect(s.phase).toBe('over');
		expect(events.at(-1)).toEqual({ type: 'over' });
		expect(s.score).toBe(120);
	});

	it('gives a bonus for knocking every chaser over before scoring', () => {
		const s = startLevel(0);
		s.chasers.forEach((c) => (c.down = true));
		kickAt(s, 90, 1);
		const events = run(s, 4, (t) => t.phase !== 'play');
		expect(events).toContainEqual({
			type: 'goal',
			points: TUNING.scoring.goal + TUNING.scoring.allDown,
			allDown: true
		});
	});

	it('keeps the keeper on the goal line, tracking the ball', () => {
		const s = startLevel(4);
		const k = s.keeper!;
		s.ball.x = 100;
		s.started = true;
		run(s, 3);
		expect(k.x).toBeCloseTo(k.minX);
		expect(k.y).toBe(LEVELS[4]!.goal.y + TUNING.keeper.front);
	});

	it('levels repeat faster after the last one', () => {
		const last = startLevel(LEVELS.length - 1, 500, 2);
		const again = nextLevel(last);
		expect(again.levelIndex).toBe(LEVELS.length);
		expect(again.level).toBe(LEVELS[0]);
		expect(again.speed).toBeCloseTo(1 + TUNING.loopSpeedUp);
		expect([again.score, again.balls]).toEqual([500, 2]);
	});

	it('follows a left-right cut while held, wakes defenders, then coasts on a gentle lift', () => {
		const s = startLevel(0),
			start = s.ball.x;
		for (let i = 0; i < 14; i++) {
			steer(s, -8, -4);
			step(s, DT, []);
		}
		expect(s.ball.x).toBeLessThan(start - 25);
		expect(s.chasers[0]!.vy).toBeGreaterThan(0);
		for (let i = 0; i < 22; i++) {
			steer(s, 8, -4);
			step(s, DT, []);
		}
		expect(s.ball.vx).toBeGreaterThan(0);
		expect(s.ball.vy).toBeLessThan(0);
		expect(ballSpeed(s.ball)).toBeLessThan(TUNING.chaser.knockSpeed);
		const x = s.ball.x,
			speed = ballSpeed(s.ball);
		s.dribble = null;
		step(s, DT, []);
		expect(s.ball.x).toBeGreaterThan(x);
		expect(ballSpeed(s.ball)).toBeLessThan(speed);
	});

	it('cannot drag through a fence, and reverses away without unwinding the blocked drag', () => {
		const s = startLevel(0);
		s.chasers = [];
		for (let i = 0; i < 160; i++) {
			steer(s, 0, 18);
			step(s, DT, []);
		}
		expect(s.ball.y).toBeLessThanOrEqual(1130 - R + 0.1);
		const y = s.ball.y;
		steer(s, 0, -50);
		run(s, 0.2);
		expect(s.ball.y).toBeLessThan(y - 25);
	});

	it('validates saved runs', () => {
		expect(isSavedRun({ levelIndex: 3, score: 120, balls: 2 })).toBe(true);
		expect(isSavedRun({ levelIndex: -1, score: 0, balls: 2 })).toBe(false);
		expect(isSavedRun({ levelIndex: 1, score: 0, balls: 0 })).toBe(false);
		expect(isSavedRun({ levelIndex: 1, score: 0, balls: 9 })).toBe(false);
		expect(isSavedRun({ levelIndex: 1.5, score: 0, balls: 1 })).toBe(false);
		expect(isSavedRun(null)).toBe(false);
	});
});

// ---- The robot player ------------------------------------------------------------------------

/**
 * Steps from each point to the goal, on a 20 px grid, for cells the ball fits in. The robot
 * uses it to judge where a kick leaves the ball.
 */
function distanceField(s: GameState) {
	const G = 20;
	const { minX, minY, maxX, maxY } = s.arena.bounds;
	const cols = Math.ceil((maxX - minX) / G) + 1;
	const rows = Math.ceil((maxY - minY) / G) + 1;
	const dist = new Float64Array(cols * rows).fill(Infinity);
	const { x: gx, y: gy, width } = s.level.goal;
	const open = (c: number, r: number) => {
		const x = minX + c * G;
		const y = minY + r * G;
		if (y < gy) return Math.abs(x - gx) < width / 2;
		if (!insidePoly(s.level.outline, x, y)) return false;
		for (const w of s.arena.segs) if (distToSeg(x, y, w) < R) return false;
		for (const d of s.arena.discs) if (Math.hypot(x - d.x, y - d.y) < R + d.r) return false;
		return true;
	};
	const queue: number[] = [];
	for (let c = 0; c < cols; c++)
		for (let r = 0; r < rows; r++)
			if (minY + r * G < gy && open(c, r)) {
				dist[r * cols + c] = 0;
				queue.push(r * cols + c);
			}
	for (let q = 0; q < queue.length; q++) {
		const i = queue[q]!;
		const c = i % cols;
		const r = (i - c) / cols;
		for (const [dc, dr] of [
			[1, 0],
			[-1, 0],
			[0, 1],
			[0, -1]
		] as const) {
			const nc = c + dc;
			const nr = r + dr;
			const j = nr * cols + nc;
			if (nc < 0 || nr < 0 || nc >= cols || nr >= rows || dist[j] !== Infinity) continue;
			if (!open(nc, nr)) continue;
			dist[j] = dist[i]! + 1;
			queue.push(j);
		}
	}
	return (x: number, y: number) => {
		const c = Math.round((x - minX) / G);
		const r = Math.round((y - minY) / G);
		let best = Infinity;
		for (let dc = -1; dc <= 1; dc++)
			for (let dr = -1; dr <= 1; dr++) {
				const nc = c + dc;
				const nr = r + dr;
				if (nc >= 0 && nr >= 0 && nc < cols && nr < rows)
					best = Math.min(best, dist[nr * cols + nc]!);
			}
		return best;
	};
}

/**
 * Plays a level: each turn it tries a fan of kicks, simulating each one with the chasers
 * running, and takes the one that scores, or else leaves the ball nearest the goal and away
 * from chasers. Returns how many kicks it needed (Infinity if it lost the ball).
 */
function botPlays(levelIndex: number): number {
	let s = startLevel(levelIndex);
	const field = distanceField(s);
	const powers = [0.3, 0.55, 0.8, 1];
	for (let kicks = 1; kicks <= 12; kicks++) {
		let best: { s: GameState; value: number } | null = null;
		for (let deg = 0; deg < 360; deg += 5) {
			for (const p of powers) {
				const t = clone(s);
				kickAt(t, deg, p);
				// The bot plans bank shots; unlike a human it chooses to wait between them.
				run(t, 6, (u) => u.phase !== 'play' || ballSpeed(u.ball) < 110);
				if (t.phase === 'taken' || t.phase === 'over') continue;
				let value = t.phase === 'goal' ? -1 : field(t.ball.x, t.ball.y);
				if (t.phase === 'play') {
					// Leave room before the nearest chaser arrives.
					let near = Infinity;
					for (const c of t.chasers)
						if (!c.down) near = Math.min(near, Math.hypot(c.x - t.ball.x, c.y - t.ball.y));
					if (near < 140) value += (140 - near) / 4;
				}
				if (!best || value < best.value) best = { s: t, value };
			}
		}
		if (!best) return Infinity;
		s = best.s;
		if (s.phase === 'goal') return kicks;
	}
	return Infinity;
}
