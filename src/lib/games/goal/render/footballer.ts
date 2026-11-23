import { asset } from '$app/paths';
import {
	AnimationClip,
	AnimationMixer,
	Box3,
	CanvasTexture,
	Group,
	ImageLoader,
	MeshLambertMaterial,
	type Object3D,
	SkinnedMesh,
	SRGBColorSpace
} from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { loadCharacter } from '../../../kit/three-character';

function skinned(o: Object3D): o is SkinnedMesh {
	return o instanceof SkinnedMesh;
}

async function loadSquad() {
	const [model, skin] = await Promise.all([
		loadCharacter(),
		new ImageLoader().loadAsync(asset('assets/rail-dash/skins/skaterMaleA.png'))
	]);
	const bounds = new Box3();
	model.scene.updateMatrixWorld(true);
	model.scene.traverse((o) => {
		if (skinned(o)) {
			o.geometry.computeBoundingBox();
			bounds.union(o.geometry.boundingBox!.clone().applyMatrix4(o.matrixWorld));
		}
	});
	const scale = 85 / (bounds.max.y - bounds.min.y);
	const idle = AnimationClip.findByName(model.animations, 'idle'),
		run = AnimationClip.findByName(model.animations, 'run');
	if (!idle || !run || !Number.isFinite(scale)) throw new Error('Missing footballer rig or clips');
	return { model, skin, scale, floor: bounds.min.y, idle, run };
}
export type Squad = Awaited<ReturnType<typeof loadSquad>>;
let cached: Promise<Squad> | undefined;
export function loadSquadAssets() {
	return (cached ??= loadSquad().catch((error: unknown) => {
		cached = undefined;
		throw error;
	}));
}

// Paint in atlas coordinates; retain the Kenney face/hair and the UVs of the shared rig.
// Each kit is painted once per view, not once per player or animation frame.
export function teamKit(skin: HTMLImageElement, keeper: boolean) {
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = 256;
	const g = canvas.getContext('2d')!;
	g.scale(256 / 384, 256 / 384);
	g.drawImage(skin, 0, 0, 384, 384);
	const shirt = keeper ? '#ffce35' : '#ea443e',
		trim = keeper ? '#13796d' : '#ffecc9';
	g.fillStyle = shirt;
	g.fillRect(0, 184, 239, 200);
	g.fillStyle = trim;
	g.fillRect(72, 307, 97, 7);
	g.fillRect(72, 317, 97, 3);
	g.fillRect(72, 242, 97, 8);
	g.fillStyle = '#263650';
	g.fillRect(229, 287, 155, 97); // shorts
	g.fillStyle = trim;
	g.fillRect(229, 344, 155, 40); // socks
	g.fillStyle = shirt;
	g.fillRect(229, 350, 155, 5);
	g.fillStyle = keeper ? '#138778' : '#ef986d';
	for (const x of [0, 201]) g.fillRect(x, 247, 38, 62); // forearms
	g.fillRect(310, 51, 74, 236); // hands
	g.fillStyle = '#253447';
	g.fillRect(240, 51, 69, 145); // boots
	g.fillStyle = trim;
	g.fillRect(243, 74, 65, 8);
	g.fillRect(243, 145, 65, 8);
	g.fillStyle = trim;
	g.font = 'bold 24px sans-serif';
	g.textAlign = 'center';
	g.fillText(keeper ? '1' : '7', 121, 346);
	const map = new CanvasTexture(canvas);
	map.colorSpace = SRGBColorSpace;
	return new MeshLambertMaterial({ map });
}

export function footballer(src: Squad, kit: MeshLambertMaterial, index: number) {
	const root = new Group(),
		body = new Group(),
		model = clone(src.model.scene);
	root.add(body);
	body.add(model);
	model.scale.setScalar(src.scale);
	model.position.y = -src.floor * src.scale;
	const meshes: SkinnedMesh[] = [];
	model.traverse((o) => {
		if (skinned(o)) {
			o.material = kit;
			meshes.push(o);
		}
	});
	const mixer = new AnimationMixer(model),
		idle = mixer.clipAction(src.idle),
		run = mixer.clipAction(src.run);
	idle.play();
	idle.time = (index * 0.17) % src.idle.duration;
	mixer.update(0);
	let running = false;
	return {
		root,
		body,
		animate(dt: number, speed: number, down: boolean) {
			const moving = !down && speed > 12;
			if (moving !== running) {
				const next = moving ? run : idle,
					prev = running ? run : idle;
				next.reset().play();
				next.time = (index * 0.13) % next.getClip().duration;
				prev.crossFadeTo(next, 0.12, false);
				running = moving;
			}
			run.timeScale = Math.max(0.65, Math.min(1.8, speed / 150));
			if (!down) mixer.update(dt);
		},
		destroy() {
			mixer.stopAllAction();
			mixer.uncacheRoot(model);
			for (const mesh of meshes) mesh.skeleton.dispose();
		}
	};
}
