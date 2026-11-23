// All Web Slinger drawing and effects, in code (no sprite sheets). Static scenery is built once
// per level; the hero, robbers, webs and balloons are redrawn each frame from GameState. The
// view never decides rules: index.ts feeds it state and calls the effect methods for events.
import {
	Container,
	Graphics,
	Rectangle,
	Sprite,
	Text,
	TilingSprite,
	type Texture
} from '../../../kit/pixi';
import type { PixiStage } from '../../../kit/pixi';
import { palette } from '../../../kit/theme';
import { ease, Tweens } from '../../../kit/tween';
import { aimFromHero, type Baddie, type GameState } from '../logic/game';
import type { Level } from '../logic/levels';
import { TUNING } from '../logic/tuning';
import { cameraY, H, PAUSE, SCALE, W, type Pt } from './layout';

const S = SCALE;
const FONT = 'ui-rounded, system-ui, -apple-system, sans-serif';
const MAX_PARTICLES = 140;

const colors = {
	skyTop: 0x7fc8ff,
	skyBottom: 0xd9f1ff,
	far: 0xb3c7ee,
	mid: 0x8fa6dd,
	street: 0x3a3f5c,
	wall: 0x4a4f78,
	wallLight: 0x6a70a0,
	ledgeTop: palette.green,
	ledgeBody: 0x3a3f66,
	spike: palette.pink,
	buildings: [0x5b4cf0, 0x3d8bd6, 0xe0703b, 0x2fb38a, 0xc0508a, 0x7a5ad8],
	suit: 0x16a99b,
	suitDark: 0x0e7b71,
	scarf: palette.yellow,
	skin: 0xffd7b0,
	robberDark: 0x23243a,
	balloon: 0x4cc9f0
};

// World container coordinates: x right, y up (negated). The container itself scrolls.
const wx = (x: number) => x * S;
const wy = (y: number) => -y * S;
const TH = TUNING.ledge.thickness;

interface Particle {
	sprite: Sprite;
	vx: number;
	vy: number;
	gravity: number;
	life: number;
	maxLife: number;
	size: number;
}

interface RobberSprite {
	root: Container;
	body: Graphics;
	balloon: Graphics;
	web: Graphics;
	stars: Container;
	/** "!" when they've spotted you. */
	alert: Text;
	tipping: boolean;
	/** Tumbling down after being caught (world metres), until they land below. */
	fallY: number;
	fallVy: number;
	fallX: number;
	landY: number;
}

function text(size: number, color: number = palette.white, stroke = true) {
	return new Text({
		text: '',
		style: {
			fill: color,
			fontSize: size,
			fontWeight: '900',
			fontFamily: FONT,
			...(stroke ? { stroke: { color: palette.bgDeep, width: 10, join: 'round' as const } } : {})
		},
		anchor: 0.5
	});
}

export class WebSlingerView {
	readonly tweens = new Tweens();
	private textures: Texture[] = [];
	private coinTex: Texture;
	private sparkTex: Texture;
	private heartTex: Texture;
	private starTex: Texture;

	private far: TilingSprite;
	private mid: TilingSprite;
	private world = new Container();
	private levelLayer = new Container();
	private coinsLayer = new Container();
	private coinSprites: Sprite[] = [];
	private robbersLayer = new Container();
	private robbers: RobberSprite[] = [];
	private dynamic = new Graphics(); // web line, shots, balloons
	private hero = new Graphics();
	private fx = new Container();
	private particles: Particle[] = [];

	private hearts: Sprite[] = [];
	private scoreText: Text;
	private levelText: Text;
	private banner: Text;
	private hint: Text;
	private hintTime = 99;
	private bannerStars = new Container();

	private camY = -1;
	/** The line being drawn: direction in world space (y up) and strength 0..1. */
	private aimLine: { dx: number; dy: number; power: number } | null = null;
	private heads = new Container();
	private time = 0;
	private shake = 0;
	private shownScore = 0;
	private targetScore = 0;
	private levelKey = '';

