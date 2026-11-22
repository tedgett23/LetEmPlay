import { describe, expect, it } from 'vitest';
import { advance, MAX_FRAME } from './loop';

describe('advance', () => {
	it('runs a whole number of fixed steps and keeps the remainder', () => {
		let calls = 0;
		const acc = advance(0, 0.05, 1 / 60, () => calls++);
		expect(calls).toBe(3);
		expect(acc).toBeCloseTo(0.05 - 3 / 60, 10);
	});

	it('clamps huge frames (e.g. returning from background)', () => {
		let calls = 0;
		advance(0, 30, 1 / 60, () => calls++);
		expect(calls).toBe(Math.floor(MAX_FRAME * 60 + 1e-9));
	});

	it('ignores negative frame times', () => {
		let calls = 0;
		expect(advance(0, -1, 1 / 60, () => calls++)).toBe(0);
		expect(calls).toBe(0);
	});
});
