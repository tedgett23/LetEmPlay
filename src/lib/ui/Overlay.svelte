<script lang="ts">
	import type { Snippet } from 'svelte';

	let { children, label }: { children: Snippet; label: string } = $props();
</script>

<div class="overlay" role="dialog" aria-modal="true" aria-label={label}>
	<div class="card">
		{@render children()}
	</div>
</div>

<style>
	.overlay {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		padding: var(--gutter);
		background: rgb(10 8 30 / 0.72);
		z-index: 10;
	}
	.card {
		width: min(100%, 420px);
		display: flex;
		flex-direction: column;
		gap: 14px;
		align-items: stretch;
		text-align: center;
		background: var(--c-surface);
		border-radius: 28px;
		padding: 28px 24px;
		box-shadow: 0 20px 60px rgb(0 0 0 / 0.4);
	}
</style>
