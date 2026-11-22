// Letterbox scaling of a logical (design) resolution into a container (MVP.md §6).
export interface Size {
	width: number;
	height: number;
}

export interface Fit {
	/** CSS px per logical unit. */
	scale: number;
	/** Offset (CSS px) of the logical area inside the container. */
	x: number;
	y: number;
	width: number;
	height: number;
}

export const MAX_DPR = 2;

export function fitLogical(container: Size, logical: Size): Fit {
	const scale = Math.min(container.width / logical.width, container.height / logical.height);
	const width = logical.width * scale;
	const height = logical.height * scale;
	return {
		scale,
		x: (container.width - width) / 2,
		y: (container.height - height) / 2,
		width,
		height
	};
}

export function devicePixelRatioCapped(): number {
	return Math.min(globalThis.devicePixelRatio || 1, MAX_DPR);
}

/** Phone in landscape → shell shows RotatePrompt. Tablets may letterbox instead. */
export function shouldPromptRotate(size: Size): boolean {
	const landscape = size.width > size.height;
	const shortSide = Math.min(size.width, size.height);
	return landscape && shortSide < 600;
}

/** Calls back with the container's size whenever it changes. Returns a disposer. */
export function observeSize(el: HTMLElement, cb: (size: Size) => void): () => void {
	const ro = new ResizeObserver(([entry]) => {
		if (!entry) return;
		const { width, height } = entry.contentRect;
		cb({ width, height });
	});
	ro.observe(el);
	return () => ro.disconnect();
}
