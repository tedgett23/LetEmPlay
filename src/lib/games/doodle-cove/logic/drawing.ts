export const inks = [
	'#e34757',
	'#fa883b',
	'#ffc940',
	'#82bc48',
	'#17ac96',
	'#44a7ed',
	'#7957c8',
	'#ef82ac',
	'#a36a47',
	'#26354a'
] as const;
export type Brush = 'pen' | 'marker' | 'eraser';
export type Tool = Brush | 'fill';
export type Mark =
	{ tool: Brush; ink: number; points: number[] } | { tool: 'fill'; ink: number; region: number };

// Only accept this page's region IDs and finite coordinates when replaying a saved drawing.
export function readMarks(value: unknown, regions: number): Mark[] {
	if (!Array.isArray(value)) return [];
	for (const item of value as unknown[]) {
		if (!item || typeof item !== 'object') return [];
		const m = item as Partial<Mark>;
		if (typeof m.ink !== 'number' || !Number.isInteger(m.ink) || !inks[m.ink]) return [];
		if (m.tool === 'fill') {
			if (
				!regions ||
				typeof m.region !== 'number' ||
				!Number.isInteger(m.region) ||
				m.region < -1 ||
				m.region >= regions
			)
				return [];
		} else if (
			(m.tool !== 'pen' && m.tool !== 'marker' && m.tool !== 'eraser') ||
			!Array.isArray(m.points) ||
			m.points.length < 2 ||
			m.points.length % 2 ||
			!m.points.every((n) => Number.isSafeInteger(n))
		)
			return [];
	}
	return value as Mark[];
}
