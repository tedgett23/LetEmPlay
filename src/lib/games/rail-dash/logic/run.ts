// One Rail Dash run (MVP.md §10.3): the player runs forward forever, the world is generated from
// validated patterns, and the run ends on a head-on hit. Pure state + step(); the renderer reads
// it. Positions along the track are absolute metres (`distance`, obstacle `s`); the renderer
// subtracts `distance` so the world moves toward a player who stays at z = 0.
import { createRng, type Rng } from '../../../kit/rng';
import { PATTERNS, type ObstacleKind, type Pattern } from './patterns';
import { laneX, speedAt, TUNING } from './tuning';

const P = TUNING.player;
const O = TUNING.obstacles;
const W = TUNING.world;
const F = TUNING.forgiveness;

export type Action = 'left' | 'right' | 'jump' | 'slide';

export interface Obstacle {
	id: number;
	kind: ObstacleKind;
	lane: number;
	/** Near edge on the track. For an oncoming train: where it meets the player. */
	s: number;
	length: number;
	/** Current near edge (moves for oncoming trains). */
	front: number;
	warned: boolean;
}

export interface Coin {
	id: number;
	lane: number;
	s: number;
	y: number;
	taken: boolean;
}

export interface Player {
	/** Target lane (-1, 0, 1). */
	lane: number;
	/** Lane the current lane change started from. */
	fromLane: number;
	fromX: number;
	x: number;
	/** Lane-change progress 0..1 (1 = settled). */
	laneT: number;
	y: number;
	vy: number;
	airborne: boolean;
	/** Height of what's under your feet: 0 for the track, or a train roof. */
	ground: number;
	/** Seconds of slide left (0 = running upright). */
	slide: number;
	/** Swipe down in the air: slide on landing. */
	slideOnLand: boolean;
	stumble: number;
}

export interface RunState {
	time: number;
	distance: number;
	speed: number;
	coins: number;
	coinPoints: number;
	player: Player;
	obstacles: Obstacle[];
	coinsList: Coin[];
	nextId: number;
	spawnedTo: number;
	rngState: number;
	lastPattern: string;
	buffered: Action | null;
	bufferAge: number;
	over: boolean;
}

export type RunEvent =
	| { type: 'coin'; id: number; points: number }
	| { type: 'jump' }
	| { type: 'land' }
	| { type: 'slide' }
	| { type: 'lane' }
	| { type: 'stumble' }
	| { type: 'crash'; id: number }
	| { type: 'warn'; id: number }
	| { type: 'tier'; tier: number };

const GRAVITY = (8 * P.jumpHeight) / (P.jumpSeconds * P.jumpSeconds);
const JUMP_V = (4 * P.jumpHeight) / P.jumpSeconds;

export function newRun(seed: number): RunState {
	return {
		time: 0,
		distance: 0,
		speed: TUNING.speed.start,
		coins: 0,
		coinPoints: 0,
		player: {
			lane: 0,
			fromLane: 0,
			fromX: 0,
			x: 0,
			laneT: 1,
			y: 0,
			vy: 0,
			airborne: false,
			ground: 0,
			slide: 0,
			slideOnLand: false,
			stumble: 0
		},
		obstacles: [],
		coinsList: [],
		nextId: 1,
		spawnedTo: W.introLength,
		rngState: seed >>> 0,
		lastPattern: '',
		buffered: null,
		bufferAge: 0,
		over: false
	};
}

export function score(s: RunState): number {
	return Math.floor(s.distance) + s.coinPoints;
}

export function tierAt(seconds: number): 1 | 2 | 3 {
	if (seconds >= TUNING.tiers.three) return 3;
	if (seconds >= TUNING.tiers.two) return 2;
	return 1;
}

/** Each coin is worth more in later tiers ("coins × multiplier"). */
export function coinValue(seconds: number): number {
	return TUNING.coin.value * tierAt(seconds);
}

