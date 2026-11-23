// Keep the asset loader out of games that draw all their art procedurally.
import { Assets } from './pixi';
import { loadSoundSet } from './audio';
import type { GameDefinition } from './types';

/** Serialize transitions on this sheet: an old unload must finish before a new visit loads it. */
export function sheetAndSounds(sheet: string, sounds: string): GameDefinition['preload'] {
	let settled = Promise.resolve();
	return async ({ audio, signal }, onProgress) => {
		let art = 0;
		let sound = 0;
		const report = () => onProgress(art * 0.6 + sound * 0.4);
		const load = settled.then(async () => {
			if (!signal.aborted)
				await Assets.load(sheet, (p) => {
					art = p;
					report();
				});
		});
		settled = load.catch(() => {});
		signal.addEventListener(
			'abort',
			() => {
				settled = settled.then(async () => {
					if (Assets.cache.has(sheet)) await Assets.unload(sheet);
				});
			},
			{ once: true }
		);
		await Promise.all([
			load,
			loadSoundSet(audio, sounds, signal, (p) => {
				sound = p;
				report();
			})
		]);
	};
}
