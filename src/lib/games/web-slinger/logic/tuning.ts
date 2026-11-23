// Every Web Slinger feel constant in one place. World units are metres, y points up. A level is
// a tall shaft between two walls; you climb it with webs. The shaft is exactly one screen wide.

export const TUNING = {
	gravity: 22,
	/** Physics substeps per update() call. */
	substeps: 3,

	/** Width of the shaft between its two walls (one screen across at 54 px per metre). */
	shaftWidth: 720 / 54,

	hero: {
		radius: 0.45,
		maxSpeed: 18,
		/** After a hit, nothing can hurt you for this long. */
		safeSeconds: 1.5
	},

	web: {
		/** How far a web reaches. */
		range: 13,
		/** Web shots at bad guys: reach and flight speed. */
		shotRange: 14,
		shotSpeed: 32,
		/** Tapping this close to a bad guy counts as tapping them. */
		tapRadius: 1.4
	},

	/** Drawing a line launches you along it on a web, to stick wherever it reaches. */
	zip: {
		/** Flying speed for the shortest and the longest line (m/s). */
		minSpeed: 10,
		maxSpeed: 20,
		/** Drawn lines (logical px) shorter than `minDrag` are taps; `maxDrag` is full speed. */
		minDrag: 30,
		maxDrag: 300
	},

	baddie: {
		width: 0.9,
		height: 1.7,
		/** Starts lobbing water balloons when the hero is this close… */
		throwRange: 9,
		/** …every this many seconds (the first one comes after `firstThrow`). */
		throwEvery: 2.8,
		firstThrow: 1.8,
		balloonSpeed: 9,
		balloonRadius: 0.3,
		/** Swinging into a bad guy faster than this knocks them off their ledge. */
		knockSpeed: 6
	},

	ledge: { thickness: 0.8 },
	/** Wooden crates: flying through faster than `breakSpeed` smashes one, and coins pop out. */
	crate: { size: 0.9, breakSpeed: 6, coins: 3 },
	/** Landing on spikes bounces you up like this (and costs a heart). */
	spikeBounce: 9,

	coin: { radius: 0.5 },

	scoring: { coin: 10, crate: 20, baddie: 50, level: 100, perfect: 100 },

	hearts: 3
} as const;
