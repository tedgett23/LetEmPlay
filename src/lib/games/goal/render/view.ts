import {
	BufferAttribute,
	BufferGeometry,
	CanvasTexture,
	CircleGeometry,
	Color,
	DirectionalLight,
	DoubleSide,
	DynamicDrawUsage,
	Fog,
	HemisphereLight,
	InstancedMesh,
	Mesh,
	MeshBasicMaterial,
	MeshLambertMaterial,
	Object3D,
	PerspectiveCamera,
	PCFShadowMap,
	RingGeometry,
	Scene,
	SRGBColorSpace,
	Vector3,
	WebGLRenderer
} from 'three';
import { observeSize, type Size } from '../../../kit/viewport';
import { goal as str } from '../../../strings';
import type { GameState } from '../logic/game';
import { TUNING } from '../logic/tuning';
import { buildCourse } from './course';
import { football, footballer, solid } from './models';
import { CAMERA, groundDirection, H, W } from './layout';
import { MatchHud } from './hud';

const R = TUNING.ball.radius,
	N = 20;
function gradient(sky: boolean) {
	const c = document.createElement('canvas');
	c.width = sky ? 2 : 64;
	c.height = sky ? 128 : 64;
	const g = c.getContext('2d')!;
	const p = sky
		? g.createLinearGradient(0, 0, 0, 32)
		: g.createRadialGradient(32, 32, 0, 32, 32, 32);
	if (sky) {
		p.addColorStop(0, '#3cb9e7');
		p.addColorStop(0.65, '#9ce4eb');
		p.addColorStop(1, '#cceadd');
	} else {
		p.addColorStop(0, 'rgba(30,51,55,.42)');
		p.addColorStop(0.6, 'rgba(34,64,56,.31)');
		p.addColorStop(1, 'rgba(34,64,56,0)');
	}
	g.fillStyle = p;
	g.fillRect(0, 0, c.width, c.height);
	const t = new CanvasTexture(c);
	t.colorSpace = SRGBColorSpace;
	return t;
}

