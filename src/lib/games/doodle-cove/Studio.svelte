<script lang="ts">
	import { doodle as text } from '../../strings';
	import type { GameStorage } from '../../kit/storage';
	import { pages, type Scene } from './logic/pages';
	import { inks, readMarks, type Mark, type Tool } from './logic/drawing';
	import { drawingPaper } from './render/paper';
	import Illustration from './render/Illustration.svelte';
	import ToolIcon from './render/ToolIcon.svelte';

	let { storage, onPause }: { storage: GameStorage; onPause: () => void } = $props();
	type Sheet = Scene | 'free';
	let screen = $state<'closed' | 'modes' | 'gallery' | 'paper'>('closed');
	let playing = $state(false);
	let sheet = $state<Sheet>('free');
	let shapes = $derived(sheet === 'free' ? [] : pages[sheet]);
	const scenes = Object.keys(pages) as Scene[];
	const tools: Tool[] = ['pen', 'marker', 'eraser', 'fill'];
	let tool = $state<Tool>('pen');
	let colors = $state({ pen: 0, marker: 5, fill: 4 });
	let selected = $derived(colors[tool === 'eraser' ? 'pen' : tool]);
	let count = $state(0);
	let clearPrompt = $state(false);
	const drafts: Partial<Record<Sheet, { marks: Mark[]; unsaved: boolean }>> = {};
	let unsaved = $state(false);
	let surface: ReturnType<typeof drawingPaper> | undefined;
	function open(id: Sheet) {
		sheet = id;
		tool = id === 'free' ? 'pen' : 'fill';
		const draft = (drafts[id] ??= {
			marks: readMarks(storage.get<unknown>(id, []), id === 'free' ? 0 : pages[id].length),
			unsaved: false
		});
		count = draft.marks.length;
		unsaved = draft.unsaved;
		clearPrompt = false;
		screen = 'paper';
	}
	function paper(node: HTMLCanvasElement) {
		const id = sheet;
		const draft = drafts[id]!;
		const { marks } = draft;
		const board = drawingPaper(
			node,
			shapes,
			marks,
			() => ({ tool, ink: selected }),
			() => {
				count = marks.length;
				unsaved = !storage.set(id, marks);
				draft.unsaved = unsaved;
			}
		);
		surface = board;
		return {
			destroy() {
				board.destroy();
				surface = undefined;
			}
		};
	}
	export function start() {
		surface?.cancel();
		clearPrompt = false;
		screen = 'modes';
		playing = true;
	}
	export function pause() {
		surface?.cancel();
		clearPrompt = false;
		playing = false;
	}
	export function resume() {
		playing = true;
	}
	function back() {
		surface?.cancel();
		screen = screen === 'paper' && sheet !== 'free' ? 'gallery' : 'modes';
	}
</script>

