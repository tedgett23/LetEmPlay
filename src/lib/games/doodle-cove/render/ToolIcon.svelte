<script lang="ts">
	import type { Tool } from '../logic/drawing';
	let { tool }: { tool: Tool } = $props();
</script>

<svg
	width="22"
	height="22"
	viewBox="0 0 24 24"
	aria-hidden="true"
	fill="none"
	stroke="currentColor"
	stroke-width="1.9"
	stroke-linecap="round"
	stroke-linejoin="round"
>
	{#if tool === 'pen'}<path d="m4 20 1-6L16 3q1-1 2 0l3 3q1 1 0 2L10 19Zm2-7 5 5m3-13 5 5" />
	{:else if tool === 'marker'}<path
			d="m3 21 2-6 3-2-1-1L17 2l6 6-10 10-1-1-3 3Zm4-9 6 6m1-13 6 6"
		/>
	{:else if tool === 'eraser'}<path d="M3 14 14 3q1-1 2 0l5 5q1 1 0 2L11 21H9Zm4-4 8 8m-4 3h10" />
	{:else}<path d="m2 13 9-9 9 9-8 8H9Zm3-2h13M7 3l6 7m7 6q-4 5 0 6 4-1 0-6Z" />{/if}
</svg>
