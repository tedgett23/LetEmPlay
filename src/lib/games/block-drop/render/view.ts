// All Block Drop drawing and animation. The view never decides rules: index.ts feeds it
// state and MoveResults from logic/, and it animates them.
import {
	Container,
	Graphics,
	Sprite,
	Text,
	type Spritesheet,
	type Texture
} from '../../../kit/pixi';
import type { PixiStage } from '../../../kit/pixi';
import { palette } from '../../../kit/theme';
import { ease, Tweens } from '../../../kit/tween';
import { canPlace, clearedCells, findClears, place, SIZE, type Board } from '../logic/board';
import type { MoveResult, TrayPiece } from '../logic/game';
import { pieceById, type Piece } from '../logic/pieces';
import {
	BOARD_PX,
	BOARD_X,
	BOARD_Y,
	CELL,
	cellCenter,
	cellOffset,
	dragCenter,
	H,
	PAUSE,
	slotCenter,
	snap,
	TRAY_CELL,
	W,
	type Pt
} from './layout';

const TILE_NAMES = [
	'element_grey_square_glossy', // 0: used for the game-over fade
	'element_red_square_glossy',
	'element_yellow_square_glossy',
	'element_green_square_glossy',
	'element_blue_square_glossy'
];
const TILE_SCALE = (CELL - 4) / 64; // source tiles are 64px
const MAX_PARTICLES = 120;

interface Particle {
	sprite: Sprite;
	vx: number;
	vy: number;
	spin: number;
	life: number;
	maxLife: number;
}

interface Drag {
	slot: number;
	piece: Piece;
	color: number;
	container: Container;
	target: Pt | null;
}

export class BlockDropView {
	readonly tweens = new Tweens();
	private tiles: Texture[];
	private star: Texture;

	private boardLayer = new Container();
	private tileSprites: Sprite[] = [];
	private highlight = new Graphics();
	private ghost = new Container();
	private trayLayer = new Container();
	private trayContainers: (Container | null)[] = [null, null, null];
	private dragLayer = new Container();
	private fx = new Container();
	private particles: Particle[] = [];

	private scoreText: Text;
	private bestText: Text;
	private shownScore = 0;
	private targetScore = 0;
	private shake = 0;

	drag: Drag | null = null;

	constructor(
		private stage: PixiStage,
		sheet: Spritesheet,
		private reducedMotion: () => boolean
	) {
		this.tiles = TILE_NAMES.map((n) => sheet.textures[n]!);
		this.star = sheet.textures['particleStar']!;
		const root = stage.root;

		// Background + board frame
		const bg = new Graphics().rect(0, 0, W, H).fill(palette.bg);
		const frame = new Graphics()
			.roundRect(BOARD_X - 14, BOARD_Y - 14, BOARD_PX + 28, BOARD_PX + 28, 28)
			.fill(palette.bgDeep);
		const slots = new Graphics();
		for (let i = 0; i < SIZE * SIZE; i++) {
			const c = cellCenter(i);
			slots
				.roundRect(c.x - CELL / 2 + 3, c.y - CELL / 2 + 3, CELL - 6, CELL - 6, 12)
				.fill({ color: 0xffffff, alpha: 0.06 });
		}
		this.boardLayer.addChild(frame, slots);

		for (let i = 0; i < SIZE * SIZE; i++) {
			const s = new Sprite(this.tiles[1]);
			s.anchor.set(0.5);
			s.scale.set(TILE_SCALE);
			const c = cellCenter(i);
			s.position.set(c.x, c.y);
			s.visible = false;
			this.tileSprites.push(s);
			this.boardLayer.addChild(s);
		}
		this.boardLayer.addChild(this.highlight, this.ghost);

		// HUD
		const text = (size: number, alpha = 1) =>
			new Text({
				text: '',
				style: {
					fill: palette.white,
					fontSize: size,
					fontWeight: '900',
					fontFamily: 'ui-rounded, system-ui, -apple-system, sans-serif'
				},
				alpha,
				anchor: 0.5
			});
		this.scoreText = text(104);
		this.scoreText.position.set(W / 2, 128);
		this.bestText = text(36, 0.7);
		this.bestText.position.set(W / 2, 205);
		const pause = new Graphics()
			.roundRect(0, 0, PAUSE.size, PAUSE.size, 26)
			.fill({ color: 0xffffff, alpha: 0.14 })
			.roundRect(31, 26, 12, 44, 4)
			.fill(palette.white)
			.roundRect(53, 26, 12, 44, 4)
			.fill(palette.white);
		pause.position.set(PAUSE.x, PAUSE.y);

		root.addChild(bg, this.boardLayer, this.trayLayer, this.fx, this.dragLayer);
		root.addChild(this.scoreText, this.bestText, pause);
	}

