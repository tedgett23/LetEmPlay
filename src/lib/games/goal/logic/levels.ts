// Goal's levels. Each is a walled area of its own shape (never a plain pitch), with the goal set
// into its top edge. Coordinates are logical px, y down, on the 720-wide stage.
//
// `outline` starts at the RIGHT goal post, runs round the area clockwise and ends at the LEFT
// post. Every edge is a wall except the last-to-first one: that is the goal mouth. A unit test
// checks every level (shape, spacing) and that a simple robot player can score in each.
import type { Disc } from './geometry';

export interface Level {
	outline: number[];
	goal: { x: number; y: number; width: number };
	ball: { x: number; y: number };
	chasers: { x: number; y: number }[];
	keeper?: boolean;
	/** Round obstacles: rocks, bushes and tyres. */
	discs?: Disc[];
	/** Solid blocks (benches, crates), closed polygons. */
	blocks?: number[][];
	/** Chaser speed multiplier for this level. */
	speed?: number;
}

export const LEVELS: Level[] = [
	// 1. A wide, friendly kite that fits on one screen. Two chasers wait off to the sides.
	{
		outline: [
			470, 260, 620, 320, 660, 640, 610, 980, 470, 1130, 250, 1130, 110, 980, 60, 640, 100, 320,
			250, 260
		],
		goal: { x: 360, y: 260, width: 220 },
		ball: { x: 360, y: 1010 },
		chasers: [
			{ x: 170, y: 720 },
			{ x: 550, y: 720 }
		]
	},
	// 2. The bend: start bottom right, the goal is up on the left.
	{
		outline: [
			320, 240, 420, 320, 440, 700, 640, 820, 680, 1250, 560, 1400, 380, 1400, 300, 1200, 140, 1000,
			60, 700, 60, 320, 120, 240
		],
		goal: { x: 220, y: 240, width: 200 },
		ball: { x: 520, y: 1260 },
		chasers: [
			{ x: 220, y: 820 },
			{ x: 340, y: 520 },
			{ x: 600, y: 960 }
		]
	},
	// 3. Rocks in the middle: no straight shot.
	{
		outline: [
			460, 220, 600, 300, 680, 620, 620, 1000, 520, 1380, 200, 1380, 100, 1000, 40, 620, 120, 300,
			260, 220
		],
		goal: { x: 360, y: 220, width: 200 },
		ball: { x: 360, y: 1250 },
		chasers: [
			{ x: 360, y: 480 },
			{ x: 170, y: 700 },
			{ x: 560, y: 640 }
		],
		discs: [
			{ x: 360, y: 760, r: 52, kind: 'rock' },
			{ x: 210, y: 1000, r: 40, kind: 'rock' },
			{ x: 520, y: 980, r: 46, kind: 'bush' }
		]
	},
	// 4. The hourglass: everything squeezes through the middle.
	{
		outline: [
			450, 200, 640, 300, 660, 640, 450, 860, 450, 1000, 660, 1200, 640, 1600, 80, 1600, 60, 1200,
			270, 1000, 270, 860, 60, 640, 80, 300, 270, 200
		],
		goal: { x: 360, y: 200, width: 180 },
		ball: { x: 360, y: 1450 },
		chasers: [
			{ x: 180, y: 1220 },
			{ x: 540, y: 1220 },
			{ x: 360, y: 620 },
			{ x: 180, y: 420 }
		]
	},
	// 5. Meet the keeper.
	{
		outline: [480, 220, 640, 280, 680, 800, 560, 1300, 160, 1300, 40, 800, 80, 280, 240, 220],
		goal: { x: 360, y: 220, width: 240 },
		ball: { x: 360, y: 1150 },
		chasers: [
			{ x: 180, y: 620 },
			{ x: 540, y: 620 },
			{ x: 360, y: 820 }
		],
		keeper: true
	},
	// 6. The zigzag: right, then left, then right again.
	{
		outline: [
			600, 220, 680, 300, 680, 600, 440, 720, 440, 1100, 680, 1220, 680, 1650, 300, 1650, 300, 1220,
			60, 1100, 60, 720, 340, 600, 340, 300, 400, 220
		],
		goal: { x: 500, y: 220, width: 200 },
		ball: { x: 500, y: 1500 },
		chasers: [
			{ x: 180, y: 900 },
			{ x: 560, y: 420 },
			{ x: 400, y: 1340 }
		],
		discs: [{ x: 300, y: 1000, r: 34, kind: 'bush' }]
	},
	// 7. Benches across the park.
	{
		outline: [460, 220, 660, 260, 680, 1500, 40, 1500, 60, 260, 260, 220],
		goal: { x: 360, y: 220, width: 200 },
		ball: { x: 360, y: 1380 },
		chasers: [
			{ x: 560, y: 700 },
			{ x: 160, y: 780 },
			{ x: 520, y: 1120 },
			{ x: 360, y: 420 }
		],
		blocks: [
			[100, 560, 400, 560, 400, 610, 100, 610],
			[320, 900, 620, 900, 620, 950, 320, 950],
			[140, 1150, 220, 1150, 220, 1230, 140, 1230]
		]
	},
	// 8. Tyres, a rock and a keeper.
	{
		outline: [
			470, 220, 620, 240, 690, 560, 600, 900, 680, 1250, 520, 1560, 200, 1560, 40, 1250, 120, 900,
			30, 560, 100, 240, 250, 220
		],
		goal: { x: 360, y: 220, width: 220 },
		ball: { x: 360, y: 1420 },
		chasers: [
			{ x: 200, y: 700 },
			{ x: 520, y: 700 },
			{ x: 360, y: 900 },
			{ x: 140, y: 1300 }
		],
		discs: [
			{ x: 360, y: 560, r: 34, kind: 'tyre' },
			{ x: 180, y: 1000, r: 34, kind: 'tyre' },
			{ x: 540, y: 1000, r: 34, kind: 'tyre' },
			{ x: 360, y: 1200, r: 44, kind: 'rock' }
		],
		keeper: true
	},
	// 9. The long diagonal.
	{
		outline: [
			260, 220, 380, 360, 680, 1000, 680, 1700, 400, 1700, 320, 1300, 40, 700, 40, 300, 60, 220
		],
		goal: { x: 160, y: 220, width: 200 },
		ball: { x: 540, y: 1560 },
		chasers: [
			{ x: 480, y: 1100 },
			{ x: 300, y: 800 },
			{ x: 180, y: 520 },
			{ x: 600, y: 1300 }
		],
		discs: [{ x: 420, y: 960, r: 38, kind: 'bush' }],
		keeper: true,
		speed: 1.1
	},
	// 10. Everything at once.
	{
		outline: [
			460, 220, 600, 280, 680, 520, 560, 760, 680, 1000, 680, 1400, 540, 1800, 180, 1800, 40, 1400,
			40, 1000, 160, 760, 40, 520, 120, 280, 260, 220
		],
		goal: { x: 360, y: 220, width: 200 },
		ball: { x: 360, y: 1650 },
		chasers: [
			{ x: 200, y: 1350 },
			{ x: 520, y: 1350 },
			{ x: 360, y: 1150 },
			{ x: 180, y: 880 },
			{ x: 540, y: 880 },
			{ x: 360, y: 450 }
		],
		discs: [
			{ x: 360, y: 640, r: 40, kind: 'rock' },
			{ x: 200, y: 1150, r: 40, kind: 'bush' },
			{ x: 520, y: 1150, r: 40, kind: 'bush' },
			{ x: 360, y: 1460, r: 30, kind: 'tyre' }
		],
		blocks: [[300, 920, 420, 920, 420, 960, 300, 960]],
		keeper: true,
		speed: 1.15
	}
];
