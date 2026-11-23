// Release checks on the production build. Run after `pnpm build`:
//   pnpm release-check
// - JS budgets (gzipped): shell, and each game's own chunk graph
// - offline download (precache) size
// - every page carries the CSP, with no 'unsafe-eval' and no third-party sources
// - no outbound links in any page
// - every URL string in shipped files belongs to a short reviewed allowlist (none are fetched;
//   the E2E privacy test proves no request leaves the origin)
// - the web manifest's icons exist and have the sizes they claim
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';

const BUILD = 'build';
const MANIFEST = '.svelte-kit/output/client/.vite/manifest.json';
const KB = 1024;
const BUDGETS = {
	shell: 80 * KB,
	'block-drop': 250 * KB,
	'hoop-flick': 300 * KB,
	'rail-dash': 350 * KB,
	'web-slinger': 250 * KB
};
const PRECACHE_BUDGET = 25 * KB * KB;
/** Hosts that appear only as text: error-help links, XML namespaces, a console banner. */
const URL_ALLOWLIST = new Set(['svelte.dev', 'www.w3.org', 'www.pixijs.com']);

const failures = [];
const fail = (msg) => failures.push(msg);
const rows = [];

function walk(dir) {
	return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
		e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]
	);
}
const gz = (file) => gzipSync(readFileSync(join(BUILD, file)), { level: 9 }).length;
const fmt = (n) => (n >= KB * KB ? `${(n / KB / KB).toFixed(1)} MB` : `${(n / KB).toFixed(0)} KB`);

// ---- JS budgets ------------------------------------------------------------------------------

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
function closure(keys, withDynamic) {
	const seen = new Set();
	const stack = [...keys];
	while (stack.length) {
		const k = stack.pop();
		if (seen.has(k) || !manifest[k]) continue;
		seen.add(k);
		stack.push(...(manifest[k].imports ?? []));
		if (withDynamic) stack.push(...(manifest[k].dynamicImports ?? []));
	}
	return seen;
}
const gameKey = (id) => `src/lib/games/${id}/index.ts`;
const games = Object.keys(BUDGETS).filter((k) => k !== 'shell');

// Shell: the entries plus every route node, but none of the games' own code.
const entries = Object.keys(manifest).filter((k) => manifest[k].isEntry);
const nodes = Object.keys(manifest).filter((k) => /\/nodes\/\d+\.js$/.test(k));
const shell = closure([...entries, ...nodes], false);
for (const g of games) shell.delete(gameKey(g));

const sizeOf = (keys) => {
	const files = new Set([...keys].map((k) => manifest[k].file));
	let total = 0;
	for (const f of files) total += gz(f);
	return total;
};

const shellSize = sizeOf(shell);
rows.push(['shell JS', shellSize, BUDGETS.shell]);
for (const g of games) {
	// A game's cost: its own chunk graph (including lazily loaded renderer parts), minus the shell.
	const own = [...closure([gameKey(g)], true)].filter((k) => !shell.has(k));
	if (!manifest[gameKey(g)]) fail(`${g}: not found in the build manifest`);
	rows.push([`${g} JS`, sizeOf(own), BUDGETS[g]]);
}

// ---- Precache size -------------------------------------------------------------------------

const files = walk(BUILD).map((f) => relative(BUILD, f));
const precached = files.filter((f) => !f.startsWith('splash/'));
const precacheBytes = precached.reduce((n, f) => n + statSync(join(BUILD, f)).size, 0);
rows.push(['offline download', precacheBytes, PRECACHE_BUDGET]);

for (const [name, size, budget] of rows) {
	const ok = size <= budget;
	if (!ok) fail(`${name} is ${fmt(size)}, over its ${fmt(budget)} budget`);
	console.log(
		`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(18)} ${fmt(size).padStart(7)} / ${fmt(budget)}`
	);
}

// ---- Pages: CSP and links ------------------------------------------------------------------

for (const page of files.filter((f) => f.endsWith('.html'))) {
	const html = readFileSync(join(BUILD, page), 'utf8');
	const csp = html.match(/<meta http-equiv="content-security-policy" content="([^"]+)"/i)?.[1];
	if (!csp) {
		fail(`${page}: no Content-Security-Policy meta tag`);
		continue;
	}
	if (!/default-src 'self'/.test(csp)) fail(`${page}: CSP default-src is not 'self'`);
	if (/unsafe-eval/.test(csp)) fail(`${page}: CSP allows 'unsafe-eval'`);
	if (/https?:/.test(csp)) fail(`${page}: CSP names a remote origin`);
	for (const m of html.matchAll(/<(?:a|link|script|img|iframe)\b[^>]*(?:href|src)="([^"]+)"/gi)) {
		if (/^(?:https?:)?\/\//i.test(m[1])) fail(`${page}: points off-site: ${m[1]}`);
	}
}

// ---- URL strings in shipped text -----------------------------------------------------------

const hosts = new Map();
for (const f of files.filter((f) => /\.(js|html|json|webmanifest|svg|css|txt)$/.test(f))) {
	for (const m of readFileSync(join(BUILD, f), 'utf8').matchAll(/https?:\/\/([a-z0-9.-]+)/gi)) {
		const host = m[1].toLowerCase();
		if (!hosts.has(host)) hosts.set(host, f);
	}
}
for (const [host, file] of hosts) {
	if (!URL_ALLOWLIST.has(host)) fail(`unreviewed URL host "${host}" in ${file}`);
}
console.log(`ok   URL hosts in shipped files: ${[...hosts.keys()].sort().join(', ') || 'none'}`);

// ---- Web manifest icons --------------------------------------------------------------------

const web = JSON.parse(readFileSync(join(BUILD, 'manifest.webmanifest'), 'utf8'));
for (const icon of web.icons) {
	const file = join(BUILD, icon.src.replace(/^\//, ''));
	let png;
	try {
		png = readFileSync(file);
	} catch {
		fail(`manifest icon missing: ${icon.src}`);
		continue;
	}
	const [w, h] = [png.readUInt32BE(16), png.readUInt32BE(20)];
	if (icon.sizes !== `${w}x${h}`) fail(`${icon.src} is ${w}x${h}, manifest says ${icon.sizes}`);
}
console.log(`ok   manifest icons: ${web.icons.map((i) => `${i.sizes} ${i.purpose}`).join(', ')}`);

if (failures.length) {
	console.error(`\n${failures.length} release check(s) failed:\n- ${failures.join('\n- ')}`);
	process.exit(1);
}
console.log('\nall release checks passed');
