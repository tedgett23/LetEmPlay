// Generates placeholder PWA icons (PNG) with no external tools.
// Replace with final art in M4 (MVP.md §14). Run: pnpm icons
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const BG = [0x5b, 0x4c, 0xf0]; // matches --c-brand in theme
const TILES = [
	[0xff, 0xc8, 0x3d],
	[0x3d, 0xd6, 0x8c],
	[0xff, 0x6b, 0x8b],
	[0x4c, 0xc9, 0xf0]
];

function crc32(buf) {
	let c,
		crc = 0xffffffff;
	for (let n = 0; n < buf.length; n++) {
		c = (crc ^ buf[n]) & 0xff;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		crc = (crc >>> 8) ^ c;
	}
	return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
	const len = Buffer.alloc(4);
	len.writeUInt32BE(data.length);
	const td = Buffer.concat([Buffer.from(type), data]);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(td));
	return Buffer.concat([len, td, crc]);
}

/** @param {number} size @param {number} safe fraction of the icon used for the motif */
function icon(size, safe) {
	const raw = Buffer.alloc((size * 3 + 1) * size);
	const motif = size * safe;
	const off = (size - motif) / 2;
	const cell = motif / 2;
	const gap = cell * 0.08;
	for (let y = 0; y < size; y++) {
		raw[y * (size * 3 + 1)] = 0;
		for (let x = 0; x < size; x++) {
			let px = BG;
			const mx = x - off,
				my = y - off;
			if (mx >= 0 && my >= 0 && mx < motif && my < motif) {
				const cx = Math.floor(mx / cell),
					cy = Math.floor(my / cell);
				const lx = mx - cx * cell,
					ly = my - cy * cell;
				if (lx > gap && ly > gap && lx < cell - gap && ly < cell - gap) px = TILES[cy * 2 + cx];
			}
			const i = y * (size * 3 + 1) + 1 + x * 3;
			raw[i] = px[0];
			raw[i + 1] = px[1];
			raw[i + 2] = px[2];
		}
	}
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(size, 0);
	ihdr.writeUInt32BE(size, 4);
	ihdr[8] = 8; // bit depth
	ihdr[9] = 2; // RGB
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk('IHDR', ihdr),
		chunk('IDAT', deflateSync(raw)),
		chunk('IEND', Buffer.alloc(0))
	]);
}

mkdirSync('static/icons', { recursive: true });
writeFileSync('static/icons/icon-192.png', icon(192, 0.6));
writeFileSync('static/icons/icon-512.png', icon(512, 0.6));
writeFileSync('static/icons/icon-maskable-512.png', icon(512, 0.45));
writeFileSync('static/icons/apple-touch-icon.png', icon(180, 0.6));
console.log('Wrote placeholder icons to static/icons/');
