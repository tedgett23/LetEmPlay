// Fixed-timestep loop (MVP.md §6). update() runs at a fixed rate; render() gets an
// interpolation alpha. Large deltas (e.g. returning from background) are clamped.
export interface LoopCallbacks {
	update(dt: number): void;
	render(alpha: number): void;
}

export interface Loop {
	start(): void;
	stop(): void;
	readonly running: boolean;
}

export const MAX_FRAME = 0.25;

/** Pure stepping logic, exported for tests. Returns the new accumulator. */
export function advance(
	acc: number,
	frameSeconds: number,
	step: number,
	update: (dt: number) => void
): number {
	acc += Math.min(Math.max(frameSeconds, 0), MAX_FRAME);
	while (acc >= step) {
		update(step);
		acc -= step;
	}
	return acc;
}

export function createLoop(cb: LoopCallbacks, hz = 60): Loop {
	const step = 1 / hz;
	let raf = 0;
	let last = 0;
	let acc = 0;
	let running = false;

	const frame = (now: number) => {
		if (!running) return;
		acc = advance(acc, (now - last) / 1000, step, (dt) => cb.update(dt));
		last = now;
		cb.render(acc / step);
		raf = requestAnimationFrame(frame);
	};

	return {
		start() {
			if (running) return;
			running = true;
			acc = 0;
			last = performance.now();
			raf = requestAnimationFrame(frame);
		},
		stop() {
			running = false;
			cancelAnimationFrame(raf);
		},
		get running() {
			return running;
		}
	};
}
