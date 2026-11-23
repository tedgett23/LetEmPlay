// Rail Dash 3D view. Trains, track and the runner are Kenney models (see
// models.ts), as are the City Kit shops; bars, gantries and coins are simple shapes built here. Everything that
// comes and goes is pooled, the track is recycled in chunks, and the view never decides rules:
// it reads RunState every frame.
//
// Coordinates: the logic's +x is the player's right. Three's camera here looks down +z, which
// puts +x on screen-left, so every logical x is negated when placed.
import {
	AmbientLight,
	AnimationMixer,
	Box3,
	BoxGeometry,
	CircleGeometry,
	Color,
	CylinderGeometry,
	DirectionalLight,
	Fog,
	Group,
	HemisphereLight,
	Mesh,
	MeshBasicMaterial,
	MeshLambertMaterial,
	PerspectiveCamera,
	PlaneGeometry,
	Quaternion,
	Scene,
	Vector3,
	WebGLRenderer,
	type AnimationAction,
	type Bone,
	type BufferGeometry,
	type Material,
	type Object3D
} from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { palette } from '../../../kit/theme';
import type { ObstacleKind } from '../logic/patterns';
import type { Coin, Obstacle, RunState } from '../logic/run';
import { laneX, TUNING } from '../logic/tuning';
import type { Models, TrainModel } from './models';

const CHUNK = 40;
const CHUNKS = 5;
const SKY = 0x8fd3ff;
const O = TUNING.obstacles;

/** Horizontal half-width (m) that must fit on screen at the player's depth. */
const VIEW_HALF_WIDTH = 3.1;
const CAMERA = { y: 5.2, z: -6.2, lookY: 0.6, lookZ: 12 };

/** Train Kit roofs are about 1.6 m up; this puts them at the logic's roof (2.45 m). */
const TRAIN_SCALE = 1.5;
type TrainSet = [front: TrainModel, middle: TrainModel, back: TrainModel];
const TRAIN_SETS: Record<'parked' | 'oncoming', TrainSet[]> = {
	parked: [
		['train-electric-city-a', 'train-electric-city-b', 'train-electric-city-c'],
		['train-electric-subway-a', 'train-electric-subway-b', 'train-electric-subway-c']
	],
	oncoming: [['train-diesel-a', 'train-diesel-b', 'train-diesel-c']]
};
/** Track pieces are 1 m wide and 4 m long; stretch to our lanes and 8 m pieces. */
const TRACK_SCALE = { x: 2, y: 1.9, z: 2 };
const RUNNER_HEIGHT = 1.7;
/** City Kit buildings are about 1 m across; make them shop-sized beside the track. */
const BUILDING_SCALE = 5;
const BUILDING_X = 8;

export class RailDashView {
	readonly renderer: WebGLRenderer;
	private scene = new Scene();
	private camera = new PerspectiveCamera(70, 1, 0.1, 140);
	private disposables: (BufferGeometry | Material)[] = [];

	private box: BoxGeometry;
	private mats = new Map<number, MeshLambertMaterial>();

	private chunks: { group: Group; index: number; spots: Object3D[][] }[] = [];
	private player = new Group();
	private body: Group;
	private mixer: AnimationMixer;
	private actions: Record<'idle' | 'run' | 'jump', AnimationAction>;
	private current: AnimationAction | null = null;
	private skinMat!: MeshLambertMaterial;
	private trainLength = new Map<TrainModel, number>();
	private shadow: Mesh;

	private pools: Record<ObstacleKind | 'coin', Object3D[]> = {
		low: [],
		high: [],
		train: [],
		moving: [],
		coin: []
	};
	private active = new Map<number, { obj: Object3D; kind: ObstacleKind | 'coin' }>();
	private seen = new Set<number>();
	private coinGeo: CylinderGeometry;

	private time = 0;
	private shake = 0;
	private camLift = 0;
	private crashT = -1;
	private dprLowered = false;
	private slowFrames = 0;
	private lastFrame = 0;

