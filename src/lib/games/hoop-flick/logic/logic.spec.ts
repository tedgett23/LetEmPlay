import { describe, expect, it } from 'vitest';
import { aimFlick, assist, flickPower } from './aim';
import { canThrow, newGame, step, throwBall, type GameEvent, type GameState } from './game';
import { crossedRimDown, launchBall, stepBall, type BallEvent } from './physics';
import { project, unproject } from './projection';
import { TUNING } from './tuning';

const DT = 1 / 60;
const P = TUNING.throw.perfectSpeed;
const { rimY, z: hoopZ, rimRadius } = TUNING.hoop;

/** Run until all balls are gone (or `maxSeconds`), collecting events. */
function run(s: GameState, maxSeconds = 4): GameEvent[] {
	const out: GameEvent[] = [];
	for (let t = 0; t < maxSeconds && (s.balls.length > 0 || !s.timeUp); t += DT) {
		out.push(...step(s, DT));
		if (s.over || (s.balls.length === 0 && !s.timeUp && t > 0.1)) break;
	}
	return out;
}

function shoot(s: GameState, power = 1, angle = 0) {
	const aim = throwBall(s, { vx: P * power * angle, vy: -P * power });
	expect(aim).not.toBeNull();
	return run(s);
}

const types = (es: GameEvent[]) => es.map((e) => e.type);

describe('projection', () => {
	it('round-trips through unproject at a known depth', () => {
		const p = project(0.4, 2.5, hoopZ);
		const w = unproject(p.x, p.y, hoopZ);
		expect(w.x).toBeCloseTo(0.4);
		expect(w.y).toBeCloseTo(2.5);
	});
	it('makes far things smaller', () => {
		expect(project(0, 1, hoopZ).k).toBeLessThan(project(0, 1, 0).k);
	});
	it('keeps the ball in hand and the rim on screen', () => {
		const s = TUNING.ball.start;
		const ball = project(s.x, s.y, s.z);
		const rim = project(0, rimY, hoopZ);
		expect(ball.y).toBeGreaterThan(1000);
		expect(ball.y + TUNING.ball.radius * ball.k).toBeLessThan(1280);
		expect(rim.y).toBeGreaterThan(300);
		expect(rim.y).toBeLessThan(600);
	});
});

describe('aim', () => {
	it('ignores slow, downward and sideways swipes', () => {
		expect(flickPower(0, -0.1)).toBeNull();
		expect(flickPower(0, 2)).toBeNull();
		expect(flickPower(3, -1)).toBeNull();
		expect(flickPower(0, -P)).toBeCloseTo(1);
	});
	it('assist pulls near values in and is continuous at the window edge', () => {
		expect(assist(1.1, 1, 0.3, 0.2)).toBeCloseTo(1.02);
		expect(assist(0.9, 1, 0.3, 0.2)).toBeCloseTo(0.98);
		expect(assist(1.3 + 1e-9, 1, 0.3, 0.2)).toBeCloseTo(assist(1.3, 1, 0.3, 0.2));
		expect(assist(2, 1, 0.3, 0.2)).toBeCloseTo(1 + 0.06 + 0.7);
	});
	it('a straight perfect flick heads for the hoop and arrives falling', () => {
		const aim = aimFlick({ vx: 0, vy: -P }, 0)!;
		expect(aim.velocity.vx).toBeCloseTo(0);
		const T = TUNING.throw.flightTime;
		expect(aim.velocity.vy - TUNING.gravity * T).toBeLessThan(-3);
	});
	it('flicking right aims right, and the assist bends it toward the target', () => {
		const aim = aimFlick({ vx: P * 0.15, vy: -P }, 0)!;
		expect(aim.aimX).toBeGreaterThan(0.3);
		expect(Math.abs(aim.assistedX)).toBeLessThan(aim.aimX);
	});
	it('caps power', () => {
		expect(aimFlick({ vx: 0, vy: -P * 5 }, 0)!.power).toBe(TUNING.throw.maxPower);
	});
});

describe('ball physics', () => {
	it('detects a downward crossing inside the ring only', () => {
		const above = { x: 0, y: rimY + 0.05, z: hoopZ };
		const below = { x: 0, y: rimY - 0.05, z: hoopZ };
		expect(crossedRimDown(above, below, 0)).toBe(true);
		expect(crossedRimDown(below, above, 0)).toBe(false); // going up
		const off = (p: typeof above) => ({ ...p, x: rimRadius + 0.05 });
		expect(crossedRimDown(off(above), off(below), 0)).toBe(false);
		expect(crossedRimDown(above, below, 1)).toBe(false); // the hoop moved away
	});

	it('a rising ball passes in front of the rim without touching it', () => {
		// Aim straight up through the front of the rim from below, rising fast.
		const b = launchBall(1, { vx: 0, vy: 8, vz: 0 });
		b.x = 0;
		b.z = hoopZ - rimRadius;
		b.y = rimY - 0.5;
		const out: BallEvent[] = [];
		for (let i = 0; i < 10; i++) stepBall(b, 0, DT, out);
		expect(b.y).toBeGreaterThan(rimY);
		expect(out.map((e) => e.type)).not.toContain('rim');
	});

	it('a falling ball bounces off the rim', () => {
		const b = launchBall(1, { vx: 0, vy: -2, vz: 0 });
		b.x = 0;
		b.z = hoopZ - rimRadius;
		b.y = rimY + 0.3;
		const out: BallEvent[] = [];
		for (let i = 0; i < 20; i++) stepBall(b, 0, DT, out);
		expect(out.map((e) => e.type)).toContain('rim');
		expect(b.touchedRim).toBe(true);
	});
});

