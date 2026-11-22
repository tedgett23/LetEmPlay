// Hoop Flick (MVP.md §10.2): flick the ball up into the hoop, as many as you can in 60 seconds.
// This file wires the pure rules (logic/) to the view (render/) and the shell contract.
import { asset } from '$app/paths';
import type { GameDefinition, GameInstance } from '../../kit/types';
import { createLoop } from '../../kit/loop';
import { attachGestures } from '../../kit/input';
import { loadSoundSet } from '../../kit/audio';
import { palette } from '../../kit/theme';
import { createPixiStage, type PixiStage } from '../../kit/pixi';
import { canThrow, newGame, step, throwBall, type GameEvent, type GameState } from './logic/game';
import { H, inPause, inThrowZone, W } from './render/layout';
import { HoopFlickView } from './render/view';

const SFX = asset('assets/hoop-flick/sfx/index.json').replace(/\/index\.json$/, '');
/** Let "Time!" and the last bounce play before the shell shows the game-over card. */
const OVER_DELAY = 0.9;

const hoopFlick: GameDefinition = {
	id: 'hoop-flick',
	logicalSize: { width: W, height: H },
	orientation: 'portrait',

	async preload({ audio }, onProgress) {
		await loadSoundSet(audio, SFX, onProgress);
	},

	create(ctx): GameInstance {
		let destroyed = false;
		let stage: PixiStage | null = null;
		let view: HoopFlickView | null = null;
		let detach: (() => void) | null = null;
		let pendingStart = false;

		let state: GameState = newGame();
		let playing = false; // a round is running (until the game-over card)
		let overTimer = -1;

		function play(e: GameEvent) {
			const a = ctx.audio;
			switch (e.type) {
				case 'rim':
					a.play('rim', {
						volume: Math.min(0.4 + e.speed / 4, 1),
						rate: 0.95 + Math.random() * 0.15
					});
					view?.rimHit(e.speed);
					break;
				case 'board':
					a.play('board', { volume: Math.min(0.4 + e.speed / 6, 1) });
					break;
				case 'floor':
					a.play('bounce', { volume: Math.min(e.speed / 6, 0.8) });
					break;
				case 'basket':
					a.play('net');
					break;
				case 'points':
					a.play(e.swish ? 'swish' : 'score', { rate: e.fire ? 1.12 : 1 });
					ctx.haptics.buzz(e.swish ? [20, 40, 20] : 20);
					view?.basket(state.hoop.x, e.points, e.swish, e.fire);
					view?.setScore(state.score);
					ctx.events.onScore(state.score);
					break;
				case 'fire':
					if (e.on) a.play('fire');
					view?.fire(e.on);
					break;
				case 'level':
					a.play('level', { volume: 0.7 });
					view?.level(e.level);
					break;
				case 'tick':
					a.play('tick');
					view?.tick();
					break;
				case 'timeUp':
					a.play('buzzer');
					ctx.haptics.buzz([30, 60, 30]);
					view?.timeUp();
					break;
				case 'over':
					overTimer = OVER_DELAY;
					break;
				case 'miss':
					break;
			}
		}

		const loop = createLoop({
			update: (dt) => {
				if (!view) return;
				if (playing && overTimer < 0) {
					for (const e of step(state, dt)) play(e);
				} else if (overTimer >= 0) {
					step(state, dt); // let the last balls bounce away
					overTimer -= dt;
					if (overTimer < 0) finish();
				}
				view.sync(state, playing && canThrow(state));
				view.update(dt);
			},
			render: () => view?.render()
		});

		function finish() {
			playing = false;
			overTimer = -1;
			loop.stop();
			view?.render();
			ctx.events.onGameOver({ score: state.score });
		}

		function begin() {
			if (!view) {
				pendingStart = true;
				return;
			}
			view.resetFx();
			state = newGame();
			playing = true;
			overTimer = -1;
			view.setBest(ctx.storage.get<number>('best', 0));
			view.setScore(0, true);
			view.showHint(true);
			view.sync(state, true);
			ctx.events.onScore(0);
			loop.start();
		}

		const ready = (async () => {
			const s = await createPixiStage(ctx.container, { width: W, height: H }, palette.bg);
			if (destroyed) {
				s.destroy();
				return;
			}
			stage = s;
			const v = new HoopFlickView(s, () => ctx.settings.reducedMotion);
			view = v;
			v.setBest(ctx.storage.get<number>('best', 0));
			v.setScore(0, true);
			v.showHint(false);
			v.sync(state, true);
			v.update(0);
			v.render();

			// Flick velocities arrive in CSS px/ms; convert to logical px/ms so the same flick on
			// the screen's scale feels the same on a phone and a tablet (MVP.md §10.2).
			const perCss = () => s.toLogical({ x: 1, y: 0 }).x - s.toLogical({ x: 0, y: 0 }).x;

			detach = attachGestures(
				ctx.container,
				{
					onDragStart(p) {
						if (playing && inThrowZone(s.toLogical(p))) v.pressHand(true);
					},
					onDragEnd() {
						v.pressHand(false);
					},
					onFlick(f) {
						if (!playing || overTimer >= 0 || !loop.running) return;
						const from = s.toLogical(f.start);
						if (!inThrowZone(from)) return;
						const k = perCss();
						const vel = { vx: f.vx * k, vy: f.vy * k };
						const aim = throwBall(state, vel);
						if (import.meta.env.DEV) v.debugFlick(from, vel, aim);
						if (!aim) return;
						ctx.audio.play('throw', { volume: 0.6 });
						ctx.haptics.tap();
						v.showHint(false);
					},
					onTap(p) {
						if (playing && inPause(s.toLogical(p))) ctx.events.onRequestPause();
					}
				},
				// Kids often touch, wait, then flick: allow a long gesture; the velocity only uses
				// its last moments.
				{ swipe: { minDistance: 16, maxDurationMs: 4000 } }
			);

			if (pendingStart) begin();
		})();

		return {
			ready,
			start() {
				begin();
			},
			pause() {
				loop.stop();
				view?.pressHand(false);
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

export default hoopFlick;
