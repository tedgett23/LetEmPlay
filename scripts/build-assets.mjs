// Asset pipeline. Turns the Kenney source packs in assets-src/ into the
// files the games load from static/assets/. Run: pnpm assets
//
// - Extracts each assets-src/kenney/*.zip (needs the `unzip` CLI) if not already extracted.
// - Copies the chosen sound effects. Kenney ships .ogg only; older iPhones (before iOS 18.4)
//   can't decode Ogg, so if `ffmpeg` is on PATH we also write .m4a (AAC). The game picks the
//   best format the device supports from sfx/index.json.
import { execFileSync } from 'node:child_process';
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync
} from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { crc32, inflateRawSync } from 'node:zlib';
import { dedupeSounds } from './dedupe-sounds.mjs';

const SRC = 'assets-src/kenney';
const OUT = 'static/assets';

function extractAll() {
	for (const zip of readdirSync(SRC).filter((f) => f.endsWith('.zip'))) {
		const dir = join(SRC, zip.replace(/^kenney_/, '').replace(/\.zip$/, ''));
		if (existsSync(dir)) continue;
		try {
			execFileSync('unzip', ['-q', '-o', join(SRC, zip), '-d', dir], { stdio: 'pipe' });
			console.log(`extracted ${zip}`);
		} catch {
			rmSync(dir, { recursive: true, force: true });
			const n = salvageZip(join(SRC, zip), dir);
			if (n > 0) {
				console.warn(`! ${zip} is truncated (no central directory); recovered ${n} verified files`);
			} else {
				console.warn(`! ${zip} could not be unzipped (incomplete download?); skipped`);
			}
		}
	}
}

/**
 * Recover files from a zip whose end (the central directory) is missing, e.g. an interrupted
 * download. Walks the local file headers and keeps only entries whose CRC-32 matches, so every
 * recovered file is byte-for-byte the original. Returns the number of files written.
 */
function salvageZip(file, dir) {
	const data = readFileSync(file);
	let i = 0;
	let written = 0;
	while ((i = data.indexOf(LOCAL_HEADER, i)) >= 0 && i + 30 <= data.length) {
		const flags = data.readUInt16LE(i + 6);
		const method = data.readUInt16LE(i + 8);
		const crc = data.readUInt32LE(i + 14);
		const csize = data.readUInt32LE(i + 18);
		const nlen = data.readUInt16LE(i + 26);
		const xlen = data.readUInt16LE(i + 28);
		const name = data.toString('utf8', i + 30, i + 30 + nlen);
		const start = i + 30 + nlen + xlen;
		i = start;
		// Sizes after the data (flag bit 3) or truncated data: skip.
		if (flags & 8 || start + csize > data.length || name.endsWith('/')) continue;
		const target = resolve(dir, name);
		if (!target.startsWith(resolve(dir) + sep)) continue; // never write outside dir
		let body;
		try {
			const raw = data.subarray(start, start + csize);
			body = method === 8 ? inflateRawSync(raw) : method === 0 ? raw : null;
		} catch {
			continue;
		}
		if (!body || crc32(body) !== crc) continue;
		mkdirSync(dirname(target), { recursive: true });
		writeFileSync(target, body);
		written++;
		i = start + csize;
	}
	return written;
}
const LOCAL_HEADER = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

function hasFfmpeg() {
	try {
		execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
		return true;
	} catch {
		return false;
	}
}

function buildSfx(outDir, sounds) {
	mkdirSync(outDir, { recursive: true });
	const ffmpeg = hasFfmpeg();
	for (const [name, src] of Object.entries(sounds)) {
		const from = join(SRC, src);
		copyFileSync(from, join(outDir, `${name}.ogg`));
		if (ffmpeg) {
			execFileSync('ffmpeg', [
				'-y',
				'-loglevel',
				'error',
				'-i',
				from,
				'-c:a',
				'aac',
				'-b:a',
				'96k',
				join(outDir, `${name}.m4a`)
			]);
		}
	}
	const formats = ffmpeg ? ['m4a', 'ogg'] : ['ogg'];
	writeFileSync(
		join(outDir, 'index.json'),
		JSON.stringify({ formats, sounds: Object.keys(sounds) }, null, '\t') + '\n'
	);
	if (!ffmpeg) console.warn(`! ffmpeg not found: ${outDir} has .ogg only (silent on iOS < 18.4)`);
}