	constructor(
		private stage: PixiStage,
		private reducedMotion: () => boolean
	) {
		this.coinTex = this.bake(
			new Graphics()
				.circle(0, 0, 24)
				.fill(0xffc83d)
				.circle(0, 0, 24)
				.stroke({ color: 0xc98a12, width: 4 })
				.circle(0, 0, 13)
				.stroke({ color: 0xfff0b0, width: 4 })
		);
		this.sparkTex = this.bake(
			new Graphics()
				.circle(0, 0, 14)
				.fill({ color: 0xffffff, alpha: 0.3 })
				.circle(0, 0, 8)
				.fill(0xffffff)
		);
		this.heartTex = this.bake(
			new Graphics()
				.moveTo(0, 14)
				.bezierCurveTo(-30, -8, -14, -30, 0, -14)
				.bezierCurveTo(14, -30, 30, -8, 0, 14)
				.fill(palette.pink)
				.stroke({ color: 0xffffff, width: 3 })
		);
		this.starTex = this.bake(starShape(30, 0xffc83d));

		const sky = new Sprite(this.bake(drawSky(), new Rectangle(0, 0, W, H)));
		this.far = new TilingSprite({
			texture: this.bake(drawSkyline(colors.far, 7, 15, 1), new Rectangle(0, 0, 1440, 520)),
			width: W,
			height: 520
		});
		this.far.y = H - 520 + 60;
		this.mid = new TilingSprite({
			texture: this.bake(drawSkyline(colors.mid, 4, 10, 2), new Rectangle(0, 0, 1440, 400)),
			width: W,
			height: 400
		});
		this.mid.y = H - 400 + 60;

		this.world.addChild(
			this.levelLayer,
			this.coinsLayer,
			this.robbersLayer,
			this.dynamic,
			this.hero,
			this.fx
		);

		// HUD.
		for (let i = 0; i < TUNING.hearts; i++) {
			const h = new Sprite(this.heartTex);
			h.anchor.set(0.5);
			h.scale.set(0.9);
			h.position.set(56 + i * 62, 82);
			this.hearts.push(h);
		}
		this.scoreText = text(64);
		this.scoreText.position.set(W / 2 + 40, 82);
		this.levelText = text(30, palette.white);
		this.levelText.position.set(150, 140);
		this.heads.position.set(W / 2, 196);
		this.banner = text(64, palette.yellow);
		this.banner.position.set(W / 2, 420);
		this.banner.alpha = 0;
		this.bannerStars.position.set(W / 2, 530);
		this.hint = text(36, palette.white);
		this.hint.style.wordWrap = true;
		this.hint.style.wordWrapWidth = W - 80;
		this.hint.style.align = 'center';
		this.hint.position.set(W / 2, 520);
		this.hint.alpha = 0;
		const pause = new Graphics()
			.roundRect(0, 0, PAUSE.size, PAUSE.size, 26)
			.fill({ color: palette.bgDeep, alpha: 0.35 })
			.roundRect(31, 26, 12, 44, 4)
			.fill(palette.white)
			.roundRect(53, 26, 12, 44, 4)
			.fill(palette.white);
		pause.position.set(PAUSE.x, PAUSE.y);

		stage.root.addChild(sky, this.far, this.mid, this.world);
		stage.root.addChild(...this.hearts, this.scoreText, this.levelText, this.heads, pause);
		stage.root.addChild(this.banner, this.hint, this.bannerStars);
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

	/** Pointer (logical px) → world metres, using the current camera. */
	toWorld(p: Pt): Pt {
		return { x: p.x / S, y: (H - p.y) / S + this.camY };
	}

	// ---- Level scenery -------------------------------------------------------------------------

	private buildLevel(s: GameState) {
		const level = s.level;
		for (const c of this.levelLayer.removeChildren()) c.destroy({ children: true });
		this.levelLayer.addChild(drawShaft(level));

		for (const c of this.coinsLayer.removeChildren()) c.destroy();
		this.coinSprites = s.coins.map((c) => {
			const sp = new Sprite(this.coinTex);
			sp.anchor.set(0.5);
			sp.scale.set(0.42);
			sp.position.set(wx(c.x), wy(c.y));
			this.coinsLayer.addChild(sp);
			return sp;
		});

		for (const c of this.robbersLayer.removeChildren()) c.destroy({ children: true });
		this.robbers = s.baddies.map((b) => {
			const root = new Container();
			root.position.set(wx(b.x), wy(b.y));
			const body = drawRobber();
			const balloon = new Graphics()
				.circle(0, 0, TUNING.baddie.balloonRadius * S)
				.fill(colors.balloon)
				.circle(-4, -5, 4)
				.fill({ color: 0xffffff, alpha: 0.6 });
			balloon.position.set(-14, -TUNING.baddie.height * S - 8);
			balloon.visible = false;
			const web = drawWebWrap();
			web.visible = false;
			const stars = new Container();
			for (let k = 0; k < 3; k++) {
				const st = new Sprite(this.starTex);
				st.anchor.set(0.5);
				st.scale.set(0.35);
				stars.addChild(st);
			}
			stars.visible = false;
			const alert = text(44, palette.pink);
			alert.text = '!';
			alert.position.set(0, -TUNING.baddie.height * S - 40);
			alert.visible = false;
			root.addChild(body, balloon, web, stars, alert);
			this.robbersLayer.addChild(root);
			// Where they'd land if they tumbled off: the highest ledge below them, or the floor.
			const below = level.ledges.filter(
				(l) => l.top < b.y - 0.1 && b.x > l.x0 - 0.5 && b.x < l.x1 + 0.5
			);
			const landY = below.length ? Math.max(...below.map((l) => l.top)) : 0;
			return {
				root,
				body,
				balloon,
				web,
				stars,
				alert,
				tipping: false,
				fallY: b.y,
				fallVy: 0,
				fallX: b.x,
				landY
			};
		});
		this.heads.removeChildren().forEach((c) => c.destroy({ children: true }));
		s.baddies.forEach((_, i) => {
			const head = drawHead();
			head.position.set((i - (s.baddies.length - 1) / 2) * 52, 0);
			this.heads.addChild(head);
		});

		this.showBanner(`Level ${s.levelIndex + 1}: ${level.name}`, 48, palette.white, 1.6);
		this.hint.text = level.hint ?? '';
		this.hintTime = level.hint ? 0 : 99;
		this.levelText.text = `Level ${s.levelIndex + 1}`;
		this.bannerStars.removeChildren().forEach((c) => c.destroy());
	}

	// ---- Per-frame sync ------------------------------------------------------------------------

	sync(s: GameState) {
		const key = `${s.levelIndex}:${s.level.name}:${s.coins.length}`;
		if (key !== this.levelKey || this.coinSprites.length !== s.coins.length) {
			this.levelKey = key;
			this.buildLevel(s);
		}
		const h = s.hero;
		this.camY += (cameraY(h.y, s.level.height) - this.camY) * 0.15;
		const shake = this.shake > 0 && !this.reducedMotion() ? this.shake : 0;
		this.world.position.set(
			(Math.random() - 0.5) * shake,
			H + this.camY * S + (Math.random() - 0.5) * shake
		);
		this.far.y = H - 520 + 60 + this.camY * S * 0.12;
		this.mid.y = H - 400 + 60 + this.camY * S * 0.25;

		// Coins spin.
		s.coins.forEach((c, i) => {
			const sp = this.coinSprites[i]!;
			sp.visible = !c.taken;
			sp.scale.x = 0.42 * Math.cos(this.time * 4 + i * 0.7);
		});

		// Robbers.
		s.baddies.forEach((b, i) => {
			const r = this.robbers[i]!;
			this.syncRobber(b, r, h.x);
			const near = Math.hypot(h.x - b.x, h.y - b.y - 1) < TUNING.baddie.throwRange;
			r.alert.visible = !b.down && near;
			r.alert.scale.set(1 + 0.1 * Math.sin(this.time * 12));
		});
		s.baddies.forEach((b, i) => {
			const head = this.heads.children[i];
			if (head) head.alpha = b.down ? 0.35 : 1;
			const check = head?.getChildByLabel('check');
			if (check) check.visible = b.down;
		});

		// Webs, shots and balloons.
		const g = this.dynamic;
		g.clear();
		const hand = { x: wx(h.x), y: wy(h.y + 0.35) };
		if (h.mode === 'zip' && h.target) {
			const t = h.target;
			g.moveTo(hand.x, hand.y).lineTo(wx(t.x), wy(t.y)).stroke({ color: 0xffffff, width: 4 });
			g.circle(wx(t.x), wy(t.y), 8).fill(0xffffff);
		}
		this.drawAim(s, g);
		for (const shot of s.shots) {
			const p = { x: wx(shot.x), y: wy(shot.y) };
			g.moveTo(hand.x, hand.y).lineTo(p.x, p.y).stroke({ color: 0xffffff, width: 2, alpha: 0.6 });
			g.circle(p.x, p.y, 9).fill(0xffffff);
		}
		for (const b of s.balloons) {
			g.circle(wx(b.x), wy(b.y), TUNING.baddie.balloonRadius * S).fill(colors.balloon);
			g.circle(wx(b.x) - 4, wy(b.y) - 5, 4).fill({ color: 0xffffff, alpha: 0.6 });
		}

		this.drawHero(s);

		for (let i = 0; i < this.hearts.length; i++) this.hearts[i]!.alpha = i < s.hearts ? 1 : 0.2;
		this.targetScore = s.score;
	}

	private syncRobber(b: Baddie, r: RobberSprite, heroX: number) {
		// Face the hero while standing.
		if (!b.down) {
			r.body.scale.x = heroX < b.x ? 1 : -1;
			r.balloon.visible = b.throwIn < 0.6;
			return;
		}
		r.balloon.visible = false;
		if (!r.tipping) {
			// Caught: topple, tumble off the ledge and land in a dizzy heap below. Nobody gets hurt.
			r.tipping = true;
			r.web.visible = b.how === 'webbed';
			r.fallVy = 3;
			const dir = b.dir || 1;
			this.tweens.add({
				duration: 0.5,
				ease: ease.outBack,
				onUpdate: (p) => (r.root.rotation = dir * 1.45 * p)
			});
		}
		const dt = 1 / 60;
		if (r.fallY > r.landY) {
			r.fallVy -= TUNING.gravity * dt;
			r.fallY = Math.max(r.landY, r.fallY + r.fallVy * dt);
			r.fallX += (b.dir || 1) * 2.2 * dt;
			r.fallX = Math.min(Math.max(r.fallX, 1.4), TUNING.shaftWidth - 1.4);
			r.root.position.set(wx(r.fallX), wy(r.fallY));
			if (r.fallY === r.landY) r.stars.visible = true;
		}
		// Dizzy stars circle the head (in the toppled frame, the head is "up" the body).
		const headY = -TUNING.baddie.height * S + 6;
		r.stars.children.forEach((st, k) => {
			const a = this.time * 3 + (k * Math.PI * 2) / 3;
			st.position.set(Math.cos(a) * 26, headY - 18 + Math.sin(a) * 9);
		});
	}

	private drawHero(s: GameState) {
		const h = s.hero;
		const g = this.hero;
		g.clear();
		if (s.phase === 'over') return;
		// Blink while safe after a hit.
		if (h.safe > 0 && Math.floor(this.time * 12) % 2 === 0) return;

		const x = wx(h.x);
		const y = wy(h.y);
		const u = S * 0.1; // limb thickness unit
		// Which way is "up" for the body: on a wall your feet press against it, under a ledge
		// you hang upside down, and in flight you stretch along the way you're going.
		let lean = 0;
		if (h.mode === 'cling') lean = (h.facing > 0 ? -1 : 1) * (Math.PI / 2);
		else if (h.mode === 'hang') lean = Math.PI;
		else if (h.mode === 'zip') lean = Math.atan2(h.vx, h.vy);
		else if (h.mode === 'fall') lean = Math.sin(this.time * 9) * 0.5;
		const c = Math.cos(lean);
		const sn = Math.sin(lean);
		// Local (right, up) offsets in metres → screen.
		// Mirrored so the hero faces the way they're going (or away from the wall they cling to).
		const f = h.facing;
		const P = (dx: number, dy: number) => ({
			x: x + (dx * f * c + dy * sn) * S,
			y: y - (-dx * f * sn + dy * c) * S
		});
		const limb = (a: Pt, b: Pt, color: number) =>
			g
				.moveTo(a.x, a.y)
				.lineTo(b.x, b.y)
				.stroke({ color, width: u * 1.4, cap: 'round' });

		const hip = P(0, -0.12);
		const shoulder = P(0, 0.28);

		// Legs.
		if (h.mode === 'stand') {
			limb(hip, P(0.16, -0.45), colors.suitDark);
			limb(hip, P(-0.16, -0.45), colors.suit);
		} else {
			limb(hip, P(-0.22, -0.38), colors.suitDark);
			limb(hip, P(-0.05, -0.44), colors.suit);
		}
		// Scarf streaming behind.
		const wave = Math.sin(this.time * 10) * 0.05;
		g.poly([
			shoulder.x,
			shoulder.y,
			P(-0.55, 0.32 + wave).x,
			P(-0.55, 0.32 + wave).y,
			P(-0.5, 0.18 - wave).x,
			P(-0.5, 0.18 - wave).y
		]).fill(colors.scarf);
		// Body.
		g.moveTo(hip.x, hip.y)
			.lineTo(shoulder.x, shoulder.y)
			.stroke({ color: colors.suit, width: u * 3.2, cap: 'round' });
		// Arms: reaching ahead while flying, gripping while stuck to something.
		if (h.mode === 'zip') {
			limb(shoulder, P(0.05, 0.75), colors.suit);
			limb(shoulder, P(-0.3, 0.05), colors.suitDark);
		} else if (h.mode === 'cling' || h.mode === 'hang') {
			limb(shoulder, P(0.3, -0.25), colors.suit);
			limb(shoulder, P(-0.3, -0.25), colors.suitDark);
		} else if (h.mode === 'fall') {
			limb(shoulder, P(0.35, 0.4), colors.suit);
			limb(shoulder, P(-0.3, 0.4), colors.suitDark);
		} else {
			limb(shoulder, P(-0.15, -0.05), colors.suitDark);
			limb(shoulder, P(0.15, -0.05), colors.suit);
		}
		// Head with a yellow goggle band.
		const head = P(0, 0.55);
		g.circle(head.x, head.y, 0.26 * S).fill(colors.suit);
		const band = P(0.04, 0.58);
		g.roundRect(band.x - 0.25 * S, band.y - 0.07 * S, 0.5 * S, 0.14 * S, 0.07 * S).fill(
			colors.scarf
		);
		const eye = P(0.12, 0.58);
		g.circle(eye.x, eye.y, 0.065 * S)
			.fill(0xffffff)
			.circle(eye.x + 2, eye.y, 0.03 * S)
			.fill(palette.bgDeep);
	}

	/** Show (or clear) the line being drawn. */
	setAim(aim: { dx: number; dy: number; power: number } | null) {
		this.aimLine = aim;
	}

	/** The aim guide: a dotted path to where you'll stick (or, for a leap, the arc you'll fly). */
	private drawAim(s: GameState, g: Graphics) {
		const a = this.aimLine;
		if (!a || s.phase !== 'play') return;
		const h = s.hero;
		const len = Math.hypot(a.dx, a.dy) || 1;
		const ux = a.dx / len;
		const uy = a.dy / len;
		const target = aimFromHero(s, a.dx, a.dy);
		const dot = (x: number, y: number, r: number, color: number) =>
			g.circle(wx(x), wy(y), r).fill({ color, alpha: 0.9 });
		if (target) {
			const d = Math.hypot(target.x - h.x, target.y - h.y);
			for (let t = 0.6; t < d - 0.3; t += 0.55) dot(h.x + ux * t, h.y + uy * t, 5, 0xffffff);
			g.circle(wx(target.x), wy(target.y), 16).stroke({ color: palette.yellow, width: 5 });
		} else {
			// A leap: the same arc the game will fly (see launch(): speed from strength, then gravity).
			const Z = TUNING.zip;
			const v = Z.minSpeed + (Z.maxSpeed - Z.minSpeed) * a.power;
			let x = h.x;
			let y = h.y;
			const vx = ux * v;
			let vy = uy * v;
			for (let i = 0; i < 26; i++) {
				for (let k = 0; k < 4; k++) {
					vy -= TUNING.gravity * 0.02;
					x += vx * 0.02;
					y += vy * 0.02;
				}
				if (x < 0 || x > TUNING.shaftWidth || y < 0) break;
				if (i > 0) dot(x, y, 4, palette.pink);
			}
		}
		// The strength arrow at the hero.
		const L = 0.8 + a.power * 1.6;
		const tip = { x: wx(h.x + ux * L), y: wy(h.y + uy * L) };
		g.moveTo(wx(h.x), wy(h.y))
			.lineTo(tip.x, tip.y)
			.stroke({ color: palette.yellow, width: 6, cap: 'round' });
		const back = (ang: number) => ({
			x: tip.x - Math.cos(Math.atan2(-uy, ux) + ang) * 18,
			y: tip.y - Math.sin(Math.atan2(-uy, ux) + ang) * 18
		});
		const l = back(0.5);
		const r = back(-0.5);
		g.poly([tip.x, tip.y, l.x, l.y, r.x, r.y]).fill(palette.yellow);
	}

	// ---- Effects -------------------------------------------------------------------------------

	private showBanner(label: string, size: number, color: number, hold: number) {
		const b = this.banner;
		b.text = label;
		b.style.fontSize = size;
		b.style.fill = color;
		this.tweens.add({
			duration: hold + 0.6,
			ease: ease.linear,
			onUpdate: (p) => {
				const t = p * (hold + 0.6);
				b.alpha = t < 0.2 ? t / 0.2 : t > hold + 0.2 ? Math.max(0, 1 - (t - hold - 0.2) / 0.4) : 1;
				b.scale.set(0.8 + 0.2 * ease.outBack(Math.min(t / 0.25, 1)));
			}
		});
	}

	coin(s: GameState, i: number) {
		const c = s.coins[i]!;
		this.burst({ x: wx(c.x), y: wy(c.y) }, 8, palette.yellow, 260);
		this.popup('+10', { x: wx(c.x), y: wy(c.y) - 20 }, 34, palette.yellow);
	}

	caught(s: GameState, i: number) {
		const b = s.baddies[i]!;
		const at = { x: wx(b.x), y: wy(b.y + 1.2) };
		this.burst(at, 14, 0xffffff, 320);
		this.popup('Caught! +50', { x: at.x, y: at.y - 60 }, 40, palette.green);
	}

	splash(x: number, y: number) {
		this.burst({ x: wx(x), y: wy(y) }, 12, colors.balloon, 300);
	}

	hit() {
		this.shake = 14;
	}

	webPuff(at: Pt) {
		this.burst({ x: wx(at.x), y: wy(at.y) }, 6, 0xffffff, 160);
	}

	complete(stars: number) {
		this.showBanner('Level complete!', 70, palette.yellow, 1.8);
		this.bannerStars.removeChildren().forEach((c) => c.destroy());
		for (let k = 0; k < 3; k++) {
			const st = new Sprite(this.starTex);
			st.anchor.set(0.5);
			st.position.set((k - 1) * 110, k === 1 ? -20 : 0);
			st.alpha = k < stars ? 1 : 0.25;
			st.scale.set(0);
			this.bannerStars.addChild(st);
			this.tweens.add({
				duration: 0.45,
				delay: 0.3 + k * 0.25,
				ease: ease.outBack,
				onUpdate: (p) => st.scale.set(1.6 * p)
			});
		}
	}

	private popup(label: string, at: Pt, size: number, color: number) {
		const t = text(size, color);
		t.text = label;
		t.position.set(at.x, at.y);
		this.fx.addChild(t);
		this.tweens.add({
			duration: 0.9,
			ease: ease.linear,
			onUpdate: (p) => {
				t.y = at.y - 60 * ease.outQuad(p);
				t.alpha = p < 0.6 ? 1 : 1 - (p - 0.6) / 0.4;
			},
			onComplete: () => t.destroy()
		});
	}

	private burst(at: Pt, count: number, color: number, speed: number) {
		for (let i = 0; i < count && this.particles.length < MAX_PARTICLES; i++) {
			const a = Math.random() * Math.PI * 2;
			const v = speed * (0.5 + Math.random() * 0.5);
			const sp = new Sprite(this.sparkTex);
			sp.anchor.set(0.5);
			sp.tint = color;
			sp.position.set(at.x, at.y);
			const size = 0.5 + Math.random() * 0.4;
			sp.scale.set(size);
			this.fx.addChild(sp);
			this.particles.push({
				sprite: sp,
				vx: Math.cos(a) * v,
				vy: Math.sin(a) * v - speed * 0.4,
				gravity: 900,
				life: 0,
				maxLife: 0.6,
				size
			});
		}
	}

	// ---- Loop ----------------------------------------------------------------------------------

	update(dt: number) {
		this.time += dt;
		this.tweens.update(dt);
		this.shake = Math.max(0, this.shake - 50 * dt);
		// Coaching line: appears after the level title, gently pulses, then fades out.
		this.hintTime += dt;
		const ht = this.hintTime;
		this.hint.alpha =
			ht < 1.2 ? 0 : ht < 7 ? 0.8 + 0.2 * Math.sin(ht * 4) : Math.max(0, 1 - (ht - 7) / 0.5);
		if (this.shownScore !== this.targetScore) {
			const d = this.targetScore - this.shownScore;
			this.shownScore += Math.sign(d) * Math.max(Math.abs(d) * dt * 8, 30 * dt);
			if (Math.abs(this.targetScore - this.shownScore) < 1) this.shownScore = this.targetScore;
			this.scoreText.text = String(Math.round(this.shownScore));
		}
		for (let i = this.particles.length - 1; i >= 0; i--) {
			const p = this.particles[i]!;
			p.life += dt;
			p.vy += p.gravity * dt;
			p.sprite.x += p.vx * dt;
			p.sprite.y += p.vy * dt;
			const t = p.life / p.maxLife;
			p.sprite.alpha = 1 - t;
			if (p.life >= p.maxLife) {
				p.sprite.destroy();
				this.particles.splice(i, 1);
			}
		}
	}

	render() {
		this.stage.app.render();
	}

	setScore(score: number) {
		this.shownScore = this.targetScore = score;
		this.scoreText.text = String(score);
	}

	/** Clear transient effects and force the level to be rebuilt (restart). */
	resetFx() {
		this.tweens.clear();
		this.fx.removeChildren().forEach((c) => c.destroy());
		this.particles = [];
		this.shake = 0;
		this.banner.alpha = 0;
		this.hint.alpha = 0;
		this.hintTime = 99;
		this.bannerStars.removeChildren().forEach((c) => c.destroy());
		this.levelKey = '';
		this.camY = -1;
		this.aimLine = null;
	}

	destroy() {
		this.resetFx();
		for (const t of this.textures) t.destroy(true);
		this.textures = [];
	}
}

// ---- Static drawings ---------------------------------------------------------------------------

function starShape(r: number, color: number): Graphics {
	const pts: number[] = [];
	for (let k = 0; k < 10; k++) {
		const a = -Math.PI / 2 + (k * Math.PI) / 5;
		const rr = k % 2 ? r * 0.45 : r;
		pts.push(Math.cos(a) * rr, Math.sin(a) * rr);
	}
	return new Graphics().poly(pts).fill(color).stroke({ color: 0xffffff, width: 3 });
}

function lerpColor(a: number, b: number, t: number): number {
	const ch = (c: number, s: number) => (c >> s) & 0xff;
	const mix = (s: number) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * t);
	return (mix(16) << 16) | (mix(8) << 8) | mix(0);
}

