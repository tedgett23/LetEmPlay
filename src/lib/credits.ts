// Mirrors CREDITS.md. Shown as plain text in-app — never as links (MVP.md §2.3).
export interface Credit {
	pack: string;
	author: string;
	license: string;
	usedIn: string;
}

export const credits: Credit[] = [
	{ pack: 'Puzzle Pack', author: 'Kenney', license: 'CC0 1.0', usedIn: 'Block Drop' },
	{
		pack: 'Interface Sounds',
		author: 'Kenney',
		license: 'CC0 1.0',
		usedIn: 'Block Drop, Hoop Flick, Rail Dash'
	},
	{ pack: 'Impact Sounds', author: 'Kenney', license: 'CC0 1.0', usedIn: 'Hoop Flick, Rail Dash' },
	{ pack: 'Train Kit', author: 'Kenney', license: 'CC0 1.0', usedIn: 'Rail Dash' },
	{ pack: 'City Kit (Commercial)', author: 'Kenney', license: 'CC0 1.0', usedIn: 'Rail Dash' },
	{
		pack: 'Animated Characters: Protagonists',
		author: 'Kenney',
		license: 'CC0 1.0',
		usedIn: 'Rail Dash'
	}
];
