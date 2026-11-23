import {
	CanvasTexture,
	Group,
	Mesh,
	MeshLambertMaterial,
	RepeatWrapping,
	Shape,
	ShapeGeometry,
	SRGBColorSpace
} from 'three';
import { createRng } from '../../../kit/rng';
import type { Level } from '../logic/levels';
import { TUNING } from '../logic/tuning';
import { Batch, solid } from './models';

// The simulation's (x,y) is the world's (x,z). All playable surfaces, posts and obstacles
// come directly from the collision polygons; the scenery lives outside their bounds.
export function buildCourse(l: Level, index: number, mat: MeshLambertMaterial) {
	const root = new Group(),
		b = new Batch(),
		rng = createRng(87 + index),
		{ box, tube, cone, stone, crown } = solid;
	const theme = index % 3,
		meadow = [0xb5d777, 0xe2c481, 0xaccd77][theme]!,
		leaf = [0x58a578, 0x60ab8f, 0x789b4b][theme]!;
	const { x: gx, y: gz, width } = l.goal,
		left = gx - width / 2,
		right = gx + width / 2,
		back = gz - TUNING.goal.depth;
	b.add(box, meadow, 360, -15, 1450, 16000, 28, 3800);
	b.add(box, [0x6ccbd3, 0xc6ba68, 0x92beb1][theme]!, 360, -22, -2400, 16000, 8, 5300);
	function shade(x: number, z: number, r: number, ground = 0, color = 0x8bb165) {
		b.add(tube, color, x, ground + 0.4, z, r, 1, r * 0.52);
	}
	function tree(x: number, z: number, size: number) {
		shade(x + size * 0.16, z + size * 0.15, size * 0.64);
		b.add(tube, 0x916a47, x, size * 0.23, z, size * 0.075, size * 0.48, size * 0.075);
		b.add(crown, leaf, x, size * 0.68, z, size * 0.35, size * 0.49, size * 0.34);
		b.add(
			crown,
			0x86bd70,
			x - size * 0.15,
			size * 0.78,
			z + size * 0.09,
			size * 0.25,
			size * 0.34,
			size * 0.25
		);
	}
	// Distant headlands break up the sea/sky horizon. Layer the silhouettes with distance fog.
	for (let k = 0; k < 19; k++) {
		const x = -3300 + k * 390;
		b.add(
			crown,
			k % 2 ? 0x70b7a2 : 0x8bc2a4,
			x,
			-80,
			-1100 - rng.next() * 900,
			330 + rng.next() * 290,
			170 + rng.next() * 230,
			380
		);
	}
	for (let k = 0; k < 14; k++) {
		const x = -3200 + k * 500,
			z = -2000 - rng.next() * 1000,
			h = 350 + rng.next() * 400;
		for (let j = 0; j < 3; j++)
			b.add(
				crown,
				0xfffcf2,
				x + j * 92,
				h + (j === 1 ? 35 : 0),
				z + j * 12,
				100 + j * 12,
				j === 1 ? 78 : 45,
				70
			);
	}
	// Whitecaps / furrows beyond the end of the pitch.
	for (let k = 0; k < 55; k++)
		b.add(
			box,
			0xc5e8df,
			-2000 + rng.next() * 4400,
			-16,
			-500 - rng.next() * 1300,
			24 + rng.next() * 90,
			2,
			4
		);
	for (let k = 0; k < 20; k++) {
		const z = -260 + k * 138;
		tree(k % 2 ? -125 - rng.next() * 180 : 820 + rng.next() * 210, z, 64 + rng.next() * 65);
	}
	// Landmark: a striped harbour light, grain mill or park lookout, with an actual gallery.
	const tx = gx + (theme === 1 ? 167 : -345),
		tz = gz - 460,
		accent = [0xe7674e, 0x4094af, 0xe2a344][theme]!;
	if (theme === 0) {
		for (let i = 0; i < 5; i++) {
			const r = 49 - i * 4;
			b.add(tube, i % 2 ? accent : 0xffeccb, tx, 23 + i * 45, tz, r, 45, r);
		}
		b.add(tube, 0x334e63, tx, 224, tz, 44, 9, 44);
		b.add(tube, 0xb4e6d9, tx, 246, tz, 25, 39, 25);
		for (const a of [0, 1, 2, 3, 4, 5])
			b.add(
				box,
				0x3d5e65,
				tx + 24 * Math.cos((a * Math.PI) / 3),
				246,
				tz + 24 * Math.sin((a * Math.PI) / 3),
				3,
				37,
				3
			);
		b.add(cone, accent, tx, 279, tz, 36, 35, 36);
		b.add(tube, 0x41585b, tx, 302, tz, 2, 20, 2);
	} else if (theme === 1) {
		b.add(tube, 0xf7db98, tx, 92, tz, 57, 184, 57);
		b.add(cone, 0x9e5947, tx, 202, tz, 64, 52, 64);
		// The axle projects beyond the roof. Join each spar to its sail end-to-end;
		// layering the sail over a full-length spar left their front faces coplanar.
		const rotorZ = tz + 74;
		b.add(tube, 0x734a38, tx, 154, tz + 63, 9, 38, 9, Math.PI / 2);
		for (let k = 0; k < 4; k++) {
			const a = 0.54 + (k * Math.PI) / 2,
				dx = Math.sin(a),
				dy = Math.cos(a);
			// Radius 6–46 is wood; radius 46–108 is canvas.
			b.add(box, 0x734a38, tx + dx * 26, 154 + dy * 26, rotorZ, 6, 40, 6, 0, 0, -a);
			b.add(box, 0xffecd1, tx + dx * 77, 154 + dy * 77, rotorZ, 18, 62, 4, 0, 0, -a);
		}
		// Raised beds: tops at +12, bottoms at -22. This clears both the near meadow
		// (top -1) and the far field (top -18), even at a grazing camera angle.
		for (let k = 0; k < 20; k++)
			b.add(
				box,
				k % 2 ? 0xf2bc55 : 0xd99c45,
				gx - 850 + k * 92,
				-5,
				gz - 720,
				80,
				34,
				490,
				0,
				0.22
			);
	} else {
		for (let k = 0; k < 13; k++) {
			const x = gx - 1240 + k * 190,
				z = gz - 510 - (k % 3) * 160,
				h = 140 + rng.next() * 240,
				c = [0x78aebb, 0xd9af92, 0x95b9a6][k % 3]!;
			b.add(box, c, x, h / 2, z, 125, h, 107);
			b.add(box, 0xf3e2c2, x, h, z, 131, 8, 114);
			b.add(box, 0x72929c, x + 22, h + 12, z + 12, 44, 20, 28);
			for (let y = 30; y < h - 10; y += 38)
				for (let j = -1; j <= 1; j++) b.add(box, 0x557e93, x + j * 34, y, z + 54, 20, 20, 2);
		}
	}
	for (let k = 0; k < 6; k++) tree(gx - 145 - k * 31, gz - 120 - (k % 3) * 68, 65 + k * 6);
	// Beach huts / clubhouse, gabled roofs, glass, porch posts and striped awnings.
	function hut(x: number, z: number, c: number) {
		b.add(box, c, x, 38, z, 108, 76, 90);
		for (const s of [-1, 1]) b.add(box, 0x435c70, x + s * 28, 88, z, 68, 8, 104, 0, 0, -s * 0.44);
		b.add(box, 0x304d62, x, 23, z + 46, 19, 46, 2);
		for (const s of [-1, 1]) {
			b.add(box, 0xfff0cd, x + s * 31, 42, z + 46, 23, 23, 3);
			b.add(box, 0x84c6ce, x + s * 31, 42, z + 48, 17, 17, 2);
			b.add(box, 0xfaf2d8, x + s * 50, 25, z + 64, 4, 50, 4);
		}
		for (let i = 0; i < 9; i++)
			b.add(box, i % 2 ? 0xffebc3 : c, x + (i - 4) * 12, 56, z + 56, 12, 4, 27, 0.24);
	}
	if (theme === 1) {
		const x = gx + 305,
			z = gz - 130;
		b.add(box, 0xcb654e, x, 62, z, 146, 124, 112);
		for (const side of [-1, 1])
			b.add(box, 0x5a6062, x + side * 38, 142, z, 92, 9, 128, 0, 0, -side * 0.46);
		b.add(box, 0xf6deba, x, 38, z + 57, 75, 76, 4);
		b.add(box, 0xa14c3d, x, 35, z + 60, 64, 69, 3);
		for (const s of [-1, 1]) b.beam(0xffeac9, x - s * 30, 4, z + 63, x + s * 30, 66, z + 63, 4);
		for (let i = 0; i < 2; i++) {
			const sx = gx - 200 - i * 75;
			b.add(tube, 0xacc5c8, sx, 64, gz - 120, 30, 128, 30);
			b.add(cone, 0x698e99, sx, 140, gz - 120, 33, 27, 33);
		}
		for (let i = 0; i < 5; i++) {
			const bx = gx + 165 + i * 28,
				bz = gz - 74 - (i % 2) * 31;
			b.add(tube, 0xeab856, bx, 14, bz, 15, 33, 15, Math.PI / 2);
			b.add(tube, 0xffd781, bx, 14, bz + 17, 11, 1.5, 11, Math.PI / 2);
		}
	} else if (theme === 2) {
		for (const side of [-1, 1]) {
			const x = gx + side * 245;
			for (let k = 0; k < 3; k++) {
				const z = gz - 45 - k * 23;
				b.add(box, 0x6e8791, x, 5 + k * 9, z, 140, 10 + k * 18, 23);
				for (let i = 0; i < 7; i++)
					b.add(box, i % 3 ? 0x3fa9aa : 0xf4b959, x - 60 + i * 20, 13 + k * 18, z, 16, 7, 16);
			}
			b.add(tube, 0x728e99, x, 106, gz - 142, 4, 212, 4);
			b.add(box, 0x3c5361, x, 213, gz - 142, 75, 21, 10);
			for (let j = 0; j < 4; j++) b.add(box, 0xffedbe, x - 27 + j * 18, 213, gz - 136, 14, 14, 2);
		}
	} else {
		hut(gx + 270, gz - 50, accent);
		hut(gx + 405, gz - 105, 0x69b8ab);
		hut(gx + 205, gz - 240, 0xe6ac58);
	}
	// Small regatta: asymmetric sails on the water, well behind the target.
	for (let k = 0; theme === 0 && k < 5; k++) {
		const x = gx - 160 + k * 150,
			z = gz - 880 - (k % 2) * 220;
		b.add(stone, 0x427588, x, -12, z, 36, 10, 14);
		b.add(box, 0xffefd1, x, 17, z, 2, 63, 2);
		b.add(cone, k % 2 ? 0xf1b467 : 0xfff3de, x + 10, 19, z, 14, 48, 5, 0, 0, 0.22);
	}

	const outline = l.outline;
	const shape = new Shape();
	shape.moveTo(outline[0]!, -outline[1]!);
	for (let i = 2; i < outline.length; i += 2) shape.lineTo(outline[i]!, -outline[i + 1]!);
	shape.closePath();
	const image = document.createElement('canvas');
	image.width = image.height = 256;
	const g = image.getContext('2d')!;
	g.fillStyle = ['#9bce63', '#accf60', '#8cc764'][theme]!;
	g.fillRect(0, 0, 256, 256);
	g.fillStyle = 'rgba(255,255,210,.07)';
	g.fillRect(0, 0, 256, 128);
	for (let i = 0; i < 850; i++) {
		g.fillStyle = i % 2 ? 'rgba(68,112,47,.10)' : 'rgba(255,255,210,.15)';
		g.fillRect(rng.next() * 256, rng.next() * 256, 1 + rng.next() * 2, 1);
	}
	const texture = new CanvasTexture(image);
	texture.colorSpace = SRGBColorSpace;
	texture.wrapS = texture.wrapT = RepeatWrapping;
	texture.repeat.set(1 / 256, 1 / 256);
	const turf = new MeshLambertMaterial({ map: texture });
	const pitch = new Mesh(new ShapeGeometry(shape), turf);
	pitch.rotation.x = -Math.PI / 2;
	pitch.position.y = 0.8;
	root.add(pitch);
	b.add(box, 0x80b35c, gx, 0, (back + gz) / 2, width, 2, gz - back);
	// Low twin rails keep bank angles readable. Posts get sunlit caps and contact shadows.
	for (let i = 2; i < outline.length; i += 2) {
		const ax = outline[i - 2]!,
			az = outline[i - 1]!,
			dx = outline[i]! - ax,
			dz = outline[i + 1]! - az,
			len = Math.hypot(dx, dz),
			n = Math.ceil(len / 56),
			yaw = Math.atan2(dx, dz);
		for (const h of [9, 19])
			b.add(box, h === 9 ? 0xb57b49 : 0xeabd77, ax + dx / 2, h, az + dz / 2, 4, 6, len, 0, yaw);
		for (let k = 0; k < n; k++) {
			const x = ax + (dx * k) / n,
				z = az + (dz * k) / n;
			b.add(box, 0xaf7750, x, 13, z, 7, 26, 7, 0, yaw);
			b.add(box, 0xf6dca0, x, 26, z, 8, 3, 8, 0, yaw);
		}
	}
	// Goal frame, sloping net roof and side netting. Cream mesh against a deep teal back frame.
	const cross = 88,
		low = 55;
	for (const x of [left, right]) {
		const fx = x + (x === left ? -29 : 29);
		b.beam(0xf6e8cc, fx, 0, gz - 18, fx, 102, gz - 18, 3);
		b.add(cone, 0xf06b4c, fx + 9, 96, gz - 18, 8, 21, 3, 0, 0, -Math.PI / 2);
		b.beam(0x286a88, x, 1, gz, x, cross, gz, 8);
		b.add(box, 0xffe9ad, x, cross - 10, gz, 8.5, 12, 8.5);
		b.beam(0x287e82, x, 1, back, x, low, back, 6);
		b.beam(0x419a99, x, cross, gz, x, low, back, 5);
		for (let k = 1; k < 7; k++) {
			const u = k / 7;
			b.beam(
				0xe0efe3,
				x,
				0,
				gz + (back - gz) * u,
				x,
				cross + (low - cross) * u,
				gz + (back - gz) * u,
				1.5
			);
		}
		for (let k = 1; k < 5; k++)
			b.beam(0xe0efe3, x, (cross * k) / 5, gz, x, (low * k) / 5, back, 1.5);
	}
	b.beam(0x286a88, left, cross, gz, right, cross, gz, 8);
	b.beam(0x317a82, left, low, back, right, low, back, 5);
	for (let k = 0; k <= 16; k++) {
		const x = left + (k * width) / 16;
		b.beam(0xdfede1, x, 1, back, x, low, back, 1.5);
		b.beam(0xdfede1, x, low, back, x, cross, gz, 1.5);
	}
	for (let k = 1; k < 5; k++) {
		b.beam(0xdfede1, left, (low * k) / 5, back, right, (low * k) / 5, back, 1.5);
		const u = k / 5;
		b.beam(
			0xdfede1,
			left,
			low + (cross - low) * u,
			back + (gz - back) * u,
			right,
			low + (cross - low) * u,
			back + (gz - back) * u,
			1.5
		);
	}
	const chalk = 0xe3edba;
	b.add(box, chalk, gx, 1.5, gz, width, 1, 4);
	b.add(box, chalk, gx, 1.5, gz + 90, width + 42, 1, 3);
	for (const s of [-1, 1]) b.add(box, chalk, gx + s * (width / 2 + 21), 1.5, gz + 50, 3, 1, 80);
	for (const d of l.discs ?? []) {
		shade(d.x + 5, d.y + 4, d.r, 1, 0x87ad56);
		if (d.kind === 'tyre') {
			b.add(tube, 0x354353, d.x, 9, d.y, d.r, 16, d.r);
			b.add(tube, 0x344553, d.x, 17, d.y, d.r, 2, d.r);
			b.add(tube, 0x1c303b, d.x, 18.5, d.y, d.r * 0.55, 1, d.r * 0.55);
		} else
			b.add(
				d.kind === 'rock' ? stone : crown,
				d.kind === 'rock' ? 0x9faea6 : leaf,
				d.x,
				d.r * 0.36,
				d.y,
				d.r,
				d.r * 0.85,
				d.r,
				0,
				d.x
			);
	}
	for (const p of l.blocks ?? []) {
		const xs = p.filter((_, i) => i % 2 === 0),
			zs = p.filter((_, i) => i % 2 === 1),
			x = Math.min(...xs),
			z = Math.min(...zs),
			w = Math.max(...xs) - x,
			d = Math.max(...zs) - z;
		for (let k = 0; k < 3; k++)
			b.add(
				box,
				k === 1 ? 0xcb8b56 : 0xe2a86c,
				x + w / 2,
				13,
				z + (d * (k + 0.5)) / 3,
				w,
				25,
				d / 3 - 2
			);
	}
	const scenery = b.mesh(mat);
	scenery.castShadow = scenery.receiveShadow = pitch.receiveShadow = true;
	root.add(scenery);
	return {
		root,
		dispose() {
			pitch.geometry.dispose();
			turf.dispose();
			texture.dispose();
			scenery.geometry.dispose();
		}
	};
}
