<script lang="ts">
	let { shapes, colors = [] }: { shapes: string[]; colors?: string[] } = $props();
</script>

<svg viewBox="0 0 400 400" aria-hidden="true" width="100%" height="100%">
	<g stroke="#26354a" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round">
		{#each shapes as d, i (i)}<path {d} fill={colors[i % colors.length] ?? 'white'} />{/each}
	</g>
</svg>