	// ---- Static state ----------------------------------------------------------------------

	setBest(best: number) {
		this.bestText.text = best > 0 ? `Best ${best}` : '';
	}

	setScore(score: number, instant = false) {
		this.targetScore = score;
		if (instant) this.shownScore = score;
		this.scoreText.text = String(Math.round(this.shownScore));
	}

	showBoard(board: Board) {
		board.forEach((color, i) => {
			const s = this.tileSprites[i]!;
			s.visible = color > 0;
			if (color > 0) s.texture = this.tiles[color]!;
			s.scale.set(TILE_SCALE);
			s.alpha = 1;
		});
	}

	/** Build tray pieces. `animate` pops them in; unplayable pieces are dimmed. */
	showTray(tray: readonly (TrayPiece | null)[], board: Board, animate: boolean) {
		this.trayLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
		this.trayContainers = tray.map((tp, slot) => {
			if (!tp) return null;
			const piece = pieceById(tp.pieceId);
			const c = this.buildPiece(piece, tp.color, TRAY_CELL);
			const home = slotCenter(slot);
			c.position.set(home.x, home.y);
			this.trayLayer.addChild(c);
			if (animate) {
				c.scale.set(0);
				this.tweens.add({
					duration: 0.32,
					delay: slot * 0.07,
					ease: ease.outBack,
					onUpdate: (t) => {
						if (!c.destroyed) c.scale.set(t);
					}
				});
			}
			return c;
		});
		this.updatePlayable(tray, board);
	}

	updatePlayable(tray: readonly (TrayPiece | null)[], board: Board) {
		tray.forEach((tp, slot) => {
			const c = this.trayContainers[slot];
			if (!c || !tp) return;
			const piece = pieceById(tp.pieceId);
			let fits = false;
			for (let y = 0; y < SIZE && !fits; y++)
				for (let x = 0; x < SIZE && !fits; x++) fits = canPlace(board, piece, x, y);
			c.alpha = fits ? 1 : 0.35;
		});
	}

	private buildPiece(piece: Piece, color: number, cell: number): Container {
		const c = new Container();
		for (const [dx, dy] of piece.cells) {
			const s = new Sprite(this.tiles[color]);
			s.anchor.set(0.5);
			s.scale.set(((cell - 4) / 64) * 1);
			const o = cellOffset(piece, dx, dy, cell);
			s.position.set(o.x, o.y);
			c.addChild(s);
		}
		return c;
	}

	// ---- Dragging --------------------------------------------------------------------------

	beginDrag(slot: number, tp: TrayPiece, finger: Pt) {
		const piece = pieceById(tp.pieceId);
		const c = this.buildPiece(piece, tp.color, CELL);
		const trayC = this.trayContainers[slot];
		if (trayC) trayC.visible = false;
		this.dragLayer.addChild(c);
		this.drag = { slot, piece, color: tp.color, container: c, target: null };
		// Grow from tray size to board size under the finger.
		const start = trayC ? { x: trayC.x, y: trayC.y } : finger;
		c.position.set(start.x, start.y);
		c.scale.set(TRAY_CELL / CELL);
		this.tweens.add({
			duration: 0.12,
			onUpdate: (t) => {
				// A quick release can end the drag before its pickup animation finishes.
				if (this.drag?.container === c) c.scale.set(TRAY_CELL / CELL + (1 - TRAY_CELL / CELL) * t);
			}
		});
	}

	/** Move the dragged piece; shows the ghost + line preview. Returns the snapped target. */
	moveDrag(finger: Pt, board: Board): Pt | null {
		const d = this.drag;
		if (!d) return null;
		const center = dragCenter(finger, d.piece);
		d.container.position.set(center.x, center.y);
		const cell = snap(center, d.piece);
		const valid = canPlace(board, d.piece, cell.x, cell.y);
		const changed =
			valid !== !!d.target || (d.target && (d.target.x !== cell.x || d.target.y !== cell.y));
		d.target = valid ? cell : null;
		if (changed) this.drawGhost(board);
		return d.target;
	}