// ---- Spawning ----------------------------------------------------------------------------------

/** Mostly the current tier, sometimes an easier one for breathing room. */
export function pickPattern(rng: Rng, tier: number, last: string): Pattern {
	for (let tries = 0; tries < 8; tries++) {
		const t = tier === 1 ? 1 : rng.next() < 0.6 ? tier : 1 + rng.int(tier - 1);
		const pool = PATTERNS.filter((p) => p.tier === t);
		const p = pool[rng.int(pool.length)]!;
		if (p.name !== last) return p;
	}
	return PATTERNS[0]!;
}

function spawn(s: RunState) {
	if (s.spawnedTo >= s.distance + W.spawnAhead) return;
	const rng = createRng(s.rngState);
	while (s.spawnedTo < s.distance + W.spawnAhead) {
		const p = pickPattern(rng, tierAt(s.time), s.lastPattern);
		const base = s.spawnedTo + W.gapRows * W.rowLength;
		for (const o of p.obstacles) {
			s.obstacles.push({
				id: s.nextId++,
				kind: o.kind,
				lane: o.lane,
				s: base + o.at,
				length: o.length,
				front: base + o.at,
				warned: false
			});
		}
		for (const c of p.coins) {
			s.coinsList.push({ id: s.nextId++, lane: c.lane, s: base + c.at, y: c.y, taken: false });
		}
		s.spawnedTo = base + p.length;
		s.lastPattern = p.name;
	}
	s.rngState = rng.state;
}

/** Remove things behind the player, in place (no new arrays in the hot path). */
function despawn(s: RunState) {
	const behind = s.distance - W.despawnBehind;
	let j = 0;
	for (const o of s.obstacles) if (o.front + o.length >= behind) s.obstacles[j++] = o;
	s.obstacles.length = j;
	j = 0;
	for (const c of s.coinsList) if (c.s >= behind && !c.taken) s.coinsList[j++] = c;
	s.coinsList.length = j;
}

// ---- Input ---------------------------------------------------------------------------------------

function startLaneChange(p: Player, dir: -1 | 1): boolean {
	const to = p.lane + dir;
	if (to < -1 || to > 1) return false;
	p.fromLane = p.lane;
	p.fromX = p.x;
	p.lane = to;
	p.laneT = 0;
	return true;
}

/** Apply a swipe now if possible; otherwise buffer it if the current move is nearly done. */
export function input(s: RunState, action: Action, out: RunEvent[] = []): RunEvent[] {
	if (s.over) return out;
	const p = s.player;
	switch (action) {
		case 'left':
		case 'right':
			// Lane changes always apply immediately, even mid-change: retarget from where you are.
			if (startLaneChange(p, action === 'left' ? -1 : 1)) out.push({ type: 'lane' });
			return out;
		case 'jump':
			if (!p.airborne) {
				p.slide = 0;
				p.airborne = true;
				p.vy = JUMP_V;
				out.push({ type: 'jump' });
			} else if (timeToLand(p) <= P.bufferSeconds) {
				s.buffered = 'jump';
				s.bufferAge = 0;
			}
			return out;
		case 'slide':
			if (p.airborne) {
				// Drop fast, then slide on landing.
				p.vy = Math.min(p.vy, -P.dropSpeed);
				p.slideOnLand = true;
			} else {
				p.slide = P.slideSeconds;
				out.push({ type: 'slide' });
			}
			return out;
	}
}

function timeToLand(p: Player): number {
	// Solve h + vy t - g t^2 / 2 = 0 for the positive root, h = height above what's below.
	const h = Math.max(p.y - p.ground, 0);
	const disc = p.vy * p.vy + 2 * GRAVITY * h;
	return (p.vy + Math.sqrt(disc)) / GRAVITY;
}

// ---- Simulation --------------------------------------------------------------------------------

/** How far a landing may snap up onto a roof (feet slightly below it still count). */
const LAND_SNAP = 0.35;

