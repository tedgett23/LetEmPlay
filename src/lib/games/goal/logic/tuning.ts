// Every Goal feel constant in one place. World units are logical pixels on the 720-wide stage,
// with y pointing down: the goal is near the top of each level, the ball starts near the bottom.

export const TUNING = {
	/** Physics substeps per 1/60 s update. 240 Hz keeps the fastest ball from skipping a wall. */
	substeps: 4,
	/** Balls (tries) per run. */
	balls: 3,

	ball: {
		radius: 18,
		/** Rolling friction: speed falls by `linear` px/s² plus `drag` per second (exponential). */
		linear: 240,
		drag: 0.9,
		/** Below this speed the ball stops dead. */
		stopSpeed: 12,
		wallBounce: 0.75,
		postBounce: 0.6,
		rockBounce: 0.7
	},

	kick: {
		/** Release speed in logical screen px/ms. A gentle lift coasts instead. */
		flickThreshold: 0.85,
		fullFlick: 2.6,
		minTravel: 18,
		minSpeed: 520,
		maxSpeed: 2000
	},
	dribble: {
		// Faster than a defender, below knockdown speed: you have to go around them.
		speed: 370,
		acceleration: 5400,
		response: 14,
		maxLead: 85
	},

	chaser: {
		radius: 26,
		/** Running speed toward the ball (px/s) on the first levels. */
		speed: 150,
		/** How quickly they get up to speed (px/s²), so they don't snap round. */
		accel: 600,
		/** A ball at least this fast knocks a chaser over; slower, they take it. */
		knockSpeed: 430,
		/** A knocked-over chaser slows the ball by this factor and nudges it sideways. */
		knockKeep: 0.8
	},

	keeper: {
		radius: 28,
		speed: 210,
		/** Stands this far in front of the goal line. */
		front: 46,
		/** May step this far past each post. */
		reach: 20,
		bounce: 0.7
	},

	goal: {
		/** Depth of the net behind the goal line. */
		depth: 70,
		postRadius: 9
	},

	scoring: {
		/** Knocking chasers over in one kick: 10, then 20, 30… for each one after. */
		knock: 10,
		goal: 50,
		/** Every chaser knocked over before the goal. */
		allDown: 50
	},

	/** Each time the levels repeat, chasers and keepers run this much faster. */
	loopSpeedUp: 0.15,

	timing: {
		/** After a goal, before the next level starts. */
		nextLevel: 2.2,
		/** After the ball is taken, before the level restarts (or the run ends). */
		retry: 1.6
	}
} as const;
