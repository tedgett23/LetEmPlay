<script lang="ts">
	import { resolve } from '$app/paths';
	import { settings, updateSettings, resetSettings } from '#lib/kit/settings.svelte.ts';
	import { clearAllAppData } from '#lib/kit/storage.ts';
	import { getAudio } from '#lib/kit/services.ts';
	import HoldButton from '#lib/ui/HoldButton.svelte';
	import { t } from '#lib/strings.ts';
	import type { GlobalSettings } from '#lib/kit/settings.svelte.ts';

	const toggles: { key: keyof GlobalSettings; label: string }[] = [
		{ key: 'sound', label: t.sound },
		{ key: 'music', label: t.music },
		{ key: 'haptics', label: t.haptics },
		{ key: 'reducedMotion', label: t.reducedMotion }
	];

	let erased = $state(false);

	function toggle(key: keyof GlobalSettings) {
		updateSettings({ [key]: !settings[key] });
		getAudio().sync();
	}
	function eraseAll() {
		clearAllAppData();
		resetSettings();
		getAudio().sync();
		erased = true;
	}
</script>

<svelte:head><title>{t.settings} · {t.appName}</title></svelte:head>

<main class="page">
	<header class="topbar">
		<a class="btn" href={resolve('/')}>← {t.back}</a>
		<h1>{t.settings}</h1>
	</header>

	<ul class="list">
		{#each toggles as item (item.key)}
			<li>
				<button
					class="row"
					role="switch"
					aria-checked={settings[item.key]}
					onclick={() => toggle(item.key)}
				>
					<span>{item.label}</span>
					<span class="switch" class:on={settings[item.key]} aria-hidden="true"></span>
				</button>
			</li>
		{/each}
	</ul>

	<ul class="list more">
		<li>
			<a class="row" href={resolve('/parents')}>{t.forParents}<span aria-hidden="true">›</span></a>
		</li>
		<li>
			<a class="row" href={resolve('/credits')}>{t.credits}<span aria-hidden="true">›</span></a>
		</li>
	</ul>

	<div class="danger">
		<HoldButton label={t.resetAll} onConfirm={eraseAll} />
		{#if erased}<p role="status">{t.resetDone}</p>{/if}
	</div>
</main>

<style>
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 10px;
	}
	.row {
		width: 100%;
		min-height: 64px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 18px;
		border: 0;
		border-radius: 18px;
		background: var(--c-surface);
		color: var(--c-text);
		font: inherit;
		font-size: 20px;
		font-weight: 700;
	}
	a.row {
		text-decoration: none;
	}
	a.row span {
		font-size: 30px;
		opacity: 0.6;
	}
	.more {
		margin-top: 28px;
	}
	.switch {
		width: 60px;
		height: 34px;
		border-radius: 17px;
		background: rgb(255 255 255 / 0.2);
		position: relative;
		transition: background 120ms;
	}
	.switch::after {
		content: '';
		position: absolute;
		top: 4px;
		left: 4px;
		width: 26px;
		height: 26px;
		border-radius: 50%;
		background: white;
		transition: transform 120ms;
	}
	.switch.on {
		background: var(--c-green);
	}
	.switch.on::after {
		transform: translateX(26px);
	}
	.danger {
		margin-top: 40px;
		display: grid;
		gap: 8px;
		text-align: center;
	}
</style>
