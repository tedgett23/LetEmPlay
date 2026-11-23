// Web Slinger rules: climb a shaft by shooting webs at its walls, catch robbers on the way up,
// reach the flag at the top. Pure state + step(); the view reads it and plays the events.
// Nobody gets hurt: a webbed or bumped robber tumbles down and lies there, dizzy.
import { LEVELS, type Level, type Point } from './levels';
import { TUNING } from './tuning';

const HR = TUNING.hero;
const WB = TUNING.web;
const Z = TUNING.zip;
const BD = TUNING.baddie;
const G = TUNING.gravity;
const R = HR.radius;
const TH = TUNING.ledge.thickness;

export interface Hero {
	x: number;
	y: number;
	vx: number;
	vy: number;
	/**
	 * stand: on top of a ledge (or the floor); cling: stuck to a wall or a ledge's side;
	 * hang: stuck under a ledge or the ceiling; zip: flying along a web; fall: knocked loose.
	 */
	mode: 'stand' | 'cling' | 'hang' | 'zip' | 'fall';
	/** The ledge you're on, under or beside (-1 for walls, the ceiling, or none). */
	ledge: number;
	/** Where the current zip ends, and what you'll be doing there. */
	target: Stick | null;
	/** Which way you're facing (+1 right, -1 left). */
	facing: number;
	/** Seconds of safety left after a hit. */
	safe: number;
}

/** A place the hero can stick: the hero's centre there, and how. */
export interface Stick extends Point {
	mode: 'stand' | 'cling' | 'hang';
	ledge: number;
	/** For cling: which side the surface is on (-1 left, +1 right). */
	side: number;
}

export interface Baddie {
	x: number;
	y: number;
	down: boolean;
	/** How they went down, and which way they tumbled (for the animation). */
	how: 'webbed' | 'bumped' | null;
	dir: number;
	throwIn: number;
}

export interface Balloon {
	/** Who threw it: if they get caught, it pops harmlessly. */
	from: number;
	x: number;
	y: number;
	vx: number;
	vy: number;
}

export interface Shot {
	x: number;
	y: number;
	target: number;
}

export interface Coin {
	x: number;
	y: number;
	taken: boolean;
}

export interface GameState {
	levelIndex: number;
	level: Level;
	hero: Hero;
	baddies: Baddie[];
	balloons: Balloon[];
	shots: Shot[];
	coins: Coin[];
	hearts: number;
	score: number;
	/** Hearts lost on this level (a perfect level earns a bonus and a star). */
	lostThisLevel: number;
	phase: 'play' | 'complete' | 'over';
	stars: number;
	time: number;
}

export type GameEvent =
	| { type: 'web'; x: number; y: number }
	| { type: 'miss'; x: number; y: number }
	| { type: 'release' }
	| { type: 'land' }
	| { type: 'coin'; index: number }
	| { type: 'shot' }
	| { type: 'webbed'; index: number }
	| { type: 'bumped'; index: number }
	| { type: 'throw'; index: number }
	| { type: 'splash'; x: number; y: number }
	| { type: 'hit' }
	| { type: 'complete'; stars: number }
	| { type: 'over' };

export interface SavedRun {
	levelIndex: number;
	score: number;
	hearts: number;
}

export function isSavedRun(x: unknown): x is SavedRun {
	if (!x || typeof x !== 'object') return false;
	const r = x as Record<string, unknown>;
	return (
		Number.isInteger(r.levelIndex) &&
		(r.levelIndex as number) >= 0 &&
		(r.levelIndex as number) < LEVELS.length &&
		Number.isFinite(r.score) &&
		Number.isInteger(r.hearts) &&
		(r.hearts as number) > 0 &&
		(r.hearts as number) <= TUNING.hearts
	);
}

