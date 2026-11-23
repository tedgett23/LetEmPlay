// Rail Dash (MVP.md §10.3): a three-lane endless runner. Swipe left/right to switch lanes, up to
// jump, down to slide. This file wires the pure rules (logic/) to the 3D view and HUD (render/).
import { asset } from '$app/paths';
import type { GameDefinition, GameInstance } from '../../kit/types';
import { createLoop } from '../../kit/loop';
import { attachGestures, type SwipeDir } from '../../kit/input';
import { loadSoundSet } from '../../kit/audio';
import { observeSize } from '../../kit/viewport';
import { input, newRun, score, step, type Action, type RunEvent, type RunState } from './logic/run';
import { RailDashHud } from './render/hud';
import { loadModels, type Models } from './render/models';
import { RailDashView } from './render/view';

const SFX = asset('assets/rail-dash/sfx/index.json').replace(/\/index\.json$/, '');
/** Let the crash tumble play before the shell shows the game-over card. */
const CRASH_DELAY = 1.1;

/** Set by preload(); the parsed models are shared by every run. */
let models: Models | null = null;

const ACTIONS: Record<SwipeDir, Action> = {
	left: 'left',
	right: 'right',
	up: 'jump',
	down: 'slide'
};

function randomSeed(): number {
	return Math.floor(Math.random() * 2 ** 32);
}

const railDash: GameDefinition = {
	id: 'rail-dash',
	logicalSize: { width: 720, height: 1280 },
	orientation: 'portrait',

	async preload({ audio }, onProgress) {
		let art = 0;
		let sound = 0;
		const report = () => onProgress(art * 0.8 + sound * 0.2);
		const [m] = await Promise.all([
			loadModels((p) => {
				art = p;
				report();
			}),
			loadSoundSet(audio, SFX, (p) => {
				sound = p;
				report();
			})
		]);
		models = m;
	},

	create(ctx): GameInstance {
		if (!models) throw new Error('Rail Dash: preload() must finish before create()');
		let runs = Math.floor(Math.random() * 3);
		const view = new RailDashView(ctx.container, models, runs, () => ctx.settings.reducedMotion);
		const hud = new RailDashHud(ctx.container, () => {
			if (playing) ctx.events.onRequestPause();
		});
		const stopObserving = observeSize(ctx.container, (s) => view.resize(s.width, s.height));
		view.resize(ctx.container.clientWidth, ctx.container.clientHeight);

		let state: RunState = newRun(randomSeed());
		let playing = false;
		let crashTimer = -1;
		const events: RunEvent[] = [];
		const inputEvents: RunEvent[] = [];

		function play(e: RunEvent) {
			const a = ctx.audio;
			switch (e.type) {
				case 'coin':
					a.play('coin', { volume: 0.6, rate: 0.95 + Math.random() * 0.15 });
					break;
				case 'jump':
					a.play('jump', { volume: 0.6 });
					break;
				case 'land':
					a.play('land', { volume: 0.4 });
					break;
				case 'slide':
					a.play('slide', { volume: 0.6 });
					break;
				case 'lane':
					a.play('lane', { volume: 0.35 });
					break;
				case 'stumble':
					a.play('stumble');
					ctx.haptics.buzz(40);
					view.stumble();
					break;
				case 'warn':
					a.play('warn', { volume: 0.7 });
					break;
				case 'tier':
					a.play('tier', { volume: 0.7 });
					break;
				case 'crash':
					a.play('crash');
					ctx.haptics.buzz([40, 60, 80]);
					view.crash();
					crashTimer = CRASH_DELAY;
					break;
			}
		}

		const loop = createLoop({
			update: (dt) => {
				if (playing && crashTimer < 0) {
					for (const e of step(state, dt, events)) play(e);
					if (state.time > 4) hud.showHint(false);
				} else if (crashTimer >= 0) {
					crashTimer -= dt;
					if (crashTimer < 0) finish();
				}
				view.update(dt);
				const sc = score(state);
				hud.set(sc, state.coins);
				ctx.events.onScore(sc);
			},
			render: () => view.render(state)
		});

		function finish() {
			playing = false;
			crashTimer = -1;
			loop.stop();
			view.render(state);
			ctx.events.onGameOver({ score: score(state) });
		}

		function begin() {
			view.resetFx();
			view.setSkin(runs++);
			state = newRun(randomSeed());
			playing = true;
			crashTimer = -1;
			hud.showHint(true);
			hud.set(0, 0);
			ctx.events.onScore(0);
			loop.start();
		}

		const detach = attachGestures(
			ctx.container,
			{
				onSwipe(dir) {
					if (!playing || crashTimer >= 0 || !loop.running) return;
					inputEvents.length = 0;
					for (const e of input(state, ACTIONS[dir], inputEvents)) play(e);
				}
			},
			// 40 CSS px: a deliberate swipe, not a wobble while holding the phone.
			{ swipe: { minDistance: 40, maxDurationMs: 600 }, swipeOnMove: true }
		);

		hud.showHint(false);
		view.render(state);

		return {
			start() {
				begin();
			},
			pause() {
				loop.stop();
				view.render(state);
			},
			resume() {
				if (playing) loop.start();
			},
			destroy() {
				loop.stop();
				detach();
				stopObserving();
				hud.destroy();
				view.destroy();
			}
		};
	}
};

export default railDash;
