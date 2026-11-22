<script lang="ts">
	import { t } from '../strings';
</script>

<div class="rotate" role="alert">
	<div class="phone" aria-hidden="true"></div>
	<p>{t.rotate}</p>
</div>

<style>
	.rotate {
		position: fixed;
		inset: 0;
		z-index: 50;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 20px;
		background: var(--c-bg-deep);
		color: var(--c-text);
		font-size: 22px;
		font-weight: 700;
		text-align: center;
		padding: var(--gutter);
	}
	.phone {
		width: 56px;
		height: 96px;
		border: 6px solid currentColor;
		border-radius: 14px;
		animation: tilt 1.6s ease-in-out infinite;
	}
	@keyframes tilt {
		0%,
		30% {
			transform: rotate(-90deg);
		}
		60%,
		100% {
			transform: rotate(0deg);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.phone {
			animation: none;
		}
	}
</style>
