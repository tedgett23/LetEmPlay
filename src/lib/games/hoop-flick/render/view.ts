// All Hoop Flick drawing and effects. Everything is drawn in code (vector shapes baked into
// textures once), so it stays sharp at any size. The view never decides rules: index.ts feeds it
// GameState every frame and calls the effect methods for GameEvents.
import { Container, Graphics, Rectangle, Sprite, Text, type Texture } from '../../../kit/pixi';
import type { PixiStage } from '../../../kit/pixi';
import { palette } from '../../../kit/theme';
import { ease, Tweens } from '../../../kit/tween';
import type { Aim } from '../logic/aim';
import type { GameState } from '../logic/game';
import type { Ball } from '../logic/physics';
import { project } from '../logic/projection';
import { TUNING } from '../logic/tuning';
import { ballInHand, formatTime, H, HUD, PAUSE, ringPoints, W, type Pt } from './layout';

const HOOP = TUNING.hoop;
const BOARD = TUNING.board;
const BALL_R = TUNING.ball.radius;
const TEX_R = 64; // ball texture radius in px
const FONT = 'ui-rounded, system-ui, -apple-system, sans-serif';
const MAX_PARTICLES = 160;

const colors = {
	ball: 0xf28c28,
	seam: 0x4a2208,
	rim: palette.orange,
	fireRim: palette.yellow,
	board: 0xf4f6ff,
	pole: 0x8a8fb5,
	floor: 0x2c2470,
	floorLine: 0x4b3fb0
};

interface Particle {
	sprite: Sprite;
	vx: number;
	vy: number;
	gravity: number;
	life: number;
	maxLife: number;
	grow: number;
}

interface BallSprites {
	ball: Sprite;
	shadow: Sprite;
}

function text(size: number, color: number = palette.white, alpha = 1, stroke = false) {
	return new Text({
		text: '',
		style: {
			fill: color,
			fontSize: size,
			fontWeight: '900',
			fontFamily: FONT,
			...(stroke ? { stroke: { color: palette.bgDeep, width: 10, join: 'round' as const } } : {})
		},
		alpha,
		anchor: 0.5
	});
}

export class HoopFlickView {
	readonly tweens = new Tweens();
	private textures: Texture[] = [];
	private ballTex: Texture;
	private shadowTex: Texture;
	private sparkTex: Texture;

	private world = new Container();
	private boardLayer = new Container();
	private shadows = new Container();
	private rimBack = new Graphics();
	private netBack = new Graphics();
	private deepBalls = new Container();
	private netFront = new Graphics();
	private rimFront = new Graphics();
	private nearBalls = new Container();
	private hand: Sprite;
	private fx = new Container();
	private debug = new Graphics();
	private debugText: Text;
	private debugAge = Infinity;

	private sprites = new Map<number, BallSprites>();
	private live = new Set<number>();
	private particles: Particle[] = [];

	private scoreText: Text;
	private bestText: Text;
	private timerText: Text;
	private hint: Text;
	private fireBanner: Text;

	private shownScore = 0;
	private targetScore = 0;
	private shake = 0;
	private netStretch = 0;
	private netStretchV = 0;
	private netSway = 0;
	private handReady = true;
	private handPress = 0;
	/** 0→1 while a fresh ball pops into your hand. */
	private handPop = 1;
	private hintTime = 0;
	private onFire = false;
	private time = 0;
	private timerUrgent = false;
	private hoopKey = '';

