import { asset } from '$app/paths';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';

// Both 3D games clone the rig from the same parsed model. A failed load can be retried.
let cached: Promise<GLTF> | undefined;
export function loadCharacter() {
	return (cached ??= new GLTFLoader()
		.loadAsync(asset('assets/rail-dash/models/character.glb'))
		.catch((error: unknown) => {
			cached = undefined;
			throw error;
		}));
}
