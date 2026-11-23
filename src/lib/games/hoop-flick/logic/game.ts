// Hoop Flick arcade round: 60 seconds, swish = 3, rim-in = 2. Every 5 baskets the
// hoop swings further and faster. Three swishes in a row puts you "on fire" (double points) until
// a miss. Pure state + step(); the view only reads it and plays the events.
import { aimFlick, type Aim } from './aim';
import { launchBall, stepBall, type Ball, type BallEvent } from './physics';
import { TUNING } from './tuning';

const M = TUNING.moving;
const S = TUNING.scoring;
const RD = TUNING.round;

export interface GameState {
	timeLeft: number;
	elapsed: number;
	score: number;
	baskets: number;
	throws: number;
	swishStreak: number;
	onFire: boolean;
	level: number;
	hoop: { x: number; phase: number; amplitude: number };
	balls: Ball[];
	nextId: number;
	/** Seconds until the next ball is in hand (0 = ready). */
	reload: number;
	/** The clock ran out; balls already in the air can still score. */
	timeUp: boolean;
	/** Time is up and every ball has landed. */
	over: boolean;
}

export type GameEvent =
	| (BallEvent & { ballId: number })
	| { type: 'points'; ballId: number; points: number; swish: boolean; fire: boolean }
	| { type: 'fire'; on: boolean }
	| { type: 'level'; level: number }
	| { type: 'tick'; seconds: number }
	| { type: 'timeUp' }
	| { type: 'over' };

export function newGame(): GameState {
	return {
		timeLeft: RD.seconds,
		elapsed: 0,
		score: 0,
		baskets: 0,
		throws: 0,
		swishStreak: 0,
		onFire: false,
		level: 0,
		hoop: { x: 0, phase: 0, amplitude: 0 },
		balls: [],
		nextId: 1,
		reload: 0,
		timeUp: false,
		over: false
	};
}

export function hoopSpeed(level: number): number {
	if (level <= 0) return 0;
	return Math.min(M.speedBase + M.speedStep * (level - 1), M.speedMax);
}

/** Where the hoop will be `ahead` seconds from now if nothing changes. */
export function predictHoopX(s: GameState, ahead: number): number {
	const { phase, amplitude } = s.hoop;
	return amplitude * Math.sin(phase + hoopSpeed(s.level) * ahead);
}

export function canThrow(s: GameState): boolean {
	return !s.timeUp && s.reload <= 0;
}

/** Throw the ball in hand with a flick (logical px/ms). Returns the aim, or null if no throw. */
export function throwBall(s: GameState, flick: { vx: number; vy: number }): Aim | null {
	if (!canThrow(s)) return null;
	const aim = aimFlick(flick, predictHoopX(s, TUNING.throw.flightTime));
	if (!aim) return null;
	s.balls.push(launchBall(s.nextId++, aim.velocity));
	s.throws++;
	s.reload = RD.reloadSeconds;
	return aim;
}

function onBasket(s: GameState, ball: Ball, swish: boolean, out: GameEvent[]) {
	const fire = s.onFire;
	const points = (swish ? S.swish : S.rimIn) * (fire ? S.fireMultiplier : 1);
	s.score += points;
	s.baskets++;
	out.push({ type: 'points', ballId: ball.id, points, swish, fire });

	s.swishStreak = swish ? s.swishStreak + 1 : 0;
	if (!s.onFire && s.swishStreak >= S.fireStreak) {
		s.onFire = true;
		out.push({ type: 'fire', on: true });
	}
	const level = Math.floor(s.baskets / M.basketsPerLevel);
	if (level > s.level) {
		s.level = level;
		out.push({ type: 'level', level });
	}
}

function onMiss(s: GameState, out: GameEvent[]) {
	s.swishStreak = 0;
	if (s.onFire) {
		s.onFire = false;
		out.push({ type: 'fire', on: false });
	}
}

/** Advance the round by `dt` seconds. Returns what happened, for sounds and effects. */
export function step(s: GameState, dt: number): GameEvent[] {
	const out: GameEvent[] = [];
	if (s.over) return out;
	s.elapsed += dt;

	if (!s.timeUp) {
		const before = Math.ceil(s.timeLeft);
		s.timeLeft = Math.max(s.timeLeft - dt, 0);
		const after = Math.ceil(s.timeLeft);
		if (after < before && after > 0 && after <= RD.tickFrom) {
			out.push({ type: 'tick', seconds: after });
		}
		if (s.timeLeft <= 0) {
			s.timeUp = true;
			out.push({ type: 'timeUp' });
		}
	}

	// The hoop eases into its swing, then speeds up with each level.
	const h = s.hoop;
	const targetAmp = s.level > 0 ? M.amplitude : 0;
	h.amplitude = Math.min(h.amplitude + M.ramp * dt, targetAmp);
	h.phase += hoopSpeed(s.level) * dt;
	h.x = h.amplitude * Math.sin(h.phase);

	s.reload = Math.max(s.reload - dt, 0);

	const events: BallEvent[] = [];
	for (const ball of s.balls) {
		events.length = 0;
		stepBall(ball, h.x, dt, events);
		for (const e of events) {
			out.push({ ...e, ballId: ball.id });
			if (e.type === 'basket') onBasket(s, ball, e.swish, out);
			else if (e.type === 'miss') onMiss(s, out);
		}
	}
	s.balls = s.balls.filter((b) => !b.resolved || b.resolvedAge < RD.lingerSeconds);

	if (s.timeUp && s.balls.every((b) => b.resolved)) {
		s.over = true;
		out.push({ type: 'over' });
	}
	return out;
}