{#if screen !== 'closed'}
	<div class="studio" inert={!playing}>
		<header>
			{#if screen !== 'modes'}<button class="pill" onclick={back}>
					‹ {screen === 'paper' && sheet !== 'free' ? text.gallery : text.modes}
				</button>{/if}
			<strong>{text.title}</strong>
			<button class="pill pause" aria-label={text.pause} onclick={onPause}>Ⅱ</button>
		</header>
		{#if screen === 'modes'}
			<section class="chooser">
				<h2>{text.choose}</h2>
				<div class="mode-grid">
					<button class="mode" onclick={() => open('free')}>
						<svg class="sample" viewBox="0 0 200 110" aria-hidden="true">
							<path
								d="M15 78Q53 -3 72 36T97 72T145 29T185 45"
								fill="none"
								stroke="#17ac96"
								stroke-width="14"
								stroke-linecap="round"
							/><path
								d="M23 89Q66 38 83 66T135 76T181 62"
								fill="none"
								stroke="#e34757"
								stroke-width="5"
								stroke-linecap="round"
							/><circle cx="150" cy="18" r="9" fill="#ffc940" />
						</svg>
						<b>{text.free}</b><small>{text.freeHint}</small>
					</button>
					<button class="mode book" onclick={() => (screen = 'gallery')}>
						<span class="sample">
							<Illustration
								shapes={pages.balloon}
								colors={[
									'#fff',
									'#fff',
									'#82bc48',
									'#a36a47',
									'#a36a47',
									'#ef82ac',
									'#ffc940',
									'#44a7ed',
									'#7957c8',
									'#fa883b',
									'#ffc940'
								]}
							/>
						</span>
						<b>{text.book}</b><small>{text.bookHint}</small>
					</button>
				</div>
			</section>
		{:else if screen === 'gallery'}
			<section class="gallery">
				<h2>{text.pages}</h2>
				<div class="tiles">
					{#each scenes as scene (scene)}<button class="tile" onclick={() => open(scene)}>
							<span><Illustration shapes={pages[scene]} /></span><b>{text.scenes[scene]}</b>
						</button>{/each}
				</div>
			</section>
		{:else}
			<div class="paper-space">
				<div class="paper">
					<canvas use:paper aria-label={text.paper}></canvas>
					{#if shapes.length}<div class="outlines"><Illustration {shapes} /></div>{/if}
				</div>
			</div>
			<section class="tray">
				<div class="caption">
					<b>{sheet === 'free' ? text.free : text.scenes[sheet]}</b>
					<button
						disabled={!count}
						class="pill"
						aria-label={text.undo}
						onclick={() => surface?.undo()}
					>
						↶ {text.undo}
					</button>
					<button
						disabled={!count}
						class="pill"
						onclick={() => {
							surface?.cancel();
							clearPrompt = true;
						}}
					>
						{text.clear}
					</button>
				</div>
				<div class="tools">
					{#each tools as kind (kind)}{#if kind !== 'fill' || sheet !== 'free'}<button
								aria-pressed={kind === tool}
								onclick={() => (tool = kind)}
							>
								<ToolIcon tool={kind} />{text[kind]}
							</button>{/if}{/each}
				</div>
				<div class="palette">
					{#each inks as ink, i (ink)}<button
							class="swatch"
							style:--ink={ink}
							aria-label={text.colors[i]}
							aria-pressed={tool !== 'eraser' && selected === i}
							onclick={() => {
								if (tool === 'eraser') tool = 'pen';
								colors[tool] = i;
							}}
						>
							<span>{tool !== 'eraser' && selected === i ? '✓' : ''}</span>
						</button>{/each}
				</div>
				{#if unsaved}<small role="status">{text.unsaved}</small>{/if}
			</section>
		{/if}
		{#if clearPrompt}<div class="veil">
				<div class="ask" role="dialog" aria-modal="true" aria-label={text.confirm}>
					<h2>{text.confirm}</h2>
					<button class="btn btn-primary" onclick={() => (clearPrompt = false)}>
						{text.keep}
					</button><button
						class="btn btn-danger"
						onclick={() => {
							surface?.clear();
							clearPrompt = false;
						}}
					>
						{text.erase}
					</button>
				</div>
			</div>{/if}
	</div>
{/if}

<style>
	.studio {
		height: 100%;
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 8px;
		position: relative;
		background: #234958;
		color: #fffaf1;
		overflow: hidden;
	}
	button {
		appearance: none;
		cursor: pointer;
		font: inherit;
		font-weight: 750;
		border: 0;
		min-height: 48px;
		min-width: 48px;
		color: inherit;
	}
	button:disabled {
		opacity: 0.45;
		cursor: default;
	}
	header,
	.caption,
	.tools,
	.palette {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	header,
	.tray {
		width: min(100%, 680px);
		margin: 0 auto;
	}
	header strong {
		flex: 1;
		font-size: clamp(16px, 4vw, 22px);
		letter-spacing: 0.03em;
	}
	.pill {
		background: #315e6e;
		border-radius: 14px;
		padding: 0 10px;
	}
	.pause {
		font-size: 23px;
	}
	h2 {
		font-size: clamp(24px, 6vw, 36px);
	}
	.chooser,
	.gallery {
		overflow-y: auto;
		touch-action: pan-y;
		width: min(100%, 680px);
		margin: 0 auto;
		padding: 12px 4px 24px;
	}
	.chooser {
		margin: auto;
		text-align: center;
	}
	.mode-grid,
	.tiles {
		display: grid;
		gap: 12px;
		margin-top: 18px;
	}
	.mode-grid {
		grid-template-columns: repeat(auto-fit, minmax(min(210px, 100%), 1fr));
	}
	.mode,
	.tile {
		display: grid;
		justify-items: center;
		gap: 4px;
		background: #fff4dc;
		color: #25384a;
		border-radius: 20px;
		padding: 12px;
		box-shadow: 0 4px 0 #163a48;
	}
	.mode b {
		font-size: 24px;
	}
	.mode small {
		font-size: 15px;
	}
	.book {
		background: #f9def1;
	}
	.sample {
		display: block;
		width: 100%;
		height: clamp(70px, 14dvh, 150px);
	}
	.tiles {
		grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
	}
	.tile {
		padding: 8px;
		font-size: 15px;
	}
	.tile span {
		width: 100%;
		aspect-ratio: 1;
		background: white;
		border-radius: 12px;
		overflow: hidden;
	}
	.paper-space {
		container-type: size;
		min-height: 0;
		flex: 1;
		display: grid;
		place-items: center;
	}
	.paper {
		width: min(100cqw, 100cqh);
		aspect-ratio: 1;
		position: relative;
		background: white;
		isolation: isolate;
		overflow: hidden;
		border-radius: 8px;
		box-shadow: 0 3px 0 #153543;
	}
	canvas,
	.outlines {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		display: block;
	}
	canvas {
		touch-action: none;
		cursor: crosshair;
	}
	.outlines {
		pointer-events: none;
		mix-blend-mode: multiply;
	}
	.tray {
		background: #fff4dc;
		color: #25384a;
		border-radius: 18px;
		padding: 6px 8px;
	}
	.caption b {
		flex: 1;
		font-size: 15px;
	}
	.caption .pill {
		background: transparent;
		font-size: 14px;
	}
	.tools button {
		flex: 1;
		display: grid;
		justify-items: center;
		align-content: center;
		gap: 1px;
		background: #eedfbd;
		border-radius: 12px;
		font-size: 14px;
	}
	.tools button[aria-pressed='true'] {
		background: #26354a;
		color: white;
	}
	.palette {
		display: grid;
		grid-template-columns: repeat(5, minmax(48px, 1fr));
		gap: 0;
		margin-top: 3px;
	}
	.swatch {
		background: none;
		display: grid;
		place-items: center;
		padding: 0;
	}
	.swatch span {
		background: var(--ink);
		width: 90%;
		max-width: 58px;
		height: 32px;
		border-radius: 12px;
		color: white;
		text-shadow: 0 1px 3px black;
		display: grid;
		place-items: center;
	}
	.swatch[aria-pressed='true'] span {
		outline: 2px solid #26354a;
		outline-offset: 2px;
	}
	.veil {
		position: absolute;
		inset: 0;
		background: #142d3dcc;
		display: grid;
		place-items: center;
		padding: 16px;
	}
	.ask {
		display: grid;
		gap: 12px;
		background: #234958;
		border-radius: 18px;
		padding: 20px;
		text-align: center;
	}
	@media (min-width: 540px) {
		.palette {
			grid-template-columns: repeat(10, minmax(48px, 1fr));
		}
	}
</style>
