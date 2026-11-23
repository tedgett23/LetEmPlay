<script lang="ts">
	import { resolve } from '$app/paths';
	import { credits } from '#lib/credits.ts';
	import { t } from '#lib/strings.ts';
</script>

<svelte:head><title>{t.credits} · {t.appName}</title></svelte:head>

<main class="page">
	<header class="topbar">
		<a class="btn" href={resolve('/settings')}>← {t.back}</a>
		<h1>{t.credits}</h1>
	</header>

	{#if credits.length}
		<ul>
			{#each credits as c (c.pack)}
				<li><strong>{c.pack}</strong> by {c.author}. {c.license}. Used in {c.usedIn}.</li>
			{/each}
		</ul>
	{:else}
		<p>Game art and sound credits will be listed here.</p>
	{/if}
	<p>Made with SvelteKit, PixiJS and other open-source software.</p>
</main>