/** Start `levelIndex` with the given running score and hearts. */
export function startLevel(
	levelIndex: number,
	score = 0,
	hearts: number = TUNING.hearts
): GameState {
	const index = levelIndex % LEVELS.length;
	const level = LEVELS[index]!;
	return {
		levelIndex: index,
		level,
		hero: {
			x: level.start.x,
			y: level.start.y + R,
			vx: 0,
			vy: 0,
			mode: 'stand',
			ledge: 0,
			target: null,
			facing: 1,
			safe: 0
		},
		baddies: level.baddies.map((b) => ({
			x: b.x,
			y: b.y,
			down: false,
			how: null,
			dir: 0,
			throwIn: BD.firstThrow
		})),
		balloons: [],
		shots: [],
		coins: level.coins.map((c) => ({ ...c, taken: false })),
		hearts,
		score,
		lostThisLevel: 0,
		phase: 'play',
		stars: 0,
		time: 0
	};
}

/** After a completed level: the next one (wrapping around), with a heart back. */
export function nextLevel(s: GameState): GameState {
	return startLevel(s.levelIndex + 1, s.score, Math.min(s.hearts + 1, TUNING.hearts));
}

export function saved(s: GameState): SavedRun {
	return { levelIndex: s.levelIndex, score: s.score, hearts: s.hearts };
}

// ---- Webs ----------------------------------------------------------------------------------

/**
 * Where a zip from `from` in direction (dx, dy) ends: the first wall, ceiling, floor or ledge
 * face the hero would touch, within reach. Surfaces are grown by the hero's radius, so the
 * point returned is where the hero's centre comes to rest against it.
 */
export function aim(level: Level, from: Point, dx: number, dy: number): Stick | null {
	const len = Math.hypot(dx, dy);
	if (len < 1e-6) return null;
	dx /= len;
	dy /= len;
	const W = TUNING.shaftWidth;
	let best: number = WB.range;
	let hit: Omit<Stick, 'x' | 'y'> | null = null;
	const consider = (t: number, h: Omit<Stick, 'x' | 'y'>) => {
		// t ≈ 0 means you're already against that surface and aiming into it: blocked.
		if (t > -1e-4 && t < best) {
			best = t;
			hit = h;
		}
	};
	if (dx < 0) consider((R - from.x) / dx, { mode: 'cling', ledge: -1, side: -1 });
	if (dx > 0) consider((W - R - from.x) / dx, { mode: 'cling', ledge: -1, side: 1 });
	if (dy > 0) consider((level.height - R - from.y) / dy, { mode: 'hang', ledge: -1, side: 0 });
	level.ledges.forEach((l, i) => {
		const x0 = l.x0 - R;
		const x1 = l.x1 + R;
		const y0 = l.top - TH - R;
		const y1 = l.top + R;
		// Which face of the grown box does the ray enter through?
		if (dy < 0) {
			const t = (y1 - from.y) / dy;
			const x = from.x + dx * t;
			if (x >= x0 && x <= x1 && from.y >= y1 - 1e-6)
				consider(t, { mode: 'stand', ledge: i, side: 0 });
		}
		if (dy > 0) {
			const t = (y0 - from.y) / dy;
			const x = from.x + dx * t;
			if (x >= x0 && x <= x1 && from.y <= y0 + 1e-6)
				consider(t, { mode: 'hang', ledge: i, side: 0 });
		}
		if (dx > 0) {
			const t = (x0 - from.x) / dx;
			const y = from.y + dy * t;
			if (y >= y0 && y <= y1 && from.x <= x0 + 1e-6)
				consider(t, { mode: 'cling', ledge: i, side: 1 });
		}
		if (dx < 0) {
			const t = (x1 - from.x) / dx;
			const y = from.y + dy * t;
			if (y >= y0 && y <= y1 && from.x >= x1 - 1e-6)
				consider(t, { mode: 'cling', ledge: i, side: -1 });
		}
	});
	if (!hit) return null;
	return { x: from.x + dx * best, y: from.y + dy * best, ...(hit as Omit<Stick, 'x' | 'y'>) };
}

