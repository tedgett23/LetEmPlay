// A planning robot used by the tests. It only uses the real controls (draw a line to launch a
// web, tap a robber), trying many directions and strengths on copies of the game, and makes the
// move that climbs highest without losing a heart. It also counts how many different moves would
// have worked, so tests can insist every step of every level is forgiving.
import { LEVELS } from './levels';
import { launch, startLevel, step, tapRobber, type GameEvent, type GameState } from './game';
import { TUNING } from './tuning';

const DT = 1 / 60;
// Every direction, at three speeds: straight zips mean speed matters only for kicks and timing.
const ANGLES = Array.from({ length: 36 }, (_, i) => i * 10); // degrees from +x
const POWERS = [0.2, 0.6, 1];

export interface Move {
	/** Degrees from +x (90 = straight up). */
	angle: number;
	power: number;
}

export interface BotResult {
	completed: boolean;
	heartsLost: number;
	moves: number;
	/** For each climb, how many different (direction, strength) moves reached the same height. */
	options: number[];
	stars: number;
}

/** Draw a line and let go: launch, then settle until standing again (or 4 seconds). */
export function playMove(s: GameState, m: Move): void {
	const out: GameEvent[] = [];
	const r = (m.angle * Math.PI) / 180;
	launch(s, Math.cos(r), Math.sin(r), m.power, out);
	const moving = () => s.hero.mode === 'zip' || s.hero.mode === 'fall';
	for (let t = 0; t < 4 && s.phase === 'play' && moving(); t += DT) step(s, DT, out);
}

/** Web every standing robber within reach, waiting for each shot to land. */
function catchNearby(s: GameState) {
	for (;;) {
		const h = s.hero;
		const i = s.baddies.findIndex(
			(b) => !b.down && Math.hypot(b.x - h.x, b.y - h.y) < TUNING.web.shotRange - 0.5
		);
		if (i < 0 || s.phase !== 'play') return;
		const b = s.baddies[i]!;
		tapRobber(s, { x: b.x, y: b.y + TUNING.baddie.height / 2 });
		for (let t = 0; t < 2 && !b.down && s.phase === 'play'; t += DT) step(s, DT);
		if (!b.down) return;
	}
}

/** How good a resting place is: finishing beats all, then height, preferring ledge tops. */
function value(sim: GameState): number {
	if (sim.phase === 'complete') return Infinity;
	const h = sim.hero;
	return h.y + (h.mode === 'stand' ? 3 : h.mode === 'hang' ? -3 : 0);
}

/** Every single move from `s` that ends stuck somewhere safely, with the resulting state. */
function outcomes(s: GameState): { move: Move; sim: GameState }[] {
	const list: { move: Move; sim: GameState }[] = [];
	for (const angle of ANGLES) {
		for (const power of POWERS) {
			const move = { angle, power };
			const sim = structuredClone(s);
			playMove(sim, move);
			if (sim.lostThisLevel > s.lostThisLevel || sim.phase === 'over') continue;
			if (sim.hero.mode === 'zip' || sim.hero.mode === 'fall') continue;
			list.push({ move, sim });
		}
	}
	return list;
}

/**
 * Best next move: the one that ends in the best place (see `value`), and how many moves would
 * have made real progress (climbed at least 2 m). If no single move climbs (say, hanging under a
 * ledge), it looks two moves ahead and returns the first of the best pair.
 */
export function plan(s: GameState): { move: Move; options: number } | null {
	const here = s.hero.y;
	const first = outcomes(s);
	const climbing = first.filter((o) => o.sim.phase === 'complete' || o.sim.hero.y >= here + 2);
	if (climbing.length) {
		const best = climbing.reduce((a, b) => (value(b.sim) > value(a.sim) ? b : a));
		return { move: best.move, options: climbing.length };
	}
	// Two moves: try each distinct resting place, then the best climb from there.
	const seen = new Set<string>();
	let best: { move: Move; v: number } | null = null;
	let options = 0;
	for (const o of first) {
		const key = `${Math.round(o.sim.hero.x * 2)}:${Math.round(o.sim.hero.y * 2)}:${o.sim.hero.mode}`;
		if (seen.has(key)) continue;
		seen.add(key);
		const second = outcomes(o.sim).filter(
			(p) => p.sim.phase === 'complete' || p.sim.hero.y >= here + 2
		);
		options += second.length > 0 ? 1 : 0;
		for (const p of second) {
			const v = value(p.sim);
			if (!best || v > best.v) best = { move: o.move, v };
		}
	}
	return best ? { move: best.move, options } : null;
}

/** Climb one level with the planning robot. */
export function botPlay(levelIndex: number, maxMoves = 20): BotResult {
	const s = startLevel(levelIndex);
	const options: number[] = [];
	let moves = 0;
	for (; moves < maxMoves && s.phase === 'play'; moves++) {
		catchNearby(s);
		if (s.phase !== 'play') break;
		const p = plan(s);
		if (!p) break;
		options.push(p.options);
		playMove(s, p.move);
	}
	return {
		completed: s.phase === 'complete',
		heartsLost: s.lostThisLevel,
		moves,
		options,
		stars: s.stars
	};
}

export const ALL_LEVELS = LEVELS.map((_, i) => i);
