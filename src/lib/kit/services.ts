// App-wide singletons. One AudioContext for the whole app (browsers cap how many may exist).
import { createAudio, type AudioService } from './audio';
import { createHaptics, type HapticsService } from './haptics';
import { settings } from './settings.svelte';

let audio: AudioService | null = null;
let haptics: HapticsService | null = null;

export function getAudio(): AudioService {
	return (audio ??= createAudio(settings));
}

export function getHaptics(): HapticsService {
	return (haptics ??= createHaptics(settings));
}
