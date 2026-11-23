// Screen layout and camera for Web Slinger on the 720×1280 logical stage. Pure math, unit tested.
// The shaft is exactly one screen wide, so the camera only scrolls up and down, keeping the hero
// in the lower part of the screen so you can see the ledges above.
import { TUNING } from '../logic/tuning';

export const W = 720;
export const H = 1280;
/** Logical pixels per metre: the shaft fills the width. */
export const SCALE = W / TUNING.shaftWidth;
/** Metres of shaft visible at once. */
export const VIEW_H = H / SCALE;
/** The hero sits this far up the screen. */
export const HERO_SCREEN_Y = 0.32;

/** Same corner and size as the other games' pause buttons. */
export const PAUSE = { x: 600, y: 40, size: 96 };

export interface Pt {
	x: number;
	y: number;
}

export function inPause(p: Pt): boolean {
	const pad = 16;
	return (
		p.x >= PAUSE.x - pad &&
		p.x <= PAUSE.x + PAUSE.size + pad &&
		p.y >= PAUSE.y - pad &&
		p.y <= PAUSE.y + PAUSE.size + pad
	);
}

/** World height at the bottom edge of the screen, following `heroY`, clamped to the shaft. */
export function cameraY(heroY: number, levelHeight: number): number {
	const want = heroY - VIEW_H * HERO_SCREEN_Y;
	return Math.min(Math.max(want, -1), Math.max(levelHeight + 1 - VIEW_H, -1));
}

export function toScreen(p: Pt, camY: number): Pt {
	return { x: p.x * SCALE, y: H - (p.y - camY) * SCALE };
}

export function toWorld(p: Pt, camY: number): Pt {
	return { x: p.x / SCALE, y: (H - p.y) / SCALE + camY };
}
