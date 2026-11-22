import { describe, expect, it } from 'vitest';
import { clearAllAppData, createStorage, type KVBackend } from './storage';
import { getBest, recordScore } from './scores';

function memory(): KVBackend & { data: Map<string, string> } {
	const data = new Map<string, string>();
	return {
		data,
		getItem: (k) => data.get(k) ?? null,
		setItem: (k, v) => void data.set(k, v),
		removeItem: (k) => void data.delete(k),
		key: (i) => [...data.keys()][i] ?? null,
		get length() {
			return data.size;
		}
	};
}

describe('storage', () => {
	it('round-trips values under a namespaced, versioned key', () => {
		const m = memory();
		const s = createStorage('block-drop', m);
		expect(s.set('board', [1, 2, 3])).toBe(true);
		expect(s.get('board', [])).toEqual([1, 2, 3]);
		expect([...m.data.keys()]).toEqual(['arcade:v1:block-drop:board']);
	});

	it('returns the fallback for missing, corrupt or wrong-version data', () => {
		const m = memory();
		const s = createStorage('g', m);
		expect(s.get('x', 7)).toBe(7);
		m.setItem('arcade:v1:g:x', '{not json');
		expect(s.get('x', 7)).toBe(7);
		m.setItem('arcade:v1:g:x', JSON.stringify({ v: 999, d: 1 }));
		expect(s.get('x', 7)).toBe(7);
	});

	it('never throws when the backend throws (quota / private mode)', () => {
		const broken: KVBackend = {
			getItem: () => {
				throw new Error('denied');
			},
			setItem: () => {
				throw new Error('quota');
			},
			removeItem: () => {
				throw new Error('denied');
			},
			key: () => null,
			length: 0
		};
		const s = createStorage('g', broken);
		expect(s.set('a', 1)).toBe(false);
		expect(s.get('a', 2)).toBe(2);
		expect(() => s.remove('a')).not.toThrow();
	});

	it('works with no backend at all', () => {
		const s = createStorage('g', null);
		expect(s.set('a', 1)).toBe(false);
		expect(s.get('a', 3)).toBe(3);
	});

	it('clearAllAppData removes only our keys', () => {
		const m = memory();
		m.setItem('someone-else', 'keep');
		createStorage('a', m).set('x', 1);
		createStorage('b', m).set('y', 2);
		clearAllAppData(m);
		expect([...m.data.keys()]).toEqual(['someone-else']);
	});
});

describe('scores', () => {
	it('records only improvements', () => {
		const m = memory();
		expect(getBest('block-drop', m)).toBe(0);
		expect(recordScore('block-drop', 10, m)).toBe(true);
		expect(recordScore('block-drop', 5, m)).toBe(false);
		expect(recordScore('block-drop', 10, m)).toBe(false);
		expect(getBest('block-drop', m)).toBe(10);
	});
});
