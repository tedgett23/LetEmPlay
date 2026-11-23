// Web Slinger: climb a shaft by shooting webs at its walls and ledges, catch robbers on the way
// up (they just tumble down and lie there dizzy) and reach the flag at the top. Tap where to
// web, hold to be reeled in, let go to drop; tap a robber to web them.
// This file wires the pure rules (logic/) to the view (render/) and the shell contract.
import { asset } from '$app/paths';
import type { GameDefinition, GameInstance } from '../../kit/types';
import { createLoop } from '../../kit/loop';
import { attachGestures } from '../../kit/input';
import { loadSoundSet } from '../../kit/audio';
import { palette } from '../../kit/theme';
import { createPixiStage, type PixiStage } from '../../kit/pixi';
import {
	isSavedRun,
	launch,
	nextLevel,
	saved,
	startLevel,
	step,
	tapRobber,
	type GameEvent,
	type GameState
} from './logic/game';
import { TUNING } from './logic/tuning';
import { H, inPause, W } from './render/layout';
import { WebSlingerView } from './render/view';

const SFX = asset('assets/web-slinger/sfx/index.json').replace(/\/index\.json$/, '');
/** Time to enjoy the stars before the next level starts. */
const NEXT_LEVEL_DELAY = 2.6;
/** Let the last moment play before the shell shows the game-over card. */
const OVER_DELAY = 1;