// ---- Block Drop ----------------------------------------------------------------------------

function blockDrop() {
	const out = join(OUT, 'block-drop');
	// Sound names are what the game code plays; swap sources here to retune the feel.
	buildSfx(join(out, 'sfx'), {
		pickup: 'interface-sounds/Audio/select_001.ogg',
		place: 'interface-sounds/Audio/drop_002.ogg',
		return: 'interface-sounds/Audio/minimize_003.ogg',
		clear: 'interface-sounds/Audio/glass_001.ogg',
		boardClear: 'interface-sounds/Audio/confirmation_004.ogg',
		deal: 'interface-sounds/Audio/maximize_004.ogg',
		gameOver: 'interface-sounds/Audio/bong_001.ogg'
	});
	console.log('block-drop assets written');
}

// ---- Hoop Flick ----------------------------------------------------------------------------
// Art is drawn in code; sounds only.

function hoopFlick() {
	const out = join(OUT, 'hoop-flick');
	buildSfx(join(out, 'sfx'), {
		throw: 'impact-sounds/Audio/impactSoft_medium_001.ogg',
		rim: 'impact-sounds/Audio/impactMetal_light_002.ogg',
		board: 'impact-sounds/Audio/impactPlank_medium_000.ogg',
		bounce: 'impact-sounds/Audio/impactSoft_heavy_001.ogg',
		net: 'interface-sounds/Audio/scratch_002.ogg',
		score: 'interface-sounds/Audio/confirmation_001.ogg',
		swish: 'interface-sounds/Audio/confirmation_003.ogg',
		fire: 'interface-sounds/Audio/maximize_006.ogg',
		level: 'interface-sounds/Audio/maximize_008.ogg',
		tick: 'interface-sounds/Audio/tick_002.ogg',
		buzzer: 'interface-sounds/Audio/bong_001.ogg'
	});
	console.log('hoop-flick assets written');
}

// ---- Rail Dash -------------------------------------------------------------------------------
// Train Kit GLBs (they share one colormap texture) and the animated character, converted from
// FBX, plus City Kit (Commercial) buildings along the track.

export const RAIL_DASH_MODELS = [
	'train-electric-city-a',
	'train-electric-city-b',
	'train-electric-city-c',
	'train-electric-subway-a',
	'train-electric-subway-b',
	'train-electric-subway-c',
	'train-diesel-a',
	'train-diesel-b',
	'train-diesel-c',
	'railroad-straight'
];
export const RAIL_DASH_BUILDINGS = 'abcdefgh'.split('').map((c) => `building-${c}`);
const RAIL_DASH_SKINS = ['skaterFemaleA', 'skaterMaleA', 'cyborgFemaleA'];

