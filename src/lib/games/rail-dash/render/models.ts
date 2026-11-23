// Loads Rail Dash's Kenney models once per session. The parsed scenes are kept in
// memory between visits (a few MB, constant), so returning to the game doesn't re-download or
// re-parse; GPU copies belong to each renderer and are freed with it.
import { asset } from '$app/paths';
import { SRGBColorSpace, TextureLoader, type Object3D, type Texture } from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { loadCharacter } from '../../../kit/three-character';

const TRAINS = [
	'train-electric-city-a',
	'train-electric-city-b',
	'train-electric-city-c',
	'train-electric-subway-a',
	'train-electric-subway-b',
	'train-electric-subway-c',
	'train-diesel-a',
	'train-diesel-b',
	'train-diesel-c'
] as const;
export type TrainModel = (typeof TRAINS)[number];

const SKINS = ['skaterFemaleA', 'skaterMaleA', 'cyborgFemaleA'] as const;
const BUILDINGS = 'abcdefgh'.split('').map((c) => `city/building-${c}`);

export interface Models {
	trains: Record<TrainModel, Object3D>;
	track: Object3D;
	buildings: Object3D[];
	character: GLTF;
	skins: Texture[];
}

// Typed asset paths must name real files; derive the folders from one of each.
const MODEL_DIR = asset('assets/rail-dash/models/character.glb').replace(/character\.glb$/, '');
const SKIN_DIR = asset('assets/rail-dash/skins/skaterFemaleA.png').replace(
	/skaterFemaleA\.png$/,
	''
);

let cache: Promise<Models> | null = null;

export function loadModels(onProgress: (p: number) => void): Promise<Models> {
	if (cache) {
		onProgress(1);
		return cache;
	}
	const gltf = new GLTFLoader();
	const textures = new TextureLoader();
	const total = TRAINS.length + 2 + SKINS.length + BUILDINGS.length;
	let done = 0;
	const tick = <T>(x: T) => {
		onProgress(++done / total);
		return x;
	};
	const glb = (name: string) => gltf.loadAsync(`${MODEL_DIR}${name}.glb`).then(tick);

	cache = Promise.all([
		Promise.all(TRAINS.map((t) => glb(t))),
		glb('railroad-straight'),
		Promise.all(BUILDINGS.map((b) => glb(b))),
		loadCharacter().then(tick),
		Promise.all(
			SKINS.map((s) =>
				textures.loadAsync(`${SKIN_DIR}${s}.png`).then((t) => {
					t.colorSpace = SRGBColorSpace;
					return tick(t);
				})
			)
		)
	]).then(([trains, track, buildings, character, skins]) => {
		const byName = {} as Record<TrainModel, Object3D>;
		TRAINS.forEach((t, i) => (byName[t] = trains[i]!.scene));
		return {
			trains: byName,
			track: track.scene,
			buildings: buildings.map((b) => b.scene),
			character,
			skins
		};
	});
	// A failed load (e.g. offline before the first visit finished) must be retryable.
	cache.catch(() => (cache = null));
	return cache;
}
