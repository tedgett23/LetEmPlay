import { describe, expect, it } from 'vitest';
import { ease, Tweens } from './tween';
import { pickFormat } from './audio';

describe('Tweens', () => {
	it('runs from 0 to 1 over its duration and completes once', () => {
		const tw = new Tweens();
		const seen: number[] = [];
		let done = 0;
		tw.add({
			duration: 1,
			ease: ease.linear,
			onUpdate: (t) => seen.push(t),
			onComplete: () => done++
		});
		tw.update(0.5);
		tw.update(0.5);
		tw.update(0.5);
		expect(seen).toEqual([0.5, 1]);
		expect(done).toBe(1);
		expect(tw.busy).toBe(false);
	});

	it('honors delay', () => {
		const tw = new Tweens();
		const seen: number[] = [];
		tw.add({ duration: 1, delay: 1, ease: ease.linear, onUpdate: (t) => seen.push(t) });
		tw.update(0.5);
		expect(seen).toEqual([]);
		tw.update(1);
		expect(seen).toEqual([0.5]);
	});

	it('allows adding tweens from callbacks', () => {
		const tw = new Tweens();
		let second = false;
		tw.add({
			duration: 0.1,
			onUpdate: () => {},
			onComplete: () => tw.add({ duration: 0.1, onUpdate: () => (second = true) })
		});
		tw.update(0.2);
		tw.update(0.2);
		expect(second).toBe(true);
	});
});

describe('pickFormat', () => {
	it('prefers the first playable format', () => {
		expect(pickFormat(['m4a', 'ogg'], (m) => m.includes('mp4'))).toBe('m4a');
		expect(pickFormat(['m4a', 'ogg'], (m) => m.includes('ogg'))).toBe('ogg');
		expect(pickFormat(['ogg'], () => false)).toBe('ogg');
		expect(pickFormat([], () => true)).toBeNull();
	});
});
