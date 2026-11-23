// Small seeded PRNG (mulberry32). State is a single uint32, so it serializes with the saved game.
export interface Rng {
	next(): number; // [0, 1)
	int(maxExclusive: number): number;
	readonly state: number;
}

export function createRng(seed: number): Rng {
	let s = seed >>> 0;
	return {
		next() {
			s = (s + 0x6d2b79f5) >>> 0;
			let t = s;
			t = Math.imul(t ^ (t >>> 15), t | 1);
			t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
			return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
		},
		int(maxExclusive) {
			return Math.floor(this.next() * maxExclusive);
		},
		get state() {
			return s;
		}
	};
}

/** Weighted pick. `weights` must contain at least one positive value. */
export function pickWeighted<T>(rng: Rng, items: readonly T[], weight: (t: T) => number): T {
	let total = 0;
	for (const it of items) total += weight(it);
	let r = rng.next() * total;
	for (const it of items) {
		r -= weight(it);
		if (r < 0) return it;
	}
	return items[items.length - 1]!;
}
