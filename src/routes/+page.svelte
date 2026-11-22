<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { games } from '#lib/games/registry.ts';
	import { getBest } from '#lib/kit/scores.ts';
	import { t } from '#lib/strings.ts';

	let bests = $state<Record<string, number>>({});

	onMount(() => {
		bests = Object.fromEntries(games.map((g) => [g.id, getBest(g.id)]));
	});
</script>

<svelte:head>
	<title>{t.appName}</title>
</svelte:head>

<main class="page">
	<header class="topbar">
		<div class="brand">
			<h1>{t.appName}</h1>
			<p>{t.tagline}</p>
		</div>
		<a class="btn icon" href={resolve('/settings')} aria-label={t.settings}>⚙︎</a>
	</header>

	<ul class="grid">
		{#each games as g (g.id)}
			<li>
				{#if g.status === 'ready'}
					<a class="card" href={resolve('/play/[game]', { game: g.id })} style:--card={g.color}>
						<span class="title">{g.title}</span>
						<span class="blurb">{g.blurb}</span>
						{#if bests[g.id]}<span class="best">{t.best}: {bests[g.id]}</span>{/if}
					</a>
				{:else}
					<div class="card soon" style:--card={g.color} aria-disabled="true">
						<span class="title">{g.title}</span>
						<span class="blurb">{t.comingSoon}</span>
					</div>
				{/if}
			</li>
		{/each}
	</ul>

	<footer>
		<a href={resolve('/parents')}>{t.forParents}</a>
		<a href={resolve('/credits')}>{t.credits}</a>
	</footer>
</main>

<style>
	.brand {
		flex: 1;
	}
	.brand h1 {
		font-size: 40px;
		font-weight: 900;
	}
	.brand p {
		margin: 4px 0 0;
		color: var(--c-muted);
	}
	.icon {
		display: grid;
		place-items: center;
		width: var(--tap);
		padding: 0;
		font-size: 28px;
		text-decoration: none;
	}
	.grid {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
		gap: 14px;
	}
	.card {
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		gap: 4px;
		aspect-ratio: 1;
		padding: 16px;
		border-radius: 26px;
		background: linear-gradient(160deg, var(--card), color-mix(in srgb, var(--card) 60%, black));
		color: #1a1433;
		text-decoration: none;
		box-shadow: 0 6px 0 color-mix(in srgb, var(--card) 50%, black);
		transition: transform 80ms ease;
	}
	.card:active {
		transform: translateY(3px);
	}
	.title {
		font-size: 22px;
		font-weight: 900;
	}
	.blurb,
	.best {
		font-size: 14px;
		font-weight: 700;
		opacity: 0.85;
	}
	.soon {
		opacity: 0.45;
		filter: grayscale(0.4);
	}
	footer {
		display: flex;
		justify-content: center;
		gap: 24px;
		margin-top: 32px;
	}
	footer a {
		color: var(--c-muted);
		font-weight: 700;
		padding: 12px 4px;
	}
</style>
