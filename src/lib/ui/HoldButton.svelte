<script lang="ts">
	// Press-and-hold confirm for destructive actions. A tap does nothing.
	let {
		label,
		holdMs = 2000,
		onConfirm
	}: { label: string; holdMs?: number; onConfirm: () => void } = $props();

	let progress = $state(0);
	let raf = 0;
	let startedAt = 0;

	function tick(now: number) {
		progress = Math.min((now - startedAt) / holdMs, 1);
		if (progress >= 1) {
			onConfirm();
			progress = 0;
			return;
		}
		raf = requestAnimationFrame(tick);
	}
	function begin(e: PointerEvent) {
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		startedAt = performance.now();
		raf = requestAnimationFrame(tick);
	}
	function cancel() {
		cancelAnimationFrame(raf);
		progress = 0;
	}
</script>

<button
	class="btn btn-danger hold"
	onpointerdown={begin}
	onpointerup={cancel}
	onpointercancel={cancel}
	onpointerleave={cancel}
	style:--p={progress}
>
	<span class="fill" aria-hidden="true"></span>
	<span class="label">{label}</span>
</button>

<style>
	.hold {
		position: relative;
		overflow: hidden;
	}
	.fill {
		position: absolute;
		inset: 0;
		transform-origin: left;
		transform: scaleX(var(--p));
		background: rgb(255 255 255 / 0.3);
	}
	.label {
		position: relative;
	}
</style>
