import { describe, expect, it } from 'vitest';
import { ALL_LEVELS, botPlay, plan, playMove } from './bot';
import {
	aim,
	isSavedRun,
	launch,
	nextLevel,
	saved,
	startLevel,
	step,
	tapRobber,
	type GameEvent,
	type GameState
} from './game';
import { build, ledge, LEVELS } from './levels';
import { TUNING } from './tuning';

const DT = 1 / 60;
const W = TUNING.shaftWidth;

function run(s: GameState, seconds: number): GameEvent[] {
	const all: GameEvent[] = [];
	for (let t = 0; t < seconds && s.phase === 'play'; t += DT) all.push(...step(s, DT));
	return all;
}
const types = (es: GameEvent[]) => es.map((e) => e.type);

/** Draw a line from the hero toward world point `p` (full speed) and let things settle. */
function drawTo(s: GameState, p: { x: number; y: number }, power = 1): GameEvent[] {
	const es = [...launch(s, p.x - s.hero.x, p.y - s.hero.y, power)];
	for (
		let t = 0;
		t < 3 && s.phase === 'play' && (s.hero.mode === 'zip' || s.hero.mode === 'fall');
		t += DT
	) {
		es.push(...step(s, DT));
	}
	return es;
}

describe('levels', () => {
	it('builds a shaft of ledges, measured from the wall each one hangs on', () => {
		const l = build('t', [
			ledge('L', 5, 4, { baddies: [1] }),
			ledge('R', 10, 4, { spikes: [[0, 1]], finish: true })
		]);
		expect(l.ledges[0]).toEqual({ x0: 0, x1: W, top: 0, spikes: [] });
		expect(l.ledges[1]).toMatchObject({ x0: 0, x1: 4, top: 5 });
		expect(l.ledges[2]!.x0).toBeCloseTo(W - 4);
		expect(l.ledges[2]!.spikes[0]![1]).toBeCloseTo(W); // spikes start at the right wall
		expect(l.baddies).toEqual([{ x: 1, y: 5 }]);
		expect(l.finishLedge).toBe(2);
		expect(l.height).toBe(17);
	});
	it('needs a finish ledge', () => {
		expect(() => build('x', [ledge('L', 4, 4)])).toThrow();
	});

	it.each(ALL_LEVELS.map((i) => [LEVELS[i]!.name, i] as const))(
		'"%s" can be climbed by a robot using only the real controls, with room for error',
		(_, i) => {
			const r = botPlay(i);
			expect(r.completed).toBe(true);
			expect(r.heartsLost).toBe(0);
			expect(r.stars).toBe(3);
			// Every climb could have been made several different ways.
			for (const n of r.options) expect(n).toBeGreaterThanOrEqual(3);
		}
	);
});