/** Roof height under the player at lateral position `x` (0 if no train is there). */
export function supportAt(s: RunState, x: number): number {
	const d = s.distance;
	for (const o of s.obstacles) {
		if (o.kind !== 'train' && o.kind !== 'moving') continue;
		if (Math.abs(laneX(o.lane) - x) > O.train.halfWidth) continue;
		if (d < o.front - P.halfDepth || d > o.front + o.length) continue;
		return O.train.height;
	}
	return 0;
}

interface Box {
	x0: number;
	x1: number;
	y0: number;
	y1: number;
	z0: number;
	z1: number;
}

const playerBox: Box = { x0: 0, x1: 0, y0: 0, y1: 0, z0: 0, z1: 0 };
const obstacleBox: Box = { x0: 0, x1: 0, y0: 0, y1: 0, z0: 0, z1: 0 };

function setPlayerBox(b: Box, p: Player, d: number) {
	const h = p.slide > 0 ? P.slideHeight : P.height;
	b.x0 = p.x - P.halfWidth + F;
	b.x1 = p.x + P.halfWidth - F;
	b.y0 = p.y + F;
	b.y1 = p.y + h - F;
	b.z0 = d - P.halfDepth;
	b.z1 = d + P.halfDepth;
}

function setObstacleBox(b: Box, o: Obstacle, front: number) {
	const hw = o.kind === 'train' || o.kind === 'moving' ? O.train.halfWidth : O.barHalfWidth;
	const x = laneX(o.lane);
	b.x0 = x - hw + F;
	b.x1 = x + hw - F;
	if (o.kind === 'low' || o.kind === 'high') {
		b.y0 = O[o.kind].bottom;
		b.y1 = O[o.kind].top;
	} else {
		b.y0 = 0;
		b.y1 = O.train.height;
	}
	b.z0 = front + F;
	b.z1 = front + o.length - F;
}

const overlapX = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1;
const overlapY = (a: Box, b: Box) => a.y0 < b.y1 && b.y0 < a.y1;
const overlapZ = (a: Box, b: Box) => a.z0 < b.z1 && b.z0 < a.z1;

/** Near edge of an oncoming train when the player is at `d`. It meets the player at `o.s`. */
export function movingFront(o: Obstacle, d: number, speed: number): number {
	const k = O.movingTrainSpeed / speed;
	return o.s + k * (o.s - d);
}