/** The standing robber under a tap at `p`, if one is close enough to web. */
export function baddieAt(s: GameState, p: Point): number {
	const h = s.hero;
	return s.baddies.findIndex(
		(b) =>
			!b.down &&
			Math.hypot(p.x - b.x, p.y - (b.y + BD.height / 2)) <= WB.tapRadius &&
			Math.hypot(b.x - h.x, b.y - h.y) <= WB.shotRange
	);
}

/** A quick tap at `p`: if it's on a robber in reach, web them. Returns whether it was. */
export function tapRobber(s: GameState, p: Point, out: GameEvent[] = []): boolean {
	if (s.phase !== 'play') return false;
	const target = baddieAt(s, p);
	if (target < 0) return false;
	if (!s.shots.some((sh) => sh.target === target)) {
		s.shots.push({ x: s.hero.x, y: s.hero.y + 0.4, target });
		out.push({ type: 'shot' });
	}
	return true;
}

/** Where a line drawn in direction (dx, dy) from the hero would take them (for the aim guide). */
export function aimFromHero(s: GameState, dx: number, dy: number): Stick | null {
	return aim(s.level, s.hero, dx, dy);
}

/**
 * Launch along a drawn line: direction (dx, dy) in world space (y up), `power` 0..1 from its
 * length (how fast you fly). Works from anywhere, even mid-flight, to change direction. If
 * nothing is in reach that way, the web misses and you hop that way and drop.
 */
export function launch(
	s: GameState,
	dx: number,
	dy: number,
	power: number,
	out: GameEvent[] = []
): GameEvent[] {
	if (s.phase !== 'play') return out;
	const h = s.hero;
	const len = Math.hypot(dx, dy);
	if (len < 1e-6) return out;
	const speed = Z.minSpeed + (Z.maxSpeed - Z.minSpeed) * Math.min(Math.max(power, 0), 1);
	const target = aimFromHero(s, dx, dy);
	if (target && Math.hypot(target.x - h.x, target.y - h.y) < 0.05) return out; // blocked
	h.vx = (dx / len) * speed;
	h.vy = (dy / len) * speed;
	if (Math.abs(dx) > 0.1) h.facing = dx > 0 ? 1 : -1;
	h.ledge = -1;
	if (!target) {
		h.mode = 'fall';
		h.target = null;
		out.push({ type: 'miss', x: h.x + (dx / len) * WB.range, y: h.y + (dy / len) * WB.range });
		return out;
	}
	h.mode = 'zip';
	h.target = target;
	out.push({ type: 'web', x: target.x, y: target.y });
	return out;
}

// ---- Simulation ------------------------------------------------------------------------------

function loseHeart(s: GameState, out: GameEvent[]) {
	out.push({ type: 'hit' });
	s.hearts--;
	s.lostThisLevel++;
	s.hero.safe = HR.safeSeconds;
	if (s.hearts <= 0) {
		s.phase = 'over';
		out.push({ type: 'over' });
	}
}

/** Arrive somewhere: stand, cling or hang there (spikes bounce you off instead). */
function stick(s: GameState, t: Stick, out: GameEvent[]) {
	const h = s.hero;
	h.x = t.x;
	h.y = t.y;
	h.vx = 0;
	h.vy = 0;
	h.target = null;
	h.ledge = t.ledge;
	if (t.mode === 'cling') h.facing = -t.side; // face away from the wall
	const l = t.ledge >= 0 ? s.level.ledges[t.ledge] : undefined;
	if (t.mode === 'stand' && l?.spikes.some(([a, b]) => h.x + R * 0.5 > a && h.x - R * 0.5 < b)) {
		// Spikes: bounce up and off (and lose a heart unless still safe).
		h.mode = 'fall';
		h.vy = TUNING.spikeBounce;
		h.vx = h.facing * 2;
		h.ledge = -1;
		if (h.safe <= 0) loseHeart(s, out);
		return;
	}
	h.mode = t.mode;
	out.push({ type: 'land' });
}