describe('round', () => {
	it('a perfect flick is a swish worth 3', () => {
		const s = newGame();
		const es = shoot(s);
		expect(types(es)).toContain('basket');
		expect(es.find((e) => e.type === 'points')).toMatchObject({ points: 3, swish: true });
		expect(s.score).toBe(3);
		expect(s.baskets).toBe(1);
	});

	it('forgives a flick that is a bit slow, fast or off to the side', () => {
		for (const [power, angle] of [
			[0.85, 0],
			[1.15, 0],
			[1, 0.15],
			[1, -0.15]
		] as const) {
			const s = newGame();
			shoot(s, power, angle);
			expect(s.score, `power ${power} angle ${angle}`).toBeGreaterThan(0);
		}
	});

	it('a weak flick falls short and is a miss', () => {
		const s = newGame();
		const es = shoot(s, 0.4);
		expect(types(es)).toContain('miss');
		expect(s.score).toBe(0);
	});

	it('a rim-in scores 2', () => {
		const s = newGame();
		shoot(s, 0.8);
		expect(s.score).toBe(2);
	});

	it('needs a short reload between throws', () => {
		const s = newGame();
		expect(throwBall(s, { vx: 0, vy: -P })).not.toBeNull();
		expect(canThrow(s)).toBe(false);
		expect(throwBall(s, { vx: 0, vy: -P })).toBeNull();
		for (let t = 0; t < TUNING.round.reloadSeconds + DT; t += DT) step(s, DT);
		expect(canThrow(s)).toBe(true);
	});

	it('three swishes in a row light the fire: double points until a miss', () => {
		const s = newGame();
		for (let i = 0; i < 3; i++) shoot(s);
		expect(s.onFire).toBe(true);
		expect(s.score).toBe(9);
		shoot(s);
		expect(s.score).toBe(15); // 3 × 2
		const es = shoot(s, 0.4);
		expect(es).toContainEqual({ type: 'fire', on: false });
		expect(s.onFire).toBe(false);
		shoot(s);
		expect(s.score).toBe(18);
	});

	it('the hoop starts moving after 5 baskets, and the aim leads it', () => {
		const s = newGame();
		for (let i = 0; i < 5; i++) shoot(s);
		expect(s.level).toBe(1);
		const xs = new Set<number>();
		for (let i = 0; i < 120; i++) {
			step(s, DT);
			xs.add(Math.round(s.hoop.x * 100));
		}
		expect(xs.size).toBeGreaterThan(10);
		// A straight flick still scores on the moving hoop: the aim leads it to where it'll be.
		const m = newGame();
		m.level = 1;
		m.hoop.amplitude = TUNING.moving.amplitude;
		// Left of centre now, swinging right: it will be about 0.4 right of centre on arrival.
		m.hoop.phase =
			Math.asin(0.4 / TUNING.moving.amplitude) - TUNING.moving.speedBase * TUNING.throw.flightTime;
		step(m, 0);
		const aim = throwBall(m, { vx: 0, vy: -P })!;
		expect(aim.assistedX).toBeGreaterThan(0.3);
		run(m);
		expect(m.score).toBeGreaterThan(0);
	});

	it('counts down the last seconds, then ends after balls in the air land', () => {
		const s = newGame();
		const ticks: number[] = [];

		for (let t = 0; t < TUNING.round.seconds - 0.5; t += DT) {
			for (const e of step(s, DT)) if (e.type === 'tick') ticks.push(e.seconds);
		}
		throwBall(s, { vx: 0, vy: -P }); // a buzzer beater
		const later: GameEvent[] = [];
		for (let t = 0; t < 5 && !s.over; t += DT) later.push(...step(s, DT));
		for (const e of later) if (e.type === 'tick') ticks.push(e.seconds);
		const timeUp = types(later).includes('timeUp');
		expect(ticks).toEqual([5, 4, 3, 2, 1]);
		expect(timeUp).toBe(true);
		expect(s.over).toBe(true);
		expect(s.score).toBe(3);
		// After time's up you can't throw.
		expect(throwBall(s, { vx: 0, vy: -P })).toBeNull();
		expect(types(later).indexOf('basket')).toBeLessThan(types(later).indexOf('over'));
	});
});