	constructor(
		private stage: PixiStage,
		private reducedMotion: () => boolean
	) {
		this.ballTex = this.bake(drawBall());
		this.shadowTex = this.bake(new Graphics().ellipse(0, 0, 64, 18).fill({ color: 0x000000 }));
		this.sparkTex = this.bake(
			new Graphics()
				.circle(0, 0, 16)
				.fill({ color: 0xffffff, alpha: 0.25 })
				.circle(0, 0, 11)
				.fill({ color: 0xffffff, alpha: 0.5 })
				.circle(0, 0, 6)
				.fill(0xffffff)
		);

		// Static scenery is baked into single textures: one quad each instead of dozens of shapes.
		const room = new Sprite(this.bake(drawRoom(), new Rectangle(0, 0, W, H)));
		const boardG = drawBoard();
		const bb = boardG.getLocalBounds().rectangle.clone().pad(2);
		const board = new Sprite(this.bake(boardG, bb));
		board.position.set(bb.x, bb.y);
		this.boardLayer.addChild(board);

		this.world.addChild(
			room,
			this.shadows,
			this.boardLayer,
			this.rimBack,
			this.netBack,
			this.deepBalls,
			this.netFront,
			this.rimFront,
			this.nearBalls
		);
		this.shadows.alpha = 0.35;

		const hb = ballInHand();
		this.hand = new Sprite(this.ballTex);
		this.hand.anchor.set(0.5);
		this.hand.position.set(hb.x, hb.y);
		this.hand.scale.set(hb.r / TEX_R);

		this.hint = text(44, palette.white, 1, true);
		this.hint.text = 'Flick the ball up!';
		this.hint.position.set(W / 2, hb.y - hb.r - 70);

		// HUD
		this.scoreText = text(84);
		this.scoreText.anchor.set(0, 0.5);
		this.scoreText.position.set(HUD.score.x, HUD.score.y + 20);
		this.bestText = text(30, palette.white, 0.7);
		this.bestText.anchor.set(0, 0.5);
		this.bestText.position.set(HUD.score.x + 4, HUD.score.y + 84);
		this.timerText = text(72);
		this.timerText.position.set(HUD.timer.x, HUD.timer.y);
		this.fireBanner = text(48, palette.yellow, 1, true);
		this.fireBanner.text = 'On fire!  ×2';
		this.fireBanner.position.set(W / 2, 290);
		this.fireBanner.visible = false;

		const pause = new Graphics()
			.roundRect(0, 0, PAUSE.size, PAUSE.size, 26)
			.fill({ color: 0xffffff, alpha: 0.14 })
			.roundRect(31, 26, 12, 44, 4)
			.fill(palette.white)
			.roundRect(53, 26, 12, 44, 4)
			.fill(palette.white);
		pause.position.set(PAUSE.x, PAUSE.y);

		this.debugText = text(26, palette.green);
		this.debugText.position.set(W / 2, 1240);

		stage.root.addChild(this.world, this.hand, this.fx, this.hint, this.fireBanner);
		stage.root.addChild(this.scoreText, this.bestText, this.timerText, pause);
		stage.root.addChild(this.debug, this.debugText);
	}

	private bake(g: Container, frame?: Rectangle): Texture {
		const t = this.stage.app.renderer.generateTexture({
			target: g,
			frame,
			resolution: 2,
			antialias: true
		});
		g.destroy({ children: true });
		this.textures.push(t);
		return t;
	}

	// ---- HUD -----------------------------------------------------------------------------

	setScore(score: number, instant = false) {
		this.targetScore = score;
		if (instant) {
			this.shownScore = score;
			this.scoreText.text = String(score);
		}
	}

	setBest(best: number) {
		this.bestText.text = `Best ${best}`;
	}

	showHint(show: boolean) {
		this.hint.visible = show;
		this.hintTime = 0;
	}

	// ---- Per-frame sync from game state ----------------------------------------------------

	sync(s: GameState, canThrow: boolean) {
		const hx = s.hoop.x;
		this.boardLayer.x = hx * project(0, 0, BOARD.z).k;
		// Rebuilding the rim and net geometry is the costliest per-frame work; skip it when still.
		const key = `${hx.toFixed(4)}|${s.onFire}|${this.netStretch.toFixed(3)}|${this.netSway.toFixed(3)}`;
		if (key !== this.hoopKey) {
			this.hoopKey = key;
			this.drawHoop(hx, s.onFire);
		}
		this.syncBalls(s.balls, s.onFire);

		if (canThrow && !this.handReady) {
			// A fresh ball pops into your hand.
			this.handReady = true;
			this.handPop = 0;
		}
		if (!canThrow) this.handReady = false;
		this.hand.visible = canThrow;
		this.hand.tint = s.onFire ? 0xffe0a0 : 0xffffff;

		const t = Math.ceil(s.timeLeft);
		// Only touch Text when it changes: every change re-rasterises it.
		const label = formatTime(s.timeLeft);
		if (this.timerText.text !== label) this.timerText.text = label;
		const urgent = t <= TUNING.round.tickFrom;
		if (urgent !== this.timerUrgent) {
			this.timerUrgent = urgent;
			this.timerText.style.fill = urgent ? palette.pink : palette.white;
		}
		this.onFire = s.onFire;
		this.fireBanner.visible = s.onFire;
	}

