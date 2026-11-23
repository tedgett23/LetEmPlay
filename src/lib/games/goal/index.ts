// Drag anywhere to dribble; flick off the end of a cut to shoot. Chasers run at the ball: a
// fast ball knocks them over, a slow one gets taken.
// This file wires the pure rules (logic/) to the view (render/) and the shell contract.
import { asset } from '$app/paths';
import type { GameDefinition, GameInstance } from '../../kit/types';
import { createLoop } from '../../kit/loop';
import { attachGestures } from '../../kit/input';
import { loadSoundSet } from '../../kit/audio';
import {
	isSavedRun,
	kick,
	nextLevel,
	retryLevel,
	saved,
	startLevel,
	steer,
	step,
	type GameEvent,
	type GameState
} from './logic/game';
import { TUNING } from './logic/tuning';
import { H, W } from './render/layout';
import { GoalView } from './render/view';

const SFX = asset('assets/goal/sfx/index.json').replace(/\/index\.json$/, '');
/** Let the last moment play before the shell shows the game-over card. */
const OVER_DELAY = 1.2;
/** Gap between wall-bounce sounds, so a ball rattling in a corner isn't a buzz. */
const BOUNCE_GAP = 0.06;

const goal: GameDefinition = {
	id: 'goal',
	logicalSize: { width: W, height: H },
	orientation: 'portrait',

	preload: ({ audio, signal }, onProgress) => loadSoundSet(audio, SFX, signal, onProgress),

	create(ctx): GameInstance {
		const savedRaw: unknown = ctx.storage.get<unknown>('run', null);
		let savedRun = isSavedRun(savedRaw) ? savedRaw : null;

		let state: GameState = startLevel(savedRun?.levelIndex ?? 0);
		let playing = false;
		let timer = -1; // counts down to the next level, a retry, or the game-over card
		let lastBounce = 0;
		let clock = 0;
		const events: GameEvent[] = [];
		const inputEvents: GameEvent[] = [];
		const view = new GoalView(
			ctx.container,
			() => ctx.settings.reducedMotion,
			() => {
				if (playing) ctx.events.onRequestPause();
			}
		);

		function play(e: GameEvent) {
			const a = ctx.audio;
			switch (e.type) {
				case 'kick':
					a.play('kick', { volume: 0.5 + 0.5 * e.power, rate: 0.95 + Math.random() * 0.1 });
					ctx.haptics.tap();
					break;
				case 'bounce': {
					if (clock - lastBounce < BOUNCE_GAP) break;
					lastBounce = clock;
					const volume = Math.min(0.25 + e.speed / 1600, 1);
					if (e.kind === 'net') a.play('net', { volume });
					else if (e.kind === 'post') a.play('post', { volume });
					else if (e.kind === 'bush') a.play('bush', { volume });
					else if (e.kind === 'tyre') a.play('thud', { volume, rate: 1.5 });
					else if (e.kind === 'keeper') a.play('kick', { volume, rate: 0.8 });
					else a.play('thud', { volume, rate: e.kind === 'rock' ? 0.8 : 1 });
					break;
				}
				case 'knock':
					a.play('bonk', { rate: 0.9 + 0.12 * e.combo });
					ctx.haptics.buzz(20 + 10 * e.combo);
					view.knocked(state, e.index, e.combo, e.points);
					break;
				case 'goal':
					a.play('goal');
					a.play('net', { volume: 0.7 });
					ctx.haptics.buzz([20, 40, 20]);
					view.scored(state, e.points, e.allDown);
					timer = TUNING.timing.nextLevel;
					break;
				case 'taken':
					a.play('taken');
					ctx.haptics.buzz([30, 40, 30]);
					view.taken(state);
					timer = TUNING.timing.retry;
					break;
				case 'over':
					a.play('gameOver');
					timer = OVER_DELAY;
					break;
			}
			if (e.type === 'knock' || e.type === 'goal') ctx.events.onScore(state.score);
		}

		const loop = createLoop({
			update: (dt) => {
				clock += dt;
				if (playing) {
					for (const e of step(state, dt, events)) play(e);
					if (timer >= 0) {
						timer -= dt;
						if (timer < 0) {
							if (state.phase === 'goal') {
								goTo(nextLevel(state));
								ctx.audio.play('level', { volume: 0.6 });
							} else if (state.phase === 'taken') goTo(retryLevel(state));
							else if (state.phase === 'over') finish();
						}
					}
				}
				view.sync(state);
				view.update(dt);
			},
			render: () => view.render()
		});

		function goTo(next: GameState) {
			endTouch();
			state = next;
			ctx.storage.set('run', saved(state));
			ctx.events.onScore(state.score);
		}

		function finish() {
			playing = false;
			loop.stop();
			view.render();
			// Keep the level reached, so Continue picks up there with a fresh score and balls.
			ctx.storage.set('run', { levelIndex: state.levelIndex, score: 0, balls: TUNING.balls });
			ctx.events.onGameOver({ score: state.score });
		}

		function begin(continueSaved: boolean) {
			endTouch();
			view.resetFx();
			state =
				continueSaved && savedRun
					? startLevel(savedRun.levelIndex, savedRun.score, savedRun.balls)
					: startLevel(0);
			savedRun = null;
			playing = true;
			timer = -1;
			ctx.storage.set('run', saved(state));
			ctx.events.onScore(state.score);
			loop.start();
		}

		view.sync(state);
		view.update(0);
		view.render();

		let last: { x: number; y: number } | null = null;
		let travel = 0;
		function endTouch() {
			last = null;
			state.dribble = null;
			travel = 0;
		}
		function drag(p: { x: number; y: number }) {
			if (!last || state.phase !== 'play') return;
			const dx = p.x - last.x,
				dy = p.y - last.y;
			const distance = view.logicalLength(dx, dy);
			if (!distance || (!travel && distance < 3)) return;
			last = p;
			travel += distance;
			const d = view.groundDelta(dx, dy);
			steer(state, d.dx, d.dy);
		}
		const detach = attachGestures(ctx.container, {
			onDragStart(p) {
				last = playing && loop.running && state.phase === 'play' ? p : null;
				travel = 0;
			},
			onDragMove: drag,
			onDragCancel: endTouch,
			onDragEnd(p, velocity) {
				if (!last) return;
				drag(p);
				const speed = view.logicalLength(velocity.vx, velocity.vy),
					K = TUNING.kick;
				const flick = travel >= K.minTravel && speed >= K.flickThreshold;
				endTouch();
				if (!flick || state.phase !== 'play') return;
				const d = view.groundDelta(velocity.vx, velocity.vy);
				const power = Math.min(1, (speed - K.flickThreshold) / (K.fullFlick - K.flickThreshold));
				inputEvents.length = 0;
				if (kick(state, d.dx, d.dy, power, inputEvents)) for (const e of inputEvents) play(e);
			}
		});

		return {
			start(opts) {
				begin(!!opts?.continueSaved);
			},
			hasSavedRun: () => savedRun !== null,
			pause() {
				endTouch();
				loop.stop();
				view.render();
			},
			resume() {
				if (playing) loop.start();
			},
			destroy() {
				loop.stop();
				detach();
				view.destroy();
			}
		};
	}
};

export default goal;
