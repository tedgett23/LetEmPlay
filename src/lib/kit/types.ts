// The contract every game implements. The shell owns everything outside the
// game's container; the game owns its canvas.
import type { AudioService } from './audio';
import type { GameStorage } from './storage';
import type { HapticsService } from './haptics';
import type { GlobalSettings } from './settings.svelte';

export type GameId =
	'block-drop' | 'hoop-flick' | 'rail-dash' | 'web-slinger' | 'goal' | 'doodle-cove';

export interface GameResult {
	score: number;
	isHighScore: boolean;
}

export interface GameContext {
	/** Aborted when this load attempt ends, including navigation and failed setup. */
	signal: AbortSignal;
	/** The game creates its own canvas inside this element. */
	container: HTMLElement;
	/** Respects global mute settings. */
	audio: AudioService;
	/** Pre-namespaced to this game's id. */
	storage: GameStorage;
	haptics: HapticsService;
	settings: Readonly<GlobalSettings>;
	events: {
		onScore(score: number): void;
		/** Call once per run. The shell records the high score and shows GameOver. */
		onGameOver(result: { score: number }): void;
		/** The game's own pause button was pressed → shell shows PauseMenu. */
		onRequestPause(): void;
	};
}

export interface GameInstance {
	/**
	 * Begin a run. Fresh by default (Play / Restart / Play again). With `continueSaved`, resume
	 * the saved in-progress run instead (only called when hasSavedRun() is true).
	 */
	start(opts?: { continueSaved?: boolean }): void;
	/**
	 * Resolves once the game can take input (canvas built, listeners attached). The shell
	 * waits for it before showing Play/Continue, so a fast first tap is never lost.
	 */
	ready?: Promise<void>;
	/** True if there's a saved in-progress run. The shell then offers "Continue". */
	hasSavedRun?(): boolean;
	/** Stop the loop and mute game audio. Must be idempotent. */
	pause(): void;
	resume(): void;
	/** Free GPU resources, listeners, audio. Must not leak. */
	destroy(): void;
}

export interface GameDefinition {
	id: GameId;
	/** Logical (design) resolution; the kit letterboxes it into the container. */
	logicalSize: { width: number; height: number };
	orientation: 'portrait';
	/** Download/decode assets. Called before create(). */
	preload(
		ctx: Pick<GameContext, 'audio' | 'signal'>,
		onProgress: (p: number) => void
	): Promise<void>;
	create(ctx: GameContext): GameInstance;
}
