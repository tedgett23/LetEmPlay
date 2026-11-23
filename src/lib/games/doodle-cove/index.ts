import { mount, unmount } from 'svelte';
import type { GameDefinition, GameInstance } from '../../kit/types';
import Studio from './Studio.svelte';

const game: GameDefinition = {
	id: 'doodle-cove',
	orientation: 'portrait',
	logicalSize: { width: 400, height: 400 },
	preload: (_, progress) => {
		progress(1);
		return Promise.resolve();
	},
	create(ctx) {
		const props = { storage: ctx.storage, onPause: () => ctx.events.onRequestPause() };
		const studio = mount<typeof props, Pick<GameInstance, 'start' | 'pause' | 'resume'>>(Studio, {
			target: ctx.container,
			props
		});
		return {
			start: () => studio.start(),
			pause: () => studio.pause(),
			resume: () => studio.resume(),
			destroy: () => {
				void unmount(studio);
			}
		};
	}
};
export default game;