	private drawHoop(hx: number, fire: boolean) {
		const rimColor = fire ? colors.fireRim : colors.rim;
		const pts = ringPoints(hx, HOOP.rimY, HOOP.z, HOOP.rimRadius, 28).map((p) => ({
			...p,
			s: project(p.x, p.y, p.z)
		}));
		const k = project(hx, HOOP.rimY, HOOP.z).k;
		const width = HOOP.rimTube * 2 * k * 1.4;

		for (const g of [this.rimBack, this.rimFront, this.netBack, this.netFront]) g.clear();
		for (let i = 0; i < pts.length; i++) {
			const a = pts[i]!;
			const b = pts[(i + 1) % pts.length]!;
			const g = (a.z + b.z) / 2 >= HOOP.z ? this.rimBack : this.rimFront;
			g.moveTo(a.s.x, a.s.y).lineTo(b.s.x, b.s.y);
		}
		for (const g of [this.rimBack, this.rimFront]) {
			// Opaque so the overlapping segment caps don't show as beads.
			if (fire) g.stroke({ color: 0xff8fa8, width: width * 1.6, cap: 'round' });
			g.stroke({ color: rimColor, width, cap: 'round' });
		}

		// The net: three rings joined in a diamond lattice. It stretches and sways after a basket.
		const n = 12;
		const st = this.netStretch;
		const sway = this.netSway;
		const depth = HOOP.netDepth * (1 + 0.35 * st);
		const rings = [
			{ y: HOOP.rimY, r: HOOP.rimRadius, off: 0, sway: 0 },
			{ y: HOOP.rimY - depth * 0.5, r: HOOP.rimRadius * (0.85 - 0.1 * st), off: 0.5, sway: 0.5 },
			{ y: HOOP.rimY - depth, r: HOOP.rimRadius * (0.62 - 0.12 * st), off: 0, sway: 1 }
		].map((ring) => {
			const out = [];
			for (let i = 0; i < n; i++) {
				const a = ((i + ring.off) / n) * Math.PI * 2;
				const x = hx + Math.cos(a) * ring.r + sway * ring.sway * 0.06;
				const z = HOOP.z + Math.sin(a) * ring.r;
				out.push({ z, s: project(x, ring.y, z) });
			}
			return out;
		});
		const line = (a: { z: number; s: Pt }, b: { z: number; s: Pt }) => {
			const g = (a.z + b.z) / 2 >= HOOP.z ? this.netBack : this.netFront;
			g.moveTo(a.s.x, a.s.y).lineTo(b.s.x, b.s.y);
		};
		const [top, mid, bottom] = rings as [(typeof rings)[0], (typeof rings)[0], (typeof rings)[0]];
		for (let i = 0; i < n; i++) {
			const j = (i + 1) % n;
			line(top[i]!, mid[i]!);
			line(top[j]!, mid[i]!);
			line(mid[i]!, bottom[i]!);
			line(mid[i]!, bottom[j]!);
			line(bottom[i]!, bottom[j]!);
		}
		const netWidth = Math.max(2, 0.012 * k);
		this.netBack.stroke({ color: 0xffffff, width: netWidth, alpha: 0.55 });
		this.netFront.stroke({ color: 0xffffff, width: netWidth, alpha: 0.9 });
	}

	private syncBalls(balls: Ball[], fire: boolean) {
		const live = this.live;
		live.clear();
		for (const b of balls) {
			live.add(b.id);
			let sp = this.sprites.get(b.id);
			if (!sp) {
				const ball = new Sprite(this.ballTex);
				ball.anchor.set(0.5);
				const shadow = new Sprite(this.shadowTex);
				shadow.anchor.set(0.5);
				this.shadows.addChild(shadow);
				sp = { ball, shadow };
				this.sprites.set(b.id, sp);
			}
			const p = project(b.x, b.y, b.z);
			sp.ball.position.set(p.x, p.y);
			sp.ball.scale.set((BALL_R * p.k) / TEX_R);
			sp.ball.rotation = b.spin;
			sp.ball.tint = fire ? 0xffe0a0 : 0xffffff;
			// Fade out at the end of its linger time.
			const fade = b.resolved ? Math.min(1, (TUNING.round.lingerSeconds - b.resolvedAge) / 0.4) : 1;
			sp.ball.alpha = Math.max(0, fade);

			const f = project(b.x, 0, b.z);
			const lift = Math.min(b.y / 3, 1);
			sp.shadow.position.set(f.x, f.y);
			sp.shadow.scale.set(((BALL_R * f.k) / TEX_R) * (1.1 - 0.5 * lift));
			sp.shadow.alpha = (1 - 0.7 * lift) * Math.max(0, fade);

			// Draw order fakes occlusion: balls at or behind the rim go between its back and front.
			const deep = b.z > HOOP.z - HOOP.rimRadius - BALL_R && b.y < HOOP.rimY + 0.6;
			const layer = deep ? this.deepBalls : this.nearBalls;
			if (sp.ball.parent !== layer) layer.addChild(sp.ball);

			if (fire && !b.resolved && this.particles.length < MAX_PARTICLES) {
				this.spark(
					{ x: p.x + (Math.random() - 0.5) * 20, y: p.y + (Math.random() - 0.5) * 20 },
					Math.random() < 0.5 ? palette.orange : palette.yellow,
					{ vx: (Math.random() - 0.5) * 40, vy: -60, gravity: -80, life: 0.45, size: p.k / 600 }
				);
			}
		}
		for (const [id, sp] of this.sprites) {
			if (live.has(id)) continue;
			sp.ball.destroy();
			sp.shadow.destroy();
			this.sprites.delete(id);
		}
	}