/** Knocked loose (a balloon, a shove): fall from wherever you are. */
function knockLoose(s: GameState, vx: number) {
	const h = s.hero;
	if (h.mode === 'stand') return; // standing on a ledge: you stay put
	h.mode = 'fall';
	h.target = null;
	h.ledge = -1;
	h.vx = vx;
	h.vy = 2;
}

function stepHero(s: GameState, h: number, out: GameEvent[]) {
	const hero = s.hero;
	const level = s.level;
	if (hero.mode === 'stand' || hero.mode === 'cling' || hero.mode === 'hang') return;

	if (hero.mode === 'zip' && hero.target) {
		// Straight along the web at the speed you drew, exactly where the aim guide showed.
		const t = hero.target;
		const dx = t.x - hero.x;
		const dy = t.y - hero.y;
		const d = Math.hypot(dx, dy);
		const speed = Math.hypot(hero.vx, hero.vy);
		if (d <= speed * h) {
			stick(s, t, out);
			return;
		}
		hero.x += (dx / d) * speed * h;
		hero.y += (dy / d) * speed * h;
		return;
	}

	// Falling: gravity, then land on whatever ledge top is below (or the floor).
	const prevY = hero.y;
	hero.vy -= G * h;
	hero.x += hero.vx * h;
	hero.y += hero.vy * h;
	const W = TUNING.shaftWidth;
	if (hero.x < R) {
		hero.x = R;
		hero.vx = Math.abs(hero.vx) * 0.3;
	} else if (hero.x > W - R) {
		hero.x = W - R;
		hero.vx = -Math.abs(hero.vx) * 0.3;
	}
	if (hero.y > level.height - R) {
		hero.y = level.height - R;
		hero.vy = -Math.abs(hero.vy) * 0.3;
	}
	if (hero.vy > 0) return;
	for (let i = 0; i < level.ledges.length; i++) {
		const l = level.ledges[i]!;
		if (hero.x < l.x0 - R * 0.3 || hero.x > l.x1 + R * 0.3) continue;
		if (prevY - R >= l.top - 0.05 && hero.y - R < l.top) {
			stick(s, { x: hero.x, y: l.top + R, mode: 'stand', ledge: i, side: 0 }, out);
			return;
		}
	}
	if (hero.y < R) stick(s, { x: hero.x, y: R, mode: 'stand', ledge: 0, side: 0 }, out);
}

function stepBaddies(s: GameState, dt: number, out: GameEvent[]) {
	const hero = s.hero;
	s.baddies.forEach((b, i) => {
		if (b.down) return;
		const overlapX = Math.abs(hero.x - b.x) < R + BD.width / 2;
		const overlapY = hero.y + R > b.y && hero.y - R < b.y + BD.height;
		if (overlapX && overlapY) {
			if (Math.hypot(hero.vx, hero.vy) >= BD.knockSpeed) {
				// A flying kick: they tumble off the ledge (and land, dizzy, far below).
				b.down = true;
				b.how = 'bumped';
				b.dir = hero.vx >= 0 ? 1 : -1;
				s.score += TUNING.scoring.baddie;
				out.push({ type: 'bumped', index: i });
				return;
			}
			if (hero.safe <= 0) {
				// A shove: you're pushed off (and lose a heart).
				loseHeart(s, out);
				hero.mode = 'fall';
				hero.target = null;
				hero.ledge = -1;
				hero.vx = hero.x < b.x ? -5 : 5;
				hero.vy = 5;
			}
		}
		const dx = hero.x - b.x;
		const dy = hero.y - (b.y + BD.height);
		if (Math.hypot(dx, dy) > BD.throwRange) {
			b.throwIn = Math.max(b.throwIn, BD.firstThrow);
			return;
		}
		b.throwIn -= dt;
		if (b.throwIn > 0) return;
		b.throwIn = BD.throwEvery;
		const T = Math.min(Math.max(Math.hypot(dx, dy) / BD.balloonSpeed, 0.5), 1.2);
		const g = G * 0.5;
		s.balloons.push({ from: i, x: b.x, y: b.y + BD.height, vx: dx / T, vy: dy / T + 0.5 * g * T });
		out.push({ type: 'throw', index: i });
	});
}

