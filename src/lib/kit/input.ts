// Pointer-Events-only gesture helpers (MVP.md §6). Touch is the target; mouse works incidentally.
// Classification is pure and unit-tested; attach* functions wire it to DOM events.

export type SwipeDir = 'left' | 'right' | 'up' | 'down';

export interface SwipeOptions {
	/** Minimum travel in CSS px. */
	minDistance: number;
	/** Gesture must complete within this time. */
	maxDurationMs: number;
}

export const DEFAULT_SWIPE: SwipeOptions = { minDistance: 30, maxDurationMs: 500 };

export function classifySwipe(
	dx: number,
	dy: number,
	durationMs: number,
	opts: SwipeOptions = DEFAULT_SWIPE
): SwipeDir | null {
	if (durationMs > opts.maxDurationMs) return null;
	const ax = Math.abs(dx);
	const ay = Math.abs(dy);
	if (Math.max(ax, ay) < opts.minDistance) return null;
	if (ax > ay) return dx > 0 ? 'right' : 'left';
	return dy > 0 ? 'down' : 'up';
}

export interface Flick {
	start: { x: number; y: number };
	end: { x: number; y: number };
	/** Velocity in px/ms, measured over the last part of the gesture. */
	vx: number;
	vy: number;
}

interface Sample {
	x: number;
	y: number;
	t: number;
}

/** Velocity over the trailing `windowMs` of samples (ignores the slow start of a flick). */
export function flickVelocity(samples: Sample[], windowMs = 80): { vx: number; vy: number } {
	const last = samples[samples.length - 1];
	if (!last || samples.length < 2) return { vx: 0, vy: 0 };
	let first = samples[0]!;
	for (let i = samples.length - 2; i >= 0; i--) {
		first = samples[i]!;
		if (last.t - first.t >= windowMs) break;
	}
	const dt = Math.max(last.t - first.t, 1);
	return { vx: (last.x - first.x) / dt, vy: (last.y - first.y) / dt };
}

/** Converts a client point to coordinates relative to `el`. */
function local(el: HTMLElement, e: PointerEvent) {
	const r = el.getBoundingClientRect();
	return { x: e.clientX - r.left, y: e.clientY - r.top };
}

export interface GestureHandlers {
	onSwipe?(dir: SwipeDir): void;
	onFlick?(flick: Flick): void;
	onDragStart?(p: { x: number; y: number }): void;
	/** `p` includes `dragOffsetY` so the dragged item sits above the finger. */
	onDragMove?(p: { x: number; y: number }): void;
	onDragEnd?(p: { x: number; y: number }): void;
	onTap?(p: { x: number; y: number }): void;
}

export interface GestureOptions {
	swipe?: SwipeOptions;
	/**
	 * Fire onSwipe as soon as the finger has travelled far enough, instead of on release.
	 * Runners want this: the move starts mid-gesture. One swipe per touch; lift to swipe again.
	 */
	swipeOnMove?: boolean;
	/** Vertical offset (CSS px, negative = up) applied to drag positions. */
	dragOffsetY?: number;
}

/** Single-pointer gestures on `el`. Returns a disposer. */
export function attachGestures(
	el: HTMLElement,
	h: GestureHandlers,
	opts: GestureOptions = {}
): () => void {
	const swipeOpts = opts.swipe ?? DEFAULT_SWIPE;
	const offsetY = opts.dragOffsetY ?? 0;
	let active: number | null = null;
	let samples: Sample[] = [];
	/** Index into samples where the current (not yet fired) swipe started. */
	let swipeFrom = 0;
	let swiped = false;

	const down = (e: PointerEvent) => {
		if (active !== null) return;
		active = e.pointerId;
		el.setPointerCapture?.(e.pointerId);
		const p = local(el, e);
		samples = [{ ...p, t: e.timeStamp }];
		swipeFrom = 0;
		swiped = false;
		h.onDragStart?.({ x: p.x, y: p.y + offsetY });
	};
	const move = (e: PointerEvent) => {
		if (e.pointerId !== active) return;
		const p = local(el, e);
		samples.push({ ...p, t: e.timeStamp });
		if (samples.length > 32) {
			samples.shift();
			swipeFrom = Math.max(0, swipeFrom - 1);
		}
		h.onDragMove?.({ x: p.x, y: p.y + offsetY });
		if (opts.swipeOnMove && !swiped) {
			const from = samples[swipeFrom]!;
			const dir = classifySwipe(p.x - from.x, p.y - from.y, e.timeStamp - from.t, swipeOpts);
			if (dir) {
				swiped = true;
				h.onSwipe?.(dir);
			} else if (e.timeStamp - from.t > swipeOpts.maxDurationMs) {
				// Too slow to be a swipe: start measuring again from the latest point.
				swipeFrom = samples.length - 1;
			}
		}
	};
	const up = (e: PointerEvent) => {
		if (e.pointerId !== active) return;
		active = null;
		const p = local(el, e);
		samples.push({ ...p, t: e.timeStamp });
		const first = samples[0]!;
		const dx = p.x - first.x;
		const dy = p.y - first.y;
		const duration = e.timeStamp - first.t;
		h.onDragEnd?.({ x: p.x, y: p.y + offsetY });
		const dir = classifySwipe(dx, dy, duration, swipeOpts);
		if (swiped) {
			// Already handled during the move.
		} else if (dir) {
			h.onSwipe?.(dir);
			h.onFlick?.({ start: first, end: p, ...flickVelocity(samples) });
		} else if (Math.hypot(dx, dy) < 10) {
			h.onTap?.(p);
		}
	};
	const cancel = (e: PointerEvent) => {
		if (e.pointerId !== active) return;
		active = null;
		const last = samples[samples.length - 1];
		if (last) h.onDragEnd?.({ x: last.x, y: last.y + offsetY });
	};

	el.addEventListener('pointerdown', down);
	el.addEventListener('pointermove', move);
	el.addEventListener('pointerup', up);
	el.addEventListener('pointercancel', cancel);
	return () => {
		el.removeEventListener('pointerdown', down);
		el.removeEventListener('pointermove', move);
		el.removeEventListener('pointerup', up);
		el.removeEventListener('pointercancel', cancel);
	};
}
