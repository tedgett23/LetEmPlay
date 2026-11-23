// Global settings. Reactive via Svelte runes, persisted locally.
import { createStorage } from './storage';

export interface GlobalSettings {
	sound: boolean;
	music: boolean;
	haptics: boolean;
	reducedMotion: boolean;
}

const DEFAULTS: GlobalSettings = {
	sound: true,
	music: true,
	haptics: true,
	reducedMotion: false
};

const store = createStorage('settings');

function prefersReducedMotion(): boolean {
	try {
		return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
	} catch {
		return false;
	}
}

export const settings: GlobalSettings = $state({ ...DEFAULTS });

/** Load saved settings. Call once in the browser (root layout onMount). */
export function loadSettings(): void {
	const saved = store.get<Partial<GlobalSettings>>('global', {});
	Object.assign(settings, DEFAULTS, { reducedMotion: prefersReducedMotion() }, saved);
}

export function updateSettings(patch: Partial<GlobalSettings>): void {
	Object.assign(settings, patch);
	store.set('global', { ...settings });
}

export function resetSettings(): void {
	Object.assign(settings, DEFAULTS);
}
