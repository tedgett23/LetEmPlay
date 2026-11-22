<script lang="ts">
	import Overlay from './Overlay.svelte';
	import { t } from '../strings';

	let {
		score,
		best,
		isNewBest,
		onAgain,
		onHome
	}: {
		score: number;
		best: number;
		isNewBest: boolean;
		onAgain: () => void;
		onHome: () => void;
	} = $props();
</script>

<Overlay label={t.gameOver}>
	<h2>{isNewBest ? t.newBest : t.gameOver}</h2>
	<p class="score" data-testid="final-score">{score}</p>
	<p class="best">{t.best}: {best}</p>
	<button class="btn btn-primary" onclick={onAgain}>{t.playAgain}</button>
	<button class="btn" onclick={onHome}>{t.home}</button>
</Overlay>

<style>
	.score {
		font-size: 72px;
		font-weight: 900;
		line-height: 1;
		margin: 0;
	}
	.best {
		margin: 0 0 8px;
		opacity: 0.8;
	}
</style>
