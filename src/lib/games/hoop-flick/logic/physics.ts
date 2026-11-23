// One ball's flight: gravity, the rim (a ring), the backboard, the floor, and basket detection.
// Real 3D positions with a perspective camera do the "fake depth" for us: a rising ball is in
// front of the hoop, so it passes in front of the rim. Rim collisions are also gated until the
// ball starts falling, so a low, fast shot never clips the front of the rim.
import type { Velocity3 } from './aim';
import { TUNING } from './tuning';

const R = TUNING.ball.radius;
const HOOP = TUNING.hoop;
const BOARD = TUNING.board;

export interface Ball {
	id: number;
	x: number;
	y: number;
	z: number;
	vx: number;
	vy: number;
	vz: number;
	/** Visual spin angle (radians). */
	spin: number;
	age: number;
	touchedRim: boolean;
	touchedBoard: boolean;
	scored: boolean;
	swish: boolean;
	/** Scored or missed; the ball still bounces away for a moment. */
	resolved: boolean;
	resolvedAge: number;
}

export type BallEvent =
	| { type: 'rim'; speed: number }
	| { type: 'board'; speed: number }
	| { type: 'floor'; speed: number }
	| { type: 'basket'; swish: boolean }
	| { type: 'miss' };

export function launchBall(id: number, v: Velocity3): Ball {
	const s = TUNING.ball.start;
	return {
		id,
		...s,
		...v,
		spin: 0,
		age: 0,
		touchedRim: false,
		touchedBoard: false,
		scored: false,
		swish: false,
		resolved: false,
		resolvedAge: 0
	};
}

/** True when the ball's centre went down through the ring between two positions. */
export function crossedRimDown(
	prev: { x: number; y: number; z: number },
	next: { x: number; y: number; z: number },
	hoopX: number
): boolean {
	if (!(prev.y >= HOOP.rimY && next.y < HOOP.rimY)) return false;
	// Interpolate the crossing point so a fast ball can't skip the test between substeps.
	const t = (prev.y - HOOP.rimY) / (prev.y - next.y);
	const x = prev.x + (next.x - prev.x) * t;
	const z = prev.z + (next.z - prev.z) * t;
	return Math.hypot(x - hoopX, z - HOOP.z) < HOOP.rimRadius;
}

function collideRim(b: Ball, hoopX: number, out: BallEvent[]) {
	// Closest point on the ring (a circle in the horizontal plane at rim height) to the ball.
	const dx = b.x - hoopX;
	const dz = b.z - HOOP.z;
	const d = Math.hypot(dx, dz) || 1e-6;
	const qx = hoopX + (dx / d) * HOOP.rimRadius;
	const qz = HOOP.z + (dz / d) * HOOP.rimRadius;
	const nx = b.x - qx;
	const ny = b.y - HOOP.rimY;
	const nz = b.z - qz;
	const dist = Math.hypot(nx, ny, nz);
	const min = R + HOOP.rimTube;
	if (dist >= min || dist === 0) return;

	const ux = nx / dist;
	const uy = ny / dist;
	const uz = nz / dist;
	b.x = qx + ux * min;
	b.y = HOOP.rimY + uy * min;
	b.z = qz + uz * min;
	const vn = b.vx * ux + b.vy * uy + b.vz * uz;
	if (vn >= 0) return;
	const j = (1 + HOOP.rimRestitution) * vn;
	b.vx = (b.vx - j * ux) * 0.92;
	b.vy = b.vy - j * uy;
	b.vz = (b.vz - j * uz) * 0.92;
	if (!b.touchedRim || -vn > 0.8) out.push({ type: 'rim', speed: -vn });
	b.touchedRim = true;
}

function collideBoard(b: Ball, hoopX: number, out: BallEvent[]) {
	if (b.vz <= 0 || b.z + R < BOARD.z || b.z > BOARD.z) return;
	const half = BOARD.width / 2;
	if (Math.abs(b.x - hoopX) > half + R * 0.5) return;
	if (b.y < BOARD.bottom - R * 0.5 || b.y > BOARD.top + R * 0.5) return;
	b.z = BOARD.z - R;
	out.push({ type: 'board', speed: b.vz });
	b.vz = -b.vz * BOARD.restitution;
	b.vx *= 0.9;
	b.vy *= 0.9;
	b.touchedBoard = true;
}

function collideRoom(b: Ball, out: BallEvent[]) {
	if (b.y < R) {
		b.y = R;
		if (b.vy < 0) {
			if (b.vy < -1) out.push({ type: 'floor', speed: -b.vy });
			b.vy = -b.vy * TUNING.floorRestitution;
			b.vx *= 0.8;
			b.vz *= 0.8;
		}
	}
	if (b.z > TUNING.wallZ - R && b.vz > 0) {
		b.z = TUNING.wallZ - R;
		b.vz = -b.vz * 0.5;
	}
}

/** Slow the ball while it drops through the net after a basket, and keep it centred. */
function netDrag(b: Ball, hoopX: number, dt: number) {
	if (!b.scored || b.y > HOOP.rimY || b.y < HOOP.rimY - HOOP.netDepth) return;
	const h = Math.exp(-10 * dt);
	b.vx = b.vx * h + (hoopX - b.x) * 6 * dt;
	b.vz = b.vz * h + (HOOP.z - b.z) * 6 * dt;
	b.vy *= Math.exp(-2.5 * dt);
}

/** Advance one ball by `dt` seconds (internally substepped). Appends what happened to `out`. */
export function stepBall(b: Ball, hoopX: number, dt: number, out: BallEvent[]): void {
	const n = TUNING.substeps;
	const h = dt / n;
	for (let i = 0; i < n; i++) {
		const prev = { x: b.x, y: b.y, z: b.z };
		b.vy -= TUNING.gravity * h;
		b.x += b.vx * h;
		b.y += b.vy * h;
		b.z += b.vz * h;

		if (!b.scored && b.vy < 0 && crossedRimDown(prev, b, hoopX)) {
			b.scored = true;
			b.swish = !b.touchedRim && !b.touchedBoard;
			b.resolved = true;
			out.push({ type: 'basket', swish: b.swish });
		}

		// Rising balls pass in front of the rim. Once a ball has bounced, it can hit anything.
		const rimLive = b.vy <= 0 || b.touchedRim || b.touchedBoard;
		const insideNet = b.scored && b.y < HOOP.rimY;
		if (rimLive && !insideNet) collideRim(b, hoopX, out);
		collideBoard(b, hoopX, out);
		collideRoom(b, out);
		netDrag(b, hoopX, h);
	}
	b.age += dt;
	b.spin -= (b.vz + Math.abs(b.vx)) * dt * 2.2;

	const r = TUNING.round;
	if (b.resolved) {
		b.resolvedAge += dt;
	} else if ((b.vy < 0 && b.y < HOOP.rimY - r.missBelowRim) || b.age > r.maxShotSeconds) {
		b.resolved = true;
		out.push({ type: 'miss' });
	}
}