function drawSky(): Graphics {
	const g = new Graphics();
	const bands = 24;
	for (let i = 0; i < bands; i++) {
		g.rect(0, (H / bands) * i, W, H / bands + 1).fill(
			lerpColor(colors.skyTop, colors.skyBottom, i / (bands - 1))
		);
	}
	// A friendly sun and a few clouds.
	g.circle(560, 300, 70).fill({ color: 0xfff6c8, alpha: 0.9 });
	for (const [cx, cy, s] of [
		[150, 360, 1],
		[420, 230, 0.8],
		[640, 520, 0.7]
	] as const) {
		g.ellipse(cx, cy, 70 * s, 26 * s)
			.fill({ color: 0xffffff, alpha: 0.85 })
			.ellipse(cx - 30 * s, cy - 14 * s, 34 * s, 22 * s)
			.fill({ color: 0xffffff, alpha: 0.85 })
			.ellipse(cx + 26 * s, cy - 18 * s, 38 * s, 26 * s)
			.fill({ color: 0xffffff, alpha: 0.85 });
	}
	return g;
}

/** A repeating skyline strip (1440 px wide) for parallax. */
function drawSkyline(color: number, minH: number, maxH: number, seed: number): Graphics {
	const g = new Graphics();
	let x = 0;
	let r = seed * 9301 + 49297;
	const rand = () => (r = (r * 9301 + 49297) % 233280) / 233280;
	const height = 520;
	while (x < 1440) {
		const w = 60 + rand() * 90;
		const h = (minH + rand() * (maxH - minH)) * 30;
		g.rect(x, height - h, Math.min(w, 1440 - x), h).fill(color);
		if (rand() < 0.3) g.rect(x + w / 2 - 3, height - h - 30, 6, 30).fill(color);
		x += w + 4;
	}
	return g;
}

