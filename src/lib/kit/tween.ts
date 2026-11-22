// Tiny tween manager driven by the kit loop (call update(dt) from your fixed update).
// Deliberately minimal: games build juice from these plus Pixi transforms.

export type Ease = (t: number) => number;

export const ease = {
	linear: (t: number) => t,
	outQuad: (t: number) => 1 - (1 - t) * (1 - t),
	inQuad: (t: number) => t * t,
	outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
	inOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
	outBack: (t: number) => {
		const c1 = 1.70158;
		const c3 = c1 + 1;
		return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
	}
} satisfies Record<string, Ease>;

export interface TweenOptions {
	duration: number; // seconds
	delay?: number; // seconds
	ease?: Ease;
	/** Receives eased progress 0..1. */
	onUpdate(t: number): void;
	onComplete?(): void;
}

interface Active extends TweenOptions {
	elapsed: number;
}

export class Tweens {
	private active: Active[] = [];

	add(opts: TweenOptions): void {
		this.active.push({ ...opts, elapsed: -(opts.delay ?? 0) });
	}

	/** Promise that resolves when the tween completes. */
	run(opts: Omit<TweenOptions, 'onComplete'>): Promise<void> {
		return new Promise((resolve) => this.add({ ...opts, onComplete: resolve }));
	}

	update(dt: number): void {
		if (this.active.length === 0) return;
		const still: Active[] = [];
		// Iterate over a snapshot: callbacks may add new tweens.
		const current = this.active;
		this.active = still;
		for (const tw of current) {
			tw.elapsed += dt;
			if (tw.elapsed < 0) {
				still.push(tw);
				continue;
			}
			const p = Math.min(tw.elapsed / tw.duration, 1);
			tw.onUpdate((tw.ease ?? ease.outQuad)(p));
			if (p < 1) still.push(tw);
			else tw.onComplete?.();
		}
	}

	get busy(): boolean {
		return this.active.length > 0;
	}

	clear(): void {
		this.active = [];
	}
}