	// ---- Effects -----------------------------------------------------------------------------

	pressHand(down: boolean) {
		this.handPress = down ? 1 : 0;
	}

	/** Basket celebration at the hoop. */
	basket(hx: number, points: number, swish: boolean, fire: boolean) {
		const at = project(hx, HOOP.rimY, HOOP.z);
		this.netStretchV += swish ? 9 : 6;
		this.netSway += (Math.random() - 0.5) * 2;
		const color = fire ? palette.orange : swish ? palette.yellow : palette.white;
		this.popup(`+${points}`, { x: at.x, y: at.y - 90 }, 72, color);
		if (swish) this.popup('Swish!', { x: at.x, y: at.y - 170 }, 54, palette.green, 0.08);
		const count = swish ? 22 : 12;
		for (let i = 0; i < count; i++) {
			const a = Math.random() * Math.PI * 2;
			const sp = 200 + Math.random() * 300;
			this.spark(
				{ x: at.x, y: at.y },
				[palette.yellow, palette.green, palette.pink, palette.blue][i % 4]!,
				{ vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 200, gravity: 900, life: 0.8, size: 1 }
			);
		}
	}

	rimHit(speed: number) {
		this.shake = Math.max(this.shake, Math.min(4 + speed * 3, 12));
	}

	fire(on: boolean) {
		if (!on) return;
		const b = this.fireBanner;
		this.tweens.add({
			duration: 0.5,
			ease: ease.outBack,
			onUpdate: (p) => b.scale.set(0.3 + 0.7 * p)
		});
	}

	level(level: number) {
		this.popup(
			level === 1 ? 'The hoop is moving!' : 'Faster!',
			{ x: W / 2, y: 720 },
			56,
			palette.blue
		);
	}

	tick() {
		const t = this.timerText;
		this.tweens.add({
			duration: 0.35,
			onUpdate: (p) => t.scale.set(1.35 - 0.35 * p)
		});
	}

	timeUp() {
		this.popup('Time!', { x: W / 2, y: 700 }, 120, palette.pink);
	}

	/** Dev builds only: draws the flick vector and the aim numbers to help tune feel. */
	debugFlick(from: Pt, v: { vx: number; vy: number }, aim: Aim | null) {
		this.debug.clear();
		this.debug
			.moveTo(from.x, from.y)
			.lineTo(from.x + v.vx * 100, from.y + v.vy * 100)
			.stroke({ color: palette.green, width: 6 })
			.circle(from.x, from.y, 10)
			.fill(palette.green);
		this.debugText.text = aim
			? `speed ${(-v.vy).toFixed(2)}  power ${aim.power.toFixed(2)}→${aim.assistedPower.toFixed(2)}  aim ${aim.aimX.toFixed(2)}→${aim.assistedX.toFixed(2)}`
			: `speed ${(-v.vy).toFixed(2)}: not a throw`;
		this.debugAge = 0;
	}

	private popup(label: string, at: Pt, size: number, color: number, delay = 0) {
		const t = text(size, color, 1, true);
		t.text = label;
		t.position.set(at.x, at.y);
		t.scale.set(0);
		this.fx.addChild(t);
		this.tweens.add({
			duration: 1,
			delay,
			ease: ease.linear,
			onUpdate: (p) => {
				t.scale.set(ease.outBack(Math.min(p / 0.2, 1)));
				t.y = at.y - 60 * ease.outQuad(p);
				t.alpha = p < 0.65 ? 1 : 1 - (p - 0.65) / 0.35;
			},
			onComplete: () => t.destroy()
		});
	}

