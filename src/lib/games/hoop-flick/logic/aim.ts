// Flick → launch velocity. The flick's direction picks where the ball goes sideways (it heads
// for the point on the rim's screen line you flicked toward) and its speed picks how deep it goes.
// The flight time is fixed, so every throw arrives at rim height, falling. That keeps the game
// about one simple skill (aim + strength) and makes a decent flick go in often.
import { project, unproject } from './projection';
import { TUNING } from './tuning';

const TH = TUNING.throw;

export interface Velocity3 {
	vx: number;
	vy: number;
	vz: number;
}

export interface Aim {
	/** Raw power: 1 = flick speed that reaches the hoop's depth. */
	power: number;
	/** Power after the assist. */
	assistedPower: number;
	/** Where (world x at the hoop) the flick pointed, before and after the assist. */
	aimX: number;
	assistedX: number;
	velocity: Velocity3;
}

/** Pulls `value` toward `target` when it's within `window`; continuous at the window edge. */
export function assist(value: number, target: number, window: number, keep: number): number {
	const e = value - target;
	const a = Math.abs(e);
	if (a <= window) return target + e * keep;
	return target + Math.sign(e) * (window * keep + (a - window));
}

/** Upward speed of a flick in logical px/ms (positive = up), or null if it isn't a throw. */
export function flickPower(vx: number, vy: number): number | null {
	const up = -vy;
	if (up < TH.minSpeed || up < Math.abs(vx) * 0.5) return null;
	return up / TH.perfectSpeed;
}

/**
 * `flick` is velocity in logical px/ms (y down). `targetX` is where the hoop will be when the
 * ball arrives (the game predicts it for a moving hoop). Returns null for non-throws.
 */
export function aimFlick(flick: { vx: number; vy: number }, targetX: number): Aim | null {
	const raw = flickPower(flick.vx, flick.vy);
	if (raw === null) return null;
	const power = Math.min(Math.max(raw, TH.minPower), TH.maxPower);
	const assistedPower = assist(power, 1, TH.powerAssist.window, TH.powerAssist.keep);

	// Follow the flick direction from the ball's screen position up to the rim's screen height.
	const { start } = TUNING.ball;
	const { rimY, z: hoopZ } = TUNING.hoop;
	const ball = project(start.x, start.y, start.z);
	const rimScreenY = project(0, rimY, hoopZ).y;
	const sx = ball.x + (flick.vx / -flick.vy) * (ball.y - rimScreenY);
	const aimX = unproject(sx, rimScreenY, hoopZ).x;
	const assistedX = assist(aimX, targetX, TH.aimAssist.window, TH.aimAssist.keep);

	const T = TH.flightTime;
	const g = TUNING.gravity;
	const targetZ = start.z + (hoopZ + TH.depthBias - start.z) * assistedPower;
	return {
		power,
		assistedPower,
		aimX,
		assistedX,
		velocity: {
			vx: (assistedX - start.x) / T,
			vy: (rimY - start.y + 0.5 * g * T * T) / T,
			vz: (targetZ - start.z) / T
		}
	};
}
