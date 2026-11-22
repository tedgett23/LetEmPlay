<script lang="ts">
	import favicon from '#lib/assets/favicon.svg';
	import { onMount } from 'svelte';
	import { loadSettings } from '#lib/kit/settings.svelte.ts';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	onMount(() => {
		loadSettings();
		// Kid-proofing: no long-press menus, no pinch zoom (MVP.md §6).
		const block = (e: Event) => e.preventDefault();
		document.addEventListener('contextmenu', block);
		document.addEventListener('gesturestart', block);
		return () => {
			document.removeEventListener('contextmenu', block);
			document.removeEventListener('gesturestart', block);
		};
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}

<style>
	:global {
		:root {
			--c-brand: #5b4cf0;
			--c-bg: #1d1846;
			--c-bg-deep: #120f2e;
			--c-surface: #2a2363;
			--c-text: #ffffff;
			--c-muted: #b9b4e8;
			--c-yellow: #ffc83d;
			--c-green: #3dd68c;
			--c-pink: #ff6b8b;
			--c-blue: #4cc9f0;
			--c-danger: #e5484d;
			--gutter: 16px;
			--tap: 56px;
			--safe-top: env(safe-area-inset-top, 0px);
			--safe-bottom: env(safe-area-inset-bottom, 0px);
			--safe-left: env(safe-area-inset-left, 0px);
			--safe-right: env(safe-area-inset-right, 0px);
			color-scheme: dark;
		}
		*,
		*::before,
		*::after {
			box-sizing: border-box;
		}
		html,
		body {
			margin: 0;
			min-height: 100%;
			background: var(--c-bg);
			color: var(--c-text);
			font-family:
				ui-rounded,
				'SF Pro Rounded',
				system-ui,
				-apple-system,
				'Segoe UI',
				Roboto,
				sans-serif;
			-webkit-text-size-adjust: 100%;
			-webkit-tap-highlight-color: transparent;
			overscroll-behavior: none;
			user-select: none;
			-webkit-user-select: none;
			-webkit-touch-callout: none;
		}
		h1,
		h2 {
			margin: 0;
			line-height: 1.1;
		}
		.btn {
			appearance: none;
			border: 0;
			min-height: var(--tap);
			padding: 12px 22px;
			border-radius: 18px;
			font: inherit;
			font-size: 20px;
			font-weight: 800;
			color: var(--c-text);
			background: rgb(255 255 255 / 0.12);
			cursor: pointer;
			touch-action: manipulation;
			text-decoration: none;
			transition: transform 80ms ease;
		}
		.btn:active {
			transform: scale(0.96);
		}
		.btn-primary {
			background: var(--c-green);
			color: #08321d;
		}
		.btn-danger {
			background: var(--c-danger);
		}
		.page {
			min-height: 100dvh;
			padding: calc(var(--safe-top) + 20px) calc(var(--safe-right) + var(--gutter))
				calc(var(--safe-bottom) + 24px) calc(var(--safe-left) + var(--gutter));
			max-width: 720px;
			margin: 0 auto;
		}
		.topbar {
			display: flex;
			align-items: center;
			gap: 12px;
			margin-bottom: 20px;
		}
		@media (prefers-reduced-motion: reduce) {
			* {
				transition: none !important;
			}
		}
	}
</style>
