// Every Rail Dash feel constant in one place. Units are metres and seconds.
// The player runs along +z; lanes are at x = -LANE_W, 0, +LANE_W.

export const TUNING = {
	laneWidth: 2.4,

	speed: {
		start: 10,
		max: 22,
		/** Seconds to ramp from start to max. */
		rampSeconds: 180
	},

	player: {
		halfWidth: 0.35,
		halfDepth: 0.3,
		height: 1.6,
		slideHeight: 0.6,
		/** Seconds to tween one lane over. */
		laneChangeSeconds: 0.12,
		/** High enough to land on a train roof (obstacles.train.height) with room to spare. */
		jumpSeconds: 0.8,
		jumpHeight: 3.2,
		slideSeconds: 0.62,
		/** A swipe down mid-air drops you this fast (m/s) and then slides. */
		dropSpeed: 18,
		/** Accept the next swipe this long before the current move finishes. */
		bufferSeconds: 0.15,
		/** After a side bump: slowed down and can't stumble again for this long. */
		stumbleSeconds: 0.8,
		stumbleSpeedFactor: 0.75
	},

	/** Hitboxes are shrunk by this much on every side, so near misses stay near misses. */
	forgiveness: 0.12,

	obstacles: {
		/** Low barrier: a bar you can jump over or slide under. */
		low: { bottom: 0.7, top: 1.15, depth: 0.4 },
		/** High barrier: a sign/gantry you must slide under (too tall to jump). */
		high: { bottom: 0.7, top: 4.2, depth: 0.4 },
		/** `height` is the roof you can jump onto and run along. */
		train: { height: 2.45, halfWidth: 0.85 },
		barHalfWidth: 1.05,
		/** Oncoming trains drive toward you at this speed (m/s), on top of your own. */
		movingTrainSpeed: 8,
		/** Flash the warning light when an oncoming train is this many seconds away. */
		warnSeconds: 2.5
	},

	coin: { radius: 0.45, value: 5, arcHeight: 1.6 },

	world: {
		/** Pattern rows are this long. */
		rowLength: 4,
		/** Generate content this far ahead of the player. */
		spawnAhead: 140,
		/** Free running space between patterns. */
		gapRows: 2,
		/** Forget objects this far behind the player. */
		despawnBehind: 15,
		/** Calm intro before the first pattern. */
		introLength: 40
	},

	/** Difficulty tier unlocks (seconds of running). */
	tiers: { two: 35, three: 90 }
} as const;

export const LANES = [-1, 0, 1] as const;
export type Lane = (typeof LANES)[number];

export function laneX(lane: number): number {
	return lane * TUNING.laneWidth;
}

export function speedAt(seconds: number): number {
	const s = TUNING.speed;
	return s.start + (s.max - s.start) * Math.min(seconds / s.rampSeconds, 1);
}
