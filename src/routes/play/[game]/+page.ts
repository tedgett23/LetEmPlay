import { error } from '@sveltejs/kit';
import { getGame, playableIds } from '#lib/games/registry.ts';
import type { EntryGenerator, PageLoad } from './$types';

// Tell the prerenderer which game pages exist.
export const entries: EntryGenerator = () => playableIds.map((game) => ({ game }));

export const load: PageLoad = ({ params }) => {
	const entry = getGame(params.game);
	if (!entry || entry.status !== 'ready') error(404, 'Game not found');
	return { id: entry.id, title: entry.title };
};
