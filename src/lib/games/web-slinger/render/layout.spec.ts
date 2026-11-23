import { describe, expect, it } from 'vitest';
import { TUNING } from '../logic/tuning';
import { cameraY, H, inPause, SCALE, toScreen, toWorld, VIEW_H, W } from './layout';

describe('web slinger layout', () => {
	it('fits the shaft exactly across the screen', () => {
		expect(TUNING.shaftWidth * SCALE).toBeCloseTo(W);
		expect(VIEW_H).toBeCloseTo(H / SCALE);
	});
	it('round-trips screen and world points', () => {
		const w = toWorld(toScreen({ x: 4.5, y: 17 }, 9), 9);
		expect(w.x).toBeCloseTo(4.5);
		expect(w.y).toBeCloseTo(17);
	});
	it('follows the hero up, but never below the floor or above the ceiling', () => {
		expect(cameraY(0, 40)).toBe(-1);
		expect(cameraY(20, 40)).toBeCloseTo(20 - VIEW_H * 0.32);
		expect(cameraY(39, 40)).toBeCloseTo(41 - VIEW_H);
		expect(cameraY(10, 12)).toBe(-1); // short level: never scroll
	});
	it('keeps the hero in the lower part of the screen while climbing', () => {
		const y = toScreen({ x: 0, y: 20 }, cameraY(20, 60)).y;
		expect(y).toBeGreaterThan(H * 0.6);
	});
	it('keeps the pause button separate from play', () => {
		expect(inPause({ x: 648, y: 88 })).toBe(true);
		expect(inPause({ x: 300, y: 700 })).toBe(false);
	});
});
