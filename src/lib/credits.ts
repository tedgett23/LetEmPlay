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
		usedIn: 'Block Drop, Hoop Flick'
	},
	{ pack: 'Impact Sounds', author: 'Kenney', license: 'CC0 1.0', usedIn: 'Hoop Flick' }
];
