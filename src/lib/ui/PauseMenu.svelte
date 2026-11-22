<script lang="ts">
	import Overlay from './Overlay.svelte';
	import { t } from '../strings';

	let {
		onResume,
		onRestart,
		onHome
	}: { onResume: () => void; onRestart: () => void; onHome: () => void } = $props();
</script>

<Overlay label={t.paused}>
	<h2>{t.paused}</h2>
	<button class="btn btn-primary" onclick={onResume}>{t.resume}</button>
	<button class="btn" onclick={onRestart}>{t.restart}</button>
	<button class="btn" onclick={onHome}>{t.home}</button>
</Overlay>
