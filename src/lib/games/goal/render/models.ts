// Small colored solids are baked into one vertex-colored mesh per moving part (one for the
// entire static course). No textures to fetch and no draw call per fence slat or shirt stripe.
import {
	BoxGeometry,
	BufferGeometry,
	Color,
	CylinderGeometry,
	Euler,
	Float32BufferAttribute,
	IcosahedronGeometry,
	Matrix3,
	Matrix4,
	Mesh,
	MeshLambertMaterial,
	Quaternion,
	Vector3
} from 'three';

const box = new BoxGeometry(),
	tube = new CylinderGeometry(1, 1, 1, 10),
	cone = new CylinderGeometry(0, 1, 1, 8),
	stone = new IcosahedronGeometry(1, 0),
	crown = new IcosahedronGeometry(1, 1);
const point = new Vector3(),
	normal = new Vector3(),
	tint = new Color(),
	pose = new Matrix4(),
	normals = new Matrix3(),
	rotation = new Quaternion(),
	angles = new Euler(),
	offset = new Vector3(),
	scale = new Vector3();
export const solid = { box, tube, cone, stone, crown };
export class Batch {
	private vertices: number[] = [];
	private colors: number[] = [];
	private normals: number[] = [];
	add(
		shape: BufferGeometry,
		color: number,
		x: number,
		h: number,
		z: number,
		w: number,
		height: number,
		d: number,
		rx = 0,
		ry = 0,
		rz = 0
	) {
		pose.compose(
			offset.set(x, h, z),
			rotation.setFromEuler(angles.set(rx, ry, rz)),
			scale.set(w, height, d)
		);
		normals.getNormalMatrix(pose);
		tint.setHex(color);
		const p = shape.getAttribute('position'),
			n = shape.getAttribute('normal');
		for (let i = 0; i < (shape.index?.count ?? p.count); i++) {
			const j = shape.index?.getX(i) ?? i;
			point.fromBufferAttribute(p, j).applyMatrix4(pose);
			normal.fromBufferAttribute(n, j).applyNormalMatrix(normals);
			this.vertices.push(point.x, point.y, point.z);
			this.normals.push(normal.x, normal.y, normal.z);
			this.colors.push(tint.r, tint.g, tint.b);
		}
	}
	beam(
		color: number,
		ax: number,
		ah: number,
		az: number,
		bx: number,
		bh: number,
		bz: number,
		width: number
	) {
		const v = new Vector3(bx - ax, bh - ah, bz - az);
		const length = v.length();
		const e = new Euler().setFromQuaternion(
			new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), v.normalize())
		);
		this.add(
			box,
			color,
			(ax + bx) / 2,
			(ah + bh) / 2,
			(az + bz) / 2,
			width,
			length,
			width,
			e.x,
			e.y,
			e.z
		);
	}
	mesh(mat: MeshLambertMaterial) {
		const g = new BufferGeometry();
		g.setAttribute('position', new Float32BufferAttribute(this.vertices, 3));
		g.setAttribute('normal', new Float32BufferAttribute(this.normals, 3));
		g.setAttribute('color', new Float32BufferAttribute(this.colors, 3));
		return new Mesh(g, mat);
	}
}

// A paneled football: truncating the 12 corners of an icosahedron makes exactly twelve
// pentagons and twenty hexagons. Project their subdivided faces back onto a sphere.
export function football(mat: MeshLambertMaterial) {
	const src = stone.getAttribute('position'),
		verts: Vector3[] = [],
		faces: number[][] = [];
	for (let i = 0; i < src.count; i += 3) {
		const face: number[] = [];
		for (let k = 0; k < 3; k++) {
			const v = new Vector3().fromBufferAttribute(src, i + k).normalize();
			let id = verts.findIndex((p) => p.distanceToSquared(v) < 1e-8);
			if (id < 0) {
				id = verts.length;
				verts.push(v);
			}
			face.push(id);
		}
		faces.push(face);
	}
	const pos: number[] = [],
		ns: number[] = [],
		cs: number[] = [];
	const panels: Vector3[][] = verts.map(() => []);
	function panel(rim: Vector3[], color: number) {
		const c = rim.reduce((sum, v) => sum.add(v), new Vector3()).normalize();
		const shade = new Color(color);
		function triangle(a: Vector3, b: Vector3, d: Vector3) {
			if (new Vector3().subVectors(b, a).cross(new Vector3().subVectors(d, a)).dot(a) < 0)
				[b, d] = [d, b];
			for (const v of [a, b, d]) {
				pos.push(v.x, v.y, v.z);
				ns.push(v.x, v.y, v.z);
				cs.push(shade.r, shade.g, shade.b);
			}
		}
		for (let i = 0; i < rim.length; i++) {
			const outerA = rim[i]!,
				outerB = rim[(i + 1) % rim.length]!;
			const a = outerA.clone().lerp(c, 0.028).normalize(),
				b = outerB.clone().lerp(c, 0.028).normalize();
			shade.setHex(0x747d83);
			triangle(outerA, outerB, b);
			triangle(outerA, b, a);
			shade.setHex(color);
			const m = c.clone().add(a).normalize(),
				n = c.clone().add(b).normalize(),
				e = a.clone().add(b).normalize();
			triangle(c, m, n);
			triangle(m, a, e);
			triangle(e, b, n);
			triangle(m, e, n);
		}
	}
	for (const face of faces) {
		const rim: Vector3[] = [];
		for (let k = 0; k < 3; k++) {
			const a = face[k]!,
				b = face[(k + 1) % 3]!;
			for (const [from, to] of [
				[a, b],
				[b, a]
			] as const) {
				const v = verts[from]!.clone()
					.lerp(verts[to]!, 1 / 3)
					.normalize();
				rim.push(v);
				if (!panels[from]!.some((p) => p.distanceToSquared(v) < 1e-8)) panels[from]!.push(v);
			}
		}
		panel(rim, 0xfffdf2);
	}
	panels.forEach((rim, i) => {
		const axis = verts[i]!,
			u = rim[0]!.clone().cross(axis).normalize(),
			v = axis.clone().cross(u);
		rim.sort((a, b) => Math.atan2(a.dot(v), a.dot(u)) - Math.atan2(b.dot(v), b.dot(u)));
		panel(rim, 0x172239);
	});
	const g = new BufferGeometry();
	g.setAttribute('position', new Float32BufferAttribute(pos, 3));
	g.setAttribute('normal', new Float32BufferAttribute(ns, 3));
	g.setAttribute('color', new Float32BufferAttribute(cs, 3));
	return new Mesh(g, mat);
}