describe('drawing a line', () => {
	const level = LEVELS[0]!;
	const R = TUNING.hero.radius;
	it('aims at the first wall, ceiling or ledge face that way, within reach', () => {
		const wall = aim(level, { x: 6, y: 1 }, 1, 0)!;
		expect(wall).toMatchObject({ mode: 'cling', side: 1, ledge: -1 });
		expect(wall.x).toBeCloseTo(W - R);
		const under = aim(level, { x: 2, y: 1 }, 0, 1)!;
		expect(under).toMatchObject({ mode: 'hang', ledge: 1 });
		expect(under.y).toBeCloseTo(6 - TUNING.ledge.thickness - R);
		const top = aim(level, { x: 2, y: 9 }, 0, -1)!;
		expect(top).toMatchObject({ mode: 'stand', ledge: 1 });
		expect(top.y).toBeCloseTo(6 + R);
		const side = aim(level, { x: 7, y: 5.5 }, -1, 0)!;
		expect(side).toMatchObject({ mode: 'cling', ledge: 1, side: -1 });
		expect(aim(level, { x: 6.5, y: 1 }, 0, 1)).toBeNull(); // the ceiling is out of reach
	});

	it('zips straight there at the speed you drew, and sticks', () => {
		const s = startLevel(0);
		const es = drawTo(s, { x: W, y: 6 });
		expect(types(es)).toEqual(['web', 'land']);
		expect(s.hero.mode).toBe('cling');
		expect(s.hero.facing).toBe(-1); // facing away from the right wall
		const slow = startLevel(0);
		const fast = startLevel(0);
		launch(slow, 1, 1, 0);
		launch(fast, 1, 1, 1);
		step(slow, 0.1);
		step(fast, 0.1);
		expect(fast.hero.y).toBeGreaterThan(slow.hero.y);
	});

	it('hangs under a ledge (straight up is blocked), and can get round onto the top', () => {
		const s = startLevel(0);
		drawTo(s, { x: 2.5, y: 9 }); // straight into the underside of the left ledge
		expect(s.hero.mode).toBe('hang');
		expect(s.hero.ledge).toBe(1);
		drawTo(s, { x: s.hero.x, y: 20 }); // up into the ledge you're under: nothing happens
		expect(s.hero.mode).toBe('hang');
		// A few moves later (sideways out, then up and over) you're standing higher up.
		for (let k = 0; k < 4 && !(s.hero.mode === 'stand' && s.hero.y > 6); k++)
			playMove(s, plan(s)!.move);
		expect(s.hero.mode).toBe('stand');
		expect(s.hero.y).toBeGreaterThan(6);
	});

	it('you can change direction mid-flight', () => {
		const s = startLevel(0);
		launch(s, 1, 0.3, 0.5);
		step(s, 0.1);
		expect(s.hero.mode).toBe('zip');
		launch(s, -1, 0.3, 1);
		run(s, 2);
		expect(s.hero.mode).toBe('cling');
		expect(s.hero.x).toBeCloseTo(TUNING.hero.radius); // ended on the left wall
	});

	it('nothing in reach: the web misses and you drop', () => {
		const s = startLevel(0);
		expect(types(launch(s, 0, 1, 1))).toEqual(['miss']);
		run(s, 2);
		expect(s.hero.mode).toBe('stand');
		expect(s.hero.ledge).toBe(0);
	});

	it('first level in two full-strength lines (the browser test draws these)', () => {
		// 100°: past the reach of any web, so it's a leap that lands on the left ledge;
		// 60°: another leap, onto the high right ledge by the flag.
		const s = startLevel(0);
		playMove(s, { angle: 100, power: 1 });
		expect(s.hero).toMatchObject({ mode: 'stand', ledge: 1 });
		playMove(s, { angle: 60, power: 1 });
		expect(s.phase).toBe('complete');
		expect(s.stars).toBe(3);
	});
});

describe('crates', () => {
	it('flying through a crate smashes it and pops out coins to grab', () => {
		const s = startLevel(1); // "Catch a robber": a crate on the left ledge at 12 m
		const c = s.crates[0]!;
		const coinsBefore = s.coins.length;
		s.hero = { ...s.hero, mode: 'cling', x: W - TUNING.hero.radius, y: c.y + 0.8, ledge: -1 };
		const es = drawTo(s, { x: 0, y: c.y + 0.8 }); // straight across, just over the ledge
		expect(types(es)).toContain('smash');
		expect(c.broken).toBe(true);
		expect(s.coins.length).toBe(coinsBefore + TUNING.crate.coins);
		expect(s.score).toBeGreaterThanOrEqual(TUNING.scoring.crate);
	});

	it('standing next to a crate leaves it alone', () => {
		const s = startLevel(1);
		const c = s.crates[0]!;
		s.hero = { ...s.hero, mode: 'stand', x: c.x + 0.5, y: c.y + 0.45, ledge: 2 };
		run(s, 1);
		expect(c.broken).toBe(false);
	});
});