/** The shaft for a whole level (static): walls, ledges with spikes, the floor, the flag. */
function drawShaft(level: Level): Container {
	const c = new Container();
	const g = new Graphics();
	const Wm = TUNING.shaftWidth;
	const wall = 0.3; // visible wall thickness inside the shaft (metres)
	// Walls with rivets, from below the floor to above the ceiling.
	for (const x of [0, Wm - wall]) {
		g.rect(wx(x), wy(level.height + 4), wall * S, (level.height + 6) * S).fill(colors.wall);
		for (let y = 0; y < level.height + 3; y += 1.5) {
			g.circle(wx(x + wall / 2), wy(y), 4).fill(colors.wallLight);
		}
	}
	// Ceiling.
	g.rect(0, wy(level.height + 4), Wm * S, 4 * S).fill(colors.wall);
	// Floor: a street.
	g.rect(0, wy(0), Wm * S, 3 * S).fill(colors.street);
	for (let x = 0.5; x < Wm; x += 2.5)
		g.rect(wx(x), wy(-1.2), 1.4 * S, 6).fill({ color: palette.yellow, alpha: 0.7 });
	// Ledges.
	level.ledges.forEach((l, i) => {
		if (i === 0) return;
		const x0 = wx(l.x0);
		const w = (l.x1 - l.x0) * S;
		g.rect(x0, wy(l.top), w, TH * S).fill(colors.ledgeBody);
		g.rect(x0, wy(l.top), w, 10).fill(colors.ledgeTop);
		// Girder struts underneath.
		for (let x = l.x0 + 0.15; x + 1 <= l.x1 - 0.1; x += 1) {
			g.moveTo(wx(x), wy(l.top) + 12)
				.lineTo(wx(x + 0.5), wy(l.top - TH) - 2)
				.lineTo(wx(x + 1), wy(l.top) + 12)
				.stroke({ color: colors.wallLight, width: 4 });
		}
		// Spikes: a row of red cones.
		for (const [a, b] of l.spikes) {
			const n = Math.max(1, Math.round((b - a) / 0.45));
			const step = (b - a) / n;
			for (let k = 0; k < n; k++) {
				const sx = wx(a + step * k);
				g.poly([
					sx,
					wy(l.top),
					sx + (step * S) / 2,
					wy(l.top + 0.5),
					sx + step * S,
					wy(l.top)
				]).fill(colors.spike);
			}
		}
	});
	// Finish flag.
	const fx = wx(level.finish.x);
	const fy = wy(level.finish.y);
	g.rect(fx - 4, fy - 3 * S, 8, 3 * S).fill(0xf4f6ff);
	const fw = 1.6 * S;
	const fh = 1 * S;
	const cell = fw / 4;
	for (let i = 0; i < 4; i++) {
		for (let j = 0; j < 2; j++) {
			g.rect(fx + 4 + i * cell, fy - 3 * S + j * (fh / 2), cell, fh / 2).fill(
				(i + j) % 2 ? palette.bgDeep : 0xffffff
			);
		}
	}
	c.addChild(g);
	return c;
}

