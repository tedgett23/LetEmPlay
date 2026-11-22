// Asset pipeline (MVP.md §9). Turns the Kenney source packs in assets-src/ into the
// files the games load from static/assets/. Run: pnpm assets
//
// - Extracts each assets-src/kenney/*.zip (needs the `unzip` CLI) if not already extracted.
// - Converts Kenney's XML spritesheet index into PixiJS spritesheet JSON.
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
	writeFileSync
} from 'node:fs';
import { join } from 'node:path';

const SRC = 'assets-src/kenney';
const OUT = 'static/assets';

function extractAll() {
	for (const zip of readdirSync(SRC).filter((f) => f.endsWith('.zip'))) {
		const dir = join(SRC, zip.replace(/^kenney_/, '').replace(/\.zip$/, ''));
		if (existsSync(dir)) continue;
		mkdirSync(dir, { recursive: true });
		execFileSync('unzip', ['-q', '-o', join(SRC, zip), '-d', dir]);
		console.log(`extracted ${zip}`);
	}
}

/** Kenney <TextureAtlas> XML → PixiJS spritesheet JSON. */
function kenneyXmlToPixi(xml, imageName) {
	const frames = {};
	for (const m of xml.matchAll(
		/<SubTexture name="([^"]+)" x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)"\s*\/>/g
	)) {
		const [, name, x, y, w, h] = m;
		const key = name.replace(/\.png$/, '');
		const rect = { x: +x, y: +y, w: +w, h: +h };
		frames[key] = {
			frame: rect,
			rotated: false,
			trimmed: false,
			spriteSourceSize: { x: 0, y: 0, w: rect.w, h: rect.h },
			sourceSize: { w: rect.w, h: rect.h }
		};
	}
	return { frames, meta: { image: imageName, format: 'RGBA8888', scale: '1' } };
}

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
	mkdirSync(out, { recursive: true });
	const sheet = join(SRC, 'puzzle-pack-1/Spritesheet');
	copyFileSync(join(sheet, 'spritesheet_double.png'), join(out, 'puzzle.png'));
	const xml = readFileSync(join(sheet, 'spritesheet_double.xml'), 'utf8');
	writeFileSync(join(out, 'puzzle.json'), JSON.stringify(kenneyXmlToPixi(xml, 'puzzle.png')));

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
// Art is drawn in code (the Sports Pack's balls are 18 px, too small to scale up); sounds only.

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

extractAll();
blockDrop();
hoopFlick();