	private drawGhost(board: Board) {
		const d = this.drag;
		this.ghost.removeChildren().forEach((c) => c.destroy());
		this.highlight.clear();
		this.resetLinePreview(board);
		if (!d?.target) return;
		const { x, y } = d.target;
		for (const [dx, dy] of d.piece.cells) {
			const s = new Sprite(this.tiles[d.color]);
			s.anchor.set(0.5);
			s.scale.set(TILE_SCALE);
			s.alpha = 0.4;
			const c = cellCenter((y + dy) * SIZE + (x + dx));
			s.position.set(c.x, c.y);
			this.ghost.addChild(s);
		}
		// Preview lines that would clear: recolor them in the dragged piece's color.
		const after = place(board, d.piece, x, y, d.color);
		const cells = clearedCells(findClears(after));
		for (const i of cells) {
			const s = this.tileSprites[i]!;
			if (board[i]! > 0) s.texture = this.tiles[d.color]!;
			const c = cellCenter(i);
			this.highlight
				.roundRect(c.x - CELL / 2 + 2, c.y - CELL / 2 + 2, CELL - 4, CELL - 4, 14)
				.fill({ color: 0xffffff, alpha: 0.18 });
		}
	}

	private resetLinePreview(board: Board) {
		board.forEach((color, i) => {
			if (color > 0) this.tileSprites[i]!.texture = this.tiles[color]!;
		});
	}

	/** Remove the drag visuals. If `returnToTray`, animate the piece back first. */
	endDrag(board: Board, returnToTray: boolean) {
		const d = this.drag;
		if (!d) return;
		this.drag = null;
		this.ghost.removeChildren().forEach((c) => c.destroy());
		this.highlight.clear();
		this.resetLinePreview(board);
		const trayC = this.trayContainers[d.slot];
		if (!returnToTray) {
			d.container.destroy({ children: true });
			return;
		}
		const from = { x: d.container.x, y: d.container.y, s: d.container.scale.x };
		const to = slotCenter(d.slot);
		const toScale = TRAY_CELL / CELL;
		this.tweens.add({
			duration: 0.18,
			ease: ease.outCubic,
			onUpdate: (t) => {
				d.container.position.set(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t);
				d.container.scale.set(from.s + (toScale - from.s) * t);
			},
			onComplete: () => {
				d.container.destroy({ children: true });
				if (trayC) trayC.visible = true;
			}
		});
	}

	/** Drop the piece instantly (used when pausing mid-drag). */
	cancelDrag(board: Board) {
		const d = this.drag;
		if (!d) return;
		this.endDrag(board, false);
		const trayC = this.trayContainers[d.slot];
		if (trayC) trayC.visible = true;
	}

	// ---- Move feedback ---------------------------------------------------------------------

	playMove(r: MoveResult) {
		// The board jumps to its post-clear state; placed tiles pop in and cleared tiles are
		// animated out as temporary sprites on the fx layer.
		this.showBoard(r.state.board);
		for (const i of r.placedCells) {
			const s = this.tileSprites[i]!;
			if (s.visible) {
				s.scale.set(TILE_SCALE * 1.25);
				this.tweens.add({
					duration: 0.22,
					ease: ease.outBack,
					onUpdate: (t) => s.scale.set(TILE_SCALE * (1.25 - 0.25 * t))
				});
			}
		}

		if (r.clearedCells.length > 0) {
			const origin = cellCenter(r.placedCells[0]!);
			for (const { index, color } of r.clearedCells) {
				const c = cellCenter(index);
				const s = new Sprite(this.tiles[color]);
				s.anchor.set(0.5);
				s.scale.set(TILE_SCALE);
				s.position.set(c.x, c.y);
				this.fx.addChild(s);
				const delay = Math.hypot(c.x - origin.x, c.y - origin.y) / CELL / 40;
				this.tweens.add({
					duration: 0.28,
					delay,
					ease: ease.inQuad,
					onUpdate: (t) => {
						s.scale.set(TILE_SCALE * (1 + 0.2 * t - 1.2 * t * t));
						s.alpha = 1 - t;
					},
					onComplete: () => {
						s.destroy();
						this.burst(c, 2);
					}
				});
			}
			this.shake = Math.min(6 + r.clearedCells.length / 2, 18);
		}

		// Popups: points at the piece, combo stacked above it (kept on screen near the top).
		const at = cellCenter(r.placedCells[Math.floor(r.placedCells.length / 2)]!);
		this.popup(`+${r.points}`, at, 54, palette.white);
		if (r.state.combo >= 2) {
			const comboAt = { x: W / 2, y: Math.max(at.y - 110, BOARD_Y + 60) };
			if (comboAt.y > at.y - 80) comboAt.y = at.y + 110;
			this.popup(`Combo ×${r.state.combo}`, comboAt, 80, palette.yellow, 0.1);
		}
		if (r.boardCleared) {
			this.popup('Board clear!', { x: W / 2, y: BOARD_Y + BOARD_PX / 2 }, 72, palette.green, 0.25);
		}
	}

