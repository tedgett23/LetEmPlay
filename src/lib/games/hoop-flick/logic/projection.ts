// Perspective projection from world units to the 720×1280 logical stage. Shared by the aim
// mapping (where on screen the player flicked toward) and the renderer.
import { TUNING } from './tuning';

const C = TUNING.camera;

export interface Projected {
	x: number;
	y: number;
	/** Logical pixels per world unit at this depth (use for sizes). */
	k: number;
}

export function project(x: number, y: number, z: number): Projected {
	const k = C.focal / Math.max(z - C.z, 0.05);
	return { x: C.centerX + x * k, y: C.horizonY - (y - C.y) * k, k };
}

/** Inverse of project() for a known depth: logical screen point → world x/y at depth z. */
export function unproject(sx: number, sy: number, z: number): { x: number; y: number } {
	const k = C.focal / (z - C.z);
	return { x: (sx - C.centerX) / k, y: C.y - (sy - C.horizonY) / k };
}