const webSlinger: GameDefinition = {
	id: 'web-slinger',
	logicalSize: { width: W, height: H },
	orientation: 'portrait',

	async preload({ audio }, onProgress) {
		await loadSoundSet(audio, SFX, onProgress);
	},

	create(ctx): GameInstance {
		let destroyed = false;
		let stage: PixiStage | null = null;
		let view: WebSlingerView | null = null;
		let detach: (() => void) | null = null;
		const pending: { start: { continueSaved: boolean } | null } = { start: null };

		const savedRaw: unknown = ctx.storage.get<unknown>('run', null);
		let savedRun = isSavedRun(savedRaw) ? savedRaw : null;

		let state: GameState = startLevel(savedRun?.levelIndex ?? 0);
		let playing = false;
		let timer = -1; // counts down to the next level or to the game-over card
		const events: GameEvent[] = [];
		const inputEvents: GameEvent[] = [];

		function play(e: GameEvent) {
			const a = ctx.audio;
			switch (e.type) {
				case 'web':
					a.play('web', { volume: 0.7, rate: 0.95 + Math.random() * 0.1 });
					ctx.haptics.tap();
					break;
				case 'release':
					a.play('whoosh', { volume: 0.5 });
					break;
				case 'land':
					a.play('land', { volume: 0.6 });
					break;
				case 'coin':
					a.play('coin', { volume: 0.6, rate: 0.95 + Math.random() * 0.15 });
					view?.coin(state, e.index);
					break;
				case 'shot':
					a.play('web', { volume: 0.7, rate: 1.25 });
					break;
				case 'webbed':
				case 'bumped':
					a.play('caught');
					ctx.haptics.buzz(30);
					view?.caught(state, e.index);
					break;
				case 'throw':
					a.play('throw', { volume: 0.5 });
					break;
				case 'splash':
					a.play('splash', { volume: 0.6 });
					view?.splash(e.x, e.y);
					break;
				case 'hit':
					a.play('oops');
					ctx.haptics.buzz([30, 40, 30]);
					view?.hit();
					break;
				case 'miss':
					// Nothing in reach that way: a little puff where you tapped.
					a.play('web', { volume: 0.4, rate: 0.7 });
					view?.webPuff({ x: e.x, y: e.y });
					break;
				case 'complete':
					a.play('complete');
					view?.complete(e.stars);
					timer = NEXT_LEVEL_DELAY;
					break;
				case 'over':
					a.play('gameOver');
					timer = OVER_DELAY;
					break;
			}
			if (e.type !== 'release' && e.type !== 'throw') ctx.events.onScore(state.score);
		}

		const loop = createLoop({
			update: (dt) => {
				if (!view) return;
				if (playing) {
					for (const e of step(state, dt, events)) play(e);
					if (timer >= 0) {
						timer -= dt;
						if (timer < 0) {
							if (state.phase === 'complete') goNext();
							else if (state.phase === 'over') finish();
						}
					}
				}
				view.sync(state);
				view.update(dt);
			},
			render: () => view?.render()
		});

		function save() {
			ctx.storage.set('run', saved(state));
		}

		function goNext() {
			state = nextLevel(state);
			save();
			ctx.events.onScore(state.score);
		}

		function finish() {
			playing = false;
			loop.stop();
			view?.render();
			// Keep the level reached, so Continue picks up there with a fresh score and hearts.
			ctx.storage.set('run', { levelIndex: state.levelIndex, score: 0, hearts: TUNING.hearts });
			ctx.events.onGameOver({ score: state.score });
		}

		function begin(continueSaved: boolean) {
			if (!view) {
				pending.start = { continueSaved };
				return;
			}
			view.resetFx();
			state =
				continueSaved && savedRun
					? startLevel(savedRun.levelIndex, savedRun.score, savedRun.hearts)
					: startLevel(0);
			savedRun = null;
			playing = true;
			timer = -1;
			save();
			view.setScore(state.score);
			ctx.events.onScore(state.score);
			loop.start();
		}

		const ready = (async () => {
			const s = await createPixiStage(ctx.container, { width: W, height: H }, palette.bg);
			if (destroyed) {
				s.destroy();
				return;
			}
			stage = s;
			const v = new WebSlingerView(s, () => ctx.settings.reducedMotion);
			view = v;
			v.sync(state);
			v.update(0);
			v.render();

			// Draw a line from anywhere: its direction is where the web shoots, its length how
			// fast you fly. A quick tap on a robber webs them instead.
			const Z = TUNING.zip;
			let from: { x: number; y: number } | null = null;
			const lineTo = (p: { x: number; y: number }) => {
				if (!from) return null;
				const l = s.toLogical(p);
				const dx = l.x - from.x;
				const dy = from.y - l.y; // screen y is down, world y is up
				const len = Math.hypot(dx, dy);
				if (len < Z.minDrag) return null;
				const power = Math.min((len - Z.minDrag) / (Z.maxDrag - Z.minDrag), 1);
				return { dx, dy, power };
			};
			detach = attachGestures(ctx.container, {
				onDragStart(p) {
					const l = s.toLogical(p);
					from = playing && state.phase === 'play' && !inPause(l) ? l : null;
				},
				onDragMove(p) {
					v.setAim(lineTo(p));
				},
				onDragEnd(p) {
					const line = lineTo(p);
					from = null;
					v.setAim(null);
					if (!line || !playing || !loop.running) return;
					inputEvents.length = 0;
					for (const e of launch(state, line.dx, line.dy, line.power, inputEvents)) play(e);
				},
				onTap(p) {
					const l = s.toLogical(p);
					if (inPause(l)) {
						if (playing) ctx.events.onRequestPause();
						return;
					}
					if (!playing || !loop.running) return;
					inputEvents.length = 0;
					tapRobber(state, v.toWorld(l), inputEvents);
					for (const e of inputEvents) play(e);
				}
			});

			if (pending.start) begin(pending.start.continueSaved);
		})();

		return {
			ready,
			start(opts) {
				begin(!!opts?.continueSaved);
			},
			hasSavedRun: () => savedRun !== null,
			pause() {
				view?.setAim(null);
				loop.stop();
				view?.render();
			},
			resume() {
				if (view && playing) loop.start();
			},
			destroy() {
				destroyed = true;
				loop.stop();
				detach?.();
				view?.destroy();
				stage?.destroy();
				stage = null;
				view = null;
			}
		};
	}
};

export default webSlinger;
