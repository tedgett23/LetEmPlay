import type { GlobalSettings } from './settings.svelte';

export interface HapticsService {
	/** Short tap. No-op where unsupported (e.g. iOS Safari) or when disabled. */
	tap(): void;
	buzz(pattern: number | number[]): void;
}

export function createHaptics(settings: Readonly<GlobalSettings>): HapticsService {
	const vibrate = (p: number | number[]) => {
		if (!settings.haptics) return;
		try {
			navigator.vibrate?.(p);
		} catch {
			/* unsupported */
		}
	};
	return { tap: () => vibrate(10), buzz: vibrate };
}
