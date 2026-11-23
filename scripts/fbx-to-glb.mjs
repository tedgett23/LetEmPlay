// Converts Kenney's animated character (FBX model + separate FBX animations) into one binary
// GLB the browser can load quickly. Uses Three.js's own FBXLoader and GLTFExporter in Node, so
// no extra tools are needed. Textures are not embedded: the game applies the skin PNG itself.
//   node scripts/fbx-to-glb.mjs <model.fbx> <out.glb> <name=anim.fbx>...
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

// Node has no image decoding: skip texture loads (the skin is applied at runtime).
THREE.TextureLoader.prototype.load = function () {
	return new THREE.Texture();
};
// GLTFExporter reads Blobs through FileReader, which Node lacks.
globalThis.FileReader ??= class {
	readAsArrayBuffer(blob) {
		void blob.arrayBuffer().then((buf) => {
			this.result = buf;
			this.onloadend?.();
		});
	}
	readAsDataURL(blob) {
		void blob.arrayBuffer().then((buf) => {
			this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(buf).toString('base64')}`;
			this.onloadend?.();
		});
	}
};

function load(file) {
	const buf = readFileSync(file);
	const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
	return new FBXLoader().parse(ab, dirname(file) + '/');
}

export async function fbxToGlb(modelFile, outFile, animations) {
	const model = load(modelFile);
	const clips = [];
	for (const [name, file] of Object.entries(animations)) {
		// Kenney's files also carry a tiny "Targeting Pose" take; use the real (longest) one.
		const clip = load(file).animations.toSorted((a, b) => b.duration - a.duration)[0];
		if (!clip) throw new Error(`${file}: no animation`);
		// Bone positions and scales are constant in these clips; rotations carry the motion.
		// Keep the hips' position (the bob), drop the rest: a much smaller file.
		clip.tracks = clip.tracks.filter(
			(t) =>
				t.name.endsWith('.quaternion') || (/hips/i.test(t.name) && t.name.endsWith('.position'))
		);
		clip.name = name;
		clips.push(clip);
	}
	// Drop materials' (empty) textures so the exporter doesn't try to encode images.
	model.traverse((o) => {
		if (!o.isMesh) return;
		for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.map = null;
	});
	const glb = await new GLTFExporter().parseAsync(model, { binary: true, animations: clips });
	writeFileSync(outFile, Buffer.from(glb));
	return { bytes: glb.byteLength, clips: clips.map((c) => `${c.name} ${c.duration.toFixed(2)}s`) };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
	const [model, out, ...anims] = process.argv.slice(2);
	const animations = Object.fromEntries(anims.map((a) => a.split('=')));
	console.log(await fbxToGlb(model, out, animations));
}
