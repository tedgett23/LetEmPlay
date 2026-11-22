// Screen layout for Hoop Flick on the 720×1280 logical stage. Pure math, unit tested.
import { project } from '../logic/projection';
import { TUNING } from '../logic/tuning';

export const W = 720;
export const H = 1280;

/** Same corner and size as Block Drop's, so the pause button is where kids expect it. */
export const PAUSE = { x: 600, y: 40, size: 96 };

/** Flicks must start below this line (the lower part of the screen, around the ball). */
export const THROW_ZONE_TOP = 700;

export const HUD = {
	score: { x: 48, y: 64 },
	timer: { x: W / 2, y: 88 }
};

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

export function inThrowZone(p: Pt): boolean {
	return p.y >= THROW_ZONE_TOP && p.y <= H && p.x >= 0 && p.x <= W && !inPause(p);
}

/** Where the ball in hand is drawn, and its radius. */
export function ballInHand(): { x: number; y: number; r: number } {
	const s = TUNING.ball.start;
	const p = project(s.x, s.y, s.z);
	return { x: p.x, y: p.y, r: TUNING.ball.radius * p.k };
}

/** Points around the rim ring (world coordinates), for drawing the rim and the net. */
export function ringPoints(
	cx: number,
	y: number,
	cz: number,
	radius: number,
	n: number
): { x: number; y: number; z: number }[] {
	const pts = [];
	for (let i = 0; i < n; i++) {
		const a = (i / n) * Math.PI * 2;
		pts.push({ x: cx + Math.cos(a) * radius, y, z: cz + Math.sin(a) * radius });
	}
	return pts;
}

/** "0:42" style countdown text; always rounds up so it never shows 0 while time remains. */
export function formatTime(seconds: number): string {
	const s = Math.ceil(Math.max(seconds, 0));
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
