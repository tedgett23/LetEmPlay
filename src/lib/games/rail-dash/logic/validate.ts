// Passability checker (MVP.md §10.3): can a player get through this pattern from any lane at
// this speed? Trains are walls. Bars and gantries never block on their own (you can always
// slide under them, and you can change lanes while sliding), so the question is whether some
// sequence of lane changes threads between the trains, given how long a lane change takes.
//
// It's deliberately a little stricter than the game: a lane change is assumed to need both
// lanes clear for its whole duration plus a safety margin.
import type { Pattern } from './patterns';
import { TUNING } from './tuning';

const STEP = 0.25; // metres per grid row
const SAFETY_SECONDS = 0.1; // reaction slack added to each lane change

/** Track intervals [from, to] the player can't occupy, per lane (index lane + 1). */
export function walls(pattern: Pattern, speed: number): [number, number][][] {
	const out: [number, number][][] = [[], [], []];
	const pad = TUNING.player.halfDepth;
	const k = TUNING.obstacles.movingTrainSpeed / speed;
	for (const o of pattern.obstacles) {
		if (o.kind === 'train') out[o.lane + 1]!.push([o.at - pad, o.at + o.length + pad]);
		// An oncoming train closes the distance faster, so it blocks a shorter stretch of the
		// player's own track: it meets you at `at` and is gone after length / (1 + k).
		if (o.kind === 'moving') out[o.lane + 1]!.push([o.at - pad, o.at + o.length / (1 + k) + pad]);
	}
	return out;
}

/**
 * True if, starting in `startLane` (-1, 0, 1) `leadIn` metres before the pattern, the player can
 * reach the end of the pattern without touching a train.
 */
export function passableFrom(
	pattern: Pattern,
	speed: number,
	startLane: number,
	leadIn: number
): boolean {
	const w = walls(pattern, speed);
	const rows = Math.ceil((leadIn + pattern.length) / STEP) + 1;
	const z = (r: number) => r * STEP - leadIn;
	const free = (lane: number, r: number) => {
		const zz = z(r);
		return !w[lane]!.some(([a, b]) => zz >= a && zz <= b);
	};
	const change = Math.ceil((speed * (TUNING.player.laneChangeSeconds + SAFETY_SECONDS)) / STEP);

	let reach = [false, false, false];
	reach[startLane + 1] = true;
	// Arrivals scheduled for future rows by lane changes in progress.
	const pending: boolean[][] = Array.from({ length: rows + change + 1 }, () => [
		false,
		false,
		false
	]);

	for (let r = 0; r < rows - 1; r++) {
		const next = [...pending[r + 1]!];
		for (let lane = 0; lane < 3; lane++) {
			if (!reach[lane]) continue;
			if (free(lane, r + 1)) next[lane] = true;
			for (const to of [lane - 1, lane + 1]) {
				if (to < 0 || to > 2) continue;
				let clear = true;
				for (let i = r; i <= r + change && clear; i++) clear = free(lane, i) && free(to, i);
				if (clear && r + change < pending.length) pending[r + change]![to] = true;
			}
		}
		// Lane changes that land on this very row were added to pending[r + 1] above when change = 1.
		for (let lane = 0; lane < 3; lane++) if (pending[r + 1]![lane]) next[lane] = true;
		reach = next;
	}
	return reach.some(Boolean);
}

/** Passable from every lane, at both the slowest and the fastest speed. */
export function isPassable(pattern: Pattern): boolean {
	const lead = TUNING.world.gapRows * TUNING.world.rowLength;
	for (const speed of [TUNING.speed.start, TUNING.speed.max]) {
		for (const lane of [-1, 0, 1]) {
			if (!passableFrom(pattern, speed, lane, lead)) return false;
		}
	}
	return true;
}
