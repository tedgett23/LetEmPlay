// Renders Web Slinger's characters from the Kenney animated character (the same model Rail
// Dash uses) into a 2D sprite sheet, so the game stays a light 2D game. Runs Three.js in the
// test browser (Playwright's Chromium), paints custom skins (a teal hero with yellow goggles,
// robbers in striped shirts with eye masks), and poses the model with its own animations.
//   node scripts/render-sprites.mjs        (after `pnpm assets`; writes static/assets/web-slinger/)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';

const OUT = 'static/assets/web-slinger';
const FRAME = 256;
const ROOT = resolve('.');
const files = {
	'/three.module.js': 'node_modules/three/build/three.module.js',
	'/three.core.js': 'node_modules/three/build/three.core.js',
	'/character.glb': 'static/assets/rail-dash/models/character.glb',
	'/skin-hero.png': 'assets-src/kenney/animated-characters-protagonists/Skins/skaterMaleA.png',
	'/skin-robber.png': 'assets-src/kenney/animated-characters-protagonists/Skins/criminalMaleA.png'
};

/** Frames to render: [name, skin, clip, time (s), count over the clip]. */
const FRAMES = [
	['hero-idle', 'hero', 'idle', 0, 4],
	['hero-jump', 'hero', 'jump', 0.22, 1],
	['hero-fly', 'hero', 'run', 0.17, 1],
	['robber-idle', 'robber', 'idle', 0.3, 4],
	['robber-throw', 'robber', 'jump', 0.12, 1]
];