export class GoalView {
	private renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
	private scene = new Scene();
	private camera = new PerspectiveCamera(CAMERA.fov, 1, 5, 8500);
	private mat = new MeshLambertMaterial({ vertexColors: true });
	private sky = gradient(true);
	private shadowMap = gradient(false);
	private shade = new MeshBasicMaterial({
		map: this.shadowMap,
		transparent: true,
		depthWrite: false
	});
	private disk = new CircleGeometry(1, 32).rotateX(-Math.PI / 2);
	private ball = football(this.mat);
	private shadow = new Mesh(this.disk, this.shade);
	private ring = new Mesh(
		new RingGeometry(R * 1.32, R * 1.44, 48).rotateX(-Math.PI / 2),
		new MeshBasicMaterial({ color: 0xfff6b8 })
	);
	private course?: ReturnType<typeof buildCourse>;
	private players: { model: ReturnType<typeof footballer>; shadow: Mesh }[] = [];
	private state?: GameState;
	private hud: MatchHud;
	private trail = new Float32Array(N * 2);
	private trailN = 0;
	private ribbon = new Mesh(
		new BufferGeometry(),
		new MeshBasicMaterial({
			color: 0xffdf36,
			side: DoubleSide,
			transparent: true,
			opacity: 0.82,
			depthWrite: false
		})
	);
	private bits = new InstancedMesh(solid.box, new MeshBasicMaterial(), 36);
	private burst = new Float32Array(36 * 6);
	private burstTime = 0;
	private dummy = new Object3D();
	private axis = new Vector3();
	private time = 0;
	private rolled = 0;
	private snap = true;
	private stopResize: () => void;
	private gestureScale = 1;
	private focalPx = 1;
	private sinHeading = 0;
	private cosHeading = 1;
	constructor(
		host: HTMLElement,
		private reducedMotion: () => boolean,
		pause: () => void
	) {
		const r = this.renderer;
		r.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
		r.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none';
		host.append(r.domElement);
		this.scene.background = this.sky;
		this.scene.fog = new Fog(0xcceadd, 1400, 4900);
		this.scene.add(new HemisphereLight(0xfffbef, 0xbad6ce, 1.58));
		const sun = new DirectionalLight(0xfff0cc, 1.8);
		sun.position.set(-510, 900, 1250);
		sun.target.position.set(360, 0, 740);
		sun.castShadow = true;
		sun.shadow.mapSize.set(1024, 1024);
		Object.assign(sun.shadow.camera, {
			left: -1250,
			right: 1250,
			top: 1300,
			bottom: -1300,
			near: 10,
			far: 3000
		});
		sun.shadow.camera.updateProjectionMatrix();
		sun.shadow.bias = -0.00045;
		r.shadowMap.enabled = true;
		r.shadowMap.type = PCFShadowMap;
		r.shadowMap.autoUpdate = false;
		this.scene.add(sun, sun.target);
		this.ball.scale.setScalar(R);
		this.camera.rotation.x = -CAMERA.pitch;
		this.bits.count = 0;
		this.ribbon.geometry.setAttribute(
			'position',
			new BufferAttribute(new Float32Array(N * 2 * 3), 3).setUsage(DynamicDrawUsage)
		);
		const indices = [];
		for (let i = 0; i < N - 1; i++) {
			const a = i * 2;
			indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
		}
		this.ribbon.geometry.setIndex(indices);
		this.ribbon.frustumCulled = this.bits.frustumCulled = false;
		this.scene.add(this.ball, this.shadow, this.ring, this.ribbon, this.bits);
		this.hud = new MatchHud(host, pause);
		const resize = ({ width, height }: Size) => {
			if (!width || !height) return;
			r.setSize(width, height, false);
			this.camera.aspect = width / height;
			this.camera.updateProjectionMatrix();
			this.gestureScale = Math.min(width / W, height / H);
			this.focalPx = height / (2 * Math.tan((CAMERA.fov * Math.PI) / 360));
			if (this.state) this.render();
		};
		resize({ width: host.clientWidth, height: host.clientHeight });
		this.stopResize = observeSize(host, resize);
	}
	logicalLength(dx: number, dy: number) {
		return Math.hypot(dx, dy) / this.gestureScale;
	}
	groundDelta(dx: number, dy: number) {
		const x = this.ball.position.x - this.camera.position.x,
			z = this.ball.position.z - this.camera.position.z;
		const c = this.cosHeading,
			s = this.sinHeading;
		const behind = -x * s - z * c;
		const scale =
			(behind * Math.cos(CAMERA.pitch) + CAMERA.height * Math.sin(CAMERA.pitch)) / this.focalPx;
		const local = groundDirection(dx * scale, dy * scale, x * c - z * s, behind);
		return {
			dx: local.dx * c + local.dy * s,
			dy: local.dy * c - local.dx * s
		};
	}
	private clearPlayers() {
		for (const { model, shadow } of this.players) {
			this.scene.remove(model.root, shadow);
			model.root.traverse((o) => {
				if (o instanceof Mesh) (o.geometry as BufferGeometry).dispose();
			});
		}
		this.players = [];
	}
	sync(s: GameState) {
		if (this.state !== s) {
			if (this.state?.levelIndex !== s.levelIndex || !this.course) {
				if (this.course) {
					this.scene.remove(this.course.root);
					this.course.dispose();
				}
				this.course = buildCourse(s.level, s.levelIndex, this.mat);
				// Frame the opening shot down the course, including levels with an offset goal.
				// Keep this heading through rebounds so swiping never steers a rotating camera.
				const yaw = Math.max(
					-0.3,
					Math.min(
						0.3,
						Math.atan2(s.level.ball.x - s.level.goal.x, s.level.ball.y - s.level.goal.y)
					)
				);
				this.cosHeading = Math.cos(yaw);
				this.sinHeading = Math.sin(yaw);
				this.camera.rotation.set(-CAMERA.pitch, yaw, 0, 'YXZ');
				this.scene.add(this.course.root);
				this.renderer.shadowMap.needsUpdate = true;
			}
			this.clearPlayers();
			for (let i = 0; i < s.chasers.length + Number(!!s.keeper); i++) {
				const model = footballer(this.mat, i, i === s.chasers.length),
					shadow = new Mesh(this.disk, this.shade);
				this.scene.add(model.root, shadow);
				this.players.push({ model, shadow });
			}
			this.snap = true;
			this.trailN = 0;
			this.rolled = 0;
			this.burstTime = 0;
			this.state = s;
		}
	}
	update(dt: number) {
		const s = this.state;
		if (!s) return;
		this.time += dt;
		const b = s.ball,
			cam = this.camera.position;
		const tx = b.x + this.sinHeading * CAMERA.behind,
			tz = b.y + this.cosHeading * CAMERA.behind,
			k = this.snap ? 1 : 1 - Math.exp(-dt * 8);
		// Smooth a bank or a rebound, but never let a full-power sideways shot outrun a phone screen.
		const leash = Math.min(100, this.camera.aspect * 220);
		cam.set(
			Math.min(tx + leash, Math.max(tx - leash, cam.x + (tx - cam.x) * k)),
			CAMERA.height,
			Math.max(tz - 70, Math.min(tz + 130, cam.z + (tz - cam.z) * k))
		);
		this.snap = false;
		this.ball.position.set(b.x, R + 1, b.y);
		const speed = Math.hypot(b.vx, b.vy);
		if (speed > 1)
			this.ball.rotateOnWorldAxis(
				this.axis.set(b.vy / speed, 0, -b.vx / speed),
				(b.rolled - this.rolled) / R
			);
		this.rolled = b.rolled;
		this.ball.visible = s.phase !== 'taken' && s.phase !== 'over';
		this.shadow.visible = this.ball.visible;
		this.shadow.position.set(b.x + 5, 2, b.y + 4);
		this.shadow.scale.set(R * 1.65, 1, R * 1.25);
		this.ring.position.set(b.x, 2.2, b.y);
		this.ring.visible = s.phase === 'play' && (!s.started || !!s.dribble);
		this.ring.scale.setScalar(1 + (this.reducedMotion() ? 0 : Math.sin(this.time * 4) * 0.045));
		for (let i = 0; i < this.players.length; i++) {
			const { model, shadow } = this.players[i]!,
				c = s.chasers[i],
				p = c ?? s.keeper!;
			model.root.position.set(p.x, 1, p.y);
			shadow.position.set(p.x + 8, 2, p.y + 6);
			shadow.scale.set(30, 1, 19);
			const down = c?.down ?? false;
			model.body.rotation.x = down ? -1.38 : 0;
			model.body.position.y = down ? 13 : 0;
			const moving = c ? Math.hypot(c.vx, c.vy) > 12 : Math.abs(p.vx) > 12;
			if (!down)
				model.root.rotation.y =
					c && moving ? Math.atan2(c.vx, c.vy) : Math.atan2(b.x - p.x, b.y - p.y);
			const stride = moving && !down ? Math.sin(this.time * 12 + i) * 0.72 : 0;
			model.legs[0]!.rotation.x = stride;
			model.legs[1]!.rotation.x = -stride;
			model.arms[0]!.rotation.x = -stride - 0.14;
			model.arms[1]!.rotation.x = stride - 0.14;
		}
		this.updateRibbon(b.x, b.y, speed);
		this.burstTime = Math.max(0, this.burstTime - dt);
		this.bits.count = this.burstTime ? 36 : 0;
		if (this.burstTime) {
			const t = 1.3 - this.burstTime;
			for (let i = 0; i < 36; i++) {
				const j = i * 6,
					v = this.burst;
				this.dummy.position.set(
					v[j]! + v[j + 3]! * t,
					Math.max(2, v[j + 1]! + v[j + 4]! * t - 220 * t * t),
					v[j + 2]! + v[j + 5]! * t
				);
				this.dummy.rotation.set(t * 5, i + t * 4, t * 3);
				this.dummy.scale.set(5, 2, 8);
				this.dummy.updateMatrix();
				this.bits.setMatrixAt(i, this.dummy.matrix);
			}
			this.bits.instanceMatrix.needsUpdate = true;
		}
		this.hud.sync(s, dt);
	}
	private updateRibbon(x: number, z: number, speed: number) {
		const p = this.trail;
		if (speed > TUNING.chaser.knockSpeed && !this.reducedMotion()) {
			p.copyWithin(2, 0, (N - 1) * 2);
			p[0] = x;
			p[1] = z;
			this.trailN = Math.min(N, this.trailN + 1);
		} else this.trailN = Math.max(0, this.trailN - 1);
		this.ribbon.visible = this.trailN > 1;
		if (!this.ribbon.visible) return;
		const a = this.ribbon.geometry.getAttribute('position') as BufferAttribute;
		for (let i = 0; i < this.trailN; i++) {
			const j = i * 2,
				next = i === this.trailN - 1 ? j - 2 : j + 2,
				dx = p[j]! - p[next]!,
				dz = p[j + 1]! - p[next + 1]!,
				len = Math.hypot(dx, dz) || 1,
				w = ((i === this.trailN - 1 ? -1 : 1) * R * 0.83 * (1 - i / this.trailN)) / len;
			for (let k = 0; k < 2; k++) {
				const s = k ? 1 : -1;
				a.setXYZ(j + k, p[j]! + dz * w * s, 3 + 6 * (1 - i / this.trailN), p[j + 1]! - dx * w * s);
			}
		}
		a.needsUpdate = true;
		this.ribbon.geometry.setDrawRange(0, (this.trailN - 1) * 6);
	}
	knocked(_s: GameState, _i: number, combo: number, points: number) {
		this.hud.flash(`${str.combo[Math.min(combo, 3)]} +${points}`, 1);
	}
	scored(s: GameState, points: number, allDown: boolean) {
		this.hud.flash(`${str.goal} +${points}${allDown ? '\n' + str.allDown : ''}`, 1.7);
		if (this.reducedMotion()) return;
		this.burstTime = 1.3;
		const colors = [0xffb238, 0xff624f, 0x3ac9b3, 0xfff2bc];
		for (let i = 0; i < 36; i++) {
			const j = i * 6;
			this.burst.set(
				[
					s.level.goal.x + (Math.random() - 0.5) * s.level.goal.width,
					60,
					s.level.goal.y,
					(Math.random() - 0.5) * 180,
					120 + Math.random() * 150,
					(Math.random() - 0.5) * 130
				],
				j
			);
			this.bits.setColorAt(i, new Color(colors[i % 4]));
		}
		if (this.bits.instanceColor) this.bits.instanceColor.needsUpdate = true;
	}
	taken(s: GameState) {
		this.hud.flash(s.balls === 1 ? str.lastBall : str.taken, 1.2);
	}
	render() {
		this.renderer.render(this.scene, this.camera);
	}
	resetFx() {
		this.snap = true;
		this.trailN = 0;
		this.burstTime = 0;
		this.hud.reset();
	}
	destroy() {
		this.stopResize();
		this.hud.destroy();
		this.clearPlayers();
		this.course?.dispose();
		this.mat.dispose();
		this.ball.geometry.dispose();
		this.disk.dispose();
		this.shade.dispose();
		this.ring.geometry.dispose();
		this.ring.material.dispose();
		this.ribbon.geometry.dispose();
		this.ribbon.material.dispose();
		this.bits.dispose();
		this.bits.material.dispose();
		this.shadowMap.dispose();
		this.sky.dispose();
		this.renderer.dispose();
		this.renderer.forceContextLoss();
		this.renderer.domElement.remove();
	}
}
