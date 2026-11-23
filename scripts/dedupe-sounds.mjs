import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

// Keep game-local sound names, but precache only one copy of each identical set of encodings.
export function dedupeSounds(root) {
	const seen = new Map();
	for (const game of readdirSync(root).sort()) {
		const dir = join(root, game, 'sfx');
		const file = join(dir, 'index.json');
		const index = JSON.parse(readFileSync(file, 'utf8'));
		for (const name of index.sounds) {
			if (index.aliases?.[name]) continue;
			const base = join(dir, name);
			const paths = index.formats.map((fmt) => `${base}.${fmt}`);
			const key = paths
				.map((p) => createHash('sha256').update(readFileSync(p)).digest('hex'))
				.join(':');
			const original = seen.get(key);
			if (original) {
				(index.aliases ??= {})[name] = relative(dir, original).split(sep).join('/');
				for (const p of paths) rmSync(p);
			} else seen.set(key, base);
		}
		writeFileSync(file, JSON.stringify(index, null, '\t') + '\n');
	}
}
