import { describe, expect, it } from 'vitest';
import { project } from '../logic/projection';
import { TUNING } from '../logic/tuning';
import { ballInHand, formatTime, H, inPause, inThrowZone, ringPoints, W } from './layout';

describe('hoop flick layout', () => {
	it('puts the ball in hand inside the throw zone and fully on screen', () => {
		const b = ballInHand();
		expect(inThrowZone(b)).toBe(true);
		expect(b.x - b.r).toBeGreaterThan(0);
		expect(b.x + b.r).toBeLessThan(W);
		expect(b.y + b.r).toBeLessThan(H);
	});
	it('keeps the pause button out of the throw zone', () => {
		expect(inPause({ x: 648, y: 88 })).toBe(true);
		expect(inThrowZone({ x: 648, y: 88 })).toBe(false);
		expect(inThrowZone({ x: 360, y: 400 })).toBe(false);
	});
	it('keeps the backboard on screen at the widest hoop swing', () => {
		const { width, z, top, bottom } = TUNING.board;
		const reach = TUNING.moving.amplitude + width / 2;
		expect(project(-reach, bottom, z).x).toBeGreaterThan(0);
		expect(project(reach, bottom, z).x).toBeLessThan(W);
		expect(project(0, top, z).y).toBeGreaterThan(200); // below the HUD
	});
	it('builds a ring of points', () => {
		const pts = ringPoints(0, 3, 4, 0.3, 8);
		expect(pts).toHaveLength(8);
		for (const p of pts) expect(Math.hypot(p.x, p.z - 4)).toBeCloseTo(0.3);
	});
	it('formats the countdown', () => {
		expect(formatTime(60)).toBe('1:00');
		expect(formatTime(59.01)).toBe('1:00');
		expect(formatTime(42.5)).toBe('0:43');
		expect(formatTime(0.2)).toBe('0:01');
		expect(formatTime(0)).toBe('0:00');
	});
});
