// Generates the app's launch art with no image tools beyond Playwright:
//   - app icons (any + maskable + Apple touch + SVG favicon) from one SVG design
//   - iOS launch (splash) screens for current iPhones and iPads
//   - home-screen game thumbnails, screenshotted from the real games in a scripted moment
// Run after `pnpm build`:  pnpm art   (serves build/ on a private port while it works)
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium, devices } from '@playwright/test';

const PORT = 4176;
const ORIGIN = `http://localhost:${PORT}`;
const APP_NAME = 'LetEmPlay';
const BG = '#1d1846';
const BRAND = '#5b4cf0';

// ---- Icon design ---------------------------------------------------------------------------
// Four tiles, one per idea: a block, a basketball, a train face, a star. `pad` shrinks the art
// into the safe zone for maskable icons.
function iconSvg(size, { pad = 0.12, rounded = true } = {}) {
	const s = 100;
	const inner = s * (1 - 2 * pad);
	const o = s * pad;
	const t = inner / 2 - 3; // tile size
	const at = (i, j) => [o + i * (inner / 2) + 1.5, o + j * (inner / 2) + 1.5];
	const [ax, ay] = at(0, 0);
	const [bx, by] = at(1, 0);
	const [cx, cy] = at(0, 1);
	const [dx, dy] = at(1, 1);
	const r = t * 0.22;
	const ball = { x: bx + t / 2, y: by + t / 2, r: t * 0.42 };
	const star = (x, y, R) => {
		const pts = [];
		for (let k = 0; k < 10; k++) {
			const a = -Math.PI / 2 + (k * Math.PI) / 5;
			const rr = k % 2 ? R * 0.45 : R;
			pts.push(`${(x + Math.cos(a) * rr).toFixed(2)},${(y + Math.sin(a) * rr).toFixed(2)}`);
		}
		return pts.join(' ');
	};
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
	<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
		<stop offset="0" stop-color="#6d5ff5"/><stop offset="1" stop-color="${BRAND}"/>
	</linearGradient></defs>
	<rect width="100" height="100" rx="${rounded ? 22 : 0}" fill="url(#g)"/>
	<rect x="${ax}" y="${ay}" width="${t}" height="${t}" rx="${r}" fill="#ffc83d"/>
	<rect x="${ax + t * 0.18}" y="${ay + t * 0.16}" width="${t * 0.64}" height="${t * 0.16}" rx="${t * 0.08}" fill="#fff" opacity=".45"/>
	<rect x="${bx}" y="${by}" width="${t}" height="${t}" rx="${r}" fill="#2b2470"/>
	<circle cx="${ball.x}" cy="${ball.y}" r="${ball.r}" fill="#f28c28"/>
	<g fill="none" stroke="#4a2208" stroke-width="${t * 0.05}" stroke-linecap="round">
		<circle cx="${ball.x}" cy="${ball.y}" r="${ball.r}"/>
		<path d="M${ball.x} ${ball.y - ball.r}V${ball.y + ball.r}M${ball.x - ball.r} ${ball.y}H${ball.x + ball.r}"/>
		<path d="M${ball.x - ball.r * 0.62} ${ball.y - ball.r * 0.78}Q${ball.x - ball.r * 0.15} ${ball.y} ${ball.x - ball.r * 0.62} ${ball.y + ball.r * 0.78}"/>
		<path d="M${ball.x + ball.r * 0.62} ${ball.y - ball.r * 0.78}Q${ball.x + ball.r * 0.15} ${ball.y} ${ball.x + ball.r * 0.62} ${ball.y + ball.r * 0.78}"/>
	</g>
	<rect x="${cx}" y="${cy}" width="${t}" height="${t}" rx="${r}" fill="#4cc9f0"/>
	<rect x="${cx + t * 0.16}" y="${cy + t * 0.18}" width="${t * 0.68}" height="${t * 0.34}" rx="${t * 0.08}" fill="#1d1846"/>
	<circle cx="${cx + t * 0.3}" cy="${cy + t * 0.74}" r="${t * 0.09}" fill="#fff3a0"/>
	<circle cx="${cx + t * 0.7}" cy="${cy + t * 0.74}" r="${t * 0.09}" fill="#fff3a0"/>
	<rect x="${dx}" y="${dy}" width="${t}" height="${t}" rx="${r}" fill="#3dd68c"/>
	<polygon points="${star(dx + t / 2, dy + t * 0.53, t * 0.38)}" fill="#fff"/>
</svg>`;
}

// iOS launch screens: CSS size and pixel ratio per device (portrait only; the app is portrait).
const SPLASH = [
	[375, 667, 2], // iPhone SE 2/3, 8
	[414, 736, 3], // iPhone 8 Plus
	[375, 812, 3], // iPhone X/XS/11 Pro, 12/13 mini (scaled)
	[360, 780, 3], // iPhone 12/13 mini
	[414, 896, 2], // iPhone XR/11
	[414, 896, 3], // iPhone XS Max/11 Pro Max
	[390, 844, 3], // iPhone 12/13/14
	[428, 926, 3], // iPhone 12/13 Pro Max, 14 Plus
	[393, 852, 3], // iPhone 14 Pro, 15, 16
	[430, 932, 3], // iPhone 14 Pro Max, 15 Plus/Pro Max, 16 Plus
	[402, 874, 3], // iPhone 16 Pro
	[440, 956, 3], // iPhone 16 Pro Max
	[744, 1133, 2], // iPad mini 6
	[810, 1080, 2], // iPad 9th gen
	[820, 1180, 2], // iPad 10th gen, Air
	[834, 1194, 2], // iPad Pro 11
	[1024, 1366, 2] // iPad Pro 12.9
];

function splashHtml() {
	return `<!doctype html><html><body style="margin:0;height:100vh;display:grid;place-items:center;background:${BG};
		font-family:ui-rounded,system-ui,sans-serif;color:#fff">
		<div style="display:grid;justify-items:center;gap:22px">
			<div style="width:30vmin;height:30vmin">${iconSvg(512).replace(/width="512" height="512"/, 'width="100%" height="100%"')}</div>
			<div style="font-weight:900;font-size:9vmin;letter-spacing:.02em">${APP_NAME}</div>
		</div></body></html>`;
}

// ---- Game thumbnails -----------------------------------------------------------------------

/** Letterboxed logical (720×1280) → page coordinates, as the games lay themselves out. */
async function toPage(page) {
	const host = await page.locator('.stage').boundingBox();
	const s = Math.min(host.width / 720, host.height / 1280);
	const ox = host.x + (host.width - 720 * s) / 2;
	const oy = host.y + (host.height - 1280 * s) / 2;
	return { s, P: (x, y) => ({ x: ox + x * s, y: oy + y * s }) };
}

async function shoot(page, file, clip) {
	await page.screenshot({ path: file, type: 'jpeg', quality: 82, clip });
}

async function blockDrop(page, out) {
	// A colourful mid-game board, one line short of a clear.
	const board = [];
	for (let y = 0; y < 8; y++) {
		for (let x = 0; x < 8; x++) {
			const filled = y >= 3 && (x + y * 3) % 5 !== 0 && !(y === 7 && x === 7);
			board.push(filled ? 1 + ((x * 7 + y * 3) % 4) : 0);
		}
	}
	const run = {
		board,
		tray: [
			{ pieceId: 'l3a', color: 2 },
			{ pieceId: 't-up', color: 3 },
			{ pieceId: 'o2', color: 4 }
		],
		score: 1240,
		combo: 2,
		rngState: 7,
		over: false
	};
	await page.addInitScript(
		(v) => {
			localStorage.setItem('letemplay:v1:block-drop:run', v);
		},
		JSON.stringify({ v: 1, d: run })
	);
	await page.goto(`${ORIGIN}/play/block-drop`);
	await page.getByRole('button', { name: 'Continue' }).click();
	await page.waitForTimeout(800);
	const { s, P } = await toPage(page);
	const a = P(10, 230);
	await shoot(page, `${out}/block-drop.jpg`, { x: a.x, y: a.y, width: 700 * s, height: 700 * s });
}

async function hoopFlick(page, out) {
	await page.goto(`${ORIGIN}/play/hoop-flick`);
	await page.getByRole('button', { name: 'Play', exact: true }).click();
	await page.waitForTimeout(500);
	const { s, P } = await toPage(page);
	// A perfect flick with exact timestamps (see tests/helpers.ts).
	const cdp = await page.context().newCDPSession(page);
	const t0 = Date.now() / 1000;
	const at = (i) => P(360, 1150 - 2.6 * 16 * i);
	await cdp.send('Input.dispatchTouchEvent', {
		type: 'touchStart',
		touchPoints: [at(0)],
		timestamp: t0
	});
	for (let i = 1; i <= 8; i++) {
		await cdp.send('Input.dispatchTouchEvent', {
			type: 'touchMove',
			touchPoints: [at(i)],
			timestamp: t0 + (16 * i) / 1000
		});
	}
	await cdp.send('Input.dispatchTouchEvent', {
		type: 'touchEnd',
		touchPoints: [],
		timestamp: t0 + 0.129
	});
	await page.waitForTimeout(700); // the ball dropping toward the rim
	const a = P(40, 230);
	await shoot(page, `${out}/hoop-flick.jpg`, { x: a.x, y: a.y, width: 640 * s, height: 640 * s });
}

async function railDash(page, out) {
	await page.addInitScript(() => {
		let t = 3;
		Math.random = () => {
			t = (t + 0x6d2b79f5) >>> 0;
			let r = Math.imul(t ^ (t >>> 15), t | 1);
			r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
			return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
		};
	});
	await page.goto(`${ORIGIN}/play/rail-dash`);
	await page.getByRole('button', { name: 'Play', exact: true }).click();
	// Photo staging only: hide the HUD (score, hint) so the picture is just the game.
	await page.addStyleTag({ content: '.stage > div { visibility: hidden !important; }' });
	await page.waitForTimeout(3400);
	const box = await page.locator('.stage').boundingBox();
	const side = box.width;
	await shoot(page, `${out}/rail-dash.jpg`, {
		x: box.x,
		y: box.y + box.height - side * 1.5,
		width: side,
		height: side
	});
}

async function webSlinger(page, out) {
	// "Two robbers": wait for the level title to clear, then draw a line and photograph the hero
	// with the aim guide (dotted path and target ring).
	await page.addInitScript(() => {
		const run = { v: 1, d: { levelIndex: 4, score: 0, hearts: 3 } };
		localStorage.setItem('letemplay:v1:web-slinger:run', JSON.stringify(run));
	});
	await page.goto(`${ORIGIN}/play/web-slinger`);
	await page.getByRole('button', { name: 'Continue' }).click();
	await page.waitForTimeout(2600);
	const { s, P } = await toPage(page);
	const r = (35 * Math.PI) / 180;
	const from = P(360, 800);
	await page.mouse.move(from.x, from.y);
	await page.mouse.down();
	for (let i = 1; i <= 5; i++) {
		const p = P(360 + Math.cos(r) * 52 * i, 800 - Math.sin(r) * 52 * i);
		await page.mouse.move(p.x, p.y);
	}
	await page.waitForTimeout(200);
	const a = P(0, 540);
	await shoot(page, `${out}/web-slinger.jpg`, { x: a.x, y: a.y, width: 720 * s, height: 720 * s });
	await page.mouse.up();
}

// ---- Main ----------------------------------------------------------------------------------

async function waitForServer() {
	for (let i = 0; i < 100; i++) {
		try {
			if ((await fetch(ORIGIN)).ok) return;
		} catch {
			/* not up yet */
		}
		await new Promise((r) => setTimeout(r, 200));
	}
	throw new Error('preview server did not start');
}

const server = spawn('pnpm', ['exec', 'vite', 'preview', '--port', String(PORT), '--strictPort'], {
	stdio: 'ignore'
});
try {
	await waitForServer();
	const browser = await chromium.launch();

	// Icons.
	mkdirSync('static/icons', { recursive: true });
	writeFileSync('static/icons/favicon.svg', iconSvg(64));
	const iconPage = await browser.newPage();
	const renderIcon = async (file, size, opts) => {
		await iconPage.setViewportSize({ width: size, height: size });
		await iconPage.setContent(
			`<body style="margin:0;background:${opts?.rounded === false ? BRAND : 'transparent'}">${iconSvg(size, opts)}</body>`
		);
		await iconPage.screenshot({ path: file, omitBackground: opts?.rounded !== false });
	};
	await renderIcon('static/icons/icon-192.png', 192);
	await renderIcon('static/icons/icon-512.png', 512);
	// Maskable: full-bleed background, art inside the 80% safe circle.
	await renderIcon('static/icons/icon-maskable-512.png', 512, { pad: 0.2, rounded: false });
	// Apple draws its own rounded corners and dislikes transparency.
	await renderIcon('static/icons/apple-touch-icon.png', 180, { pad: 0.12, rounded: false });
	await iconPage.close();

	// iOS splash screens.
	mkdirSync('static/splash', { recursive: true });
	const links = [];
	for (const [w, h, dpr] of SPLASH) {
		const ctx = await browser.newContext({
			viewport: { width: w, height: h },
			deviceScaleFactor: dpr
		});
		const p = await ctx.newPage();
		await p.setContent(splashHtml());
		const name = `splash-${w * dpr}x${h * dpr}.png`;
		await p.screenshot({ path: `static/splash/${name}` });
		await ctx.close();
		links.push(
			`<link rel="apple-touch-startup-image" media="(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: portrait)" href="%sveltekit.assets%/splash/${name}" />`
		);
	}
	// Write the <link> tags into app.html between its splash markers.
	const html = readFileSync('src/app.html', 'utf8');
	const block = `<!-- splash:start -->\n\t\t${links.join('\n\t\t')}\n\t\t<!-- splash:end -->`;
	if (!html.includes('<!-- splash:start -->'))
		throw new Error('src/app.html has no splash markers');
	writeFileSync(
		'src/app.html',
		html.replace(/<!-- splash:start -->[\s\S]*<!-- splash:end -->/, block)
	);
	// Keep app.html in the project's formatting so `pnpm lint` stays clean.
	execFileSync('pnpm', ['exec', 'prettier', '--write', 'src/app.html'], { stdio: 'ignore' });

	// Game thumbnails, in a phone-shaped browser.
	mkdirSync('static/thumbs', { recursive: true });
	for (const shot of [blockDrop, hoopFlick, railDash, webSlinger]) {
		// 1.5× is plenty for a ~200 px card and keeps each image small.
		const ctx = await browser.newContext({ ...devices['Pixel 7'], deviceScaleFactor: 1.5 });
		const page = await ctx.newPage();
		await shot(page, 'static/thumbs');
		await ctx.close();
	}
	await browser.close();
	console.log('icons, splash screens and thumbnails written');
} finally {
	server.kill();
}
