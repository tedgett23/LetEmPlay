export const W = 720,
	H = 1280;
export const CAMERA = { height: 305, behind: 500, pitch: 0.4, fov: 59 };

// Inverse of the ground plane's local perspective projection at the ball. A diagonal
// swipe follows the finger even when the camera lags to the side during a bank shot.
export function groundDirection(dx: number, dy: number, side: number, behind: number) {
	const { pitch, height } = CAMERA;
	const depth = behind * Math.cos(pitch) + height * Math.sin(pitch);
	const z = (dy * depth) / height;
	return { dx: dx - (z * side * Math.cos(pitch)) / depth, dy: z };
}