	private spark(
		at: Pt,
		color: number,
		o: { vx: number; vy: number; gravity: number; life: number; size: number }
	) {
		if (this.particles.length >= MAX_PARTICLES) return;
		const s = new Sprite(this.sparkTex);
		s.anchor.set(0.5);
		s.tint = color;
		s.position.set(at.x, at.y);
		s.scale.set(o.size);
		s.blendMode = 'add';
		this.fx.addChild(s);
		this.particles.push({
			sprite: s,
			vx: o.vx,
			vy: o.vy,
			gravity: o.gravity,
			life: 0,
			maxLife: o.life,
			grow: o.size
		});
	}

	// ---- Loop ----------------------------------------------------------------------------------

	update(dt: number) {
		this.time += dt;
		this.tweens.update(dt);

		if (this.shownScore !== this.targetScore) {
			const diff = this.targetScore - this.shownScore;
			this.shownScore += Math.sign(diff) * Math.max(Math.abs(diff) * dt * 8, 12 * dt);
			if (Math.abs(this.targetScore - this.shownScore) < 0.3) this.shownScore = this.targetScore;
			this.scoreText.text = String(Math.round(this.shownScore));
		}

		// Net spring.
		this.netStretchV += (-60 * this.netStretch - 7 * this.netStretchV) * dt;
		this.netStretch = Math.max(-0.3, this.netStretch + this.netStretchV * dt);
		this.netSway *= Math.exp(-3 * dt);

		// The ball in hand breathes, and squashes while touched.
		const base = ballInHand();
		this.hand.y = base.y + Math.sin(this.time * 3) * 4 + this.handPress * 6;
		this.handPop = Math.min(1, this.handPop + dt / 0.22);
		const pop = 0.4 + 0.6 * ease.outBack(this.handPop);
		this.hand.scale.set((base.r / TEX_R) * pop * (1 - 0.05 * this.handPress));
		if (this.hint.visible) {
			this.hintTime += dt;
			this.hint.alpha = 0.65 + 0.35 * Math.sin(this.hintTime * 4);
		}
		if (this.onFire) this.fireBanner.alpha = 0.75 + 0.25 * Math.sin(this.time * 8);

		for (let i = this.particles.length - 1; i >= 0; i--) {
			const p = this.particles[i]!;
			p.life += dt;
			p.vy += p.gravity * dt;
			p.sprite.x += p.vx * dt;
			p.sprite.y += p.vy * dt;
			const t = p.life / p.maxLife;
			p.sprite.alpha = 1 - t;
			p.sprite.scale.set(p.grow * (1 - 0.5 * t));
			if (p.life >= p.maxLife) {
				p.sprite.destroy();
				this.particles.splice(i, 1);
			}
		}

		if (this.shake > 0 && !this.reducedMotion()) {
			this.world.position.set(
				(Math.random() - 0.5) * this.shake,
				(Math.random() - 0.5) * this.shake
			);
			this.shake = Math.max(0, this.shake - 50 * dt);
		} else {
			this.shake = 0;
			this.world.position.set(0, 0);
		}

		this.debugAge += dt;
		if (this.debugAge > 1.5) {
			this.debug.clear();
			this.debugText.text = '';
		}
	}

	render() {
		this.stage.app.render();
	}

	/** Clear transient effects (restart). */
	resetFx() {
		this.tweens.clear();
		this.fx.removeChildren().forEach((c) => c.destroy());
		this.particles = [];
		for (const sp of this.sprites.values()) {
			sp.ball.destroy();
			sp.shadow.destroy();
		}
		this.sprites.clear();
		this.netStretch = this.netStretchV = this.netSway = 0;
		this.shake = 0;
		this.fireBanner.visible = false;
		this.fireBanner.scale.set(1);
		this.timerText.scale.set(1);
		this.hoopKey = '';
		this.handReady = true;
		this.handPop = 1;
		this.debug.clear();
		this.debugText.text = '';
	}

	/** Free the baked textures (the stage destroys the display tree). */
	destroy() {
		this.resetFx();
		for (const t of this.textures) t.destroy(true);
		this.textures = [];
	}
}

// ---- Static drawings ---------------------------------------------------------------------------

