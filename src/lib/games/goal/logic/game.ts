// Goal's rules. Dribble the ball or flick a kick past the chasers and into
// the goal. Chasers are simple magnets: they run straight at the ball. A fast ball knocks a
// chaser over; a slow one gets taken, which costs a ball and restarts the level.
// Pure TypeScript: index.ts turns the returned events into sounds and effects.
import {
	bounce,
	newContact,
	polySegs,
	pushOut,
	pushOutOfDisc,
	type Contact,
	type Disc,
	type DiscKind,
	type Seg,
	type SegKind
} from './geometry';
import { LEVELS, type Level } from './levels';
import { TUNING } from './tuning';

export interface Ball {
	x: number;
	y: number;
	vx: number;
	vy: number;
	/** Distance rolled, for spinning the drawing. */
	rolled: number;
}

export interface Chaser {
	x: number;
	y: number;
	vx: number;
	vy: number;
	down: boolean;
}

export interface Keeper {
	x: number;
	y: number;
	vx: number;
	minX: number;
	maxX: number;
}

/** The level's collision shapes, built once per level. */
export interface Arena {
	segs: Seg[];
	discs: Disc[];
	/** Where the camera may look: the bounding box of the outline, plus the net. */
	bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

export type Phase = 'play' | 'goal' | 'taken' | 'over';

export interface GameState {
	dribble: { x: number; y: number } | null;
	levelIndex: number;
	level: Level;
	arena: Arena;
	ball: Ball;
	chasers: Chaser[];
	keeper: Keeper | null;
	phase: Phase;
	/** Chasers stay put until the first kick of each attempt. */
	started: boolean;
	/** Chasers knocked over by the current kick (for the combo). */
	combo: number;
	/** Index of the chaser who took the ball, or -1. */
	taker: number;
	score: number;
	balls: number;
	speed: number;
}

export type BounceKind = SegKind | DiscKind | 'keeper';

export type GameEvent =
	| { type: 'kick'; power: number }
	| { type: 'bounce'; kind: BounceKind; speed: number; x: number; y: number }
	| { type: 'knock'; index: number; combo: number; points: number }
	| { type: 'goal'; points: number; allDown: boolean }
	| { type: 'taken'; index: number }
	| { type: 'over' };

export interface SavedRun {
	levelIndex: number;
	score: number;
	balls: number;
}

/** Saved runs can't claim impossible values (hand-edited or from a future version). */
export function isSavedRun(x: unknown): x is SavedRun {
	if (!x || typeof x !== 'object') return false;
	const r = x as Record<string, unknown>;
	return (
		Number.isInteger(r.levelIndex) &&
		(r.levelIndex as number) >= 0 &&
		(r.levelIndex as number) < LEVELS.length * 100 &&
		Number.isFinite(r.score) &&
		(r.score as number) >= 0 &&
		Number.isInteger(r.balls) &&
		(r.balls as number) > 0 &&
		(r.balls as number) <= TUNING.balls
	);
}

export function saved(s: GameState): SavedRun {
	return { levelIndex: s.levelIndex, score: s.score, balls: s.balls };
}

export function buildArena(level: Level): Arena {
	const { x: gx, y: gy, width } = level.goal;
	const left = gx - width / 2;
	const right = gx + width / 2;
	const back = gy - TUNING.goal.depth;
	const segs = [
		...polySegs(level.outline, 'wall', false),
		...polySegs([left, gy, left, back, right, back, right, gy], 'net', false),
		...(level.blocks ?? []).flatMap((b) => polySegs(b, 'block'))
	];
	const pr = TUNING.goal.postRadius;
	const discs: Disc[] = [
		{ x: left, y: gy, r: pr, kind: 'post' },
		{ x: right, y: gy, r: pr, kind: 'post' },
		...(level.discs ?? [])
	];
	let minX = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (let i = 0; i < level.outline.length; i += 2) {
		minX = Math.min(minX, level.outline[i]!);
		maxX = Math.max(maxX, level.outline[i]!);
		maxY = Math.max(maxY, level.outline[i + 1]!);
	}
	return { segs, discs, bounds: { minX, minY: back, maxX, maxY } };
}

/** Start `levelIndex` (levels repeat, faster each time round) with this score and balls. */
export function startLevel(levelIndex: number, score = 0, balls: number = TUNING.balls): GameState {
	const level = LEVELS[levelIndex % LEVELS.length]!;
	const loop = Math.floor(levelIndex / LEVELS.length);
	const { x: gx, y: gy, width } = level.goal;
	const K = TUNING.keeper;
	return {
		levelIndex,
		dribble: null,
		level,
		arena: buildArena(level),
		ball: { x: level.ball.x, y: level.ball.y, vx: 0, vy: 0, rolled: 0 },
		chasers: level.chasers.map((c) => ({ x: c.x, y: c.y, vx: 0, vy: 0, down: false })),
		keeper: level.keeper
			? {
					x: gx,
					y: gy + K.front,
					vx: 0,
					minX: gx - width / 2 - K.reach + K.radius,
					maxX: gx + width / 2 + K.reach - K.radius
				}
			: null,
		phase: 'play',
		started: false,
		combo: 0,
		taker: -1,
		score,
		balls,
		speed: (level.speed ?? 1) * (1 + loop * TUNING.loopSpeedUp)
	};
}

export function nextLevel(s: GameState): GameState {
	return startLevel(s.levelIndex + 1, s.score, s.balls);
}

/** Same level again, after the ball was taken (balls were already counted down). */
export function retryLevel(s: GameState): GameState {
	return startLevel(s.levelIndex, s.score, s.balls);
}

export function ballSpeed(b: Ball): number {
	return Math.hypot(b.vx, b.vy);
}

/** Move a relative ground target with the finger. Never accumulate a long queue of
 * movement behind a fence; reversing the finger takes effect on the next physics step. */
export function steer(s: GameState, dx: number, dy: number) {
	if (s.phase !== 'play' || (!dx && !dy)) return;
	const t = (s.dribble ??= { x: s.ball.x, y: s.ball.y });
	let x = t.x - s.ball.x,
		y = t.y - s.ball.y;
	x = (dx * x < 0 ? 0 : x) + dx;
	y = (dy * y < 0 ? 0 : y) + dy;
	const k = Math.min(1, TUNING.dribble.maxLead / (Math.hypot(x, y) || 1));
	t.x = s.ball.x + x * k;
	t.y = s.ball.y + y * k;
	s.started = true;
}

function guideBall(s: GameState, dt: number) {
	const t = s.dribble!;
	const b = s.ball,
		D = TUNING.dribble;
	const dx = t.x - b.x,
		dy = t.y - b.y;
	const gain = Math.min(D.response, D.speed / (Math.hypot(dx, dy) || 1));
	const ax = dx * gain - b.vx,
		ay = dy * gain - b.vy,
		k = Math.min(1, (D.acceleration * dt) / (Math.hypot(ax, ay) || 1));
	b.vx += ax * k;
	b.vy += ay * k;
}

/** Kick speed for a strength 0..1. */
export function kickSpeed(power: number): number {
	const k = TUNING.kick;
	return k.minSpeed + (k.maxSpeed - k.minSpeed) * Math.min(Math.max(power, 0), 1);
}

/** A flick can redirect even a fast-moving ball during play. */
export function kick(
	s: GameState,
	dx: number,
	dy: number,
	power: number,
	events: GameEvent[]
): boolean {
	const len = Math.hypot(dx, dy);
	if (s.phase !== 'play' || len < 1e-6) return false;
	s.dribble = null;
	const v = kickSpeed(power);
	s.ball.vx = (dx / len) * v;
	s.ball.vy = (dy / len) * v;
	s.started = true;
	s.combo = 0;
	events.push({ type: 'kick', power });
	return true;
}

// ---- Stepping ---------------------------------------------------------------------------------

const contact: Contact = newContact();

const BOUNCE: Record<SegKind | DiscKind, number> = {
	wall: TUNING.ball.wallBounce,
	block: TUNING.ball.wallBounce,
	net: 0.15,
	post: TUNING.ball.postBounce,
	rock: TUNING.ball.rockBounce,
	bush: 0.35,
	tyre: 0.95
};

/** Only report impacts above this speed (px/s), so a resting ball is silent. */
const AUDIBLE = 90;

/** Roll the ball for `dt` and bounce it off the arena. Reports the hardest impact. */
function moveBall(b: Ball, arena: Arena, dt: number, events: GameEvent[], guided: boolean) {
	const B = TUNING.ball;
	const speed = Math.hypot(b.vx, b.vy);
	if (speed > 0) {
		let next = guided ? speed : speed - (B.linear + B.drag * speed) * dt;
		if (next < B.stopSpeed) next = 0;
		const k = next / speed;
		b.vx *= k;
		b.vy *= k;
		b.x += b.vx * dt;
		b.y += b.vy * dt;
		b.rolled += next * dt;
	}
	if (!pushOut(b, B.radius, arena.segs, arena.discs, contact)) return;
	const kind = contact.seg?.kind ?? contact.disc!.kind;
	const impact = bounce(b, contact.nx, contact.ny, BOUNCE[kind]);
	if (impact > AUDIBLE) events.push({ type: 'bounce', kind, speed: impact, x: b.x, y: b.y });
}

function moveKeeper(s: GameState, dt: number) {
	const k = s.keeper!;
	const target = Math.min(Math.max(s.ball.x, k.minX), k.maxX);
	const max = TUNING.keeper.speed * s.speed * dt;
	const step = Math.min(Math.max(target - k.x, -max), max);
	k.x += step;
	k.vx = step / dt;
}

function moveChasers(s: GameState, dt: number) {
	const C = TUNING.chaser;
	const speed = C.speed * s.speed;
	const maxDv = C.accel * dt;
	const b = s.ball;
	for (const c of s.chasers) {
		if (c.down) continue;
		const dx = b.x - c.x;
		const dy = b.y - c.y;
		const d = Math.hypot(dx, dy) || 1;
		let ax = (dx / d) * speed - c.vx;
		let ay = (dy / d) * speed - c.vy;
		const a = Math.hypot(ax, ay);
		if (a > maxDv) {
			ax *= maxDv / a;
			ay *= maxDv / a;
		}
		c.vx += ax;
		c.vy += ay;
		c.x += c.vx * dt;
		c.y += c.vy * dt;
		// Dumb magnets: they slide along whatever is in the way rather than going round it.
		for (let pass = 0; pass < 2; pass++) {
			if (!pushOut(c, C.radius, s.arena.segs, s.arena.discs, contact)) break;
			bounce(c, contact.nx, contact.ny, 0);
		}
	}
	// Keep chasers from standing inside each other.
	const min = C.radius * 2;
	for (let i = 0; i < s.chasers.length; i++) {
		const p = s.chasers[i]!;
		if (p.down) continue;
		for (let j = i + 1; j < s.chasers.length; j++) {
			const q = s.chasers[j]!;
			if (q.down) continue;
			const dx = q.x - p.x;
			const dy = q.y - p.y;
			const d2 = dx * dx + dy * dy;
			if (d2 >= min * min || d2 < 1e-9) continue;
			const d = Math.sqrt(d2);
			const push = (min - d) / 2;
			p.x -= (dx / d) * push;
			p.y -= (dy / d) * push;
			q.x += (dx / d) * push;
			q.y += (dy / d) * push;
		}
	}
}

/** Ball against chasers: knock them over if it's fast, or lose it to them if it's slow. */
function touchChasers(s: GameState, events: GameEvent[]) {
	const b = s.ball;
	const C = TUNING.chaser;
	const reach = C.radius + TUNING.ball.radius;
	for (let i = 0; i < s.chasers.length; i++) {
		const c = s.chasers[i]!;
		if (c.down) continue;
		const dx = b.x - c.x;
		const dy = b.y - c.y;
		if (dx * dx + dy * dy >= reach * reach) continue;
		const speed = ballSpeed(b);
		if (speed >= C.knockSpeed) {
			c.down = true;
			c.vx = c.vy = 0;
			s.combo++;
			const points = TUNING.scoring.knock * s.combo;
			s.score += points;
			// The ball ploughs on, a little slower, glancing off to the side it hit.
			const d = Math.hypot(dx, dy) || 1;
			const nx = dx / d;
			const ny = dy / d;
			const keep = C.knockKeep;
			const ux = b.vx / speed + nx * 0.35;
			const uy = b.vy / speed + ny * 0.35;
			const ul = Math.hypot(ux, uy) || 1;
			b.vx = (ux / ul) * speed * keep;
			b.vy = (uy / ul) * speed * keep;
			events.push({ type: 'knock', index: i, combo: s.combo, points });
		} else {
			s.taker = i;
			b.vx = b.vy = 0;
			s.balls--;
			s.phase = s.balls > 0 ? 'taken' : 'over';
			events.push({ type: 'taken', index: i });
			if (s.phase === 'over') events.push({ type: 'over' });
			return;
		}
	}
}

function checkGoal(s: GameState, events: GameEvent[]) {
	const { x, y, width } = s.level.goal;
	const b = s.ball;
	if (b.y >= y || Math.abs(b.x - x) > width / 2) return;
	s.phase = 'goal';
	const allDown = s.chasers.every((c) => c.down);
	const points = TUNING.scoring.goal + (allDown ? TUNING.scoring.allDown : 0);
	s.score += points;
	events.push({ type: 'goal', points, allDown });
}

/** Advance the game by `dt` seconds. Clears and fills `events`. */
export function step(s: GameState, dt: number, events: GameEvent[]): GameEvent[] {
	events.length = 0;
	if (s.phase === 'taken' || s.phase === 'over') return events;
	const n = TUNING.substeps;
	const sub = dt / n;
	for (let k = 0; k < n; k++) {
		const guided = s.phase === 'play' && s.dribble !== null;
		if (guided) guideBall(s, sub);
		moveBall(s.ball, s.arena, sub, events, guided);
		if (s.keeper) {
			if (s.phase === 'play') moveKeeper(s, sub);
			const K = TUNING.keeper;
			if (
				pushOutOfDisc(s.ball, TUNING.ball.radius, s.keeper.x, s.keeper.y, K.radius, contact, false)
			) {
				const impact = bounce(s.ball, contact.nx, contact.ny, K.bounce);
				if (impact > AUDIBLE)
					events.push({ type: 'bounce', kind: 'keeper', speed: impact, x: s.ball.x, y: s.ball.y });
			}
		}
		if (s.phase !== 'play') continue; // a scored ball just rolls into the net
		if (s.started) touchChasers(s, events);
		if (s.phase !== 'play') return events;
		checkGoal(s, events);
	}
	if (s.phase === 'play' && s.started) moveChasers(s, dt);
	return events;
}
