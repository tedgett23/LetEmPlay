import { describe, expect, it } from 'vitest';
import { fitLogical, shouldPromptRotate } from './viewport';

describe('fitLogical', () => {
	it('letterboxes a portrait design into a wider container', () => {
		const f = fitLogical({ width: 1000, height: 1280 }, { width: 720, height: 1280 });
		expect(f.scale).toBe(1);
		expect(f.x).toBe(140);
		expect(f.y).toBe(0);
	});

	it('pillarboxes into a taller container', () => {
		const f = fitLogical({ width: 360, height: 800 }, { width: 720, height: 1280 });
		expect(f.scale).toBe(0.5);
		expect(f.x).toBe(0);
		expect(f.y).toBe(80);
	});
});

describe('shouldPromptRotate', () => {
	it('prompts phones in landscape only', () => {
		expect(shouldPromptRotate({ width: 844, height: 390 })).toBe(true);
		expect(shouldPromptRotate({ width: 390, height: 844 })).toBe(false);
	});
	it('lets tablets letterbox in landscape', () => {
		expect(shouldPromptRotate({ width: 1180, height: 820 })).toBe(false);
	});
});