/** Advance by `dt`. Pass a reused `out` array to keep the per-frame path allocation-free. */
export function step(s: RunState, dt: number, out: RunEvent[] = []): RunEvent[] {
	out.length = 0;
	if (s.over) return out;
	const p = s.player;

	const tierBefore = tierAt(s.time);
	s.time += dt;
	if (tierAt(s.time) !== tierBefore) out.push({ type: 'tier', tier: tierAt(s.time) });
	p.stumble = Math.max(0, p.stumble - dt);
	s.speed = speedAt(s.time) * (p.stumble > 0 ? P.stumbleSpeedFactor : 1);

	const prevD = s.distance;
	const prevX = p.x;
	const prevY = p.y;
	const prevSlide = p.slide;
	s.distance += s.speed * dt;

	// Lane tween (ease-out).
	if (p.laneT < 1) {
		p.laneT = Math.min(1, p.laneT + dt / P.laneChangeSeconds);
		const e = 1 - (1 - p.laneT) * (1 - p.laneT);
		p.x = p.fromX + (laneX(p.lane) - p.fromX) * e;
	}

	// Jump / fall, onto and off train roofs.
	const support = supportAt(s, p.x);
	if (!p.airborne && support < p.y - 0.01) {
		// Ran off the end of a roof (or stepped sideways off it): fall.
		p.airborne = true;
		p.vy = 0;
		p.slide = 0;
	}
	if (p.airborne) {
		p.vy -= GRAVITY * dt;
		p.y += p.vy * dt;
		const floor = p.vy <= 0 && prevY >= support - LAND_SNAP ? support : 0;
		if (p.y <= floor) {
			p.y = floor;
			p.vy = 0;
			p.airborne = false;
			out.push({ type: 'land' });
			if (p.slideOnLand) {
				p.slideOnLand = false;
				p.slide = P.slideSeconds;
				out.push({ type: 'slide' });
			}
		}
	} else if (p.slide > 0) {
		p.slide = Math.max(0, p.slide - dt);
	}
	p.ground = p.airborne ? support : p.y;

	// Buffered swipe.
	if (s.buffered) {
		s.bufferAge += dt;
		if (!p.airborne && s.buffered === 'jump') {
			s.buffered = null;
			input(s, 'jump', out);
		} else if (s.bufferAge > P.bufferSeconds * 2) {
			s.buffered = null;
		}
	}

	// Move oncoming trains and warn about them.
	for (const o of s.obstacles) {
		if (o.kind !== 'moving') continue;
		o.front = movingFront(o, s.distance, s.speed);
		const eta = (o.front - s.distance) / (s.speed + O.movingTrainSpeed);
		if (!o.warned && eta > 0 && eta < O.warnSeconds) {
			o.warned = true;
			out.push({ type: 'warn', id: o.id });
		}
	}

	collide(s, prevD, prevX, prevY, prevSlide, out);
	if (!s.over) collect(s, out);

	spawn(s);
	despawn(s);
	return out;
}

function collide(
	s: RunState,
	prevD: number,
	prevX: number,
	prevY: number,
	prevSlide: number,
	out: RunEvent[]
) {
	const p = s.player;
	setPlayerBox(playerBox, p, s.distance);
	for (const o of s.obstacles) {
		setObstacleBox(obstacleBox, o, o.front);
		if (!(
			overlapX(playerBox, obstacleBox) &&
			overlapY(playerBox, obstacleBox) &&
			overlapZ(playerBox, obstacleBox)
		)) {
			continue;
		}
		// Where were we last step? If we were already alongside it (z overlapped) and only moved
		// sideways into it, it's a side clip: bounce back to the old lane and stumble.
		const front = o.kind === 'moving' ? movingFront(o, prevD, s.speed) : o.front;
		setObstacleBox(obstacleBox, o, front);
		const save = { x: p.x, y: p.y, slide: p.slide };
		p.x = prevX;
		p.y = prevY;
		p.slide = prevSlide;
		setPlayerBox(playerBox, p, prevD);
		const wasAlongside = overlapZ(playerBox, obstacleBox) && overlapY(playerBox, obstacleBox);
		p.x = save.x;
		p.y = save.y;
		p.slide = save.slide;

		if (wasAlongside && p.laneT < 1 && p.stumble <= 0) {
			p.lane = p.fromLane;
			p.fromX = p.x;
			p.laneT = 0;
			p.stumble = P.stumbleSeconds;
			out.push({ type: 'stumble' });
			return;
		}
		if (wasAlongside && p.stumble > 0) return; // still bouncing back from the same clip
		s.over = true;
		out.push({ type: 'crash', id: o.id });
		return;
	}
}

function collect(s: RunState, out: RunEvent[]) {
	const p = s.player;
	const r = TUNING.coin.radius;
	const top = p.y + (p.slide > 0 ? P.slideHeight : P.height);
	for (const c of s.coinsList) {
		if (c.taken) continue;
		if (Math.abs(c.s - s.distance) > r + P.halfDepth) continue;
		if (Math.abs(laneX(c.lane) - p.x) > 1.0) continue;
		if (c.y + r < p.y || c.y - r > top) continue;
		c.taken = true;
		const points = coinValue(s.time);
		s.coins++;
		s.coinPoints += points;
		out.push({ type: 'coin', id: c.id, points });
	}
}
