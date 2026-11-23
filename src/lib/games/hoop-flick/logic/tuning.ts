// Every Hoop Flick feel constant in one place. World units are roughly metres:
// x is sideways (0 = centre), y is height above the floor, z is depth away from the player.
// Feel matters more than realism: the rim is wider than a real one and the aim assist is generous.

export const TUNING = {
	gravity: 9.8,
	/** Physics substeps per update() call (60 Hz × 4 = 240 Hz collision checks). */
	substeps: 4,

	ball: { radius: 0.12, start: { x: 0, y: 1.2, z: 0 } },

	hoop: {
		rimY: 2.9,
		z: 4.0,
		/** Ring radius (centre of the rim tube). A real rim is 0.23; this is kinder. */
		rimRadius: 0.28,
		rimTube: 0.025,
		rimRestitution: 0.55,
		netDepth: 0.45
	},

	board: {
		/** Front face of the backboard. */
		z: 4.42,
		width: 1.5,
		bottom: 2.7,
		top: 3.75,
		restitution: 0.6
	},

	floorRestitution: 0.55,
	wallZ: 6.5,

	/** Perspective camera, logical pixels (720×1280 stage). */
	camera: { y: 1.6, z: -2, focal: 1417, centerX: 360, horizonY: 867 },

	throw: {
		/** Seconds from release until the ball reaches rim height on the way down. */
		flightTime: 1.1,
		/** A perfect throw lands this far past the rim centre: falling balls catch the front rim more often than the back. */
		depthBias: 0.07,
		/** Upward flick speed (logical px per ms) that lands exactly at the hoop's depth. */
		perfectSpeed: 2.6,
		/** Slower than this isn't a throw. */
		minSpeed: 0.6,
		minPower: 0.35,
		maxPower: 1.6,
		/** Powers within ±window of perfect get pulled toward perfect (only `keep` of the error survives). */
		powerAssist: { window: 0.3, keep: 0.2 },
		/** Same idea sideways, in world units at the hoop. */
		aimAssist: { window: 0.6, keep: 0.2 }
	},

	round: {
		seconds: 60,
		/** Delay before the next ball is ready after a throw. */
		reloadSeconds: 0.3,
		/** Count down out loud for the final seconds. */
		tickFrom: 5,
		/** A shot that falls this far below the rim without scoring is a miss. */
		missBelowRim: 1.3,
		/** Give up on a shot after this long in the air. */
		maxShotSeconds: 5,
		/** How long a finished ball stays visible (bouncing away) before it's removed. */
		lingerSeconds: 1.5
	},

	scoring: { swish: 3, rimIn: 2, fireStreak: 3, fireMultiplier: 2 },

	moving: {
		basketsPerLevel: 5,
		amplitude: 0.75,
		/** Radians per second of the side-to-side sine at level 1, +step per level, capped. */
		speedBase: 0.9,
		speedStep: 0.35,
		speedMax: 2.6,
		/** How fast the swing amplitude grows from 0 when the hoop starts moving (units/s). */
		ramp: 0.6
	}
} as const;
