// The list of games shown on the home screen. Each game is lazy-loaded as its own chunk.
import type { GameDefinition, GameId } from '../kit/types';
import { doodle, goal } from '../strings';

export interface GameEntry {
	id: GameId;
	title: string;
	blurb: string;
	/** CSS color for the home card. */
	color: string;
	status: 'ready' | 'coming-soon';
	load: () => Promise<GameDefinition>;
}

export const games: GameEntry[] = [
	{
		id: 'block-drop',
		title: 'Block Drop',
		blurb: 'Fit the blocks, clear the lines',
		color: '#ffc83d',
		status: 'ready',
		load: () => import('./block-drop').then((m) => m.default)
	},
	{
		id: 'hoop-flick',
		title: 'Hoop Flick',
		blurb: 'Flick to shoot hoops',
		color: '#ff9f43',
		status: 'ready',
		load: () => import('./hoop-flick').then((m) => m.default)
	},
	{
		id: 'rail-dash',
		title: 'Rail Dash',
		blurb: 'Dash, jump and dodge',
		color: '#4cc9f0',
		status: 'ready',
		load: () => import('./rail-dash').then((m) => m.default)
	},
	{
		id: 'web-slinger',
		title: 'Web Slinger',
		blurb: 'Swing and catch the robbers',
		color: '#3dd68c',
		status: 'ready',
		load: () => import('./web-slinger').then((m) => m.default)
	},
	{
		id: 'goal',
		title: goal.title,
		blurb: goal.blurb,
		color: '#9be15d',
		status: 'ready',
		load: () => import('./goal').then((m) => m.default)
	},
	{
		id: 'doodle-cove',
		title: doodle.title,
		blurb: doodle.blurb,
		color: '#ffa9c5',
		status: 'ready',
		load: () => import('./doodle-cove').then((m) => m.default)
	}
];

export const playableIds = games.filter((g) => g.status === 'ready').map((g) => g.id);

export function getGame(id: string): GameEntry | undefined {
	return games.find((g) => g.id === id);
}