async function railDash() {
	const out = join(OUT, 'rail-dash');
	const models = join(out, 'models');
	const kit = join(SRC, 'train-kit/Models/GLB format');
	if (existsSync(kit)) {
		mkdirSync(join(models, 'Textures'), { recursive: true });
		for (const m of RAIL_DASH_MODELS) copyFileSync(join(kit, `${m}.glb`), join(models, `${m}.glb`));
		copyFileSync(join(kit, 'Textures/colormap.png'), join(models, 'Textures/colormap.png'));
	} else {
		console.warn('! train-kit not found: Rail Dash models missing');
	}

	// City Kit buildings have their own colormap, so they live in their own folder.
	const city = join(SRC, 'city-kit-commercial/Models/GLB format');
	if (existsSync(city)) {
		mkdirSync(join(models, 'city/Textures'), { recursive: true });
		for (const b of RAIL_DASH_BUILDINGS)
			copyFileSync(join(city, `${b}.glb`), join(models, 'city', `${b}.glb`));
		copyFileSync(join(city, 'Textures/colormap.png'), join(models, 'city/Textures/colormap.png'));
	} else {
		console.warn('! city-kit-commercial not found: Rail Dash buildings missing');
	}

	const chars = join(SRC, 'animated-characters-protagonists');
	if (existsSync(chars)) {
		const { fbxToGlb } = await import('./fbx-to-glb.mjs');
		const anim = (n) => join(chars, 'Animations', `${n}.fbx`);
		const r = await fbxToGlb(
			join(chars, 'Model/characterMedium.fbx'),
			join(models, 'character.glb'),
			{
				idle: anim('idle'),
				run: anim('run'),
				jump: anim('jump')
			}
		);
		mkdirSync(join(out, 'skins'), { recursive: true });
		for (const skin of RAIL_DASH_SKINS) {
			copyFileSync(join(chars, 'Skins', `${skin}.png`), join(out, 'skins', `${skin}.png`));
		}
		console.log(`rail-dash character: ${r.bytes} bytes, ${r.clips.join(', ')}`);
	} else {
		console.warn('! animated-characters-protagonists not found: Rail Dash character missing');
	}

	buildSfx(join(out, 'sfx'), {
		coin: 'interface-sounds/Audio/select_003.ogg',
		jump: 'interface-sounds/Audio/maximize_002.ogg',
		land: 'impact-sounds/Audio/footstep_concrete_001.ogg',
		slide: 'interface-sounds/Audio/scroll_002.ogg',
		lane: 'impact-sounds/Audio/footstep_carpet_000.ogg',
		stumble: 'impact-sounds/Audio/impactPunch_medium_000.ogg',
		crash: 'impact-sounds/Audio/impactMetal_heavy_001.ogg',
		warn: 'interface-sounds/Audio/error_004.ogg',
		tier: 'interface-sounds/Audio/confirmation_004.ogg'
	});
	console.log('rail-dash assets written');
}

// ---- Web Slinger -------------------------------------------------------------------------------
// Scenery drawn in code; characters rendered from the Kenney 3D model; sounds.

function webSlinger() {
	buildSfx(join(OUT, 'web-slinger', 'sfx'), {
		web: 'interface-sounds/Audio/switch_002.ogg',
		whoosh: 'interface-sounds/Audio/scroll_003.ogg',
		land: 'impact-sounds/Audio/footstep_concrete_002.ogg',
		coin: 'interface-sounds/Audio/select_003.ogg',
		caught: 'interface-sounds/Audio/confirmation_002.ogg',
		throw: 'interface-sounds/Audio/scroll_001.ogg',
		splash: 'impact-sounds/Audio/impactSoft_medium_002.ogg',
		oops: 'interface-sounds/Audio/error_005.ogg',
		complete: 'interface-sounds/Audio/confirmation_004.ogg',
		gameOver: 'interface-sounds/Audio/bong_001.ogg',
		smash: 'impact-sounds/Audio/impactWood_medium_002.ogg'
	});
	// Characters: rendered from the 3D model into a sprite sheet (needs the test browser).
	try {
		execFileSync('node', ['scripts/render-sprites.mjs'], { stdio: 'inherit' });
	} catch {
		console.warn('! could not render Web Slinger characters (run `pnpm test:e2e:install`?)');
	}
	console.log('web-slinger assets written');
}

// ---- Goal ------------------------------------------------------------------------------------
// Everything drawn in code; sounds only.

function goal() {
	buildSfx(join(OUT, 'goal', 'sfx'), {
		kick: 'impact-sounds/Audio/impactSoft_heavy_002.ogg',
		thud: 'impact-sounds/Audio/impactWood_light_001.ogg',
		post: 'impact-sounds/Audio/impactMetal_light_002.ogg',
		net: 'interface-sounds/Audio/scratch_002.ogg',
		bush: 'impact-sounds/Audio/footstep_grass_001.ogg',
		bonk: 'impact-sounds/Audio/impactPunch_medium_001.ogg',
		goal: 'interface-sounds/Audio/confirmation_004.ogg',
		taken: 'interface-sounds/Audio/error_005.ogg',
		level: 'interface-sounds/Audio/maximize_008.ogg',
		gameOver: 'interface-sounds/Audio/bong_001.ogg'
	});
	console.log('goal assets written');
}

extractAll();
blockDrop();
hoopFlick();
await railDash();
webSlinger();
goal();
dedupeSounds(OUT);
