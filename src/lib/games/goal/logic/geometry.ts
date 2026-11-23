// 2D collision helpers for circles against wall segments and round obstacles. Pure math, no
// allocations in the per-step functions: results go into caller-owned objects.

export interface Pt {
	x: number;
	y: number;
}

export type SegKind = 'wall' | 'net' | 'block';
export type DiscKind = 'post' | 'rock' | 'bush' | 'tyre';

export interface Seg {
	ax: number;
	ay: number;
	bx: number;
	by: number;
	kind: SegKind;
}

export interface Disc {
	x: number;
	y: number;
	r: number;
	kind: DiscKind;
}

/** What a circle touched: the push-out normal (pointing toward the circle) and the surface. */
export interface Contact {
	nx: number;
	ny: number;
	/** How far it had sunk in before being pushed out. */
	depth: number;
	seg: Seg | null;
	disc: Disc | null;
}

export function newContact(): Contact {
	return { nx: 0, ny: 0, depth: 0, seg: null, disc: null };
}

/** Segments joining consecutive points of a flat [x0, y0, x1, y1, …] list, closed by default. */
export function polySegs(points: readonly number[], kind: SegKind, closed = true): Seg[] {
	const out: Seg[] = [];
	const n = points.length / 2;
	for (let i = 0; i < (closed ? n : n - 1); i++) {
		const j = (i + 1) % n;
		out.push({
			ax: points[i * 2]!,
			ay: points[i * 2 + 1]!,
			bx: points[j * 2]!,
			by: points[j * 2 + 1]!,
			kind
		});
	}
	return out;
}

/**
 * Push a circle out of every segment and disc it overlaps, in place. Returns the deepest
 * contact in `hit` (true if there was one). Discs listed in `skip` are ignored.
 */
export function pushOut(
	p: Pt,
	r: number,
	segs: readonly Seg[],
	discs: readonly Disc[],
	hit: Contact
): boolean {
	let any = false;
	hit.depth = 0;
	for (let i = 0; i < segs.length; i++) {
		const s = segs[i]!;
		const ex = s.bx - s.ax;
		const ey = s.by - s.ay;
		const len2 = ex * ex + ey * ey;
		let t = len2 > 0 ? ((p.x - s.ax) * ex + (p.y - s.ay) * ey) / len2 : 0;
		t = t < 0 ? 0 : t > 1 ? 1 : t;
		const cx = s.ax + ex * t;
		const cy = s.ay + ey * t;
		const dx = p.x - cx;
		const dy = p.y - cy;
		const d2 = dx * dx + dy * dy;
		if (d2 >= r * r) continue;
		const d = Math.sqrt(d2);
		let nx: number;
		let ny: number;
		if (d > 1e-6) {
			nx = dx / d;
			ny = dy / d;
		} else {
			// Dead centre on the line: use the segment's left-hand normal.
			const l = Math.sqrt(len2) || 1;
			nx = -ey / l;
			ny = ex / l;
		}
		const depth = r - d;
		p.x += nx * depth;
		p.y += ny * depth;
		if (depth > hit.depth || !any) {
			hit.nx = nx;
			hit.ny = ny;
			hit.depth = depth;
			hit.seg = s;
			hit.disc = null;
		}
		any = true;
	}
	for (let i = 0; i < discs.length; i++) {
		const c = discs[i]!;
		if (pushOutOfDisc(p, r, c.x, c.y, c.r, hit, any)) {
			hit.seg = null;
			hit.disc = c;
			any = true;
		}
	}
	return any;
}

/** Push a circle out of one disc. Overwrites `hit` if this contact is deeper (or `!any`). */
export function pushOutOfDisc(
	p: Pt,
	r: number,
	x: number,
	y: number,
	cr: number,
	hit: Contact,
	any: boolean
): boolean {
	const dx = p.x - x;
	const dy = p.y - y;
	const rr = r + cr;
	const d2 = dx * dx + dy * dy;
	if (d2 >= rr * rr) return false;
	const d = Math.sqrt(d2);
	const nx = d > 1e-6 ? dx / d : 0;
	const ny = d > 1e-6 ? dy / d : 1;
	const depth = rr - d;
	p.x += nx * depth;
	p.y += ny * depth;
	if (depth > hit.depth || !any) {
		hit.nx = nx;
		hit.ny = ny;
		hit.depth = depth;
	}
	return true;
}

/** Reflect velocity `v` off a surface with normal n, if it's moving into it. Returns the impact speed. */
export function bounce(v: { vx: number; vy: number }, nx: number, ny: number, e: number): number {
	const vn = v.vx * nx + v.vy * ny;
	if (vn >= 0) return 0;
	v.vx -= (1 + e) * vn * nx;
	v.vy -= (1 + e) * vn * ny;
	return -vn;
}

/** Even-odd test: is the point inside the closed polygon? */
export function insidePoly(points: readonly number[], x: number, y: number): boolean {
	let inside = false;
	const n = points.length / 2;
	for (let i = 0, j = n - 1; i < n; j = i++) {
		const xi = points[i * 2]!;
		const yi = points[i * 2 + 1]!;
		const xj = points[j * 2]!;
		const yj = points[j * 2 + 1]!;
		if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
	}
	return inside;
}

/** Distance from a point to a segment. */
export function distToSeg(x: number, y: number, s: Seg): number {
	const ex = s.bx - s.ax;
	const ey = s.by - s.ay;
	const len2 = ex * ex + ey * ey;
	let t = len2 > 0 ? ((x - s.ax) * ex + (y - s.ay) * ey) / len2 : 0;
	t = t < 0 ? 0 : t > 1 ? 1 : t;
	return Math.hypot(x - (s.ax + ex * t), y - (s.ay + ey * t));
}

/** Do two segments cross (excluding shared endpoints)? */
export function segsCross(a: Seg, b: Seg): boolean {
	const o = (px: number, py: number, qx: number, qy: number, rx: number, ry: number) =>
		Math.sign((qx - px) * (ry - py) - (qy - py) * (rx - px));
	const shared =
		(a.ax === b.ax && a.ay === b.ay) ||
		(a.ax === b.bx && a.ay === b.by) ||
		(a.bx === b.ax && a.by === b.ay) ||
		(a.bx === b.bx && a.by === b.by);
	if (shared) return false;
	const o1 = o(a.ax, a.ay, a.bx, a.by, b.ax, b.ay);
	const o2 = o(a.ax, a.ay, a.bx, a.by, b.bx, b.by);
	const o3 = o(b.ax, b.ay, b.bx, b.by, a.ax, a.ay);
	const o4 = o(b.ax, b.ay, b.bx, b.by, a.bx, a.by);
	return o1 !== o2 && o3 !== o4 && o1 !== 0 && o3 !== 0;
}