	popup(text: string, at: Pt, size: number, color: number, delay = 0) {
		const t = new Text({
			text,
			style: {
				fill: color,
				fontSize: size,
				fontWeight: '900',
				fontFamily: 'ui-rounded, system-ui, -apple-system, sans-serif',
				stroke: { color: palette.bgDeep, width: 10, join: 'round' }
			},
			anchor: 0.5
		});
		t.position.set(at.x, at.y);
		t.scale.set(0);
		this.fx.addChild(t);
		this.tweens.add({
			duration: 0.9,
			delay,
			ease: ease.linear,
			onUpdate: (p) => {
				const pop = Math.min(p / 0.2, 1);
				t.scale.set(ease.outBack(pop));
				t.y = at.y - 70 * ease.outQuad(p);
				t.alpha = p < 0.65 ? 1 : 1 - (p - 0.65) / 0.35;
			},
			onComplete: () => t.destroy()
		});
	}

	burst(at: Pt, count: number) {
		for (let i = 0; i < count && this.particles.length < MAX_PARTICLES; i++) {
			const s = new Sprite(this.star);
			s.anchor.set(0.5);
			s.scale.set(0.6 + Math.random() * 0.5);
			s.position.set(at.x, at.y);
			this.fx.addChild(s);
			const a = Math.random() * Math.PI * 2;
			const v = 180 + Math.random() * 260;
			this.particles.push({
				sprite: s,
				vx: Math.cos(a) * v,
				vy: Math.sin(a) * v - 200,
				spin: (Math.random() - 0.5) * 8,
				life: 0,
				maxLife: 0.6 + Math.random() * 0.3
			});
		}
	}

	/** Gray out the board row by row, then call `done`. */
	playGameOver(board: Board, done: () => void) {
		for (let row = 0; row < SIZE; row++) {
			this.tweens.add({
				duration: 0.01,
				delay: row * 0.07,
				onUpdate: () => {},
				onComplete: () => {
					for (let x = 0; x < SIZE; x++) {
						const i = row * SIZE + x;
						if (board[i]! > 0) this.tileSprites[i]!.texture = this.tiles[0]!;
					}
				}
			});
		}
		this.trayContainers.forEach((c) => c && (c.alpha = 0.3));
		this.tweens.add({
			duration: 0.01,
			delay: SIZE * 0.07 + 0.6,
			onUpdate: () => {},
			onComplete: done
		});
	}

	// ---- Per-frame ---------------------------------------------------------------------------

	update(dt: number) {
		this.tweens.update(dt);

		// Score counts up smoothly.
		if (this.shownScore !== this.targetScore) {
			const diff = this.targetScore - this.shownScore;
			this.shownScore +=
				Math.sign(diff) * Math.max(Math.abs(diff) * dt * 10, Math.min(Math.abs(diff), 60 * dt));
			if (Math.abs(this.targetScore - this.shownScore) < 0.5) this.shownScore = this.targetScore;
			this.scoreText.text = String(Math.round(this.shownScore));
		}

		for (let i = this.particles.length - 1; i >= 0; i--) {
			const p = this.particles[i]!;
			p.life += dt;
			p.vy += 900 * dt;
			p.sprite.x += p.vx * dt;
			p.sprite.y += p.vy * dt;
			p.sprite.rotation += p.spin * dt;
			p.sprite.alpha = 1 - p.life / p.maxLife;
			if (p.life >= p.maxLife) {
				p.sprite.destroy();
				this.particles.splice(i, 1);
			}
		}

		if (this.shake > 0 && !this.reducedMotion()) {
			this.boardLayer.position.set(
				(Math.random() - 0.5) * this.shake,
				(Math.random() - 0.5) * this.shake
			);
			this.shake = Math.max(0, this.shake - 60 * dt);
		} else {
			this.shake = 0;
			this.boardLayer.position.set(0, 0);
		}
	}

	render() {
		this.stage.app.render();
	}

	/** Stop all in-flight animations and clear transient visuals (used on restart). */
	resetFx() {
		this.tweens.clear();
		this.fx.removeChildren().forEach((c) => c.destroy());
		this.particles = [];
		this.dragLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
		this.drag = null;
		this.ghost.removeChildren().forEach((c) => c.destroy());
		this.highlight.clear();
		this.shake = 0;
	}
}