/** Balloons splash on walls and the ceiling, and on ledge tops when falling onto them. */
function balloonHits(level: Level, b: Balloon, prevY: number): boolean {
	if (b.x < 0 || b.x > TUNING.shaftWidth || b.y > level.height || b.y < 0) return true;
	if (b.vy > 0) return false;
	return level.ledges.some((l) => b.x > l.x0 && b.x < l.x1 && prevY >= l.top && b.y < l.top);
}

function stepProjectiles(s: GameState, dt: number, out: GameEvent[]) {
	const hero = s.hero;
	const g = G * 0.5;
	let j = 0;
	for (const b of s.balloons) {
		if (s.baddies[b.from]!.down) {
			out.push({ type: 'splash', x: b.x, y: b.y });
			continue;
		}
		const prevY = b.y;
		b.vy -= g * dt;
		b.x += b.vx * dt;
		b.y += b.vy * dt;
		if (Math.hypot(b.x - hero.x, b.y - hero.y) < R + BD.balloonRadius) {
			out.push({ type: 'splash', x: b.x, y: b.y });
			if (hero.safe <= 0) {
				loseHeart(s, out);
				knockLoose(s, b.vx > 0 ? 3 : -3);
			}
			continue;
		}
		if (balloonHits(s.level, b, prevY)) {
			out.push({ type: 'splash', x: b.x, y: b.y });
			continue;
		}
		s.balloons[j++] = b;
	}
	s.balloons.length = j;

	j = 0;
	for (const shot of s.shots) {
		const t = s.baddies[shot.target]!;
		if (t.down) continue;
		const tx = t.x;
		const ty = t.y + BD.height / 2;
		const d = Math.hypot(tx - shot.x, ty - shot.y);
		if (d < 0.6) {
			t.down = true;
			t.how = 'webbed';
			t.dir = hero.x < t.x ? 1 : -1;
			s.score += TUNING.scoring.baddie;
			out.push({ type: 'webbed', index: shot.target });
			continue;
		}
		const stepLen = Math.min(WB.shotSpeed * dt, d);
		shot.x += ((tx - shot.x) / d) * stepLen;
		shot.y += ((ty - shot.y) / d) * stepLen;
		s.shots[j++] = shot;
	}
	s.shots.length = j;
}

function collect(s: GameState, out: GameEvent[]) {
	const h = s.hero;
	s.coins.forEach((c, i) => {
		if (c.taken || Math.hypot(c.x - h.x, c.y - h.y) > R + TUNING.coin.radius) return;
		c.taken = true;
		s.score += TUNING.scoring.coin;
		out.push({ type: 'coin', index: i });
	});
}

function checkFinish(s: GameState, out: GameEvent[]) {
	const h = s.hero;
	if (h.mode !== 'stand' || h.ledge !== s.level.finishLedge) return;
	const allCaught = s.baddies.every((b) => b.down);
	const perfect = s.lostThisLevel === 0;
	s.stars = 1 + (allCaught ? 1 : 0) + (perfect ? 1 : 0);
	s.score += TUNING.scoring.level + (perfect ? TUNING.scoring.perfect : 0);
	s.phase = 'complete';
	out.push({ type: 'complete', stars: s.stars });
}

/** Advance by `dt` seconds. Pass a reused `out` array to avoid per-frame allocation. */
export function step(s: GameState, dt: number, out: GameEvent[] = []): GameEvent[] {
	out.length = 0;
	if (s.phase !== 'play') return out;
	s.time += dt;
	s.hero.safe = Math.max(0, s.hero.safe - dt);
	const n = TUNING.substeps;
	for (let i = 0; i < n && s.phase === 'play'; i++) stepHero(s, dt / n, out);
	if (s.phase !== 'play') return out;
	stepBaddies(s, dt, out);
	if (s.phase !== 'play') return out;
	stepProjectiles(s, dt, out);
	collect(s, out);
	if (s.phase === 'play') checkFinish(s, out);
	return out;
}
