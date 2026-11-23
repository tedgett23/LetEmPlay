<script lang="ts">
	import { resolve } from '$app/paths';
	import { version } from '$app/env';
	import { t } from '#lib/strings.ts';
</script>

<svelte:head><title>{t.forParents} · {t.appName}</title></svelte:head>

<main class="page prose">
	<header class="topbar">
		<a class="btn" href={resolve('/settings')}>← {t.back}</a>
		<h1>{t.forParents}</h1>
	</header>

	<h2>Our promise</h2>
	<ul>
		<li><strong>No ads.</strong> No pop-ups, no "try this other game", no "download our app".</li>
		<li><strong>No purchases.</strong> Everything is free and fully unlocked for everyone.</li>
		<li><strong>No accounts.</strong> Nobody signs up or logs in.</li>
		<li>
			<strong>No data collected.</strong> No analytics or tracking. Scores and settings stay on this device
			and are never sent anywhere.
		</li>
		<li><strong>No links out.</strong> Kids can't tap their way to another website.</li>
		<li><strong>Works offline</strong> after the first visit, including in airplane mode.</li>
	</ul>

	<h2>Install it like an app</h2>
	<p>Installing keeps high scores safe and opens the games full screen.</p>
	<h3>iPhone or iPad (Safari)</h3>
	<ol>
		<li>Tap the Share button (the square with an arrow).</li>
		<li>Choose <strong>Add to Home Screen</strong>.</li>
	</ol>
	<h3>Android (Chrome)</h3>
	<ol>
		<li>Tap the ⋮ menu.</li>
		<li>Choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li>
	</ol>
	<p class="note">
		On iPhone and iPad, Safari can clear saved scores for websites you haven't opened in a while.
		Installing to the Home Screen avoids this.
	</p>

	<p class="version">Version {version}</p>
</main>

<style>
	.prose {
		line-height: 1.5;
		font-size: 17px;
		user-select: text;
		-webkit-user-select: text;
	}
	h2 {
		margin: 28px 0 8px;
	}
	h3 {
		margin: 18px 0 4px;
	}
	li {
		margin: 6px 0;
	}
	.note,
	.version {
		color: var(--c-muted);
	}
</style>