/** A little masked robber head for the counter row; a green check shows once they're caught. */
function drawHead(): Container {
	const c = new Container();
	const g = new Graphics()
		.circle(0, 0, 20)
		.fill(colors.skin)
		.stroke({ color: palette.bgDeep, width: 4 })
		.roundRect(-20, -22, 40, 14, 6)
		.fill(colors.robberDark)
		.roundRect(-18, -5, 36, 10, 5)
		.fill(colors.robberDark)
		.circle(-7, 0, 3)
		.fill(0xffffff)
		.circle(7, 0, 3)
		.fill(0xffffff);
	const check = new Graphics()
		.circle(14, 12, 11)
		.fill(palette.green)
		.moveTo(9, 12)
		.lineTo(13, 16)
		.lineTo(20, 7)
		.stroke({ color: 0xffffff, width: 3, cap: 'round' });
	check.label = 'check';
	check.visible = false;
	c.addChild(g, check);
	return c;
}

/** A cartoon robber: beanie, eye mask, striped shirt. Drawn standing, feet at (0, 0). */
function drawRobber(): Graphics {
	const g = new Graphics();
	const h = TUNING.baddie.height * S;
	const w = TUNING.baddie.width * S;
	// Legs.
	g.roundRect(-w * 0.32, -h * 0.42, w * 0.26, h * 0.42, 6).fill(colors.robberDark);
	g.roundRect(w * 0.06, -h * 0.42, w * 0.26, h * 0.42, 6).fill(colors.robberDark);
	// Striped shirt.
	const top = -h * 0.78;
	const shirt = h * 0.4;
	g.roundRect(-w / 2, top, w, shirt, 14).fill(0xffffff);
	const stripe = shirt / 7;
	for (let k = 0; k < 3; k++) {
		g.rect(-w / 2 + 2, top + stripe * (1 + 2 * k), w - 4, stripe).fill(colors.robberDark);
	}
	// Arms.
	g.roundRect(-w / 2 - 8, top + 6, 10, h * 0.3, 5).fill(0xffffff);
	g.roundRect(w / 2 - 2, top + 6, 10, h * 0.3, 5).fill(0xffffff);
	// Head, beanie, mask.
	const hy = -h * 0.88;
	g.circle(0, hy, w * 0.34).fill(colors.skin);
	g.roundRect(-w * 0.36, hy - w * 0.42, w * 0.72, w * 0.3, 10).fill(colors.robberDark);
	g.circle(0, hy - w * 0.46, 6).fill(colors.robberDark);
	g.roundRect(-w * 0.36, hy - 6, w * 0.72, 12, 6).fill(colors.robberDark);
	g.circle(-w * 0.15, hy, 4).fill(0xffffff);
	g.circle(w * 0.15, hy, 4).fill(0xffffff);
	return g;
}

/** White web strands wrapped around a toppled robber. */
function drawWebWrap(): Graphics {
	const g = new Graphics();
	const h = TUNING.baddie.height * S;
	const w = TUNING.baddie.width * S;
	for (let k = 0; k < 6; k++) {
		const y = -h * 0.15 - k * h * 0.13;
		g.moveTo(-w * 0.6, y + 8).lineTo(w * 0.6, y - 8);
	}
	g.moveTo(0, 0).lineTo(0, -h);
	g.stroke({ color: 0xffffff, width: 4, alpha: 0.9 });
	return g;
}
