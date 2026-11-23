import { Graphics, Rectangle, type PixiStage } from '../../../kit/pixi';

export const TILE_SIZE = 64;

// The index is also the saved board color: gray is reserved for the game-over fade.
const enamel = [
	[0x9297ab, 0x53586f],
	[0xfa696c, 0xb53f50],
	[0xffc64b, 0xbc7d2a],
	[0x53d598, 0x298668],
	[0x59c3ef, 0x347cab]
] as const;

function tile(index: number) {
	const [face, edge] = enamel[index]!;
	const g = new Graphics()
		.roundRect(0, 0, TILE_SIZE, TILE_SIZE, 12)
		.fill(edge)
		.roundRect(2, 1, 60, 56, 10)
		.fill(face)
		.moveTo(10, 16)
		.quadraticCurveTo(10, 9, 17, 9)
		.lineTo(30, 9)
		.stroke({ color: 0xffffff, alpha: 0.6, width: 3, cap: 'round' });
	// Stamped motifs distinguish the four colors even in the small tray pieces.
	switch (index) {
		case 1:
			g.poly([32, 17, 44, 30, 32, 43, 20, 30]);
			break;
		case 2:
			g.circle(32, 30, 10);
			break;
		case 3:
			g.moveTo(20, 40)
				.quadraticCurveTo(17, 18, 44, 19)
				.quadraticCurveTo(43, 43, 20, 40)
				.closePath();
			break;
		case 4:
			g.moveTo(32, 16)
				.quadraticCurveTo(52, 39, 34, 43)
				.quadraticCurveTo(12, 43, 32, 16)
				.closePath();
			break;
		default:
			return g;
	}
	return g.fill({ color: edge, alpha: 0.66 });
}

/** Bake at setup so board cells, drag previews and burst particles reuse the same sprites. */
export function tileArt(stage: PixiStage) {
	function bake(g: Graphics, size: number) {
		const texture = stage.app.renderer.generateTexture({
			target: g,
			frame: new Rectangle(0, 0, size, size),
			resolution: 2,
			antialias: true
		});
		g.destroy();
		return texture;
	}
	const tiles = enamel.map((_, i) => bake(tile(i), TILE_SIZE));
	const star = bake(
		new Graphics()
			.poly([20, 1, 25, 14, 39, 20, 25, 25, 20, 39, 15, 25, 1, 20, 15, 14])
			.fill(0xffd45b)
			.circle(20, 20, 4)
			.fill(0xfff6cc),
		40
	);
	return { tiles, star };
}