	constructor(
		container: HTMLElement,
		private models: Models,
		skin: number,
		private reducedMotion: () => boolean
	) {
		this.renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
		const canvas = this.renderer.domElement;
		canvas.style.display = 'block';
		canvas.style.touchAction = 'none';
		canvas.style.width = '100%';
		canvas.style.height = '100%';
		container.appendChild(canvas);

		this.scene.background = new Color(SKY);
		this.scene.fog = new Fog(SKY, 55, 125);
		this.scene.add(new HemisphereLight(0xffffff, 0x88aa66, 1.6));
		this.scene.add(new AmbientLight(0xffffff, 0.4));
		const sun = new DirectionalLight(0xffffff, 1.4);
		sun.position.set(-4, 10, -3);
		this.scene.add(sun);

		this.box = this.track(new BoxGeometry(1, 1, 1));
		this.coinGeo = this.track(new CylinderGeometry(0.42, 0.42, 0.12, 20));
		this.coinGeo.rotateZ(Math.PI / 2);

		for (const [name, obj] of Object.entries(models.trains) as [TrainModel, Object3D][]) {
			this.trainLength.set(name, new Box3().setFromObject(obj).getSize(new Vector3()).z);
		}
		this.buildTrack();
		const runner = this.buildPlayer(skin);
		this.body = runner.body;
		this.mixer = runner.mixer;
		this.actions = runner.actions;
		this.shadow = new Mesh(
			this.track(new CircleGeometry(0.55, 24)),
			this.track(new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3 }))
		);
		this.shadow.rotation.x = -Math.PI / 2;
		this.shadow.position.y = 0.03;
		this.scene.add(this.player, this.shadow);

		this.camera.position.set(0, CAMERA.y, CAMERA.z);
		this.camera.lookAt(0, CAMERA.lookY, CAMERA.lookZ);
	}

	private track<T extends BufferGeometry | Material>(x: T): T {
		this.disposables.push(x);
		return x;
	}

	private mat(color: number): MeshLambertMaterial {
		let m = this.mats.get(color);
		if (!m) {
			m = this.track(new MeshLambertMaterial({ color }));
			this.mats.set(color, m);
		}
		return m;
	}

	/** A box mesh with its own scale/position, sharing the unit geometry. */
	private part(color: number, sx: number, sy: number, sz: number, x = 0, y = 0, z = 0): Mesh {
		const m = new Mesh(this.box, this.mat(color));
		m.scale.set(sx, sy, sz);
		m.position.set(x, y, z);
		return m;
	}

	// ---- Static scenery ------------------------------------------------------------------------

	private buildTrack() {
		const grass = this.mat(0x7cc96b);
		const groundGeo = this.track(new PlaneGeometry(60, CHUNK));
		groundGeo.rotateX(-Math.PI / 2);

		for (let c = 0; c < CHUNKS; c++) {
			const g = new Group();
			const ground = new Mesh(groundGeo, grass);
			ground.position.z = CHUNK / 2;
			g.add(ground);
			for (const lane of [-1, 0, 1]) {
				for (let z = 0; z < CHUNK; z += 4 * TRACK_SCALE.z) {
					const piece = this.models.track.clone();
					piece.scale.set(TRACK_SCALE.x, TRACK_SCALE.y, TRACK_SCALE.z);
					// The piece's base sits 1 m below its origin; lift it onto the ground.
					piece.position.set(-laneX(lane), TRACK_SCALE.y + 0.01, z);
					g.add(piece);
				}
			}

			// Shops along both sides. Each spot holds every building model and shows one, so
			// recycling a chunk only flips visibility (no allocation while running).
			const spots: Object3D[][] = [];
			for (const side of [-1, 1]) {
				for (const z of [6, 20, 34]) {
					const variants = this.models.buildings.map((b) => {
						const v = b.clone();
						v.scale.setScalar(BUILDING_SCALE);
						// Fronts face +z in the kit; turn them to face the track.
						v.rotation.y = (side * Math.PI) / 2;
						v.position.set(side * BUILDING_X, 0, z);
						v.visible = false;
						g.add(v);
						return v;
					});
					spots.push(variants);
				}
			}
			this.scene.add(g);
			this.chunks.push({ group: g, index: -1, spots });
		}
	}

	private buildPlayer(skin: number) {
		const src = this.models.character;
		const body = cloneSkinned(src.scene) as Group;
		const map = this.models.skins[skin % this.models.skins.length]!;
		const skinMat = this.track(new MeshLambertMaterial({ map }));
		this.skinMat = skinMat;
		body.traverse((o) => {
			if ((o as Mesh).isMesh) (o as Mesh).material = skinMat;
		});
		// Normalise to a kid-sized runner, feet on the ground, facing down the track.
		// Measure the raw geometry through its node transform: a skinned mesh's own bounds aren't
		// valid until its bones have been posed by a first render.
		body.updateMatrixWorld(true);
		const bounds = new Box3();
		body.traverse((o) => {
			const m = o as Mesh;
			if (!m.isMesh) return;
			m.geometry.computeBoundingBox();
			bounds.union(m.geometry.boundingBox!.clone().applyMatrix4(m.matrixWorld));
		});
		const k = RUNNER_HEIGHT / bounds.getSize(new Vector3()).y;
		body.scale.setScalar(k);
		body.rotation.y = 0;

		// The courier's delivery bag, strapped to the upper spine.
		let spine: Bone | null = null;
		body.traverse((o) => {
			if ((o as Bone).isBone && /spine/i.test(o.name)) spine = o as Bone;
		});
		if (spine) {
			// Size and place it in world units, then convert into the bone's own (scaled,
			// rotated) space so it rides along with the animation.
			const bone = spine as Bone;
			body.updateMatrixWorld(true);
			const ws = bone.getWorldScale(new Vector3()).x;
			const bag = this.part(palette.orange, 0.42 / ws, 0.42 / ws, 0.2 / ws);
			const at = bone.getWorldPosition(new Vector3()).add(new Vector3(0, 0.1, -0.2));
			bag.position.copy(bone.worldToLocal(at));
			bag.quaternion.copy(bone.getWorldQuaternion(new Quaternion()).invert());
			bone.add(bag);
		}

		const mixer = new AnimationMixer(body);
		const clip = (name: string) => src.animations.find((a) => a.name === name)!;
		const actions = {
			idle: mixer.clipAction(clip('idle')),
			run: mixer.clipAction(clip('run')),
			jump: mixer.clipAction(clip('jump'))
		};
		this.player.add(body);
		return { body, mixer, actions };
	}

	private play(name: 'idle' | 'run' | 'jump') {
		const next = this.actions[name];
		if (this.current === next) return;
		next.reset().play();
		if (this.current) next.crossFadeFrom(this.current, 0.12, false);
		this.current = next;
	}

	// ---- Pooled objects -----------------------------------------------------------------------

	private make(kind: ObstacleKind | 'coin'): Object3D {
		const g = new Group();
		switch (kind) {
			case 'coin': {
				const coin = new Mesh(this.coinGeo, this.mat(0xffcc33));
				g.add(coin);
				break;
			}
			case 'low': {
				const { bottom, top, depth } = O.low;
				for (const x of [-1, 1]) g.add(this.part(0xffffff, 0.14, top, 0.14, x, top / 2, depth / 2));
				g.add(this.part(palette.pink, 2.1, top - bottom, depth, 0, (top + bottom) / 2, depth / 2));
				g.add(
					this.part(
						0xffffff,
						0.5,
						top - bottom + 0.01,
						depth + 0.01,
						0,
						(top + bottom) / 2,
						depth / 2
					)
				);
				break;
			}
			case 'high': {
				const { bottom, top, depth } = O.high;
				for (const x of [-1, 1]) g.add(this.part(0x8b8fa8, 0.16, top, 0.16, x, top / 2, depth / 2));
				g.add(this.part(palette.blue, 2.1, top - bottom, depth, 0, (top + bottom) / 2, depth / 2));
				g.add(this.part(0xffffff, 1.4, 0.18, depth + 0.02, 0, (top + bottom) / 2, depth / 2));
				break;
			}
			case 'train':
			case 'moving': {
				// Cars are added when the train is placed (its length varies); see fitTrain.
				const cars = new Group();
				cars.name = 'cars';
				g.add(cars);
				if (kind === 'moving') {
					for (const x of [-0.55, 0.55]) {
						const light = new Mesh(
							this.box,
							this.track(new MeshBasicMaterial({ color: 0xfff3a0 }))
						);
						light.scale.set(0.4, 0.3, 0.05);
						light.position.set(x, 0.85, -0.05);
						light.name = 'light';
						g.add(light);
					}
				}
				break;
			}
		}
		this.scene.add(g);
		return g;
	}

	private acquire(id: number, kind: ObstacleKind | 'coin'): Object3D {
		let entry = this.active.get(id);
		if (!entry) {
			const obj = this.pools[kind].pop() ?? this.make(kind);
			obj.visible = true;
			entry = { obj, kind };
			this.active.set(id, entry);
		}
		this.seen.add(id);
		return entry.obj;
	}

	private releaseUnseen() {
		for (const [id, e] of this.active) {
			if (this.seen.has(id)) continue;
			e.obj.visible = false;
			this.pools[e.kind].push(e.obj);
			this.active.delete(id);
		}
		this.seen.clear();
	}

	// ---- Frame --------------------------------------------------------------------------------

	resize(width: number, height: number) {
		this.renderer.setSize(width, height, false);
		const aspect = width / Math.max(height, 1);
		this.camera.aspect = aspect;
		// Fit the lanes across narrow portrait phones without going fish-eye on tablets.
		const depth = Math.hypot(CAMERA.y, CAMERA.z);
		const vfov = 2 * Math.atan(VIEW_HALF_WIDTH / depth / aspect) * (180 / Math.PI);
		this.camera.fov = Math.min(Math.max(vfov, 50), 88);
		this.camera.updateProjectionMatrix();
	}

	/** Each run can wear a different outfit. */
	setSkin(i: number) {
		this.skinMat.map = this.models.skins[i % this.models.skins.length]!;
		this.skinMat.needsUpdate = true;
	}

	crash() {
		this.crashT = 0;
		this.shake = 0.35;
	}

	stumble() {
		this.shake = Math.max(this.shake, 0.18);
	}

	resetFx() {
		this.camLift = 0;
		this.crashT = -1;
		this.shake = 0;
		this.player.rotation.set(0, 0, 0);
	}

	update(dt: number) {
		this.time += dt;
		this.mixer.update(dt);
		if (this.crashT >= 0) this.crashT += dt;
		this.shake = Math.max(0, this.shake - dt);
	}

	render(s: RunState) {
		this.autoResolution();
		const d = s.distance;
		const p = s.player;

		// Track chunks: recycled by index so scenery repeats in a varied way.
		const first = Math.floor(d / CHUNK) - 1;
		for (let i = 0; i < CHUNKS; i++) {
			const index = first + i;
			const slot = ((index % CHUNKS) + CHUNKS) % CHUNKS;
			const c = this.chunks[slot]!;
			c.group.position.z = index * CHUNK - d;
			if (c.index !== index) {
				c.index = index;
				// Deterministic per chunk index, so a stretch looks the same if you pass it again.
				c.spots.forEach((variants, k) => {
					const pick = (index * 7 + k * 3 + (index >> 2)) % variants.length;
					variants.forEach((v, i) => (v.visible = i === pick));
				});
			}
		}

		for (const o of s.obstacles) this.placeObstacle(o, d);
		for (const c of s.coinsList) this.placeCoin(c, d);
		this.releaseUnseen();

		// Player.
		const sliding = p.slide > 0;
		if (s.over || this.crashT >= 0) this.current?.setEffectiveTimeScale(0.3);
		else if (p.airborne) this.play('jump');
		else if (s.time > 0) this.play('run');
		else this.play('idle');
		if (this.current === this.actions.run) {
			this.current.setEffectiveTimeScale(Math.min(s.speed / 11, 1.6));
		}
		this.player.position.set(-p.x, p.y, 0);
		// Slide: lean right back, low to the ground.
		this.body.rotation.x = sliding ? -1.25 : 0;
		this.body.position.y = sliding ? 0.35 : 0;
		// Lean into lane changes.
		this.player.rotation.z = p.laneT < 1 ? (p.lane > p.fromLane ? 0.25 : -0.25) * (1 - p.laneT) : 0;
		if (this.crashT >= 0) {
			this.player.rotation.x = Math.min(this.crashT * 6, 1.4);
			this.player.position.y = Math.max(0, 0.6 * Math.sin(Math.min(this.crashT * 5, Math.PI)));
		} else {
			this.player.rotation.x = 0;
		}
		// The shadow sits on whatever is below: the track or a train roof.
		this.shadow.position.set(-p.x, p.ground + 0.03, 0);
		const lift = Math.min((p.y - p.ground) / 2, 1);
		this.shadow.scale.setScalar(1 - 0.5 * lift);

		// Camera follows lanes gently and rises when you're up on the roofs, with optional shake.
		this.camLift += (p.ground * 0.7 - this.camLift) * 0.08;
		const sh = this.reducedMotion() ? 0 : this.shake;
		this.camera.position.set(
			-p.x * 0.35 + (Math.random() - 0.5) * sh,
			CAMERA.y + this.camLift + (Math.random() - 0.5) * sh,
			CAMERA.z
		);
		this.camera.lookAt(-p.x * 0.35, CAMERA.lookY + this.camLift, CAMERA.lookZ);

		this.renderer.render(this.scene, this.camera);
	}

	private placeObstacle(o: Obstacle, d: number) {
		const obj = this.acquire(o.id, o.kind);
		obj.position.set(-laneX(o.lane), 0, o.front - d);
		if (o.kind === 'train' || o.kind === 'moving') {
			if (obj.userData.fitted !== o.id) {
				obj.userData.fitted = o.id;
				this.fitTrain(obj.getObjectByName('cars')!, o);
			}
			if (o.kind === 'moving') {
				// Headlights flash once the warning is on.
				const on = !o.warned || Math.sin(this.time * 18) > 0;
				for (const ch of obj.children) if (ch.name === 'light') ch.visible = on;
			}
		}
	}

	/** Build a train of Kenney cars that exactly fills the obstacle's length (on spawn only). */
	private fitTrain(cars: Object3D, o: Obstacle) {
		cars.clear();
		const sets = TRAIN_SETS[o.kind === 'moving' ? 'oncoming' : 'parked'];
		const [front, middle, back] = sets[o.id % sets.length]!;
		const count = Math.max(2, Math.round(o.length / (2.5 * TRAIN_SCALE)));
		const names = Array.from({ length: count }, (_, i) =>
			i === 0 ? front : i === count - 1 ? back : middle
		);
		const raw = names.reduce((sum, n) => sum + this.trainLength.get(n)!, 0);
		const zScale = o.length / raw;
		let z = 0;
		names.forEach((n, i) => {
			const len = this.trainLength.get(n)! * zScale;
			const car = this.models.trains[n].clone();
			car.scale.set(TRAIN_SCALE, TRAIN_SCALE, zScale);
			car.position.z = z + len / 2;
			// The kit's cabs face -z; turn the last cab around so both ends look like fronts.
			if (i === count - 1) car.rotation.y = Math.PI;
			cars.add(car);
			z += len;
		});
	}

	private placeCoin(c: Coin, d: number) {
		const obj = this.acquire(c.id, 'coin');
		obj.position.set(-laneX(c.lane), c.y, c.s - d);
		obj.rotation.y = this.time * 4 + c.id;
	}

	/** Drop to 1.5× resolution if frames are consistently slower than 20 ms. */
	private autoResolution() {
		const now = performance.now();
		const frame = now - this.lastFrame;
		this.lastFrame = now;
		if (this.dprLowered || frame > 200) return; // ignore pauses
		this.slowFrames = frame > 20 ? this.slowFrames + 1 : Math.max(0, this.slowFrames - 2);
		if (this.slowFrames > 90 && this.renderer.getPixelRatio() > 1.5) {
			this.renderer.setPixelRatio(1.5);
			this.dprLowered = true;
			const size = this.renderer.domElement;
			this.resize(size.clientWidth, size.clientHeight);
		}
	}

	destroy() {
		this.mixer.stopAllAction();
		this.renderer.dispose();
		this.renderer.forceContextLoss();
		for (const x of this.disposables) x.dispose();
		this.disposables = [];
		this.renderer.domElement.remove();
	}
}
