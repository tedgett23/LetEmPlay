import { expect, it } from 'vitest';
import { CAMERA, groundDirection } from './layout';

it('projects an off-centre bank shot back along the swipe', () => {
	const side = 83,
		behind = 540,
		{ height, pitch } = CAMERA;
	const project = (x: number, z: number) => {
		const depth = z * Math.cos(pitch) + height * Math.sin(pitch);
		return [x / depth, (height * Math.cos(pitch) - z * Math.sin(pitch)) / depth] as const;
	};
	const a = project(side, behind),
		dir = groundDirection(30, -55, side, behind),
		b = project(side + dir.dx, behind - dir.dy);
	expect((b[0] - a[0]) / (b[1] - a[1])).toBeCloseTo(30 / -55, 6);
});
