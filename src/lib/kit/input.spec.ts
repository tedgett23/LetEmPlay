import { describe, expect, it } from 'vitest';
import { classifySwipe, flickVelocity } from './input';

describe('classifySwipe', () => {
	it('detects the four directions', () => {
		expect(classifySwipe(80, 5, 100)).toBe('right');
		expect(classifySwipe(-80, 5, 100)).toBe('left');
		expect(classifySwipe(5, -80, 100)).toBe('up');
		expect(classifySwipe(5, 80, 100)).toBe('down');
	});

	it('uses the dominant axis on diagonals', () => {
		expect(classifySwipe(60, -50, 100)).toBe('right');
		expect(classifySwipe(40, -50, 100)).toBe('up');
	});

	it('rejects short or slow gestures', () => {
		expect(classifySwipe(10, 10, 100)).toBeNull();
		expect(classifySwipe(200, 0, 2000)).toBeNull();
	});
});

describe('flickVelocity', () => {
	it('measures over the trailing window, ignoring a slow start', () => {
		const samples = [
			{ x: 0, y: 0, t: 0 },
			{ x: 0, y: -2, t: 200 }, // slow wind-up
			{ x: 0, y: -50, t: 240 },
			{ x: 0, y: -100, t: 280 },
			{ x: 0, y: -150, t: 300 }
		];
		const v = flickVelocity(samples, 80);
		expect(v.vx).toBe(0);
		expect(v.vy).toBeCloseTo(-148 / 100, 5);
	});

	it('is zero with fewer than two samples', () => {
		expect(flickVelocity([])).toEqual({ vx: 0, vy: 0 });
		expect(flickVelocity([{ x: 1, y: 1, t: 0 }])).toEqual({ vx: 0, vy: 0 });
	});
});