function drawBall(): Graphics {
	const r = TEX_R;
	const seam = { color: colors.seam, width: 5, cap: 'round' as const };
	return new Graphics()
		.circle(0, 0, r)
		.fill(colors.ball)
		.circle(-r * 0.32, -r * 0.36, r * 0.34)
		.fill({ color: 0xffffff, alpha: 0.18 })
		.moveTo(0, -r)
		.lineTo(0, r)
		.moveTo(-r, 0)
		.lineTo(r, 0)
		.moveTo(-r * 0.62, -r * 0.78)
		.quadraticCurveTo(-r * 0.2, 0, -r * 0.62, r * 0.78)
		.moveTo(r * 0.62, -r * 0.78)
		.quadraticCurveTo(r * 0.2, 0, r * 0.62, r * 0.78)
		.stroke(seam)
		.circle(0, 0, r - 2)
		.stroke({ color: colors.seam, width: 4 });
}

/** Wall, floor and court lines. Static, drawn once. */
function drawRoom(): Container {
	const room = new Container();
	const floorY = project(0, 0, TUNING.wallZ).y;

	// Wall: a vertical gradient from deep to the main background colour, in bands.
	const wall = new Graphics();
	const bands = 24;
	for (let i = 0; i < bands; i++) {
		const t = i / (bands - 1);
		wall
			.rect(0, (floorY / bands) * i, W, floorY / bands + 1)
			.fill(lerpColor(palette.bgDeep, palette.bg, t));
	}
	// Soft spotlight behind the hoop.
	const spot = project(0, 3.3, TUNING.wallZ);
	for (let i = 6; i >= 1; i--) {
		wall.circle(spot.x, spot.y, 60 * i).fill({ color: palette.brand, alpha: 0.05 });
	}
	// A row of arcade bulbs along the top of the wall.
	for (let x = 30; x < W; x += 60) {
		wall.circle(x, 186, 7).fill({ color: palette.yellow, alpha: 0.5 });
	}

	// Floor: everything below the wall line, with a free-throw style key in perspective.
	const floor = new Graphics().rect(0, floorY, W, H - floorY).fill(colors.floor);
	const key = [
		[-0.9, TUNING.wallZ],
		[-0.9, 1.2],
		[0.9, 1.2],
		[0.9, TUNING.wallZ]
	].map(([x, z]) => project(x!, 0, z!));
	floor.poly(key.flatMap((p) => [p.x, p.y])).fill({ color: colors.floorLine, alpha: 0.35 });
	floor.moveTo(0, floorY).lineTo(W, floorY).stroke({ color: colors.floorLine, width: 4 });

	room.addChild(wall, floor);
	return room;
}

/** Backboard and pole, drawn for a hoop at x = 0 (the layer is shifted as the hoop moves). */
function drawBoard(): Graphics {
	const g = new Graphics();
	const poleZ = BOARD.z + 0.3;
	const poleTop = project(0, BOARD.bottom, poleZ);
	const poleBottom = project(0, 0, poleZ);
	const pw = 0.07 * poleTop.k;
	g.rect(poleTop.x - pw / 2, poleTop.y, pw, poleBottom.y - poleTop.y).fill(colors.pole);
	g.ellipse(poleBottom.x, poleBottom.y, pw * 2.2, pw * 0.6).fill({ color: 0x000000, alpha: 0.25 });

	const tl = project(-BOARD.width / 2, BOARD.top, BOARD.z);
	const br = project(BOARD.width / 2, BOARD.bottom, BOARD.z);
	g.roundRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y, 14)
		.fill({ color: colors.board, alpha: 0.95 })
		.stroke({ color: palette.blue, width: 8 });

	// The target square above the rim.
	const sq1 = project(-0.3, HOOP.rimY + 0.45, BOARD.z);
	const sq2 = project(0.3, HOOP.rimY + 0.02, BOARD.z);
	g.rect(sq1.x, sq1.y, sq2.x - sq1.x, sq2.y - sq1.y).stroke({ color: palette.pink, width: 7 });

	// Bracket from the board to the back of the rim.
	const b1 = project(0, HOOP.rimY, BOARD.z);
	const b2 = project(0, HOOP.rimY, HOOP.z + HOOP.rimRadius);
	g.rect(b1.x - 14, b2.y - 4, 28, b1.y - b2.y + 8).fill(colors.pole);
	return g;
}

function lerpColor(a: number, b: number, t: number): number {
	const ch = (c: number, s: number) => (c >> s) & 0xff;
	const mix = (s: number) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * t);
	return (mix(16) << 16) | (mix(8) << 8) | mix(0);
}