const PAGE = `<!doctype html><html><body style="margin:0;background:transparent">
<canvas id="c" width="${FRAME}" height="${FRAME}"></canvas>
<script type="importmap">{"imports":{"three":"/three.module.js","three/addons/":"/addons/"}}</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

const img = (src) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = src; });

// Paint a custom skin over a Kenney skin (all skins share one UV layout: face and hair top-left,
// shirt bottom-left, shoes and gloves right, trousers bottom-right).
function paint(base, kind) {
	const c = document.createElement('canvas');
	c.width = c.height = 1024;
	const g = c.getContext('2d');
	g.drawImage(base, 0, 0);
	const eyes = () => {
		for (const x of [287, 356]) {
			g.fillStyle = '#ffffff'; g.beginPath(); g.arc(x, 219, 17, 0, Math.PI * 2); g.fill();
			g.fillStyle = '#1d1846'; g.beginPath(); g.arc(x + 4, 220, 8, 0, Math.PI * 2); g.fill();
		}
	};
	if (kind === 'hero') {
		g.fillStyle = '#16a99b'; g.fillRect(0, 490, 611, 534);            // suit
		g.fillStyle = '#0e7b71'; g.fillRect(611, 764, 413, 260);          // trousers
		g.fillStyle = '#16a99b'; g.fillRect(0, 0, 640, 150);              // hood
		g.fillStyle = '#ffc83d'; g.fillRect(200, 190, 240, 58);           // goggle band
		eyes();
		g.fillStyle = '#ffc83d'; g.beginPath();                            // chest star
		for (let k = 0; k < 10; k++) {
			const a = -Math.PI / 2 + (k * Math.PI) / 5, r = k % 2 ? 26 : 60;
			g.lineTo(320 + Math.cos(a) * r, 760 + Math.sin(a) * r);
		}
		g.fill();
		g.fillStyle = '#ffc83d'; g.fillRect(824, 134, 200, 390);          // gloves
	} else {
		g.fillStyle = '#ffffff'; g.fillRect(0, 490, 611, 534);            // shirt…
		g.fillStyle = '#23243a';
		for (let y = 520; y < 1024; y += 70) g.fillRect(0, y, 611, 34);   // …with stripes
		g.fillStyle = '#23243a'; g.fillRect(611, 764, 413, 260);          // trousers
		g.fillStyle = '#23243a'; g.fillRect(0, 0, 640, 165);              // beanie
		g.fillRect(205, 192, 230, 54);                                    // eye mask
		eyes();
	}
	const t = new THREE.CanvasTexture(c);
	t.colorSpace = THREE.SRGBColorSpace;
	t.flipY = true;
	return t;
}

const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('c'), alpha: true, antialias: true, preserveDrawingBuffer: true });
renderer.setClearColor(0x000000, 0);
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xffffff, 0x8899cc, 2.2));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(-3, 5, 4);
scene.add(sun);
// Three-quarter view from the front-left: the character faces screen-right but shows its body.
const cam = new THREE.OrthographicCamera(-1.1, 1.1, 1.1, -1.1, 0.1, 50);
cam.position.set(-6, 1.5, 5.5);
cam.lookAt(0, 0.85, 0);

const gltf = await new GLTFLoader().loadAsync('/character.glb');
const skins = { hero: paint(await img('/skin-hero.png'), 'hero'), robber: paint(await img('/skin-robber.png'), 'robber') };

window.renderFrame = (skin, clipName, time) => {
	const model = clone(gltf.scene);
	const mat = new THREE.MeshLambertMaterial({ map: skins[skin] });
	model.traverse((o) => { if (o.isMesh) o.material = mat; });
	model.updateMatrixWorld(true);
	const box = new THREE.Box3();
	model.traverse((o) => { if (o.isMesh) { o.geometry.computeBoundingBox(); box.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld)); } });
	model.scale.setScalar(1.7 / box.getSize(new THREE.Vector3()).y);
	const mixer = new THREE.AnimationMixer(model);
	const clip = gltf.animations.find((a) => a.name === clipName);
	mixer.clipAction(clip).play();
	mixer.setTime(time);
	scene.add(model);
	renderer.render(scene, cam);
	scene.remove(model);
	return renderer.domElement.toDataURL('image/png');
};
window.clipLength = (name) => gltf.animations.find((a) => a.name === name).duration;
window.ready = true;
</script></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: FRAME, height: FRAME } });
await page.route('http://sprites.local/**', async (route) => {
	const url = new URL(route.request().url());
	if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: PAGE });
	const file = url.pathname.startsWith('/addons/')
		? join('node_modules/three/examples/jsm', url.pathname.slice('/addons/'.length))
		: files[url.pathname];
	if (!file) return route.fulfill({ status: 404 });
	const type = file.endsWith('.js')
		? 'text/javascript'
		: file.endsWith('.png')
			? 'image/png'
			: 'model/gltf-binary';
	return route.fulfill({ contentType: type, body: readFileSync(join(ROOT, file)) });
});
page.on('pageerror', (e) => console.error('page error:', e.message));
await page.goto('http://sprites.local/');
await page.waitForFunction(() => window.ready === true, null, { timeout: 60_000 });

// Render every frame, then pack them into one sheet with Pixi's spritesheet JSON.
const frames = [];
for (const [name, skin, clip, time, count] of FRAMES) {
	const len = await page.evaluate((c) => window.clipLength(c), clip);
	for (let i = 0; i < count; i++) {
		const t = count > 1 ? (len * i) / count : time;
		frames.push({
			name: `${name}-${i}`,
			url: await page.evaluate(([s, c, t]) => window.renderFrame(s, c, t), [skin, clip, t])
		});
	}
}
const cols = 4;
const rows = Math.ceil(frames.length / cols);
const sheet = await page.evaluate(
	async ({ frames, cols, rows, size }) => {
		const c = document.createElement('canvas');
		c.width = cols * size;
		c.height = rows * size;
		const g = c.getContext('2d');
		for (let i = 0; i < frames.length; i++) {
			const im = new Image();
			im.src = frames[i].url;
			await im.decode();
			g.drawImage(im, (i % cols) * size, Math.floor(i / cols) * size);
		}
		return c.toDataURL('image/png');
	},
	{ frames, cols, rows, size: FRAME }
);
await browser.close();

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'characters.png'), Buffer.from(sheet.split(',')[1], 'base64'));
const json = {
	frames: {},
	meta: {
		image: 'characters.png',
		format: 'RGBA8888',
		scale: '1',
		size: { w: cols * FRAME, h: rows * FRAME }
	}
};
frames.forEach((f, i) => {
	const rect = { x: (i % cols) * FRAME, y: Math.floor(i / cols) * FRAME, w: FRAME, h: FRAME };
	json.frames[f.name] = {
		frame: rect,
		rotated: false,
		trimmed: false,
		spriteSourceSize: { x: 0, y: 0, w: FRAME, h: FRAME },
		sourceSize: { w: FRAME, h: FRAME }
	};
});
writeFileSync(join(OUT, 'characters.json'), JSON.stringify(json));
console.log(`web-slinger characters: ${frames.length} frames`);