describe('hazards and robbers', () => {
	it('spikes bounce you up and cost a heart', () => {
		const s = startLevel(3); // "Watch your step": spikes at the far end of the first ledge
		const l = s.level.ledges[1]!;
		const spike = l.spikes[0]!;
		s.hero = {
			...s.hero,
			mode: 'fall',
			x: (spike[0] + spike[1]) / 2,
			y: l.top + 2,
			vx: 0,
			vy: 0,
			ledge: -1
		};
		const es = run(s, 0.6);
		expect(types(es)).toContain('hit');
		expect(s.hearts).toBe(TUNING.hearts - 1);
		expect(s.hero.vy).toBeGreaterThan(0);
	});

	it('tapping a robber webs them: they tumble and you score', () => {
		const s = startLevel(1); // a robber on the first ledge
		const b = s.baddies[0]!;
		const es: GameEvent[] = [];
		expect(tapRobber(s, { x: b.x, y: b.y + 0.8 }, es)).toBe(true);
		expect(types(es)).toEqual(['shot']);
		expect(types(run(s, 1))).toContain('webbed');
		expect(b.down).toBe(true);
		expect(s.score).toBe(TUNING.scoring.baddie);
	});

	it('swinging into a robber knocks them off; bumping one slowly gets you shoved', () => {
		const fast = startLevel(1);
		const b = fast.baddies[0]!;
		// Zip right through them.
		fast.hero = { ...fast.hero, mode: 'stand', x: b.x - 3, y: b.y + 0.9, ledge: 1 };
		expect(types(drawTo(fast, { x: W, y: b.y + 0.9 }))).toContain('bumped');
		expect(b.dir).toBe(1);

		const slow = startLevel(1);
		const c = slow.baddies[0]!;
		slow.hero = {
			...slow.hero,
			mode: 'stand',
			x: c.x - 0.8,
			y: c.y + TUNING.hero.radius,
			vx: 0,
			vy: 0,
			ledge: 1
		};
		expect(types(run(slow, 0.1))).toContain('hit');
		expect(slow.hearts).toBe(TUNING.hearts - 1);
		expect(slow.hero.mode).toBe('fall');
	});

	it('robbers lob water balloons when you come close, and a dunk costs a heart', () => {
		const s = startLevel(1); // robber on the right ledge at 6 m; stand on the left one at 12 m
		const l = s.level.ledges[2]!;
		s.hero = { ...s.hero, mode: 'stand', x: l.x1 - 0.5, y: l.top + TUNING.hero.radius, ledge: 2 };
		const es = run(s, 8);
		expect(types(es)).toContain('throw');
		expect(types(es)).toContain('hit');
	});

	it("a caught robber's balloons pop harmlessly", () => {
		const s = startLevel(1);
		const b = s.baddies[0]!;
		s.balloons.push({ from: 0, x: b.x - 1, y: b.y + 2, vx: -5, vy: 0 });
		b.down = true;
		expect(types(run(s, 0.1))).toContain('splash');
		expect(s.balloons).toHaveLength(0);
		expect(s.hearts).toBe(TUNING.hearts);
	});
});

describe('runs', () => {
	it('the next level gives a heart back; runs save and validate', () => {
		const n = nextLevel(startLevel(0, 500, 1));
		expect(n).toMatchObject({ levelIndex: 1, hearts: 2, score: 500 });
		expect(isSavedRun(saved(n))).toBe(true);
		expect(isSavedRun({ levelIndex: 99, score: 0, hearts: 3 })).toBe(false);
		expect(isSavedRun({ levelIndex: 0, score: 0, hearts: 0 })).toBe(false);
	});

	it('after the last level it starts again from the first, keeping the score', () => {
		const n = nextLevel(startLevel(LEVELS.length - 1, 1234));
		expect(n.levelIndex).toBe(0);
		expect(n.score).toBe(1234);
	});

	it('landing on spikes on the last heart ends the run (the browser test does this)', () => {
		// Level 4: up under the left ledge (100°), then down-right onto the spiky ledge (300–320°).
		for (const second of [300, 310, 320]) {
			const s = startLevel(3, 0, 1);
			playMove(s, { angle: 100, power: 1 });
			playMove(s, { angle: second, power: 1 });
			expect(s.phase, `${second}°`).toBe('over');
		}
	});

	it('losing the last heart ends the run', () => {
		const s = startLevel(3, 0, 1);
		const l = s.level.ledges[1]!;
		const spike = l.spikes[0]!;
		s.hero = {
			...s.hero,
			mode: 'fall',
			x: (spike[0] + spike[1]) / 2,
			y: l.top + 2,
			vx: 0,
			vy: 0,
			ledge: -1
		};
		expect(types(run(s, 1))).toContain('over');
		expect(s.phase).toBe('over');
	});
});
