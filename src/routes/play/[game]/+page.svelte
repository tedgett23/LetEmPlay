<script lang="ts">
	// Hosts one game. The shell owns overlays, lifecycle and navigation;
	// the game owns its canvas inside `container`.
	import { onMount } from 'svelte';
	import { beforeNavigate, goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { getGame } from '#lib/games/registry.ts';
	import { settings } from '#lib/kit/settings.svelte.ts';
	import { getAudio, getHaptics } from '#lib/kit/services.ts';
	import { createStorage, requestPersistence } from '#lib/kit/storage.ts';
	import { getBest, recordScore } from '#lib/kit/scores.ts';
	import { shouldPromptRotate } from '#lib/kit/viewport.ts';
	import type { GameInstance } from '#lib/kit/types.ts';
	import PauseMenu from '#lib/ui/PauseMenu.svelte';
	import GameOver from '#lib/ui/GameOver.svelte';
	import RotatePrompt from '#lib/ui/RotatePrompt.svelte';
	import Overlay from '#lib/ui/Overlay.svelte';
	import { t } from '#lib/strings.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	type Phase = 'loading' | 'title' | 'playing' | 'paused' | 'over';
	let phase = $state<Phase>('loading');
	let progress = $state(0);
	let best = $state(0);
	let result = $state({ score: 0, isNewBest: false });
	let rotate = $state(false);
	let container: HTMLDivElement;
	let game: GameInstance | null = null;
	let leaving = false;

	let canContinue = $state(false);
	let score = $state(0);

	function play() {
		game?.start();
		phase = 'playing';
	}
	function continueRun() {
		game?.start({ continueSaved: true });
		phase = 'playing';
	}
	function pause() {
		if (phase !== 'playing') return;
		game?.pause();
		phase = 'paused';
	}
	function resume() {
		if (rotate) return;
		game?.resume();
		phase = 'playing';
	}
	function home() {
		leaving = true;
		void goto(resolve('/'));
	}

	// Back gesture / browser back pauses instead of leaving mid-run.
	beforeNavigate((nav) => {
		if (!leaving && phase === 'playing') {
			nav.cancel();
			pause();
		}
	});

	onMount(() => {
		const entry = getGame(data.id)!;
		const audio = getAudio();
		const haptics = getHaptics();
		best = getBest(entry.id);
		let destroyed = false;

		void (async () => {
			const def = await entry.load();
			await def.preload({ audio }, (p) => (progress = p));
			if (destroyed) return;
			game = def.create({
				container,
				audio,
				haptics,
				settings,
				storage: createStorage(entry.id),
				events: {
					onScore(s) {
						score = s;
					},
					onGameOver({ score }) {
						const isNewBest = recordScore(entry.id, score);
						best = getBest(entry.id);
						result = { score, isNewBest };
						phase = 'over';
						requestPersistence();
					},
					onRequestPause: pause
				}
			});
			await game.ready;
			if (destroyed) return;
			canContinue = game.hasSavedRun?.() ?? false;
			phase = 'title';
		})();

		const onVisibility = () => {
			if (document.hidden) {
				pause();
				audio.suspend();
			} else {
				audio.resume();
			}
		};
		const onResize = () => {
			rotate = shouldPromptRotate({ width: innerWidth, height: innerHeight });
			if (rotate) pause();
		};
		onResize();
		document.addEventListener('visibilitychange', onVisibility);
		window.addEventListener('pagehide', pause);
		window.addEventListener('resize', onResize);

		return () => {
			destroyed = true;
			document.removeEventListener('visibilitychange', onVisibility);
			window.removeEventListener('pagehide', pause);
			window.removeEventListener('resize', onResize);
			game?.destroy();
			game = null;
			audio.unloadAll();
		};
	});
</script>

<svelte:head>
	<title>{data.title} · {t.appName}</title>
</svelte:head>

<div class="host" data-phase={phase} data-score={score}>
	<div class="stage" bind:this={container}></div>

	{#if phase === 'loading'}
		<Overlay label={t.loading}>
			<h2>{data.title}</h2>
			<progress max="1" value={progress}>{t.loading}</progress>
		</Overlay>
	{:else if phase === 'title'}
		<Overlay label={data.title}>
			<h2>{data.title}</h2>
			{#if best}<p>{t.best}: {best}</p>{/if}
			{#if canContinue}
				<button class="btn btn-primary big" onclick={continueRun}>{t.continue}</button>
				<button class="btn" onclick={play}>{t.newGame}</button>
			{:else}
				<button class="btn btn-primary big" onclick={play}>{t.play}</button>
			{/if}
			<button class="btn" onclick={home}>{t.home}</button>
		</Overlay>
	{:else if phase === 'paused'}
		<PauseMenu onResume={resume} onRestart={play} onHome={home} />
	{:else if phase === 'over'}
		<GameOver
			score={result.score}
			{best}
			isNewBest={result.isNewBest}
			onAgain={play}
			onHome={home}
		/>
	{/if}

	{#if rotate}<RotatePrompt />{/if}
</div>

<style>
	.host {
		position: fixed;
		inset: 0;
		padding: var(--safe-top) var(--safe-right) var(--safe-bottom) var(--safe-left);
		background: var(--c-bg-deep);
		touch-action: none;
		overscroll-behavior: none;
	}
	.stage {
		position: relative;
		width: 100%;
		height: 100%;
		touch-action: none;
	}
	.big {
		font-size: 28px;
		min-height: 72px;
	}
	progress {
		width: 100%;
		height: 14px;
		accent-color: var(--c-green);
	}
</style>
