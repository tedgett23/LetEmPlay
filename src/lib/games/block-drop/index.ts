// Block Drop: place pieces on an 8×8 board, clear full rows and columns.
// This file wires the pure rules (logic/) to the view (render/) and the shell contract.
import { asset } from '$app/paths';
import type { GameDefinition, GameInstance } from '../../kit/types';
import { createLoop } from '../../kit/loop';
import { attachGestures } from '../../kit/input';
import { Assets, mountPixiStage, type Spritesheet } from '../../kit/pixi';
import { sheetAndSounds } from '../../kit/pixi-assets';
import { applyMove, checkOver, isGameState, newGame, type GameState } from './logic/game';
import { BlockDropView } from './render/view';
import { H, inPause, slotAt, W } from './render/layout';

const SHEET = asset('assets/block-drop/puzzle.json');
const SFX = asset('assets/block-drop/sfx/index.json').replace(/\/index\.json$/, '');

function randomSeed(): number {
	return Math.floor(Math.random() * 2 ** 32);
}

const blockDrop: GameDefinition = {
	id: 'block-drop',
	logicalSize: { width: W, height: H },
	orientation: 'portrait',

	preload: sheetAndSounds(SHEET, SFX),

	create(ctx): GameInstance {
		let view: BlockDropView | null = null;
		let detach: (() => void) | null = null;
		const pending: { start: { continueSaved: boolean } | null } = { start: null };

		const saved: unknown = ctx.storage.get<unknown>('run', null);
		let savedRun: GameState | null =
			isGameState(saved) && !checkOver(saved).over ? checkOver(saved) : null;

		let state: GameState = savedRun ?? newGame(randomSeed());
		let ending = false; // game-over animation playing
		let finished = true; // no active run (before start / after game over)
		let paused = false;

		const save = () => ctx.storage.set('run', state);

		const loop = createLoop({
			update: (dt) => view?.update(dt),
			render: () => {
				view?.render();
				if (!view?.animating) loop.stop();
			}
		});

		function begin(continueSaved: boolean) {
			if (!view) {
				pending.start = { continueSaved };
				return;
			}
			view.resetFx();
			state = continueSaved && savedRun ? savedRun : newGame(randomSeed());
			savedRun = null;
			ending = false;
			finished = false;
			paused = false;
			save();
			view.setBest(ctx.storage.get<number>('best', 0));
			view.showBoard(state.board);
			view.showTray(state.tray, state.board, true);
			view.setScore(state.score, true);
			ctx.events.onScore(state.score);
			loop.start();
		}

		function finishRun() {
			ending = true;
			ctx.audio.play('gameOver');
			ctx.haptics.buzz([30, 60, 30]);
			ctx.storage.remove('run');
			view?.playGameOver(state.board, () => {
				ending = false;
				finished = true;
				loop.stop();
				view?.render();
				ctx.events.onGameOver({ score: state.score });
			});
		}

		function tryPlace(slot: number, x: number, y: number): boolean {
			const r = applyMove(state, slot, x, y);
			if (!r || !view) return false;
			state = r.state;
			save();
			view.endDrag(state.board, false);
			view.playMove(r);
			view.setScore(state.score);
			ctx.events.onScore(state.score);

			const lines = r.clears.rows.length + r.clears.cols.length;
			ctx.audio.play('place');
			if (lines > 0) {
				// Pitch climbs with the combo for extra satisfaction.
				ctx.audio.play('clear', { rate: Math.min(1 + 0.08 * (state.combo - 1), 1.6) });
				ctx.haptics.buzz(lines > 1 ? [20, 40, 20] : 20);
			} else {
				ctx.haptics.tap();
			}
			if (r.boardCleared) ctx.audio.play('boardClear');

			if (r.dealt) {
				view.showTray(state.tray, state.board, true);
				ctx.audio.play('deal', { volume: 0.5 });
			} else {
				view.updatePlayable(state.tray, state.board);
			}
			if (state.over) finishRun();
			return true;
		}

		const stage = mountPixiStage(ctx, this.logicalSize, (s) => {
			const sheet = Assets.get<Spritesheet>(SHEET);
			view = new BlockDropView(s, sheet, () => ctx.settings.reducedMotion);
			view.setBest(ctx.storage.get<number>('best', 0));
			view.showBoard(state.board);
			view.showTray(state.tray, state.board, false);
			view.setScore(state.score, true);
			view.render();

			detach = attachGestures(ctx.container, {
				onDragStart(p) {
					if (!view || finished || ending || paused) return;
					const l = s.toLogical(p);
					if (inPause(l)) return;
					const slot = slotAt(l);
					if (slot === null) return;
					const tp = state.tray[slot];
					if (!tp) return;
					view.beginDrag(slot, tp, l);
					view.moveDrag(l, state.board);
					loop.start();
					ctx.audio.play('pickup', { volume: 0.7 });
				},
				onDragMove(p) {
					if (!view?.drag) return;
					view.moveDrag(s.toLogical(p), state.board);
					loop.start();
				},
				onDragEnd(p) {
					if (!view?.drag) return;
					const target = view.moveDrag(s.toLogical(p), state.board);
					const slot = view.drag.slot;
					loop.start();
					if (target && tryPlace(slot, target.x, target.y)) return;
					view.endDrag(state.board, true);
					ctx.audio.play('return', { volume: 0.6 });
				},
				onDragCancel() {
					if (!view?.drag) return;
					view.cancelDrag(state.board);
					loop.start();
				},
				onTap(p) {
					if (inPause(s.toLogical(p)) && !finished) ctx.events.onRequestPause();
				}
			});

			if (pending.start) begin(pending.start.continueSaved);
		});

		return {
			ready: stage.ready,
			start(opts) {
				begin(!!opts?.continueSaved);
			},
			hasSavedRun: () => savedRun !== null,
			pause() {
				paused = true;
				if (view?.drag) view.cancelDrag(state.board);
				loop.stop();
				view?.render();
			},
			resume() {
				paused = false;
				if (view && (!finished || ending)) loop.start();
			},
			destroy() {
				loop.stop();
				detach?.();
				view?.resetFx();
				stage.destroy();
				view = null;
			}
		};
	}
};

export default blockDrop;
